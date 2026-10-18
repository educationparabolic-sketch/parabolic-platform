import {randomUUID} from "node:crypto";
import {Timestamp, FieldValue} from "firebase-admin/firestore";
import type {Auth} from "firebase-admin/auth";
import type {
  StudentIdentityPhotoEnrollRequest,
  StudentIdentityPhotoEnrollResult,
} from "../../../shared/contracts/studentProfile";
import {StudentProfileValidationError} from "../types/studentProfile";
import {getFirestore} from "../utils/firebaseAdmin";
import {queuePhotoDeletion} from "./studentIdentityPhotoLifecycleAuthority";
import {StudentProfileService, readStudentProfileVersion} from "./studentProfile";
import {STUDENT_IDENTITY_PHOTO_POLICY as POLICY} from "./studentIdentityPhotoPolicy";
import {
  normalizeIdentityPhotoEnrollment,
  normalizeIdentityPhotoImage,
  photoHash,
  photoRecord,
  NormalizedIdentityPhoto,
} from "./studentIdentityPhotoImage";
import {
  IdentityPhotoObjectStore,
  PrivateIdentityPhotoObjectStore,
  resolveIdentityPhotosBucket,
  identityPhotoConflict as conflict,
  identityPhotoInternal as internal,
} from "./studentIdentityPhotoStorage";

type Owner = { instituteId: string; studentId: string };
type Receipt = Omit<StudentIdentityPhotoEnrollResult, "disposition">;
interface Intent {
  request: StudentIdentityPhotoEnrollRequest;
  fingerprint: string;
  keyHash: string;
  photoId: string;
  auditId: string;
  owner: Owner;
}
interface Dependencies {
  firestore?: FirebaseFirestore.Firestore;
  auth?: Pick<Auth, "verifyIdToken" | "getUser">;
  now?: () => Timestamp;
  profiles?: StudentProfileService;
  objects?: IdentityPhotoObjectStore;
}
const SOURCE = "StudentIdentityPhotoService";
const CODEC = "sharp-0.35.5-v1";
const DAY = 86400000;
function keys(value: unknown, expected: string[]): asserts value is Record<string, unknown> {
  if (!photoRecord(value) || Object.keys(value).sort().join(",") !== [...expected].sort().join(",")) {
    internal("Enrollment receipt schema is malformed.");
  }
}
function iso(value: unknown): string {
  if (!(value instanceof Timestamp)) return internal("Photo time authority is malformed.");
  return value.toDate().toISOString();
}
function isIso(value: unknown): value is string {
  return (
    typeof value === "string" && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value
  );
}

/** Internal enrollment only. No HTTP, media read, withdrawal or purge worker. */
export class StudentIdentityPhotoService {
  private readonly firestore: FirebaseFirestore.Firestore;
  private readonly now: () => Timestamp;
  private readonly profiles: StudentProfileService;
  private readonly objects: IdentityPhotoObjectStore;
  constructor(dependencies: Dependencies = {}) {
    this.firestore = dependencies.firestore ?? getFirestore();
    this.now = dependencies.now ?? (() => Timestamp.now());
    this.profiles =
      dependencies.profiles ??
      new StudentProfileService({firestore: this.firestore, auth: dependencies.auth, now: this.now});
    this.objects = dependencies.objects ?? new PrivateIdentityPhotoObjectStore();
  }
  private institute(owner: Owner) {
    return this.firestore.collection("institutes").doc(owner.instituteId);
  }
  private photo(intent: Intent) {
    return this.institute(intent.owner).collection("identityPhotos").doc(intent.photoId);
  }
  private audit(intent: Intent) {
    return this.institute(intent.owner).collection("auditLogs").doc(intent.auditId);
  }
  private intent(owner: Owner, request: StudentIdentityPhotoEnrollRequest, inputSha256: string): Intent {
    const scope = [SOURCE, "enroll-v1", owner.instituteId, owner.studentId, owner.studentId];
    const keyHash = photoHash(JSON.stringify([...scope, request.idempotencyKey]));
    return {
      owner,
      request,
      keyHash,
      photoId: `photo_${keyHash.slice(0, 40)}`,
      auditId: `identity_photo_${keyHash.slice(0, 40)}`,
      fingerprint: photoHash(
        JSON.stringify([
          ...scope,
          request.expectedVersion,
          request.expectedPhotoId,
          request.consent.policyVersion,
          inputSha256,
        ]),
      ),
    };
  }
  private async receipt(transaction: FirebaseFirestore.Transaction, intent: Intent): Promise<Receipt | null> {
    const audit = await transaction.get(this.audit(intent));
    if (!audit.exists) return null;
    const metadata = audit.get("metadata");
    if (
      audit.get("actionType") !== "ENROLL_STUDENT_IDENTITY_PHOTO" ||
      audit.get("actorId") !== intent.owner.studentId ||
      audit.get("targetId") !== intent.owner.studentId ||
      audit.get("instituteId") !== intent.owner.instituteId ||
      !photoRecord(metadata) ||
      metadata.source !== SOURCE ||
      metadata.idempotencyKeyHash !== intent.keyHash ||
      typeof metadata.requestFingerprint !== "string" ||
      !/^[a-f0-9]{64}$/u.test(metadata.requestFingerprint)
    ) {
      return internal("Enrollment receipt authority is malformed.");
    }
    if (metadata.requestFingerprint !== intent.fingerprint) {
      return conflict("Command key has different enrollment intent.");
    }
    const result = metadata.result;
    keys(result, ["auditId", "version", "committedPhoto", "replacedPhotoId"]);
    keys(result.committedPhoto, ["photoId", "capturedAt", "expiresAt", "consentPolicyVersion"]);
    const photo = result.committedPhoto;
    if (
      result.auditId !== intent.auditId ||
      result.version !== intent.request.expectedVersion + 1 ||
      result.replacedPhotoId !== intent.request.expectedPhotoId ||
      photo.photoId !== intent.photoId ||
      photo.consentPolicyVersion !== POLICY.policyVersion ||
      !isIso(photo.capturedAt) ||
      !isIso(photo.expiresAt) ||
      photo.capturedAt !== iso(audit.get("timestamp")) ||
      Date.parse(photo.expiresAt) - Date.parse(photo.capturedAt) !== 90 * DAY
    ) {
      return internal("Enrollment receipt result is malformed.");
    }
    return {
      auditId: intent.auditId,
      version: Number(result.version),
      replacedPhotoId: intent.request.expectedPhotoId,
      committedPhoto: {
        photoId: intent.photoId,
        capturedAt: photo.capturedAt,
        expiresAt: photo.expiresAt,
        consentPolicyVersion: POLICY.policyVersion,
      },
    };
  }
  private expected(
    student: FirebaseFirestore.DocumentSnapshot,
    request: StudentIdentityPhotoEnrollRequest,
  ): number {
    const data = student.data() ?? internal("Student authority is missing.");
    const version = readStudentProfileVersion(data.version);
    const pointer = data.identityPhotoId ?? null;
    const consent = data.identityPhotoConsentState ?? "never_enrolled";
    if (
      (pointer !== null && (typeof pointer !== "string" || !/^photo_[a-f0-9]{40}$/u.test(pointer))) ||
      (pointer !== null ? consent !== "granted" : !["never_enrolled", "withdrawn"].includes(consent))
    ) {
      return internal("Student photo pointer authority is inconsistent.");
    }
    if (version !== request.expectedVersion || pointer !== request.expectedPhotoId) {
      return conflict("Student version or photo changed; reload before a new command.");
    }
    return version;
  }
  private path(intent: Intent): string {
    return (
      `identity-photos/${encodeURIComponent(intent.owner.instituteId)}/` +
      `${encodeURIComponent(intent.owner.studentId)}/${intent.photoId}.jpg`
    );
  }
  private validateStage(
    value: FirebaseFirestore.DocumentData,
    intent: Intent,
    image: NormalizedIdentityPhoto,
    bucket: string,
  ): void {
    if (
      value.schemaVersion !== 1 ||
      value.photoId !== intent.photoId ||
      value.studentId !== intent.owner.studentId ||
      value.studentUid !== intent.owner.studentId ||
      value.idempotencyKeyHash !== intent.keyHash ||
      value.requestFingerprint !== intent.fingerprint
    ) {
      return conflict("Upload key has different stage authority.");
    }
    if (
      value.state !== "staged" ||
      value.deletionLeaseId != null ||
      value.deletionLeaseUntil != null ||
      this.now().toMillis() - Date.parse(iso(value.stagedAt)) >= POLICY.stagingLifetimeHours * 3600000
    ) {
      return conflict("Upload stage is no longer eligible for commit.");
    }
    if (
      Date.parse(iso(value.stagedAt)) > this.now().toMillis() ||
      value.codecVersion !== CODEC ||
      value.expectedVersion !== intent.request.expectedVersion ||
      value.expectedPhotoId !== intent.request.expectedPhotoId ||
      value.bucketName !== bucket ||
      value.objectPath !== this.path(intent) ||
      value.sha256 !== image.sha256 ||
      value.sizeBytes !== image.bytes.length ||
      value.width !== image.width ||
      value.height !== image.height ||
      value.mediaType !== POLICY.mediaType ||
      value.consentPolicyVersion !== POLICY.policyVersion ||
      (value.generation !== null &&
        (typeof value.generation !== "string" || !/^[1-9][0-9]*$/u.test(value.generation)))
    ) {
      return internal("Stored upload stage is inconsistent.");
    }
  }
  private async reserve(
    idToken: string,
    intent: Intent,
    image: NormalizedIdentityPhoto,
    bucket: string,
  ): Promise<{ receipt: Receipt; stage: null } | { receipt: null; stage: FirebaseFirestore.DocumentData }> {
    return this.profiles.withOwnStudent(idToken, async (transaction, owner, student) => {
      if (owner.instituteId !== intent.owner.instituteId || owner.studentId !== intent.owner.studentId) {
        return conflict("Enrollment identity changed.");
      }
      const receipt = await this.receipt(transaction, intent);
      if (receipt) return {receipt, stage: null};
      this.expected(student, intent.request);
      const snapshot = await transaction.get(this.photo(intent));
      if (snapshot.exists) {
        const stage = snapshot.data() ?? internal("Stage authority is missing.");
        this.validateStage(stage, intent, image, bucket);
        return {receipt: null, stage};
      }
      const stagedAt = this.now();
      const cleanupAt = Timestamp.fromMillis(stagedAt.toMillis() + POLICY.stagingLifetimeHours * 3600000);
      const stage = {
        schemaVersion: 1,
        photoId: intent.photoId,
        studentId: owner.studentId,
        studentUid: owner.studentId,
        idempotencyKeyHash: intent.keyHash,
        requestFingerprint: intent.fingerprint,
        codecVersion: CODEC,
        expectedVersion: intent.request.expectedVersion,
        expectedPhotoId: intent.request.expectedPhotoId,
        state: "staged",
        stagedAt,
        committedAt: null,
        expiresAt: null,
        consentedAt: null,
        consentPolicyVersion: POLICY.policyVersion,
        bucketName: bucket,
        objectPath: this.path(intent),
        generation: null,
        mediaType: POLICY.mediaType,
        sizeBytes: image.bytes.length,
        width: image.width,
        height: image.height,
        sha256: image.sha256,
        deleteAfter: cleanupAt,
        nextCleanupAt: cleanupAt,
        deletedAt: null,
        deletionReason: null,
        deletionLeaseId: null,
        deletionLeaseUntil: null,
        recoveryState: "awaiting_upload",
      };
      transaction.create(this.photo(intent), stage);
      return {receipt: null, stage};
    });
  }
  private async commit(
    idToken: string,
    intent: Intent,
    image: NormalizedIdentityPhoto,
    bucket: string,
    generation: string,
  ): Promise<StudentIdentityPhotoEnrollResult> {
    return this.profiles.withOwnStudent(idToken, async (transaction, owner, student) => {
      if (owner.instituteId !== intent.owner.instituteId || owner.studentId !== intent.owner.studentId) {
        return conflict("Enrollment identity changed.");
      }
      const receipt = await this.receipt(transaction, intent);
      if (receipt) return {...receipt, disposition: "replayed"};
      const version = this.expected(student, intent.request);
      const snapshot = await transaction.get(this.photo(intent));
      const stage = snapshot.data() ?? internal("Upload stage is missing.");
      this.validateStage(stage, intent, image, bucket);
      if (stage.generation !== null && stage.generation !== generation) {
        return conflict("Photo generation changed.");
      }
      const oldId = intent.request.expectedPhotoId;
      const oldRef = oldId ? this.institute(owner).collection("identityPhotos").doc(oldId) : null;
      const old = oldRef ? (await transaction.get(oldRef)).data() : null;
      if (
        oldId &&
        (!old ||
          old.schemaVersion !== 1 ||
          old.studentId !== owner.studentId ||
          old.studentUid !== owner.studentId ||
          !["active", "deletion_pending", "deleting", "deleted"].includes(old.state))
      ) {
        return internal("Prior managed photo authority is malformed.");
      }
      const timestamp = this.now();
      const expiresAt = Timestamp.fromMillis(timestamp.toMillis() + POLICY.retentionDays * DAY);
      if (oldRef && old?.state === "active") {
        if (
          typeof old.generation !== "string" ||
          !/^[1-9][0-9]*$/u.test(old.generation) ||
          typeof old.bucketName !== "string" ||
          !old.bucketName ||
          old.objectPath !==
            `identity-photos/${encodeURIComponent(owner.instituteId)}/` +
              `${encodeURIComponent(owner.studentId)}/${oldId}.jpg`
        ) {
          return internal("Prior photo object authority is malformed.");
        }
        queuePhotoDeletion(transaction, oldRef, old, "replaced", timestamp);
      }
      const result: Receipt = {
        auditId: intent.auditId,
        version: version + 1,
        replacedPhotoId: oldId,
        committedPhoto: {
          photoId: intent.photoId,
          capturedAt: timestamp.toDate().toISOString(),
          expiresAt: expiresAt.toDate().toISOString(),
          consentPolicyVersion: POLICY.policyVersion,
        },
      };
      transaction.update(this.photo(intent), {
        state: "active",
        generation,
        committedAt: timestamp,
        consentedAt: timestamp,
        expiresAt,
        deleteAfter: expiresAt,
        nextCleanupAt: expiresAt,
        recoveryState: null,
      });
      transaction.update(student.ref, {
        identityPhotoId: intent.photoId,
        identityPhotoConsentState: "granted",
        identityPhotoConsentPolicyVersion: POLICY.policyVersion,
        identityPhotoConsentedAt: timestamp,
        identityPhotoCapturedAt: timestamp,
        identityPhotoExpiresAt: expiresAt,
        identityPhotoReviewDecision: null,
        identityPhotoReviewReason: null,
        identityPhotoReviewedAt: null,
        identityPhotoReviewedBy: null,
        identityPhotoVerified: false,
        livePhotoVerified: false,
        identityPhotoUrl: FieldValue.delete(),
        livePhotoUrl: FieldValue.delete(),
        livePhotoCapturedAt: FieldValue.delete(),
        version: result.version,
        updatedAt: timestamp,
        updatedBy: owner.studentId,
      });
      transaction.create(this.audit(intent), {
        actionType: "ENROLL_STUDENT_IDENTITY_PHOTO",
        actorId: owner.studentId,
        actorUid: owner.studentId,
        actorRole: "student",
        instituteId: owner.instituteId,
        tenantId: owner.instituteId,
        auditId: intent.auditId,
        entityType: "student",
        entityId: owner.studentId,
        targetCollection: "students",
        targetId: owner.studentId,
        layer: "L0",
        timestamp,
        before: {version, photoId: oldId},
        after: result,
        metadata: {
          source: SOURCE,
          idempotencyKeyHash: intent.keyHash,
          requestFingerprint: intent.fingerprint,
          result,
        },
      });
      return {...result, disposition: "applied"};
    });
  }
  // Record recoverable orphan authority, never delete bytes on a failed/unknown commit.
  private async noteFailure(
    intent: Intent,
    generation: string | undefined,
    rejected: boolean,
    originalStage: FirebaseFirestore.DocumentData,
  ): Promise<void> {
    await this.firestore.runTransaction(async (transaction) => {
      const receipt = await this.receipt(transaction, intent);
      const [photo, student] = await transaction.getAll(
        this.photo(intent),
        this.institute(intent.owner).collection("students").doc(intent.owner.studentId),
      );
      const stage = photo.data();
      if (
        receipt ||
        student.get("identityPhotoId") === intent.photoId ||
        !stage ||
        !["staged", "deletion_pending", "deleting", "deleted"].includes(stage.state) ||
        stage.studentUid !== intent.owner.studentId ||
        stage.studentId !== intent.owner.studentId ||
        stage.requestFingerprint !== intent.fingerprint ||
        stage.idempotencyKeyHash !== intent.keyHash ||
        (stage.generation != null && stage.generation !== generation)
      ) {
        return;
      }
      if (stage.state === "deleted" && stage.uploadClosed === true) return;
      if (stage.state !== "staged") {
        // A late/uncertain upload may finish after cleanup observed absence.
        // Restore only the original validated, uncommitted stage's private target.
        // An existing lease is retained; its compare-and-set cannot finalize a changed generation.
        if (stage.state === "deleted") {
          transaction.set(photo.ref, {...originalStage, generation: generation ?? null,
            state: "deletion_pending", deletionReason: stage.deletionReason,
            nextCleanupAt: this.now(), deletedAt: null, recoveryState: "late_upload",
            deleteAfter: this.now(), deletionLeaseId: null, deletionLeaseUntil: null});
        } else {
          transaction.update(photo.ref, {
            ...(generation ? {generation} : {}), recoveryState: "late_upload", uploadRecoveryNonce: randomUUID(),
          });
        }
        return;
      }
      if (stage.deletionLeaseId != null || stage.deletionLeaseUntil != null) return;
      transaction.update(photo.ref, {
        generation: generation ?? stage.generation,
        recoveryState: rejected ? "rejected" : generation ? "commit_unknown" : "upload_unknown",
      });
      if (rejected) queuePhotoDeletion(transaction, photo.ref, stage, "enrollment_rejected", this.now());
    });
  }
  public async enroll(idToken: string, body: unknown): Promise<StudentIdentityPhotoEnrollResult> {
    const normalized = normalizeIdentityPhotoEnrollment(body);
    const initial = await this.profiles.withOwnStudent(idToken, async (transaction, owner, student) => {
      const intent = this.intent(owner, normalized.request, normalized.inputSha256);
      const receipt = await this.receipt(transaction, intent);
      if (!receipt) this.expected(student, normalized.request);
      return {intent, receipt};
    });
    if (initial.receipt) return {...initial.receipt, disposition: "replayed"};
    const intent = initial.intent;
    const image = await normalizeIdentityPhotoImage(normalized.input);
    const bucket = resolveIdentityPhotosBucket();
    const reserved = await this.reserve(idToken, intent, image, bucket);
    if (reserved.receipt) return {...reserved.receipt, disposition: "replayed"};
    let generation: string | undefined;
    try {
      const object = await this.objects.ensure({
        bucketName: bucket,
        objectPath: this.path(intent),
        generation: reserved.stage.generation,
        bytes: image.bytes,
        metadata: {
          photoId: intent.photoId,
          instituteId: intent.owner.instituteId,
          studentId: intent.owner.studentId,
          studentUid: intent.owner.studentId,
          idempotencyKeyHash: intent.keyHash,
          requestFingerprint: intent.fingerprint,
          sha256: image.sha256,
        },
      });
      if (!/^[1-9][0-9]*$/u.test(object.generation)) return internal("Photo generation is unavailable.");
      generation = object.generation;
      return await this.commit(idToken, intent, image, bucket, generation);
    } catch (error) {
      // Reauthenticate before returning any recovered receipt. A failed read is
      // still uncertainty, never permission to delete a possibly installed image.
      const recovered = await this.profiles
        .withOwnStudent(idToken, async (transaction) => this.receipt(transaction, intent))
        .catch(() => null);
      if (recovered) return {...recovered, disposition: "replayed"};
      await this.noteFailure(
        intent,
        generation,
        error instanceof StudentProfileValidationError && error.code === "CONFLICT",
        reserved.stage,
      ).catch(() => undefined); // Original stage remains durable if reconciliation itself is unavailable.
      if (error instanceof StudentProfileValidationError) throw error;
      return internal("Photo enrollment completion is unknown; retry the original command.");
    }
  }
}
