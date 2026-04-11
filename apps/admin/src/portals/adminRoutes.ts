import { LICENSE_LAYER_ORDER, type LicenseLayer, type PortalRole, type RouteAccessDecision } from "../../../../shared/types/portalRouting";

export interface AdminRouteDefinition {
  path: string;
  title: string;
  section: string;
  description: string;
  allowedRoles: PortalRole[];
  minimumLicenseLayer?: LicenseLayer;
  redirectOnDenied?: string;
  readOnlyRoles?: PortalRole[];
}

export const ADMIN_ROUTE_DEFINITIONS: AdminRouteDefinition[] = [
  {
    path: "/admin/overview",
    title: "Overview",
    section: "Admin Overview",
    description: "Real-time operational, performance, execution, risk, and governance snapshots adapt to role and license layer.",
    allowedRoles: ["admin", "teacher", "director"],
  },
  {
    path: "/admin/students",
    title: "Students",
    section: "Students Management",
    description: "Student search, filters, batch views, archive visibility, and drill-in navigation anchored to institute-scoped student metrics.",
    allowedRoles: ["admin", "teacher"],
  },
  {
    path: "/admin/students/list",
    title: "Student List",
    section: "Students Management",
    description: "Primary roster view for search, filters, status toggles, and drill-in navigation to individual student profiles.",
    allowedRoles: ["admin", "teacher"],
  },
  {
    path: "/admin/students/bulk-upload",
    title: "Bulk Upload",
    section: "Students Management",
    description: "Bulk import and export entry point for controlled student onboarding workflows.",
    allowedRoles: ["admin", "teacher"],
  },
  {
    path: "/admin/students/lifecycle",
    title: "Student Lifecycle",
    section: "Students Management",
    description: "Lifecycle management surface for active and archived student records.",
    allowedRoles: ["admin", "teacher"],
  },
  {
    path: "/admin/students/batches",
    title: "Batch Management",
    section: "Students Management",
    description: "Batch-level student organization and roster views.",
    allowedRoles: ["admin", "teacher"],
  },
  {
    path: "/admin/students/archive",
    title: "Archived Students",
    section: "Students Management",
    description: "Archive review surface for inactive or historical student records.",
    allowedRoles: ["admin", "teacher"],
  },
  {
    path: "/admin/students/:studentId",
    title: "Student Profile",
    section: "Students Management",
    description: "Academic summary, trends, execution profile, risk indicators, and assignment history for an individual student.",
    allowedRoles: ["admin", "teacher"],
  },
  {
    path: "/admin/tests",
    title: "Tests",
    section: "Test Templates",
    description: "Entry point for template generation, saved tests, live monitoring, and template analytics.",
    allowedRoles: ["admin", "teacher"],
  },
  {
    path: "/admin/tests/create",
    title: "Create Test",
    section: "Test Templates",
    description: "Template generation surface covering filter builders, selection mode, and duplicate detection.",
    allowedRoles: ["admin", "teacher"],
  },
  {
    path: "/admin/tests/:testId",
    title: "Test Detail",
    section: "Test Templates",
    description: "Template preview, management, and lifecycle view for an individual test definition.",
    allowedRoles: ["admin", "teacher"],
  },
  {
    path: "/admin/tests/analytics/:testId",
    title: "Template Analytics",
    section: "Test Templates",
    description: "Template effectiveness, difficulty distribution, and outcome summaries for a selected test.",
    allowedRoles: ["admin", "teacher"],
  },
  {
    path: "/admin/assignments",
    title: "Assignments",
    section: "Assignments",
    description: "Assignment scheduling, active run monitoring, completed run summaries, and email controls.",
    allowedRoles: ["admin", "teacher"],
  },
  {
    path: "/admin/assignments/create",
    title: "Create Assignment",
    section: "Assignments",
    description: "Assignment creation flow with template selection, targeting, scheduling, and mode selection.",
    allowedRoles: ["admin", "teacher"],
  },
  {
    path: "/admin/assignments/live/:runId",
    title: "Live Assignment Monitor",
    section: "Assignments",
    description: "Run-level live participation, completion tracking, reminders, and operational controls.",
    allowedRoles: ["admin", "teacher"],
  },
  {
    path: "/admin/analytics",
    title: "Analytics",
    section: "Analytics",
    description: "Landing route for measurable performance views backed by summary collections only.",
    allowedRoles: ["admin", "teacher", "director"],
  },
  {
    path: "/admin/analytics/overview",
    title: "Analytics Overview",
    section: "Analytics",
    description: "Performance overview for raw percentage, accuracy, participation, and distribution trends.",
    allowedRoles: ["admin", "teacher", "director"],
  },
  {
    path: "/admin/analytics/run/:runId",
    title: "Run Analytics",
    section: "Analytics",
    description: "Run-level analytics for participation, outcomes, and timing summaries.",
    allowedRoles: ["admin", "teacher", "director"],
  },
  {
    path: "/admin/analytics/student/:studentId",
    title: "Student Analytics",
    section: "Analytics",
    description: "Student-level performance analytics without exposing raw execution logs.",
    allowedRoles: ["admin", "teacher", "director"],
  },
  {
    path: "/admin/analytics/template/:testId",
    title: "Template Performance",
    section: "Analytics",
    description: "Template-level performance and effectiveness breakdowns for a selected test.",
    allowedRoles: ["admin", "teacher", "director"],
  },
  {
    path: "/admin/analytics/trends",
    title: "Analytics Trends",
    section: "Analytics",
    description: "Trend analysis across performance, participation, and difficulty timing signals.",
    allowedRoles: ["admin", "teacher", "director"],
  },
  {
    path: "/admin/analytics/risk-insights",
    title: "Risk Insights Dashboard",
    section: "Analytics",
    description:
      "Risk-focused analytics dashboard for cluster distribution, high-risk student review, guess-rate indicators, and discipline trend signals.",
    allowedRoles: ["admin", "teacher", "director"],
  },
  {
    path: "/admin/analytics/batch",
    title: "Batch Analytics Dashboard",
    section: "Analytics",
    description:
      "Batch analytics dashboard for cross-batch performance comparisons, average score time-series trends, discipline metrics, and risk distribution.",
    allowedRoles: ["admin", "teacher", "director"],
  },
  {
    path: "/admin/insights",
    title: "Insights",
    section: "Insights",
    description: "Behavioral intelligence landing route gated to L1+ licenses.",
    allowedRoles: ["admin", "teacher", "director"],
    minimumLicenseLayer: "L1",
    redirectOnDenied: "/admin/overview",
    readOnlyRoles: ["director"],
  },
  {
    path: "/admin/insights/risk",
    title: "Risk Overview",
    section: "Insights",
    description: "Risk-oriented behavioral summaries and intervention starting points.",
    allowedRoles: ["admin", "teacher", "director"],
    minimumLicenseLayer: "L1",
    redirectOnDenied: "/admin/overview",
    readOnlyRoles: ["director"],
  },
  {
    path: "/admin/insights/student/:studentId",
    title: "Student Intelligence",
    section: "Insights",
    description: "Student-level behavioral intelligence with layered access to diagnostics and discipline metrics.",
    allowedRoles: ["admin", "teacher", "director"],
    minimumLicenseLayer: "L1",
    redirectOnDenied: "/admin/overview",
    readOnlyRoles: ["director"],
  },
  {
    path: "/admin/insights/patterns",
    title: "Pattern Alerts",
    section: "Insights",
    description: "Pattern-based alerting and grouped behavioral signals.",
    allowedRoles: ["admin", "teacher", "director"],
    minimumLicenseLayer: "L1",
    redirectOnDenied: "/admin/overview",
    readOnlyRoles: ["director"],
  },
  {
    path: "/admin/insights/interventions",
    title: "Interventions",
    section: "Insights",
    description: "Intervention workflow surface for recommended follow-up actions.",
    allowedRoles: ["admin", "teacher", "director"],
    minimumLicenseLayer: "L1",
    redirectOnDenied: "/admin/overview",
    readOnlyRoles: ["director"],
  },
  {
    path: "/admin/insights/execution",
    title: "Execution Signals",
    section: "Insights",
    description: "Execution analytics and deeper discipline signals available only at L2+.",
    allowedRoles: ["admin", "teacher", "director"],
    minimumLicenseLayer: "L2",
    redirectOnDenied: "/admin/overview",
    readOnlyRoles: ["director"],
  },
  {
    path: "/admin/governance",
    title: "Governance",
    section: "Governance",
    description: "L3 governance landing route reserved for director users.",
    allowedRoles: ["director"],
    minimumLicenseLayer: "L3",
    redirectOnDenied: "/admin/overview",
  },
  {
    path: "/admin/governance/stability",
    title: "Institutional Stability",
    section: "Governance",
    description: "Institution-level stability and maturity monitoring for director governance workflows.",
    allowedRoles: ["director"],
    minimumLicenseLayer: "L3",
    redirectOnDenied: "/admin/overview",
  },
  {
    path: "/admin/governance/integrity",
    title: "Execution Integrity",
    section: "Governance",
    description: "Integrity monitoring for override risk, execution quality, and system discipline.",
    allowedRoles: ["director"],
    minimumLicenseLayer: "L3",
    redirectOnDenied: "/admin/overview",
  },
  {
    path: "/admin/governance/override-audit",
    title: "Override Audit",
    section: "Governance",
    description: "Override audit review surface for institutional governance analysis.",
    allowedRoles: ["director"],
    minimumLicenseLayer: "L3",
    redirectOnDenied: "/admin/overview",
  },
  {
    path: "/admin/governance/batch-risk",
    title: "Batch Risk",
    section: "Governance",
    description: "Batch-level risk distribution and governance mapping.",
    allowedRoles: ["director"],
    minimumLicenseLayer: "L3",
    redirectOnDenied: "/admin/overview",
  },
  {
    path: "/admin/governance/trends",
    title: "Governance Trends",
    section: "Governance",
    description: "Longitudinal governance and institutional trend analysis.",
    allowedRoles: ["director"],
    minimumLicenseLayer: "L3",
    redirectOnDenied: "/admin/overview",
  },
  {
    path: "/admin/governance/reports",
    title: "Governance Reports",
    section: "Governance",
    description: "Director-only governance reporting and export surface.",
    allowedRoles: ["director"],
    minimumLicenseLayer: "L3",
    redirectOnDenied: "/admin/overview",
  },
  {
    path: "/admin/settings",
    title: "Settings",
    section: "Settings",
    description: "Administrative settings landing route restricted to admins.",
    allowedRoles: ["admin"],
  },
  {
    path: "/admin/settings/profile",
    title: "Profile Settings",
    section: "Settings",
    description: "Institute administrator profile and account configuration.",
    allowedRoles: ["admin"],
  },
  {
    path: "/admin/settings/academic-year",
    title: "Academic Year Settings",
    section: "Settings",
    description: "Academic year configuration and lifecycle controls.",
    allowedRoles: ["admin"],
  },
  {
    path: "/admin/settings/execution-policy",
    title: "Execution Policy",
    section: "Settings",
    description: "Exam execution policy and operational guardrails.",
    allowedRoles: ["admin"],
  },
  {
    path: "/admin/settings/users",
    title: "User Settings",
    section: "Settings",
    description: "User and role administration for institute staff accounts.",
    allowedRoles: ["admin"],
  },
  {
    path: "/admin/settings/security",
    title: "Security Settings",
    section: "Settings",
    description: "Institute security and access governance configuration.",
    allowedRoles: ["admin"],
  },
  {
    path: "/admin/settings/data",
    title: "Data Settings",
    section: "Settings",
    description: "Data retention and management controls for institute administrators.",
    allowedRoles: ["admin"],
  },
  {
    path: "/admin/settings/system",
    title: "System Settings",
    section: "Settings",
    description: "Platform integration and system-level settings scoped to the institute.",
    allowedRoles: ["admin"],
  },
  {
    path: "/admin/licensing/current",
    title: "Current License",
    section: "Licensing",
    description: "Read-only current licensing state and active feature summary.",
    allowedRoles: ["admin", "director"],
    readOnlyRoles: ["director"],
  },
  {
    path: "/admin/licensing/features",
    title: "License Features",
    section: "Licensing",
    description: "Feature-flag and entitlement visibility for the current license layer.",
    allowedRoles: ["admin", "director"],
    readOnlyRoles: ["director"],
  },
  {
    path: "/admin/licensing/eligibility",
    title: "Eligibility",
    section: "Licensing",
    description: "License eligibility and capability requirements by institutional workflow.",
    allowedRoles: ["admin", "director"],
    readOnlyRoles: ["director"],
  },
  {
    path: "/admin/licensing/usage",
    title: "Usage",
    section: "Licensing",
    description: "Usage summary for current entitlements and operational limits.",
    allowedRoles: ["admin", "director"],
    readOnlyRoles: ["director"],
  },
  {
    path: "/admin/licensing/history",
    title: "License History",
    section: "Licensing",
    description: "Historical visibility into institute licensing changes without vendor mutation controls.",
    allowedRoles: ["admin", "director"],
    readOnlyRoles: ["director"],
  },
];

export interface ResolvedAdminRoute {
  definition: AdminRouteDefinition;
  params: Record<string, string>;
}

function escapeSegment(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function matchAdminRoute(pathname: string): ResolvedAdminRoute | null {
  for (const definition of ADMIN_ROUTE_DEFINITIONS) {
    const params: Record<string, string> = {};
    const pattern = definition.path
      .split("/")
      .map((segment) => {
        if (!segment) {
          return "";
        }

        if (segment.startsWith(":")) {
          const key = segment.slice(1);
          return `(?<${key}>[^/]+)`;
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

export function evaluateAdminRoutePermissions(
  route: ResolvedAdminRoute | null,
  role: PortalRole | null,
  licenseLayer: LicenseLayer | null,
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

  if (
    route.definition.minimumLicenseLayer &&
    (!licenseLayer ||
      LICENSE_LAYER_ORDER[licenseLayer] < LICENSE_LAYER_ORDER[route.definition.minimumLicenseLayer])
  ) {
    return {
      allowed: false,
      redirectTo: route.definition.redirectOnDenied ?? "/unauthorized",
      reason: "license_restricted",
    };
  }

  return {
    allowed: true,
    redirectTo: null,
    reason: null,
  };
}

export function getVisibleAdminRoutes(
  role: PortalRole | null,
  licenseLayer: LicenseLayer | null,
): AdminRouteDefinition[] {
  return ADMIN_ROUTE_DEFINITIONS.filter((definition) => {
    if (!role || !definition.allowedRoles.includes(role)) {
      return false;
    }

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
