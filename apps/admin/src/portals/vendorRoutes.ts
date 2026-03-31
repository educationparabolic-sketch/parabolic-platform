import type { PortalRole, RouteAccessDecision } from "../../../../shared/types/portalRouting";

export interface VendorRouteDefinition {
  path: string;
  title: string;
  section: string;
  description: string;
  allowedRoles: PortalRole[];
  redirectOnDenied?: string;
}

export const VENDOR_ROUTE_DEFINITIONS: VendorRouteDefinition[] = [
  {
    path: "/vendor/overview",
    title: "Vendor Overview",
    section: "Vendor Overview",
    description: "Global operational metrics, commercial posture, and platform-wide status for vendor administrators.",
    allowedRoles: ["vendor"],
  },
  {
    path: "/vendor/institutes",
    title: "Institutes",
    section: "Institutes",
    description: "Cross-institute management surface for tenant discovery, status review, and portfolio navigation.",
    allowedRoles: ["vendor"],
  },
  {
    path: "/vendor/institutes/:instituteId",
    title: "Institute Detail",
    section: "Institutes",
    description: "Institute-specific vendor view for tenant health, licensing posture, and operational drill-in.",
    allowedRoles: ["vendor"],
  },
  {
    path: "/vendor/licensing",
    title: "Licensing",
    section: "Licensing Management",
    description: "Vendor-only license management route for institute entitlements, layer upgrades, and feature access control.",
    allowedRoles: ["vendor"],
  },
  {
    path: "/vendor/calibration",
    title: "Calibration",
    section: "Calibration",
    description: "Calibration deployment workspace for version review and controlled rollout planning.",
    allowedRoles: ["vendor"],
  },
  {
    path: "/vendor/calibration/simulate",
    title: "Calibration Simulation",
    section: "Calibration",
    description: "Simulation route for testing future calibration behavior before deployment.",
    allowedRoles: ["vendor"],
  },
  {
    path: "/vendor/calibration/history",
    title: "Calibration History",
    section: "Calibration",
    description: "Historical calibration timeline for prior deployments, revisions, and vendor review.",
    allowedRoles: ["vendor"],
  },
  {
    path: "/vendor/intelligence",
    title: "Global Intelligence",
    section: "Global Intelligence",
    description: "Cross-institute behavioral analytics and platform intelligence summaries at the vendor layer.",
    allowedRoles: ["vendor"],
  },
  {
    path: "/vendor/revenue",
    title: "Revenue Dashboard",
    section: "Revenue Dashboard",
    description: "Subscription, billing, and revenue metrics across the vendor portfolio.",
    allowedRoles: ["vendor"],
  },
  {
    path: "/vendor/system-health",
    title: "System Health",
    section: "System Health",
    description: "Operational monitoring for Firestore usage, Cloud Functions activity, and platform error visibility.",
    allowedRoles: ["vendor"],
  },
  {
    path: "/vendor/audit",
    title: "Audit Logs",
    section: "Audit Logs",
    description: "Full system audit viewer for vendor governance, operational review, and immutable event inspection.",
    allowedRoles: ["vendor"],
  },
];

export interface ResolvedVendorRoute {
  definition: VendorRouteDefinition;
  params: Record<string, string>;
}

function escapeSegment(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function matchVendorRoute(pathname: string): ResolvedVendorRoute | null {
  for (const definition of VENDOR_ROUTE_DEFINITIONS) {
    const params: Record<string, string> = {};
    const pattern = definition.path
      .split("/")
      .map((segment) => {
        if (!segment) {
          return "";
        }

        if (segment.startsWith(":")) {
          return `(?<${segment.slice(1)}>[^/]+)`;
        }

        return escapeSegment(segment);
      })
      .join("/");
    const matcher = new RegExp(`^${pattern}$`);
    const match = matcher.exec(pathname);

    if (!match) {
      continue;
    }

    for (const [key, value] of Object.entries(match.groups ?? {})) {
      params[key] = decodeURIComponent(value);
    }

    return {
      definition,
      params,
    };
  }

  return null;
}

export function evaluateVendorRoutePermissions(
  route: ResolvedVendorRoute | null,
  role: PortalRole | null,
): RouteAccessDecision {
  if (!route) {
    return {
      allowed: false,
      redirectTo: "/unauthorized",
      reason: "unauthorized",
    };
  }

  if (!role || !route.definition.allowedRoles.includes(role)) {
    return {
      allowed: false,
      redirectTo: route.definition.redirectOnDenied ?? "/unauthorized",
      reason: "unauthorized",
    };
  }

  return {
    allowed: true,
    redirectTo: null,
    reason: null,
  };
}

export function getVisibleVendorRoutes(role: PortalRole | null): VendorRouteDefinition[] {
  return VENDOR_ROUTE_DEFINITIONS.filter((definition) => {
    if (!role || !definition.allowedRoles.includes(role)) {
      return false;
    }

    return !definition.path.includes("/:");
  });
}
