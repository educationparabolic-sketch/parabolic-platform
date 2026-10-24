import type {Auth, DecodedIdToken, UserRecord} from "firebase-admin/auth";
import {MiddlewareRejectionError} from "../types/middleware";
import {hasConsistentVendorClaims} from "../policy/vendorRolePolicy";

const deny = (): never => {
  throw new MiddlewareRejectionError("UNAUTHORIZED", "Current authentication authority is unavailable.");
};

const identifier = (value: unknown): string => {
  if (typeof value !== "string" || !value || value !== value.trim() ||
      value === "." || value === ".." || value.includes("/") || value.includes("\\") ||
      [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return deny();
  return value;
};

export const hasCurrentStaffMembership = (members: unknown, uid: string, role: unknown): boolean => {
  if (typeof members !== "object" || members === null || Array.isArray(members) ||
      !Object.prototype.hasOwnProperty.call(members, uid)) return false;
  const member = (members as Record<string, unknown>)[uid];
  return typeof member === "object" && member !== null && !Array.isArray(member) &&
    (member as Record<string, unknown>).status === "active" && (member as Record<string, unknown>).role === role;
};

export const currentIdentityClaims = (claims: Record<string, unknown>, uid: string) => {
  identifier(uid);
  if ((claims.isSuspended !== undefined && claims.isSuspended !== false) ||
      (claims.suspended !== undefined && claims.suspended !== false)) {
    throw new MiddlewareRejectionError("FORBIDDEN", "Account access is suspended.");
  }
  if (typeof claims.role !== "string") return deny();
  const role = claims.role.toLowerCase();
  if (!["student", "teacher", "admin", "director", "vendor", "service", "backend_service"].includes(role) ||
      claims.role !== claims.role.trim() ||
      (claims.userRole !== undefined && claims.userRole !== claims.role) ||
      (claims.isSuspended !== undefined && claims.isSuspended !== false) ||
      (claims.suspended !== undefined && claims.suspended !== false) ||
      (role !== "vendor" && claims.isVendor !== undefined && claims.isVendor !== false)) return deny();
  if (role === "vendor") {
    if (!hasConsistentVendorClaims(claims)) return deny();
    return {role, instituteId: null, studentId: null};
  }
  const instituteId = identifier(claims.instituteId ?? claims.tenantId);
  if (claims.instituteId !== undefined && claims.tenantId !== undefined &&
      claims.instituteId !== claims.tenantId) return deny();
  const studentId = role === "student" ? identifier(claims.studentId ?? uid) : null;
  if (studentId !== null && studentId !== uid) return deny();
  return {role, instituteId, studentId};
};

// Verify revocation and current account identity without adopting newer privileges.
export const verifyCurrentAccountIdentity = async (
  auth: Pick<Auth, "verifyIdToken" | "getUser">,
  idToken: string,
): Promise<{token: DecodedIdToken; user: UserRecord}> => {
  let token: DecodedIdToken;
  try {
    token = await auth.verifyIdToken(idToken, true);
  } catch (error) {
    const invalid = ["auth/argument-error", "auth/invalid-id-token", "auth/id-token-expired",
      "auth/id-token-revoked", "auth/user-disabled", "auth/user-not-found"]
      .includes((error as {code?: string}).code ?? "");
    throw new MiddlewareRejectionError(invalid ? "UNAUTHORIZED" : "INTERNAL_ERROR",
      "Authentication verification is unavailable.");
  }
  const presented = currentIdentityClaims(token, token.uid);
  let user: UserRecord;
  try {
    user = await auth.getUser(token.uid);
  } catch (error) {
    if ((error as {code?: string}).code === "auth/user-not-found") return deny();
    throw new MiddlewareRejectionError("INTERNAL_ERROR", "Current authentication authority is unavailable.");
  }
  if (user.uid !== token.uid || user.disabled) return deny();
  const current = currentIdentityClaims(user.customClaims ?? {}, user.uid);
  if (presented.role !== current.role || presented.instituteId !== current.instituteId ||
      presented.studentId !== current.studentId) return deny();
  return {token, user};
};
