import type {
  StudentIdentityPhotoState, StudentIdentityPhotoMediaResult, StudentProfileResult,
  StudentIdentityPhotoLifecycleResult, StudentIdentityPhotoPolicy,
} from "../contracts/studentProfile";

export function identityContractError(): never { throw new Error("The identity response is incompatible. Reload or retry the original request."); }
export function identityRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return identityContractError();
  return value as Record<string, unknown>;
}
export function identityKeys(value: unknown, keys: readonly string[]): Record<string, unknown> {
  const row = identityRecord(value);
  if (Object.keys(row).sort().join() !== [...keys].sort().join()) return identityContractError();
  return row;
}
export function identityText(value: unknown): asserts value is string {
  if (typeof value !== "string" || !value.trim() || value.length > 320) identityContractError();
}
export function identityTime(value: unknown): asserts value is string {
  identityText(value);
  if (!Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) identityContractError();
}
export function identityVersion(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) >= Number.MAX_SAFE_INTEGER) identityContractError();
}
export function identityPhotoId(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^photo_[a-f0-9]{40}$/.test(value)) identityContractError();
}
export function parseIdentityPhotoState(value: unknown): StudentIdentityPhotoState {
  const row = identityKeys(value, ["status", "photo", "mediaAvailable"]);
  if (row.status === "not_enrolled" || row.status === "withdrawn") {
    if (row.photo !== null || row.mediaAvailable !== false) identityContractError();
  } else {
    if (!["expired", "pending_review", "verified", "unverified"].includes(String(row.status))) identityContractError();
    const photo = identityKeys(row.photo, ["photoId", "capturedAt", "expiresAt", "consentPolicyVersion"]);
    identityPhotoId(photo.photoId); identityTime(photo.capturedAt); identityTime(photo.expiresAt);
    if (photo.consentPolicyVersion !== "student-identity-photo-v1" ||
        Date.parse(photo.expiresAt) - Date.parse(photo.capturedAt) !== 90 * 86400000 ||
        row.mediaAvailable !== (row.status !== "expired")) identityContractError();
  }
  return value as StudentIdentityPhotoState;
}
const policy: StudentIdentityPhotoPolicy = {
  policyVersion: "student-identity-photo-v1", mediaType: "image/jpeg", maxUploadBytes: 1048576,
  maxEncodedCharacters: 1398104, maxImageDimension: 1920, maxDecodedPixels: 2073600, minimumImageDimension: 160,
  retentionDays: 90, stagingLifetimeHours: 24, deletionTargetHours: 24, cleanupIntervalMinutes: 15,
  cleanupBatchLimit: 100, cleanupLeaseSeconds: 300, mediaAccess: "authenticated_api_only",
  rawPhotoInExamResponse: false, automatedFaceMatching: "unavailable",
};
export function parseStudentProfile(value: unknown): StudentProfileResult {
  const row = identityKeys(value, ["studentId", "version", "fullName", "email", "batch", "academicYear", "preferences", "identityPhoto", "photoPolicy"]);
  identityText(row.studentId); identityVersion(row.version); identityText(row.fullName); identityText(row.email);
  for (const key of ["batch", "academicYear"] as const) {
    if (row[key] !== null) {
      const named = identityKeys(row[key], ["id", "name"]);
      if (key !== "batch" || named.id !== null) identityText(named.id);
      identityText(named.name);
    }
  }
  const prefs = identityKeys(row.preferences, ["sidebarCollapsed"]);
  if (typeof prefs.sidebarCollapsed !== "boolean") identityContractError();
  parseIdentityPhotoState(row.identityPhoto);
  const supplied = identityKeys(row.photoPolicy, Object.keys(policy));
  if (Object.entries(policy).some(([key, item]) => supplied[key] !== item)) identityContractError();
  return value as StudentProfileResult;
}
export function parseIdentityMedia(value: unknown, photoId: string): StudentIdentityPhotoMediaResult {
  const row = identityKeys(value, ["photoId", "mediaType", "sizeBytes", "contentBase64"]);
  if (row.photoId !== photoId || row.mediaType !== "image/jpeg" ||
      !Number.isSafeInteger(row.sizeBytes) || Number(row.sizeBytes) < 1 || Number(row.sizeBytes) > 1048576 ||
      typeof row.contentBase64 !== "string" || row.contentBase64.length > 1398104 ||
      /[^A-Za-z0-9+/=]/.test(row.contentBase64)) identityContractError();
  let bytes: string;
  try { bytes = atob(row.contentBase64 as string); } catch { return identityContractError(); }
  if (bytes.length !== row.sizeBytes || btoa(bytes) !== row.contentBase64 ||
      !bytes.startsWith("\xff\xd8\xff") || !bytes.endsWith("\xff\xd9")) identityContractError();
  return value as StudentIdentityPhotoMediaResult;
}
export function identityMediaUrl(media: StudentIdentityPhotoMediaResult): string {
  const raw = atob(media.contentBase64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], {type: "image/jpeg"}));
}
export function parseIdentityLifecycle(value: unknown, photoId: string): StudentIdentityPhotoLifecycleResult {
  const row = identityKeys(value, ["photoId", "state", "deletionReason", "deletedAt"]);
  if (row.photoId !== photoId) identityContractError();
  if (row.state === "active") {
    if (row.deletionReason !== null || row.deletedAt !== null) identityContractError();
  } else {
    if (!["deletion_pending", "deleted"].includes(String(row.state)) ||
        !["replaced", "consent_withdrawn", "retention_expired", "student_deleted"].includes(String(row.deletionReason))) identityContractError();
    if (row.state === "deleted") identityTime(row.deletedAt);
    else if (row.deletedAt !== null) identityContractError();
  }
  return value as StudentIdentityPhotoLifecycleResult;
}

/** Cache partition only; server verification remains authoritative. */
export function identityTenantScope(token: string | null): string {
  try {
    const raw = token?.split(".")[1];
    if (!raw) return "";
    const value = JSON.parse(atob(raw.replace(/-/g, "+").replace(/_/g, "/"))) as {instituteId?: unknown};
    return typeof value.instituteId === "string" ? value.instituteId : "";
  } catch { return ""; }
}
