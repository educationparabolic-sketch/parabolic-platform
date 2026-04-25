import type { AuthSession } from "../../../../shared/types/authProvider";
import type { LicenseLayer, PortalRole } from "../../../../shared/types/portalRouting";
import { resolveGlobalPortalState } from "../../../../shared/services/globalPortalState";

export interface AdminAccessContext {
  role: PortalRole | null;
  licenseLayer: LicenseLayer | null;
}

export function resolveAdminAccessContext(session: AuthSession): AdminAccessContext {
  const globalState = resolveGlobalPortalState({ portal: "admin", session });

  return {
    role: globalState.role,
    licenseLayer: globalState.licenseLayer,
  };
}
