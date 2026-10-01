import type { PortalCapability } from "../../../../shared/contracts/capabilityPolicy";

export type AdminRouteDisposition = "workspace" | "redirect" | "unavailable";
export type AdminActionKind = "mutation" | "download" | "local_ui";
export type AdminActionDisposition =
  | "authoritative"
  | "truthful_local"
  | "truthfully_unavailable"
  | "fixture_only"
  | "local_only_defect";

export interface AdminRouteLedgerEntry {
  path: string;
  capability: PortalCapability;
  disposition: AdminRouteDisposition;
  authority: string;
  proofOwner: string;
}

export interface AdminCompatibilityRouteLedgerEntry {
  path: string;
  target: string;
  capability: PortalCapability;
}

export interface AdminActionLedgerEntry {
  id: string;
  label: string;
  routes: readonly string[];
  capability: PortalCapability;
  kind: AdminActionKind;
  disposition: AdminActionDisposition;
  authority: string;
  persistence: string;
  errorState: string;
  proofOwner: string;
  sourceFiles: readonly string[];
  sourceAnchors: readonly string[];
}

type RouteSeed = Omit<AdminRouteLedgerEntry, "capability" | "authority" | "proofOwner">;

function routeGroup(
  capability: PortalCapability,
  authority: string,
  proofOwner: string,
  routes: readonly RouteSeed[],
): AdminRouteLedgerEntry[] {
  return routes.map((route) => ({...route, capability, authority, proofOwner}));
}

export const ADMIN_ROUTE_LEDGER: readonly AdminRouteLedgerEntry[] = [
  ...routeGroup("admin.overview.read", "GET /admin/overview", "admin-summary-contracts", [
    {path: "/admin/overview", disposition: "workspace"},
  ]),
  ...routeGroup("admin.students.read", "GET /admin/students", "admin-student-mutations", [
    {path: "/admin/students", disposition: "workspace"},
    {path: "/admin/students/list", disposition: "workspace"},
    {path: "/admin/students/bulk-upload", disposition: "workspace"},
    {path: "/admin/students/batches", disposition: "workspace"},
    {path: "/admin/students/archive", disposition: "workspace"},
    {path: "/admin/students/:studentId", disposition: "workspace"},
  ]),
  ...routeGroup("admin.question_bank.read", "Admin Question Bank APIs", "question-bank-lifecycle", [
    {path: "/admin/question-bank", disposition: "workspace"},
    {path: "/admin/question-bank/upload-package", disposition: "workspace"},
    {path: "/admin/question-bank/library", disposition: "workspace"},
    {path: "/admin/question-bank/library/:questionId", disposition: "workspace"},
    {path: "/admin/question-bank/distribution", disposition: "workspace"},
    {path: "/admin/question-bank/archive", disposition: "workspace"},
    {path: "/admin/question-bank/tags", disposition: "workspace"},
    {path: "/admin/question-bank/validation-logs", disposition: "workspace"},
  ]),
  ...routeGroup("admin.tests.read", "GET /admin/tests", "admin-template-lifecycle", [
    {path: "/admin/tests", disposition: "workspace"},
    {path: "/admin/tests/create", disposition: "workspace"},
    {path: "/admin/tests/library", disposition: "workspace"},
    {path: "/admin/tests/analytics", disposition: "workspace"},
    {path: "/admin/tests/distribution", disposition: "redirect"},
    {path: "/admin/tests/settings", disposition: "redirect"},
    {path: "/admin/tests/:testId", disposition: "redirect"},
    {path: "/admin/tests/analytics/:testId", disposition: "workspace"},
  ]),
  ...routeGroup("admin.assignments.read", "Admin Run APIs", "admin-assignment-lifecycle", [
    {path: "/admin/assignments", disposition: "workspace"},
    {path: "/admin/assignments/create", disposition: "workspace"},
    {path: "/admin/assignments/list", disposition: "workspace"},
    {path: "/admin/assignments/live", disposition: "workspace"},
    {path: "/admin/assignments/live/:runId", disposition: "workspace"},
    {path: "/admin/assignments/details/:runId", disposition: "workspace"},
    {path: "/admin/assignments/history", disposition: "workspace"},
  ]),
  ...routeGroup("admin.analytics.read", "GET /admin/analytics", "admin-summary-contracts", [
    {path: "/admin/analytics", disposition: "workspace"},
    {path: "/admin/analytics/templates", disposition: "workspace"},
    {path: "/admin/analytics/batches", disposition: "workspace"},
  ]),
  ...routeGroup("admin.insights.read", "GET /admin/analytics", "admin-governance-interventions", [
    {path: "/admin/insights", disposition: "workspace"},
    {path: "/admin/insights/risk", disposition: "workspace"},
  ]),
  ...routeGroup(
    "admin.interventions.read",
    "Admin Intervention APIs",
    "admin-governance-interventions",
    [{path: "/admin/insights/interventions", disposition: "workspace"}],
  ),
  ...routeGroup("admin.governance.read", "Admin Governance APIs", "admin-governance-interventions", [
    {path: "/admin/governance", disposition: "workspace"},
    {path: "/admin/governance/stability", disposition: "workspace"},
    {path: "/admin/governance/integrity", disposition: "workspace"},
    {path: "/admin/governance/override-audit", disposition: "workspace"},
    {path: "/admin/governance/batch-risk", disposition: "workspace"},
    {path: "/admin/governance/trends", disposition: "workspace"},
    {path: "/admin/governance/reports", disposition: "workspace"},
  ]),
  ...routeGroup("admin.settings.read", "Admin Settings APIs", "admin-settings", [
    {path: "/admin/settings", disposition: "redirect"},
    {path: "/admin/settings/profile", disposition: "workspace"},
    {path: "/admin/settings/academic-year", disposition: "workspace"},
    {path: "/admin/settings/access", disposition: "workspace"},
    {path: "/admin/settings/audit-history", disposition: "workspace"},
    {path: "/admin/settings/execution-policy", disposition: "unavailable"},
    {path: "/admin/settings/data", disposition: "unavailable"},
    {path: "/admin/settings/system", disposition: "unavailable"},
  ]),
  ...routeGroup("admin.support.manage", "Admin Support APIs", "admin-support", [
    {path: "/admin/help", disposition: "workspace"},
  ]),
  ...routeGroup("admin.license.read", "Admin Licensing APIs", "admin-licensing", [
    {path: "/admin/licensing", disposition: "redirect"},
    {path: "/admin/licensing/current", disposition: "workspace"},
    {path: "/admin/licensing/usage", disposition: "workspace"},
    {path: "/admin/licensing/plans", disposition: "workspace"},
    {path: "/admin/licensing/history", disposition: "workspace"},
  ]),
];

export const ADMIN_COMPATIBILITY_ROUTE_LEDGER: readonly AdminCompatibilityRouteLedgerEntry[] = [
  {path: "students/lifecycle", target: "/admin/students/list", capability: "admin.students.read"},
  {path: "assignments/bulk", target: "/admin/assignments/list", capability: "admin.assignments.read"},
  {path: "analytics/overview", target: "/admin/analytics/templates", capability: "admin.analytics.read"},
  {path: "analytics/run/:runId", target: "/admin/assignments/list", capability: "admin.assignments.read"},
  {path: "analytics/student/:studentId", target: "/admin/students/list", capability: "admin.students.read"},
  {path: "analytics/template/:testId", target: "/admin/analytics/templates", capability: "admin.analytics.read"},
  {path: "analytics/trends", target: "/admin/analytics/templates", capability: "admin.analytics.read"},
  {path: "analytics/risk-insights", target: "/admin/insights/risk", capability: "admin.insights.read"},
  {path: "analytics/batch", target: "/admin/analytics/batches", capability: "admin.analytics.read"},
  {path: "insights/student/:studentId", target: "/admin/students/:studentId", capability: "admin.students.read"},
  {path: "insights/patterns", target: "/admin/insights/risk", capability: "admin.insights.read"},
  {path: "insights/execution", target: "/admin/insights/risk", capability: "admin.insights.read"},
  {path: "insights/monthly-summary", target: "/admin/insights/risk", capability: "admin.insights.read"},
  {path: "licensing/features", target: "/admin/licensing/plans", capability: "admin.license.read"},
  {path: "licensing/eligibility", target: "/admin/licensing/plans", capability: "admin.license.read"},
  {path: "licensing/upgrade-preview", target: "/admin/licensing/plans", capability: "admin.license.read"},
  {path: "settings/users", target: "/admin/settings/access", capability: "admin.settings.read"},
  {path: "settings/security", target: "/admin/settings/access", capability: "admin.settings.read"},
];

function escapeRouteSegment(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function matchAdminCompatibilityRoute(
  pathname: string,
): AdminCompatibilityRouteLedgerEntry | null {
  const relativePath = pathname.replace(/^\/admin\/?/u, "");
  return ADMIN_COMPATIBILITY_ROUTE_LEDGER.find((entry) => {
    const pattern = entry.path
      .split("/")
      .map((segment) => segment.startsWith(":") ? "[^/]+" : escapeRouteSegment(segment))
      .join("/");
    return new RegExp(`^${pattern}$`, "u").test(relativePath);
  }) ?? null;
}

export const ADMIN_ROUTE_WILDCARDS = [
  "students/*",
  "question-bank/*",
  "tests/*",
  "assignments/*",
  "analytics/*",
  "governance/*",
  "insights/*",
  "licensing/*",
  "settings/*",
  "*",
] as const;

function action(entry: AdminActionLedgerEntry): AdminActionLedgerEntry {
  return entry;
}

export const ADMIN_ACTION_LEDGER: readonly AdminActionLedgerEntry[] = [
  action({
    id: "students.profile.update", label: "Save student profile", routes: ["/admin/students/list"],
    capability: "admin.students.manage", kind: "mutation", disposition: "authoritative",
    authority: "PATCH /admin/students/{studentId}", persistence: "versioned write plus authoritative roster reload",
    errorState: "validation, conflict, authorization, Auth-reconciliation, and reload failures remain visible",
    proofOwner: "admin-student-mutations", sourceFiles: ["features/students/StudentManagementPage.tsx"],
    sourceAnchors: ["saveEditChanges", "apiClient.patch<AdminStudentProfileUpdateResult"],
  }),
  action({
    id: "students.batch.assign", label: "Assign selected Students to a batch", routes: ["/admin/students/list"],
    capability: "admin.students.manage", kind: "mutation", disposition: "authoritative",
    authority: "POST /admin/students/batch-assignment", persistence: "versioned batch write plus authoritative roster reload",
    errorState: "validation, conflict, authorization, and reload failures remain visible",
    proofOwner: "admin-student-mutations", sourceFiles: ["features/students/StudentManagementPage.tsx"],
    sourceAnchors: ["applyBatchAssignment", "apiClient.post<AdminStudentBatchAssignmentResult"],
  }),
  action({
    id: "students.lifecycle.change", label: "Activate, inactivate, suspend, or reinstate Student", routes: ["/admin/students/list"],
    capability: "admin.students.manage", kind: "mutation", disposition: "authoritative",
    authority: "POST /admin/students/{studentId}/lifecycle", persistence: "versioned write, Auth reconciliation, and roster reload",
    errorState: "illegal transition, conflict, authorization, Auth, and reload failures remain visible",
    proofOwner: "admin-student-mutations", sourceFiles: ["features/students/StudentManagementPage.tsx"],
    sourceAnchors: ["setStudentStatus", "apiClient.post<AdminStudentLifecycleUpdateResult"],
  }),
  action({
    id: "students.photo.review", label: "Verify or unverify live photo", routes: ["/admin/students/list"],
    capability: "admin.students.manage", kind: "mutation", disposition: "authoritative",
    authority: "POST /admin/students/{studentId}/photo-review", persistence: "capture-bound write plus roster reload",
    errorState: "stale capture, conflict, authorization, and reload failures remain visible",
    proofOwner: "admin-student-mutations", sourceFiles: ["features/students/StudentManagementPage.tsx"],
    sourceAnchors: ["setLivePhotoVerification", "apiClient.post<AdminStudentPhotoReviewResult"],
  }),
  action({
    id: "students.onboarding.resend", label: "Resend Student onboarding", routes: ["/admin/students/list", "/admin/students/:studentId"],
    capability: "admin.students.manage", kind: "mutation", disposition: "authoritative",
    authority: "POST /admin/students/onboarding-resend", persistence: "idempotent queue and audit write plus reload",
    errorState: "validation, authorization, provider-queue, and reload failures remain visible",
    proofOwner: "admin-student-mutations", sourceFiles: ["features/students/StudentManagementPage.tsx", "features/students/StudentProfilePage.tsx"],
    sourceAnchors: ["resendStudentOnboardingEmail", "apiClient.post<StudentOnboardingResendResult"],
  }),
  action({
    id: "students.bulk.commit", label: "Validate roster and create accounts", routes: ["/admin/students/bulk-upload"],
    capability: "admin.students.manage", kind: "mutation", disposition: "authoritative",
    authority: "POST /admin/students/bulk", persistence: "idempotent roster, Auth, queue, and audit authority plus reload",
    errorState: "row validation, identity conflict, authorization, Auth, and reload failures remain visible",
    proofOwner: "admin-student-mutations", sourceFiles: ["features/students/StudentManagementPage.tsx"],
    sourceAnchors: ["submitBulkUpload(false)", "submitBulkUpload(true)", "apiClient.post<StudentBulkUploadResult"],
  }),
  action({
    id: "students.data.export", label: "Export Student data", routes: ["/admin/students/list"],
    capability: "admin.students.manage", kind: "download", disposition: "authoritative",
    authority: "POST /admin/students/{studentId}/export", persistence: "idempotent export artifact and audit with expiring authorization",
    errorState: "eligibility, authorization, artifact, and download failures remain visible",
    proofOwner: "admin-student-mutations", sourceFiles: ["features/students/StudentManagementPage.tsx"],
    sourceAnchors: ["exportStudentData", "apiClient.post<AdminStudentDataExportResult"],
  }),
  action({
    id: "students.soft_delete", label: "Soft delete eligible Student", routes: ["/admin/students/list"],
    capability: "admin.students.manage", kind: "mutation", disposition: "authoritative",
    authority: "POST /admin/students/{studentId}/soft-delete", persistence: "versioned soft delete, Auth reconciliation, audit, and omission reload",
    errorState: "eligibility, conflict, authorization, Auth, and reload failures remain visible",
    proofOwner: "admin-student-mutations", sourceFiles: ["features/students/StudentManagementPage.tsx"],
    sourceAnchors: ["softDeleteStudent", "apiClient.post<AdminStudentSoftDeleteResult"],
  }),
  action({
    id: "questions.package.ingest", label: "Validate and commit Question package", routes: ["/admin/question-bank/upload-package"],
    capability: "admin.question_bank.manage", kind: "mutation", disposition: "authoritative",
    authority: "POST /admin/questions/packages/validate and /packages/{packageId}/commit",
    persistence: "validated package token followed by idempotent question/version/asset/audit commit",
    errorState: "schema, row, asset, conflict, authorization, and commit failures remain visible",
    proofOwner: "question-bank-lifecycle", sourceFiles: ["features/tests/QuestionBankManagementPage.tsx"],
    sourceAnchors: ["handleUploadSubmit", "handleFinalUpload"],
  }),
  action({
    id: "questions.package.rollback", label: "Rollback eligible Question package", routes: ["/admin/question-bank/validation-logs"],
    capability: "admin.question_bank.manage", kind: "mutation", disposition: "authoritative",
    authority: "POST /admin/questions/upload-logs/{uploadLogId}/rollback",
    persistence: "idempotent bounded rollback plus immutable log/audit and reload",
    errorState: "eligibility, conflict, authorization, and reload failures remain visible",
    proofOwner: "question-bank-lifecycle", sourceFiles: ["features/tests/AdminQuestionBankValidationLogsPage.tsx"],
    sourceAnchors: ["rollbackQuestionPackage", "void rollback(log)"],
  }),
  action({
    id: "questions.metadata.update", label: "Save Question metadata", routes: ["/admin/question-bank/library"],
    capability: "admin.question_bank.manage", kind: "mutation", disposition: "authoritative",
    authority: "PATCH /admin/questions/{questionId}/metadata", persistence: "versioned metadata/asset write plus library reload",
    errorState: "validation, conflict, asset, authorization, and reload failures remain visible",
    proofOwner: "question-bank-lifecycle", sourceFiles: ["features/tests/AdminQuestionBankLibraryPage.tsx"],
    sourceAnchors: ["saveMetadataEdits", "updateQuestionMetadata"],
  }),
  action({
    id: "questions.structure.update", label: "Save unused Question structure", routes: ["/admin/question-bank/library"],
    capability: "admin.question_bank.manage", kind: "mutation", disposition: "authoritative",
    authority: "PATCH /admin/questions/{questionId}/structure", persistence: "versioned structurally locked write plus reload",
    errorState: "usage lock, validation, conflict, authorization, and reload failures remain visible",
    proofOwner: "question-bank-lifecycle", sourceFiles: ["features/tests/AdminQuestionBankLibraryPage.tsx"],
    sourceAnchors: ["saveStructureEdits", "updateQuestionStructure"],
  }),
  action({
    id: "questions.version.create", label: "Create successor Question version", routes: ["/admin/question-bank/library", "/admin/question-bank/archive"],
    capability: "admin.question_bank.manage", kind: "mutation", disposition: "authoritative",
    authority: "POST /admin/questions/{questionId}/versions", persistence: "immutable predecessor and successor write plus reload",
    errorState: "usage requirement, conflict, authorization, and reload failures remain visible",
    proofOwner: "question-bank-lifecycle", sourceFiles: ["features/tests/AdminQuestionBankLibraryPage.tsx", "features/tests/AdminQuestionBankArchiveVersionsPage.tsx"],
    sourceAnchors: ["createQuestionVersion", "createSuccessorVersion"],
  }),
  action({
    id: "questions.lifecycle.deprecate", label: "Deprecate unused Question", routes: ["/admin/question-bank/library"],
    capability: "admin.question_bank.manage", kind: "mutation", disposition: "authoritative",
    authority: "POST /admin/questions/{questionId}/lifecycle", persistence: "versioned lifecycle write plus reload",
    errorState: "usage lock, conflict, authorization, and reload failures remain visible",
    proofOwner: "question-bank-lifecycle", sourceFiles: ["features/tests/AdminQuestionBankLibraryPage.tsx"],
    sourceAnchors: ["markQuestionDeprecated", "updateQuestionLifecycle"],
  }),
  action({
    id: "questions.tags.mutate", label: "Create, rename, merge, or deprecate governed tag", routes: ["/admin/question-bank/tags"],
    capability: "admin.question_bank.manage", kind: "mutation", disposition: "authoritative",
    authority: "POST /admin/questions/tags", persistence: "revisioned atomic dictionary/question update plus reload",
    errorState: "validation, active-use lock, conflict, authorization, and reload failures remain visible",
    proofOwner: "question-bank-lifecycle", sourceFiles: ["features/tests/AdminQuestionBankTagManagementPage.tsx"],
    sourceAnchors: ["applyTagOperation", "mutateQuestionTags"],
  }),
  action({
    id: "templates.save", label: "Create or update Test template", routes: ["/admin/tests/create", "/admin/tests/library"],
    capability: "admin.tests.manage", kind: "mutation", disposition: "authoritative",
    authority: "POST /admin/tests or PATCH /admin/tests/{testId}",
    persistence: "canonical versioned template write plus exact authoritative reload reconciliation",
    errorState: "validation, duplicate, structural-lock, conflict, authorization, and reload failures remain visible",
    proofOwner: "admin-template-lifecycle", sourceFiles: ["features/tests/TestTemplateManagementPage.tsx"],
    sourceAnchors: ["saveDraftTemplateFromCurrentState", "submitTemplateToApi", "updateTemplateInApi"],
  }),
  action({
    id: "templates.publish", label: "Mark draft Test template ready", routes: ["/admin/tests/library"],
    capability: "admin.tests.manage", kind: "mutation", disposition: "authoritative",
    authority: "POST /admin/tests/{testId}/publish", persistence: "idempotent lifecycle write plus exact reload reconciliation",
    errorState: "validation, lifecycle, conflict, authorization, and reload failures remain visible",
    proofOwner: "admin-template-lifecycle", sourceFiles: ["features/tests/TestTemplateManagementPage.tsx"],
    sourceAnchors: ["publishDraftTemplate", "publishTemplateInApi"],
  }),
  action({
    id: "templates.archive", label: "Archive eligible Test template", routes: ["/admin/tests/library"],
    capability: "admin.tests.manage", kind: "mutation", disposition: "authoritative",
    authority: "POST /admin/tests/{testId}/archive", persistence: "idempotent lifecycle write plus exact reload reconciliation",
    errorState: "lifecycle, conflict, authorization, and reload failures remain visible",
    proofOwner: "admin-template-lifecycle", sourceFiles: ["features/tests/TestTemplateManagementPage.tsx"],
    sourceAnchors: ["archiveTemplate", "archiveTemplateInApi"],
  }),
  action({
    id: "templates.custom_strategy.request", label: "Request custom timing strategy", routes: ["/admin/tests/create", "/admin/tests/library"],
    capability: "admin.tests.manage", kind: "mutation", disposition: "truthfully_unavailable",
    authority: "disabled UI; no authoritative request service is approved or configured",
    persistence: "none by design; the workspace explicitly states that no request is created or sent",
    errorState: "the disabled control and adjacent unavailable-state explanation remain visible",
    proofOwner: "BWM-033-action-truthfulness", sourceFiles: ["features/tests/TestTemplateManagementPage.tsx"],
    sourceAnchors: ["Custom strategy requests are unavailable.", "No request is created or sent from this workspace."],
  }),
  action({
    id: "assignments.create", label: "Schedule and publish Assignment", routes: ["/admin/assignments/create"],
    capability: "admin.assignments.manage", kind: "mutation", disposition: "authoritative",
    authority: "POST /admin/runs", persistence: "idempotent run write plus authoritative replay/reload reconciliation",
    errorState: "validation, eligibility, conflict, authorization, and reload failures remain visible",
    proofOwner: "admin-assignment-lifecycle", sourceFiles: ["features/assignments/AssignmentManagementPage.tsx"],
    sourceAnchors: ["scheduleRun", "submitRunToApi"],
  }),
  action({
    id: "assignments.derive", label: "Duplicate or reassign terminal Assignment", routes: ["/admin/assignments/history"],
    capability: "admin.assignments.manage", kind: "mutation", disposition: "authoritative",
    authority: "POST /admin/runs/{runId}/duplicate or /reassign", persistence: "idempotent derived run write plus detail/history reload",
    errorState: "validation, lifecycle, conflict, authorization, and reload failures remain visible",
    proofOwner: "admin-assignment-lifecycle", sourceFiles: ["features/assignments/AdminAssignmentsHistoryPage.tsx"],
    sourceAnchors: ["createDerived(\"duplicate\")", "createDerived(\"reassign\")"],
  }),
  action({
    id: "assignments.archive", label: "Archive terminal Assignment", routes: ["/admin/assignments/history"],
    capability: "admin.assignments.manage", kind: "mutation", disposition: "authoritative",
    authority: "POST /admin/runs/{runId}/lifecycle", persistence: "revisioned lifecycle write plus history/detail reload",
    errorState: "justification, lifecycle, conflict, authorization, and reload failures remain visible",
    proofOwner: "admin-assignment-lifecycle", sourceFiles: ["features/assignments/AdminAssignmentsHistoryPage.tsx"],
    sourceAnchors: ["archiveSelected", "updateAdminRunLifecycle"],
  }),
  action({
    id: "assignments.live.manage", label: "Extend, notify, or terminate live Assignment", routes: ["/admin/assignments/live/:runId"],
    capability: "admin.assignments.manage", kind: "mutation", disposition: "authoritative",
    authority: "Admin run lifecycle and notification APIs", persistence: "revisioned run/job/audit write plus live reload",
    errorState: "validation, lifecycle, conflict, authorization, queue, and reload failures remain visible",
    proofOwner: "admin-assignment-lifecycle", sourceFiles: ["features/assignments/AdminAssignmentLiveRunPage.tsx"],
    sourceAnchors: ["extendRun", "resendNotifications", "terminateRun"],
  }),
  action({
    id: "assignments.session.override", label: "Apply bounded Student session override", routes: ["/admin/assignments/live/:runId"],
    capability: "admin.assignments.manage", kind: "mutation", disposition: "authoritative",
    authority: "POST /admin/runs/{runId}/sessions/{sessionId}/override",
    persistence: "revisioned session/run/audit write plus live reload",
    errorState: "mutable-state, justification, conflict, authorization, and reload failures remain visible",
    proofOwner: "admin-assignment-lifecycle", sourceFiles: ["features/assignments/AdminAssignmentLiveRunPage.tsx"],
    sourceAnchors: ["overrideSession", "applyAdminSessionOverride"],
  }),
  action({
    id: "governance.report.generate", label: "Generate immutable governance PDF", routes: ["/admin/governance/reports"],
    capability: "admin.governance.export", kind: "mutation", disposition: "authoritative",
    authority: "POST /admin/governance/reports", persistence: "idempotent private artifact and audit plus report reload",
    errorState: "feature, source, authorization, artifact, and reload failures remain visible",
    proofOwner: "admin-governance-interventions", sourceFiles: ["features/analytics/GovernanceMonitoringDashboardPage.tsx"],
    sourceAnchors: ["generateReport", "generateGovernanceReport"],
  }),
  action({
    id: "governance.report.download", label: "Authorize governance PDF download", routes: ["/admin/governance/reports"],
    capability: "admin.governance.export", kind: "download", disposition: "authoritative",
    authority: "POST /admin/governance/reports/{reportId}/download", persistence: "fresh bounded download authorization",
    errorState: "authorization, missing artifact, signer, and download failures remain visible",
    proofOwner: "admin-governance-interventions", sourceFiles: ["features/analytics/GovernanceMonitoringDashboardPage.tsx"],
    sourceAnchors: ["downloadReport", "authorizeGovernanceReportDownload"],
  }),
  action({
    id: "interventions.recommend", label: "Create advisory intervention recommendation", routes: ["/admin/insights/interventions"],
    capability: "admin.interventions.manage", kind: "mutation", disposition: "authoritative",
    authority: "POST /admin/interventions", persistence: "idempotent recommendation/audit write plus timeline reload",
    errorState: "feature, source freshness, validation, authorization, and reload failures remain visible",
    proofOwner: "admin-governance-interventions", sourceFiles: ["features/insights/InterventionToolsPage.tsx"],
    sourceAnchors: ["createRecommendation", "createInterventionRecommendation"],
  }),
  action({
    id: "interventions.outcome.update", label: "Save intervention outcome", routes: ["/admin/insights/interventions"],
    capability: "admin.interventions.manage", kind: "mutation", disposition: "authoritative",
    authority: "PATCH /admin/interventions/{interventionId}", persistence: "revisioned outcome/audit write plus timeline reload",
    errorState: "validation, conflict, authorization, and reload failures remain visible",
    proofOwner: "admin-governance-interventions", sourceFiles: ["features/insights/InterventionToolsPage.tsx"],
    sourceAnchors: ["updateOutcome", "updateInterventionOutcome"],
  }),
  action({
    id: "settings.profile.update", label: "Save institute operating profile", routes: ["/admin/settings/profile"],
    capability: "admin.settings.manage", kind: "mutation", disposition: "authoritative",
    authority: "PATCH /admin/settings/profile", persistence: "versioned profile/audit write plus snapshot reconciliation",
    errorState: "validation, conflict, authorization, and reload failures remain visible",
    proofOwner: "admin-settings", sourceFiles: ["features/settings/AdminSettingsWorkspace.tsx"],
    sourceAnchors: ["saveProfile", "updateInstituteProfile"],
  }),
  action({
    id: "settings.year.lock", label: "Lock academic year", routes: ["/admin/settings/academic-year"],
    capability: "admin.settings.manage", kind: "mutation", disposition: "authoritative",
    authority: "POST /admin/settings/academic-years/{yearId}/lock", persistence: "revisioned lifecycle/audit write plus snapshot reconciliation",
    errorState: "confirmation, readiness, conflict, authorization, and reload failures remain visible",
    proofOwner: "admin-settings", sourceFiles: ["features/settings/AdminSettingsWorkspace.tsx"],
    sourceAnchors: ["handleLockYear", "lockAcademicYear"],
  }),
  action({
    id: "settings.year.archive", label: "Archive locked academic year", routes: ["/admin/settings/academic-year"],
    capability: "admin.settings.manage", kind: "mutation", disposition: "authoritative",
    authority: "POST /admin/settings/academic-years/{yearId}/archive", persistence: "idempotent archive pipeline/audit plus snapshot reconciliation",
    errorState: "typed confirmation, pipeline, conflict, authorization, and reload failures remain visible",
    proofOwner: "admin-settings", sourceFiles: ["features/settings/AdminSettingsWorkspace.tsx"],
    sourceAnchors: ["requestArchive", "archiveAcademicYear"],
  }),
  action({
    id: "settings.staff.invite", label: "Invite staff member", routes: ["/admin/settings/access"],
    capability: "admin.settings.manage", kind: "mutation", disposition: "authoritative",
    authority: "POST /admin/settings/staff/invitations", persistence: "idempotent Auth/staff/invitation/audit authority plus snapshot reconciliation",
    errorState: "validation, identity conflict, provider, authorization, and reload failures remain visible",
    proofOwner: "admin-settings", sourceFiles: ["features/settings/AdminSettingsWorkspace.tsx"],
    sourceAnchors: ["inviteUser", "inviteStaff"],
  }),
  action({
    id: "settings.staff.update", label: "Change staff role or access status", routes: ["/admin/settings/access"],
    capability: "admin.settings.manage", kind: "mutation", disposition: "authoritative",
    authority: "PATCH /admin/settings/staff/{userId}", persistence: "versioned Auth/claims/session/audit authority plus snapshot reconciliation",
    errorState: "primary/self guard, validation, conflict, Auth, authorization, and reload failures remain visible",
    proofOwner: "admin-settings", sourceFiles: ["features/settings/AdminSettingsWorkspace.tsx"],
    sourceAnchors: ["updateSelectedUser", "updateUserAccess"],
  }),
  action({
    id: "settings.staff.remove", label: "Remove staff access", routes: ["/admin/settings/access"],
    capability: "admin.settings.manage", kind: "mutation", disposition: "authoritative",
    authority: "DELETE /admin/settings/staff/{userId}", persistence: "versioned Auth/claims/session/audit authority plus snapshot reconciliation",
    errorState: "primary/self guard, conflict, Auth, authorization, and reload failures remain visible",
    proofOwner: "admin-settings", sourceFiles: ["features/settings/AdminSettingsWorkspace.tsx"],
    sourceAnchors: ["removeSelectedUser", "removeUserAccess"],
  }),
  action({
    id: "settings.staff.password_reset", label: "Send staff password reset", routes: ["/admin/settings/access"],
    capability: "admin.settings.manage", kind: "mutation", disposition: "authoritative",
    authority: "POST /admin/settings/staff/{userId}/password-reset", persistence: "idempotent revocation/reset-job/audit plus snapshot reconciliation",
    errorState: "self/primary guard, provider, Auth, authorization, and reload failures remain visible",
    proofOwner: "admin-settings", sourceFiles: ["features/settings/AdminSettingsWorkspace.tsx"],
    sourceAnchors: ["sendPasswordReset", "resetUserPassword"],
  }),
  action({
    id: "settings.session_policy.update", label: "Save administrator session policy", routes: ["/admin/settings/access"],
    capability: "admin.settings.manage", kind: "mutation", disposition: "authoritative",
    authority: "PATCH /admin/settings/session-policy", persistence: "versioned policy/audit write plus snapshot reconciliation",
    errorState: "validation, conflict, authorization, and reload failures remain visible",
    proofOwner: "admin-settings", sourceFiles: ["features/settings/AdminSettingsWorkspace.tsx"],
    sourceAnchors: ["saveSessionPolicy", "updateSecuritySettings"],
  }),
  action({
    id: "licensing.upgrade.request", label: "Submit license upgrade or evaluation request", routes: ["/admin/licensing/plans"],
    capability: "admin.license.upgrade_request", kind: "mutation", disposition: "authoritative",
    authority: "POST /admin/licensing/requests", persistence: "idempotent request/audit write plus licensing snapshot reload",
    errorState: "plan/state, validation, replay, authorization, and reload failures remain visible",
    proofOwner: "admin-licensing", sourceFiles: ["features/licensing/AdminLicensingWorkspace.tsx"],
    sourceAnchors: ["submitRequest", "submitLicenseUpgradeRequest"],
  }),
  action({
    id: "support.ticket.create", label: "Create support request", routes: ["/admin/help"],
    capability: "admin.support.manage", kind: "mutation", disposition: "authoritative",
    authority: "POST /admin/support/tickets", persistence: "idempotent ticket/message/attachment/job/audit authority plus list/detail reload",
    errorState: "validation, attachment, replay, authorization, provider-queue, and reload failures remain visible",
    proofOwner: "admin-support", sourceFiles: ["features/support/AdminHelpSupportPage.tsx"],
    sourceAnchors: ["submitTicket", "createSupportTicket"],
  }),
  action({
    id: "support.ticket.reply", label: "Add support reply", routes: ["/admin/help"],
    capability: "admin.support.manage", kind: "mutation", disposition: "authoritative",
    authority: "POST /admin/support/tickets/{ticketId}/messages", persistence: "revisioned message/attachment/job/audit authority plus detail reload",
    errorState: "validation, lifecycle, attachment, conflict, authorization, and reload failures remain visible",
    proofOwner: "admin-support", sourceFiles: ["features/support/AdminHelpSupportPage.tsx"],
    sourceAnchors: ["submitReply", "executeSupportCommand"],
  }),
  action({
    id: "support.ticket.lifecycle", label: "Resolve, close, or reopen support request", routes: ["/admin/help"],
    capability: "admin.support.manage", kind: "mutation", disposition: "authoritative",
    authority: "POST /admin/support/tickets/{ticketId}/lifecycle", persistence: "revisioned lifecycle/system-message/job/audit authority plus detail reload",
    errorState: "illegal transition, conflict, authorization, and reload failures remain visible",
    proofOwner: "admin-support", sourceFiles: ["features/support/AdminHelpSupportPage.tsx"],
    sourceAnchors: ["changeLifecycle", "lifecycleRequest"],
  }),
  action({
    id: "support.attachment.download", label: "Authorize support attachment download", routes: ["/admin/help"],
    capability: "admin.support.manage", kind: "download", disposition: "authoritative",
    authority: "POST /admin/support/tickets/{ticketId}/attachments/{attachmentId}/download",
    persistence: "fresh bounded download authorization without browser Storage coordinates",
    errorState: "deleted/unavailable, tenant, authorization, signer, and download failures remain visible",
    proofOwner: "admin-support", sourceFiles: ["features/support/AdminHelpSupportPage.tsx"],
    sourceAnchors: ["downloadAttachment", "fetchSupportAttachmentDownload"],
  }),
  action({
    id: "admin.local.controls", label: "Navigate, filter, paginate, select, preview, reset, and assemble drafts",
    routes: ["/admin/*"], capability: "portal.admin.access", kind: "local_ui", disposition: "truthful_local",
    authority: "browser presentation state only", persistence: "none claimed",
    errorState: "no business success is shown", proofOwner: "admin-action-ledger",
    sourceFiles: ["App.tsx", "features/students/StudentManagementPage.tsx"],
    sourceAnchors: ["AdminSidebarNavigation", "UiFormField", "UiTable"],
  }),
  action({
    id: "admin.fixture.sample_downloads", label: "Download fixture-only assignment samples",
    routes: ["/admin/assignments/details/:runId"], capability: "admin.assignments.read", kind: "download",
    disposition: "fixture_only", authority: "explicit fixture branch only", persistence: "none claimed",
    errorState: "live branch returns before sample controls render", proofOwner: "frontend-production-fallbacks",
    sourceFiles: ["features/assignments/AdminAssignmentDetailPage.tsx"],
    sourceAnchors: ["downloadSamplePdf", "downloadSampleExcel", "Sample PDF generated for testing only."],
  }),
];
