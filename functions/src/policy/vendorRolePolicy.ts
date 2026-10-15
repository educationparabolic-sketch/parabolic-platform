// Deployable mirror of the shared Vendor capability/claim policy. Contract-tested for parity.
export const VENDOR_CAPABILITY_ROLES = {
  "portal.vendor.access": ["vendor"],
  "vendor.overview.read": ["vendor"],
  "vendor.institutes.read": ["vendor"],
  "vendor.institutes.manage_lifecycle": ["vendor"],
  "vendor.licenses.manage": ["vendor"],
  "vendor.calibration.manage": ["vendor"],
  "vendor.intelligence.read": ["vendor"],
  "vendor.system_health.read": ["vendor"],
  "vendor.audit.read": ["vendor"],
  "vendor.support.manage": ["vendor"],
} as const;

export type VendorCapability = keyof typeof VENDOR_CAPABILITY_ROLES;

export const hasConsistentVendorClaims = (claims: Record<string, unknown>): boolean =>
  claims.role === "vendor" &&
  (claims.userRole === undefined || claims.userRole === "vendor") &&
  (claims.isVendor === undefined || claims.isVendor === true) &&
  (claims.isSuspended === undefined || claims.isSuspended === false) &&
  (claims.suspended === undefined || claims.suspended === false);
