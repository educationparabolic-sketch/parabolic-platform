import assert from "node:assert/strict";
import test from "node:test";
import {createHash} from "node:crypto";
import {createRequire} from "node:module";
const require = createRequire(import.meta.url);
const {parseCalibrationRollout, calibrationRolloutIdentity, parseCalibrationRollback, calibrationRollbackIdentity} =
  require("../functions/lib/services/calibrationRollout.js");
const key = "abcdefab-1234-4123-8123-abcdefabcdef";
const valid = {idempotencyKey: key, versionId: "v039",
  targets: [{instituteId: "z", expectedCalibrationVersion: null},
    {instituteId: "a", expectedCalibrationVersion: "old"}]};
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
test("runtime rollout canonicalization matches exact frozen identity/fingerprint contract", () => {
  const request = parseCalibrationRollout(valid);
  assert.deepEqual(request.targets.map((target) => target.instituteId), ["a", "z"]);
  const identity = calibrationRolloutIdentity("vendor", request);
  assert.equal(identity.keyHash, hash([1, "vendor", "rollout", key]));
  assert.equal(identity.operationId, `cal_${identity.keyHash}`);
  assert.equal(identity.requestFingerprint, hash([1, "rollout", "v039", [["a", "old"], ["z", null]]]));
  assert.notEqual(calibrationRolloutIdentity("another", request).operationId, identity.operationId);
});
test("runtime rollback uses distinct scoped identity and rejects forged or incomplete inverse intent", () => {
  const originalOperationId = calibrationRolloutIdentity("vendor", parseCalibrationRollout(valid)).operationId;
  const request = parseCalibrationRollback({idempotencyKey: key, expectedOperationRevision: 2});
  const identity = calibrationRollbackIdentity("vendor", originalOperationId, request);
  assert.equal(identity.keyHash, hash([1, "vendor", "rollback", key]));
  assert.equal(identity.operationId, `cal_${identity.keyHash}`);
  assert.equal(identity.requestFingerprint, hash([1, "rollback", originalOperationId, 2]));
  assert.notEqual(identity.operationId, originalOperationId);
  for (const value of [null, {idempotencyKey: key}, {expectedOperationRevision: 2},
    {...request, idempotencyKey: key.toUpperCase()}, {...request, targets: []},
    ...[0, -1, 1.5, "2", null, NaN, Number.MAX_SAFE_INTEGER + 1].map((expectedOperationRevision) =>
      ({...request, expectedOperationRevision}))]) {
    assert.throws(() => parseCalibrationRollback(value));
  }
  for (const operationId of ["cal_short", "../../other", originalOperationId.toUpperCase(), [originalOperationId]]) {
    assert.throws(() => calibrationRollbackIdentity("vendor", operationId, request));
  }
});
test("runtime rollout rejects unknown/legacy intent, invalid keys, targets and omitted preconditions", () => {
  for (const value of [null, {...valid, scheduledAt: "later"},
    {targetInstitutes: ["a"], versionId: "v039"}, {...valid, idempotencyKey: key.toUpperCase()},
    {...valid, idempotencyKey: key.replace("-4123-", "-5123-")}, {...valid, versionId: "bad/path"},
    {...valid, targets: []}, {...valid, targets: Array.from({length: 21}, (_, i) => ({
      instituteId: `i${i}`, expectedCalibrationVersion: null}))},
    {...valid, targets: [valid.targets[0], valid.targets[0]]},
    {...valid, targets: [{instituteId: "a"}]},
    {...valid, targets: [{instituteId: "a", expectedCalibrationVersion: null, extra: true}]},
    {...valid, targets: [{instituteId: " a", expectedCalibrationVersion: null}]},
    {...valid, targets: [{instituteId: "a", expectedCalibrationVersion: 1}]}]) {
    assert.throws(() => parseCalibrationRollout(value));
  }
});
