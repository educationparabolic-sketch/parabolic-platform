import type {
  AdminRunDerivedCreateResult,
  AdminRunDuplicateRequest,
  AdminRunHistoryAnalytics,
  AdminRunHistoryQuery,
  AdminRunHistoryResult,
  AdminRunHistoryVersionedRecord,
  AdminRunLifecycleRequest,
  AdminRunLifecycleResult,
  AdminRunLiveDetailQuery,
  AdminRunLiveDetailResult,
  AdminRunLiveListQuery,
  AdminRunLiveListResult,
  AdminRunLiveListRecord,
  AdminRunLiveStudentRecord,
  AdminRunLiveSummary,
  AdminRunLiveVersionedRecord,
  AdminRunNotificationResendRequest,
  AdminRunNotificationResendResult,
  AdminRunReassignRequest,
  AdminRunSessionOverrideRequest,
  AdminRunSessionOverrideResult,
  AdminRunVersionedRecord,
} from "../../../../../shared/contracts/apiDtos";
import { PortalResponseValidationError } from "../../../../../shared/services/portalResponseAdapters";
import { getPortalApiClient } from "../../../../../shared/services/portalIntegration";

const apiClient = getPortalApiClient("admin");

function invalid(route: string, field: string, expectation: string): never {
  throw new PortalResponseValidationError(route, `returned invalid field "${field}"; expected ${expectation}.`);
}

function record(value: unknown, route: string, field = "data"): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid(route, field, "an object");
  return value as Record<string, unknown>;
}

function array(value: unknown, route: string, field: string): unknown[] {
  if (!Array.isArray(value)) return invalid(route, field, "an array");
  return value;
}

function string(value: unknown, route: string, field: string): string {
  if (typeof value !== "string" || !value.trim()) return invalid(route, field, "a non-empty string");
  return value;
}

function nullableString(value: unknown, route: string, field: string): string | null {
  return value === null ? null : string(value, route, field);
}

function number(value: unknown, route: string, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return invalid(route, field, "a finite number");
  return value;
}

function integer(value: unknown, route: string, field: string, minimum = 0): number {
  const parsed = number(value, route, field);
  if (!Number.isInteger(parsed) || parsed < minimum) return invalid(route, field, `an integer >= ${minimum}`);
  return parsed;
}

function nullableNumber(value: unknown, route: string, field: string): number | null {
  return value === null ? null : number(value, route, field);
}

function boolean(value: unknown, route: string, field: string): boolean {
  if (typeof value !== "boolean") return invalid(route, field, "a boolean");
  return value;
}

function enumeration<T extends string>(
  value: unknown,
  values: readonly T[],
  route: string,
  field: string,
): T {
  if (typeof value !== "string" || !values.includes(value as T)) {
    return invalid(route, field, values.map((entry) => `"${entry}"`).join(" or "));
  }
  return value as T;
}

function cursor(value: unknown, route: string): string | null {
  return value === null ? null : string(value, route, "nextCursor");
}

function adaptVersionedRun(
  value: unknown,
  route: string,
  field: string,
): AdminRunVersionedRecord {
  const run = record(value, route, field);
  const policy = record(run.proctoringPolicy, route, `${field}.proctoringPolicy`);
  const recipientStudentIds = array(run.recipientStudentIds, route, `${field}.recipientStudentIds`)
    .map((entry, index) => string(entry, route, `${field}.recipientStudentIds[${index}]`));
  const recipientCount = integer(run.recipientCount, route, `${field}.recipientCount`, 1);
  if (recipientStudentIds.length !== recipientCount || new Set(recipientStudentIds).size !== recipientCount) {
    return invalid(route, `${field}.recipientStudentIds`, "the unique recipientCount-sized list");
  }
  return {
    academicYear: string(run.academicYear, route, `${field}.academicYear`),
    attemptLimit: integer(run.attemptLimit, route, `${field}.attemptLimit`, 1),
    canonicalId: string(run.canonicalId, route, `${field}.canonicalId`),
    createdAt: string(run.createdAt, route, `${field}.createdAt`),
    endWindow: string(run.endWindow, route, `${field}.endWindow`),
    gracePeriodMinutes: integer(run.gracePeriodMinutes, route, `${field}.gracePeriodMinutes`),
    id: string(run.id, route, `${field}.id`),
    mode: enumeration(run.mode, ["Operational", "Diagnostic", "Controlled", "Hard"] as const, route, `${field}.mode`),
    proctoringPolicy: {
      browserIntegrityGuardEnabled: boolean(policy.browserIntegrityGuardEnabled, route, `${field}.proctoringPolicy.browserIntegrityGuardEnabled`),
      faceIdentityGazeGuardEnabled: boolean(policy.faceIdentityGazeGuardEnabled, route, `${field}.proctoringPolicy.faceIdentityGazeGuardEnabled`),
    },
    recipientCount,
    recipientStudentIds,
    revision: integer(run.revision, route, `${field}.revision`, 1),
    runPath: string(run.runPath, route, `${field}.runPath`),
    shuffleQuestionOrder: boolean(run.shuffleQuestionOrder, route, `${field}.shuffleQuestionOrder`),
    startWindow: string(run.startWindow, route, `${field}.startWindow`),
    status: enumeration(
      run.status,
      ["scheduled", "active", "collecting", "completed", "archived", "cancelled", "terminated"] as const,
      route,
      `${field}.status`,
    ),
    templateVersion: integer(run.templateVersion, route, `${field}.templateVersion`, 1),
    testId: string(run.testId, route, `${field}.testId`),
    timezone: string(run.timezone, route, `${field}.timezone`),
    updatedAt: string(run.updatedAt, route, `${field}.updatedAt`),
  };
}

function adaptSummary(value: unknown, route: string, field: string): AdminRunLiveSummary {
  const summary = record(value, route, field);
  const result = {
    activeSessionCount: integer(summary.activeSessionCount, route, `${field}.activeSessionCount`),
    notStartedCount: integer(summary.notStartedCount, route, `${field}.notStartedCount`),
    submittedCount: integer(summary.submittedCount, route, `${field}.submittedCount`),
    terminatedSessionCount: integer(summary.terminatedSessionCount, route, `${field}.terminatedSessionCount`),
    totalRecipients: integer(summary.totalRecipients, route, `${field}.totalRecipients`, 1),
  };
  if (result.activeSessionCount + result.notStartedCount + result.submittedCount + result.terminatedSessionCount !== result.totalRecipients) {
    return invalid(route, field, "counts that sum to totalRecipients");
  }
  return result;
}

function adaptLiveRun(value: unknown, route: string, field: string): AdminRunLiveVersionedRecord {
  const run = adaptVersionedRun(value, route, field);
  if (run.status !== "active" && run.status !== "collecting") {
    return invalid(route, `${field}.status`, '"active" or "collecting"');
  }
  return run as AdminRunLiveVersionedRecord;
}

function adaptLiveListRecord(value: unknown, route: string, field: string): AdminRunLiveListRecord {
  const row = record(value, route, field);
  return {
    run: adaptLiveRun(row.run, route, `${field}.run`),
    summary: adaptSummary(row.summary, route, `${field}.summary`),
  };
}

function adaptLiveStudent(value: unknown, route: string, field: string): AdminRunLiveStudentRecord {
  const row = record(value, route, field);
  const sessionId = nullableString(row.sessionId, route, `${field}.sessionId`);
  const sessionRevision = row.sessionRevision === null ? null : integer(row.sessionRevision, route, `${field}.sessionRevision`, 1);
  if ((sessionId === null) !== (sessionRevision === null)) {
    return invalid(route, field, "matching nullable session identity and revision");
  }
  return {
    controlledCompliancePercent: nullableNumber(row.controlledCompliancePercent, route, `${field}.controlledCompliancePercent`),
    currentPhase: nullableString(row.currentPhase, route, `${field}.currentPhase`),
    maxTimeViolationCount: row.maxTimeViolationCount === null ? null : integer(row.maxTimeViolationCount, route, `${field}.maxTimeViolationCount`),
    minTimeViolationCount: row.minTimeViolationCount === null ? null : integer(row.minTimeViolationCount, route, `${field}.minTimeViolationCount`),
    overrideUsed: boolean(row.overrideUsed, route, `${field}.overrideUsed`),
    pacingDrift: row.pacingDrift === null ? null : boolean(row.pacingDrift, route, `${field}.pacingDrift`),
    progressPercent: number(row.progressPercent, route, `${field}.progressPercent`),
    provisionalRiskScore: nullableNumber(row.provisionalRiskScore, route, `${field}.provisionalRiskScore`),
    rapidGuess: row.rapidGuess === null ? null : boolean(row.rapidGuess, route, `${field}.rapidGuess`),
    sessionId,
    sessionRevision,
    skipBurst: row.skipBurst === null ? null : boolean(row.skipBurst, route, `${field}.skipBurst`),
    status: enumeration(row.status, ["not_started", "created", "started", "active", "submitted", "expired", "terminated"] as const, route, `${field}.status`),
    studentId: string(row.studentId, route, `${field}.studentId`),
    studentName: string(row.studentName, route, `${field}.studentName`),
    timeRemainingSeconds: integer(row.timeRemainingSeconds, route, `${field}.timeRemainingSeconds`),
  };
}

function adaptHistoryAnalytics(value: unknown, route: string, field: string): AdminRunHistoryAnalytics {
  const analytics = record(value, route, field);
  let riskDistribution: Record<string, number> | null = null;
  if (analytics.riskDistribution !== null) {
    const source = record(analytics.riskDistribution, route, `${field}.riskDistribution`);
    riskDistribution = Object.fromEntries(Object.entries(source).map(([key, entry]) => [key, number(entry, route, `${field}.riskDistribution.${key}`)]));
  }
  return {
    avgAccuracyPercent: nullableNumber(analytics.avgAccuracyPercent, route, `${field}.avgAccuracyPercent`),
    avgDisciplineIndex: nullableNumber(analytics.avgDisciplineIndex, route, `${field}.avgDisciplineIndex`),
    avgRawScorePercent: nullableNumber(analytics.avgRawScorePercent, route, `${field}.avgRawScorePercent`),
    completionPercent: number(analytics.completionPercent, route, `${field}.completionPercent`),
    controlledCompliancePercent: nullableNumber(analytics.controlledCompliancePercent, route, `${field}.controlledCompliancePercent`),
    executionStability: nullableString(analytics.executionStability, route, `${field}.executionStability`),
    riskDistribution,
  };
}

function adaptDerived(value: unknown, route: string): AdminRunDerivedCreateResult {
  const data = record(value, route);
  return {
    auditId: string(data.auditId, route, "auditId"),
    disposition: enumeration(data.disposition, ["applied", "replayed"] as const, route, "disposition"),
    run: adaptVersionedRun(data.run, route, "run"),
    sourceRunId: string(data.sourceRunId, route, "sourceRunId"),
  };
}

export function fetchAdminLiveRuns(query: AdminRunLiveListQuery = {}): Promise<AdminRunLiveListResult> {
  const route = "GET /admin/live-runs";
  return apiClient.get("/admin/live-runs", {
    query: { cursor: query.cursor, limit: query.limit },
    responseAdapter: (value): AdminRunLiveListResult => {
      const data = record(value, route);
      return {
        nextCursor: cursor(data.nextCursor, route),
        runs: array(data.runs, route, "runs").map((entry, index) => adaptLiveListRecord(entry, route, `runs[${index}]`)),
        serverTime: string(data.serverTime, route, "serverTime"),
      };
    },
  });
}

export function fetchAdminLiveRun(runId: string, query: AdminRunLiveDetailQuery = {}): Promise<AdminRunLiveDetailResult> {
  const route = "GET /admin/live-runs/{runId}";
  return apiClient.get(`/admin/live-runs/${encodeURIComponent(runId)}`, {
    query: { cursor: query.cursor, limit: query.limit },
    responseAdapter: (value): AdminRunLiveDetailResult => {
      const data = record(value, route);
      return {
        nextCursor: cursor(data.nextCursor, route),
        run: adaptLiveRun(data.run, route, "run"),
        serverTime: string(data.serverTime, route, "serverTime"),
        students: array(data.students, route, "students").map((entry, index) => adaptLiveStudent(entry, route, `students[${index}]`)),
        summary: adaptSummary(data.summary, route, "summary"),
      };
    },
  });
}

export function fetchAdminRunHistory(query: AdminRunHistoryQuery = {}): Promise<AdminRunHistoryResult> {
  const route = "GET /admin/run-history";
  return apiClient.get("/admin/run-history", {
    query: {
      academicYear: query.academicYear,
      cursor: query.cursor,
      limit: query.limit,
      mode: query.mode,
      status: query.status,
    },
    responseAdapter: (value): AdminRunHistoryResult => {
      const data = record(value, route);
      return {
        nextCursor: cursor(data.nextCursor, route),
        runs: array(data.runs, route, "runs").map((entry, index) => {
          const row = record(entry, route, `runs[${index}]`);
          const run = adaptVersionedRun(row.run, route, `runs[${index}].run`);
          if (!["completed", "archived", "cancelled", "terminated"].includes(run.status)) {
            return invalid(route, `runs[${index}].run.status`, "a terminal lifecycle status");
          }
          return {
            analytics: adaptHistoryAnalytics(row.analytics, route, `runs[${index}].analytics`),
            run: run as AdminRunHistoryVersionedRecord,
          };
        }),
      };
    },
  });
}

export function duplicateAdminRun(runId: string, body: AdminRunDuplicateRequest): Promise<AdminRunDerivedCreateResult> {
  const route = "POST /admin/runs/{runId}/duplicate";
  return apiClient.post(`/admin/runs/${encodeURIComponent(runId)}/duplicate`, {
    body,
    responseAdapter: (value) => adaptDerived(value, route),
  });
}

export function reassignAdminRun(runId: string, body: AdminRunReassignRequest): Promise<AdminRunDerivedCreateResult> {
  const route = "POST /admin/runs/{runId}/reassign";
  return apiClient.post(`/admin/runs/${encodeURIComponent(runId)}/reassign`, {
    body,
    responseAdapter: (value) => adaptDerived(value, route),
  });
}

export function updateAdminRunLifecycle(runId: string, body: AdminRunLifecycleRequest): Promise<AdminRunLifecycleResult> {
  const route = "POST /admin/runs/{runId}/lifecycle";
  return apiClient.post(`/admin/runs/${encodeURIComponent(runId)}/lifecycle`, {
    body,
    responseAdapter: (value): AdminRunLifecycleResult => {
      const data = record(value, route);
      return {
        auditId: string(data.auditId, route, "auditId"),
        disposition: enumeration(data.disposition, ["applied", "replayed"] as const, route, "disposition"),
        recoveryState: enumeration(data.recoveryState, ["complete", "pending", "failed_recoverable"] as const, route, "recoveryState"),
        run: adaptVersionedRun(data.run, route, "run"),
      };
    },
  });
}

export function resendAdminRunNotifications(runId: string, body: AdminRunNotificationResendRequest): Promise<AdminRunNotificationResendResult> {
  const route = "POST /admin/runs/{runId}/notifications/resend";
  return apiClient.post(`/admin/runs/${encodeURIComponent(runId)}/notifications/resend`, {
    body,
    responseAdapter: (value): AdminRunNotificationResendResult => {
      const data = record(value, route);
      return {
        auditId: string(data.auditId, route, "auditId"),
        disposition: enumeration(data.disposition, ["applied", "replayed"] as const, route, "disposition"),
        queuedNotificationCount: integer(data.queuedNotificationCount, route, "queuedNotificationCount"),
        recipientCount: integer(data.recipientCount, route, "recipientCount", 1),
        recoveryState: enumeration(data.recoveryState, ["complete", "pending", "failed_recoverable"] as const, route, "recoveryState"),
        runId: string(data.runId, route, "runId"),
      };
    },
  });
}

export function applyAdminSessionOverride(
  runId: string,
  sessionId: string,
  body: AdminRunSessionOverrideRequest,
): Promise<AdminRunSessionOverrideResult> {
  const route = "POST /admin/runs/{runId}/sessions/{sessionId}/overrides";
  return apiClient.post(
    `/admin/runs/${encodeURIComponent(runId)}/sessions/${encodeURIComponent(sessionId)}/overrides`,
    {
      body,
      responseAdapter: (value): AdminRunSessionOverrideResult => {
        const data = record(value, route);
        if (data.overrideUsed !== true) return invalid(route, "overrideUsed", "true");
        return {
          auditId: string(data.auditId, route, "auditId"),
          disposition: enumeration(data.disposition, ["applied", "replayed"] as const, route, "disposition"),
          overrideId: string(data.overrideId, route, "overrideId"),
          overrideUsed: true,
          recoveryState: enumeration(data.recoveryState, ["complete", "pending", "failed_recoverable"] as const, route, "recoveryState"),
          runId: string(data.runId, route, "runId"),
          sessionId: string(data.sessionId, route, "sessionId"),
          sessionRevision: integer(data.sessionRevision, route, "sessionRevision", 1),
          sessionStatus: enumeration(data.sessionStatus, ["created", "started", "active", "submitted", "expired", "terminated"] as const, route, "sessionStatus"),
        };
      },
    },
  );
}
