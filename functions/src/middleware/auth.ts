import {DecodedIdToken} from "firebase-admin/auth";
import {
  Middleware,
  MiddlewareIdentityContext,
  MiddlewareRejectionError,
} from "../types/middleware";
import {
  resolveLicenseLayer,
  setRequestData,
  setRequestIdentity,
} from "./framework";

export interface AuthenticationMiddlewareDependencies {
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

export interface AuthenticationMiddlewareOptions {
  attachStudentId?: boolean;
}

const normalizeNonEmptyString = (
  value: unknown,
): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue || null;
};

const normalizeRole = (
  decodedToken: Record<string, unknown>,
): string | null => {
  const normalizedRole = normalizeNonEmptyString(
    decodedToken.role ?? decodedToken.userRole,
  );

  return normalizedRole?.toLowerCase() ?? null;
};

const resolveInstituteClaim = (
  decodedToken: Record<string, unknown>,
): string | null =>
  normalizeNonEmptyString(decodedToken.instituteId ?? decodedToken.tenantId);

const resolveStudentId = (
  decodedToken: Record<string, unknown>,
  uid: string,
): string => normalizeNonEmptyString(decodedToken.studentId) ?? uid;

const getBearerToken = (
  authorizationHeader: string | undefined,
): string => {
  if (!authorizationHeader) {
    throw new MiddlewareRejectionError(
      "UNAUTHORIZED",
      "Missing authorization header.",
    );
  }

  const [scheme, token] = authorizationHeader.split(" ");

  if (scheme?.toLowerCase() !== "bearer" || !token?.trim()) {
    throw new MiddlewareRejectionError(
      "UNAUTHORIZED",
      "Authorization header must be in Bearer token format.",
    );
  }

  return token.trim();
};

const buildIdentityContext = (
  decodedToken: DecodedIdToken,
): MiddlewareIdentityContext => {
  const uid = normalizeNonEmptyString(decodedToken.uid);
  const role = normalizeRole(decodedToken);
  const licenseLayer = resolveLicenseLayer(decodedToken.licenseLayer);

  if (!uid || !role || !licenseLayer) {
    throw new MiddlewareRejectionError(
      "UNAUTHORIZED",
      "Authentication token is missing required claims.",
    );
  }

  return {
    instituteId: resolveInstituteClaim(decodedToken),
    isSuspended: Boolean(decodedToken.isSuspended),
    isVendor: role === "vendor" || Boolean(decodedToken.isVendor),
    licenseLayer,
    role,
    uid,
  };
};

export const createAuthenticationMiddleware = (
  dependencies: AuthenticationMiddlewareDependencies,
  options: AuthenticationMiddlewareOptions = {},
): Middleware => async (request, _response, next): Promise<void> => {
  const idToken = getBearerToken(request.header("authorization"));

  let decodedToken: DecodedIdToken;

  try {
    decodedToken = await dependencies.verifyIdToken(idToken);
  } catch {
    throw new MiddlewareRejectionError(
      "UNAUTHORIZED",
      "Invalid or expired authentication token.",
    );
  }

  const identity = buildIdentityContext(decodedToken);
  setRequestIdentity(request, identity);

  if (options.attachStudentId) {
    setRequestData(request, {
      studentId: resolveStudentId(decodedToken, identity.uid),
    });
  }

  await next();
};

export {
  buildIdentityContext,
  getBearerToken,
  normalizeRole,
  resolveInstituteClaim,
  resolveStudentId,
};
