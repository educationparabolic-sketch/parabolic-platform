import {
  LicenseLayer,
  Middleware,
  MiddlewareRejectionError,
} from "../types/middleware";

const LICENSE_ORDER: Readonly<Record<LicenseLayer, number>> = {
  L0: 0,
  L1: 1,
  L2: 2,
  L3: 3,
};

export interface CapabilityAuthorizationOptions {
  minimumLicenseLayer: LicenseLayer;
  requiredFeatureFlag: string;
  roleMinimumLicenseLayers?: Readonly<Record<string, LicenseLayer>>;
  vendorBypass?: boolean;
}

/**
 * Enforces verified-claim license and feature capability authority.
 * @param {CapabilityAuthorizationOptions} options Capability policy.
 * @return {Middleware} Capability middleware.
 */
export const createCapabilityAuthorizationMiddleware = (
  options: CapabilityAuthorizationOptions,
): Middleware => async (request, _response, next): Promise<void> => {
  const identity = request.context.identity;
  if (!identity) {
    throw new MiddlewareRejectionError(
      "UNAUTHORIZED",
      "Authenticated request context is required.",
    );
  }
  if (identity.isVendor && options.vendorBypass === true) {
    await next();
    return;
  }
  const requiredLayer = options.roleMinimumLicenseLayers?.[identity.role] ??
    options.minimumLicenseLayer;
  if (!identity.licenseLayer ||
    LICENSE_ORDER[identity.licenseLayer] < LICENSE_ORDER[requiredLayer]) {
    throw new MiddlewareRejectionError(
      "LICENSE_RESTRICTED",
      `Capability requires license layer ${requiredLayer}.`,
    );
  }
  if (identity.featureFlags?.[options.requiredFeatureFlag] !== true) {
    throw new MiddlewareRejectionError(
      "FORBIDDEN",
      `Capability ${options.requiredFeatureFlag} is disabled.`,
    );
  }
  await next();
};
