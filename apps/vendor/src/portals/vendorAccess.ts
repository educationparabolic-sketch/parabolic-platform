import type { AuthSession } from "../../../../shared/types/authProvider";
import type { PortalRole } from "../../../../shared/types/portalRouting";
import { resolveGlobalPortalState } from "../../../../shared/services/globalPortalState";

export interface VendorAccessContext {
  role: PortalRole | null;
  isVendor: boolean;
}

export function resolveVendorAccessContext(session: AuthSession): VendorAccessContext {
  const globalState = resolveGlobalPortalState({ portal: "vendor", session });
  const role = globalState.role;

  return {
    role,
    isVendor: role === "vendor",
  };
}
