import { isLoopbackHostname } from "./browserRuntimeEnvironment";

const LEGACY_TOKEN_STORAGE_KEYS = [
  "parabolic.crossPortalAuthSession.v1",
  "parabolic.localAuthToken",
] as const;

const LEGACY_CROSS_PORTAL_COOKIE_KEY = "parabolic_cross_portal_auth_v1";

function resolveLegacyCookieDomain(hostname: string): string | null {
  const normalized = hostname.trim().toLowerCase();
  if (normalized.length === 0 || isLoopbackHostname(normalized)) {
    return null;
  }

  const segments = normalized.split(".").filter((segment) => segment.length > 0);
  if (segments.length < 2) {
    return null;
  }

  return `.${segments.slice(-2).join(".")}`;
}

function expireLegacyCookie(domain: string | null): void {
  const domainAttribute = domain ? `; Domain=${domain}` : "";
  document.cookie =
    `${LEGACY_CROSS_PORTAL_COOKIE_KEY}=; Path=/; Max-Age=0; SameSite=Lax${domainAttribute}`;
}

/**
 * Removes token copies written by the retired cross-portal and local-fallback
 * bridges. This migration is intentionally delete-only: Firebase Auth remains
 * responsible for normal per-origin persistence and no bearer token is read
 * from or written to application-owned browser storage.
 */
export function clearLegacyBrowserTokenCopies(): void {
  for (const storageKey of LEGACY_TOKEN_STORAGE_KEYS) {
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // Best-effort cleanup when storage is unavailable.
    }
  }

  try {
    expireLegacyCookie(null);
    const parentDomain = resolveLegacyCookieDomain(window.location.hostname);
    if (parentDomain) {
      expireLegacyCookie(parentDomain);
    }
  } catch {
    // Best-effort cleanup when cookies are unavailable.
  }
}
