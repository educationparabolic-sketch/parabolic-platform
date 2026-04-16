import type { AuthSession } from "../../../../shared/types/authProvider";
import type { LicenseLayer, PortalRole } from "../../../../shared/types/portalRouting";

export interface AdminAccessContext {
  role: PortalRole | null;
  licenseLayer: LicenseLayer | null;
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

function normalizeLicenseLayer(value: unknown): LicenseLayer | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  if (normalized === "L0" || normalized === "L1" || normalized === "L2" || normalized === "L3") {
    return normalized;
  }

  return null;
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

function inferRoleFromEmail(email: string | null | undefined): PortalRole | null {
  if (!email) {
    return null;
  }

  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized.startsWith("director")) {
    return "director";
  }
  if (normalized.startsWith("admin")) {
    return "admin";
  }
  if (normalized.startsWith("teacher")) {
    return "teacher";
  }
  if (normalized.startsWith("student")) {
    return "student";
  }
  if (normalized.startsWith("vendor")) {
    return "vendor";
  }

  return null;
}

function inferLicenseLayerFromRole(role: PortalRole | null): LicenseLayer | null {
  if (role === "director") {
    return "L3";
  }
  if (role === "admin") {
    return "L2";
  }
  if (role === "teacher") {
    return "L1";
  }
  if (role === "student" || role === "vendor") {
    return "L0";
  }

  return null;
}

export function resolveAdminAccessContext(session: AuthSession): AdminAccessContext {
  const claims = decodeIdTokenClaims(session.idToken);
  const roleFromClaims = normalizePortalRole(claims?.role ?? claims?.userRole);
  const licenseLayerFromClaims = normalizeLicenseLayer(claims?.licenseLayer);

  if (roleFromClaims && licenseLayerFromClaims) {
    return {
      role: roleFromClaims,
      licenseLayer: licenseLayerFromClaims,
    };
  }

  const roleFromEmail = inferRoleFromEmail(session.user?.email);
  return {
    role: roleFromClaims ?? roleFromEmail,
    licenseLayer: licenseLayerFromClaims ?? inferLicenseLayerFromRole(roleFromClaims ?? roleFromEmail),
  };
}
