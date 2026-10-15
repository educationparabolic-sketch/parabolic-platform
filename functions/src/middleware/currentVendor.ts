import {UserRecord} from "firebase-admin/auth";
import {
  hasConsistentVendorClaims,
  VendorCapability,
  VENDOR_CAPABILITY_ROLES,
} from "../policy/vendorRolePolicy";
import {MiddlewareRequest, MiddlewareRejectionError} from "../types/middleware";

export interface CurrentVendorDependencies {
  getUser: (uid: string) => Promise<UserRecord>;
}

/**
 * Requires verified token context and fresh global Vendor authority before any domain service.
 * @param {MiddlewareRequest} request Verified request context.
 * @param {CurrentVendorDependencies} dependencies Current Auth lookup.
 * @param {VendorCapability} capability Owning domain capability.
 * @return {Promise<object>} Current Vendor and verified actor identifier.
 */
export const assertCurrentVendorIdentity = async (
  request: MiddlewareRequest,
  dependencies: CurrentVendorDependencies,
  capability: VendorCapability,
): Promise<{user: UserRecord; actorId: string}> => {
  const identity = request.context.identity;
  if (!identity) throw new MiddlewareRejectionError("UNAUTHORIZED", "Authenticated identity is required.");
  if (!Object.prototype.hasOwnProperty.call(VENDOR_CAPABILITY_ROLES, capability) || identity.role !== "vendor" ||
    !identity.isVendor || identity.isSuspended) {
    throw new MiddlewareRejectionError("FORBIDDEN", `Capability ${capability} requires Vendor authority.`);
  }
  let user: UserRecord;
  try {
    user = await dependencies.getUser(identity.uid);
  } catch (error) {
    if ((error as {code?: string}).code === "auth/user-not-found") {
      throw new MiddlewareRejectionError("UNAUTHORIZED", "Current identity is unavailable.");
    }
    throw error;
  }
  if (user.disabled || !hasConsistentVendorClaims(user.customClaims ?? {})) {
    throw new MiddlewareRejectionError("FORBIDDEN", `Current identity cannot use capability ${capability}.`);
  }
  return {user, actorId: identity.uid};
};
