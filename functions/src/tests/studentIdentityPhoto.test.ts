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
} from "../services/studentIdentityPhotoStorage";
import {StudentProfileService} from "../services/studentProfile";
import {StudentProfileValidationError} from "../types/studentProfile";
import {identitySessionSecurityService} from "../services/identitySessionSecurity";
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
const instituteId = "inst-bwm042-photo";
const studentId = "student-bwm042-photo";
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
  await auth.createUser({uid: studentId, email: "photo-bwm042@emulator.test", password});
  await auth.setCustomUserClaims(studentId, claims);
  const response = await fetch(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/` +
      "v1/accounts:signInWithPassword?key=demo",
    {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({email: "photo-bwm042@emulator.test", password, returnSecureToken: true}),
    },
  );
  assert.equal(response.status, 200);
  return ((await response.json()) as { idToken: string }).idToken;
}
async function listed() {
  return (await bucket.getFiles({prefix}))[0];
}
async function photoRow() {
  const snapshot = await photos.get();
  assert.equal(snapshot.size, 1);
  return snapshot.docs[0];
}
async function unchanged() {
  assert.equal((await student.get()).get("version"), 1);
  assert.equal((await student.get()).get("identityPhotoId"), undefined);
  assert.equal((await audits.get()).size, 0);
}
test.beforeEach(async () => {
  await firestore.recursiveDelete(institute);
  await bucket.deleteFiles({prefix});
  now = Timestamp.fromDate(new Date("2026-10-16T10:00:00Z"));
  await institute.set({status: "active", licenseVersion: claims.licenseVersion, authorizationVersion: 1});
  await institute
    .collection("license")
    .doc("current")
    .set({
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

test("enrollment is private, normalized, generation-bound, audited and truthful after fresh reads", async () => {
  const body = request();
  const result = await makeService().enroll(token, body);
  assert.equal(result.disposition, "applied");
  assert.equal(result.version, 2);
  assert.equal(result.replacedPhotoId, null);
  const row = await photoRow();
  assert.equal(row.get("state"), "active");
  const file = bucket.file(row.get("objectPath"));
  const [[stored], [metadata]] = await Promise.all([file.download(), file.getMetadata()]);
  assert.equal(metadata.generation, row.get("generation"));
  assert.equal(metadata.cacheControl, "private, max-age=0, no-store");
  assert.equal(metadata.metadata?.firebaseStorageDownloadTokens, undefined);
  assert.equal((await sharp(stored).metadata()).exif, undefined);
  assert.ok(!stored.includes(Buffer.from("private-source-metadata")));
  assert.equal(row.get("expiresAt").toMillis() - now.toMillis(), 90 * 86400000);
  const profile = await new StudentProfileService({firestore, auth, now: clock}).getProfile(token);
  assert.equal(profile.identityPhoto.status, "pending_review");
  assert.equal(profile.preferences.sidebarCollapsed, true);
  const persisted = JSON.stringify((await audits.doc(result.auditId).get()).data());
  for (const blocked of [
    body.idempotencyKey,
    body.contentBase64,
    token,
    "bucketName",
    "objectPath",
    "private-source-metadata",
  ]) {
    assert.ok(!persisted.includes(blocked), blocked.slice(0, 30));
  }
  const response = await fetch(
    `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}/v0/b/${BUCKET}/o/` +
      `${encodeURIComponent(row.get("objectPath"))}?alt=media`,
    {headers: {authorization: `Bearer ${token}`}},
  );
  assert.ok([401, 403].includes(response.status));
});

test("replacement resets review, queues the old generation and defeats stale Admin review", async () => {
  const first = await makeService().enroll(token, request());
  const admin = new AdminStudentMutationsService({
    firestore,
    now: clock,
    sessionSecurity: identitySessionSecurityService,
    updateAuthUser: async (uid, input) => {
      await auth.updateUser(uid, input);
    },
  });
  const review = admin.normalizePhotoReviewRequest({
    actorId: "photo-review-admin",
    actorRole: "admin",
    instituteId,
    studentId,
    body: {
      decision: "verified",
      expectedVersion: 2,
      idempotencyKey: randomUUID(),
      expectedPhotoId: first.committedPhoto.photoId,
      expectedPhotoCapturedAt: first.committedPhoto.capturedAt,
    },
  });
  await admin.reviewPhoto(review);
  assert.equal((await profiles.getProfile(token)).identityPhoto.status, "verified");
  await student.update({
    identityPhotoUrl: "https://old.invalid/raw",
    livePhotoUrl: "https://old.invalid/raw",
  });
  now = Timestamp.fromMillis(now.toMillis() + 60000);
  const second = await makeService().enroll(token, request(3, first.committedPhoto.photoId));
  assert.equal(second.version, 4);
  assert.equal(second.replacedPhotoId, first.committedPhoto.photoId);
  assert.equal((await profiles.getProfile(token)).identityPhoto.status, "pending_review");
  const data = (await student.get()).data() ?? assert.fail("Student missing");
  assert.equal(data.identityPhotoVerified, false);
  assert.equal(data.livePhotoVerified, false);
  assert.equal(data.identityPhotoReviewedBy, null);
  assert.equal(data.identityPhotoUrl, undefined);
  assert.equal(data.livePhotoUrl, undefined);
  const old = await photos.doc(first.committedPhoto.photoId).get();
  assert.equal(old.get("state"), "deletion_pending");
  assert.equal(old.get("deletionReason"), "replaced");
  assert.equal(old.get("deleteAfter").toMillis(), now.toMillis() + 24 * 3600000);
  assert.ok(old.get("generation"));
  assert.equal((await listed()).length, 2); // Physical purge is the next ordered substep.
  await assert.rejects(
    admin.reviewPhoto({...review, idempotencyKey: randomUUID()}),
    (error: unknown) => (error as { code?: string }).code === "CONFLICT",
  );
  assert.deepEqual(
    await makeService()
      .enroll(token, {...request(), idempotencyKey: "00000000-0000-4000-8000-000000000001"})
      .catch((error: unknown) => (error as { code?: string }).code),
    "CONFLICT",
  );
});

test("same-key retries converge; changed intent and stale competing writers conflict", async () => {
  const body = request();
  const results = await Promise.all([makeService().enroll(token, body), makeService().enroll(token, body)]);
  assert.deepEqual(results.map((result) => result.disposition).sort(), ["applied", "replayed"]);
  assert.equal((await listed()).length, 1);
  assert.equal((await audits.get()).size, 1);
  assert.equal((await student.get()).get("version"), 2);
  await assert.rejects(makeService().enroll(token, {...body, expectedVersion: 2}), denied("CONFLICT"));
  const target = results[0].committedPhoto.photoId;
  const competing = await Promise.allSettled([
    makeService().enroll(token, request(2, target)),
    makeService().enroll(token, request(2, target)),
  ]);
  assert.equal(competing.filter(({status}) => status === "fulfilled").length, 1);
  for (const result of competing) if (result.status === "rejected") denied("CONFLICT")(result.reason);
  assert.equal((await student.get()).get("version"), 3);
  assert.equal((await audits.get()).size, 2);
  const states = (await photos.get()).docs.map((row) => row.get("state"));
  assert.equal(states.filter((state) => state === "active").length, 1);
});

test("failed and uncertain uploads retain the stage and recover the original command", async () => {
  const body = request();
  await assert.rejects(
    makeService({
      ensure: async () => {
        throw new Error("private-provider-detail");
      },
    }).enroll(token, body),
    denied("INTERNAL_ERROR"),
  );
  await unchanged();
  assert.equal((await photoRow()).get("recoveryState"), "upload_unknown");
  assert.equal((await listed()).length, 0);
  await assert.rejects(
    makeService({
      ensure: async (target) => {
        await objects.ensure(target);
        throw new Error("lost upload acknowledgement");
      },
    }).enroll(token, body),
    denied("INTERNAL_ERROR"),
  );
  await unchanged();
  const [file] = await listed();
  const [before] = await file.getMetadata();
  now = Timestamp.fromMillis(now.toMillis() + 60000);
  const recovered = await makeService().enroll(token, body);
  assert.equal(recovered.disposition, "applied");
  assert.equal(recovered.committedPhoto.capturedAt, now.toDate().toISOString());
  assert.equal((await file.getMetadata())[0].generation, before.generation);
  assert.equal((await listed()).length, 1);
});

test("lost commit acknowledgement recovers historical authority without re-enrollment", async () => {
  let lost = false;
  const losing = new Proxy(profiles, {
    get(target, key) {
      if (key === "withOwnStudent") {
        return async (...args: Parameters<StudentProfileService["withOwnStudent"]>) => {
          const result = await target.withOwnStudent(...args);
          if (
            !lost &&
            typeof result === "object" &&
            result !== null &&
            "disposition" in result &&
            result.disposition === "applied"
          ) {
            lost = true;
            throw new Error("lost commit acknowledgement");
          }
          return result;
        };
      }
      return Reflect.get(target, key, target);
    },
  });
  const body = request();
  const recovered = await makeService(objects, losing).enroll(token, body);
  assert.equal(recovered.disposition, "replayed");
  assert.equal((await student.get()).get("version"), 2);
  assert.equal((await audits.get()).size, 1);
  const row = await photoRow();
  const originalGeneration = row.get("generation");
  await makeService().enroll(token, request(2, recovered.committedPhoto.photoId));
  const historical = await makeService().enroll(token, body);
  assert.deepEqual(historical, recovered);
  assert.equal((await student.get()).get("version"), 3);
  assert.equal(
    (await photos.doc(recovered.committedPhoto.photoId).get()).get("generation"),
    originalGeneration,
  );
});

test("unavailable commit reconciliation preserves uncertainty until exact receipt replay", async () => {
  let committed = false;
  const unavailable = new Proxy(profiles, {
    get(target, key) {
      if (key === "withOwnStudent") {
        return async (...args: Parameters<StudentProfileService["withOwnStudent"]>) => {
          if (committed) throw new Error("receipt lookup unavailable");
          const result = await target.withOwnStudent(...args);
          if (
            typeof result === "object" &&
            result !== null &&
            "disposition" in result &&
            result.disposition === "applied"
          ) {
            committed = true;
            throw new Error("commit response unavailable");
          }
          return result;
        };
      }
      return Reflect.get(target, key, target);
    },
  });
  const body = request();
  await assert.rejects(makeService(objects, unavailable).enroll(token, body), denied("INTERNAL_ERROR"));
  const row = await photoRow();
  assert.equal(row.get("state"), "active");
  const originalGeneration = row.get("generation");
  const recovered = await makeService().enroll(token, body);
  assert.equal(recovered.disposition, "replayed");
  assert.equal((await photos.doc(row.id).get()).get("generation"), originalGeneration);
  assert.equal((await listed()).length, 1);
});

test("changed current Auth after upload prevents commit and replay; restored authority can resume", async () => {
  const body = request();
  const store = {
    ensure: async (target: IdentityPhotoObjectTarget) => {
      const result = await objects.ensure(target);
      await auth.setCustomUserClaims(studentId, {...claims, role: "admin"});
      return result;
    },
  };
  await assert.rejects(makeService(store).enroll(token, body), denied("FORBIDDEN"));
  await unchanged();
  assert.equal((await photoRow()).get("state"), "staged");
  assert.ok((await photoRow()).get("generation"));
  await auth.setCustomUserClaims(studentId, claims);
  const recovered = await makeService().enroll(token, body);
  assert.equal(recovered.disposition, "applied");
  await auth.updateUser(studentId, {disabled: true});
  await assert.rejects(makeService().enroll(token, body), denied("UNAUTHORIZED"));
  assert.equal((await audits.get()).size, 1);
});

test("preference races retain rejected orphan authority without granting enrollment", async () => {
  const body = request();
  const store = {
    ensure: async (target: IdentityPhotoObjectTarget) => {
      const result = await objects.ensure(target);
      await profiles.updatePreferences(token, {
        expectedVersion: 1,
        idempotencyKey: randomUUID(),
        preferences: {sidebarCollapsed: false},
      });
      return result;
    },
  };
  await assert.rejects(makeService(store).enroll(token, body), denied("CONFLICT"));
  assert.equal((await student.get()).get("identityPhotoId"), undefined);
  assert.equal((await student.get()).get("version"), 2);
  const row = await photoRow();
  assert.equal(row.get("state"), "deletion_pending");
  assert.equal(row.get("deletionReason"), "enrollment_rejected");
  assert.ok(row.get("generation"));
  assert.equal((await listed()).length, 1);
  assert.equal((await audits.where("actionType", "==", "ENROLL_STUDENT_IDENTITY_PHOTO").get()).size, 0);
});

test("stage expiry and cleanup ownership defeat a late commit without touching another generation", async () => {
  const body = request();
  const store = {
    ensure: async (target: IdentityPhotoObjectTarget) => {
      const result = await objects.ensure(target);
      await photos
        .doc(target.metadata.photoId)
        .update({
          state: "deleting",
          generation: result.generation,
          deletionLeaseId: randomUUID(),
          deletionLeaseUntil: Timestamp.fromMillis(now.toMillis() + 300000),
        });
      return result;
    },
  };
  await assert.rejects(makeService(store).enroll(token, body), denied("CONFLICT"));
  await unchanged();
  assert.equal((await photoRow()).get("state"), "deleting");
  assert.equal((await listed()).length, 1);
  await assert.rejects(makeService().enroll(token, body), denied("CONFLICT"));
  await firestore.recursiveDelete(photos);
  await bucket.deleteFiles({prefix});
  const delayed = {
    ensure: async (target: IdentityPhotoObjectTarget) => {
      const result = await objects.ensure(target);
      now = Timestamp.fromMillis(now.toMillis() + 24 * 3600000);
      return result;
    },
  };
  await assert.rejects(makeService(delayed).enroll(token, request()), denied("CONFLICT"));
  await unchanged();
  assert.equal((await photoRow()).get("state"), "deletion_pending");
});

test("foreign bytes and corrupt receipts cannot authorize overwrite or replay", async () => {
  const body = request();
  const bad = {
    ensure: async (target: IdentityPhotoObjectTarget) => {
      await bucket.file(target.objectPath).save(Buffer.from("foreign-object"), {resumable: false});
      return objects.ensure(target);
    },
  };
  await assert.rejects(makeService(bad).enroll(token, body), denied("INTERNAL_ERROR"));
  await unchanged();
  const [foreign] = await listed();
  assert.equal((await foreign.download())[0].toString(), "foreign-object");
  await bucket.deleteFiles({prefix});
  const result = await makeService().enroll(token, body);
  await audits.doc(result.auditId).update({"metadata.result.version": 99});
  await assert.rejects(makeService().enroll(token, body), denied("INTERNAL_ERROR"));
  assert.equal((await student.get()).get("version"), 2);
  assert.equal((await photoRow()).get("state"), "active");
});

test("invalid consent/image/identity causes no stage, object, Student or audit mutation", async () => {
  const body = request();
  await assert.rejects(
    makeService().enroll(token, {...body, consent: {...body.consent, accepted: false}}),
    denied("VALIDATION_ERROR"),
  );
  await assert.rejects(
    makeService().enroll(token, {...body, contentBase64: Buffer.from("not-a-jpeg").toString("base64")}),
    denied("VALIDATION_ERROR"),
  );
  await assert.rejects(makeService().enroll("bad-token", body), denied("UNAUTHORIZED"));
  await auth.setCustomUserClaims(studentId, {...claims, instituteId: "other-institute"});
  await assert.rejects(makeService().enroll(token, body), denied("FORBIDDEN"));
  await unchanged();
  assert.equal((await photos.get()).size, 0);
  assert.equal((await listed()).length, 0);
});


test("a changed or missing bound generation cannot be recreated or committed", async () => {
  const body = request();
  const store = {
    ensure: async (target: IdentityPhotoObjectTarget) => {
      const result = await objects.ensure(target);
      await auth.setCustomUserClaims(studentId, {...claims, role: "teacher"});
      return result;
    },
  };
  await assert.rejects(makeService(store).enroll(token, body), denied("FORBIDDEN"));
  await auth.setCustomUserClaims(studentId, claims);
  const row = await photoRow();
  const file = bucket.file(row.get("objectPath"));
  const [[original], [metadata]] = await Promise.all([file.download(), file.getMetadata()]);
  await file.save(original, {resumable: false, contentType: "image/jpeg", metadata: {
    cacheControl: metadata.cacheControl, metadata: metadata.metadata,
  }});
  assert.notEqual((await file.getMetadata())[0].generation, row.get("generation"));
  await assert.rejects(makeService().enroll(token, body), denied("INTERNAL_ERROR"));
  await unchanged();
  await file.delete();
  await assert.rejects(makeService().enroll(token, body), denied("CONFLICT"));
  await unchanged();
  assert.equal((await listed()).length, 0);
});
