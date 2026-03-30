import {
  Middleware,
  MiddlewareRejectionError,
} from "../types/middleware";

export interface RoleAuthorizationMiddlewareOptions {
  allowedRoles: readonly string[];
  forbiddenMessage?: string;
}

const DEFAULT_FORBIDDEN_MESSAGE = "Insufficient role privileges.";

const normalizeRole = (
  role: string,
): string => role.trim().toLowerCase();

export const createRoleAuthorizationMiddleware = (
  options: RoleAuthorizationMiddlewareOptions,
): Middleware => async (request, _response, next): Promise<void> => {
  const identity = request.context?.identity;

  if (!identity) {
    throw new MiddlewareRejectionError(
      "UNAUTHORIZED",
      "Authenticated request context is required.",
    );
  }

  const allowedRoles = new Set(
    options.allowedRoles
      .map((role) => normalizeRole(role))
      .filter((role) => Boolean(role)),
  );

  if (!allowedRoles.has(normalizeRole(identity.role))) {
    throw new MiddlewareRejectionError(
      "FORBIDDEN",
      options.forbiddenMessage ?? DEFAULT_FORBIDDEN_MESSAGE,
    );
  }

  await next();
};

export {DEFAULT_FORBIDDEN_MESSAGE};
