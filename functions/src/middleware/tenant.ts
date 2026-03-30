import {
  Middleware,
  MiddlewareRejectionError,
  MiddlewareRequest,
} from "../types/middleware";

export interface TenantGuardMiddlewareOptions {
  allowVendorBypass?: boolean;
  mismatchMessage?: string;
  resolveRequestInstituteId: (
    request: MiddlewareRequest,
  ) => string | null | undefined;
}

const DEFAULT_TENANT_MISMATCH_MESSAGE =
  "Token instituteId does not match request instituteId.";

const normalizeInstituteId = (
  value: string | null | undefined,
): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue || null;
};

export const createTenantGuardMiddleware = (
  options: TenantGuardMiddlewareOptions,
): Middleware => async (request, _response, next): Promise<void> => {
  const identity = request.context.identity;

  if (!identity) {
    throw new MiddlewareRejectionError(
      "UNAUTHORIZED",
      "Authenticated request context is required.",
    );
  }

  if (identity.isVendor && options.allowVendorBypass !== false) {
    await next();
    return;
  }

  const requestInstituteId = normalizeInstituteId(
    options.resolveRequestInstituteId(request),
  );

  if (!requestInstituteId) {
    await next();
    return;
  }

  if (identity.instituteId !== requestInstituteId) {
    throw new MiddlewareRejectionError(
      "TENANT_MISMATCH",
      options.mismatchMessage ?? DEFAULT_TENANT_MISMATCH_MESSAGE,
    );
  }

  await next();
};

export {DEFAULT_TENANT_MISMATCH_MESSAGE};
