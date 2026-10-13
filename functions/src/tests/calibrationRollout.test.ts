import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {CalibrationRolloutService, calibrationRolloutIdentity,
  parseCalibrationRollout} from "../services/calibrationRollout";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {consumerVersion} from "./calibrationConsumerFixture";

assert.equal(process.env.GCLOUD_PROJECT, "demo-parabolic-test");
assert.ok(process.env.FIRESTORE_EMULATOR_HOST);
const firestore = getFirestore();
const service = new CalibrationRolloutService(firestore);
const ownedInstitutes = new Set<string>();
const ownedOperations = new Set<string>();
const ownedVersions = new Set<string>();
const vendor = "rollout_test_vendor";
const version = "bwm039_rollout_candidate";
const candidate = {...consumerVersion(version), isActive: false, activationDate: null};
const createRequest = (ids: string[], versionId = version) => {
  const request = {idempotencyKey: randomUUID(), versionId,
    targets: ids.map((instituteId) => ({instituteId, expectedCalibrationVersion: null as string | null}))};
  ownedOperations.add(calibrationRolloutIdentity(vendor, parseCalibrationRollout(request)).operationId);
  return request;
};
const seed = async (ids: string[]) => {
  ownedVersions.add(version);
  await firestore.doc(`globalCalibration/${version}`).set(candidate);
  for (const id of ids) {
    ownedInstitutes.add(id);
    await firestore.doc(`institutes/${id}`).set({name: id});
    await firestore.doc(`institutes/${id}/license/current`).set({currentLayer: "L2",
      licenseVersion: "license_test", licenseState: "active", featureFlags: {hardMode: true},
      untouched: "current-only"});
    await firestore.doc(`institutes/${id}/license/main`).set({currentLayer: "L2",
      licenseVersion: "license_test", licenseState: "active", featureFlags: {hardMode: true},
      calibrationVersion: null, untouched: "main-only"});
  }
};
const unchanged = async (ids: string[], operationId: string) => {
  for (const id of ids) {
    const institute = await firestore.doc(`institutes/${id}`).get();
    assert.equal(institute.get("calibrationVersion"), undefined);
    assert.equal((await firestore.doc(`institutes/${id}/license/current`).get()).get("calibrationVersion"), undefined);
    assert.equal((await firestore.doc(`institutes/${id}/license/main`).get()).get("calibrationVersion"), null);
    assert.equal((await firestore.doc(`institutes/${id}/calibration/${version}`).get()).exists, false);
    assert.equal((await firestore.doc(`institutes/${id}/calibrationHistory/${operationId}`).get()).exists, false);
  }
};

test.after(async () => {
  for (const id of ownedInstitutes) await firestore.recursiveDelete(firestore.doc(`institutes/${id}`));
  for (const id of ownedOperations) {
    await firestore.doc(`vendorCalibrationRollouts/${id}`).delete();
    await firestore.doc(`vendorCalibrationLogs/${id}`).delete();
  }
  for (const id of ownedVersions) await firestore.doc(`globalCalibration/${id}`).delete();
  await getFirebaseAdminApp().delete();
});

test("atomic max-20 apply preserves mirrors, immutable source, snapshots and exact replay", async () => {
  const ids = Array.from({length: 20}, (_, i) => `bwm039_apply_${String(i).padStart(2, "0")}`);
  await seed(ids);
  const request = createRequest(ids.reverse());
  const applied = await service.apply(vendor, request);
  assert.equal(applied.state, "applied");
  assert.ok(applied.receipt);
  assert.equal(applied.receipt?.targets.length, 20);
  assert.deepEqual(applied.receipt?.targets.map((target) => target.instituteId), [...ids].sort());
  const journal = (await firestore.doc(`vendorCalibrationRollouts/${applied.operationId}`).get()).data();
  assert.equal(journal?.revision, 2);
  assert.equal(JSON.stringify(journal).includes(request.idempotencyKey), false);
  assert.ok(journal?.sourceFingerprint);
  for (const outcome of applied.receipt?.targets ?? []) {
    assert.deepEqual(outcome.before.institutePointer, {present: false});
    assert.deepEqual(outcome.before.compatibilityLicensePointer, {present: true, value: null});
    assert.deepEqual(outcome.after.institutePointer, {present: true, value: version});
    const root = `institutes/${outcome.instituteId}`;
    assert.equal((await firestore.doc(root).get()).get("calibrationVersion"), version);
    for (const mirror of ["current", "main"]) {
      const license = await firestore.doc(`${root}/license/${mirror}`).get();
      assert.equal(license.get("calibrationVersion"), version);
      assert.equal(license.get("untouched"), `${mirror}-only`);
    }
    const copy = await firestore.doc(outcome.calibrationPath).get();
    assert.equal(copy.get("isActive"), true);
    assert.equal(copy.get("activationDate"), candidate.createdAt);
    const history = await firestore.doc(outcome.calibrationHistoryPath).get();
    assert.deepEqual(history.get("receipt.targets"), [outcome]);
  }
  assert.deepEqual((await firestore.doc(`globalCalibration/${version}`).get()).data(), candidate);
  const immutableLog = (await firestore.doc(applied.receipt.vendorCalibrationLogPath).get()).data();
  // Replays never reread changing live source/targets or add new receipt time/flags.
  await firestore.doc(`globalCalibration/${version}`).delete();
  await firestore.doc(`institutes/${ids[0]}`).update({calibrationVersion: "later"});
  assert.deepEqual(await service.apply(vendor, {...request, targets: [...request.targets].reverse()}), applied);
  assert.deepEqual((await firestore.doc(applied.receipt.vendorCalibrationLogPath).get()).data(), immutableLog);
  await assert.rejects(service.apply(vendor, {...request, versionId: "different"}), /conflicting intent/);
});

test("later invalid target, missing mirror and target drift never partially apply", async () => {
  for (const mode of ["missing", "mirror", "drift", "malformed"]) {
    const ids = [`bwm039_fail_${mode}_a`, `bwm039_fail_${mode}_z`];
    await seed(ids);
    if (mode === "missing") await firestore.doc(`institutes/${ids[1]}`).delete();
    if (mode === "mirror") await firestore.doc(`institutes/${ids[1]}/license/main`).delete();
    if (mode === "drift") await firestore.doc(`institutes/${ids[1]}`).update({calibrationVersion: "changed"});
    if (mode === "malformed") await firestore.doc(`institutes/${ids[1]}/license/main`).update({featureFlags: {bad: 1}});
    const request = createRequest(ids);
    const failed = await service.apply(vendor, request);
    assert.equal(failed.state, "not_applied");
    assert.equal(failed.receipt?.failureCode, mode === "drift" ? "TARGET_CONFLICT" : "INVALID_TARGET");
    assert.deepEqual(failed.receipt?.targets, []);
    await unchanged([ids[0]], failed.operationId);
    assert.equal((await firestore.doc(`institutes/${ids[1]}/calibration/${version}`).get()).exists, false);
    assert.deepEqual(await service.apply(vendor, request), failed);
    assert.ok(failed.receipt);
    const log = await firestore.doc(failed.receipt.vendorCalibrationLogPath).get();
    assert.deepEqual(log.get("requestedInstituteIds"), ids);
    assert.deepEqual(log.get("receipt"), failed.receipt);
  }
});

test("precommit fault and failed terminal write leave pending then same-key resume", async () => {
  const ids = ["bwm039_pending_a", "bwm039_pending_z"];
  await seed(ids);
  const request = createRequest(ids);
  const faulty = new CalibrationRolloutService(firestore, {
    beforeApplyCommit: () => {
      throw new Error("simulated precommit");
    },
    beforeFailureCommit: () => {
      throw new Error("simulated log unavailable");
    },
  });
  const pending = await faulty.apply(vendor, request);
  assert.equal(pending.state, "pending");
  assert.equal(pending.receipt, null);
  await unchanged(ids, pending.operationId);
  assert.equal((await firestore.doc(`vendorCalibrationLogs/${pending.operationId}`).get()).exists, false);
  const resumed = await service.apply(vendor, request);
  assert.equal(resumed.state, "applied");
  assert.deepEqual(await service.apply(vendor, request), resumed);
});

test("lost apply response and reservation interruption recover from stored journal", async () => {
  const ids = ["bwm039_uncertain_a"];
  await seed(ids);
  const request = createRequest(ids);
  const interrupted = new CalibrationRolloutService(firestore, {
    afterReservation: () => {
      throw new Error("simulated process death");
    },
  });
  await assert.rejects(interrupted.apply(vendor, request), /process death/);
  const identity = calibrationRolloutIdentity(vendor, parseCalibrationRollout(request));
  await unchanged(ids, identity.operationId);
  const lostResponse = new CalibrationRolloutService(firestore, {
    afterApplyCommit: () => {
      throw new Error("simulated lost commit response");
    },
  });
  const recovered = await lostResponse.apply(vendor, request);
  assert.equal(recovered.state, "applied");
  assert.deepEqual(await service.apply(vendor, request), recovered);
});

test("concurrent same key converges and competing keys cannot overwrite expected pointer", async () => {
  const ids = ["bwm039_concurrent_a", "bwm039_concurrent_z"];
  await seed(ids);
  const request = createRequest(ids);
  const same = await Promise.all([service.apply(vendor, request), service.apply(vendor, request)]);
  assert.equal(same[0].state, "applied");
  assert.deepEqual(same[0], same[1]);
  const other = createRequest(ids);
  const conflict = await service.apply(vendor, other);
  assert.equal(conflict.state, "not_applied");
  assert.equal(conflict.receipt?.failureCode, "TARGET_CONFLICT");
  // An identical immutable copy can be reused under a new key with current preconditions.
  const reuse = createRequest(ids);
  reuse.targets.forEach((target) => {
    target.expectedCalibrationVersion = version;
  });
  assert.equal((await service.apply(vendor, reuse)).state, "applied");
  assert.ok(same[0].receipt);
  assert.equal((await firestore.doc(same[0].receipt.targets[0].calibrationPath).get()).get("isActive"), true);
  const racingIds = ["bwm039_racing_a", "bwm039_racing_z"];
  await seed(racingIds);
  const racing = await Promise.all([service.apply(vendor, createRequest(racingIds)),
    service.apply(vendor, createRequest(racingIds))]);
  assert.deepEqual(racing.map((operation) => operation.state).sort(), ["applied", "not_applied"]);
  assert.equal(racing.find((operation) => operation.state === "not_applied")?.receipt?.failureCode, "TARGET_CONFLICT");
});

test("precommit failure terminalizes exact safe failure and corrupt journal cannot replay", async () => {
  const ids = ["bwm039_terminal_a"];
  await seed(ids);
  const request = createRequest(ids);
  const failed = await new CalibrationRolloutService(firestore, {
    beforeApplyCommit: () => {
      throw new Error("internal secret must never enter receipt");
    },
  }).apply(vendor, request);
  assert.equal(failed.state, "not_applied");
  assert.equal(failed.receipt?.failureCode, "APPLY_FAILED");
  assert.equal(JSON.stringify(failed).includes("internal secret"), false);
  await unchanged(ids, failed.operationId);
  assert.deepEqual(await service.apply(vendor, request), failed);
  const journal = firestore.doc(`vendorCalibrationRollouts/${failed.operationId}`);
  await journal.update({"receipt.versionId": "forged"});
  await assert.rejects(service.apply(vendor, request), /receipt identity/);
  await unchanged(ids, failed.operationId);
});

test("bad or future source and immutable-copy collisions fail with no target mutations", async () => {
  for (const mode of ["missing", "future", "malformed", "copy", "root_log", "history"]) {
    const ids = [`bwm039_source_${mode}`];
    await seed(ids);
    if (mode === "missing") await firestore.doc(`globalCalibration/${version}`).delete();
    if (mode === "future") await firestore.doc(`globalCalibration/${version}`).update({activationDate: "2999-01-01"});
    if (mode === "malformed") await firestore.doc(`globalCalibration/${version}`).update({weights: {guessWeight: 1}});
    const request = createRequest(ids);
    const identity = calibrationRolloutIdentity(vendor, parseCalibrationRollout(request));
    if (mode === "copy") {
      await firestore.doc(`institutes/${ids[0]}/calibration/${version}`).set({
        ...consumerVersion(version), weights: {...candidate.weights, guessWeight: 0.35, phaseWeight: 0.2},
      });
    }
    if (mode === "root_log") {
      await firestore.doc(`vendorCalibrationLogs/${identity.operationId}`).create({untouched: true});
    }
    if (mode === "history") {
      await firestore.doc(`institutes/${ids[0]}/calibrationHistory/${identity.operationId}`)
        .create({untouched: true});
    }
    const response = await service.apply(vendor, request);
    assert.equal(response.state, mode === "root_log" ? "pending" : "not_applied");
    assert.equal((await firestore.doc(`institutes/${ids[0]}`).get()).get("calibrationVersion"), undefined);
    if (mode === "copy") {
      assert.equal((await firestore.doc(`institutes/${ids[0]}/calibration/${version}`).get())
        .get("weights.guessWeight"), 0.35);
    }
    if (mode === "root_log") {
      assert.deepEqual((await firestore.doc(`vendorCalibrationLogs/${identity.operationId}`).get())
        .data(), {untouched: true});
    }
    if (mode === "history") {
      assert.deepEqual((await firestore.doc(`institutes/${ids[0]}/calibrationHistory/${identity.operationId}`)
        .get()).data(), {untouched: true});
    }
  }
});
