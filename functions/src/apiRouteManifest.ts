/* eslint-disable require-jsdoc */

export type ApiRouteMethod = "GET" | "PATCH" | "POST";

export type ApiRoutePortal = "admin" | "student" | "exam" | "vendor";

export type ApiRouteDeclaration = "frontend" | "planned";

export type ApiRouteStatus =
  | "implemented"
  | "incompatible"
  | "missing"
  | "intentionally_retired";

export interface ApiRouteManifestEntry {
  canonicalPath: string;
  currentFrontendPath: string;
  declaration: ApiRouteDeclaration;
  functionExport: string | null;
  id: string;
  method: ApiRouteMethod;
  portal: ApiRoutePortal;
  status: ApiRouteStatus;
}

export type BackendHttpExportDisposition =
  | "canonical_route"
  | "gateway"
  | "internal_only"
  | "unmapped_portal"
  | "webhook"
  | "healthcheck";

export interface BackendHttpExportManifestEntry {
  disposition: BackendHttpExportDisposition;
  functionExport: string;
  routeIds: readonly string[];
}

function defineRoute(
  id: string,
  portal: ApiRoutePortal,
  method: ApiRouteMethod,
  currentFrontendPath: string,
  status: ApiRouteStatus,
  functionExport: string | null,
  declaration: ApiRouteDeclaration = "frontend",
): ApiRouteManifestEntry {
  return {
    canonicalPath: `/api/v1${currentFrontendPath}`,
    currentFrontendPath,
    declaration,
    functionExport,
    id,
    method,
    portal,
    status,
  };
}

export const API_ROUTE_MANIFEST: readonly ApiRouteManifestEntry[] = [
  defineRoute(
    "ADM-01",
    "admin",
    "GET",
    "/admin/overview",
    "implemented",
    "adminOverview",
  ),
  defineRoute(
    "ADM-02",
    "admin",
    "GET",
    "/admin/analytics",
    "implemented",
    "adminAnalytics",
  ),
  defineRoute(
    "ADM-03",
    "admin",
    "GET",
    "/admin/students",
    "implemented",
    "adminStudents",
  ),
  defineRoute(
    "ADM-04",
    "admin",
    "POST",
    "/admin/students/onboarding-resend",
    "implemented",
    "adminStudentOnboardingResend",
  ),
  defineRoute(
    "ADM-05",
    "admin",
    "POST",
    "/admin/students/bulk",
    "implemented",
    "adminStudentsBulk",
  ),
  defineRoute(
    "ADM-06",
    "admin",
    "GET",
    "/admin/questions/library",
    "implemented",
    "adminQuestionLibrary",
  ),
  defineRoute(
    "ADM-07",
    "admin",
    "GET",
    "/admin/questions/distribution",
    "implemented",
    "adminQuestionDistribution",
  ),
  defineRoute(
    "ADM-08",
    "admin",
    "GET",
    "/admin/questions/upload-logs",
    "implemented",
    "adminQuestionUploadLogs",
  ),
  defineRoute(
    "ADM-09",
    "admin",
    "POST",
    "/admin/questions/bulk",
    "intentionally_retired",
    null,
  ),
  defineRoute(
    "ADM-10",
    "admin",
    "GET",
    "/admin/tests",
    "implemented",
    "adminTests",
  ),
  defineRoute(
    "ADM-11",
    "admin",
    "POST",
    "/admin/tests",
    "implemented",
    "adminTests",
  ),
  defineRoute(
    "ADM-12",
    "admin",
    "POST",
    "/admin/runs",
    "implemented",
    "adminRuns",
  ),
  defineRoute(
    "ADM-13",
    "admin",
    "POST",
    "/admin/governance/snapshots",
    "intentionally_retired",
    null,
  ),
  defineRoute(
    "ADM-14",
    "admin",
    "POST",
    "/admin/settings",
    "implemented",
    "adminSettings",
  ),
  defineRoute(
    "ADM-15",
    "admin",
    "POST",
    "/admin/academicYear/archive",
    "implemented",
    "adminAcademicYearArchive",
  ),
  defineRoute(
    "ADM-16",
    "admin",
    "POST",
    "/admin/licensing",
    "incompatible",
    "adminLicensing",
  ),
  defineRoute(
    "ADM-17",
    "admin",
    "POST",
    "/admin/interventions",
    "intentionally_retired",
    null,
  ),
  defineRoute(
    "ADM-18",
    "admin",
    "POST",
    "/admin/questions/assets",
    "intentionally_retired",
    null,
  ),
  defineRoute(
    "ADM-19",
    "admin",
    "PATCH",
    "/admin/tests/{testId}",
    "implemented",
    "adminTests",
  ),
  defineRoute(
    "ADM-20",
    "admin",
    "POST",
    "/admin/tests/{testId}/publish",
    "implemented",
    "adminTests",
  ),
  defineRoute(
    "ADM-21",
    "admin",
    "POST",
    "/admin/tests/{testId}/archive",
    "implemented",
    "adminTests",
  ),
  defineRoute(
    "ADM-22",
    "admin",
    "GET",
    "/admin/runs",
    "implemented",
    "adminRuns",
  ),
  defineRoute(
    "ADM-23",
    "admin",
    "GET",
    "/admin/runs/{runId}",
    "implemented",
    "adminRuns",
  ),
  defineRoute(
    "ADM-24",
    "admin",
    "PATCH",
    "/admin/students/{studentId}/profile",
    "implemented",
    "adminStudentMutations",
  ),
  defineRoute(
    "ADM-25",
    "admin",
    "POST",
    "/admin/students/batch-assignment",
    "implemented",
    "adminStudentMutations",
  ),
  defineRoute(
    "ADM-26",
    "admin",
    "POST",
    "/admin/students/{studentId}/lifecycle",
    "implemented",
    "adminStudentMutations",
  ),
  defineRoute(
    "ADM-27",
    "admin",
    "POST",
    "/admin/students/{studentId}/photo-review",
    "implemented",
    "adminStudentMutations",
  ),
  defineRoute(
    "ADM-28",
    "admin",
    "POST",
    "/admin/students/{studentId}/data-export",
    "implemented",
    "adminStudentDataExport",
  ),
  defineRoute(
    "ADM-29",
    "admin",
    "POST",
    "/admin/students/{studentId}/soft-delete",
    "implemented",
    "adminStudentSoftDelete",
  ),
  defineRoute(
    "ADM-30",
    "admin",
    "GET",
    "/admin/questions/library/{questionId}",
    "implemented",
    "adminQuestionLibrary",
    "planned",
  ),
  defineRoute(
    "ADM-31",
    "admin",
    "PATCH",
    "/admin/questions/{questionId}/metadata",
    "implemented",
    "adminQuestionMutations",
    "planned",
  ),
  defineRoute(
    "ADM-32",
    "admin",
    "PATCH",
    "/admin/questions/{questionId}/structure",
    "implemented",
    "adminQuestionMutations",
    "planned",
  ),
  defineRoute(
    "ADM-33",
    "admin",
    "POST",
    "/admin/questions/{questionId}/versions",
    "implemented",
    "adminQuestionMutations",
    "planned",
  ),
  defineRoute(
    "ADM-34",
    "admin",
    "POST",
    "/admin/questions/{questionId}/lifecycle",
    "implemented",
    "adminQuestionMutations",
    "planned",
  ),
  defineRoute(
    "ADM-35",
    "admin",
    "GET",
    "/admin/questions/tags",
    "implemented",
    "adminQuestionTags",
    "planned",
  ),
  defineRoute(
    "ADM-36",
    "admin",
    "POST",
    "/admin/questions/tags",
    "implemented",
    "adminQuestionTags",
    "planned",
  ),
  defineRoute(
    "ADM-37",
    "admin",
    "POST",
    "/admin/questions/packages/validate",
    "implemented",
    "adminQuestionPackages",
    "planned",
  ),
  defineRoute(
    "ADM-38",
    "admin",
    "POST",
    "/admin/questions/packages/{packageId}/commit",
    "implemented",
    "adminQuestionPackages",
    "planned",
  ),
  defineRoute(
    "ADM-39",
    "admin",
    "POST",
    "/admin/questions/upload-logs/{uploadLogId}/rollback",
    "implemented",
    "adminQuestionPackages",
    "planned",
  ),
  defineRoute(
    "ADM-40",
    "admin",
    "GET",
    "/admin/questions/upload-logs/{uploadLogId}",
    "implemented",
    "adminQuestionUploadLogs",
    "planned",
  ),
  defineRoute(
    "ADM-41",
    "admin",
    "GET",
    "/admin/live-runs",
    "implemented",
    "adminAssignmentOperations",
  ),
  defineRoute(
    "ADM-42",
    "admin",
    "GET",
    "/admin/live-runs/{runId}",
    "implemented",
    "adminAssignmentOperations",
  ),
  defineRoute(
    "ADM-43",
    "admin",
    "GET",
    "/admin/run-history",
    "implemented",
    "adminAssignmentOperations",
  ),
  defineRoute(
    "ADM-44",
    "admin",
    "POST",
    "/admin/runs/{runId}/duplicate",
    "implemented",
    "adminAssignmentOperations",
  ),
  defineRoute(
    "ADM-45",
    "admin",
    "POST",
    "/admin/runs/{runId}/reassign",
    "implemented",
    "adminAssignmentOperations",
  ),
  defineRoute(
    "ADM-46",
    "admin",
    "POST",
    "/admin/runs/{runId}/lifecycle",
    "implemented",
    "adminAssignmentOperations",
  ),
  defineRoute(
    "ADM-47",
    "admin",
    "POST",
    "/admin/runs/{runId}/notifications/resend",
    "implemented",
    "adminAssignmentOperations",
  ),
  defineRoute(
    "ADM-48",
    "admin",
    "POST",
    "/admin/runs/{runId}/sessions/{sessionId}/overrides",
    "implemented",
    "adminAssignmentOperations",
  ),
  defineRoute(
    "ADM-49",
    "admin",
    "GET",
    "/admin/governance/snapshots",
    "implemented",
    "adminGovernanceTransport",
    "planned",
  ),
  defineRoute(
    "ADM-50",
    "admin",
    "POST",
    "/admin/governance/reports",
    "implemented",
    "adminGovernanceTransport",
    "planned",
  ),
  defineRoute(
    "ADM-51",
    "admin",
    "GET",
    "/admin/governance/reports",
    "implemented",
    "adminGovernanceTransport",
    "planned",
  ),
  defineRoute(
    "ADM-52",
    "admin",
    "GET",
    "/admin/governance/reports/{reportId}/download",
    "implemented",
    "adminGovernanceTransport",
    "planned",
  ),
  defineRoute(
    "ADM-53",
    "admin",
    "GET",
    "/admin/interventions",
    "implemented",
    "adminInterventionTimeline",
    "planned",
  ),
  defineRoute(
    "ADM-54",
    "admin",
    "POST",
    "/admin/interventions/recommendations",
    "implemented",
    "adminInterventionMutation",
    "planned",
  ),
  defineRoute(
    "ADM-55",
    "admin",
    "PATCH",
    "/admin/interventions/{interventionId}/outcome",
    "implemented",
    "adminInterventionMutation",
    "planned",
  ),
  defineRoute(
    "STU-01",
    "student",
    "GET",
    "/student/dashboard",
    "implemented",
    "studentDashboard",
  ),
  defineRoute(
    "STU-02",
    "student",
    "GET",
    "/student/tests",
    "implemented",
    "studentTests",
  ),
  defineRoute(
    "STU-03",
    "student",
    "GET",
    "/student/performance",
    "implemented",
    "studentPerformance",
  ),
  defineRoute(
    "STU-04",
    "student",
    "GET",
    "/student/insights",
    "implemented",
    "studentInsights",
  ),
  defineRoute(
    "STU-05",
    "student",
    "GET",
    "/student/tests/{testId}/solutions",
    "implemented",
    "studentSolutions",
  ),
  defineRoute(
    "STU-06",
    "student",
    "POST",
    "/exam/start",
    "implemented",
    "examStart",
  ),
  defineRoute(
    "EXM-01",
    "exam",
    "POST",
    "/exam/session/{sessionId}/entry",
    "implemented",
    "examSessionEntry",
  ),
  defineRoute(
    "EXM-02",
    "exam",
    "POST",
    "/exam/session/{sessionId}/answers",
    "implemented",
    "examSessionAnswers",
  ),
  defineRoute(
    "EXM-03",
    "exam",
    "POST",
    "/exam/session/{sessionId}/token/refresh",
    "intentionally_retired",
    null,
  ),
  defineRoute(
    "EXM-04",
    "exam",
    "POST",
    "/exam/session/{sessionId}/submit",
    "implemented",
    "examSessionSubmit",
  ),
  defineRoute(
    "EXM-05",
    "exam",
    "POST",
    "/exam/session/{sessionId}/activate",
    "implemented",
    "examSessionActivate",
  ),
  defineRoute(
    "VEN-01",
    "vendor",
    "POST",
    "/vendor/calibration/simulate",
    "incompatible",
    "vendorCalibrationSimulation",
  ),
  defineRoute(
    "VEN-02",
    "vendor",
    "POST",
    "/vendor/calibration/push",
    "implemented",
    "vendorCalibrationPush",
  ),
];

const UNROUTED_BACKEND_HTTP_EXPORTS: readonly
BackendHttpExportManifestEntry[] = [
  {
    disposition: "internal_only",
    functionExport: "adminQuestionAssets",
    routeIds: [],
  },
  {
    disposition: "internal_only",
    functionExport: "adminQuestionsBulk",
    routeIds: [],
  },
  {
    disposition: "gateway",
    functionExport: "apiV1",
    routeIds: [],
  },
  {
    disposition: "internal_only",
    functionExport: "internalEmailQueue",
    routeIds: [],
  },
  {
    disposition: "unmapped_portal",
    functionExport: "vendorSimulationEnvironment",
    routeIds: [],
  },
  {
    disposition: "unmapped_portal",
    functionExport: "vendorSimulationStudents",
    routeIds: [],
  },
  {
    disposition: "unmapped_portal",
    functionExport: "vendorSimulationSessions",
    routeIds: [],
  },
  {
    disposition: "unmapped_portal",
    functionExport: "vendorSimulationLoad",
    routeIds: [],
  },
  {
    disposition: "unmapped_portal",
    functionExport: "vendorSimulationValidation",
    routeIds: [],
  },
  {
    disposition: "unmapped_portal",
    functionExport: "vendorIntelligenceInitialize",
    routeIds: [],
  },
  {
    disposition: "unmapped_portal",
    functionExport: "vendorRevenueAnalytics",
    routeIds: [],
  },
  {
    disposition: "unmapped_portal",
    functionExport: "vendorLayerDistribution",
    routeIds: [],
  },
  {
    disposition: "unmapped_portal",
    functionExport: "vendorChurnTracking",
    routeIds: [],
  },
  {
    disposition: "unmapped_portal",
    functionExport: "vendorRevenueForecasting",
    routeIds: [],
  },
  {
    disposition: "unmapped_portal",
    functionExport: "vendorLicenseUpdate",
    routeIds: [],
  },
  {
    disposition: "webhook",
    functionExport: "stripeWebhook",
    routeIds: [],
  },
  {
    disposition: "healthcheck",
    functionExport: "helloWorld",
    routeIds: [],
  },
];

const routedFunctionExports = Array.from(new Set(
  API_ROUTE_MANIFEST.flatMap((route) =>
    route.functionExport === null ? [] : [route.functionExport]),
));

const routedBackendHttpExports: BackendHttpExportManifestEntry[] =
  routedFunctionExports.map((functionExport) => ({
    disposition: "canonical_route",
    functionExport,
    routeIds: API_ROUTE_MANIFEST
      .filter((route) => route.functionExport === functionExport)
      .map((route) => route.id),
  }));

export const BACKEND_HTTP_EXPORT_MANIFEST: readonly
BackendHttpExportManifestEntry[] = [
  ...routedBackendHttpExports,
  ...UNROUTED_BACKEND_HTTP_EXPORTS,
];
