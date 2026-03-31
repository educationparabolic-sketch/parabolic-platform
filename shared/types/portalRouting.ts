export type PortalRole = "student" | "teacher" | "admin" | "director" | "vendor";

export type LicenseLayer = "L0" | "L1" | "L2" | "L3";

export type PortalDomainKey = "marketing" | "portal" | "exam" | "vendor" | "development";

export type RouteAccessFailureReason =
  | "unauthenticated"
  | "unauthorized"
  | "license_restricted"
  | "inactive_institute"
  | "suspended_account"
  | "invalid_domain";

export interface RoutingSessionContext {
  isAuthenticated: boolean;
  role: PortalRole | null;
  licenseLayer: LicenseLayer | null;
  instituteActive: boolean;
  isSuspended: boolean;
}

export interface PortalRouteFamilyDefinition {
  family: "login" | "unauthorized" | "admin" | "student" | "exam" | "vendor" | "public";
  matchPrefix: string;
  canonicalDomain: PortalDomainKey;
  allowedRoles: PortalRole[];
  requiresAuthentication: boolean;
  minimumLicenseLayer?: LicenseLayer;
}

export interface PortalDomainDefinition {
  key: PortalDomainKey;
  hostname: string;
  allowedFamilies: PortalRouteFamilyDefinition["family"][];
}

export interface RouteAccessDecision {
  allowed: boolean;
  redirectTo: string | null;
  reason: RouteAccessFailureReason | null;
}

export const LICENSE_LAYER_ORDER: Record<LicenseLayer, number> = {
  L0: 0,
  L1: 1,
  L2: 2,
  L3: 3,
};

export const PORTAL_DOMAINS: Record<PortalDomainKey, PortalDomainDefinition> = {
  marketing: {
    key: "marketing",
    hostname: "yourdomain.com",
    allowedFamilies: ["public", "login", "unauthorized"],
  },
  portal: {
    key: "portal",
    hostname: "portal.yourdomain.com",
    allowedFamilies: ["admin", "student", "login", "unauthorized"],
  },
  exam: {
    key: "exam",
    hostname: "exam.yourdomain.com",
    allowedFamilies: ["exam", "login", "unauthorized"],
  },
  vendor: {
    key: "vendor",
    hostname: "vendor.yourdomain.com",
    allowedFamilies: ["vendor", "login", "unauthorized"],
  },
  development: {
    key: "development",
    hostname: "localhost",
    allowedFamilies: ["public", "admin", "student", "exam", "vendor", "login", "unauthorized"],
  },
};

export const ROUTE_FAMILIES: PortalRouteFamilyDefinition[] = [
  {
    family: "login",
    matchPrefix: "/login",
    canonicalDomain: "portal",
    allowedRoles: [],
    requiresAuthentication: false,
  },
  {
    family: "unauthorized",
    matchPrefix: "/unauthorized",
    canonicalDomain: "portal",
    allowedRoles: [],
    requiresAuthentication: false,
  },
  {
    family: "admin",
    matchPrefix: "/admin",
    canonicalDomain: "portal",
    allowedRoles: ["teacher", "admin", "director"],
    requiresAuthentication: true,
  },
  {
    family: "student",
    matchPrefix: "/student",
    canonicalDomain: "portal",
    allowedRoles: ["student"],
    requiresAuthentication: true,
  },
  {
    family: "exam",
    matchPrefix: "/session",
    canonicalDomain: "exam",
    allowedRoles: ["student"],
    requiresAuthentication: true,
  },
  {
    family: "vendor",
    matchPrefix: "/vendor",
    canonicalDomain: "vendor",
    allowedRoles: ["vendor"],
    requiresAuthentication: true,
  },
];

export const DEFAULT_ROUTE_BY_ROLE: Record<PortalRole, string> = {
  student: "/student/dashboard",
  teacher: "/admin/overview",
  admin: "/admin/overview",
  director: "/admin/governance/stability",
  vendor: "/vendor/overview",
};
