export type PortalKey = "admin" | "student" | "exam" | "vendor";

export interface PortalDefinition {
  key: PortalKey;
  name: string;
  domain: string;
  routePrefix: string;
  loginPath: string;
  defaultAuthenticatedPath: string;
  purpose: string;
}

export const PORTAL_MANIFEST: Record<PortalKey, PortalDefinition> = {
  admin: {
    key: "admin",
    name: "Admin Portal",
    domain: "portal.yourdomain.com/admin",
    routePrefix: "/admin",
    loginPath: "/login",
    defaultAuthenticatedPath: "/admin/overview",
    purpose: "Institute control and academic operations",
  },
  student: {
    key: "student",
    name: "Student Portal",
    domain: "portal.yourdomain.com/student",
    routePrefix: "/student",
    loginPath: "/student/login",
    defaultAuthenticatedPath: "/student/dashboard",
    purpose: "Student profile, performance, and insights",
  },
  exam: {
    key: "exam",
    name: "Exam Portal",
    domain: "exam.yourdomain.com",
    routePrefix: "/session",
    loginPath: "/",
    defaultAuthenticatedPath: "/",
    purpose: "Secure test execution runtime",
  },
  vendor: {
    key: "vendor",
    name: "Vendor Portal",
    domain: "vendor.yourdomain.com",
    routePrefix: "/vendor",
    loginPath: "/vendor/login",
    defaultAuthenticatedPath: "/vendor/overview",
    purpose: "Platform-wide operations and controls",
  },
};
