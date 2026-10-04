import {DecodedIdToken} from "firebase-admin/auth";
import {
  Middleware,
  MiddlewareExamSessionClaims,
  MiddlewareIdentityContext,
  LicenseState,
  MiddlewareRejectionError,
} from "../types/middleware";
import {
  resolveLicenseLayer,
  setRequestData,
  setRequestIdentity,
} from "./framework";
import {studentOnboardingActivationService} from "../services/studentOnboardingActivation";
import {
  InstituteAuthorityEnforcementError,
} from "../services/instituteAuthorityEnforcement";

export interface AuthenticationMiddlewareDependencies {
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
  activateInvitedStudentOnFirstLogin?: (
    input: {instituteId: string; studentId: string},
  ) => Promise<void>;
}

export interface AuthenticationMiddlewareOptions {
  attachStudentId?: boolean;
  promoteInvitedStudentOnAuthenticate?: boolean;
}

const SUSPENDED_ACCOUNT_MESSAGE = "Account access is suspended.";

const mapInstituteAuthorityRejection = (
  error: InstituteAuthorityEnforcementError,
): MiddlewareRejectionError => {
  if (error.reason === "stale_authorization_version") {
    return new MiddlewareRejectionError("UNAUTHORIZED", error.message);
  }
  return new MiddlewareRejectionError(
    error.reason === "institute_suspended" ?
      "FORBIDDEN" : "LICENSE_RESTRICTED",
    error.message,
  );
};

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

const resolveFeatureFlags = (
  decodedToken: Record<string, unknown>,
): Readonly<Record<string, boolean>> => {
  const direct = decodedToken.featureFlags;
  const license = decodedToken.license;
  const nested = typeof license === "object" && license !== null ?
    (license as Record<string, unknown>).featureFlags :
    undefined;
  const source = typeof direct === "object" && direct !== null ?
    direct :
    nested;
  if (typeof source !== "object" || source === null || Array.isArray(source)) {
    return {};
  }
  const flags = source as Record<string, unknown>;
  return {
    adaptivePhase: flags.adaptivePhase === true,
    controlledMode: flags.controlledMode === true,
    governanceAccess: flags.governanceAccess === true,
    hardMode: flags.hardMode === true,
    riskOverview: flags.riskOverview === true,
  };
};

const resolveLicenseState = (
  decodedToken: Record<string, unknown>,
): LicenseState | null => {
  const normalized = normalizeNonEmptyString(
    decodedToken.licenseState ?? decodedToken.licenseStatus,
  )?.toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized !== "active" && normalized !== "grace" && normalized !== "expired") {
    throw new MiddlewareRejectionError(
      "UNAUTHORIZED",
      "Authentication token has malformed license entitlement claims.",
    );
  }

  return normalized;
};

const resolveOptionalTimestampClaim = (
  value: unknown,
): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const normalized = normalizeNonEmptyString(value);
  if (!normalized || Number.isNaN(new Date(normalized).getTime())) {
    throw new MiddlewareRejectionError(
      "UNAUTHORIZED",
      "Authentication token has malformed license entitlement claims.",
    );
  }

  return normalized;
};

const resolveAuthorizationVersion = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new MiddlewareRejectionError(
      "UNAUTHORIZED",
      "Authentication token has malformed authorization authority.",
    );
  }
  return Number(value);
};

const resolveExamSessionClaims = (
  decodedToken: Record<string, unknown>,
): MiddlewareExamSessionClaims | null => {
  const claims = {
    launchNonce: normalizeNonEmptyString(decodedToken.launchNonce),
    runId: normalizeNonEmptyString(decodedToken.runId),
    sessionId: normalizeNonEmptyString(decodedToken.sessionId),
    studentId: normalizeNonEmptyString(decodedToken.studentId),
    yearId: normalizeNonEmptyString(decodedToken.yearId),
  };
  const sessionMarkerValues = [
    claims.launchNonce,
    claims.runId,
    claims.sessionId,
    claims.yearId,
  ];
  if (sessionMarkerValues.every((value) => value === null)) {
    return null;
  }
  const values = Object.values(claims);
  if (values.some((value) => value === null)) {
    throw new MiddlewareRejectionError(
      "UNAUTHORIZED",
      "Authentication token has incomplete exam session claims.",
    );
  }

  return claims as MiddlewareExamSessionClaims;
};

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
    authorizationVersion: resolveAuthorizationVersion(
      decodedToken.authorizationVersion,
    ),
    examSession: resolveExamSessionClaims(decodedToken),
    expiryDate: resolveOptionalTimestampClaim(decodedToken.expiryDate),
    featureFlags: resolveFeatureFlags(decodedToken),
    gracePeriodEndsAt: resolveOptionalTimestampClaim(
      decodedToken.gracePeriodEndsAt,
    ),
    instituteId: resolveInstituteClaim(decodedToken),
    isSuspended: Boolean(decodedToken.isSuspended),
    isVendor: role === "vendor" || Boolean(decodedToken.isVendor),
    licenseLayer,
    licenseState: resolveLicenseState(decodedToken),
    licenseVersion: normalizeNonEmptyString(decodedToken.licenseVersion),
    role,
    studentId: role === "student" ? resolveStudentId(decodedToken, uid) : null,
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
  } catch (error) {
    if (error instanceof InstituteAuthorityEnforcementError) {
      throw mapInstituteAuthorityRejection(error);
    }
    throw new MiddlewareRejectionError(
      "UNAUTHORIZED",
      "Invalid or expired authentication token.",
    );
  }

  if (decodedToken.isSuspended) {
    throw new MiddlewareRejectionError(
      "FORBIDDEN",
      SUSPENDED_ACCOUNT_MESSAGE,
    );
  }

  const identity = buildIdentityContext(decodedToken);
  setRequestIdentity(request, identity);

  if (options.attachStudentId && identity.studentId) {
    setRequestData(request, {
      studentId: identity.studentId,
    });
  }

  if (
    options.promoteInvitedStudentOnAuthenticate &&
    identity.role === "student" &&
    identity.instituteId
  ) {
    const activateInvitedStudentOnFirstLogin =
      dependencies.activateInvitedStudentOnFirstLogin ??
      studentOnboardingActivationService.activateInvitedStudentOnFirstLogin.bind(
        studentOnboardingActivationService,
      );

    try {
      await activateInvitedStudentOnFirstLogin({
        instituteId: identity.instituteId,
        studentId: identity.studentId ?? identity.uid,
      });
    } catch (error) {
      if (error instanceof InstituteAuthorityEnforcementError) {
        throw mapInstituteAuthorityRejection(error);
      }
      throw error;
    }
  }

  await next();
};

export {
  SUSPENDED_ACCOUNT_MESSAGE,
  buildIdentityContext,
  getBearerToken,
  normalizeRole,
  resolveInstituteClaim,
  resolveExamSessionClaims,
  resolveFeatureFlags,
  resolveLicenseState,
  resolveStudentId,
};
