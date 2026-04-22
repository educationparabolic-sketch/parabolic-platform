import type { AuthSession } from "../../../../shared/types/authProvider";
import type { PortalRole } from "../../../../shared/types/portalRouting";

export interface VendorAccessContext {
  role: PortalRole | null;
  isVendor: boolean;
}

function decodeIdTokenClaims(idToken: string | null): Record<string, unknown> | null {
  if (!idToken) {
    return null;
  }

  const segments = idToken.split(".");
  if (segments.length !== 3) {
    return null;
  }

  try {
    const payloadSegment = segments[1].replace(/-/g, "+").replace(/_/g, "/");
    const paddedPayload = payloadSegment.padEnd(Math.ceil(payloadSegment.length / 4) * 4, "=");
    const payload = atob(paddedPayload);
    const claims = JSON.parse(payload);

    return claims && typeof claims === "object" ? (claims as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function normalizePortalRole(value: unknown): PortalRole | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (
    normalized === "student" ||
    normalized === "teacher" ||
    normalized === "admin" ||
    normalized === "director" ||
    normalized === "vendor"
  ) {
    return normalized;
  }

  return null;
}

export function resolveVendorAccessContext(session: AuthSession): VendorAccessContext {
  const claims = decodeIdTokenClaims(session.idToken);
  const role = normalizePortalRole(claims?.role ?? claims?.userRole);

  return {
    role,
    isVendor: role === "vendor",
  };
}
