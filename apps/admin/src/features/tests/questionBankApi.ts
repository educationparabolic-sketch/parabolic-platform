import type {
  AdminQuestionAnalyticsRecord,
  AdminQuestionAuthoritativeRecord,
  AdminQuestionDetailResult,
  AdminQuestionLibraryPageResult,
  AdminQuestionLifecycleRequest,
  AdminQuestionLifecycleResult,
  AdminQuestionMetadataUpdateRequest,
  AdminQuestionPackageCommitRequest,
  AdminQuestionPackageCommitResult,
  AdminQuestionPackageRollbackRequest,
  AdminQuestionPackageRollbackResult,
  AdminQuestionPackageRowResult,
  AdminQuestionPackageSummary,
  AdminQuestionPackageValidateRequest,
  AdminQuestionPackageValidationResult,
  AdminQuestionStructureUpdateRequest,
  AdminQuestionTagAuthorityRecord,
  AdminQuestionTagField,
  AdminQuestionTagMutationRequest,
  AdminQuestionTagMutationResult,
  AdminQuestionTagsResult,
  AdminQuestionTemplateUsageRecord,
  AdminQuestionUpdateResult,
  AdminQuestionUploadLogDetailResult,
  AdminQuestionVersionCreateRequest,
  AdminQuestionVersionCreateResult,
  AdminQuestionVersionSummary,
} from "../../../../../shared/contracts/apiDtos";
import { adaptAdminQuestionLibraryResult } from "../../../../../shared/services/portalResponseAdapters";
import { getPortalApiClient } from "../../../../../shared/services/portalIntegration";

const apiClient = getPortalApiClient("admin");

export interface QuestionUploadLogSummary {
  created: number;
  errors: number;
  id: string;
  timestamp: string;
  totalRows: number;
  uploadedBy: string;
  versionCreated: number;
  warnings: number;
}

export interface QuestionDistributionDifficultyMetric {
  difficulty: "Easy" | "Medium" | "Hard";
  guessRatePercent: number;
  marksPercent: number;
  overstayPercent: number;
  questionCount: number;
  sharePercent: number;
}

export interface QuestionDistributionChapterRecord {
  chapter: string;
  disciplineStressIndex: number;
  easyPercent: number;
  hardPercent: number;
  marksPercent: number;
  mediumPercent: number;
  questionCount: number;
  riskImpactScore: number;
  subject: string;
}

export interface QuestionDistributionResult {
  analyticsQuestionCount: number;
  chapters: QuestionDistributionChapterRecord[];
  computedAt: string;
  difficulties: QuestionDistributionDifficultyMetric[];
  examType: string;
  imbalanceWarnings: number;
  missingDifficultyWarnings: number;
  totalQuestions: number;
}

function fail(route: string, field: string): never {
  throw new Error(`${route} returned an invalid "${field}" field.`);
}

function record(value: unknown, route: string, field = "data"): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail(route, field);
  return value as Record<string, unknown>;
}

function string(value: unknown, route: string, field: string, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && !value.trim())) return fail(route, field);
  return value;
}

function nullableString(value: unknown, route: string, field: string): string | null {
  return value === null ? null : string(value, route, field);
}

function number(value: unknown, route: string, field: string, integer = false): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || (integer && !Number.isInteger(value))) {
    return fail(route, field);
  }
  return value;
}

function positiveInteger(value: unknown, route: string, field: string): number {
  const parsed = number(value, route, field, true);
  return parsed > 0 ? parsed : fail(route, field);
}

function boolean(value: unknown, route: string, field: string): boolean {
  return typeof value === "boolean" ? value : fail(route, field);
}

function array(value: unknown, route: string, field: string): unknown[] {
  return Array.isArray(value) ? value : fail(route, field);
}

function oneOf<T extends string>(value: unknown, values: readonly T[], route: string, field: string): T {
  return typeof value === "string" && values.includes(value as T) ? value as T : fail(route, field);
}

function iso(value: unknown, route: string, field: string): string {
  const parsed = string(value, route, field);
  return Number.isNaN(Date.parse(parsed)) ? fail(route, field) : parsed;
}

function authoritativeQuestion(value: unknown, route: string): AdminQuestionAuthoritativeRecord {
  const raw = record(value, route, "question");
  const base = adaptAdminQuestionLibraryResult({ questions: [raw] }).questions[0];
  if (!base) return fail(route, "question");
  return {
    ...base,
    createdAt: iso(raw.createdAt, route, "question.createdAt"),
    lastUsedAcademicYear: nullableString(raw.lastUsedAcademicYear, route, "question.lastUsedAcademicYear"),
    parentQuestionId: nullableString(raw.parentQuestionId, route, "question.parentQuestionId"),
    revision: positiveInteger(raw.revision, route, "question.revision"),
    updatedAt: iso(raw.updatedAt, route, "question.updatedAt"),
    usedInTemplate: boolean(raw.usedInTemplate, route, "question.usedInTemplate"),
  };
}

function versionSummary(value: unknown, route: string, index: number): AdminQuestionVersionSummary {
  const raw = record(value, route, `versions[${index}]`);
  return {
    createdAt: iso(raw.createdAt, route, `versions[${index}].createdAt`),
    parentQuestionId: nullableString(raw.parentQuestionId, route, `versions[${index}].parentQuestionId`),
    questionId: string(raw.questionId, route, `versions[${index}].questionId`),
    revision: positiveInteger(raw.revision, route, `versions[${index}].revision`),
    status: oneOf(raw.status, ["active", "used", "archived", "deprecated"] as const, route, `versions[${index}].status`),
    version: positiveInteger(raw.version, route, `versions[${index}].version`),
  };
}

function templateUsage(value: unknown, route: string, index: number): AdminQuestionTemplateUsageRecord {
  const raw = record(value, route, `templateUsage[${index}]`);
  return {
    lastUsedAt: nullableString(raw.lastUsedAt, route, `templateUsage[${index}].lastUsedAt`),
    runCount: number(raw.runCount, route, `templateUsage[${index}].runCount`, true),
    status: oneOf(raw.status, ["draft", "ready", "assigned", "archived", "deprecated"] as const, route, `templateUsage[${index}].status`),
    testId: string(raw.testId, route, `templateUsage[${index}].testId`),
    testName: string(raw.testName, route, `templateUsage[${index}].testName`),
    version: positiveInteger(raw.version, route, `templateUsage[${index}].version`),
  };
}

function analytics(value: unknown, route: string): AdminQuestionAnalyticsRecord | null {
  if (value === null) return null;
  const raw = record(value, route, "analytics");
  return {
    avgAccuracyWhenUsed: number(raw.avgAccuracyWhenUsed, route, "analytics.avgAccuracyWhenUsed"),
    avgRawPercentWhenUsed: number(raw.avgRawPercentWhenUsed, route, "analytics.avgRawPercentWhenUsed"),
    averageResponseTimeMs: number(raw.averageResponseTimeMs, route, "analytics.averageResponseTimeMs"),
    correctAttemptCount: number(raw.correctAttemptCount, route, "analytics.correctAttemptCount", true),
    disciplineStressIndex: number(raw.disciplineStressIndex, route, "analytics.disciplineStressIndex"),
    guessRate: number(raw.guessRate, route, "analytics.guessRate"),
    incorrectAttemptCount: number(raw.incorrectAttemptCount, route, "analytics.incorrectAttemptCount", true),
    overstayRate: number(raw.overstayRate, route, "analytics.overstayRate"),
    riskImpactScore: number(raw.riskImpactScore, route, "analytics.riskImpactScore"),
  };
}

export async function getQuestionLibrary(query: Record<string, string> = {}): Promise<AdminQuestionLibraryPageResult> {
  const route = "GET /admin/questions/library";
  const raw = record(await apiClient.get<unknown>("/admin/questions/library", {
    emptyResultIsReady: true,
    query,
  }), route);
  return {
    currentAcademicYear: string(raw.currentAcademicYear, route, "currentAcademicYear"),
    nextCursor: nullableString(raw.nextCursor, route, "nextCursor"),
    questions: array(raw.questions, route, "questions").map((value) => authoritativeQuestion(value, route)),
  };
}

export async function getQuestionDetail(questionId: string): Promise<AdminQuestionDetailResult> {
  const route = "GET /admin/questions/library/{questionId}";
  const raw = record(await apiClient.get<unknown>(`/admin/questions/library/${encodeURIComponent(questionId)}`), route);
  return {
    analytics: analytics(raw.analytics, route),
    question: authoritativeQuestion(raw.question, route),
    templateUsage: array(raw.templateUsage, route, "templateUsage").map((value, index) => templateUsage(value, route, index)),
    versions: array(raw.versions, route, "versions").map((value, index) => versionSummary(value, route, index)),
  };
}

function mutationResult(value: unknown, route: string): AdminQuestionUpdateResult {
  const raw = record(value, route);
  return {
    auditId: string(raw.auditId, route, "auditId"),
    disposition: oneOf(raw.disposition, ["applied", "replayed"] as const, route, "disposition"),
    questionId: string(raw.questionId, route, "questionId"),
    revision: positiveInteger(raw.revision, route, "revision"),
    updatedAt: iso(raw.updatedAt, route, "updatedAt"),
    version: positiveInteger(raw.version, route, "version"),
  };
}

export async function updateQuestionMetadata(questionId: string, body: AdminQuestionMetadataUpdateRequest) {
  const route = "PATCH /admin/questions/{questionId}/metadata";
  return mutationResult(await apiClient.patch<unknown, AdminQuestionMetadataUpdateRequest>(
    `/admin/questions/${encodeURIComponent(questionId)}/metadata`, { body, handledFailureIsReady: true },
  ), route);
}

export async function updateQuestionStructure(questionId: string, body: AdminQuestionStructureUpdateRequest) {
  const route = "PATCH /admin/questions/{questionId}/structure";
  return mutationResult(await apiClient.patch<unknown, AdminQuestionStructureUpdateRequest>(
    `/admin/questions/${encodeURIComponent(questionId)}/structure`, { body, handledFailureIsReady: true },
  ), route);
}

export async function createQuestionVersion(questionId: string, body: AdminQuestionVersionCreateRequest): Promise<AdminQuestionVersionCreateResult> {
  const route = "POST /admin/questions/{questionId}/versions";
  const raw = record(await apiClient.post<unknown, AdminQuestionVersionCreateRequest>(
    `/admin/questions/${encodeURIComponent(questionId)}/versions`, { body, handledFailureIsReady: true },
  ), route);
  return {
    auditId: string(raw.auditId, route, "auditId"),
    disposition: oneOf(raw.disposition, ["applied", "replayed"] as const, route, "disposition"),
    sourceQuestionId: string(raw.sourceQuestionId, route, "sourceQuestionId"),
    sourceRevision: positiveInteger(raw.sourceRevision, route, "sourceRevision"),
    sourceStatus: oneOf(raw.sourceStatus, ["deprecated"] as const, route, "sourceStatus"),
    sourceVersion: positiveInteger(raw.sourceVersion, route, "sourceVersion"),
    successorQuestionId: string(raw.successorQuestionId, route, "successorQuestionId"),
    successorRevision: positiveInteger(raw.successorRevision, route, "successorRevision"),
    successorStatus: oneOf(raw.successorStatus, ["active"] as const, route, "successorStatus"),
    successorVersion: positiveInteger(raw.successorVersion, route, "successorVersion"),
    updatedAt: iso(raw.updatedAt, route, "updatedAt"),
  };
}

export async function updateQuestionLifecycle(questionId: string, body: AdminQuestionLifecycleRequest): Promise<AdminQuestionLifecycleResult> {
  const route = "POST /admin/questions/{questionId}/lifecycle";
  const raw = record(await apiClient.post<unknown, AdminQuestionLifecycleRequest>(
    `/admin/questions/${encodeURIComponent(questionId)}/lifecycle`, { body, handledFailureIsReady: true },
  ), route);
  return {
    action: oneOf(raw.action, ["archive", "deprecate"] as const, route, "action"),
    auditId: string(raw.auditId, route, "auditId"),
    disposition: oneOf(raw.disposition, ["applied", "replayed"] as const, route, "disposition"),
    previousStatus: oneOf(raw.previousStatus, ["active", "used", "archived", "deprecated"] as const, route, "previousStatus"),
    questionId: string(raw.questionId, route, "questionId"),
    revision: positiveInteger(raw.revision, route, "revision"),
    status: oneOf(raw.status, ["archived", "deprecated"] as const, route, "status"),
    thermalState: oneOf(raw.thermalState, ["hot", "warm", "cold"] as const, route, "thermalState"),
    updatedAt: iso(raw.updatedAt, route, "updatedAt"),
    version: positiveInteger(raw.version, route, "version"),
  };
}

function tagRecord(value: unknown, route: string, index: number): AdminQuestionTagAuthorityRecord {
  const raw = record(value, route, `tags[${index}]`);
  return {
    field: oneOf(raw.field, ["primaryTag", "secondaryTag", "additionalTag", "topic"] as const, route, `tags[${index}].field`),
    name: string(raw.name, route, `tags[${index}].name`),
    questionCount: number(raw.questionCount, route, `tags[${index}].questionCount`, true),
    status: oneOf(raw.status, ["active", "deprecated"] as const, route, `tags[${index}].status`),
    usedInActiveTemplate: boolean(raw.usedInActiveTemplate, route, `tags[${index}].usedInActiveTemplate`),
  };
}

function tagsResult(value: unknown, route: string): AdminQuestionTagsResult {
  const raw = record(value, route);
  return {
    dictionaryRevision: positiveInteger(raw.dictionaryRevision, route, "dictionaryRevision"),
    tags: array(raw.tags, route, "tags").map((value, index) => tagRecord(value, route, index)),
  };
}

export async function getQuestionTags(field?: AdminQuestionTagField): Promise<AdminQuestionTagsResult> {
  return tagsResult(await apiClient.get<unknown>("/admin/questions/tags", {
    emptyResultIsReady: true,
    query: field ? { field } : {},
  }), "GET /admin/questions/tags");
}

export async function mutateQuestionTags(body: AdminQuestionTagMutationRequest): Promise<AdminQuestionTagMutationResult> {
  const route = "POST /admin/questions/tags";
  const payload = await apiClient.post<unknown, AdminQuestionTagMutationRequest>(
    "/admin/questions/tags", { body, handledFailureIsReady: true },
  );
  const base = tagsResult(payload, route);
  const raw = record(payload, route);
  return {
    ...base,
    affectedQuestionCount: number(raw.affectedQuestionCount, route, "affectedQuestionCount", true),
    auditId: string(raw.auditId, route, "auditId"),
    disposition: oneOf(raw.disposition, ["applied", "replayed"] as const, route, "disposition"),
    updatedAt: iso(raw.updatedAt, route, "updatedAt"),
  };
}

function packageRow(value: unknown, route: string, index: number): AdminQuestionPackageRowResult {
  const raw = record(value, route, `rows[${index}]`);
  const strings = (field: "errors" | "warnings") => array(raw[field], route, `rows[${index}].${field}`)
    .map((entry, entryIndex) => string(entry, route, `rows[${index}].${field}[${entryIndex}]`));
  return {
    action: oneOf(raw.action, ["create", "update", "none"] as const, route, `rows[${index}].action`),
    errors: strings("errors"),
    questionId: nullableString(raw.questionId, route, `rows[${index}].questionId`),
    rowNumber: number(raw.rowNumber, route, `rows[${index}].rowNumber`, true),
    uniqueKey: nullableString(raw.uniqueKey, route, `rows[${index}].uniqueKey`),
    version: raw.version === null ? null : positiveInteger(raw.version, route, `rows[${index}].version`),
    warnings: strings("warnings"),
  };
}

function packageSummary(value: unknown, route: string): AdminQuestionPackageSummary {
  const raw = record(value, route, "summary");
  return Object.fromEntries(["assetCount", "created", "invalid", "received", "updated", "valid", "warnings"]
    .map((field) => [field, number(raw[field], route, `summary.${field}`, true)])) as unknown as AdminQuestionPackageSummary;
}

export async function validateQuestionPackage(body: AdminQuestionPackageValidateRequest): Promise<AdminQuestionPackageValidationResult> {
  const route = "POST /admin/questions/packages/validate";
  const raw = record(await apiClient.post<unknown, AdminQuestionPackageValidateRequest>(
    "/admin/questions/packages/validate", { body, handledFailureIsReady: true },
  ), route);
  return {
    contentSha256: string(raw.contentSha256, route, "contentSha256"),
    disposition: oneOf(raw.disposition, ["applied", "replayed"] as const, route, "disposition"),
    expiresAt: iso(raw.expiresAt, route, "expiresAt"),
    packageId: string(raw.packageId, route, "packageId"),
    packageRevision: positiveInteger(raw.packageRevision, route, "packageRevision"),
    rows: array(raw.rows, route, "rows").map((value, index) => packageRow(value, route, index)),
    state: oneOf(raw.state, ["validation_failed", "validated"] as const, route, "state"),
    summary: packageSummary(raw.summary, route),
    uploadLogId: string(raw.uploadLogId, route, "uploadLogId"),
    validatedAt: iso(raw.validatedAt, route, "validatedAt"),
  };
}

export async function commitQuestionPackage(packageId: string, body: AdminQuestionPackageCommitRequest): Promise<AdminQuestionPackageCommitResult> {
  const route = "POST /admin/questions/packages/{packageId}/commit";
  const raw = record(await apiClient.post<unknown, AdminQuestionPackageCommitRequest>(
    `/admin/questions/packages/${encodeURIComponent(packageId)}/commit`, { body, handledFailureIsReady: true },
  ), route);
  return {
    assetCount: number(raw.assetCount, route, "assetCount", true),
    auditId: string(raw.auditId, route, "auditId"),
    committedAt: iso(raw.committedAt, route, "committedAt"),
    disposition: oneOf(raw.disposition, ["applied", "replayed"] as const, route, "disposition"),
    packageId: string(raw.packageId, route, "packageId"),
    packageRevision: positiveInteger(raw.packageRevision, route, "packageRevision"),
    questions: array(raw.questions, route, "questions").map((value, index) => {
      const question = record(value, route, `questions[${index}]`);
      return {
        action: oneOf(question.action, ["create", "update"] as const, route, `questions[${index}].action`),
        questionId: string(question.questionId, route, `questions[${index}].questionId`),
        revision: positiveInteger(question.revision, route, `questions[${index}].revision`),
        version: positiveInteger(question.version, route, `questions[${index}].version`),
      };
    }),
    state: oneOf(raw.state, ["committed"] as const, route, "state"),
    uploadLogId: string(raw.uploadLogId, route, "uploadLogId"),
  };
}

export async function rollbackQuestionPackage(uploadLogId: string, body: AdminQuestionPackageRollbackRequest): Promise<AdminQuestionPackageRollbackResult> {
  const route = "POST /admin/questions/upload-logs/{uploadLogId}/rollback";
  const raw = record(await apiClient.post<unknown, AdminQuestionPackageRollbackRequest>(
    `/admin/questions/upload-logs/${encodeURIComponent(uploadLogId)}/rollback`, { body, handledFailureIsReady: true },
  ), route);
  return {
    auditId: string(raw.auditId, route, "auditId"),
    disposition: oneOf(raw.disposition, ["applied", "replayed"] as const, route, "disposition"),
    packageId: string(raw.packageId, route, "packageId"),
    packageRevision: positiveInteger(raw.packageRevision, route, "packageRevision"),
    removedAssetCount: number(raw.removedAssetCount, route, "removedAssetCount", true),
    removedQuestionCount: number(raw.removedQuestionCount, route, "removedQuestionCount", true),
    rolledBackAt: iso(raw.rolledBackAt, route, "rolledBackAt"),
    state: oneOf(raw.state, ["rolled_back"] as const, route, "state"),
    uploadLogId: string(raw.uploadLogId, route, "uploadLogId"),
  };
}

export async function getQuestionUploadLogs(): Promise<QuestionUploadLogSummary[]> {
  const route = "GET /admin/questions/upload-logs";
  const raw = record(await apiClient.get<unknown>("/admin/questions/upload-logs", {
    emptyResultIsReady: true,
  }), route);
  return array(raw.logs, route, "logs").map((value, index) => {
    const log = record(value, route, `logs[${index}]`);
    return {
      created: number(log.created, route, `logs[${index}].created`, true),
      errors: number(log.errors, route, `logs[${index}].errors`, true),
      id: string(log.id, route, `logs[${index}].id`),
      timestamp: iso(log.timestamp, route, `logs[${index}].timestamp`),
      totalRows: number(log.totalRows, route, `logs[${index}].totalRows`, true),
      uploadedBy: string(log.uploadedBy, route, `logs[${index}].uploadedBy`),
      versionCreated: number(log.versionCreated, route, `logs[${index}].versionCreated`, true),
      warnings: number(log.warnings, route, `logs[${index}].warnings`, true),
    };
  });
}

export async function getQuestionUploadLogDetail(uploadLogId: string): Promise<AdminQuestionUploadLogDetailResult> {
  const route = "GET /admin/questions/upload-logs/{uploadLogId}";
  const raw = record(await apiClient.get<unknown>(`/admin/questions/upload-logs/${encodeURIComponent(uploadLogId)}`), route);
  return {
    committedAt: raw.committedAt === null ? null : iso(raw.committedAt, route, "committedAt"),
    contentSha256: string(raw.contentSha256, route, "contentSha256"),
    packageId: string(raw.packageId, route, "packageId"),
    packageRevision: positiveInteger(raw.packageRevision, route, "packageRevision"),
    rollbackEligible: boolean(raw.rollbackEligible, route, "rollbackEligible"),
    rollbackReason: nullableString(raw.rollbackReason, route, "rollbackReason"),
    rows: array(raw.rows, route, "rows").map((value, index) => packageRow(value, route, index)),
    state: oneOf(raw.state, ["validation_failed", "validated", "committing", "committed", "rollback_pending", "rolled_back", "failed_recoverable"] as const, route, "state"),
    summary: packageSummary(raw.summary, route),
    uploadLogId: string(raw.uploadLogId, route, "uploadLogId"),
    uploadedBy: string(raw.uploadedBy, route, "uploadedBy"),
    validatedAt: iso(raw.validatedAt, route, "validatedAt"),
  };
}

export async function getQuestionDistribution(examType?: string): Promise<QuestionDistributionResult> {
  const route = "GET /admin/questions/distribution";
  const payload = record(await apiClient.get<unknown>("/admin/questions/distribution", {
    query: { limit: "100", ...(examType ? { examType } : {}) },
  }), route);
  const raw = record(payload.summary, route, "summary");
  return {
    analyticsQuestionCount: number(raw.analyticsQuestionCount, route, "summary.analyticsQuestionCount", true),
    chapters: array(raw.chapters, route, "summary.chapters").map((value, index) => {
      const item = record(value, route, `summary.chapters[${index}]`);
      return {
        chapter: string(item.chapter, route, `summary.chapters[${index}].chapter`),
        disciplineStressIndex: number(item.disciplineStressIndex, route, `summary.chapters[${index}].disciplineStressIndex`),
        easyPercent: number(item.easyPercent, route, `summary.chapters[${index}].easyPercent`),
        hardPercent: number(item.hardPercent, route, `summary.chapters[${index}].hardPercent`),
        marksPercent: number(item.marksPercent, route, `summary.chapters[${index}].marksPercent`),
        mediumPercent: number(item.mediumPercent, route, `summary.chapters[${index}].mediumPercent`),
        questionCount: number(item.questionCount, route, `summary.chapters[${index}].questionCount`, true),
        riskImpactScore: number(item.riskImpactScore, route, `summary.chapters[${index}].riskImpactScore`),
        subject: string(item.subject, route, `summary.chapters[${index}].subject`),
      };
    }),
    computedAt: iso(raw.computedAt, route, "summary.computedAt"),
    difficulties: array(raw.difficulties, route, "summary.difficulties").map((value, index) => {
      const item = record(value, route, `summary.difficulties[${index}]`);
      return {
        difficulty: oneOf(item.difficulty, ["Easy", "Medium", "Hard"] as const, route, `summary.difficulties[${index}].difficulty`),
        guessRatePercent: number(item.guessRatePercent, route, `summary.difficulties[${index}].guessRatePercent`),
        marksPercent: number(item.marksPercent, route, `summary.difficulties[${index}].marksPercent`),
        overstayPercent: number(item.overstayPercent, route, `summary.difficulties[${index}].overstayPercent`),
        questionCount: number(item.questionCount, route, `summary.difficulties[${index}].questionCount`, true),
        sharePercent: number(item.sharePercent, route, `summary.difficulties[${index}].sharePercent`),
      };
    }),
    examType: string(raw.examType, route, "summary.examType"),
    imbalanceWarnings: number(raw.imbalanceWarnings, route, "summary.imbalanceWarnings", true),
    missingDifficultyWarnings: number(raw.missingDifficultyWarnings, route, "summary.missingDifficultyWarnings", true),
    totalQuestions: number(raw.totalQuestions, route, "summary.totalQuestions", true),
  };
}

export function createQuestionBankIdempotencyKey(scope: string): string {
  return `${scope}:${crypto.randomUUID()}`;
}

export async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}
