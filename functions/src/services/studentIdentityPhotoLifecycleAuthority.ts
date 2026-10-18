import {createHash} from "node:crypto";
import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {StudentProfileValidationError} from "../types/studentProfile";
import {STUDENT_IDENTITY_PHOTO_POLICY as POLICY} from "./studentIdentityPhotoPolicy";

export const identityPhotoHash = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const validPhotoId = (value: unknown): value is string =>
  typeof value === "string" && /^photo_[a-f0-9]{40}$/u.test(value);
export function photoLifecycleError(message: string): never {
  throw new StudentProfileValidationError("INTERNAL_ERROR", message);
}
// Shared by projections and review; malformed account aliases/deletion flags
// cannot grant media or review merely because they are not the boolean true.
export function assertPhotoStudentBinding(data: FirebaseFirestore.DocumentData, studentId: string): void {
  if ((data.deleted !== undefined && typeof data.deleted !== "boolean") ||
      (data.studentId !== undefined && data.studentId !== studentId)) {
    photoLifecycleError("Student photo authority is malformed.");
  }
}
export function photoTime(value: unknown): Timestamp {
  return value instanceof Timestamp ? value : photoLifecycleError("Photo lifecycle time is malformed.");
}
export function photoOwner(
  reference: FirebaseFirestore.DocumentReference,
  value: FirebaseFirestore.DocumentData,
) {
  const parts = reference.path.split("/");
  if (
    parts.length !== 4 ||
    parts[0] !== "institutes" ||
    parts[2] !== "identityPhotos" ||
    !validPhotoId(parts[3]) ||
    value.schemaVersion !== 1 ||
    value.photoId !== reference.id ||
    typeof value.studentId !== "string" ||
    !value.studentId ||
    value.studentId.length > 128 ||
    [".", ".."].includes(value.studentId) ||
    value.studentId.includes("/") ||
    value.studentUid !== value.studentId ||
    !/^[a-f0-9]{64}$/u.test(value.idempotencyKeyHash) ||
    !/^[a-f0-9]{64}$/u.test(value.requestFingerprint)
  ) {
    return photoLifecycleError("Photo lifecycle ownership is malformed.");
  }
  return {instituteId: parts[1], studentId: value.studentId as string};
}
export function resetPhotoReview(): FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> {
  return {
    identityPhotoReviewDecision: null,
    identityPhotoReviewReason: null,
    identityPhotoReviewedAt: null,
    identityPhotoReviewedBy: null,
    identityPhotoVerified: false,
    livePhotoVerified: false,
    identityPhotoUrl: FieldValue.delete(),
    livePhotoUrl: FieldValue.delete(),
    livePhotoCapturedAt: FieldValue.delete(),
  };
}
export function withdrawPhotoFields() {
  return {
    ...resetPhotoReview(),
    identityPhotoId: null,
    identityPhotoConsentState: "withdrawn",
    identityPhotoConsentPolicyVersion: null,
    identityPhotoConsentedAt: null,
    identityPhotoCapturedAt: null,
    identityPhotoExpiresAt: null,
  };
}
export async function currentManagedPhoto(
  transaction: FirebaseFirestore.Transaction,
  student: FirebaseFirestore.DocumentSnapshot,
) {
  const pointer = student.get("identityPhotoId") ?? null;
  if (pointer === null) return null;
  if (!validPhotoId(pointer)) return photoLifecycleError("Student photo pointer is malformed.");
  const institute = student.ref.parent.parent;
  if (!institute) return photoLifecycleError("Student photo scope is malformed.");
  const reference = institute.collection("identityPhotos").doc(pointer);
  const snapshot = await transaction.get(reference);
  const value = snapshot.data() ?? photoLifecycleError("Managed photo authority is missing.");
  const owner = photoOwner(reference, value);
  if (
    owner.studentId !== student.id ||
    !["active", "deletion_pending", "deleting", "deleted"].includes(value.state)
  ) {
    return photoLifecycleError("Managed photo authority is inconsistent.");
  }
  return {reference, value};
}
export function queuePhotoDeletion(
  transaction: FirebaseFirestore.Transaction,
  reference: FirebaseFirestore.DocumentReference,
  value: FirebaseFirestore.DocumentData,
  reason: string,
  timestamp: Timestamp,
): void {
  if (["deleted", "deleting", "deletion_pending"].includes(value.state)) return;
  const expiry = value.state === "active" ? photoTime(value.expiresAt) :
    value.state === "staged" ?
      Timestamp.fromMillis(photoTime(value.stagedAt).toMillis() + POLICY.stagingLifetimeHours * 3600000) : null;
  const alreadyExpired = expiry !== null && expiry.toMillis() <= timestamp.toMillis();
  const revokedAt = expiry !== null && alreadyExpired ? expiry : timestamp;
  transaction.update(reference, {
    state: "deletion_pending",
    deletionReason: alreadyExpired ? value.state === "staged" ? "staging_expired" : "retention_expired" : reason,
    nextCleanupAt: timestamp,
    deleteAfter: Timestamp.fromMillis(revokedAt.toMillis() + POLICY.deletionTargetHours * 3600000),
    deletionLeaseId: null,
    deletionLeaseUntil: null,
  });
}
// Shares the soft-delete transaction; never scans Students or changes its version/audit owner.
export async function revokePhotoForStudentDeletion(
  transaction: FirebaseFirestore.Transaction,
  student: FirebaseFirestore.DocumentSnapshot,
  timestamp: Timestamp,
): Promise<void> {
  const photo = await currentManagedPhoto(transaction, student);
  if (photo) queuePhotoDeletion(transaction, photo.reference, photo.value, "student_deleted", timestamp);
  transaction.update(student.ref, withdrawPhotoFields());
}
export async function managedPhotoReviewEligible(
  transaction: FirebaseFirestore.Transaction,
  student: FirebaseFirestore.DocumentSnapshot,
  now: Timestamp,
): Promise<boolean> {
  assertPhotoStudentBinding(student.data() ?? {}, student.id);
  const photo = await currentManagedPhoto(transaction, student);
  return (
    student.get("deleted") !== true &&
    photo !== null &&
    student.get("identityPhotoConsentState") === "granted" &&
    student.get("identityPhotoConsentPolicyVersion") === POLICY.policyVersion &&
    photo.value.state === "active" &&
    photo.value.consentPolicyVersion === POLICY.policyVersion &&
    photoTime(photo.value.expiresAt).toMillis() > now.toMillis() &&
    photoTime(photo.value.committedAt).toMillis() <= now.toMillis() &&
    photoTime(photo.value.expiresAt).toMillis() - photoTime(photo.value.committedAt).toMillis() ===
      POLICY.retentionDays * 86400000 &&
    photoTime(student.get("identityPhotoConsentedAt")).isEqual(photoTime(photo.value.committedAt)) &&
    photoTime(photo.value.consentedAt).isEqual(photoTime(photo.value.committedAt)) &&
    photoTime(student.get("identityPhotoExpiresAt")).isEqual(photoTime(photo.value.expiresAt)) &&
    photoTime(student.get("identityPhotoCapturedAt")).isEqual(photoTime(photo.value.committedAt))
  );
}
