import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("../functions/node_modules/typescript");
const root = fileURLToPath(new URL("../", import.meta.url));

test("reserved proctoring types reject unsupported authority in both toolchains", () => {
  const source = `
    import type {ExamProctoringRequirementsV1 as Requirements,
      ExamProctoringPolicyV1 as Policy, ExamProctoringActivationRequestV1 as Activation,
      ExamIntegrityBatchRequestV1 as Batch, ExamIntegrityEventV1 as Event,
      ExamIntegrityBatchResultV1 as Receipt, ExamProctoringFailureV1 as Failure}
      from "../shared/contracts/examProctoring.js";
    import type {AdminRunCreateRequest as BackendCreate, AdminRunLiveDetailResult as BackendLive,
      ExamRuntimeSnapshot as BackendSnapshot, AdminRunLifecycleResult as BackendTerminal}
      from "../shared/contracts/examProctoringBackend.js";
    import type {AdminRunCreateRequest as MountedCreate, AdminRunRecord as MountedRun}
      from "../shared/contracts/apiDtos.js";
    const mountedRequirements: MountedCreate["proctoringPolicy"] = {contractVersion: 1,
      browserIntegrityGuardEnabled: true, cameraReadiness: "off"};
    // @ts-expect-error Admin mutation cannot carry a combined face/gaze flag
    const mountedLegacy: MountedCreate["proctoringPolicy"] = {browserIntegrityGuardEnabled: false, faceIdentityGazeGuardEnabled: false};
    declare const mountedRun: MountedRun;
    const mountedFace: "unavailable" = mountedRun.proctoringPolicy.capabilities.automatedFaceMatching;
    // @ts-expect-error Admin read cannot claim enabled face/gaze verification
    mountedRun.proctoringPolicy.faceIdentityGazeGuardEnabled;
    const requirements: Requirements = {contractVersion: 1,
      browserIntegrityGuardEnabled: true, cameraReadiness: "required"};
    const backendInput: BackendCreate["proctoringPolicy"] = requirements;
    // @ts-expect-error backend create cannot accept old combined policy
    const oldBackendInput: BackendCreate["proctoringPolicy"] = {browserIntegrityGuardEnabled: false, faceIdentityGazeGuardEnabled: false};
    declare const live: BackendLive;
    const unavailable: "unavailable" = live.run.proctoringPolicy.capabilities.automatedFaceMatching;
    declare const snapshot: BackendSnapshot;
    const camera: "off" | "required" = snapshot.proctoringPolicy.cameraReadiness;
    // @ts-expect-error old fake capability does not survive backend projection
    snapshot.proctoringPolicy.faceIdentityGazeGuardEnabled;
    const legacyTerminal: BackendTerminal["run"]["proctoringPolicy"] = {
      status: "unavailable", reason: "policy_upgrade_required"};
    // @ts-expect-error legacy combined flag is not a capability
    const legacy: Requirements = {browserIntegrityGuardEnabled: true, faceIdentityGazeGuardEnabled: true};
    // @ts-expect-error no browser-issued capabilities in Admin requirements
    const forged: Requirements = {...requirements, capabilities: {automatedFaceMatching: "verified"}};
    // @ts-expect-error no URL policy override
    const query: Requirements = {...requirements, faceGaze: "off"};
    // @ts-expect-error camera cannot claim verification
    const verified: Requirements = {...requirements, cameraReadiness: "verified"};
    const policy: Policy = {...requirements, capabilities: {
      automatedFaceMatching: "unavailable", automatedGazeTracking: "unavailable",
      cameraReadiness: "browser_permission_only", browserIntegrity: "browser_controls_only"},
      identityPhotoReview: "not_required", integrityReporting: "client_observations"};
    // @ts-expect-error unavailable face verification cannot be enabled
    const face: Policy["capabilities"] = {...policy.capabilities, automatedFaceMatching: "enabled"};
    // @ts-expect-error unavailable gaze cannot be calibrated
    const gaze: Policy["capabilities"] = {...policy.capabilities, automatedGazeTracking: "calibrated"};
    // @ts-expect-error human photo review is not an admission requirement
    const human: Policy = {...policy, identityPhotoReview: "required"};
    const off: Activation = {contractVersion: 1, preflight: {camera: "not_requested"}};
    const ready: Activation = {contractVersion: 1, preflight: {camera: "client_reported_ready",
      consentNoticeVersion: "exam-camera-local-v1", consentAccepted: true}};
    // @ts-expect-error ready requires explicit consent and notice
    const noConsent: Activation = {contractVersion: 1, preflight: {camera: "client_reported_ready"}};
    // @ts-expect-error a camera-off report cannot carry consent
    const mixed: Activation = {contractVersion: 1, preflight: {camera: "not_requested", consentAccepted: true}};
    // @ts-expect-error no approved face status in activation
    const falseIdentity: Activation = {...ready, faceVerified: true};
    const event: Event = {eventType: "CAMERA_LOST", observedAt: "2026-10-19T00:00:00.000Z", phase: "exam"};
    const batch: Batch = {contractVersion: 1, batchId: "uuid", events: [event]};
    // @ts-expect-error batch cannot be empty
    const empty: Batch = {...batch, events: []};
    // @ts-expect-error no free-text/keystroke payload
    const privateEvent: Event = {...event, details: "key or answer"};
    // @ts-expect-error viewport heuristic is not a supported observation
    const heuristic: Event = {...event, eventType: "DEVTOOLS_SUSPECTED"};
    // @ts-expect-error no browser-provided tenant authority
    const tenant: Batch = {...batch, instituteId: "other"};
    // @ts-expect-error no browser-controlled enforcement severity
    const verdict: Event = {...event, severity: "cheating"};
    declare const receipt: Receipt;
    const reported: "client_report" = receipt.source;
    // @ts-expect-error no private hash in response
    receipt.requestFingerprint;
    // @ts-expect-error no media in response
    receipt.image;
    const rate: Failure = {code: "CONFLICT", reason: "integrity_rate_limited", retryAfterSeconds: 5};
    const expired: Failure = {code: "SESSION_LOCKED", reason: "integrity_receipt_expired"};
    // @ts-expect-error rate denial is not terminal authentication failure
    const signout: Failure = {code: "UNAUTHORIZED", reason: "integrity_rate_limited", retryAfterSeconds: 5};
    // @ts-expect-error retry delay is fixed, not client policy
    const slow: Failure = {code: "CONFLICT", reason: "integrity_rate_limited", retryAfterSeconds: 500};
  `;
  for (const [moduleResolution, module] of [
    [ts.ModuleResolutionKind.Bundler, ts.ModuleKind.ESNext],
    [ts.ModuleResolutionKind.NodeNext, ts.ModuleKind.NodeNext],
  ]) {
    const file = `${root}tests/__exam_proctoring_probe.ts`;
    const options = {strict: true, noEmit: true, types: [],
      target: ts.ScriptTarget.ES2022, moduleResolution, module};
    const host = ts.createCompilerHost(options);
    const original = host.getSourceFile.bind(host);
    host.getSourceFile = (name, version, onError, fresh) => name === file ?
      ts.createSourceFile(file, source, version, true) : original(name, version, onError, fresh);
    const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([file], options, host));
    assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCurrentDirectory: () => root, getCanonicalFileName: (name) => name, getNewLine: () => "\n",
    }));
  }
});

test("proctoring reservation exports declarations only", () => {
  const declaration = readFileSync(`${root}shared/contracts/examProctoring.d.ts`, "utf8");
  const ast = ts.createSourceFile("proctoring.d.ts", declaration, ts.ScriptTarget.Latest, true);
  assert.ok(ast.statements.length > 0);
  assert.ok(ast.statements.every((node) => ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)));
});

test("integrity retention is an explicit local TTL policy with payload index exemptions", () => {
  const indexes = JSON.parse(readFileSync(`${root}firestore.indexes.json`, "utf8"));
  const fields = indexes.fieldOverrides.filter((field) => field.collectionGroup === "integrityBatches");
  assert.deepEqual(fields.map((field) => field.fieldPath).sort(), ["events", "requestFingerprint", "retainedUntil"]);
  assert.equal(fields.find((field) => field.fieldPath === "retainedUntil").ttl, true);
  assert.ok(fields.every((field) => field.indexes.length === 0));
  assert.ok(indexes.indexes.every((index) => index.collectionGroup !== "integrityBatches"));
});
