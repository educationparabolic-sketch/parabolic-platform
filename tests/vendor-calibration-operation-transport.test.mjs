import assert from "node:assert/strict";
import test from "node:test";
import {createRequire} from "node:module";
const require = createRequire(import.meta.url);
const {createVendorCalibrationPushHandler} = require("../functions/lib/api/vendorCalibrationPush.js");
const {createVendorCalibrationOperationsHandler} = require("../functions/lib/api/vendorCalibrationOperations.js");
const {CalibrationRolloutService, CalibrationRolloutError, calibrationRolloutIdentity, parseCalibrationRollout,
  calibrationRollbackIdentity} = require("../functions/lib/services/calibrationRollout.js");
const {validateCalibrationOperationResult} = require("../functions/lib/services/calibrationOperationResult.js");
const {createMockRequest, createMockResponse} = require("../functions/lib/tests/helpers/http.js");
const input = {idempotencyKey: "abcdefab-1234-4123-8123-abcdefabcdef", versionId: "v1",
  targets: [{instituteId: "i1", expectedCalibrationVersion: null}]};
const inverse = {idempotencyKey: "abcdefab-1234-4123-9123-abcdefabcdef", expectedOperationRevision: 2};
const uid = "vendor_transport";
const operationId = calibrationRolloutIdentity(uid, parseCalibrationRollout(input)).operationId;
const path = `/api/v1/vendor/calibration/operations/${operationId}`;
const pending = {operationId, revision: 1, state: "pending", receipt: null, rollbackOperationId: null};
const pointers = (value) => ({instituteId: "i1", institutePointer: value,
  currentLicensePointer: value, compatibilityLicensePointer: value});
const applied = {operationId, revision: 2, state: "applied", rollbackOperationId: null, receipt: {
  schemaVersion: 1, operationId, revision: 2, kind: "rollout", originalOperationId: null,
  versionId: "v1", completedAt: "2026-01-01T00:00:00.000Z", state: "applied", failureCode: null,
  vendorCalibrationLogPath: `vendorCalibrationLogs/${operationId}`, targets: [{instituteId: "i1", state: "applied",
    before: pointers({present: false}), after: pointers({present: true, value: "v1"}),
    calibrationPath: "institutes/i1/calibration/v1", calibrationHistoryPath: `institutes/i1/calibrationHistory/${operationId}`}],
}};
const dependencies = (extra = {}) => ({
  verifyIdToken: async () => ({uid, role: "vendor", licenseLayer: "L0"}),
  getUser: async () => ({uid, disabled: false, customClaims: {role: "vendor"}}),
  apply: async () => applied, readOperation: async () => pending,
  rollback: async () => ({...pending, operationId: calibrationRollbackIdentity(uid, operationId, inverse).operationId}),
  ...extra,
});
async function invoke(handler, overrides = {}) {
  const response = createMockResponse();
  response.setHeader = () => response;
  await handler(createMockRequest({method: "GET", path, headers: {authorization: "Bearer disposable"}, ...overrides}), response);
  return response;
}

test("command/read dispatch derives scope and validates exact receipt and pending uncertainty", async () => {
  const calls = [];
  const deps = dependencies({apply: async (actor, body) => {calls.push([actor, body]); return applied;}});
  const push = await invoke(createVendorCalibrationPushHandler(deps), {method: "POST", body: input});
  assert.equal(push.statusCode, 200);
  assert.deepEqual(push.body.data, applied);
  assert.deepEqual(calls, [[uid, input]]);
  const handler = createVendorCalibrationOperationsHandler(deps);
  assert.deepEqual((await invoke(handler)).body.data, pending);
  assert.deepEqual((await invoke(handler, {params: {0: path, operationId}})).body.data, pending);
  const rollback = await invoke(handler, {method: "POST", path: `${path}/rollback`, body: inverse});
  assert.equal(rollback.statusCode, 200);
  assert.equal(rollback.body.data.receipt, null);
  assert.equal(rollback.body.data.operationId, calibrationRollbackIdentity(uid, operationId, inverse).operationId);
});

test("exact operation intent rejects legacy/defaulted/extra/query/body/path shapes before service calls", async () => {
  let calls = 0;
  const deps = dependencies({apply: async () => {calls++; return pending;}, readOperation: async () => {calls++; return pending;},
    rollback: async () => {calls++; return pending;}});
  const push = createVendorCalibrationPushHandler(deps);
  for (const body of [{versionId: "v1", targetInstitutes: ["i1"]}, {...input, actorId: uid},
    {...input, idempotencyKey: input.idempotencyKey.toUpperCase()}, {...input, targets: [{instituteId: "i1"}]},
    {...input, targets: [...input.targets, ...input.targets]}, {...input, dryRun: true}]) {
    assert.equal((await invoke(push, {method: "POST", body})).statusCode, 400);
  }
  assert.equal((await invoke(push, {method: "POST", body: input, query: {limit: "1"}})).statusCode, 400);
  const operations = createVendorCalibrationOperationsHandler(deps);
  for (const overrides of [{body: {actorId: uid}}, {query: {limit: "1"}}, {query: {x: ["a", "b"]}},
    {path: path.replace(operationId, "cal_bad")}, {params: {operationId: "cal_bad"}},
    {path: `${path}/rollback`, method: "POST", body: {...inverse, expectedOperationRevision: "2"}},
    {path: `${path}/rollback`, method: "POST", body: {...inverse, targets: []}}]) {
    assert.equal((await invoke(operations, overrides)).statusCode, 400);
  }
  assert.equal(calls, 0);
  assert.equal((await invoke(push, {method: "GET"})).statusCode, 405);
  assert.equal((await invoke(operations, {method: "POST"})).statusCode, 405);
});

test("fresh role/disabled/suspension/revocation guards deny every operation before reads/writes", async () => {
  for (const extra of [{getUser: async () => ({customClaims: {role: "student"}})},
    {getUser: async () => ({disabled: true, customClaims: {role: "vendor"}})},
    {getUser: async () => ({customClaims: {role: "vendor", isSuspended: true}})},
    {getUser: async () => ({customClaims: {role: "vendor", isVendor: false}})},
    {verifyIdToken: async () => {throw new Error("REVOKED_PRIVATE");}},
    {verifyIdToken: async () => ({uid, role: "admin", isVendor: true, licenseLayer: "L0"})}]) {
    let called = false;
    const fail = async () => {called = true; throw new Error("must not run");};
    const deps = dependencies({...extra, apply: fail, readOperation: fail, rollback: fail});
    for (const [handler, overrides] of [[createVendorCalibrationPushHandler(deps), {method: "POST", body: input}],
      [createVendorCalibrationOperationsHandler(deps), {}],
      [createVendorCalibrationOperationsHandler(deps), {method: "POST", path: `${path}/rollback`, body: inverse}]]) {
      const result = await invoke(handler, overrides);
      assert.ok([401, 403].includes(result.statusCode));
      assert.doesNotMatch(JSON.stringify(result.body), /REVOKED_PRIVATE/);
    }
    assert.equal(called, false);
  }
});

test("closed response validator accepts all four states and rejects malformed/nested/internal projections", () => {
  const failed = {...pending, revision: 2, state: "not_applied", receipt: {...applied.receipt,
    state: "not_applied", failureCode: "INVALID_SOURCE", targets: []}};
  const rolled = {...applied, revision: 3, state: "rolled_back",
    rollbackOperationId: calibrationRollbackIdentity(uid, operationId, inverse).operationId};
  for (const value of [pending, applied, failed, rolled]) assert.deepEqual(validateCalibrationOperationResult(value, operationId), value);
  for (const mutate of [v => {v.keyHash = "secret";}, v => {v.revision = 1;},
    v => {v.receipt.actor = "private";}, v => {v.receipt.targets[0].after.institutePointer.value = "other";},
    v => {v.receipt.targets[0].before.institutePointer.value = null;},
    v => {v.receipt.targets[0].before.currentLicensePointer = {present: true, value: 2};},
    v => {v.receipt.targets[0].calibrationHistoryPath = "private";},
    v => {v.receipt.targets.push(v.receipt.targets[0]);}, v => {v.receipt.originalOperationId = operationId;},
    v => {v.receipt.failureCode = "SECRET";}, v => {v.receipt.completedAt = "bad";}]) {
    const value = structuredClone(applied); mutate(value);
    assert.throws(() => validateCalibrationOperationResult(value, operationId));
  }
});

test("internal/journal/storage failures are redacted and safe conflict/not-found codes stay stable", async () => {
  for (const [error, status] of [[new Error("SECRET_STACK"), 500],
    [new CalibrationRolloutError("INVALID_JOURNAL", "SECRET_STACK"), 500],
    [new CalibrationRolloutError("OPERATION_CONFLICT", "SECRET_STACK"), 409],
    [new CalibrationRolloutError("NOT_FOUND", "SECRET_STACK"), 404]]) {
    const fail = async () => {throw error;};
    const deps = dependencies({apply: fail, readOperation: fail, rollback: fail});
    for (const [handler, overrides] of [[createVendorCalibrationPushHandler(deps), {method: "POST", body: input}],
      [createVendorCalibrationOperationsHandler(deps), {}],
      [createVendorCalibrationOperationsHandler(deps), {method: "POST", path: `${path}/rollback`, body: inverse}]]) {
      const result = await invoke(handler, overrides);
      assert.equal(result.statusCode, status);
      assert.doesNotMatch(JSON.stringify(result.body), /SECRET_STACK/);
    }
  }
  const result = await invoke(createVendorCalibrationPushHandler(dependencies({apply: async () => ({...applied, private: true})})),
    {method: "POST", body: input});
  assert.equal(result.statusCode, 500);
  assert.equal(result.body.error.message, "Calibration authority is unavailable.");
});

test("status service performs exactly one scoped get and treats malformed own authority as internal", async () => {
  let reads = 0;
  let value = {schemaVersion: 1, operationId, vendorUid: uid, kind: "rollout",
    ...calibrationRolloutIdentity(uid, parseCalibrationRollout(input)), sourceFingerprint: null,
    originalOperationId: null, expectedOperationRevision: null, versionId: input.versionId, targets: input.targets,
    snapshots: [], state: "pending", revision: 1, createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z", receipt: null, rollbackOperationId: null};
  let exists = true;
  const service = new CalibrationRolloutService({doc: p => {
    assert.equal(p, `vendorCalibrationRollouts/${operationId}`);
    return {get: async () => {reads++; return {exists, get: key => value[key], data: () => value};}};
  }});
  assert.deepEqual(await service.readOperation(uid, operationId), pending);
  assert.equal(reads, 1);
  await assert.rejects(service.readOperation("other_vendor", operationId), {code: "NOT_FOUND"});
  exists = false;
  await assert.rejects(service.readOperation(uid, operationId), {code: "NOT_FOUND"});
  exists = true; value = {...value, schemaVersion: 2};
  await assert.rejects(service.readOperation(uid, operationId), {code: "INVALID_JOURNAL"});
  const before = reads;
  await assert.rejects(service.readOperation(uid, [operationId]), {code: "VALIDATION_ERROR"});
  assert.equal(reads, before);
});
