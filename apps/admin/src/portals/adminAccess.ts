import type { AuthSession } from "../../../../shared/types/authProvider";
import {
  CAPABILITY_MATRIX,
  type PortalCapability,
} from "../../../../shared/contracts/capabilityPolicy";
import type { LicenseFeatureFlags } from "../../../../shared/types/globalPortalState";
import { LICENSE_LAYER_ORDER } from "../../../../shared/types/portalRouting";
import type { LicenseLayer, PortalRole } from "../../../../shared/types/portalRouting";
import { resolveGlobalPortalState } from "../../../../shared/services/globalPortalState";

export interface AdminAccessContext {
  role: PortalRole | null;
  licenseLayer: LicenseLayer | null;
  featureFlags: LicenseFeatureFlags;
}

export type AdminCapabilityDenialReason = "unauthorized" | "license_restricted";

export interface AdminCapabilityDecision {
  allowed: boolean;
  reason: AdminCapabilityDenialReason | null;
}

export function evaluateAdminCapability(
  capability: PortalCapability,
  context: AdminAccessContext,
): AdminCapabilityDecision {
  const policy = CAPABILITY_MATRIX[capability];
  const { role, licenseLayer, featureFlags } = context;

  if (!role || !policy.allowedRoles.some((allowedRole) => allowedRole === role)) {
    return { allowed: false, reason: "unauthorized" };
  }

  const roleMinimumLicenseLayers: Readonly<Partial<Record<PortalRole, LicenseLayer>>> | undefined =
    "roleMinimumLicenseLayers" in policy ? policy.roleMinimumLicenseLayers : undefined;
  const requiredLicenseLayer = roleMinimumLicenseLayers?.[role] ?? policy.minimumLicenseLayer;
  if (
    requiredLicenseLayer !== null &&
    (!licenseLayer || LICENSE_LAYER_ORDER[licenseLayer] < LICENSE_LAYER_ORDER[requiredLicenseLayer])
  ) {
    return { allowed: false, reason: "license_restricted" };
  }

  if (policy.requiredFeatureFlags.some((flagName) => !featureFlags[flagName])) {
    return { allowed: false, reason: "license_restricted" };
  }

  return { allowed: true, reason: null };
}

export function hasAdminCapability(
  capability: PortalCapability,
  context: AdminAccessContext,
): boolean {
  return evaluateAdminCapability(capability, context).allowed;
}

export function resolveAdminAccessContext(session: AuthSession): AdminAccessContext {
  const globalState = resolveGlobalPortalState({ portal: "admin", session });

  return {
    role: globalState.role,
    licenseLayer: globalState.licenseLayer,
    featureFlags: globalState.license.featureFlags,
  };
}
