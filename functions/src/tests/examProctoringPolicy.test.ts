import assert from "node:assert/strict";
import test from "node:test";
import {assertProctoringJson, ExamProctoringError, readActivationPreflight,
  readProctoringRequirements, readProctoringPolicy, issueProctoringPolicy,
  assertActivationPreflight, initializeIntegrityReporting} from "../services/examProctoringPolicy";
import {proctoringRequirementsForTest, proctoringPolicyForTest,
  proctoringPreflightForTest} from "./helpers/proctoring";

test("policy validates exact supported requirements and never upgrades legacy authority", () => {
  for (const browser of [true, false]) {
    for (const camera of [true, false]) {
      const requirements = proctoringRequirementsForTest(browser, camera);
      assert.deepEqual(readProctoringRequirements(requirements), requirements);
      assert.deepEqual(issueProctoringPolicy(requirements), proctoringPolicyForTest(browser, camera));
      assert.deepEqual(readProctoringPolicy(proctoringPolicyForTest(browser, camera)),
        proctoringPolicyForTest(browser, camera));
    }
  }
  for (const value of [undefined, null, [], {}, {browserIntegrityGuardEnabled: false,
    faceIdentityGazeGuardEnabled: false}, {...proctoringRequirementsForTest(), extra: true},
  {...proctoringRequirementsForTest(), contractVersion: 2},
  {...proctoringRequirementsForTest(), cameraReadiness: "verified"}]) {
    assert.throws(() => readProctoringRequirements(value), (e: unknown) =>
      e instanceof ExamProctoringError && e.code === "VALIDATION_ERROR");
    assert.throws(() => issueProctoringPolicy(value), ExamProctoringError);
  }
  assert.throws(() => readProctoringPolicy({...proctoringPolicyForTest(),
    capabilities: {...proctoringPolicyForTest().capabilities, automatedFaceMatching: "enabled"}}),
  (e: unknown) => e instanceof ExamProctoringError && e.reason === "policy_unsupported");
  assert.throws(() => readProctoringPolicy({...proctoringPolicyForTest(),
    integrityReporting: "client_observations"}), ExamProctoringError);
});

test("preflight records only exact disclosed client reports, never biometric authority", () => {
  const off = proctoringPreflightForTest();
  const ready = {contractVersion: 1, preflight: {camera: "client_reported_ready",
    consentAccepted: true, consentNoticeVersion: "exam-camera-local-v1"}};
  assert.deepEqual(readActivationPreflight(off), off);
  assert.deepEqual(readActivationPreflight(ready), ready);
  assertActivationPreflight(proctoringPolicyForTest(), readActivationPreflight(off));
  assertActivationPreflight(proctoringPolicyForTest(false, true), readActivationPreflight(ready));
  assert.throws(() => assertActivationPreflight(proctoringPolicyForTest(false, true), readActivationPreflight(off)),
    (e: unknown) => e instanceof ExamProctoringError && e.reason === "preflight_required");
  assert.throws(() => assertActivationPreflight(proctoringPolicyForTest(), readActivationPreflight(ready)),
    (e: unknown) => e instanceof ExamProctoringError && e.reason === "policy_mismatch");
  for (const value of [{}, undefined, {...off, faceVerified: true},
    {...ready, preflight: {...ready.preflight, consentAccepted: false}},
    {...ready, preflight: {camera: "client_reported_ready"}},
    {...off, preflight: {camera: "not_requested", consentAccepted: true}}]) {
    assert.throws(() => readActivationPreflight(value), ExamProctoringError);
  }
  for (const raw of ["{\"contractVersion\":1,\"contractVersion\":1}",
    "{\"preflight\":{\"camera\":\"not_requested\",\"camera\":\"client_reported_ready\"}}"]) {
    assert.throws(() => assertProctoringJson(Buffer.from(raw)),
      (e: unknown) => e instanceof ExamProctoringError && e.reason === "invalid_proctoring_request");
  }
});

test("reporting intake uses an immutable bounded server window without changing exam time", () => {
  const now = Date.now();
  for (const end of [now + 1000, now + 172_800_000]) {
    const state = initializeIntegrityReporting(end, now);
    assert.equal(state.acceptedBatchCount, 0);
    assert.equal(state.acceptedEventCount, 0);
    assert.equal(state.lastAcceptedAt, null);
    assert.equal(state.initializedAt.toMillis(), now);
    assert.equal(state.closesAt.toMillis(), Math.min(end, now + 86_400_000));
  }
});
