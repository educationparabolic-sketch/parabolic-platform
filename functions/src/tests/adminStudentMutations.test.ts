import assert from "node:assert/strict";
import test from "node:test";
import * as gcpMetadata from "gcp-metadata";
import {Timestamp} from "firebase-admin/firestore";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {
  AdminStudentMutationsService,
} from "../services/adminStudentMutations";
import {
  AdminStudentMutationValidationError,
} from "../types/adminStudentMutations";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "demo-parabolic-test";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();
const authEmulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;

interface IdentityCalls {
  clears: string[];
  synchronizations: Array<{instituteId: string; uid: string}>;
  updates: Array<{
    disabled: boolean;
    displayName: string;
    email: string;
    uid: string;
  }>;
}

function createService(input?: {
  failNextAuthUpdate?: boolean;
}): {calls: IdentityCalls; service: AdminStudentMutationsService} {
  const calls: IdentityCalls = {
    clears: [],
    synchronizations: [],
    updates: [],
  };
  let failNextAuthUpdate = input?.failNextAuthUpdate ?? false;
  let timestampOffset = 0;
  const service = new AdminStudentMutationsService({
    firestore,
    now: () => Timestamp.fromMillis(
      Date.parse("2026-09-01T10:00:00.000Z") + timestampOffset++,
    ),
    sessionSecurity: {
      clearClaimsAndRevokeSessions: async (uid) => {
        calls.clears.push(uid);
        return {
          claimsChanged: true,
          refreshTokensRevoked: true,
          uid,
          userMissing: false,
        };
      },
      synchronizeClaimsAndRevokeSessions: async (authority) => {
        calls.synchronizations.push(authority);
        return {
          claimsChanged: true,
          refreshTokensRevoked: true,
          uid: authority.uid,
          userMissing: false,
        };
      },
    },
    updateAuthUser: async (uid, update) => {
      if (failNextAuthUpdate) {
        failNextAuthUpdate = false;
        throw new Error("simulated Auth outage");
      }
      calls.updates.push({uid, ...update});
    },
  });

  return {calls, service};
}

async function deleteCollection(path: string): Promise<void> {
  const snapshot = await firestore.collection(path).get();
  await Promise.all(snapshot.docs.map((document) => document.ref.delete()));
}

async function prepareInstitute(
  instituteId: string,
  students: Array<Record<string, unknown> & {studentId: string}>,
): Promise<void> {
  const institutePath = `institutes/${instituteId}`;
  await deleteCollection(`${institutePath}/auditLogs`);
  await deleteCollection(`${institutePath}/students`);
  await firestore.doc(institutePath).delete().catch(() => undefined);
  await firestore.doc(institutePath).set({instituteId, status: "active"});
  await Promise.all(students.map((student) =>
    firestore.doc(`${institutePath}/students/${student.studentId}`).set({
      batch: "Batch A",
      batchId: "Batch A",
      batchName: "Legacy Batch A",
      deleted: false,
      email: `${student.studentId}@example.test`,
      fullName: `Student ${student.studentId}`,
      name: `Student ${student.studentId}`,
      status: "active",
      version: 1,
      ...student,
    })));
}

async function cleanupInstitute(instituteId: string): Promise<void> {
  const institutePath = `institutes/${instituteId}`;
  await deleteCollection(`${institutePath}/auditLogs`);
  await deleteCollection(`${institutePath}/students`);
  await firestore.doc(institutePath).delete().catch(() => undefined);
}

function authorityInput(instituteId: string) {
  return {
    actorId: "admin-bwm-026",
    actorRole: "admin",
    instituteId,
    ipAddress: "127.0.0.1",
    userAgent: "BWM-026-test",
  };
}

function assertConflict(error: unknown): boolean {
  assert.ok(error instanceof AdminStudentMutationValidationError);
  assert.equal(error.code, "CONFLICT");
  return true;
}

async function signInWithPassword(email: string, password: string): Promise<string> {
  assert.ok(authEmulatorHost, "FIREBASE_AUTH_EMULATOR_HOST is required");
  const response = await fetch(
    `http://${authEmulatorHost}/identitytoolkit.googleapis.com/v1/` +
      "accounts:signInWithPassword?key=demo-key",
    {
      body: JSON.stringify({email, password, returnSecureToken: true}),
      headers: {"Content-Type": "application/json"},
      method: "POST",
      signal: AbortSignal.timeout(15_000),
    },
  );
  const body = await response.json() as {idToken?: unknown};
  assert.equal(response.status, 200, JSON.stringify(body));
  if (typeof body.idToken !== "string") {
    throw new Error("Auth emulator response did not include an ID token.");
  }
  return body.idToken;
}

test.after(async () => {
  await getFirebaseAdminApp().delete();
});

test("mutation normalization rejects non-admin authority", () => {
  const {service} = createService();
  assert.throws(
    () => service.normalizeProfileUpdateRequest({
      actorId: "teacher-bwm-026",
      actorRole: "teacher",
      body: {
        email: "student@example.test",
        expectedVersion: 1,
        fullName: "Student",
        idempotencyKey: "teacher-command-bwm-026",
      },
      instituteId: "inst-bwm-026-role",
      studentId: "student-bwm-026-role",
    }),
    (error: unknown) => {
      assert.ok(error instanceof AdminStudentMutationValidationError);
      assert.equal(error.code, "FORBIDDEN");
      return true;
    },
  );
});

test(
  "profile and inactive lifecycle reconcile real Firebase Auth authority",
  {skip: !authEmulatorHost},
  async () => {
    const instituteId = "inst-bwm-026-real-auth";
    const studentId = "student-bwm-026-real-auth";
    const originalEmail = "student-bwm-026-real-auth@example.test";
    const updatedEmail = "updated-bwm-026-real-auth@example.test";
    const password = "Bwm-026-real-auth-password";
    const auth = getFirebaseAdminApp().auth();
    await auth.deleteUser(studentId).catch(() => undefined);
    await prepareInstitute(instituteId, [{
      email: originalEmail,
      fullName: "Original Auth Student",
      name: "Original Auth Student",
      studentId,
    }]);
    const instituteReference = firestore.doc(`institutes/${instituteId}`);
    await Promise.all([
      instituteReference.collection("license").doc("current").set({
        currentLayer: "L0",
        featureFlags: {},
      }),
      instituteReference.collection("license").doc("main").set({
        currentLayer: "L0",
        featureFlags: {},
      }),
      auth.createUser({
        displayName: "Original Auth Student",
        email: originalEmail,
        password,
        uid: studentId,
      }),
    ]);
    await auth.setCustomUserClaims(studentId, {
      instituteId,
      isSuspended: false,
      licenseLayer: "L0",
      role: "student",
      studentId,
    });

    try {
      const staleToken = await signInWithPassword(originalEmail, password);
      await new Promise((resolve) => setTimeout(resolve, 1_100));
      const service = new AdminStudentMutationsService();
      const profile = await service.updateProfile(
        service.normalizeProfileUpdateRequest({
          ...authorityInput(instituteId),
          body: {
            email: updatedEmail,
            expectedVersion: 1,
            fullName: "Updated Auth Student",
            idempotencyKey: "real-auth-profile-bwm-026",
          },
          studentId,
        }),
      );
      const updatedUser = await auth.getUser(studentId);
      assert.equal(profile.auth.userUpdated, true);
      assert.equal(profile.auth.claimsSynchronized, true);
      assert.equal(profile.auth.refreshTokensRevoked, true);
      assert.equal(updatedUser.email, updatedEmail);
      assert.equal(updatedUser.displayName, "Updated Auth Student");
      assert.equal(updatedUser.customClaims?.role, "student");
      assert.equal(updatedUser.customClaims?.instituteId, instituteId);
      await assert.rejects(auth.verifyIdToken(staleToken, true));

      const inactive = await service.updateLifecycle(
        service.normalizeLifecycleUpdateRequest({
          ...authorityInput(instituteId),
          body: {
            expectedVersion: 2,
            idempotencyKey: "real-auth-inactive-bwm-026",
            reason: "Enrollment ended",
            status: "inactive",
          },
          studentId,
        }),
      );
      const inactiveUser = await auth.getUser(studentId);
      assert.equal(inactive.auth.userUpdated, true);
      assert.equal(inactive.auth.claimsSynchronized, true);
      assert.equal(inactive.auth.refreshTokensRevoked, true);
      assert.equal(inactiveUser.disabled, true);
      assert.equal(inactiveUser.customClaims?.role, undefined);
      assert.equal(inactiveUser.customClaims?.instituteId, undefined);
      assert.equal(inactiveUser.customClaims?.studentId, undefined);
    } finally {
      await Promise.allSettled([
        auth.deleteUser(studentId),
        instituteReference.collection("license").doc("current").delete(),
        instituteReference.collection("license").doc("main").delete(),
      ]);
      await cleanupInstitute(instituteId);
    }
  },
);

test("profile mutation commits immutable audit authority and replays exactly", async () => {
  const instituteId = "inst-bwm-026-profile";
  const studentId = "student-bwm-026-profile";
  await prepareInstitute(instituteId, [{studentId}]);
  const {calls, service} = createService();
  const request = service.normalizeProfileUpdateRequest({
    ...authorityInput(instituteId),
    body: {
      email: "Updated.Student@example.test",
      expectedVersion: 1,
      fullName: "Updated Student",
      idempotencyKey: "profile-command-bwm-026",
    },
    studentId,
  });

  try {
    const applied = await service.updateProfile(request);
    const replayed = await service.updateProfile(request);
    const student = await firestore.doc(
      `institutes/${instituteId}/students/${studentId}`,
    ).get();
    const audits = await firestore.collection(
      `institutes/${instituteId}/auditLogs`,
    ).get();

    assert.equal(applied.disposition, "applied");
    assert.equal(replayed.disposition, "replayed");
    assert.equal(replayed.auditId, applied.auditId);
    assert.equal(replayed.updatedAt, applied.updatedAt);
    assert.equal(student.get("email"), "updated.student@example.test");
    assert.equal(student.get("fullName"), "Updated Student");
    assert.equal(student.get("name"), "Updated Student");
    assert.equal(student.get("version"), 2);
    assert.equal(audits.size, 1);
    assert.equal(audits.docs[0]?.get("actionType"), "UPDATE_STUDENT_PROFILE");
    assert.doesNotMatch(
      JSON.stringify(audits.docs[0]?.data()),
      /profile-command-bwm-026/,
    );
    assert.deepEqual(calls.updates, [
      {
        disabled: false,
        displayName: "Updated Student",
        email: "updated.student@example.test",
        uid: studentId,
      },
      {
        disabled: false,
        displayName: "Updated Student",
        email: "updated.student@example.test",
        uid: studentId,
      },
    ]);
    assert.equal(calls.synchronizations.length, 2);

    const conflictingRequest = service.normalizeProfileUpdateRequest({
      ...authorityInput(instituteId),
      body: {
        email: "different@example.test",
        expectedVersion: 1,
        fullName: "Different Student",
        idempotencyKey: "profile-command-bwm-026",
      },
      studentId,
    });
    await assert.rejects(
      service.updateProfile(conflictingRequest),
      assertConflict,
    );
  } finally {
    await cleanupInstitute(instituteId);
  }
});

test("profile retry resumes Auth reconciliation after Firestore commit", async () => {
  const instituteId = "inst-bwm-026-profile-recovery";
  const studentId = "student-bwm-026-profile-recovery";
  await prepareInstitute(instituteId, [{studentId}]);
  const {calls, service} = createService({failNextAuthUpdate: true});
  const request = service.normalizeProfileUpdateRequest({
    ...authorityInput(instituteId),
    body: {
      email: "recovered@example.test",
      expectedVersion: 1,
      fullName: "Recovered Student",
      idempotencyKey: "profile-recovery-command-bwm-026",
    },
    studentId,
  });

  try {
    await assert.rejects(service.updateProfile(request), /simulated Auth outage/);
    const committed = await firestore.doc(
      `institutes/${instituteId}/students/${studentId}`,
    ).get();
    assert.equal(committed.get("version"), 2);

    const replayed = await service.updateProfile(request);
    const audits = await firestore.collection(
      `institutes/${instituteId}/auditLogs`,
    ).get();
    assert.equal(replayed.disposition, "replayed");
    assert.equal(replayed.version, 2);
    assert.equal(audits.size, 1);
    assert.equal(calls.updates.length, 1);
    assert.equal(calls.synchronizations.length, 1);
  } finally {
    await cleanupInstitute(instituteId);
  }
});

test("batch mutation is atomic, bounded, versioned, and replayable", async () => {
  const instituteId = "inst-bwm-026-batch";
  const studentIds = ["student-bwm-026-batch-a", "student-bwm-026-batch-b"];
  await prepareInstitute(instituteId, studentIds.map((studentId) => ({studentId})));
  const {service} = createService();
  const request = service.normalizeBatchAssignmentRequest({
    ...authorityInput(instituteId),
    body: {
      idempotencyKey: "batch-command-bwm-026",
      students: studentIds.map((studentId) => ({
        expectedVersion: 1,
        studentId,
      })),
      targetBatch: "Batch B",
    },
  });

  try {
    const applied = await service.assignBatch(request);
    const replayed = await service.assignBatch(request);
    const snapshots = await firestore.getAll(...studentIds.map((studentId) =>
      firestore.doc(`institutes/${instituteId}/students/${studentId}`)));
    const audits = await firestore.collection(
      `institutes/${instituteId}/auditLogs`,
    ).get();

    assert.equal(applied.disposition, "applied");
    assert.equal(replayed.disposition, "replayed");
    assert.deepEqual(replayed.students, applied.students);
    assert.deepEqual(
      snapshots.map((snapshot) => [snapshot.get("batchId"), snapshot.get("version")]),
      [["Batch B", 2], ["Batch B", 2]],
    );
    assert.equal(audits.size, 1);
    assert.equal(audits.docs[0]?.get("actionType"), "ASSIGN_STUDENT_BATCH");
    assert.deepEqual(
      snapshots.map((snapshot) => snapshot.get("batchName")),
      ["Batch B", "Batch B"],
    );
  } finally {
    await cleanupInstitute(instituteId);
  }
});

test("parallel stale profile commands allow exactly one authoritative winner", async () => {
  const instituteId = "inst-bwm-026-concurrency";
  const studentId = "student-bwm-026-concurrency";
  await prepareInstitute(instituteId, [{studentId}]);
  const {service} = createService();
  const requests = ["one", "two"].map((suffix) =>
    service.normalizeProfileUpdateRequest({
      ...authorityInput(instituteId),
      body: {
        email: `${suffix}@example.test`,
        expectedVersion: 1,
        fullName: `Concurrent ${suffix}`,
        idempotencyKey: `concurrent-${suffix}-bwm-026`,
      },
      studentId,
    }));

  try {
    const outcomes = await Promise.allSettled(
      requests.map((request) => service.updateProfile(request)),
    );
    const fulfilled = outcomes.filter((outcome) => outcome.status === "fulfilled");
    const rejected = outcomes.filter((outcome) => outcome.status === "rejected");
    const student = await firestore.doc(
      `institutes/${instituteId}/students/${studentId}`,
    ).get();
    const audits = await firestore.collection(
      `institutes/${instituteId}/auditLogs`,
    ).get();

    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assertConflict((rejected[0] as PromiseRejectedResult).reason);
    assert.equal(student.get("version"), 2);
    assert.equal(audits.size, 1);
  } finally {
    await cleanupInstitute(instituteId);
  }
});

test("lifecycle service enforces legal transitions and Auth/session authority", async () => {
  const instituteId = "inst-bwm-026-lifecycle";
  const studentId = "student-bwm-026-lifecycle";
  await prepareInstitute(instituteId, [{studentId}]);
  const {calls, service} = createService();

  try {
    const suspendedRequest = service.normalizeLifecycleUpdateRequest({
      ...authorityInput(instituteId),
      body: {
        expectedVersion: 1,
        idempotencyKey: "lifecycle-suspend-bwm-026",
        reason: "Policy review",
        status: "suspended",
      },
      studentId,
    });
    const suspended = await service.updateLifecycle(suspendedRequest);
    const replayed = await service.updateLifecycle(suspendedRequest);
    assert.equal(suspended.disposition, "applied");
    assert.equal(replayed.disposition, "replayed");
    assert.equal(suspended.previousStatus, "active");
    assert.equal(suspended.status, "suspended");
    assert.equal(suspended.version, 2);
    assert.equal(calls.updates[0]?.disabled, false);
    assert.equal(calls.synchronizations.length, 2);

    const inactiveRequest = service.normalizeLifecycleUpdateRequest({
      ...authorityInput(instituteId),
      body: {
        expectedVersion: 2,
        idempotencyKey: "lifecycle-inactive-bwm-026",
        reason: "Enrollment ended",
        status: "inactive",
      },
      studentId,
    });
    const inactive = await service.updateLifecycle(inactiveRequest);
    assert.equal(inactive.status, "inactive");
    assert.equal(inactive.version, 3);
    assert.equal(calls.updates[2]?.disabled, true);
    assert.deepEqual(calls.clears, [studentId]);

    const illegalRequest = service.normalizeLifecycleUpdateRequest({
      ...authorityInput(instituteId),
      body: {
        expectedVersion: 3,
        idempotencyKey: "lifecycle-illegal-bwm-026",
        reason: "No state change",
        status: "inactive",
      },
      studentId,
    });
    await assert.rejects(service.updateLifecycle(illegalRequest), assertConflict);
    const audits = await firestore.collection(
      `institutes/${instituteId}/auditLogs`,
    ).get();
    assert.equal(audits.size, 2);
  } finally {
    await cleanupInstitute(instituteId);
  }
});

test("photo review binds decision to the captured identity-photo version", async () => {
  const instituteId = "inst-bwm-026-photo";
  const studentId = "student-bwm-026-photo";
  const capturedAt = Timestamp.fromDate(new Date("2026-08-31T09:15:00.000Z"));
  await prepareInstitute(instituteId, [{
    identityPhotoCapturedAt: capturedAt,
    identityPhotoVerified: false,
    studentId,
  }]);
  const {calls, service} = createService();

  try {
    const staleRequest = service.normalizePhotoReviewRequest({
      ...authorityInput(instituteId),
      body: {
        decision: "verified",
        expectedPhotoCapturedAt: "2026-08-30T09:15:00.000Z",
        expectedVersion: 1,
        idempotencyKey: "photo-stale-bwm-026",
      },
      studentId,
    });
    await assert.rejects(service.reviewPhoto(staleRequest), assertConflict);

    const request = service.normalizePhotoReviewRequest({
      ...authorityInput(instituteId),
      body: {
        decision: "verified",
        expectedPhotoCapturedAt: capturedAt.toDate().toISOString(),
        expectedVersion: 1,
        idempotencyKey: "photo-verified-bwm-026",
        reason: "Identity matched enrollment record",
      },
      studentId,
    });
    const applied = await service.reviewPhoto(request);
    const replayed = await service.reviewPhoto(request);
    const student = await firestore.doc(
      `institutes/${instituteId}/students/${studentId}`,
    ).get();
    const audits = await firestore.collection(
      `institutes/${instituteId}/auditLogs`,
    ).get();

    assert.equal(applied.disposition, "applied");
    assert.equal(replayed.disposition, "replayed");
    assert.equal(applied.photoCapturedAt, "2026-08-31T09:15:00.000Z");
    assert.equal(student.get("identityPhotoVerified"), true);
    assert.equal(student.get("livePhotoVerified"), true);
    assert.equal(student.get("version"), 2);
    assert.equal(audits.size, 1);
    assert.equal(audits.docs[0]?.get("actionType"), "REVIEW_STUDENT_PHOTO");
    assert.deepEqual(calls.updates, []);
  } finally {
    await cleanupInstitute(instituteId);
  }
});
