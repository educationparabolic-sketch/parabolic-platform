import {
  LICENSE_LAYER_ORDER,
  type LicenseLayer,
  type RouteAccessDecision,
} from "../../../../shared/types/portalRouting";

export interface StudentRouteDefinition {
  path: string;
  title: string;
  section: string;
  description: string;
  minimumLicenseLayer?: LicenseLayer;
  redirectOnDenied?: string;
}

export const STUDENT_ROUTE_DEFINITIONS: StudentRouteDefinition[] = [
  {
    path: "/student/dashboard",
    title: "Dashboard",
    section: "Student Dashboard",
    description: "Student landing route for performance summary, risk status, and upcoming assignments.",
  },
  {
    path: "/student/my-tests",
    title: "My Tests",
    section: "My Tests",
    description: "Primary route for upcoming, active, and assigned student tests.",
  },
  {
    path: "/student/my-tests/completed",
    title: "Completed Tests",
    section: "My Tests",
    description: "Completed test history grouped under the architecture-defined My Tests section.",
  },
  {
    path: "/student/my-tests/archived",
    title: "Archived Tests",
    section: "My Tests",
    description: "Archived historical test list for completed or older student attempts.",
  },
  {
    path: "/student/performance",
    title: "Performance",
    section: "Performance",
    description: "Historical performance trends and analytics using summary collections rather than raw sessions.",
  },
  {
    path: "/student/performance/:testId",
    title: "Performance Detail",
    section: "Performance",
    description: "Test-specific performance detail for an individual completed assessment.",
  },
  {
    path: "/student/insights",
    title: "Insights",
    section: "Insights",
    description: "Behavioral insight route unlocked for student licenses at L1 and above.",
    minimumLicenseLayer: "L1",
    redirectOnDenied: "/student/dashboard",
  },
  {
    path: "/student/discipline",
    title: "Discipline Metrics",
    section: "Discipline Metrics",
    description: "Student-facing discipline and execution metrics visible only for L2 and above.",
    minimumLicenseLayer: "L2",
    redirectOnDenied: "/student/dashboard",
  },
  {
    path: "/student/profile",
    title: "Profile",
    section: "Profile",
    description: "Editable personal information route limited to student-owned profile fields.",
  },
];

export interface ResolvedStudentRoute {
  definition: StudentRouteDefinition;
  params: Record<string, string>;
}

function escapeSegment(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function matchStudentRoute(pathname: string): ResolvedStudentRoute | null {
  for (const definition of STUDENT_ROUTE_DEFINITIONS) {
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

export function evaluateStudentRoutePermissions(
  route: ResolvedStudentRoute | null,
  licenseLayer: LicenseLayer | null,
): RouteAccessDecision {
  if (!route) {
    return {
      allowed: false,
      redirectTo: "/unauthorized",
      reason: "unauthorized",
    };
  }

  if (
    route.definition.minimumLicenseLayer &&
    (!licenseLayer ||
      LICENSE_LAYER_ORDER[licenseLayer] < LICENSE_LAYER_ORDER[route.definition.minimumLicenseLayer])
  ) {
    return {
      allowed: false,
      redirectTo: route.definition.redirectOnDenied ?? "/student/dashboard",
      reason: "license_restricted",
    };
  }

  return {
    allowed: true,
    redirectTo: null,
    reason: null,
  };
}

export function getVisibleStudentRoutes(licenseLayer: LicenseLayer | null): StudentRouteDefinition[] {
  return STUDENT_ROUTE_DEFINITIONS.filter((definition) => {
    if (
      definition.minimumLicenseLayer &&
      (!licenseLayer ||
        LICENSE_LAYER_ORDER[licenseLayer] < LICENSE_LAYER_ORDER[definition.minimumLicenseLayer])
    ) {
      return false;
    }

    return !definition.path.includes("/:");
  });
}
