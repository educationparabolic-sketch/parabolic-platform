import {
  Middleware,
  MiddlewareRejectionError,
} from "../types/middleware";

export const DEFAULT_GOVERNANCE_LICENSE_MESSAGE =
  "Governance access requires license layer L3.";

export const createGovernanceAccessMiddleware = (): Middleware =>
  async (request, _response, next): Promise<void> => {
    const identity = request.context?.identity;

    if (!identity) {
      throw new MiddlewareRejectionError(
        "UNAUTHORIZED",
        "Authenticated request context is required.",
      );
    }

    if (identity.isVendor) {
      await next();
      return;
    }

    if (identity.licenseLayer !== "L3") {
      throw new MiddlewareRejectionError(
        "LICENSE_RESTRICTED",
        DEFAULT_GOVERNANCE_LICENSE_MESSAGE,
      );
    }

    await next();
  };
