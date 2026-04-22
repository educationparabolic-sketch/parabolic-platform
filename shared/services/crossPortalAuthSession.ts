import type { PortalKey } from "./portalManifest";

const CROSS_PORTAL_STORAGE_KEY = "parabolic.crossPortalAuthSession.v1";
const CROSS_PORTAL_COOKIE_KEY = "parabolic_cross_portal_auth_v1";
const MAX_SESSION_WINDOW_MS = 15 * 60 * 1000;

export interface CrossPortalAuthSession {
  sourcePortal: PortalKey;
  idToken: string;
  issuedAt: number;
  expiresAt: number;
}

interface JwtLikeClaims {
  exp?: unknown;
}

function decodeJwtLikeClaims(token: string): JwtLikeClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  try {
    const encoded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=");
    return JSON.parse(atob(padded)) as JwtLikeClaims;
  } catch {
    return null;
  }
}

function isLikelyPortal(value: unknown): value is PortalKey {
  return value === "admin" || value === "student" || value === "exam" || value === "vendor";
}

function serializeSession(session: CrossPortalAuthSession): string {
  return JSON.stringify(session);
}

function parseSession(rawValue: string): CrossPortalAuthSession | null {
  try {
    const parsed = JSON.parse(rawValue) as Record<string, unknown>;
    if (
      !isLikelyPortal(parsed.sourcePortal) ||
      typeof parsed.idToken !== "string" ||
      typeof parsed.issuedAt !== "number" ||
      typeof parsed.expiresAt !== "number"
    ) {
      return null;
    }

    return {
      sourcePortal: parsed.sourcePortal,
      idToken: parsed.idToken,
      issuedAt: parsed.issuedAt,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
}

function getCookieValue(cookieKey: string): string | null {
  const serialized = document.cookie;
  if (!serialized) {
    return null;
  }

  const keyPrefix = `${cookieKey}=`;
  const parts = serialized.split(";").map((part) => part.trim());
  const matched = parts.find((part) => part.startsWith(keyPrefix));
  if (!matched) {
    return null;
  }

  return decodeURIComponent(matched.slice(keyPrefix.length));
}

function resolveCookieDomain(hostname: string): string | null {
  const normalized = hostname.trim().toLowerCase();
  if (normalized.length === 0 || normalized === "localhost" || normalized === "127.0.0.1") {
    return null;
  }

  const segments = normalized.split(".").filter((segment) => segment.length > 0);
  if (segments.length < 2) {
    return null;
  }

  return `.${segments.slice(-2).join(".")}`;
}

function writeCookie(session: CrossPortalAuthSession): void {
  const now = Date.now();
  const remainingSeconds = Math.max(0, Math.floor((session.expiresAt - now) / 1000));
  const secure = window.location.protocol === "https:";
  const sameSite = secure ? "None" : "Lax";
  const domain = resolveCookieDomain(window.location.hostname);
  const domainAttribute = domain ? `; Domain=${domain}` : "";

  document.cookie =
    `${CROSS_PORTAL_COOKIE_KEY}=${encodeURIComponent(serializeSession(session))}; Path=/; Max-Age=${remainingSeconds}; SameSite=${sameSite}${secure ? "; Secure" : ""}${domainAttribute}`;
}

function clearCookie(): void {
  const domain = resolveCookieDomain(window.location.hostname);
  const domainAttribute = domain ? `; Domain=${domain}` : "";
  document.cookie = `${CROSS_PORTAL_COOKIE_KEY}=; Path=/; Max-Age=0; SameSite=Lax${domainAttribute}`;
}

function computeExpiresAt(token: string): number {
  const now = Date.now();
  const claims = decodeJwtLikeClaims(token);
  if (!claims || typeof claims.exp !== "number" || !Number.isFinite(claims.exp)) {
    return now + MAX_SESSION_WINDOW_MS;
  }

  const expMillis = claims.exp * 1000;
  return Math.min(expMillis, now + MAX_SESSION_WINDOW_MS);
}

function isSessionUsable(session: CrossPortalAuthSession): boolean {
  const now = Date.now();
  return session.expiresAt > now + 1_000 && session.idToken.trim().length > 0;
}

function readLocalStorageSession(): CrossPortalAuthSession | null {
  try {
    const rawValue = window.localStorage.getItem(CROSS_PORTAL_STORAGE_KEY);
    if (!rawValue || rawValue.trim().length === 0) {
      return null;
    }

    return parseSession(rawValue);
  } catch {
    return null;
  }
}

function writeLocalStorageSession(session: CrossPortalAuthSession): void {
  try {
    window.localStorage.setItem(CROSS_PORTAL_STORAGE_KEY, serializeSession(session));
  } catch {
    // Best-effort persistence only.
  }
}

export function persistCrossPortalAuthSession(input: { sourcePortal: PortalKey; idToken: string }): void {
  const normalizedToken = input.idToken.trim();
  if (normalizedToken.length === 0) {
    return;
  }

  const snapshot: CrossPortalAuthSession = {
    sourcePortal: input.sourcePortal,
    idToken: normalizedToken,
    issuedAt: Date.now(),
    expiresAt: computeExpiresAt(normalizedToken),
  };

  writeLocalStorageSession(snapshot);
  try {
    writeCookie(snapshot);
  } catch {
    // Cookie persistence is optional when browser policy blocks writes.
  }
}

export function clearCrossPortalAuthSession(): void {
  try {
    window.localStorage.removeItem(CROSS_PORTAL_STORAGE_KEY);
  } catch {
    // No-op
  }
  clearCookie();
}

export function readCrossPortalAuthSession(): CrossPortalAuthSession | null {
  const localStorageSession = readLocalStorageSession();
  if (localStorageSession && isSessionUsable(localStorageSession)) {
    return localStorageSession;
  }

  const cookieValue = getCookieValue(CROSS_PORTAL_COOKIE_KEY);
  if (!cookieValue) {
    if (localStorageSession) {
      clearCrossPortalAuthSession();
    }
    return null;
  }

  const cookieSession = parseSession(cookieValue);
  if (!cookieSession || !isSessionUsable(cookieSession)) {
    clearCrossPortalAuthSession();
    return null;
  }

  writeLocalStorageSession(cookieSession);
  return cookieSession;
}

export function readCrossPortalIdToken(): string | null {
  const snapshot = readCrossPortalAuthSession();
  return snapshot?.idToken ?? null;
}
