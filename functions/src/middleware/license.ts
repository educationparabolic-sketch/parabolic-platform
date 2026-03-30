import {
  LicenseLayer,
  Middleware,
  MiddlewareRejectionError,
} from "../types/middleware";

export interface LicenseEnforcementMiddlewareOptions {
  requiredLayer: LicenseLayer;
  restrictionMessage?: string;
}

const LAYER_ORDER: Record<LicenseLayer, number> = {
  L0: 0,
  L1: 1,
  L2: 2,
  L3: 3,
};

export const DEFAULT_LICENSE_RESTRICTED_MESSAGE =
  "Current license layer does not permit this operation.";

export const isLicenseLayerSufficient = (
  currentLayer: LicenseLayer,
  requiredLayer: LicenseLayer,
): boolean => LAYER_ORDER[currentLayer] >= LAYER_ORDER[requiredLayer];

export const createLicenseEnforcementMiddleware = (
  options: LicenseEnforcementMiddlewareOptions,
): Middleware => async (request, _response, next): Promise<void> => {
  const identity = request.context?.identity;

  if (!identity?.licenseLayer) {
    throw new MiddlewareRejectionError(
      "UNAUTHORIZED",
      "Authenticated request context is required.",
    );
  }

  if (
    !isLicenseLayerSufficient(identity.licenseLayer, options.requiredLayer)
  ) {
    throw new MiddlewareRejectionError(
      "LICENSE_RESTRICTED",
      options.restrictionMessage ?? DEFAULT_LICENSE_RESTRICTED_MESSAGE,
    );
  }

  await next();
};
