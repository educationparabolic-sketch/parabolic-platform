export type PortalKey = "admin" | "student" | "exam" | "vendor";

export interface PortalDefinition {
  key: PortalKey;
  name: string;
  domain: string;
  routePrefix: string;
  purpose: string;
}

export const PORTAL_MANIFEST: Record<PortalKey, PortalDefinition> = {
  admin: {
    key: "admin",
    name: "Admin Portal",
    domain: "portal.yourdomain.com/admin",
    routePrefix: "/admin",
    purpose: "Institute control and academic operations",
  },
  student: {
    key: "student",
    name: "Student Portal",
    domain: "portal.yourdomain.com/student",
    routePrefix: "/student",
    purpose: "Student profile, performance, and insights",
  },
  exam: {
    key: "exam",
    name: "Exam Portal",
    domain: "exam.yourdomain.com",
    routePrefix: "/session",
    purpose: "Secure test execution runtime",
  },
  vendor: {
    key: "vendor",
    name: "Vendor Portal",
    domain: "vendor.yourdomain.com",
    routePrefix: "/vendor",
    purpose: "Platform-wide operations and controls",
  },
};
