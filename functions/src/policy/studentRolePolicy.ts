// Deployable mirror of student.profile.manage_own. Portable contract gate pins parity.
export const STUDENT_PROFILE_CAPABILITY = {
  allowedRoles: ["student"],
  minimumLicenseLayer: "L0",
  requiredFeatureFlags: [],
} as const;

/**
 * Exact own-Student binding shared by profile and summary authority.
 * @param {Record<string, unknown>} claims Verified or freshly loaded claims.
 * @param {string} uid Canonical authenticated UID.
 * @param {string} instituteId Canonical institute identity.
 * @return {boolean} Whether every identity alias agrees.
 */
export function hasConsistentOwnStudentClaims(
  claims: Record<string, unknown>, uid: string, instituteId: string,
): boolean {
  return claims.role === "student" &&
    (claims.userRole === undefined || claims.userRole === "student") &&
    (claims.studentId === undefined || claims.studentId === uid) &&
    claims.instituteId === instituteId &&
    (claims.tenantId === undefined || claims.tenantId === instituteId) &&
    (claims.isVendor === undefined || claims.isVendor === false) &&
    (claims.isSuspended === undefined || claims.isSuspended === false) &&
    (claims.suspended === undefined || claims.suspended === false);
}
