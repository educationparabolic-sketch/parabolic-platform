import { CAPABILITY_MATRIX } from "../../../../shared/contracts/capabilityPolicy";
import { resolveGlobalPortalState } from "../../../../shared/services/globalPortalState";
import type { AuthSession } from "../../../../shared/types/authProvider";
import type { PortalRole } from "../../../../shared/types/portalRouting";

const STUDENT_PORTAL_ALLOWED_ROLES: readonly PortalRole[] =
  CAPABILITY_MATRIX["portal.student.access"].allowedRoles;

export interface StudentAccessContext {
  role: PortalRole | null;
  canAccessStudentPortal: boolean;
}

export function isStudentPortalRoleAllowed(role: PortalRole | null): boolean {
  return role !== null && STUDENT_PORTAL_ALLOWED_ROLES.includes(role);
}

export function resolveStudentAccessContext(session: AuthSession): StudentAccessContext {
  const globalState = resolveGlobalPortalState({ portal: "student", session });

  return {
    role: globalState.role,
    canAccessStudentPortal: isStudentPortalRoleAllowed(globalState.role),
  };
}
