import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {CalibrationRolloutService, calibrationRolloutIdentity, calibrationRollbackIdentity,
  parseCalibrationRollout} from "../services/calibrationRollout";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {consumerVersion} from "./calibrationConsumerFixture";

assert.equal(process.env.GCLOUD_PROJECT, "demo-parabolic-test");
assert.ok(process.env.FIRESTORE_EMULATOR_HOST);
const firestore = getFirestore();
const service = new CalibrationRolloutService(firestore);
const vendor = "rollback_test_vendor";
const versionId = "bwm039_inverse_candidate";
const institutes = new Set<string>();
const operations = new Set<string>();
const journal = (id: string) => firestore.doc(`vendorCalibrationRollouts/${id}`);
const rootLog = (id: string) => firestore.doc(`vendorCalibrationLogs/${id}`);
const inverseRequest = (originalId: string, expectedOperationRevision = 2) => {
  const request = {idempotencyKey: randomUUID(), expectedOperationRevision};
  operations.add(calibrationRollbackIdentity(vendor, originalId, request).operationId);
  return request;
};
const prepare = async (name: string, count = 2) => {
  await firestore.doc(`globalCalibration/${versionId}`).set(consumerVersion(versionId));
  const ids = Array.from({length: count}, (_, index) => `bwm039_inverse_${name}_${String(index).padStart(2, "0")}`);
  for (const [index, id] of ids.entries()) {
    institutes.add(id);
    const prior = (offset: number) => (index + offset) % 3 === 0 ? {} : (index + offset) % 3 === 1 ?
      {calibrationVersion: null} : {calibrationVersion: `old_inverse_${index}_${offset}`};
    await firestore.doc(`institutes/${id}`).set({name: id, ...prior(0)});
    for (const [offset, mirror] of ["current", "main"].entries()) {
      await firestore.doc(`institutes/${id}/license/${mirror}`).set({currentLayer: "L2",
        licenseVersion: "unchanged_license", licenseState: "active", featureFlags: {hardMode: true},
        unrelated: `${mirror}-only`, ...prior(offset + 1)});
    }
    await firestore.doc(`institutes/${id}/academicYears/2026/runs/historical`).set({
      calibrationVersion: "historical_label", calibrationSnapshot: {untouched: "run"}, status: "submitted",
    });
    await firestore.doc(`institutes/${id}/academicYears/2026/sessions/historical`).set({
      calibrationVersion: "historical_label", calibrationSnapshot: {untouched: "session"}, status: "submitted",
    });
  }
  const request = {idempotencyKey: randomUUID(), versionId, targets: await Promise.all(ids.map(async (instituteId) => ({
    instituteId, expectedCalibrationVersion: (await firestore.doc(`institutes/${instituteId}`).get())
      .get("calibrationVersion") ?? null,
  })))};
  operations.add(calibrationRolloutIdentity(vendor, parseCalibrationRollout(request)).operationId);
  return {ids, request};
};
const appliedFixture = async (name: string, count = 2) => {
  const fixture = await prepare(name, count);
  const applied = await service.apply(vendor, fixture.request);
  assert.equal(applied.state, "applied");
  assert.ok(applied.receipt);
  return {...fixture, applied, receipt: applied.receipt};
};
const assertStillApplied = async (originalId: string, ids: string[]) => {
  assert.equal((await journal(originalId).get()).get("state"), "applied");
  assert.equal((await journal(originalId).get()).get("revision"), 2);
  for (const id of ids) {
    for (const suffix of ["", "/license/current", "/license/main"]) {
      assert.equal((await firestore.doc(`institutes/${id}${suffix}`).get()).get("calibrationVersion"), versionId);
    }
  }
};
test.after(async () => {
  for (const id of institutes) await firestore.recursiveDelete(firestore.doc(`institutes/${id}`));
  for (const id of operations) {
    await journal(id).delete();
    await rootLog(id).delete();
  }
  await firestore.doc(`globalCalibration/${versionId}`).delete();
  await getFirebaseAdminApp().delete();
});

test("atomic max-20 rollback restores exact absence/null/string and preserves immutable authority", async () => {
  const {ids, applied, receipt, request: applyRequest} = await appliedFixture("exact", 20);
  const originalLog = (await rootLog(applied.operationId).get()).data();
  const originals = await Promise.all(receipt.targets.map(async (target) => ({
    copy: (await firestore.doc(target.calibrationPath).get()).data(),
    history: (await firestore.doc(target.calibrationHistoryPath).get()).data(),
  })));
  await firestore.doc(`globalCalibration/${versionId}`).delete(); // inverse uses captured authority, not live weights
  await firestore.doc(`institutes/${ids[0]}/license/current`).update({postApply: 77, currentLayer: "L1"});
  const request = inverseRequest(applied.operationId);
  const restored = await service.rollback(vendor, applied.operationId, request);
  assert.equal(restored.state, "applied");
  assert.ok(restored.receipt);
  assert.equal(restored.receipt.kind, "rollback");
  assert.equal(restored.receipt.originalOperationId, applied.operationId);
  assert.equal(restored.receipt.targets.length, 20);
  for (const [index, target] of restored.receipt.targets.entries()) {
    assert.deepEqual(target.before, receipt.targets[index].after);
    assert.deepEqual(target.after, receipt.targets[index].before);
    for (const [field, suffix] of [["institutePointer", ""], ["currentLicensePointer", "/license/current"],
      ["compatibilityLicensePointer", "/license/main"]] as const) {
      const actual = (await firestore.doc(`institutes/${target.instituteId}${suffix}`).get()).data();
      assert.ok(actual);
      const captured = target.after[field];
      assert.equal(Object.prototype.hasOwnProperty.call(actual, "calibrationVersion"), captured.present);
      if (captured.present) assert.equal(actual.calibrationVersion, captured.value);
      if (suffix) assert.equal(actual.unrelated, `${suffix.endsWith("current") ? "current" : "main"}-only`);
    }
    assert.deepEqual((await firestore.doc(target.calibrationPath).get()).data(), originals[index].copy);
    assert.deepEqual((await firestore.doc(receipt.targets[index].calibrationHistoryPath).get()).data(),
      originals[index].history);
    assert.deepEqual((await firestore.doc(target.calibrationHistoryPath).get()).get("receipt.targets"), [target]);
    for (const [kind, marker] of [["runs", "run"], ["sessions", "session"]]) {
      assert.deepEqual((await firestore.doc(`institutes/${target.instituteId}/academicYears/2026/${kind}/historical`)
        .get()).get("calibrationSnapshot"), {untouched: marker});
    }
  }
  assert.deepEqual((await rootLog(applied.operationId).get()).data(), originalLog);
  assert.deepEqual((await journal(applied.operationId).get()).get("receipt"), receipt);
  assert.equal((await journal(applied.operationId).get()).get("rollbackOperationId"), restored.operationId);
  assert.equal((await journal(applied.operationId).get()).get("revision"), 3);
  assert.deepEqual(await service.rollback(vendor, applied.operationId, request), restored);
  const applyReplay = await service.apply(vendor, applyRequest);
  assert.equal(applyReplay.state, "rolled_back");
  assert.deepEqual(applyReplay.receipt, receipt);
  assert.equal(applyReplay.rollbackOperationId, restored.operationId);
  const inverseJournal = (await journal(restored.operationId).get()).data();
  assert.equal(JSON.stringify(inverseJournal).includes(request.idempotencyKey), false);
  assert.equal((await firestore.doc(`institutes/${ids[0]}/license/current`).get()).get("postApply"), 77);
  assert.equal((await firestore.doc(`institutes/${ids[0]}/license/current`).get()).get("currentLayer"), "L1");
  await assert.rejects(service.rollback(vendor, applied.operationId, inverseRequest(applied.operationId)), /new key/);
  await assert.rejects(service.rollback(vendor, applied.operationId, {...request, expectedOperationRevision: 3}),
    /conflicting intent/);
  assert.equal(ids.length, 20);
});

test("late root/current/main drift or missing/malformed mirror prevents every inverse mutation", async () => {
  for (const mode of ["root", "current", "main", "missing", "malformed"]) {
    const {ids, applied} = await appliedFixture(`drift_${mode}`);
    const last = `institutes/${ids[1]}`;
    if (mode === "missing") await firestore.doc(`${last}/license/main`).delete();
    else if (mode === "malformed") await firestore.doc(`${last}/license/main`).update({featureFlags: {bad: 1}});
    else {
      await firestore.doc(`${last}${mode === "root" ? "" : `/license/${mode}`}`)
        .update({calibrationVersion: "later_authority"});
    }
    const request = inverseRequest(applied.operationId);
    const failed = await service.rollback(vendor, applied.operationId, request);
    assert.equal(failed.state, "not_applied");
    const failureCode = ["missing", "malformed"].includes(mode) ? "INVALID_TARGET" : "TARGET_CONFLICT";
    assert.equal(failed.receipt?.failureCode, failureCode);
    assert.deepEqual(failed.receipt?.targets, []);
    await assertStillApplied(applied.operationId, [ids[0]]);
    for (const id of ids) {
      assert.equal((await firestore.doc(
        `institutes/${id}/calibrationHistory/${failed.operationId}`).get()).exists, false);
    }
    assert.deepEqual(await service.rollback(vendor, applied.operationId, request), failed);
  }
});

test("wrong scope/revision, original key reuse, pending/failed source and corrupt journal are rejected", async () => {
  const {ids, applied, request: applyRequest} = await appliedFixture("guard");
  await assert.rejects(service.rollback("other_vendor", applied.operationId, inverseRequest(applied.operationId)),
    /conflicting intent/);
  await assert.rejects(service.rollback(vendor, applied.operationId,
    inverseRequest(applied.operationId, 1)), /new key/);
  await assert.rejects(service.rollback(vendor, applied.operationId,
    {idempotencyKey: applyRequest.idempotencyKey, expectedOperationRevision: 2}), /new key/);
  await assertStillApplied(applied.operationId, ids);
  const pendingFixture = await prepare("pending_source");
  await assert.rejects(new CalibrationRolloutService(firestore, {afterReservation: () => {
    throw new Error("process death");
  }}).apply(vendor, pendingFixture.request), /process death/);
  const pendingId = calibrationRolloutIdentity(vendor, parseCalibrationRollout(pendingFixture.request)).operationId;
  await assert.rejects(service.rollback(vendor, pendingId, inverseRequest(pendingId)), /new key/);
  const failedFixture = await prepare("failed_source");
  await firestore.doc(`institutes/${failedFixture.ids[1]}`).delete();
  const failed = await service.apply(vendor, failedFixture.request);
  assert.equal(failed.state, "not_applied");
  await assert.rejects(service.rollback(vendor, failed.operationId, inverseRequest(failed.operationId)), /new key/);
  await journal(applied.operationId).update({"receipt.targets": []});
  await assert.rejects(service.rollback(vendor, applied.operationId,
    inverseRequest(applied.operationId)), /incomplete/);
  for (const id of ids) {
    assert.equal((await firestore.doc(`institutes/${id}`).get()).get("calibrationVersion"), versionId);
  }
});

test("same-key inverse convergence and different-key concurrency have exactly one restoration", async () => {
  const same = await appliedFixture("same_key");
  const sameRequest = inverseRequest(same.applied.operationId);
  const results = await Promise.all([service.rollback(vendor, same.applied.operationId, sameRequest),
    service.rollback(vendor, same.applied.operationId, sameRequest)]);
  assert.equal(results[0].state, "applied");
  assert.deepEqual(results[0], results[1]);
  const racing = await appliedFixture("racing_keys");
  const races = await Promise.allSettled([service.rollback(vendor, racing.applied.operationId,
    inverseRequest(racing.applied.operationId)), service.rollback(vendor, racing.applied.operationId,
    inverseRequest(racing.applied.operationId))]);
  const winners = races.filter((response) => response.status === "fulfilled" && response.value.state === "applied");
  assert.equal(winners.length, 1);
  for (const response of races) {
    if (response.status === "fulfilled" && response.value.state !== "applied") {
      assert.equal(response.value.state, "not_applied");
      assert.equal(response.value.receipt?.failureCode, "OPERATION_CONFLICT");
    }
  }
  assert.equal((await journal(racing.applied.operationId).get()).get("revision"), 3);
});

test("precommit inverse failure is terminal and leaves original apply and pointers intact", async () => {
  const {ids, applied} = await appliedFixture("precommit");
  const request = inverseRequest(applied.operationId);
  const failed = await new CalibrationRolloutService(firestore, {beforeRollbackCommit: () => {
    throw new Error("private internal failure");
  }}).rollback(vendor, applied.operationId, request);
  assert.equal(failed.state, "not_applied");
  assert.equal(failed.receipt?.failureCode, "APPLY_FAILED");
  assert.equal(JSON.stringify(failed).includes("private internal"), false);
  await assertStillApplied(applied.operationId, ids);
  assert.deepEqual(await service.rollback(vendor, applied.operationId, request), failed);
  const corrected = await service.rollback(vendor, applied.operationId, inverseRequest(applied.operationId));
  assert.equal(corrected.state, "applied");
});

test("pending inverse interruption/log failure resumes and lost response rereads exact receipt", async () => {
  for (const mode of ["reservation", "failure_log", "response"]) {
    const {ids, applied} = await appliedFixture(`uncertain_${mode}`);
    const request = inverseRequest(applied.operationId);
    const fault = () => {
      throw new Error("simulated interruption");
    };
    const faulty = new CalibrationRolloutService(firestore, mode === "reservation" ? {afterReservation: fault} :
      mode === "response" ? {afterRollbackCommit: fault} : {beforeRollbackCommit: fault, beforeFailureCommit: fault});
    if (mode === "reservation") {
      await assert.rejects(faulty.rollback(vendor, applied.operationId, request), /interruption/);
    } else {
      const observed = await faulty.rollback(vendor, applied.operationId, request);
      assert.equal(observed.state, mode === "response" ? "applied" : "pending");
    }
    if (mode !== "response") await assertStillApplied(applied.operationId, ids);
    const resumed = await service.rollback(vendor, applied.operationId, request);
    assert.equal(resumed.state, "applied");
    assert.deepEqual(await service.rollback(vendor, applied.operationId, request), resumed);
    assert.equal((await journal(applied.operationId).get()).get("revision"), 3);
  }
});

test("immutable root/history collisions and divergent original log never partially restore", async () => {
  for (const mode of ["root", "history", "original_log"]) {
    const {ids, applied} = await appliedFixture(`collision_${mode}`);
    const request = inverseRequest(applied.operationId);
    const identity = calibrationRollbackIdentity(vendor, applied.operationId, request);
    const collision = mode === "root" ? rootLog(identity.operationId) :
      firestore.doc(`institutes/${ids[1]}/calibrationHistory/${identity.operationId}`);
    if (mode === "original_log") await rootLog(applied.operationId).update({"receipt.versionId": "forged"});
    else await collision.create({untouched: true});
    const response = await service.rollback(vendor, applied.operationId, request);
    assert.equal(response.state, mode === "root" ? "pending" : "not_applied");
    if (response.receipt) assert.equal(response.receipt.failureCode, "OPERATION_CONFLICT");
    await assertStillApplied(applied.operationId, ids);
    if (mode !== "original_log") assert.deepEqual((await collision.get()).data(), {untouched: true});
  }
});
