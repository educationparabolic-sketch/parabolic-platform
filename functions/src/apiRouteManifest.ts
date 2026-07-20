/* eslint-disable require-jsdoc */

export type ApiRouteMethod = "GET" | "POST";

export type ApiRoutePortal = "admin" | "student" | "exam" | "vendor";

export type ApiRouteStatus =
  | "implemented"
  | "incompatible"
  | "missing"
  | "intentionally_retired";

export interface ApiRouteManifestEntry {
  canonicalPath: string;
  currentFrontendPath: string;
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
): ApiRouteManifestEntry {
  return {
    canonicalPath: `/api/v1${currentFrontendPath}`,
    currentFrontendPath,
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
    "incompatible",
    "adminOverview",
  ),
  defineRoute(
    "ADM-02",
    "admin",
    "GET",
    "/admin/analytics",
    "incompatible",
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
    "implemented",
    "adminQuestionsBulk",
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
    "incompatible",
    "adminTests",
  ),
  defineRoute(
    "ADM-12",
    "admin",
    "POST",
    "/admin/runs",
    "incompatible",
    "adminRuns",
  ),
  defineRoute(
    "ADM-13",
    "admin",
    "POST",
    "/admin/governance/snapshots",
    "implemented",
    "adminGovernanceSnapshots",
  ),
  defineRoute(
    "ADM-14",
    "admin",
    "POST",
    "/admin/settings",
    "incompatible",
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
    "implemented",
    "adminInterventions",
  ),
  defineRoute(
    "STU-01",
    "student",
    "GET",
    "/student/dashboard",
    "missing",
    null,
  ),
  defineRoute(
    "STU-02",
    "student",
    "GET",
    "/student/tests",
    "missing",
    null,
  ),
  defineRoute(
    "STU-03",
    "student",
    "GET",
    "/student/performance",
    "missing",
    null,
  ),
  defineRoute(
    "STU-04",
    "student",
    "GET",
    "/student/insights",
    "missing",
    null,
  ),
  defineRoute(
    "STU-05",
    "student",
    "GET",
    "/student/tests/{testId}/solutions",
    "missing",
    null,
  ),
  defineRoute(
    "STU-06",
    "student",
    "POST",
    "/exam/start",
    "incompatible",
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
    "incompatible",
    "examSessionAnswers",
  ),
  defineRoute(
    "EXM-03",
    "exam",
    "POST",
    "/exam/session/{sessionId}/token/refresh",
    "missing",
    null,
  ),
  defineRoute(
    "EXM-04",
    "exam",
    "POST",
    "/exam/session/{sessionId}/submit",
    "incompatible",
    "examSessionSubmit",
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
    disposition: "unmapped_portal",
    functionExport: "adminGovernanceReports",
    routeIds: [],
  },
  {
    disposition: "unmapped_portal",
    functionExport: "adminStudentDataExport",
    routeIds: [],
  },
  {
    disposition: "unmapped_portal",
    functionExport: "adminStudentSoftDelete",
    routeIds: [],
  },
  {
    disposition: "unmapped_portal",
    functionExport: "adminQuestionAssets",
    routeIds: [],
  },
  {
    disposition: "unmapped_portal",
    functionExport: "adminQuestionTags",
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
