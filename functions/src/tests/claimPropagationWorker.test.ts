/* eslint-disable max-len */
import assert from "node:assert/strict";
import test from "node:test";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  ClaimPropagationCoordinator,
  ClaimPropagationDeadlineService,
  ClaimPropagationWorker,
} from "../services/claimPropagation";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";

const firestore = getFirestore();

const featureFlags = {
  adaptivePhase: true,
  controlledMode: true,
  governanceAccess: false,
  hardMode: true,
  riskOverview: true,
};

const seedAuthority = async (input: {
  authorizationVersion: number;
  instituteId: string;
  licenseVersion: string;
  settingsUsers?: Record<string, unknown>;
  studentCount: number;
}): Promise<FirebaseFirestore.DocumentReference> => {
  const institute = firestore.doc(`institutes/${input.instituteId}`);
  await institute.set({
    authorizationVersion: input.authorizationVersion,
    instituteId: input.instituteId,
    instituteRevision: input.authorizationVersion,
    licenseVersion: input.licenseVersion,
    settingsUsers: input.settingsUsers ?? {},
    status: "active",
  });
  await institute.collection("license").doc("current").set({
    activeStudentLimit: 1_000,
    concurrentSessionLimit: 250,
    currentLayer: "L2",
    expiryDate: "2099-10-03T00:00:00.000Z",
    featureFlags,
    gracePeriodEndsAt: null,
    licenseState: "active",
    licenseVersion: input.licenseVersion,
  });
  let batch = firestore.batch();
  let writes = 0;
  for (let index = 0; index < input.studentCount; index += 1) {
    const uid = `student_${String(index).padStart(4, "0")}`;
    batch.set(institute.collection("students").doc(uid), {
      status: "active",
      studentId: uid,
    });
    writes += 1;
    if (writes === 400) {
      await batch.commit();
      batch = firestore.batch();
      writes = 0;
    }
  }
  if (writes > 0) await batch.commit();
  return institute;
};

test("worker paginates a large fleet and records exact terminal accounting", async () => {
  const instituteId = `inst_claim_worker_${Date.now()}`;
  const institute = await seedAuthority({
    authorizationVersion: 1,
    instituteId,
    licenseVersion: "license-v1",
    settingsUsers: {
      staff_0001: {role: "admin", status: "active"},
      student_0000: {role: "teacher", status: "active"},
    },
    studentCount: 205,
  });
  const nowMs = Date.parse("2026-10-03T10:00:00.000Z");
  const calls: string[] = [];
  const coordinator = new ClaimPropagationCoordinator({
    firestore,
    now: () => new Date(nowMs),
  });
  const worker = new ClaimPropagationWorker({
    firestore,
    now: () => new Date(nowMs),
    synchronizeClaimsAndRevokeSessions: async ({authorizationVersion, uid}) => {
      assert.equal(authorizationVersion, 1);
      calls.push(uid);
      return uid === "student_0204" ? {
        claimsChanged: null,
        refreshTokensRevoked: false,
        userMissing: true,
      } : {
        claimsChanged: true,
        refreshTokensRevoked: true,
        userMissing: false,
      };
    },
  });

  try {
    const receipt = await coordinator.createOperationFromCurrentAuthority({
      instituteId,
      source: "license_changed",
    });
    const replay = await coordinator.createOperationFromCurrentAuthority({
      instituteId,
      source: "license_changed",
    });
    assert.deepEqual(replay, receipt);

    const sweep = await worker.processDueOperations("large-fleet-worker", 30);
    assert.equal(sweep.processed > 1, true);
    assert.equal(calls.length, 206);
    assert.equal(new Set(calls).size, 206);

    const operation = await institute.collection("claimPropagationOperations").doc("v1").get();
    assert.deepEqual(operation.get("counts"), {
      claimsChanged: 205,
      deadLettered: 0,
      discovered: 206,
      missing: 1,
      refreshTokensRevoked: 205,
      synchronized: 205,
    });
    assert.equal(operation.get("enumeration.staffComplete"), true);
    assert.equal(operation.get("enumeration.studentsComplete"), true);
    assert.equal(operation.get("enumeration.studentCursor"), "student_0204");
    assert.equal(operation.get("state"), "succeeded");
    assert.equal(operation.get("completedAt") <= operation.get("serverDeadlineAt"), true);
    assert.equal(
      Date.parse(operation.get("completedAt")) - Date.parse(operation.get("createdAt")),
      0,
    );
    const deliveries = await institute.collection("claimPropagationOperations")
      .doc("v1").collection("deliveries").get();
    assert.equal(deliveries.size, 206);
    assert.equal(
      (await institute.collection("auditLogs").doc("claim_propagation_v1").get()).exists,
      true,
    );
  } finally {
    await firestore.recursiveDelete(institute);
  }
});

test("a partial Auth failure retries only the failed identity and recovers", async () => {
  const instituteId = `inst_claim_partial_${Date.now()}`;
  const institute = await seedAuthority({
    authorizationVersion: 1,
    instituteId,
    licenseVersion: "license-v1",
    studentCount: 3,
  });
  let nowMs = Date.parse("2026-10-03T10:30:00.000Z");
  const attempts = new Map<string, number>();
  const coordinator = new ClaimPropagationCoordinator({
    firestore,
    now: () => new Date(nowMs),
  });
  const worker = new ClaimPropagationWorker({
    firestore,
    now: () => new Date(nowMs),
    synchronizeClaimsAndRevokeSessions: async ({uid}) => {
      const count = (attempts.get(uid) ?? 0) + 1;
      attempts.set(uid, count);
      if (uid === "student_0001" && count === 1) {
        throw Object.assign(new Error("temporary Auth failure"), {
          code: "auth/internal-error",
        });
      }
      return {claimsChanged: true, refreshTokensRevoked: true, userMissing: false};
    },
  });

  try {
    await coordinator.createOperationFromCurrentAuthority({
      instituteId,
      source: "license_changed",
    });
    assert.deepEqual(await worker.processDueOperations("partial-worker", 20), {
      invoked: 2,
      processed: 2,
    });
    const retrying = await institute.collection("claimPropagationOperations")
      .doc("v1").collection("deliveries").doc("student_0001").get();
    assert.equal(retrying.get("state"), "retrying");
    assert.equal(attempts.get("student_0000"), 1);
    assert.equal(attempts.get("student_0002"), 1);

    nowMs += 5_000;
    await worker.processDueOperations("partial-worker-retry", 20);
    const operation = await institute.collection("claimPropagationOperations").doc("v1").get();
    assert.equal(operation.get("state"), "succeeded");
    assert.equal(operation.get("counts.synchronized"), 3);
    assert.equal(attempts.get("student_0001"), 2);
    assert.equal(attempts.get("student_0000"), 1);
    assert.equal(attempts.get("student_0002"), 1);
  } finally {
    await firestore.recursiveDelete(institute);
  }
});

test("concurrent workers lease one operation without duplicate delivery", async () => {
  const instituteId = `inst_claim_concurrent_${Date.now()}`;
  const institute = await seedAuthority({
    authorizationVersion: 1,
    instituteId,
    licenseVersion: "license-v1",
    studentCount: 2,
  });
  const now = () => new Date("2026-10-03T10:45:00.000Z");
  const calls = new Map<string, number>();
  const synchronize = async ({uid}: {uid: string}) => {
    calls.set(uid, (calls.get(uid) ?? 0) + 1);
    return {claimsChanged: true, refreshTokensRevoked: true, userMissing: false};
  };
  const coordinator = new ClaimPropagationCoordinator({firestore, now});
  const workerA = new ClaimPropagationWorker({
    firestore,
    now,
    synchronizeClaimsAndRevokeSessions: synchronize,
  });
  const workerB = new ClaimPropagationWorker({
    firestore,
    now,
    synchronizeClaimsAndRevokeSessions: synchronize,
  });

  try {
    await coordinator.createOperationFromCurrentAuthority({
      instituteId,
      source: "license_changed",
    });
    await Promise.all([
      workerA.processDueOperations("concurrent-a", 20),
      workerB.processDueOperations("concurrent-b", 20),
    ]);
    const operation = await institute.collection("claimPropagationOperations").doc("v1").get();
    assert.equal(operation.get("state"), "succeeded");
    assert.deepEqual(Array.from(calls.values()).sort(), [1, 1]);
  } finally {
    await firestore.recursiveDelete(institute);
  }
});

test("worker retries safely, dead-letters at five attempts, and stores no error detail", async () => {
  const instituteId = `inst_claim_retry_${Date.now()}`;
  const institute = await seedAuthority({
    authorizationVersion: 1,
    instituteId,
    licenseVersion: "license-v1",
    studentCount: 1,
  });
  let nowMs = Date.parse("2026-10-03T11:00:00.000Z");
  const coordinator = new ClaimPropagationCoordinator({firestore, now: () => new Date(nowMs)});
  const worker = new ClaimPropagationWorker({
    firestore,
    now: () => new Date(nowMs),
    synchronizeClaimsAndRevokeSessions: async () => {
      const error = new Error("sensitive provider diagnostic must not persist") as Error & {code: string};
      error.code = "AUTH/provider unavailable";
      throw error;
    },
  });

  try {
    await coordinator.createOperationFromCurrentAuthority({
      instituteId,
      source: "license_changed",
    });
    let state = "pending";
    for (let index = 0; index < 12 && state !== "dead_lettered"; index += 1) {
      const result = await worker.processOperation({
        instituteId,
        operationId: "v1",
        workerId: `retry-worker-${index}`,
      });
      state = result.state;
      nowMs += 65_000;
    }
    assert.equal(state, "dead_lettered");
    const delivery = await institute.collection("claimPropagationOperations")
      .doc("v1").collection("deliveries").doc("student_0000").get();
    assert.equal(delivery.get("attemptCount"), 5);
    assert.equal(delivery.get("state"), "dead_lettered");
    assert.equal(delivery.get("lastErrorCode"), "auth_provider_unavailable");
    assert.doesNotMatch(JSON.stringify(delivery.data()), /sensitive provider diagnostic/u);
    const operation = await institute.collection("claimPropagationOperations").doc("v1").get();
    assert.equal(operation.get("counts.deadLettered"), 1);
    assert.equal(operation.get("lastErrorCode"), "delivery_dead_lettered");
  } finally {
    await firestore.recursiveDelete(institute);
  }
});

test("newer authority supersedes an old operation before any delivery", async () => {
  const instituteId = `inst_claim_supersede_${Date.now()}`;
  const institute = await seedAuthority({
    authorizationVersion: 1,
    instituteId,
    licenseVersion: "license-v1",
    studentCount: 1,
  });
  const now = () => new Date("2026-10-03T12:00:00.000Z");
  let calls = 0;
  const coordinator = new ClaimPropagationCoordinator({firestore, now});
  const worker = new ClaimPropagationWorker({
    firestore,
    now,
    synchronizeClaimsAndRevokeSessions: async () => {
      calls += 1;
      return {claimsChanged: true, refreshTokensRevoked: true, userMissing: false};
    },
  });

  try {
    await coordinator.createOperationFromCurrentAuthority({instituteId, source: "license_changed"});
    await institute.set({authorizationVersion: 2, instituteRevision: 2, licenseVersion: "license-v2"}, {merge: true});
    await institute.collection("license").doc("current").set({licenseVersion: "license-v2"}, {merge: true});
    await coordinator.createOperationFromCurrentAuthority({instituteId, source: "institute_suspended"});
    const oldResult = await worker.processOperation({
      instituteId,
      operationId: "v1",
      workerId: "supersession-worker",
    });
    assert.equal(oldResult.state, "superseded");
    assert.equal(calls, 0);
    const oldOperation = await institute.collection("claimPropagationOperations").doc("v1").get();
    assert.equal(oldOperation.get("supersededByOperationId"), "v2");
  } finally {
    await firestore.recursiveDelete(institute);
  }
});

test("a mid-delivery authority change is reprojected before supersession", async () => {
  const instituteId = `inst_claim_mid_delivery_${Date.now()}`;
  const institute = await seedAuthority({
    authorizationVersion: 1,
    instituteId,
    licenseVersion: "license-v1",
    settingsUsers: {staff_0001: {role: "admin", status: "active"}},
    studentCount: 0,
  });
  const nowMs = Date.parse("2026-10-03T13:00:00.000Z");
  const observedVersions: number[] = [];
  const coordinator = new ClaimPropagationCoordinator({
    firestore,
    now: () => new Date(nowMs),
  });
  const worker = new ClaimPropagationWorker({
    firestore,
    now: () => new Date(nowMs),
    synchronizeClaimsAndRevokeSessions: async ({authorizationVersion}) => {
      observedVersions.push(authorizationVersion);
      if (authorizationVersion === 1) {
        await institute.set({
          authorizationVersion: 2,
          instituteRevision: 2,
          licenseVersion: "license-v2",
        }, {merge: true});
        await institute.collection("license").doc("current").set({
          licenseVersion: "license-v2",
        }, {merge: true});
      }
      return {claimsChanged: true, refreshTokensRevoked: true, userMissing: false};
    },
  });

  try {
    await coordinator.createOperationFromCurrentAuthority({
      instituteId,
      source: "license_changed",
    });
    const result = await worker.processOperation({
      instituteId,
      operationId: "v1",
      workerId: "mid-delivery-worker",
    });
    assert.equal(result.state, "superseded");
    assert.deepEqual(observedVersions, [1, 2]);
    const operation = await institute.collection("claimPropagationOperations").doc("v1").get();
    assert.equal(operation.get("supersededByOperationId"), "v2");
    const delivery = await institute.collection("claimPropagationOperations")
      .doc("v1").collection("deliveries").doc("staff_0001").get();
    assert.equal(delivery.get("state"), "superseded");
  } finally {
    await firestore.recursiveDelete(institute);
  }
});

test("deadline sweep transactionally expires active and grace authority once", async () => {
  const suffix = Date.now();
  const activeId = `inst_claim_deadline_active_${suffix}`;
  const graceId = `inst_claim_deadline_grace_${suffix}`;
  const active = await seedAuthority({
    authorizationVersion: 1,
    instituteId: activeId,
    licenseVersion: "license-active-v1",
    studentCount: 0,
  });
  const grace = await seedAuthority({
    authorizationVersion: 4,
    instituteId: graceId,
    licenseVersion: "license-grace-v4",
    studentCount: 0,
  });
  const now = () => new Date("2026-10-04T12:00:00.000Z");
  const service = new ClaimPropagationDeadlineService({firestore, now});

  try {
    await active.collection("license").doc("current").set({
      expiryDate: "2026-10-04T11:59:59.000Z",
      planName: "Controlled",
    }, {merge: true});
    await grace.collection("license").doc("current").set({
      gracePeriodEndsAt: "2026-10-04T11:59:59.000Z",
      licenseState: "grace",
      planName: "Controlled",
    }, {merge: true});

    const result = await service.processDueTransitions(10);
    assert.deepEqual(result, {inspected: 2, transitioned: 2});
    const [activeRoot, activeLicense, activeOperation, graceRoot, graceLicense, graceOperation] =
      await Promise.all([
        active.get(),
        active.collection("license").doc("current").get(),
        active.collection("claimPropagationOperations").doc("v2").get(),
        grace.get(),
        grace.collection("license").doc("current").get(),
        grace.collection("claimPropagationOperations").doc("v5").get(),
      ]);
    assert.equal(activeRoot.get("authorizationVersion"), 2);
    assert.equal(activeLicense.get("licenseState"), "expired");
    assert.equal(activeOperation.get("source"), "license_expired");
    assert.equal(graceRoot.get("authorizationVersion"), 5);
    assert.equal(graceLicense.get("licenseState"), "expired");
    assert.equal(graceOperation.get("source"), "grace_expired");
    assert.equal((await service.processDueTransitions(10)).transitioned, 0);
  } finally {
    await Promise.all([
      firestore.recursiveDelete(active),
      firestore.recursiveDelete(grace),
    ]);
  }
});
