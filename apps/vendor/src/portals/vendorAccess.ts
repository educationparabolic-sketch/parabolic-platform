import { CAPABILITY_MATRIX } from "../../../../shared/contracts/capabilityPolicy";
import { resolveGlobalPortalState } from "../../../../shared/services/globalPortalState";
import type { AuthSession } from "../../../../shared/types/authProvider";
import type { PortalRole } from "../../../../shared/types/portalRouting";

const VENDOR_PORTAL_ALLOWED_ROLES: readonly PortalRole[] =
  CAPABILITY_MATRIX["portal.vendor.access"].allowedRoles;

export interface VendorAccessContext {
  role: PortalRole | null;
  canAccessVendorPortal: boolean;
}

export function isVendorPortalRoleAllowed(role: PortalRole | null): boolean {
  return role !== null && VENDOR_PORTAL_ALLOWED_ROLES.includes(role);
}

export function resolveVendorAccessContext(session: AuthSession): VendorAccessContext {
  const globalState = resolveGlobalPortalState({ portal: "vendor", session });
  const role = globalState.role;

  return {
    role,
    canAccessVendorPortal: isVendorPortalRoleAllowed(role),
  };
}
