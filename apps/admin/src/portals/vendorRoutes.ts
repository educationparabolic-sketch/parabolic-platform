import { CAPABILITY_MATRIX, type PortalCapability } from "../../../../shared/contracts/capabilityPolicy";
import type { PortalRole, RouteAccessDecision } from "../../../../shared/types/portalRouting";


export interface VendorRouteDefinition {
  path: string;
  title: string;
  section: string;
  description: string;
  capability: PortalCapability;
  readCapabilities: readonly PortalCapability[];
  allowedRoles: readonly PortalRole[];
  redirectOnDenied?: string;
}

export const VENDOR_ROUTE_DEFINITIONS: VendorRouteDefinition[] = [
  {
    path: "/vendor/overview",
    title: "Vendor Overview",
    section: "Vendor Overview",
    description:
      "Completed portfolio snapshots and bounded audit/operational source evidence; unsupported cloud and global risk signals are unavailable.",
    capability: "vendor.overview.read",
    readCapabilities: ["vendor.intelligence.read", "vendor.audit.read", "vendor.system_health.read"],
    allowedRoles: CAPABILITY_MATRIX["vendor.overview.read"].allowedRoles,
  },
  {
    path: "/vendor/institutes",
    title: "Institutes",
    section: "Institutes",
    description:
      "Cross-institute management surface for tenant discovery, status review, and portfolio navigation.",
    capability: "vendor.institutes.read",
    readCapabilities: ["vendor.institutes.read"],
    allowedRoles: CAPABILITY_MATRIX["vendor.institutes.read"].allowedRoles,
  },
  {
    path: "/vendor/institutes/:instituteId",
    title: "Institute Detail",
    section: "Institutes",
    description:
      "Institute-specific vendor view for tenant health, licensing posture, and operational drill-in.",
    capability: "vendor.institutes.read",
    readCapabilities: ["vendor.institutes.read"],
    allowedRoles: CAPABILITY_MATRIX["vendor.institutes.read"].allowedRoles,
  },
  {
    path: "/vendor/licensing",
    title: "Licensing",
    section: "Licensing Management",
    description:
      "Vendor-controlled catalogue for pricing, capacity parameters, validation, and versioned publication.",
    capability: "vendor.licenses.manage",
    readCapabilities: ["vendor.licenses.manage"],
    allowedRoles: CAPABILITY_MATRIX["vendor.licenses.manage"].allowedRoles,
  },
  {
    path: "/vendor/calibration",
    title: "Calibration",
    section: "Calibration",
    description:
      "Calibration deployment workspace for version review and controlled rollout planning.",
    capability: "vendor.calibration.manage",
    readCapabilities: ["vendor.calibration.manage", "vendor.institutes.read"],
    allowedRoles: CAPABILITY_MATRIX["vendor.calibration.manage"].allowedRoles,
  },
  {
    path: "/vendor/calibration/simulate",
    title: "Calibration Simulation",
    section: "Calibration",
    description: "Compatibility page linking to the existing read-only projection in Calibration.",
    capability: "vendor.calibration.manage",
    readCapabilities: [],
    allowedRoles: CAPABILITY_MATRIX["vendor.calibration.manage"].allowedRoles,
  },
  {
    path: "/vendor/calibration/history",
    title: "Calibration History",
    section: "Calibration",
    description:
      "Compatibility page: a complete operation timeline is unavailable; versions, captured recovery and server audit have existing destinations.",
    capability: "vendor.calibration.manage",
    readCapabilities: [],
    allowedRoles: CAPABILITY_MATRIX["vendor.calibration.manage"].allowedRoles,
  },
  {
    path: "/vendor/intelligence",
    title: "Global Intelligence",
    section: "Global Intelligence",
    description:
      "Cross-institute behavioral analytics and platform intelligence summaries at the vendor layer.",
    capability: "vendor.intelligence.read",
    readCapabilities: ["vendor.intelligence.read"],
    allowedRoles: CAPABILITY_MATRIX["vendor.intelligence.read"].allowedRoles,
  },
  {
    path: "/vendor/system-health",
    title: "System Health",
    section: "System Health",
    description:
      "Current release identity and bounded persisted queue/recovery evidence; cloud metrics, costs and alert monitoring are unavailable.",
    capability: "vendor.system_health.read",
    readCapabilities: ["vendor.system_health.read"],
    allowedRoles: CAPABILITY_MATRIX["vendor.system_health.read"].allowedRoles,
  },
  {
    path: "/vendor/audit",
    title: "Audit Logs",
    section: "Audit Logs",
    description:
      "Bounded, filtered audit reads from six existing server source families; page-local search is not full-system coverage.",
    capability: "vendor.audit.read",
    readCapabilities: ["vendor.audit.read"],
    allowedRoles: CAPABILITY_MATRIX["vendor.audit.read"].allowedRoles,
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

export interface VendorRouteAccessContext {
  role: PortalRole | null;
  canAccessVendorPortal: boolean;
  canUseCapability: (capability: PortalCapability) => boolean;
}

export function evaluateVendorRoutePermissions(
  route: ResolvedVendorRoute | null,
  context: PortalRole | null | VendorRouteAccessContext,
): RouteAccessDecision {
  const role = typeof context === "object" && context !== null ? context.role : context;
  if (!route) {
    return {
      allowed: false,
      redirectTo: "/unauthorized",
      reason: "unauthorized",
    };
  }

  const capabilities = [route.definition.capability, ...route.definition.readCapabilities];
  const authorized = typeof context === "object" && context !== null
    ? context.canAccessVendorPortal && capabilities.every(capability => context.canUseCapability(capability))
    : Boolean(role) && capabilities.every(capability => CAPABILITY_MATRIX[capability].allowedRoles.some(allowed => allowed === role));
  if (!role || !route.definition.allowedRoles.includes(role) || !authorized) {
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

export function getVisibleVendorRoutes(context: PortalRole | null | VendorRouteAccessContext): VendorRouteDefinition[] {
  return VENDOR_ROUTE_DEFINITIONS.filter((definition) => {
    if (!evaluateVendorRoutePermissions({ definition, params: {} }, context).allowed) {
      return false;
    }

    return !definition.path.includes("/:");
  });
}
