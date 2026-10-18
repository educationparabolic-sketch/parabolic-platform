import type {StudentIdentityPhotoPolicy} from "../../../shared/contracts/studentProfile";

export const STUDENT_IDENTITY_PHOTO_POLICY: Readonly<StudentIdentityPhotoPolicy> = Object.freeze({
  policyVersion: "student-identity-photo-v1",
  mediaType: "image/jpeg",
  maxUploadBytes: 1048576,
  maxEncodedCharacters: 1398104,
  maxImageDimension: 1920,
  maxDecodedPixels: 2073600,
  minimumImageDimension: 160,
  retentionDays: 90,
  stagingLifetimeHours: 24,
  deletionTargetHours: 24,
  cleanupIntervalMinutes: 15,
  cleanupBatchLimit: 100,
  cleanupLeaseSeconds: 300,
  mediaAccess: "authenticated_api_only",
  rawPhotoInExamResponse: false,
  automatedFaceMatching: "unavailable",
});
