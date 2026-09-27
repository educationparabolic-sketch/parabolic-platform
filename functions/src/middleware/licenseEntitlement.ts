import {getFirebaseAdminApp} from "../utils/firebaseAdmin";
import {
  LicenseState,
  MiddlewareIdentityContext,
  MiddlewareRejectionError,
} from "../types/middleware";

export interface LicenseEntitlementEnforcementDependencies {
  now?: () => Date;
  revokeRefreshTokens?: (uid: string) => Promise<void>;
}

export interface EffectiveLicenseEntitlement {
  expiryDate: string | null;
  gracePeriodEndsAt: string | null;
  state: LicenseState;
  version: string;
}

export const INCOMPLETE_LICENSE_ENTITLEMENT_MESSAGE =
  "License entitlement claims are incomplete.";
export const GRACE_LICENSE_RESTRICTED_MESSAGE =
  "License is in grace state; this operation is unavailable.";
export const EXPIRED_LICENSE_RESTRICTED_MESSAGE =
  "License is expired; this operation is unavailable.";

const resolveEffectiveState = (
  identity: MiddlewareIdentityContext,
  now: Date,
): EffectiveLicenseEntitlement => {
  if (!identity.licenseState || !identity.licenseVersion) {
    throw new MiddlewareRejectionError(
      "LICENSE_RESTRICTED",
      INCOMPLETE_LICENSE_ENTITLEMENT_MESSAGE,
    );
  }

  let state = identity.licenseState;
  if (
    state === "active" &&
    identity.expiryDate &&
    new Date(identity.expiryDate).getTime() <= now.getTime()
  ) {
    state = "expired";
  }
  if (
    state === "grace" &&
    (!identity.gracePeriodEndsAt ||
      new Date(identity.gracePeriodEndsAt).getTime() <= now.getTime())
  ) {
    state = "expired";
  }

  return {
    expiryDate: identity.expiryDate ?? null,
    gracePeriodEndsAt: identity.gracePeriodEndsAt ?? null,
    state,
    version: identity.licenseVersion,
  };
};

/**
 * Requires complete active entitlement claims for privileged license-aware
 * middleware. The first request carrying elapsed entitlement revokes only its
 * initiating identity; BWM-036 retains fleet-wide mutation propagation.
 * @param {MiddlewareIdentityContext} identity Verified request identity.
 * @param {LicenseEntitlementEnforcementDependencies} dependencies Clock/revoker.
 * @return {Promise<EffectiveLicenseEntitlement>} Active entitlement authority.
 */
export const enforceActiveLicenseEntitlement = async (
  identity: MiddlewareIdentityContext,
  dependencies: LicenseEntitlementEnforcementDependencies = {},
): Promise<EffectiveLicenseEntitlement> => {
  const entitlement = resolveEffectiveState(
    identity,
    dependencies.now?.() ?? new Date(),
  );

  if (entitlement.state === "expired") {
    const revokeRefreshTokens = dependencies.revokeRefreshTokens ??
      ((uid: string) => getFirebaseAdminApp().auth().revokeRefreshTokens(uid));
    await revokeRefreshTokens(identity.uid);
    throw new MiddlewareRejectionError(
      "LICENSE_RESTRICTED",
      EXPIRED_LICENSE_RESTRICTED_MESSAGE,
    );
  }
  if (entitlement.state === "grace") {
    throw new MiddlewareRejectionError(
      "LICENSE_RESTRICTED",
      GRACE_LICENSE_RESTRICTED_MESSAGE,
    );
  }

  return entitlement;
};
