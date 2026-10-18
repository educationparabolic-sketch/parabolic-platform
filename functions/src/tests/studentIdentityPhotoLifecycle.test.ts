import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import test from "node:test";
import sharp from "sharp";
import {Timestamp} from "firebase-admin/firestore";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {StudentIdentityPhotoService} from "../services/studentIdentityPhoto";
import {
  PrivateIdentityPhotoObjectStore,
  IdentityPhotoObjectTarget,
  IdentityPhotoObjectStore,
  PrivateIdentityPhotoDeletionStore,
  IdentityPhotoDeletionStore,
} from "../services/studentIdentityPhotoStorage";
import {StudentProfileService} from "../services/studentProfile";
import {StudentProfileValidationError} from "../types/studentProfile";
import {identitySessionSecurityService} from "../services/identitySessionSecurity";
import {
  StudentIdentityPhotoLifecycleService,
  normalizeIdentityPhotoWithdrawal,
} from "../services/studentIdentityPhotoLifecycle";
import {StudentSoftDeleteService} from "../services/studentSoftDelete";
import {AdminStudentMutationsService} from "../services/adminStudentMutations";

assert.equal(process.env.GCLOUD_PROJECT, "demo-parabolic-test");
assert.ok(process.env.FIRESTORE_EMULATOR_HOST);
assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST);
assert.ok(process.env.FIREBASE_STORAGE_EMULATOR_HOST);
const BUCKET = "demo-parabolic-test-identity-photos";
process.env.IDENTITY_PHOTOS_BUCKET = BUCKET;
const firestore = getFirestore();
const auth = getFirebaseAdminApp().auth();
const bucket = getFirebaseAdminApp().storage().bucket(BUCKET);
const instituteId = "inst-bwm042-lifecycle";
const studentId = "student-bwm042-lifecycle";
const institute = firestore.doc(`institutes/${instituteId}`);
const student = institute.collection("students").doc(studentId);
const photos = institute.collection("identityPhotos");
const audits = institute.collection("auditLogs");
const prefix = `identity-photos/${instituteId}/${studentId}/`;
const claims = {
  role: "student",
  studentId,
  instituteId,
  authorizationVersion: 1,
  licenseLayer: "L0",
  licenseVersion: "license-photo-v1",
  licenseState: "active",
  featureFlags: {
    adaptivePhase: false,
    controlledMode: false,
    governanceAccess: false,
    hardMode: false,
    riskOverview: false,
  },
};
let token: string;
let now: Timestamp;
let bytes: Buffer;
const clock = () => now;
const profiles = new StudentProfileService({firestore, auth, now: clock});
const objects = new PrivateIdentityPhotoObjectStore();
const makeService = (store: IdentityPhotoObjectStore = objects, owner = profiles) =>
  new StudentIdentityPhotoService({firestore, profiles: owner, objects: store, now: clock});
function request(expectedVersion = 1, expectedPhotoId: string | null = null) {
  return {
    expectedVersion,
    expectedPhotoId,
    idempotencyKey: randomUUID(),
    consent: {accepted: true, policyVersion: "student-identity-photo-v1"},
    mediaType: "image/jpeg",
    contentBase64: bytes.toString("base64"),
  };
}
function denied(code: string) {
  return (error: unknown): boolean => {
    assert.ok(error instanceof StudentProfileValidationError);
    assert.equal(error.code, code);
    assert.doesNotMatch(error.message, /private-provider-detail|contentBase64|gs:\/\//u);
    return true;
  };
}
async function login(): Promise<string> {
  try {
    await auth.deleteUser(studentId);
  } catch (error) {
    if ((error as { code?: string }).code !== "auth/user-not-found") throw error;
  }
  const password = randomUUID();
  await auth.createUser({uid: studentId, email: "lifecycle-bwm042@emulator.test", password});
  await auth.setCustomUserClaims(studentId, claims);
  const response = await fetch(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/` +
      "v1/accounts:signInWithPassword?key=demo",
    {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({email: "lifecycle-bwm042@emulator.test", password, returnSecureToken: true}),
    },
  );
  assert.equal(response.status, 200);
  return ((await response.json()) as { idToken: string }).idToken;
}
test.beforeEach(async () => {
  await firestore.recursiveDelete(institute);
  await bucket.deleteFiles({prefix});
  now = Timestamp.fromDate(new Date("2026-10-16T10:00:00Z"));
  await institute.set({status: "active", licenseVersion: claims.licenseVersion, authorizationVersion: 1});
  await institute.collection("license").doc("current").set({
    currentLayer: "L0",
    licenseVersion: claims.licenseVersion,
    licenseState: "active",
    featureFlags: claims.featureFlags,
    activeStudentLimit: 100,
    concurrentSessionLimit: 10,
    expiryDate: "2099-01-01T00:00:00Z",
    gracePeriodEndsAt: null,
  });
  await student.set({
    studentId,
    name: "Photo Student",
    fullName: "Photo Student",
    email: "persisted@emulator.test",
    status: "active",
    deleted: false,
    version: 1,
    profilePreferences: {sidebarCollapsed: true},
  });
  token = await login();
  bytes = await sharp({create: {width: 320, height: 240, channels: 3, background: "#304090"}})
    .jpeg()
    .withExif({IFD0: {Copyright: "private-source-metadata"}})
    .toBuffer();
});
test.after(async () => {
  await bucket.deleteFiles({prefix});
  await firestore.recursiveDelete(institute);
  await auth.deleteUser(studentId);
  await getFirebaseAdminApp().delete();
});

const deletionObjects = new PrivateIdentityPhotoDeletionStore();
const lifecycle = (store: IdentityPhotoDeletionStore = deletionObjects) =>
  new StudentIdentityPhotoLifecycleService({firestore, profiles, now: clock, objects: store});
const withdrawal = (expectedVersion: number, expectedPhotoId: string | null) => ({
  expectedVersion,
  expectedPhotoId,
  idempotencyKey: randomUUID(),
});
const advance = (milliseconds: number) => {
  now = Timestamp.fromMillis(now.toMillis() + milliseconds);
};
const pendingStore: IdentityPhotoDeletionStore = {
  inspectForDeletion: async () => {
    throw new Error("private-provider-detail");
  },
  remove: async () => {
    throw new Error("must not execute");
  },
  closeUpload: async () => {
    throw new Error("must not execute");
  },
};
async function assertFenced(photoId: string) {
  const row = await photos.doc(photoId).get();
  assert.equal(row.get("state"), "deleted");
  assert.equal(row.get("uploadClosed"), true);
  for (const field of [
    "bucketName",
    "objectPath",
    "generation",
    "sha256",
    "sizeBytes",
    "width",
    "height",
    "stagedAt",
    "committedAt",
    "expiresAt",
    "deletionLeaseId",
    "deletionLeaseUntil",
    "nextCleanupAt",
  ]) {
    assert.equal(row.get(field), undefined, field);
  }
  const file = bucket.file(prefix + photoId + ".jpg");
  const [[data], [metadata]] = await Promise.all([file.download(), file.getMetadata()]);
  assert.equal(data.length, 0);
  assert.equal(metadata.contentType, "application/octet-stream");
  assert.equal(metadata.metadata?.identityPhotoUploadClosed, "v1");
  // Firebase CLI 15.9.0 ignores GCS generation preconditions. Assert the real
  // application's preflight rejects the fence; SDK preconditions have a separate
  // wire-contract unit proof and still require actual GCS qualification.
  const target = {
    bucketName: BUCKET,
    objectPath: prefix + photoId + ".jpg",
    generation: null,
    bytes,
    metadata: {
      photoId,
      instituteId,
      studentId,
      studentUid: studentId,
      idempotencyKeyHash: row.get("idempotencyKeyHash"),
      requestFingerprint: row.get("requestFingerprint"),
      sha256: "0".repeat(64),
    },
  };
  await assert.rejects(objects.ensure(target), denied("INTERNAL_ERROR"));
}

test("withdrawal revokes access atomically, reports pending failure and retries to a fenced tombstone", async () => {
  const enrolled = await makeService().enroll(token, request());
  const id = enrolled.committedPhoto.photoId;
  const body = withdrawal(2, id);
  const receipt = await lifecycle(pendingStore).withdraw(token, body);
  assert.equal(receipt.accessRevoked, true);
  assert.equal(receipt.version, 3);
  assert.equal((await profiles.getProfile(token)).identityPhoto.status, "withdrawn");
  assert.equal((await student.get()).get("identityPhotoReviewedAt"), null);
  assert.deepEqual(await lifecycle().getLifecycle(token, id), {
    photoId: id,
    state: "deletion_pending",
    deletionReason: "consent_withdrawn",
    deletedAt: null,
  });
  const pending = await photos.doc(id).get();
  assert.equal(pending.get("lastCleanupErrorCode"), "OBJECT_REMOVAL_UNCONFIRMED");
  assert.equal(pending.get("deleteAfter").toMillis(), now.toMillis() + 86400000);
  advance(900000);
  assert.equal((await lifecycle().cleanupExpired()).deleted, 1);
  await assertFenced(id);
  assert.equal((await lifecycle().getLifecycle(token, id)).state, "deleted");
  const replay = await lifecycle().withdraw(token, body);
  assert.equal(replay.disposition, "replayed");
  assert.equal(replay.withdrawnAt, receipt.withdrawnAt);
  assert.equal((await student.get()).get("version"), 3);
  const logs = await audits.where("actionType", "==", "DELETE_STUDENT_IDENTITY_PHOTO").get();
  assert.equal(logs.size, 1);
  assert.ok(!JSON.stringify(logs.docs[0].data()).includes(prefix));
});

test("privacy withdrawal and status survive inactive entitlement but deny changed or disabled Auth", async () => {
  const enrolled = await makeService().enroll(token, request());
  const id = enrolled.committedPhoto.photoId;
  await institute.update({status: "suspended", authorizationVersion: 50});
  await institute
    .collection("license")
    .doc("current")
    .update({licenseState: "expired", expiryDate: "2020-01-01"});
  await student.update({status: "archived", deleted: true});
  await assert.rejects(profiles.getProfile(token));
  await lifecycle().withdraw(token, withdrawal(2, id));
  assert.equal((await lifecycle().getLifecycle(token, id)).state, "deleted");
  await auth.setCustomUserClaims(studentId, {...claims, instituteId: "other-tenant"});
  await assert.rejects(lifecycle().getLifecycle(token, id), denied("FORBIDDEN"));
  await auth.setCustomUserClaims(studentId, claims);
  await auth.updateUser(studentId, {disabled: true});
  await assert.rejects(lifecycle().withdraw(token, withdrawal(3, null)), denied("UNAUTHORIZED"));
});

test("no-photo withdrawal is audited, closed, versioned and immutable under concurrent replay", async () => {
  const body = withdrawal(1, null);
  for (const invalid of [
    null,
    {...body, actorId: studentId},
    {...body, expectedVersion: "1"},
    {...body, expectedPhotoId: "bad/path"},
    {...body, idempotencyKey: "bad"},
    {...body, consent: true},
  ]) {
    assert.throws(() => normalizeIdentityPhotoWithdrawal(invalid), denied("VALIDATION_ERROR"));
  }
  const replies = await Promise.all([lifecycle().withdraw(token, body), lifecycle().withdraw(token, body)]);
  assert.deepEqual(replies.map((r) => r.disposition).sort(), ["applied", "replayed"]);
  assert.equal((await audits.get()).size, 1);
  assert.equal((await photos.get()).size, 0);
  await assert.rejects(lifecycle().withdraw(token, {...body, expectedVersion: 2}), denied("CONFLICT"));
  const next = await makeService().enroll(token, request(2));
  await lifecycle().withdraw(token, body);
  assert.equal((await student.get()).get("identityPhotoId"), next.committedPhoto.photoId);
  await audits.doc(replies[0].auditId).update({"metadata.result.version": 99});
  await assert.rejects(lifecycle().withdraw(token, body), denied("INTERNAL_ERROR"));
});

test("lost withdrawal commit response recovers exactly without clearing a later capture", async () => {
  const body = withdrawal(1, null);
  let fired = false;
  const ambiguous = new Proxy(profiles, {
    get(target, property) {
      if (property === "withOwnStudentPrivacy") {
        return async (...args: Parameters<typeof profiles.withOwnStudentPrivacy>) => {
          const result = await profiles.withOwnStudentPrivacy(...args);
          if (!fired) {
            fired = true;
            throw new Error("lost commit acknowledgement");
          }
          return result;
        };
      }
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const service = new StudentIdentityPhotoLifecycleService({firestore, profiles: ambiguous, now: clock});
  await assert.rejects(service.withdraw(token, body));
  const next = await makeService().enroll(token, request(2));
  const replay = await lifecycle().withdraw(token, body);
  assert.equal(replay.disposition, "replayed");
  assert.equal((await student.get()).get("identityPhotoId"), next.committedPhoto.photoId);
});

test("expiry revokes review before sweep, preserves expired metadata and scrubs private bytes", async () => {
  const enrolled = await makeService().enroll(token, request());
  const id = enrolled.committedPhoto.photoId;
  advance(90 * 86400000);
  assert.equal((await profiles.getProfile(token)).identityPhoto.status, "expired");
  assert.equal((await lifecycle().getLifecycle(token, id)).state, "deletion_pending");
  const admin = new AdminStudentMutationsService({
    firestore,
    now: clock,
    sessionSecurity: identitySessionSecurityService,
    updateAuthUser: async () => {
      throw Error("unused");
    },
  });
  await assert.rejects(
    admin.reviewPhoto(
      admin.normalizePhotoReviewRequest({
        actorId: "admin-photo",
        actorRole: "admin",
        instituteId,
        studentId,
        body: {
          expectedVersion: 2,
          expectedPhotoId: enrolled.committedPhoto.photoId,
          expectedPhotoCapturedAt: enrolled.committedPhoto.capturedAt,
          decision: "verified",
          idempotencyKey: randomUUID(),
        },
      }),
    ),
    (error: unknown) => (error as { code?: string }).code === "CONFLICT",
  );
  assert.equal((await lifecycle().cleanupExpired()).deleted, 1);
  await assertFenced(id);
  assert.equal((await student.get()).get("identityPhotoId"), id);
  assert.equal((await student.get()).get("version"), 3);
  assert.equal((await profiles.getProfile(token)).identityPhoto.status, "expired");
  const next = await makeService().enroll(token, request(3, id));
  assert.notEqual(next.committedPhoto.photoId, id);
});

test("replacement cleanup leaves the new capture and exact historical receipts untouched", async () => {
  const firstBody = request();
  const first = await makeService().enroll(token, firstBody);
  const second = await makeService().enroll(token, request(2, first.committedPhoto.photoId));
  assert.equal((await lifecycle().cleanupExpired()).deleted, 1);
  await assertFenced(first.committedPhoto.photoId);
  const row = await photos.doc(second.committedPhoto.photoId).get();
  assert.equal(row.get("state"), "active");
  assert.ok((await bucket.file(row.get("objectPath")).download())[0].length > 0);
  assert.equal((await makeService().enroll(token, firstBody)).disposition, "replayed");
  assert.equal((await student.get()).get("identityPhotoId"), second.committedPhoto.photoId);
});

test("expired unknown upload stages are inspected, removed and fenced without enrolling the Student", async () => {
  let stagedId = "";
  await assert.rejects(
    makeService({
      ensure: async (target) => {
        stagedId = target.metadata.photoId;
        await objects.ensure(target);
        throw Error("upload acknowledgement lost");
      },
    }).enroll(token, request()),
    denied("INTERNAL_ERROR"),
  );
  advance(86400000);
  assert.equal((await lifecycle().cleanupExpired()).deleted, 1);
  await assertFenced(stagedId);
  assert.equal((await student.get()).get("version"), 1);
  await assert.rejects(lifecycle().getLifecycle(token, stagedId), denied("NOT_FOUND"));
});

test("absent failed uploads close generation-zero writes even if the producer later resumes or dies", async () => {
  let stagedId = "";
  let target: IdentityPhotoObjectTarget | undefined;
  const body = request();
  await assert.rejects(
    makeService({
      ensure: async (value) => {
        target = value;
        stagedId = value.metadata.photoId;
        throw Error("failed before upload");
      },
    }).enroll(token, body),
    denied("INTERNAL_ERROR"),
  );
  advance(86400000);
  assert.equal((await lifecycle().cleanupExpired()).deleted, 1);
  await assertFenced(stagedId);
  assert.ok(target);
  await assert.rejects(objects.ensure(target));
  await assert.rejects(makeService().enroll(token, body), denied("CONFLICT"));
  assert.equal((await student.get()).get("version"), 1);
});

test("cleanup claims serialize competing workers and recover an expired crashed lease", async () => {
  const first = await makeService().enroll(token, request());
  const second = await makeService().enroll(token, request(2, first.committedPhoto.photoId));
  const results = await Promise.all([lifecycle().cleanupExpired(), lifecycle().cleanupExpired()]);
  assert.equal(
    results.reduce((n, r) => n + r.deleted, 0),
    1,
  );
  await assertFenced(first.committedPhoto.photoId);
  await lifecycle(pendingStore).withdraw(token, withdrawal(3, second.committedPhoto.photoId));
  const ref = photos.doc(second.committedPhoto.photoId);
  const until = Timestamp.fromMillis(now.toMillis() + 300000);
  await ref.update({
    state: "deleting",
    deletionLeaseId: randomUUID(),
    deletionLeaseUntil: until,
    nextCleanupAt: until,
  });
  assert.equal(await lifecycle().cleanupPhoto(ref), "skipped");
  advance(300000);
  assert.equal(await lifecycle().cleanupPhoto(ref), "deleted");
  await assertFenced(second.committedPhoto.photoId);
});

test("a changed or foreign generation cannot be deleted or reported complete", async () => {
  const first = await makeService().enroll(token, request());
  await lifecycle(pendingStore).withdraw(token, withdrawal(2, first.committedPhoto.photoId));
  const ref = photos.doc(first.committedPhoto.photoId);
  const row = await ref.get();
  const file = bucket.file(row.get("objectPath"));
  await file.save(Buffer.from("foreign-private-image"), {resumable: false, contentType: "image/jpeg"});
  advance(900000);
  assert.equal((await lifecycle().cleanupExpired()).failed, 1);
  assert.equal((await file.download())[0].toString(), "foreign-private-image");
  assert.equal(
    (await lifecycle().getLifecycle(token, first.committedPhoto.photoId)).state,
    "deletion_pending",
  );
});

test("lost delete acknowledgement and failed fence installation remain retryable until confirmed", async () => {
  const first = await makeService().enroll(token, request());
  const id = first.committedPhoto.photoId;
  let called = false;
  const uncertain: IdentityPhotoDeletionStore = {
    inspectForDeletion: (target) => deletionObjects.inspectForDeletion(target),
    remove: async (target) => {
      await deletionObjects.remove(target);
      throw Error("delete acknowledgement lost");
    },
    closeUpload: (target) => deletionObjects.closeUpload(target),
  };
  await lifecycle(uncertain).withdraw(token, withdrawal(2, id));
  assert.equal((await lifecycle().getLifecycle(token, id)).state, "deletion_pending");
  advance(900000);
  const fenceFail: IdentityPhotoDeletionStore = {
    inspectForDeletion: (target) => deletionObjects.inspectForDeletion(target),
    remove: (target) => deletionObjects.remove(target),
    closeUpload: async () => {
      called = true;
      throw Error("fence temporarily unavailable");
    },
  };
  assert.equal((await lifecycle(fenceFail).cleanupExpired()).failed, 1);
  assert.equal(called, true);
  advance(1800000);
  assert.equal((await lifecycle().cleanupExpired()).deleted, 1);
  await assertFenced(id);
});

test("Student soft deletion revokes and queues media in its existing transaction", async () => {
  const first = await makeService().enroll(token, request());
  const softDelete = new StudentSoftDeleteService({
    firestore,
    sessionSecurity: identitySessionSecurityService,
  });
  const body = {
    actorRole: "admin",
    actorId: "photo-soft-delete-admin",
    instituteId,
    studentId,
    expectedVersion: 2,
    idempotencyKey: "photo-soft-delete-command",
    reason: "owned zero-run deletion",
  };
  const result = await softDelete.softDeleteStudent(body);
  assert.equal(result.version, 3);
  await assert.rejects(lifecycle().getLifecycle(token, first.committedPhoto.photoId));
  assert.equal((await student.get()).get("identityPhotoId"), null);
  assert.equal((await student.get()).get("identityPhotoConsentState"), "withdrawn");
  const row = await photos.doc(first.committedPhoto.photoId).get();
  assert.equal(row.get("deletionReason"), "student_deleted");
  assert.equal(row.get("nextCleanupAt").toMillis(), row.get("deleteAfter").toMillis() - 86400000);
  now = row.get("nextCleanupAt");
  assert.equal((await lifecycle().cleanupExpired()).deleted, 1);
  await assertFenced(first.committedPhoto.photoId);
  await softDelete.softDeleteStudent(body);
  assert.equal((await student.get()).get("version"), 3);
});

test("an upload paused across stage expiry cannot land after completed cleanup", async () => {
  let resume: () => void = () => undefined;
  let staged: () => void = () => undefined;
  const ready = new Promise<void>((resolve) => {
    staged = resolve;
  });
  const wait = new Promise<void>((resolve) => {
    resume = resolve;
  });
  const body = request();
  const inFlight = makeService({
    ensure: async (target) => {
      staged();
      await wait;
      return objects.ensure(target);
    },
  }).enroll(token, body);
  // Attach rejection immediately so the runner never mistakes deliberate uncertainty for an unhandled promise.
  const rejected = assert.rejects(inFlight, denied("INTERNAL_ERROR"));
  await ready;
  const row = (await photos.get()).docs[0];
  advance(86400000);
  assert.equal((await lifecycle().cleanupExpired()).deleted, 1);
  resume();
  await rejected;
  await assertFenced(row.id);
  assert.equal((await student.get()).get("identityPhotoId"), undefined);
});

test("replacement during physical expiry deletion preserves the newer capture", async () => {
  const first = await makeService().enroll(token, request());
  advance(90 * 86400000);
  let newer = "";
  const replaceDuringRemoval: IdentityPhotoDeletionStore = {
    inspectForDeletion: (target) => deletionObjects.inspectForDeletion(target),
    remove: async (target) => {
      const next = await makeService().enroll(token, request(3, first.committedPhoto.photoId));
      newer = next.committedPhoto.photoId;
      await deletionObjects.remove(target);
    },
    closeUpload: (target) => deletionObjects.closeUpload(target),
  };
  assert.equal((await lifecycle(replaceDuringRemoval).cleanupExpired()).deleted, 1);
  await assertFenced(first.committedPhoto.photoId);
  assert.equal((await student.get()).get("identityPhotoId"), newer);
  assert.equal((await student.get()).get("version"), 4);
  const row = await photos.doc(newer).get();
  assert.equal(row.get("state"), "active");
  assert.ok((await bucket.file(row.get("objectPath")).download())[0].length > 0);
});

test("review and withdrawal contend on the Student version without resurrecting consent", async () => {
  const enrolled = await makeService().enroll(token, request());
  const admin = new AdminStudentMutationsService({
    firestore,
    now: clock,
    sessionSecurity: identitySessionSecurityService,
    updateAuthUser: async () => {
      throw Error("unused");
    },
  });
  const command = admin.normalizePhotoReviewRequest({
    actorId: "race-admin",
    actorRole: "admin",
    instituteId,
    studentId,
    body: {
      expectedVersion: 2,
      expectedPhotoId: enrolled.committedPhoto.photoId,
      expectedPhotoCapturedAt: enrolled.committedPhoto.capturedAt,
      decision: "verified",
      idempotencyKey: randomUUID(),
    },
  });
  const results = await Promise.allSettled([
    admin.reviewPhoto(command),
    lifecycle(pendingStore).withdraw(token, withdrawal(2, enrolled.committedPhoto.photoId)),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  if ((await student.get()).get("identityPhotoId") !== null) {
    await lifecycle().withdraw(token, withdrawal(3, enrolled.committedPhoto.photoId));
  }
  assert.equal((await student.get()).get("identityPhotoConsentState"), "withdrawn");
  assert.equal((await student.get()).get("identityPhotoVerified"), false);
  assert.equal((await student.get()).get("identityPhotoReviewedBy"), null);
});

test("one sweep reads at most 100 due records and never lists buckets or scans Students", async () => {
  const batch = firestore.batch();
  for (let index = 0; index < 101; index++) {
    batch.set(photos.doc(`photo_${index.toString(16).padStart(40, "0")}`), {
      state: "staged",
      nextCleanupAt: now,
    });
  }
  await batch.commit();
  const visited: string[] = [];
  class BoundedProbe extends StudentIdentityPhotoLifecycleService {
    public async cleanupPhoto(reference: FirebaseFirestore.DocumentReference): Promise<"skipped"> {
      visited.push(reference.path);
      return "skipped";
    }
  }
  const result = await new BoundedProbe({firestore, profiles, now: clock}).cleanupExpired();
  assert.equal(result.scanned, 100);
  assert.equal(visited.length, 100);
  assert.equal(new Set(visited).size, 100);
});


test("records actual Storage create-precondition support without claiming unsupported emulator semantics", async () => {
  const file = bucket.file(prefix + "conditional-write-capability-probe");
  await file.save(Buffer.from("before"), {resumable: false});
  let enforced = false;
  try {
    await file.save(Buffer.from("after"), {resumable: false, preconditionOpts: {ifGenerationMatch: 0}});
  } catch (error) {
    assert.equal((error as {code?: number}).code, 412);
    enforced = true;
  }
  const [actual] = await file.download();
  assert.equal(actual.toString(), enforced ? "before" : "after");
  console.info(`Storage emulator create-only precondition enforced: ${enforced}; ` +
    "real GCS qualification remains required.");
  await file.delete();
});

test("already-deleted Students with a retained managed photo get an audited versioned revocation", async () => {
  const first = await makeService().enroll(token, request());
  await student.update({deleted: true, status: "archived", deletedAt: now, deletedBy: "original-admin"});
  const service = new StudentSoftDeleteService({firestore, sessionSecurity: identitySessionSecurityService});
  const result = await service.softDeleteStudent({actorRole: "admin", actorId: "repair-admin", instituteId, studentId,
    expectedVersion: 2, idempotencyKey: "retained-managed-photo", reason: "complete media revocation"});
  assert.equal(result.alreadyDeleted, true);
  assert.equal(result.version, 3);
  assert.equal((await student.get()).get("deletedBy"), "original-admin");
  assert.equal((await student.get()).get("identityPhotoId"), null);
  assert.equal((await lifecycle().cleanupExpired()).deleted, 1);
  await assertFenced(first.committedPhoto.photoId);
});

test("withdrawal commits even when private Storage configuration is unavailable", async () => {
  const first = await makeService().enroll(token, request());
  delete process.env.IDENTITY_PHOTOS_BUCKET;
  try {
    const receipt = await lifecycle().withdraw(token, withdrawal(2, first.committedPhoto.photoId));
    assert.equal(receipt.disposition, "applied");
    assert.equal((await student.get()).get("identityPhotoId"), null);
    assert.equal((await lifecycle().getLifecycle(token, first.committedPhoto.photoId)).state, "deletion_pending");
  } finally {
    process.env.IDENTITY_PHOTOS_BUCKET = BUCKET;
  }
  advance(900000);
  assert.equal((await lifecycle().cleanupExpired()).deleted, 1);
  await assertFenced(first.committedPhoto.photoId);
});


test("withdrawal and replacement preserve the earlier deletion deadline of an expired capture", async () => {
  const first = await makeService().enroll(token, request());
  advance(92 * 86400000);
  await lifecycle(pendingStore).withdraw(token, withdrawal(2, first.committedPhoto.photoId));
  const old = await photos.doc(first.committedPhoto.photoId).get();
  assert.equal(old.get("deletionReason"), "retention_expired");
  assert.equal(old.get("deleteAfter").toMillis(), Date.parse(first.committedPhoto.expiresAt) + 86400000);
  assert.ok(old.get("deleteAfter").toMillis() < now.toMillis());
  const next = await makeService().enroll(token, request(3));
  advance(92 * 86400000);
  await makeService().enroll(token, request(4, next.committedPhoto.photoId));
  const replaced = await photos.doc(next.committedPhoto.photoId).get();
  assert.equal(replaced.get("deletionReason"), "retention_expired");
  assert.equal(replaced.get("deleteAfter").toMillis(), Date.parse(next.committedPhoto.expiresAt) + 86400000);
});

test("a late rejected upload preserves its elapsed stage-expiry deletion target", async () => {
  let photoId = "";
  const stagedAt = now.toMillis();
  await assert.rejects(makeService({ensure: async (target) => {
    photoId = target.metadata.photoId;
    advance(3 * 86400000);
    return objects.ensure(target);
  }}).enroll(token, request()), denied("CONFLICT"));
  const row = await photos.doc(photoId).get();
  assert.equal(row.get("deletionReason"), "staging_expired");
  assert.equal(row.get("deleteAfter").toMillis(), stagedAt + 2 * 86400000);
  assert.equal((await lifecycle().cleanupExpired()).deleted, 1);
  await assertFenced(photoId);
  assert.equal((await student.get()).get("version"), 1);
});
