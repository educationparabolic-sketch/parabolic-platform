import {
  Middleware,
  MiddlewareRejectionError,
} from "../types/middleware";
import {
  enforceActiveLicenseEntitlement,
  LicenseEntitlementEnforcementDependencies,
} from "./licenseEntitlement";

export const DEFAULT_GOVERNANCE_LICENSE_MESSAGE =
  "Governance access requires license layer L3.";

export const createGovernanceAccessMiddleware = (
  enforcementDependencies?: LicenseEntitlementEnforcementDependencies,
): Middleware =>
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

    await enforceActiveLicenseEntitlement(identity, enforcementDependencies);

    if (identity.licenseLayer !== "L3") {
      throw new MiddlewareRejectionError(
        "LICENSE_RESTRICTED",
        DEFAULT_GOVERNANCE_LICENSE_MESSAGE,
      );
    }

    await next();
  };
