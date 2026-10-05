import {DecodedIdToken, UserRecord} from "firebase-admin/auth";
import type {
  VendorIntelligenceQuery,
  VendorIntelligenceWindowMonths,
} from "../../../shared/contracts/vendorIntelligence";
import {createAuthenticationMiddleware} from "../middleware/auth";
import {createRoleAuthorizationMiddleware} from "../middleware/role";
import {
  Middleware,
  MiddlewareRejectionError,
  MiddlewareRequest,
} from "../types/middleware";

export const VENDOR_INTELLIGENCE_CAPABILITY = "vendor.intelligence.read";

export interface VendorIntelligenceIdentityDependencies {
  getUser: (uid: string) => Promise<UserRecord>;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

const invalidQuery = (): never => {
  throw new MiddlewareRejectionError(
    "VALIDATION_ERROR",
    "Intelligence filters allow only one YYYY-MM asOfMonth and one windowMonths of 3, 6, or 12.",
  );
};

// Reject duplicate, nested, unknown, and caller-owned identity/scope fields.
export const parseVendorIntelligenceQuery = (
  request: MiddlewareRequest,
): VendorIntelligenceQuery => {
  if (Object.keys(request.query).some((key) =>
    key !== "asOfMonth" && key !== "windowMonths")) return invalidQuery();
  if (request.body !== undefined && request.body !== null &&
    (typeof request.body !== "object" || Array.isArray(request.body) ||
      Object.keys(request.body).length > 0)) return invalidQuery();
  const asOfMonth = request.query.asOfMonth;
  const windowMonths = request.query.windowMonths;
  if (asOfMonth !== undefined && (typeof asOfMonth !== "string" ||
    !/^\d{4}-(?:0[1-9]|1[0-2])$/u.test(asOfMonth))) return invalidQuery();
  if (windowMonths !== undefined && windowMonths !== "3" &&
    windowMonths !== "6" && windowMonths !== "12") return invalidQuery();
  return {
    ...(asOfMonth === undefined ? {} : {asOfMonth: asOfMonth as string}),
    ...(windowMonths === undefined ? {} : {
      windowMonths: Number(windowMonths) as VendorIntelligenceWindowMonths,
    }),
  };
};

// Check current global Vendor authority after revocation-checked verification.
export const intelligenceReadMiddlewares = (
  dependencies: VendorIntelligenceIdentityDependencies,
): Middleware[] => [
  async (request, response, next): Promise<void> => {
    if (request.method !== "GET") {
      response.setHeader("Allow", "GET");
      throw new MiddlewareRejectionError("METHOD_NOT_ALLOWED", "Use GET.");
    }
    await next();
  },
  createAuthenticationMiddleware(dependencies),
  createRoleAuthorizationMiddleware({
    allowedRoles: ["vendor"],
    forbiddenMessage: `Capability ${VENDOR_INTELLIGENCE_CAPABILITY} requires Vendor authority.`,
  }),
  async (request, _response, next): Promise<void> => {
    const identity = request.context.identity;
    if (!identity || identity.role !== "vendor" || !identity.isVendor) {
      throw new MiddlewareRejectionError("FORBIDDEN", "Vendor authority is required.");
    }
    let user: UserRecord;
    try {
      user = await dependencies.getUser(identity.uid);
    } catch (error) {
      if ((error as {code?: string}).code === "auth/user-not-found") {
        throw new MiddlewareRejectionError("UNAUTHORIZED", "Current identity is unavailable.");
      }
      throw error;
    }
    const claims = user.customClaims ?? {};
    if (user.disabled || claims.isSuspended === true || claims.role !== "vendor" ||
      claims.isVendor === false) {
      throw new MiddlewareRejectionError(
        "FORBIDDEN",
        `Current identity cannot use capability ${VENDOR_INTELLIGENCE_CAPABILITY}.`,
      );
    }
    await next();
  },
];
