import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
import test from "node:test";
const require = createRequire(import.meta.url);
const ts = require("../functions/node_modules/typescript");
function load(path, imports = () => { throw Error("Unexpected runtime dependency"); }) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const output = ts.transpileModule(source, {compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  }}).outputText;
  const module = {exports: {}};
  new Function("exports", "module", "require", output)(module.exports, module, imports);
  return module.exports;
}
const recoveryValidation = load("shared/services/examRecoveryValidation.ts");
const adapters = load("shared/services/portalResponseAdapters.ts", name => {
  assert.equal(name, "./examRecoveryValidation"); return recoveryValidation;
});
let wire;
const client = {get: async (_path, options) => options.responseAdapter(wire),
  post: async (_path, options) => options.responseAdapter(wire)};
const api = load("apps/admin/src/features/assignments/assignmentOperationsApi.ts", (name) => {
  if (name.endsWith("portalResponseAdapters")) return adapters;
  if (name.endsWith("portalIntegration")) return {getPortalApiClient: () => client};
  throw Error(`Unexpected dependency ${name}`);
});
const policy = (browser = true, camera = "off") => ({contractVersion: 1,
  browserIntegrityGuardEnabled: browser, cameraReadiness: camera,
  capabilities: {automatedFaceMatching: "unavailable", automatedGazeTracking: "unavailable",
    cameraReadiness: "browser_permission_only", browserIntegrity: "browser_controls_only"},
  identityPhotoReview: "not_required", integrityReporting: browser || camera === "required" ? "client_observations" : "off"});
const run = {academicYear: "2026", attemptLimit: 1, canonicalId: "canonical", createdAt: "2026-10-19T00:00:00.000Z",
  endWindow: "2026-10-19T01:00:00.000Z", gracePeriodMinutes: 5, id: "run", mode: "Operational",
  proctoringPolicy: policy(), recipientCount: 1, recipientStudentIds: ["student"], revision: 2,
  runPath: "institutes/tenant/academicYears/2026/runs/run", shuffleQuestionOrder: false,
  startWindow: "2026-10-19T00:00:00.000Z", status: "active", templateVersion: 1, testId: "test",
  timezone: "Asia/Kolkata", updatedAt: "2026-10-19T00:01:00.000Z"};
const summary = {activeSessionCount: 1, notStartedCount: 0, submittedCount: 0, terminatedSessionCount: 0, totalRecipients: 1};
const badPolicies = [undefined, null, {}, {browserIntegrityGuardEnabled: false, faceIdentityGazeGuardEnabled: false},
  {...policy(), contractVersion: 2}, {...policy(), cameraReadiness: "verified"},
  {...policy(), cameraReadiness: ["off"]}, {...policy(), extra: "private"},
  {...policy(), capabilities: {...policy().capabilities, automatedFaceMatching: "verified"}},
  {...policy(), capabilities: {...policy().capabilities, frames: []}},
  {...policy(), identityPhotoReview: "required"}, {...policy(), integrityReporting: "off"}];

test("strict v1 adapter accepts all supported requirements without inventing authority", () => {
  for (const browser of [true, false]) for (const camera of ["required", "off"]) {
    const value = policy(browser, camera);
    assert.deepEqual(adapters.adaptExamProctoringPolicyV1(value, "test"), value);
  }
  for (const value of badPolicies) assert.throws(() => adapters.adaptExamProctoringPolicyV1(value, "test"),
    {name: "PortalResponseValidationError"});
});

test("create/list/detail/live/history/derived adapters fail closed for legacy and forged policy", async () => {
  const good = policy();
  for (const proctoringPolicy of [good, ...badPolicies]) {
    const value = {...run, proctoringPolicy};
    const cases = [
      () => adapters.adaptAdminRunCreateResult({disposition: "created", run: {...value, status: "scheduled"}}),
      () => adapters.adaptAdminRunListResult({nextCursor: null, runs: [value]}),
      () => adapters.adaptAdminRunDetailResult({run: value}),
      async () => {
        wire = {nextCursor: null, serverTime: run.updatedAt, runs: [{run: value, summary}]};
        return api.fetchAdminLiveRuns();
      },
      async () => {
        wire = {nextCursor: null, serverTime: run.updatedAt, run: value, summary, students: []};
        return api.fetchAdminLiveRun("run");
      },
      ...[api.duplicateAdminRun, api.reassignAdminRun].map((command) => async () => {
        wire = {disposition: "applied", auditId: "audit", sourceRunId: "source", run: value};
        return command("source", {});
      }),
      async () => {
        wire = {nextCursor: null, runs: [{run: {...value, status: "completed"}, analytics: {
          avgAccuracyPercent: null, avgDisciplineIndex: null, avgRawScorePercent: null,
          completionPercent: 100, controlledCompliancePercent: null, executionStability: null, riskDistribution: null}}]};
        return api.fetchAdminRunHistory();
      },
    ];
    for (const exercise of cases) {
      if (proctoringPolicy === good) await exercise();
      else await assert.rejects(async () => exercise(), {name: "PortalResponseValidationError"});
    }
  }
});

test("unavailable policy is accepted only for a trusted terminal acknowledgement", async () => {
  const unavailable = {status: "unavailable", reason: "policy_upgrade_required"};
  const terminal = {...run, status: "terminated", proctoringPolicy: unavailable};
  wire = {auditId: "audit", disposition: "applied", recoveryState: "complete", run: terminal};
  assert.deepEqual((await api.updateAdminRunLifecycle("run", {action: "terminate"})).run, terminal);
  for (const action of ["extend", "cancel", "archive"]) {
    await assert.rejects(api.updateAdminRunLifecycle("run", {action}), {name: "PortalResponseValidationError"});
  }
  for (const patch of [{status: "active"}, {proctoringPolicy: {...unavailable, reason: "unknown"}},
    {proctoringPolicy: {...unavailable, capabilities: policy().capabilities}}]) {
    wire = {auditId: "audit", disposition: "applied", recoveryState: "complete", run: {...terminal, ...patch}};
    await assert.rejects(api.updateAdminRunLifecycle("run", {action: "terminate"}), {name: "PortalResponseValidationError"});
  }
  wire = {nextCursor: null, serverTime: run.updatedAt, runs: [{run: {...run, proctoringPolicy: unavailable}, summary}]};
  await assert.rejects(api.fetchAdminLiveRuns(), {name: "PortalResponseValidationError"});
});
