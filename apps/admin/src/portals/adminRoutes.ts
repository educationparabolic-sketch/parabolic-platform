import { LICENSE_LAYER_ORDER, type LicenseLayer, type PortalRole, type RouteAccessDecision } from "../../../../shared/types/portalRouting";

export interface AdminRouteDefinition {
  path: string;
  title: string;
  section: string;
  description: string;
  mountedPath?: string;
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
    mountedPath: "/admin/students",
    allowedRoles: ["admin", "teacher"],
  },
  {
    path: "/admin/students/bulk-upload",
    title: "Bulk Upload",
    section: "Students Management",
    description: "Bulk import and export entry point for controlled student onboarding workflows.",
    mountedPath: "/admin/students",
    allowedRoles: ["admin", "teacher"],
  },
  {
    path: "/admin/students/batches",
    title: "Batch Analysis",
    section: "Students Management",
    description: "Batch-level cohort analysis, behavior visibility, and risk review.",
    mountedPath: "/admin/students",
    allowedRoles: ["admin", "teacher"],
  },
  {
    path: "/admin/students/archive",
    title: "Archived Students",
    section: "Students Management",
    description: "Archive review surface for inactive or historical student records.",
    mountedPath: "/admin/students",
    allowedRoles: ["admin", "teacher"],
  },
  {
    path: "/admin/students/:studentId",
    title: "Student Profile",
    section: "Students Management",
    description: "Academic summary, trends, execution profile, risk indicators, and assignment history for an individual student.",
    mountedPath: "/admin/students",
    allowedRoles: ["admin", "teacher"],
  },
  {
    path: "/admin/question-bank",
    title: "Question Bank",
    section: "Question Bank",
    description: "Question library, upload package operations, and metadata management entry route.",
    allowedRoles: ["admin", "teacher"],
  },
  {
    path: "/admin/question-bank/upload-package",
    title: "Upload Package",
    section: "Question Bank",
    description: "Dedicated upload workflow for ZIP package validation and import preparation.",
    mountedPath: "/admin/question-bank",
    allowedRoles: ["admin", "teacher"],
  },
  {
    path: "/admin/question-bank/library",
    title: "Question Library",
    section: "Question Bank",
    description: "Dedicated indexed library workspace for question discovery, structural lock review, and version-safe actions.",
    mountedPath: "/admin/question-bank",
    allowedRoles: ["admin", "teacher"],
  },
  {
    path: "/admin/question-bank/library/:questionId",
    title: "Question Detail",
    section: "Question Bank",
    description: "Dedicated per-question detail workspace for question summary, metadata, and version history review.",
    mountedPath: "/admin/question-bank",
    allowedRoles: ["admin", "teacher"],
  },
  {
    path: "/admin/question-bank/distribution",
    title: "Distribution Overview",
    section: "Question Bank",
    description: "Dedicated question-distribution workspace for difficulty balance, chapter coverage, and marks analytics.",
    mountedPath: "/admin/question-bank",
    allowedRoles: ["admin", "teacher"],
  },
  {
    path: "/admin/question-bank/archive",
    title: "Archive / Versions",
    section: "Question Bank",
    description: "Dedicated lifecycle and versioning workspace for HOT/WARM/COLD review plus deprecated version controls.",
    mountedPath: "/admin/question-bank",
    allowedRoles: ["admin", "teacher"],
  },
  {
    path: "/admin/question-bank/tags",
    title: "Tag Management",
    section: "Question Bank",
    description: "Dedicated governed-tag workspace for create, rename, merge, and deprecate actions.",
    mountedPath: "/admin/question-bank",
    allowedRoles: ["admin", "teacher"],
  },
  {
    path: "/admin/question-bank/validation-logs",
    title: "Validation Logs",
    section: "Question Bank",
    description: "Dedicated immutable upload-log review for package validation outcomes and rollback context.",
    mountedPath: "/admin/question-bank",
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
    mountedPath: "/admin/tests",
    allowedRoles: ["admin", "teacher"],
  },
  {
    path: "/admin/tests/library",
    title: "Test Library",
    section: "Test Templates",
    description: "Dedicated library view for saved template drafts, ready templates, and lifecycle actions.",
    mountedPath: "/admin/tests",
    allowedRoles: ["admin", "teacher"],
  },
  {
    path: "/admin/tests/analytics",
    title: "Template Analytics",
    section: "Test Templates",
    description: "Dedicated analytics workspace for template coverage, structural patterns, and outcome review entry points.",
    mountedPath: "/admin/tests",
    allowedRoles: ["admin", "teacher"],
  },
  {
    path: "/admin/tests/distribution",
    title: "Distribution Review",
    section: "Test Templates",
    description: "Dedicated structural review screen for difficulty balance, timing profile, and template composition snapshots.",
    mountedPath: "/admin/tests",
    allowedRoles: ["admin", "teacher"],
  },
  {
    path: "/admin/tests/settings",
    title: "Template Settings",
    section: "Test Templates",
    description: "Dedicated settings screen for lifecycle rules, mode capability ceilings, and structural lock guidance.",
    mountedPath: "/admin/tests",
    allowedRoles: ["admin", "teacher"],
  },
  {
    path: "/admin/tests/:testId",
    title: "Test Detail",
    section: "Test Templates",
    description: "Template preview, management, and lifecycle view for an individual test definition.",
    mountedPath: "/admin/tests",
    allowedRoles: ["admin", "teacher"],
  },
  {
    path: "/admin/tests/analytics/:testId",
    title: "Template Analytics",
    section: "Test Templates",
    description: "Template effectiveness, difficulty distribution, and outcome summaries for a selected test.",
    mountedPath: "/admin/tests",
    allowedRoles: ["admin", "teacher"],
  },
  {
    path: "/admin/assignments",
    title: "Assignments",
    section: "Assignments",
    description: "Assignment scheduling, active run monitoring, completed run summaries, and email controls.",
    mountedPath: "/admin/assignments/create",
    allowedRoles: ["admin", "teacher"],
  },
  {
    path: "/admin/assignments/create",
    title: "Create Assignment",
    section: "Assignments",
    description: "Assignment creation flow with template selection, targeting, scheduling, and mode selection.",
    mountedPath: "/admin/assignments",
    allowedRoles: ["admin", "teacher"],
  },
  {
    path: "/admin/assignments/list",
    title: "Assignment List",
    section: "Assignments",
    description: "Dedicated list view for assignment status, run analytics summaries, and schedule filters.",
    mountedPath: "/admin/assignments",
    allowedRoles: ["admin", "teacher"],
  },
  {
    path: "/admin/assignments/live",
    title: "Live Assignment Monitor",
    section: "Assignments",
    description: "Dedicated live monitoring view for active assignment runs and current execution health.",
    mountedPath: "/admin/assignments",
    allowedRoles: ["admin", "teacher"],
  },
  {
    path: "/admin/assignments/live/:runId",
    title: "Live Assignment Monitor",
    section: "Assignments",
    description: "Run-level live participation, completion tracking, reminders, and operational controls.",
    mountedPath: "/admin/assignments",
    allowedRoles: ["admin", "teacher"],
  },
  {
    path: "/admin/assignments/details/:runId",
    title: "Assignment Details",
    section: "Assignments",
    description: "Per-assignment setup review and analytics drill-down for a selected run.",
    mountedPath: "/admin/assignments",
    allowedRoles: ["admin", "teacher"],
  },
  {
    path: "/admin/analytics",
    title: "Analytics",
    section: "Analytics",
    description: "Landing route for cross-entity comparison views backed by summary-safe analytics only.",
    allowedRoles: ["admin", "teacher", "director"],
  },
  {
    path: "/admin/analytics/templates",
    title: "Cross-Template Analytics",
    section: "Analytics",
    description: "Compare reusable templates across many runs without duplicating one-template detail pages.",
    mountedPath: "/admin/analytics",
    allowedRoles: ["admin", "teacher", "director"],
  },
  {
    path: "/admin/analytics/batches",
    title: "Cross-Batch Analytics",
    section: "Analytics",
    description:
      "Compare institute cohorts across performance, behavior, and execution quality without replacing batch detail ownership pages.",
    mountedPath: "/admin/analytics",
    allowedRoles: ["admin", "teacher", "director"],
  },
  {
    path: "/admin/insights",
    title: "Insights",
    section: "Insights",
    description: "Lean insights landing route centered on institute-wide risk prioritization and explanation.",
    mountedPath: "/admin/insights/risk",
    allowedRoles: ["admin", "teacher", "director"],
    minimumLicenseLayer: "L2",
    redirectOnDenied: "/admin/overview",
    readOnlyRoles: ["director"],
  },
  {
    path: "/admin/insights/risk",
    title: "Risk Overview",
    section: "Insights",
    description: "Institute-wide L2+ risk command center with prioritization, driver explanation, and next-step routing.",
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
    mountedPath: "/admin/governance",
    allowedRoles: ["director"],
    minimumLicenseLayer: "L3",
    redirectOnDenied: "/admin/overview",
  },
  {
    path: "/admin/governance/integrity",
    title: "Execution Integrity",
    section: "Governance",
    description: "Integrity monitoring for override risk, execution quality, and system discipline.",
    mountedPath: "/admin/governance",
    allowedRoles: ["director"],
    minimumLicenseLayer: "L3",
    redirectOnDenied: "/admin/overview",
  },
  {
    path: "/admin/governance/override-audit",
    title: "Override Audit",
    section: "Governance",
    description: "Override audit review surface for institutional governance analysis.",
    mountedPath: "/admin/governance",
    allowedRoles: ["director"],
    minimumLicenseLayer: "L3",
    redirectOnDenied: "/admin/overview",
  },
  {
    path: "/admin/governance/batch-risk",
    title: "Batch Risk",
    section: "Governance",
    description: "Batch-level risk distribution and governance mapping.",
    mountedPath: "/admin/governance",
    allowedRoles: ["director"],
    minimumLicenseLayer: "L3",
    redirectOnDenied: "/admin/overview",
  },
  {
    path: "/admin/governance/trends",
    title: "Governance Trends",
    section: "Governance",
    description: "Longitudinal governance and institutional trend analysis.",
    mountedPath: "/admin/governance",
    allowedRoles: ["director"],
    minimumLicenseLayer: "L3",
    redirectOnDenied: "/admin/overview",
  },
  {
    path: "/admin/governance/reports",
    title: "Governance Reports",
    section: "Governance",
    description: "Director-only governance reporting and export surface.",
    mountedPath: "/admin/governance",
    allowedRoles: ["director"],
    minimumLicenseLayer: "L3",
    redirectOnDenied: "/admin/overview",
  },
  {
    path: "/admin/settings",
    title: "Settings",
    section: "Settings",
    description: "Administrative settings landing route for admin and director roles.",
    allowedRoles: ["admin", "director"],
  },
  {
    path: "/admin/settings/profile",
    title: "Profile Settings",
    section: "Settings",
    description: "Institute administrator profile and account configuration.",
    allowedRoles: ["admin", "director"],
    readOnlyRoles: ["director"],
  },
  {
    path: "/admin/settings/academic-year",
    title: "Academic Year Settings",
    section: "Settings",
    description: "Academic year configuration and lifecycle controls.",
    allowedRoles: ["admin", "director"],
    readOnlyRoles: ["director"],
  },
  {
    path: "/admin/settings/execution-policy",
    title: "Execution Policy",
    section: "Settings",
    description: "Exam execution policy and operational guardrails.",
    allowedRoles: ["admin", "director"],
  },
  {
    path: "/admin/settings/users",
    title: "User Settings",
    section: "Settings",
    description: "User and role administration for institute staff accounts.",
    allowedRoles: ["admin", "director"],
    readOnlyRoles: ["director"],
  },
  {
    path: "/admin/settings/security",
    title: "Security Settings",
    section: "Settings",
    description: "Institute security and access governance configuration.",
    allowedRoles: ["admin", "director"],
    readOnlyRoles: ["director"],
  },
  {
    path: "/admin/settings/data",
    title: "Data Settings",
    section: "Settings",
    description: "Data retention and management controls for institute administrators.",
    allowedRoles: ["admin", "director"],
  },
  {
    path: "/admin/settings/system",
    title: "System Settings",
    section: "Settings",
    description: "Platform integration and system-level settings scoped to the institute.",
    allowedRoles: ["admin", "director"],
    readOnlyRoles: ["director"],
  },
  {
    path: "/admin/settings/audit-history",
    title: "Settings Audit History",
    section: "Settings",
    description: "Read-only settings mutation timeline from institute settingsAudit records.",
    allowedRoles: ["admin", "director"],
    readOnlyRoles: ["director"],
  },
  {
    path: "/admin/help",
    title: "Help / Support",
    section: "Help / Support",
    description: "Top-level support workspace for operational help, escalation channels, and vendor handoff context.",
    allowedRoles: ["admin", "teacher", "director"],
  },
  {
    path: "/admin/licensing",
    title: "Licensing",
    section: "Licensing",
    description: "Institute license overview with vendor-controlled parameters, usage, billing, upgrade requests, and history.",
    mountedPath: "/admin/licensing/current",
    allowedRoles: ["admin", "director"],
    readOnlyRoles: ["director"],
  },
  {
    path: "/admin/licensing/current",
    title: "Current License",
    section: "Licensing",
    description: "Read-only vendor-assigned plan, subscription term, fees, and operating limits.",
    allowedRoles: ["admin", "director"],
    readOnlyRoles: ["director"],
  },
  {
    path: "/admin/licensing/usage",
    title: "Usage & Billing",
    section: "Licensing",
    description: "Current-cycle usage, vendor-calculated charges, and read-only invoice status.",
    allowedRoles: ["admin", "director"],
    readOnlyRoles: ["director"],
  },
  {
    path: "/admin/licensing/plans",
    title: "Plans & Upgrade",
    section: "Licensing",
    description: "Published Trial and L0-L2 plans with an institute-to-vendor upgrade request workflow.",
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

export function resolveAdminRouteMountPath(pathname: string): string | null {
  const matchedRoute = matchAdminRoute(pathname);
  if (!matchedRoute) {
    return null;
  }

  return matchedRoute.definition.mountedPath ?? matchedRoute.definition.path;
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
