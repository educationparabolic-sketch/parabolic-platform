import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createRequire} from "node:module";
import test from "node:test";
const require = createRequire(import.meta.url), ts = require("../functions/node_modules/typescript");
const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
function load(source, dependencies = {}) {
  const module = {exports: {}};
  new Function("exports", "module", "require", ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText)(
    module.exports, module, name => { assert.ok(name in dependencies, name); return dependencies[name]; });
  return module.exports;
}
const parsers = load(await read("apps/vendor/src/features/calibration/vendorCalibrationResponse.ts"));
const weights = {guessWeight: 1, phaseWeight: 0, easyNeglectWeight: 0, hardBiasWeight: 0, wrongStreakWeight: 0};
const intent = {academicYearId: "2026", institutes: ["inst_a"], weights};
const distribution = Object.fromEntries(parsers.riskStates.map(state => [state, {count: state === "Stable" ? 1 : 0, percent: state === "Stable" ? 100 : 0}]));
const summary = {averageProjectedRiskScore: 10, studentCount: 1, instituteCount: 1, riskDistribution: distribution};
const changes = Object.fromEntries(parsers.riskStates.map(state => [state, {count: 0, percent: 0}]));
const result = {availability: "available", proposedWeights: weights, before: summary, after: summary,
  delta: {averageProjectedRiskScore: 0, studentCount: 0, riskDistribution: changes},
  metadata: {schemaVersion: 1, model: "risk_projection_v1", population: "student_year_summaries", academicYearId: "2026", evaluatedAt: "2026-01-01T00:00:00.000Z",
    sources: [{instituteId: "inst_a", academicYearId: "2026", calibrationVersion: "v1", calibrationSourcePath: "globalCalibration/v1", summaryDocumentCount: 1}],
    unsupportedOutputs: Object.fromEntries(["batchDelta", "clusterMovement", "disciplineDelta", "estimatedAlertDelta", "productionRiskOutcome", "stabilityImpact"].map(key => [key, "unavailable"]))},
  institutes: [{instituteId: "inst_a", academicYearId: "2026", currentCalibrationVersion: "v1", currentCalibrationSourcePath: "globalCalibration/v1", studentCount: 1,
    beforeAverageProjectedRiskScore: 10, projectedAverageRiskScore: 10, riskDistributionDelta: Object.fromEntries(parsers.riskStates.map(state => [state, 0]))}]};
const version = {schemaVersion: 1, versionId: "v1", weights, thresholds: {guessFactorEasy: 1, guessFactorMedium: 1, guessFactorHard: 1, phaseDeviationThreshold: 20},
  createdBy: "actor", createdAt: "2026-01-01T00:00:00.000Z", activationDate: "2026-01-01T00:00:00.000Z", isActive: true,
  sourcePath: "globalCalibration/v1", deploymentAvailability: "immediate_selected_targets"};
test("closed calibration DTOs reconcile all nested population, selection and delta authority", () => {
  assert.deepEqual(parsers.parseCalibrationSimulation(result, intent), result);
  for (const mutate of [
    r => {r.studentEmail = "private";}, r => {r.before.studentCount = 2;}, r => {r.after.riskDistribution.Stable.percent = 99;},
    r => {r.metadata.sources[0].instituteId = "wrong";}, r => {r.proposedWeights.guessWeight = .9;},
    r => {r.metadata.academicYearId = "2025";}, r => {r.metadata.sources[0].summaryDocumentCount = 1001;},
    r => {r.metadata.unsupportedOutputs.disciplineDelta = 0;}, r => {r.delta.studentCount = 1;},
    r => {r.delta.riskDistribution.Stable.count = 1;}, r => {r.institutes[0].currentCalibrationSourcePath = "wrong";},
    r => {delete r.after.riskDistribution.Volatile;}, r => {r.availability = "empty";},
    r => {r.metadata.evaluatedAt = "invalid";}, r => {r.institutes[0].riskDistributionDelta.Stable = 1;},
    r => {r.institutes[0].beforeAverageProjectedRiskScore = 90;},
  ]) {const bad = structuredClone(result); mutate(bad); assert.throws(() => parsers.parseCalibrationSimulation(bad, intent));}
  const empty = structuredClone(result); Object.assign(empty, {availability: "empty", before: null, after: null, delta: null, institutes: []});
  empty.metadata.sources[0].summaryDocumentCount = 0;
  assert.deepEqual(parsers.parseCalibrationSimulation(empty, intent), empty);
  empty.before = summary; assert.throws(() => parsers.parseCalibrationSimulation(empty, intent));
  for (const bad of [{...intent, actorId: "forged"}, {...intent, academicYearId: ""}, {...intent, institutes: ["inst_a", "inst_a"]}, {...intent, weights: {...weights, overstayWeight: 0}}])
    assert.throws(() => parsers.parseCalibrationRequest(bad));
});
test("version pages/detail reject unknown, malformed, duplicate and noncanonical authority", () => {
  assert.deepEqual(parsers.parseCalibrationDetail({version}, "v1"), version);
  assert.deepEqual(parsers.parseCalibrationVersions({items: [version], hasMore: false, nextCursor: null}).items, [version]);
  for (const bad of [{...version, createdAt: null}, {...version, sourcePath: "calibrationVersions/v1"}, {...version, deploymentAvailability: "ready"},
    {...version, deploymentAvailability: "unavailable_pending_bwm_039"},
    {...version, activationDate: "2099-01-01T00:00:00.000Z"}, {...version, extra: 1}]) assert.throws(() => parsers.parseCalibrationVersion(bad));
  assert.throws(() => parsers.parseCalibrationDetail({version}, "v2"));
  assert.throws(() => parsers.parseCalibrationVersions({items: [version, version], hasMore: false, nextCursor: null}));
  assert.throws(() => parsers.parseCalibrationVersions({items: [], hasMore: true, nextCursor: "fake"}));
  const cursor = Buffer.from(JSON.stringify({schemaVersion: 1, query: "calibration_versions", lastVersionId: "v1"})).toString("base64url");
  assert.equal(parsers.parseCalibrationVersions({items: [version], hasMore: true, nextCursor: cursor}).nextCursor, cursor);
  assert.throws(() => parsers.parseCalibrationVersions({items: [version], hasMore: true, nextCursor: Buffer.from(JSON.stringify({schemaVersion: 1, query: "calibration_versions", lastVersionId: "wrong"})).toString("base64url")}));
});
test("authenticated adapters validate simulation intent/results and isolate new publishing", async () => {
  const calls = [];
  const client = {get: async (...args) => {calls.push(args); return args;}, post: async (...args) => {calls.push(args); return args;}};
  class ApiClientError extends Error {}
  const {vendorCalibrationApi: api, calibrationFailure} = load(await read("apps/vendor/src/features/calibration/vendorCalibrationApi.ts"), {
    "../../../../../shared/services/apiClient": {ApiClientError},
    "../../../../../shared/services/portalIntegration": {getPortalApiClient: portal => {assert.equal(portal, "vendor"); return client;}},
    "./vendorCalibrationResponse": parsers,
    "./vendorCalibrationOperation": load(await read("apps/vendor/src/features/calibration/vendorCalibrationOperation.ts")),
  });
  await api.versions(); await api.version("v1"); await api.simulate(intent);
  assert.deepEqual(calls.map(([path]) => path), ["/vendor/calibration/versions", "/vendor/calibration/versions/v1", "/vendor/calibration/simulate"]);
  assert.deepEqual(calls[2][1].body, intent); assert.equal(calls[2][1].retry.retryUnsafeMethods, false);
  assert.deepEqual(calls[2][1].responseAdapter(result), result);
  assert.equal(api.push, undefined);
  for (const [status, kind] of [[400, "validation"], [401, "permission"], [403, "permission"], [404, "unavailable"], [500, "unavailable"]]) {
    const error = Object.assign(new ApiClientError("private backend detail"), {status, requestId: "request-safe"});
    assert.equal(calibrationFailure(error).kind, kind);
    assert.equal(calibrationFailure(error).requestId, "request-safe");
    assert.doesNotMatch(calibrationFailure(error).message, /private backend detail/);
  }
  assert.equal(calibrationFailure(new Error("malformed payload")).kind, "unavailable");
});
test("mounted calibration clears stale authority and exposes no local audit or unsupported mutations", async () => {
  const source = await read("apps/vendor/src/features/calibration/VendorCalibrationWorkspace.tsx");
  assert.doesNotMatch(source, /vendorCalibrationDataset|localStorage|appendCalibrationAudit|pushCalibrationVersion|strategyProfileParameters/);
  for (const requirement of ["invalidate(); setYear", "invalidate(); setTargets", "invalidate(); setDraft", "AbortController", "simulation.key === selectionKey",
    "empty", "permission", "BWM-039", "BWM-040"]) {
    assert.ok((source + await read("apps/vendor/src/features/calibration/vendorCalibrationApi.ts")).includes(requirement), requirement);
  }
  assert.match(source, /<VendorCalibrationPublish/);
  const publish = await read("apps/vendor/src/features/calibration/VendorCalibrationPublish.tsx");
  for (const expected of ["deriveOperationId", "sessionStorage.setItem", "vendorCalibrationApi.operation", "expectedOperationRevision: result.revision", "preconditions?.key !== selection", "lock.current", "Confirm calibration command", "Retry / replay exact command", "!terminal", "key={uid}"]) assert.ok(publish.includes(expected), expected);
});

test("closed operation adapters reject forged receipts, drifted selection and unsafe intents", async () => {
  const p = load(await read("apps/vendor/src/features/calibration/vendorCalibrationOperation.ts"));
  const op = "cal_" + "a".repeat(64), key = "12345678-1234-4123-8123-123456789012";
  const request = {idempotencyKey: key, versionId: "v1", targets: [{instituteId: "inst_a", expectedCalibrationVersion: null}]};
  assert.deepEqual(p.parseRollout(request), request);
  for (const bad of [{...request, actorUid: "forged"}, {...request, idempotencyKey: "new"}, {...request, targets: []}, {...request, targets: [request.targets[0], request.targets[0]]}, {...request, targets: [{instituteId: "inst_a"}]}]) assert.throws(() => p.parseRollout(bad));
  assert.throws(() => p.parseRollback({idempotencyKey: key, expectedOperationRevision: 0}));
  const pending = {operationId: op, revision: 1, state: "pending", receipt: null, rollbackOperationId: null};
  assert.deepEqual(p.parseOperation(pending, op), pending);
  const before = {instituteId: "inst_a", institutePointer: {present: false}, currentLicensePointer: {present: false}, compatibilityLicensePointer: {present: true, value: null}};
  const after = {instituteId: "inst_a", institutePointer: {present: true, value: "v1"}, currentLicensePointer: {present: true, value: "v1"}, compatibilityLicensePointer: {present: true, value: "v1"}};
  const receipt = {schemaVersion: 1, operationId: op, kind: "rollout", originalOperationId: null, revision: 2, versionId: "v1", completedAt: "2026-01-01T00:00:00.000Z", vendorCalibrationLogPath: `vendorCalibrationLogs/${op}`, state: "applied", failureCode: null, targets: [{instituteId: "inst_a", state: "applied", before, after, calibrationPath: "institutes/inst_a/calibration/v1", calibrationHistoryPath: `institutes/inst_a/calibrationHistory/${op}`} ]};
  const applied = {...pending, revision: 2, state: "applied", receipt};
  assert.deepEqual(p.matchRollout(p.parseOperation(applied, op), request), applied);
  for (const mutate of [v => {v.actorUid = "forged";}, v => {v.revision = 3;}, v => {v.receipt.targets[0].after.institutePointer.value = "later";}, v => {v.receipt.targets[0].before.institutePointer.value = null;}, v => {v.receipt.targets[0].calibrationHistoryPath = "forged";}, v => {v.receipt.completedAt = "yesterday";}, v => {v.rollbackOperationId = op;}]) {
    const bad = structuredClone(applied); mutate(bad); assert.throws(() => p.parseOperation(bad, op));
  }
  assert.throws(() => p.matchRollout(applied, {...request, targets: [{instituteId: "inst_a", expectedCalibrationVersion: "later"}]}));
  const failed = {...pending, revision: 2, state: "not_applied", receipt: {...receipt, state: "not_applied", targets: [], failureCode: "TARGET_CONFLICT"}};
  assert.deepEqual(p.parseOperation(failed, op), failed);
  assert.throws(() => p.parseOperation({...pending, revision: 2}, op));
});

test("publish detail adapter requires exact pointer authority without rewriting historical receipts", async () => {
  let options;
  class ApiClientError extends Error {}
  const api = load(await read("apps/vendor/src/features/institutes/vendorInstitutesApi.ts"), {
    "../../../../../shared/services/apiClient": {ApiClientError},
    "../../../../../shared/services/portalIntegration": {getPortalApiClient: () => ({get: (_path, value) => {options = value;}})},
  });
  const detail = {accessStatus: "active", aggregate: {activeStudentCount: null, aggregateAsOf: null, lastActiveAt: null, monthlyTestRuns: null},
    commercial: {authorityState: "not_configured", licenseLayer: null, licenseState: null, licenseVersion: null, planId: null},
    createdAt: "2026-01-01T00:00:00.000Z", instituteId: "inst_a", lifecycleState: "active", primaryAdministrator: null,
    registeredName: "A", revision: 1, updatedAt: "2026-01-01T00:00:00.000Z", administrators: [],
    deletion: {eligibleAt: null, lastErrorCode: null, operationId: null, scheduledAt: null, stage: "none"},
    profile: {registeredName: "A", vendorAccountReference: null}, settingsRevision: 0};
  assert.equal(Object.hasOwn(api.parseVendorInstituteDetail(detail), "calibrationPointer"), false);
  api.vendorInstitutesApi.getInstitute("inst_a");
  assert.throws(() => options.responseAdapter(detail));
  for (const pointer of [{present: false}, {present: true, value: null}, {present: true, value: "v1"}]) assert.deepEqual(options.responseAdapter({...detail, calibrationPointer: pointer}).calibrationPointer, pointer);
  for (const pointer of [null, {}, {present: false, value: null}, {present: true}, {present: true, value: "bad/path"}, {present: 1}, {present: true, value: 1}]) assert.throws(() => options.responseAdapter({...detail, calibrationPointer: pointer}));
});
