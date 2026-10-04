import type { AuthAuthorityIssue } from "../types/authProvider";

export type { AuthAuthorityIssue } from "../types/authProvider";

export type AuthAuthoritySignalSource = "api" | "firebase_refresh";

export interface AuthAuthoritySignal {
  issue: AuthAuthorityIssue;
  message: string;
  observedAuthorizationVersion: number | null;
  source: AuthAuthoritySignalSource;
}

type AuthAuthoritySignalListener = (signal: AuthAuthoritySignal) => void;

const listeners = new Set<AuthAuthoritySignalListener>();
const TERMINAL_FIREBASE_AUTH_CODES = new Set([
  "auth/id-token-revoked",
  "auth/invalid-user-token",
  "auth/user-disabled",
  "auth/user-not-found",
  "auth/user-token-expired",
]);

const SESSION_REVOKED_MESSAGE =
  "This session is no longer authorized. Sign in again to continue.";
const INSTITUTE_SUSPENDED_MESSAGE =
  "Your institute's access is suspended. Protected actions are unavailable.";
const LICENSE_RESTRICTED_MESSAGE =
  "The current institute license no longer permits this session.";

function readErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return null;
  }

  const code = (error as {code?: unknown}).code;
  return typeof code === "string" ? code.trim().toLowerCase() : null;
}

export function readAuthorizationVersionFromToken(idToken: string | null): number | null {
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
    const payload = JSON.parse(atob(paddedPayload)) as {authorizationVersion?: unknown};
    return Number.isSafeInteger(payload.authorizationVersion) && Number(payload.authorizationVersion) > 0
      ? Number(payload.authorizationVersion)
      : null;
  } catch {
    return null;
  }
}

export function hasAuthorizationAdvanced(
  observedAuthorizationVersion: number | null,
  idToken: string | null,
): boolean {
  const currentAuthorizationVersion = readAuthorizationVersionFromToken(idToken);
  return (
    observedAuthorizationVersion !== null &&
    currentAuthorizationVersion !== null &&
    currentAuthorizationVersion > observedAuthorizationVersion
  );
}

export function isTerminalFirebaseAuthError(error: unknown): boolean {
  const code = readErrorCode(error);
  return code !== null && TERMINAL_FIREBASE_AUTH_CODES.has(code);
}

export function buildFirebaseRefreshAuthoritySignal(
  error: unknown,
  idToken: string | null,
): AuthAuthoritySignal | null {
  if (!isTerminalFirebaseAuthError(error)) {
    return null;
  }

  return {
    issue: "session_revoked",
    message: SESSION_REVOKED_MESSAGE,
    observedAuthorizationVersion: readAuthorizationVersionFromToken(idToken),
    source: "firebase_refresh",
  };
}

export function classifyApiAuthorityFailure(input: {
  code: string;
  idToken: string | null;
  message: string;
  status: number;
}): AuthAuthoritySignal | null {
  const normalizedCode = input.code.trim().toUpperCase();
  const normalizedMessage = input.message.trim().toLowerCase();
  const observedAuthorizationVersion = readAuthorizationVersionFromToken(input.idToken);

  if (input.status === 401 || normalizedCode === "UNAUTHORIZED") {
    return {
      issue: "session_revoked",
      message: SESSION_REVOKED_MESSAGE,
      observedAuthorizationVersion,
      source: "api",
    };
  }

  if (
    normalizedCode === "FORBIDDEN" &&
    normalizedMessage.includes("institute access is suspended")
  ) {
    return {
      issue: "institute_suspended",
      message: INSTITUTE_SUSPENDED_MESSAGE,
      observedAuthorizationVersion,
      source: "api",
    };
  }

  if (normalizedCode === "LICENSE_RESTRICTED") {
    return {
      issue: "license_restricted",
      message: LICENSE_RESTRICTED_MESSAGE,
      observedAuthorizationVersion,
      source: "api",
    };
  }

  return null;
}

export function publishAuthAuthoritySignal(signal: AuthAuthoritySignal): void {
  for (const listener of listeners) {
    listener(signal);
  }
}

export function subscribeToAuthAuthoritySignals(
  listener: AuthAuthoritySignalListener,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
