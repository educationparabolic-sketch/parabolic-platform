import {randomUUID} from "node:crypto";
import type {Auth} from "firebase-admin/auth";
import {Timestamp} from "firebase-admin/firestore";
import type {
  StudentIdentityPhotoWithdrawRequest,
  StudentIdentityPhotoWithdrawResult,
  StudentIdentityPhotoLifecycleResult,
  StudentIdentityPhotoDeletionReason,
} from "../../../shared/contracts/studentProfile";
import {getFirestore} from "../utils/firebaseAdmin";
import {StudentProfileValidationError} from "../types/studentProfile";
import {StudentProfileService, readStudentProfileVersion} from "./studentProfile";
import {STUDENT_IDENTITY_PHOTO_POLICY as POLICY} from "./studentIdentityPhotoPolicy";
import {
  identityPhotoHash,
  photoOwner,
  photoTime,
  validPhotoId,
  photoLifecycleError as internal,
  currentManagedPhoto,
  queuePhotoDeletion,
  resetPhotoReview,
  withdrawPhotoFields,
} from "./studentIdentityPhotoLifecycleAuthority";
import {
  IdentityPhotoDeletionStore,
  IdentityPhotoDeletionTarget,
  PrivateIdentityPhotoDeletionStore,
  resolveIdentityPhotosBucket,
} from "./studentIdentityPhotoStorage";

const PUBLIC_REASONS: readonly string[] = [
  "replaced",
  "consent_withdrawn",
  "retention_expired",
  "student_deleted",
];
const REASONS = [...PUBLIC_REASONS, "staging_expired", "enrollment_rejected"];
const SOURCE = "StudentIdentityPhotoLifecycleService";
type Owner = { instituteId: string; studentId: string };
type Receipt = Omit<StudentIdentityPhotoWithdrawResult, "disposition">;
interface Dependencies {
  firestore?: FirebaseFirestore.Firestore;
  auth?: Pick<Auth, "verifyIdToken" | "getUser">;
  profiles?: StudentProfileService;
  now?: () => Timestamp;
  objects?: IdentityPhotoDeletionStore;
}
function fail(code: "VALIDATION_ERROR" | "CONFLICT" | "NOT_FOUND", message: string): never {
  throw new StudentProfileValidationError(code, message);
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exact(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  if (!record(value) || Object.keys(value).sort().join(",") !== [...keys].sort().join(",")) {
    return fail("VALIDATION_ERROR", "Withdrawal fields are missing or unsupported.");
  }
}
export function normalizeIdentityPhotoWithdrawal(body: unknown): StudentIdentityPhotoWithdrawRequest {
  exact(body, ["expectedVersion", "expectedPhotoId", "idempotencyKey"]);
  if (
    !Number.isSafeInteger(body.expectedVersion) ||
    Number(body.expectedVersion) < 1 ||
    Number(body.expectedVersion) >= Number.MAX_SAFE_INTEGER - 1 ||
    (body.expectedPhotoId !== null && !validPhotoId(body.expectedPhotoId)) ||
    typeof body.idempotencyKey !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(body.idempotencyKey)
  ) {
    return fail("VALIDATION_ERROR", "Withdrawal intent is invalid.");
  }
  return {
    expectedVersion: Number(body.expectedVersion),
    expectedPhotoId: body.expectedPhotoId,
    idempotencyKey: body.idempotencyKey,
  };
}
interface Claim {
  reference: FirebaseFirestore.DocumentReference;
  leaseId: string;
  value: FirebaseFirestore.DocumentData;
  owner: Owner;
  target: IdentityPhotoDeletionTarget;
}

// Internal commands and one shared bounded cleanup owner; no HTTP/media transport.
export class StudentIdentityPhotoLifecycleService {
  private readonly firestore: FirebaseFirestore.Firestore;
  private readonly profiles: StudentProfileService;
  private readonly now: () => Timestamp;
  private readonly objects: IdentityPhotoDeletionStore;
  constructor(dependencies: Dependencies = {}) {
    this.firestore = dependencies.firestore ?? getFirestore();
    this.now = dependencies.now ?? (() => Timestamp.now());
    this.profiles =
      dependencies.profiles ??
      new StudentProfileService({
        firestore: this.firestore,
        auth: dependencies.auth,
        now: this.now,
      });
    this.objects = dependencies.objects ?? new PrivateIdentityPhotoDeletionStore();
  }
  private institute(owner: Owner) {
    return this.firestore.collection("institutes").doc(owner.instituteId);
  }
  private withdrawalAuthority(owner: Owner, request: StudentIdentityPhotoWithdrawRequest) {
    const scope = [SOURCE, "withdraw-v1", owner.instituteId, owner.studentId];
    const keyHash = identityPhotoHash([...scope, request.idempotencyKey]);
    return {
      auditId: `identity_withdraw_${keyHash.slice(0, 40)}`,
      keyHash,
      fingerprint: identityPhotoHash([...scope, request.expectedVersion, request.expectedPhotoId]),
    };
  }
  private async withdrawalReceipt(
    transaction: FirebaseFirestore.Transaction,
    owner: Owner,
    request: StudentIdentityPhotoWithdrawRequest,
  ): Promise<Receipt | null> {
    const authority = this.withdrawalAuthority(owner, request);
    const audit = await transaction.get(this.institute(owner).collection("auditLogs").doc(authority.auditId));
    if (!audit.exists) return null;
    const metadata = audit.get("metadata");
    if (
      !record(metadata) ||
      metadata.source !== SOURCE ||
      metadata.idempotencyKeyHash !== authority.keyHash ||
      audit.get("actionType") !== "WITHDRAW_STUDENT_IDENTITY_PHOTO" ||
      audit.get("actorId") !== owner.studentId ||
      audit.get("targetId") !== owner.studentId ||
      audit.get("instituteId") !== owner.instituteId ||
      typeof metadata.requestFingerprint !== "string" ||
      !/^[a-f0-9]{64}$/u.test(metadata.requestFingerprint)
    ) {
      return internal("Withdrawal receipt authority is malformed.");
    }
    if (metadata.requestFingerprint !== authority.fingerprint) {
      return fail("CONFLICT", "Command key has different withdrawal intent.");
    }
    const result = metadata.result;
    if (
      !record(result) ||
      Object.keys(result).sort().join(",") !==
        ["auditId", "version", "withdrawnAt", "photoId", "accessRevoked"].sort().join(",") ||
      result.auditId !== authority.auditId ||
      result.version !== request.expectedVersion + 1 ||
      result.photoId !== request.expectedPhotoId ||
      result.accessRevoked !== true ||
      result.withdrawnAt !== photoTime(audit.get("timestamp")).toDate().toISOString()
    ) {
      return internal("Withdrawal receipt result is malformed.");
    }
    return {
      auditId: authority.auditId,
      version: Number(result.version),
      photoId: request.expectedPhotoId,
      withdrawnAt: String(result.withdrawnAt),
      accessRevoked: true,
    };
  }
  public async withdraw(idToken: string, body: unknown): Promise<StudentIdentityPhotoWithdrawResult> {
    const request = normalizeIdentityPhotoWithdrawal(body);
    const committed = await this.profiles.withOwnStudentPrivacy(
      idToken,
      async (transaction, owner, student) => {
        const receipt = await this.withdrawalReceipt(transaction, owner, request);
        if (receipt) return {owner, result: {...receipt, disposition: "replayed" as const}};
        const version = readStudentProfileVersion(student.get("version"));
        const pointer = student.get("identityPhotoId") ?? null;
        if (request.expectedVersion !== version || request.expectedPhotoId !== pointer) {
          return fail("CONFLICT", "Student version or photo changed; reload before a new command.");
        }
        const photo = await currentManagedPhoto(transaction, student);
        const timestamp = this.now();
        const authority = this.withdrawalAuthority(owner, request);
        const result: Receipt = {
          auditId: authority.auditId,
          version: version + 1,
          withdrawnAt: timestamp.toDate().toISOString(),
          photoId: pointer,
          accessRevoked: true,
        };
        if (photo) {
          queuePhotoDeletion(transaction, photo.reference, photo.value, "consent_withdrawn", timestamp);
        }
        transaction.update(student.ref, {
          ...withdrawPhotoFields(),
          version: result.version,
          updatedAt: timestamp,
          updatedBy: owner.studentId,
        });
        transaction.create(this.institute(owner).collection("auditLogs").doc(authority.auditId), {
          actionType: "WITHDRAW_STUDENT_IDENTITY_PHOTO",
          actorId: owner.studentId,
          actorUid: owner.studentId,
          actorRole: "student",
          instituteId: owner.instituteId,
          tenantId: owner.instituteId,
          targetId: owner.studentId,
          targetCollection: "students",
          entityType: "student",
          entityId: owner.studentId,
          auditId: authority.auditId,
          layer: "L0",
          timestamp,
          before: {version, photoId: pointer},
          after: result,
          metadata: {
            source: SOURCE,
            idempotencyKeyHash: authority.keyHash,
            requestFingerprint: authority.fingerprint,
            result,
          },
        });
        return {owner, result: {...result, disposition: "applied" as const}};
      },
    );
    if (committed.result.photoId) {
      // A provider failure leaves committed withdrawal and durable pending deletion, not false erasure.
      await this.cleanupPhoto(
        this.institute(committed.owner).collection("identityPhotos").doc(committed.result.photoId),
      );
    }
    return committed.result;
  }
  public async getLifecycle(idToken: string, photoId: unknown): Promise<StudentIdentityPhotoLifecycleResult> {
    if (!validPhotoId(photoId)) return fail("VALIDATION_ERROR", "Photo identifier is invalid.");
    return this.profiles.withOwnStudentPrivacy(idToken, async (transaction, owner, student) => {
      const reference = this.institute(owner).collection("identityPhotos").doc(photoId);
      const snapshot = await transaction.get(reference);
      const value = snapshot.data();
      if (
        !value ||
        value.studentId !== owner.studentId ||
        value.studentUid !== owner.studentId ||
        value.committedAt === null ||
        ["staged"].includes(value.state) ||
        ["staging_expired", "enrollment_rejected"].includes(value.deletionReason)
      ) {
        return fail("NOT_FOUND", "Own committed photo was not found.");
      }
      photoOwner(reference, value);
      if (value.state === "deleted") {
        if (value.uploadClosed !== true) return internal("Photo upload closure is unconfirmed.");
        if (!PUBLIC_REASONS.includes(value.deletionReason)) {
          return internal("Photo deletion reason is malformed.");
        }
        return {
          photoId,
          state: "deleted",
          deletionReason: value.deletionReason as StudentIdentityPhotoDeletionReason,
          deletedAt: photoTime(value.deletedAt).toDate().toISOString(),
        };
      }
      let reason = value.deletionReason;
      if (value.state === "active") {
        reason =
          student.get("deleted") === true ?
            "student_deleted" :
            photoTime(value.expiresAt).toMillis() <= this.now().toMillis() ?
              "retention_expired" :
              null;
        if (reason === null) {
          if (
            student.get("identityPhotoId") !== photoId ||
            student.get("identityPhotoConsentState") !== "granted"
          ) {
            return internal("Current photo lifecycle is inconsistent.");
          }
          return {photoId, state: "active", deletionReason: null, deletedAt: null};
        }
      } else if (!["deletion_pending", "deleting"].includes(value.state)) {
        return internal("Photo lifecycle state is malformed.");
      }
      if (!PUBLIC_REASONS.includes(reason)) return internal("Photo deletion reason is malformed.");
      return {
        photoId,
        state: "deletion_pending",
        deletionReason: reason as StudentIdentityPhotoDeletionReason,
        deletedAt: null,
      };
    });
  }
  private target(reference: FirebaseFirestore.DocumentReference, value: FirebaseFirestore.DocumentData) {
    const owner = photoOwner(reference, value);
    const path =
      `identity-photos/${encodeURIComponent(owner.instituteId)}/` +
      `${encodeURIComponent(owner.studentId)}/${reference.id}.jpg`;
    if (
      value.bucketName !== resolveIdentityPhotosBucket() ||
      value.objectPath !== path ||
      (value.generation !== null &&
        (typeof value.generation !== "string" || !/^[1-9][0-9]*$/u.test(value.generation))) ||
      value.mediaType !== POLICY.mediaType ||
      typeof value.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/u.test(value.sha256) ||
      !Number.isSafeInteger(value.sizeBytes) ||
      value.sizeBytes < 1 ||
      value.sizeBytes > POLICY.maxUploadBytes
    ) {
      return internal("Photo cleanup object authority is malformed.");
    }
    return {
      owner,
      target: {
        bucketName: value.bucketName as string,
        objectPath: path,
        generation: value.generation as string | null,
        sizeBytes: value.sizeBytes as number,
        metadata: {
          photoId: reference.id,
          instituteId: owner.instituteId,
          studentId: owner.studentId,
          studentUid: owner.studentId,
          idempotencyKeyHash: value.idempotencyKeyHash as string,
          requestFingerprint: value.requestFingerprint as string,
          sha256: value.sha256 as string,
        },
      },
    };
  }
  private async claim(reference: FirebaseFirestore.DocumentReference): Promise<Claim | null> {
    return this.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      const value = snapshot.data();
      if (!value || value.state === "deleted") return null;
      const {owner, target} = this.target(reference, value);
      const timestamp = this.now();
      if (photoTime(value.nextCleanupAt).toMillis() > timestamp.toMillis()) return null;
      if (
        value.state === "deleting" &&
        photoTime(value.deletionLeaseUntil).toMillis() > timestamp.toMillis()
      ) {
        return null;
      }
      const studentRef = this.institute(owner).collection("students").doc(owner.studentId);
      const student = await transaction.get(studentRef);
      const enrollmentAudit = await transaction.get(
        this.institute(owner)
          .collection("auditLogs")
          .doc(`identity_photo_${value.idempotencyKeyHash.slice(0, 40)}`),
      );
      let reason = value.deletionReason;
      let revokedAt = timestamp;
      if (value.state === "staged") {
        revokedAt = Timestamp.fromMillis(
          photoTime(value.stagedAt).toMillis() + POLICY.stagingLifetimeHours * 3600000,
        );
        if (revokedAt.toMillis() > timestamp.toMillis()) {
          transaction.update(reference, {nextCleanupAt: revokedAt});
          return null;
        }
        if (enrollmentAudit.exists || student.get("identityPhotoId") === reference.id) {
          return internal("Committed enrollment cannot be swept as a stage.");
        }
        reason = "staging_expired";
      } else if (value.state === "active") {
        revokedAt = photoTime(value.expiresAt);
        if (revokedAt.toMillis() > timestamp.toMillis()) {
          transaction.update(reference, {nextCleanupAt: revokedAt});
          return null;
        }
        reason = "retention_expired";
      } else if (!["deletion_pending", "deleting"].includes(value.state)) {
        return internal("Photo cleanup state is malformed.");
      }
      if (!REASONS.includes(reason)) return internal("Photo cleanup reason is malformed.");
      if (student.get("identityPhotoId") === reference.id && reason !== "retention_expired") {
        return internal("Current photo cannot be removed before access revocation.");
      }
      if (reason === "retention_expired" && student.get("identityPhotoId") === reference.id) {
        if (photoTime(student.get("identityPhotoExpiresAt")).toMillis() > timestamp.toMillis()) {
          return internal("Unexpired current photo cannot be removed.");
        }
        if (value.state === "active") {
          const version = readStudentProfileVersion(student.get("version"));
          if (version >= Number.MAX_SAFE_INTEGER - 1) return internal("Student version is exhausted.");
          transaction.update(studentRef, {
            ...resetPhotoReview(),
            version: version + 1,
            updatedAt: timestamp,
            updatedBy: "identity-photo-cleanup",
          });
        }
      }
      const leaseId = randomUUID();
      const until = Timestamp.fromMillis(timestamp.toMillis() + POLICY.cleanupLeaseSeconds * 1000);
      transaction.update(reference, {
        state: "deleting",
        deletionReason: reason,
        deletionLeaseId: leaseId,
        deletionLeaseUntil: until,
        nextCleanupAt: until,
        deleteAfter: ["active", "staged"].includes(value.state) ?
          Timestamp.fromMillis(revokedAt.toMillis() + POLICY.deletionTargetHours * 3600000) :
          value.deleteAfter,
      });
      return {reference, leaseId, value: {...value, deletionReason: reason}, owner, target};
    });
  }
  private async finish(claim: Claim, generation: string | null): Promise<boolean> {
    return this.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(claim.reference);
      const value = snapshot.data();
      if (
        !value ||
        value.state !== "deleting" ||
        value.deletionLeaseId !== claim.leaseId ||
        value.uploadRecoveryNonce !== claim.value.uploadRecoveryNonce ||
        value.generation !== generation ||
        value.requestFingerprint !== claim.value.requestFingerprint
      ) {
        return false;
      }
      const student = await transaction.get(
        this.institute(claim.owner).collection("students").doc(claim.owner.studentId),
      );
      if (
        student.get("identityPhotoId") === claim.reference.id &&
        (value.deletionReason !== "retention_expired" ||
          photoTime(student.get("identityPhotoExpiresAt")).toMillis() > this.now().toMillis())
      ) {
        return false;
      }
      const auditId = `identity_delete_${identityPhotoHash([
        claim.owner.instituteId,
        claim.reference.id,
        value.deletionReason,
        generation,
      ]).slice(0, 40)}`;
      const auditRef = this.institute(claim.owner).collection("auditLogs").doc(auditId);
      const audit = await transaction.get(auditRef);
      const timestamp = audit.exists ? photoTime(audit.get("timestamp")) : this.now();
      if (
        audit.exists &&
        (audit.get("targetId") !== claim.reference.id ||
          audit.get("actionType") !== "DELETE_STUDENT_IDENTITY_PHOTO" ||
          audit.get("instituteId") !== claim.owner.instituteId ||
          audit.get("metadata.source") !== SOURCE ||
          audit.get("metadata.studentId") !== claim.owner.studentId ||
          audit.get("metadata.deletionReason") !== value.deletionReason ||
          audit.get("metadata.objectRemovalConfirmed") !== true ||
          timestamp.toMillis() > this.now().toMillis())
      ) {
        return internal("Deletion audit authority is malformed.");
      }
      if (!audit.exists) {
        transaction.create(auditRef, {
          actionType: "DELETE_STUDENT_IDENTITY_PHOTO",
          actorId: "identity-photo-cleanup",
          actorRole: "system",
          instituteId: claim.owner.instituteId,
          tenantId: claim.owner.instituteId,
          targetId: claim.reference.id,
          targetCollection: "identityPhotos",
          timestamp,
          metadata: {
            source: SOURCE,
            photoId: claim.reference.id,
            studentId: claim.owner.studentId,
            deletionReason: value.deletionReason,
            objectRemovalConfirmed: true,
          },
        });
      }
      // Replace, rather than merge, so image coordinates/integrity/staging/leases cannot survive.
      transaction.set(claim.reference, {
        schemaVersion: 1,
        photoId: claim.reference.id,
        studentId: claim.owner.studentId,
        studentUid: claim.owner.studentId,
        idempotencyKeyHash: value.idempotencyKeyHash,
        requestFingerprint: value.requestFingerprint,
        state: "deleted",
        uploadClosed: true,
        deletionReason: value.deletionReason,
        deletedAt: timestamp,
        deletionAuditId: auditId,
      });
      return true;
    });
  }
  public async cleanupPhoto(
    reference: FirebaseFirestore.DocumentReference,
  ): Promise<"deleted" | "skipped" | "failed"> {
    let claim: Claim | null = null;
    try {
      claim = await this.claim(reference);
      if (!claim) return "skipped";
      const inspected = await this.objects.inspectForDeletion(claim.target);
      const generation = inspected ?? claim.target.generation;
      const bound = await this.firestore.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(reference);
        if (
          snapshot.get("state") !== "deleting" ||
          snapshot.get("deletionLeaseId") !== claim?.leaseId ||
          snapshot.get("uploadRecoveryNonce") !== claim?.value.uploadRecoveryNonce ||
          snapshot.get("generation") !== claim?.target.generation
        ) {
          return false;
        }
        transaction.update(reference, {generation});
        return true;
      });
      if (!bound) return "skipped";
      if (inspected !== null) await this.objects.remove({...claim.target, generation: inspected});
      const removed = await this.firestore.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(reference);
        if (
          snapshot.get("state") !== "deleting" ||
          snapshot.get("deletionLeaseId") !== claim?.leaseId ||
          snapshot.get("generation") !== generation
        ) {
          return false;
        }
        transaction.update(reference, {generation: null, recoveryState: "closing_upload"});
        return true;
      });
      if (!removed) return "skipped";
      await this.objects.closeUpload({...claim.target, generation: null});
      return (await this.finish(claim, null)) ? "deleted" : "skipped";
    } catch {
      // Keep failures retryable and sanitized; do not stop unrelated targets or claim erasure.
      if (!claim && /^institutes\/[^/]+\/identityPhotos\/photo_[a-f0-9]{40}$/u.test(reference.path)) {
        await this.firestore
          .runTransaction(async (transaction) => {
            const snapshot = await transaction.get(reference);
            if (
              snapshot.exists &&
              snapshot.get("state") !== "deleted" &&
              snapshot.get("deletionLeaseId") == null &&
              photoTime(snapshot.get("nextCleanupAt")).toMillis() <= this.now().toMillis()
            ) {
              transaction.update(reference, {
                lastCleanupErrorCode: "PHOTO_AUTHORITY_UNAVAILABLE",
                nextCleanupAt: Timestamp.fromMillis(
                  this.now().toMillis() + POLICY.cleanupIntervalMinutes * 60000,
                ),
              });
            }
          })
          .catch(() => undefined);
      }
      if (claim) {
        await this.firestore
          .runTransaction(async (transaction) => {
            const snapshot = await transaction.get(reference);
            if (snapshot.get("state") !== "deleting" || snapshot.get("deletionLeaseId") !== claim?.leaseId) {
              return;
            }
            const previous = snapshot.get("cleanupAttempts");
            const attempts =
              Number.isSafeInteger(previous) && previous >= 0 ? Math.min(1000000, previous + 1) : 1;
            const delay = Math.min(
              3600000,
              POLICY.cleanupIntervalMinutes * 60000 * 2 ** Math.min(attempts - 1, 2),
            );
            transaction.update(reference, {
              state: "deletion_pending",
              deletionLeaseId: null,
              deletionLeaseUntil: null,
              cleanupAttempts: attempts,
              lastCleanupErrorCode: "OBJECT_REMOVAL_UNCONFIRMED",
              nextCleanupAt: Timestamp.fromMillis(this.now().toMillis() + delay),
            });
          })
          .catch(() => undefined);
      }
      return "failed";
    }
  }
  public async cleanupExpired(): Promise<{
    scanned: number;
    deleted: number;
    skipped: number;
    failed: number;
  }> {
    const due = await this.firestore
      .collectionGroup("identityPhotos")
      .where("nextCleanupAt", "<=", this.now())
      .orderBy("nextCleanupAt", "asc")
      .limit(POLICY.cleanupBatchLimit)
      .get();
    const result = {scanned: due.size, deleted: 0, skipped: 0, failed: 0};
    for (const row of due.docs) result[await this.cleanupPhoto(row.ref)]++;
    return result;
  }
}
