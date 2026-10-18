/**
 * BWM-042 / DEC-093 secured transport; mounted adoption is a later substep.
 * Closed wire DTOs. Runtime validators must reject unknown keys recursively,
 * including actor/tenant/UID/year/review/time/Storage coordinates in intent.
 * No browser status or camera capture proves identity or liveness.
 */
export interface StudentIdentityPhotoPolicy {
  policyVersion: "student-identity-photo-v1";
  mediaType: "image/jpeg";
  maxUploadBytes: 1048576;
  maxEncodedCharacters: 1398104;
  maxImageDimension: 1920;
  maxDecodedPixels: 2073600;
  minimumImageDimension: 160;
  retentionDays: 90;
  stagingLifetimeHours: 24;
  deletionTargetHours: 24;
  cleanupIntervalMinutes: 15;
  cleanupBatchLimit: 100;
  cleanupLeaseSeconds: 300;
  mediaAccess: "authenticated_api_only";
  rawPhotoInExamResponse: false;
  automatedFaceMatching: "unavailable";
}

/** Only the existing sidebar preference is writable; no account editing. */
export interface StudentProfilePreferences {
  sidebarCollapsed: boolean;
}

export interface StudentIdentityPhotoRecord {
  /** Opaque server ID, never a bucket/object path or email-derived key. */
  photoId: string;
  /** Server commit time, not a claimed camera timestamp. */
  capturedAt: string;
  expiresAt: string;
  consentPolicyVersion: "student-identity-photo-v1";
}

export type StudentIdentityPhotoState =
  | {status: "not_enrolled" | "withdrawn"; photo: null; mediaAvailable: false}
  | {status: "expired"; photo: StudentIdentityPhotoRecord; mediaAvailable: false}
  | {
      status: "pending_review" | "verified" | "unverified";
      photo: StudentIdentityPhotoRecord;
      mediaAvailable: true;
    };

export interface StudentProfileResult {
  studentId: string;
  version: number;
  fullName: string;
  email: string;
  batch: {id: string | null; name: string} | null;
  /** Null if no operational year exists; ambiguous/malformed authority fails. */
  academicYear: {id: string; name: string} | null;
  preferences: StudentProfilePreferences;
  identityPhoto: StudentIdentityPhotoState;
  photoPolicy: StudentIdentityPhotoPolicy;
}

/** UUID key; positive Student version from an owning server read. */
export interface StudentProfilePreferencesRequest {
  expectedVersion: number;
  idempotencyKey: string;
  preferences: StudentProfilePreferences;
}

/** Immutable command receipt; always reread current profile after a command. */
export interface StudentProfilePreferencesResult {
  auditId: string;
  disposition: "applied" | "replayed";
  version: number;
  updatedAt: string;
  preferences: StudentProfilePreferences;
}

export interface StudentIdentityPhotoEnrollRequest {
  expectedVersion: number;
  /** Must match the current pointer, including null for first enrollment. */
  expectedPhotoId: string | null;
  idempotencyKey: string;
  consent: {accepted: true; policyVersion: "student-identity-photo-v1"};
  /** Canonical bounded base64, no data URL. Backend validates and re-encodes. */
  contentBase64: string;
  mediaType: "image/jpeg";
}

/** A receipt proves an historical commit, never current consent/availability. */
export interface StudentIdentityPhotoEnrollResult {
  auditId: string;
  disposition: "applied" | "replayed";
  version: number;
  committedPhoto: StudentIdentityPhotoRecord;
  replacedPhotoId: string | null;
}

export interface StudentIdentityPhotoWithdrawRequest {
  expectedVersion: number;
  /** Null allows an audited withdrawal with no current photo. */
  expectedPhotoId: string | null;
  idempotencyKey: string;
}

export interface StudentIdentityPhotoWithdrawResult {
  auditId: string;
  disposition: "applied" | "replayed";
  version: number;
  withdrawnAt: string;
  photoId: string | null;
  /** Historical receipt; physical completion is read from the lifecycle GET. */
  accessRevoked: true;
}

export type StudentIdentityPhotoDeletionReason =
  | "replaced"
  | "consent_withdrawn"
  | "retention_expired"
  | "student_deleted";

/** Exact own-photo lookup, no history listing, bytes, URLs or private paths. */
export type StudentIdentityPhotoLifecycleResult =
  | {photoId: string; state: "active"; deletionReason: null; deletedAt: null}
  | {
      photoId: string;
      state: "deletion_pending";
      deletionReason: StudentIdentityPhotoDeletionReason;
      deletedAt: null;
    }
  | {
      photoId: string;
      state: "deleted";
      deletionReason: StudentIdentityPhotoDeletionReason;
      deletedAt: string;
    };

/**
 * One authorized image in the standard envelope; private,no-store response.
 * No signed/public URL or download token. Convert to a short-lived Blob URL
 * in memory and revoke it on replacement/navigation/identity change.
 */
export interface StudentIdentityPhotoMediaResult {
  photoId: string;
  mediaType: "image/jpeg";
  sizeBytes: number;
  contentBase64: string;
}

/** Managed ADM-27 review intent; timestamp-only legacy commands are rejected. */
export interface ManagedStudentIdentityPhotoReviewRequest {
  expectedVersion: number;
  expectedPhotoId: string;
  expectedPhotoCapturedAt: string;
  idempotencyKey: string;
  decision: "verified" | "unverified";
  reason?: string;
}

/** Minimal current state for one already-authorized persisted Exam session. */
export interface ExamIdentityStatusResult {
  sessionId: string;
  checkedAt: string;
  identityStatus:
    | "not_enrolled"
    | "pending_review"
    | "verified"
    | "unverified"
    | "expired"
    | "withdrawn";
  /** Administrative review only. BWM-045 owns actual proctoring decisions. */
  automatedFaceMatching: "unavailable";
}
