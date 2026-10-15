import {DecodedIdToken, UserRecord} from "firebase-admin/auth";
import {createAuthenticationMiddleware} from "../middleware/auth";
import {createRoleAuthorizationMiddleware} from "../middleware/role";
import {assertCurrentVendorIdentity} from "../middleware/currentVendor";
import {VENDOR_CAPABILITY_ROLES} from "../policy/vendorRolePolicy";
import {Middleware, MiddlewareRejectionError, MiddlewareRequest} from "../types/middleware";
import type {VendorAuditEventsQuery} from "../../../shared/contracts/vendorAuditHealth";

export type VendorReadCapability = "vendor.audit.read" | "vendor.system_health.read";

export interface VendorAuditHealthIdentityDependencies {
  getUser: (uid: string) => Promise<UserRecord>;
  verifyIdToken: (token: string) => Promise<DecodedIdToken>;
}

const invalidIntent = (): never => {
  throw new MiddlewareRejectionError("VALIDATION_ERROR", "Unsupported audit or health read intent.");
};

export const vendorAuditHealthMiddlewares = (
  capability: VendorReadCapability,
  dependencies: VendorAuditHealthIdentityDependencies,
): Middleware[] => [
  async (request, response, next): Promise<void> => {
    response.setHeader("Cache-Control", "private, no-store");
    if (request.method !== "GET") {
      response.setHeader("Allow", "GET");
      throw new MiddlewareRejectionError("METHOD_NOT_ALLOWED", "Use GET.");
    }
    await next();
  },
  createAuthenticationMiddleware(dependencies),
  createRoleAuthorizationMiddleware({
    allowedRoles: VENDOR_CAPABILITY_ROLES[capability],
    forbiddenMessage: `Capability ${capability} requires Vendor authority.`,
  }),
  async (request, _response, next): Promise<void> => {
    await assertCurrentVendorIdentity(request, dependencies, capability);
    await next();
  },
];

export const parseVendorAuditHealthIntent = (
  request: MiddlewareRequest,
  kind: "audit" | "health",
): VendorAuditEventsQuery => {
  const route = kind === "audit" ? "/vendor/audit-events" : "/vendor/system-health";
  // Direct exports accept their root or their own canonical path. Firebase's
  // server-owned wildcard params are irrelevant to caller intent.
  if (!["/", route, `/api/v1${route}`].includes(request.path)) return invalidIntent();
  if ((request.rawBody && request.rawBody.length > 0) ||
    (request.body !== undefined && request.body !== null &&
      (typeof request.body !== "object" || Array.isArray(request.body) ||
        Object.keys(request.body).length > 0))) return invalidIntent();
  const allowed = kind === "audit" ?
    ["category", "instituteId", "status", "from", "to", "limit", "cursor"] : [];
  const rawQuery = new URLSearchParams(request.url.split("?").slice(1).join("?"));
  const seen = new Set<string>();
  for (const key of rawQuery.keys()) {
    if (!allowed.includes(key) || seen.has(key)) return invalidIntent();
    seen.add(key);
  }
  if (Object.keys(request.query).some((key) => !allowed.includes(key))) return invalidIntent();
  const values: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(request.query)) {
    if (typeof value !== "string" || !value || rawQuery.get(key) !== value) return invalidIntent();
    if (key === "limit") {
      if (!/^(?:[1-9]|[1-4][0-9]|50)$/u.test(value)) return invalidIntent();
      values[key] = Number(value);
    } else {
      values[key] = value;
    }
  }
  if (seen.size !== Object.keys(values).length) return invalidIntent();
  // Domain enum/date/ID/cursor validation belongs to the strict read service.
  return values as VendorAuditEventsQuery;
};
