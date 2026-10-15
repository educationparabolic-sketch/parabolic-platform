import { CAPABILITY_MATRIX, type PortalCapability } from "../../../../shared/contracts/capabilityPolicy";
import { useAuthProvider } from "../../../../shared/services/authProvider";
import { resolveGlobalPortalState } from "../../../../shared/services/globalPortalState";
import type { AuthSession } from "../../../../shared/types/authProvider";
import type { PortalRole } from "../../../../shared/types/portalRouting";

const VENDOR_PORTAL_ALLOWED_ROLES: readonly PortalRole[] =
  CAPABILITY_MATRIX["portal.vendor.access"].allowedRoles;

export interface VendorAccessContext {
  role: PortalRole | null;
  canAccessVendorPortal: boolean;
  canUseCapability: (capability: PortalCapability) => boolean;
}

export function isVendorPortalRoleAllowed(role: PortalRole | null): boolean {
  return role !== null && VENDOR_PORTAL_ALLOWED_ROLES.includes(role);
}

export function resolveVendorAccessContext(session: AuthSession): VendorAccessContext {
  const globalState = resolveGlobalPortalState({ portal: "vendor", session });
  const role = globalState.role;
  const canAccessVendorPortal = isVendorPortalRoleAllowed(role) &&
    globalState.permissions.canAccessVendorPortal;

  return {
    role,
    canAccessVendorPortal,
    canUseCapability: (capability) => canAccessVendorPortal &&
      Object.hasOwn(CAPABILITY_MATRIX, capability) &&
      (capability === "portal.vendor.access" || capability.startsWith("vendor.")) &&
      CAPABILITY_MATRIX[capability].allowedRoles.some(allowed => allowed === role),
  };
}

export function useVendorCapability(capability: PortalCapability): boolean {
  const { session } = useAuthProvider();
  return resolveVendorAccessContext(session).canUseCapability(capability);
}
