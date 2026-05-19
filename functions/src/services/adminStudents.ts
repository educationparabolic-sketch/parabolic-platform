/* eslint-disable require-jsdoc */
import {Timestamp} from "firebase-admin/firestore";
import {adminSettingsService} from "./adminSettings";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  AdminStudentRecord,
  AdminStudentRiskState,
  AdminStudentStatus,
  AdminStudentsSnapshot,
  AdminStudentsValidatedRequest,
  AdminStudentsValidationError,
} from "../types/adminStudents";

const ACADEMIC_YEARS_COLLECTION = "academicYears";
const INSTITUTES_COLLECTION = "institutes";
const STUDENTS_COLLECTION = "students";
const STUDENT_YEAR_METRICS_COLLECTION = "studentYearMetrics";
const OVERRIDE_LOGS_COLLECTION = "overrideLogs";

function normalizeRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AdminStudentsValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a non-empty string.`,
    );
  }

  return value.trim();
}

function normalizeLimit(value: unknown): number {
  if (typeof value === "undefined") {
    return 500;
  }

  const rawValue = Array.isArray(value) ? value[0] : value;
  const parsed =
    typeof rawValue === "number" ? rawValue : Number(String(rawValue));

  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 1000) {
    throw new AdminStudentsValidationError(
      "VALIDATION_ERROR",
      "Field \"limit\" must be a number between 1 and 1000.",
    );
  }

  return Math.floor(parsed);
}

function toNumberOrZero(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function toOptionalNumber(value: unknown): number | null {
  if (value === null || typeof value === "undefined") {
    return null;
  }

  const parsed = toNumberOrZero(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNonEmptyString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ?
    value.trim() :
    fallback;
}

function toIsoString(value: unknown): string | null {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? value.trim() : new Date(parsed).toISOString();
  }

  return null;
}

function toStringArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toPlainObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ?
    value as Record<string, unknown> :
    null;
}

function toProcessingMarker(
  metricsData: Record<string, unknown>,
): Record<string, unknown> {
  const processingMarkers = toPlainObject(metricsData.processingMarkers);
  const studentMetricsEngine = toPlainObject(
    processingMarkers?.studentMetricsEngine,
  );

  return studentMetricsEngine ?? {};
}

function toPatternMarker(
  metricsData: Record<string, unknown>,
): Record<string, unknown> {
  const processingMarkers = toPlainObject(metricsData.processingMarkers);
  const patternEngine = toPlainObject(processingMarkers?.patternEngine);

  return patternEngine ?? {};
}

function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function deriveRiskStateFromDiscipline(
  disciplineIndex: number,
): AdminStudentRiskState {
  if (disciplineIndex < 45) {
    return "critical";
  }
  if (disciplineIndex < 60) {
    return "high";
  }
  if (disciplineIndex < 75) {
    return "medium";
  }

  return "low";
}

function trendLabel(value: unknown, fallback: string): string {
  const isoValue = toIsoString(value);
  if (isoValue) {
    return isoValue.slice(0, 10);
  }

  return fallback;
}

function normalizeTrendArray(input: {
  currentValue: number;
  fallbackLabel: string;
  source: unknown;
  trendDelta: unknown;
}): unknown[] {
  const explicitSource = toStringArray(input.source);
  if (explicitSource.length > 0) {
    return explicitSource;
  }

  const delta = toNumberOrZero(input.trendDelta);
  if (delta === 0 && input.currentValue === 0) {
    return [];
  }

  const previousValue = Math.max(0, input.currentValue - delta);
  return [
    {
      label: "Previous",
      value: roundToTwo(previousValue),
    },
    {
      label: input.fallbackLabel,
      value: roundToTwo(input.currentValue),
    },
  ];
}

function deriveRiskTimeline(input: {
  currentRiskState: AdminStudentRiskState;
  metricsData: Record<string, unknown>;
  processingMarker: Record<string, unknown>;
}): unknown[] {
  const explicitSource = toStringArray(input.metricsData.riskTimeline);
  if (explicitSource.length > 0) {
    return explicitSource;
  }

  const recentGovernanceMetrics = toStringArray(
    input.processingMarker.recentGovernanceMetrics,
  );
  const timeline = recentGovernanceMetrics
    .map((entry, index) => {
      const record = toPlainObject(entry);
      if (!record) {
        return null;
      }

      const disciplineIndex = toNumberOrZero(record.disciplineIndex);
      return {
        id: toNonEmptyString(
          record.sessionId,
          `risk-point-${index + 1}`,
        ),
        label: trendLabel(record.submittedAt, `Point ${index + 1}`),
        riskState: deriveRiskStateFromDiscipline(disciplineIndex),
      };
    })
    .filter((entry) => entry !== null);

  if (timeline.length > 0) {
    return timeline;
  }

  return [
    {
      id: "current-risk",
      label: "Current",
      riskState: input.currentRiskState,
    },
  ];
}

function deriveMetricTrendFromGovernance(input: {
  currentValue: number;
  fallbackLabel: string;
  metricName: "disciplineIndex" | "guessRate";
  processingMarker: Record<string, unknown>;
}): unknown[] {
  const recentGovernanceMetrics = toStringArray(
    input.processingMarker.recentGovernanceMetrics,
  );
  const trend = recentGovernanceMetrics
    .map((entry, index) => {
      const record = toPlainObject(entry);
      if (!record) {
        return null;
      }

      return {
        label: trendLabel(record.submittedAt, `Point ${index + 1}`),
        value: roundToTwo(toNumberOrZero(record[input.metricName])),
      };
    })
    .filter((entry) => entry !== null);

  return trend.length > 0 ?
    trend :
    [{label: input.fallbackLabel, value: roundToTwo(input.currentValue)}];
}

function deriveTestHistory(input: {
  metricsData: Record<string, unknown>;
  patternMarker: Record<string, unknown>;
  processingMarker: Record<string, unknown>;
}): unknown[] {
  const explicitSource = toStringArray(
    input.metricsData.testHistory ??
      input.metricsData.history ??
      input.metricsData.recentTests,
  );
  if (explicitSource.length > 0) {
    return explicitSource;
  }

  const recentSessionSummaries = toStringArray(
    input.patternMarker.recentSessionSummaries ??
      input.processingMarker.recentSessionSummaries,
  );
  const recentHistory = recentSessionSummaries
    .map((entry, index) => {
      const record = toPlainObject(entry);
      if (!record) {
        return null;
      }

      const id = toNonEmptyString(
        record.sessionId ?? record.runId,
        `session-summary-${index + 1}`,
      );
      return {
        accuracyPercent: toNumberOrZero(record.accuracyPercent),
        completedOn: toIsoString(record.submittedAt),
        id,
        label: toNonEmptyString(
          record.runName ?? record.testName ?? record.runId,
          id,
        ),
        rawScorePercent: toNumberOrZero(record.rawScorePercent),
      };
    })
    .filter((entry) => entry !== null);

  if (recentHistory.length > 0) {
    return recentHistory;
  }

  const latestSessionSummary = toPlainObject(
    input.processingMarker.latestSessionSummary,
  );
  if (!latestSessionSummary) {
    return [];
  }

  const id = toNonEmptyString(
    latestSessionSummary.sessionId,
    "latest-session",
  );
  return [
    {
      accuracyPercent: toNumberOrZero(latestSessionSummary.accuracyPercent),
      completedOn: toIsoString(latestSessionSummary.submittedAt),
      id,
      label: toNonEmptyString(
        latestSessionSummary.runName ?? latestSessionSummary.testName,
        id,
      ),
      rawScorePercent: toNumberOrZero(latestSessionSummary.rawScorePercent),
    },
  ];
}

function normalizeOverrideLabel(type: string): string {
  if (type === "FORCE_SUBMIT") {
    return "Manual submission";
  }
  if (type === "MIN_TIME_BYPASS") {
    return "Early termination";
  }
  if (type === "MODE_CHANGE") {
    return "Phase override";
  }

  return type
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function deriveOverrideRecords(
  metricsData: Record<string, unknown>,
  liveOverrideSummary: Map<string, number> | null,
): unknown[] {
  const explicitSource = toStringArray(
    metricsData.overrideRecords ?? metricsData.overrides,
  );
  if (explicitSource.length > 0) {
    return explicitSource;
  }

  if (liveOverrideSummary && liveOverrideSummary.size > 0) {
    return [...liveOverrideSummary.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([type, count]) => ({
        count,
        id: type.toLowerCase().replace(/_/g, "-"),
        label: normalizeOverrideLabel(type),
      }));
  }

  return [
    {
      count: toNumberOrZero(
        metricsData.earlyTerminationOverrideCount ??
          metricsData.earlyTerminationCount,
      ),
      id: "early-termination",
      label: "Early termination",
    },
    {
      count: toNumberOrZero(
        metricsData.manualSubmissionOverrideCount ??
          metricsData.manualSubmissionCount,
      ),
      id: "manual-submission",
      label: "Manual submission",
    },
    {
      count: toNumberOrZero(
        metricsData.phaseOverrideCount ??
          metricsData.phaseOverrides,
      ),
      id: "phase-override",
      label: "Phase override",
    },
    {
      count: toNumberOrZero(
        metricsData.hardModeExitOverrideCount ??
          metricsData.hardModeExitCount,
      ),
      id: "hard-mode-exit",
      label: "Hard mode exit",
    },
  ];
}

function toStudentStatus(value: unknown): AdminStudentStatus {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (
      normalized === "active" ||
      normalized === "archived" ||
      normalized === "inactive" ||
      normalized === "invited" ||
      normalized === "suspended"
    ) {
      return normalized;
    }
  }

  return "inactive";
}

function toRiskState(
  value: unknown,
  disciplineIndex: number,
): AdminStudentRiskState {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "critical") {
      return "critical";
    }
    if (normalized === "high" || normalized === "volatile") {
      return "high";
    }
    if (
      normalized === "medium" ||
      normalized === "drift-prone" ||
      normalized === "driftprone" ||
      normalized === "impulsive" ||
      normalized === "overextended"
    ) {
      return "medium";
    }
    if (normalized === "low" || normalized === "stable") {
      return "low";
    }
  }

  if (disciplineIndex < 45) {
    return "critical";
  }
  if (disciplineIndex < 60) {
    return "high";
  }
  if (disciplineIndex < 75) {
    return "medium";
  }

  return "low";
}

function toExecutionStability(value: unknown): string {
  const normalized = toNonEmptyString(value, "");
  if (normalized) {
    return normalized;
  }

  return "Pending";
}

function resolveCurrentYearId(
  academicYears: Array<{status: string; yearId: string}>,
): string {
  const active =
    academicYears.find((year) =>
      year.status === "Active" ||
        year.status === "Started" ||
        year.status === "Scheduled",
    ) ?? academicYears[0];

  return active?.yearId ?? "unknown";
}

function normalizeStudentRecord(input: {
  academicYear: string;
  liveOverrideSummary: Map<string, number> | null;
  metricsData: Record<string, unknown>;
  rankInBatch: number | null;
  studentData: Record<string, unknown>;
  studentDocumentId: string;
}): AdminStudentRecord | null {
  if (input.studentData.deleted === true) {
    return null;
  }

  const studentId = toNonEmptyString(
    input.studentData.studentId ?? input.metricsData.studentId,
    input.studentDocumentId,
  );
  const fullName = toNonEmptyString(
    input.studentData.fullName ??
      input.studentData.name ??
      input.metricsData.studentName ??
      input.metricsData.fullName,
    studentId,
  );
  const batchId = toNonEmptyString(
    input.studentData.batchId ??
      input.metricsData.batchId ??
      input.studentData.batch,
    "unassigned",
  );
  const batch = toNonEmptyString(
    input.studentData.batchName ??
      input.studentData.batch ??
      input.metricsData.batchName ??
      input.metricsData.batch,
    batchId,
  );
  const disciplineIndex = toNumberOrZero(input.metricsData.disciplineIndex);
  const processingMarker = toProcessingMarker(input.metricsData);
  const patternMarker = toPatternMarker(input.metricsData);
  const lastActive =
    toIsoString(input.metricsData.lastActive) ??
    toIsoString(input.metricsData.lastActiveAt) ??
    toIsoString(input.metricsData.lastUpdated) ??
    toIsoString(processingMarker.lastProcessedSubmittedAt) ??
    toIsoString(
      toPlainObject(processingMarker.latestSessionSummary)?.submittedAt,
    ) ??
    toIsoString(input.studentData.lastActive) ??
    toIsoString(input.studentData.lastActiveAt);
  const riskState = toRiskState(
    input.metricsData.riskState ?? input.metricsData.rollingRiskCluster,
    disciplineIndex,
  );

  return {
    academicYear: input.academicYear,
    avgAccuracyPercent: toNumberOrZero(input.metricsData.avgAccuracyPercent),
    avgRawScorePercent: toNumberOrZero(input.metricsData.avgRawScorePercent),
    batch,
    batchId,
    behaviorTagSummary: toNonEmptyString(
      input.metricsData.behaviorTagSummary ??
        input.metricsData.behaviourTagSummary ??
        input.metricsData.mostFrequentTag ??
        input.metricsData.behaviorTag,
      "No summary",
    ),
    controlledModeDelta: toNumberOrZero(
      input.metricsData.controlledModeDelta ??
        input.metricsData.controlledDelta ??
        input.metricsData.controlledModeImprovementDelta,
    ),
    controlledModePerformanceDelta: toNumberOrZero(
      input.metricsData.controlledModePerformanceDelta ??
        input.metricsData.controlledModeDelta ??
        input.metricsData.controlledDelta ??
        input.metricsData.controlledModeImprovementDelta,
    ),
    disciplineIndex,
    disciplineTrend: toStringArray(input.metricsData.disciplineTrend).length > 0 ?
      normalizeTrendArray({
        currentValue: disciplineIndex,
        fallbackLabel: lastActive?.slice(0, 10) ?? "Current",
        source: input.metricsData.disciplineTrend,
        trendDelta:
          input.metricsData.disciplineIndexTrend ??
          input.metricsData.disciplineIndexTrendDelta,
      }) :
      deriveMetricTrendFromGovernance({
        currentValue: disciplineIndex,
        fallbackLabel: lastActive?.slice(0, 10) ?? "Current",
        metricName: "disciplineIndex",
        processingMarker,
      }),
    easyNeglectRate: toNumberOrZero(
      input.metricsData.easyNeglectRate ??
        input.metricsData.easyNeglectPercent,
    ),
    email: toNonEmptyString(
      input.studentData.email ?? input.metricsData.email,
      `${studentId.toLowerCase()}@unknown.local`,
    ),
    executionStabilityFlag: toExecutionStability(
      input.metricsData.executionStabilityFlag ??
        input.metricsData.executionStabilityBadge ??
        input.metricsData.stabilityFlag,
    ),
    fullName,
    guessRatePercent: toNumberOrZero(
      input.metricsData.guessRatePercent ??
        input.metricsData.guessRate ??
        input.metricsData.avgGuessRatePercent,
    ),
    guessRateTrend: toStringArray(input.metricsData.guessRateTrend).length > 0 ?
      normalizeTrendArray({
        currentValue: toNumberOrZero(
          input.metricsData.guessRatePercent ??
            input.metricsData.guessRate ??
            input.metricsData.avgGuessRatePercent,
        ),
        fallbackLabel: lastActive?.slice(0, 10) ?? "Current",
        source: input.metricsData.guessRateTrend,
        trendDelta: input.metricsData.guessRateTrend,
      }) :
      deriveMetricTrendFromGovernance({
        currentValue: toNumberOrZero(
          input.metricsData.guessRatePercent ??
            input.metricsData.guessRate ??
            input.metricsData.avgGuessRatePercent,
        ),
        fallbackLabel: lastActive?.slice(0, 10) ?? "Current",
        metricName: "guessRate",
        processingMarker,
      }),
    hardBiasRate: toNumberOrZero(
      input.metricsData.hardBiasRate ??
        input.metricsData.hardBiasPercent,
    ),
    id: input.studentDocumentId,
    lastActive,
    maxTimeViolationPercent: toNumberOrZero(
      input.metricsData.maxTimeViolationPercent ??
        input.metricsData.maxTimeViolationsPercent,
    ),
    minTimeViolationPercent: toNumberOrZero(
      input.metricsData.minTimeViolationPercent ??
        input.metricsData.minTimeViolationsPercent,
    ),
    overrideRecords: deriveOverrideRecords(
      input.metricsData,
      input.liveOverrideSummary,
    ),
    phaseAdherencePercent: toNumberOrZero(
      input.metricsData.phaseAdherencePercent ??
        input.metricsData.avgPhaseAdherence ??
        input.metricsData.phaseAdherenceAverage,
    ),
    rankInBatch: input.rankInBatch,
    riskState,
    riskTimeline: deriveRiskTimeline({
      currentRiskState: riskState,
      metricsData: input.metricsData,
      processingMarker,
    }),
    scorePercentile: toOptionalNumber(
      input.metricsData.scorePercentile ??
        input.metricsData.batchRelativePercentile,
    ),
    status: toStudentStatus(input.studentData.status),
    studentId,
    testHistory: deriveTestHistory({
      metricsData: input.metricsData,
      patternMarker,
      processingMarker,
    }),
    testsAttempted: toNumberOrZero(
      input.metricsData.testsAttempted ?? input.metricsData.totalTests,
    ),
    timeMisallocationPercent: toNumberOrZero(
      input.metricsData.timeMisallocationPercent ??
        input.metricsData.timeMisallocationRate,
    ),
    topicWeaknessSummary: toNonEmptyString(
      input.metricsData.topicWeaknessSummary ??
        input.metricsData.topicWeakness ??
        input.metricsData.weakTopicSummary,
      "No topic weakness summary",
    ),
  };
}

async function loadOverrideSummaries(input: {
  firestore: FirebaseFirestore.Firestore;
  instituteId: string;
  studentIds: string[];
}): Promise<Map<string, Map<string, number>>> {
  const uniqueStudentIds = [...new Set(input.studentIds)]
    .filter((studentId) => studentId.length > 0);
  const summaryByStudentId = new Map<string, Map<string, number>>();

  for (let index = 0; index < uniqueStudentIds.length; index += 30) {
    const chunk = uniqueStudentIds.slice(index, index + 30);
    const snapshot = await input.firestore
      .collection(INSTITUTES_COLLECTION)
      .doc(input.instituteId)
      .collection(OVERRIDE_LOGS_COLLECTION)
      .where("studentId", "in", chunk)
      .get();

    for (const document of snapshot.docs) {
      const data = document.data();
      const studentId = toNonEmptyString(data.studentId, "");
      const overrideType = toNonEmptyString(data.overrideType, "UNKNOWN");
      const current = summaryByStudentId.get(studentId) ?? new Map();
      current.set(overrideType, (current.get(overrideType) ?? 0) + 1);
      summaryByStudentId.set(studentId, current);
    }
  }

  return summaryByStudentId;
}

function deriveBatchRanks(
  metricsByStudentId: Map<string, Record<string, unknown>>,
): Map<string, number> {
  const byBatch = new Map<string, Array<{score: number; studentId: string}>>();

  for (const [studentId, data] of metricsByStudentId.entries()) {
    const batchId = toNonEmptyString(data.batchId ?? data.batch, "unassigned");
    const rows = byBatch.get(batchId) ?? [];
    rows.push({
      score: toNumberOrZero(data.avgRawScorePercent),
      studentId,
    });
    byBatch.set(batchId, rows);
  }

  const ranks = new Map<string, number>();
  for (const rows of byBatch.values()) {
    rows
      .sort((left, right) =>
        right.score - left.score ||
          left.studentId.localeCompare(right.studentId),
      )
      .forEach((row, index) => ranks.set(row.studentId, index + 1));
  }

  return ranks;
}

export class AdminStudentsService {
  constructor(
    private readonly firestore: FirebaseFirestore.Firestore = getFirestore(),
  ) {}

  public normalizeRequest(input: {
    actorId?: unknown;
    actorRole?: unknown;
    instituteId?: unknown;
    limit?: unknown;
  }): AdminStudentsValidatedRequest {
    return {
      actorId: normalizeRequiredString(input.actorId, "actorId"),
      actorRole: normalizeRequiredString(input.actorRole, "actorRole"),
      instituteId: normalizeRequiredString(input.instituteId, "instituteId"),
      limit: normalizeLimit(input.limit),
    };
  }

  public async listStudents(
    request: AdminStudentsValidatedRequest,
  ): Promise<AdminStudentsSnapshot> {
    const settingsSnapshot = await adminSettingsService.loadSettingsSnapshot(
      request.instituteId,
    );
    const currentYearId = resolveCurrentYearId(settingsSnapshot.academicYears);
    const instituteRef = this.firestore
      .collection(INSTITUTES_COLLECTION)
      .doc(request.instituteId);
    const currentYearRef = instituteRef
      .collection(ACADEMIC_YEARS_COLLECTION)
      .doc(currentYearId);

    const [studentsSnapshot, metricsSnapshot] = await Promise.all([
      instituteRef.collection(STUDENTS_COLLECTION).limit(request.limit).get(),
      currentYearRef
        .collection(STUDENT_YEAR_METRICS_COLLECTION)
        .limit(request.limit)
        .get(),
    ]);

    const metricsByStudentId = new Map<string, Record<string, unknown>>();
    for (const metricDoc of metricsSnapshot.docs) {
      metricsByStudentId.set(metricDoc.id, metricDoc.data());
    }

    const rankByStudentId = deriveBatchRanks(metricsByStudentId);
    const studentIds = studentsSnapshot.docs.map((studentDoc) => {
      const studentData = studentDoc.data();
      return toNonEmptyString(studentData.studentId, studentDoc.id);
    });
    const overrideSummariesByStudentId = await loadOverrideSummaries({
      firestore: this.firestore,
      instituteId: request.instituteId,
      studentIds,
    });
    const students = studentsSnapshot.docs
      .map((studentDoc) => {
        const studentData = studentDoc.data();
        const studentId = toNonEmptyString(
          studentData.studentId,
          studentDoc.id,
        );
        const metricsData =
          metricsByStudentId.get(studentId) ??
          metricsByStudentId.get(studentDoc.id) ??
          {};

        return normalizeStudentRecord({
          academicYear: currentYearId,
          liveOverrideSummary:
            overrideSummariesByStudentId.get(studentId) ??
            overrideSummariesByStudentId.get(studentDoc.id) ??
            null,
          metricsData,
          rankInBatch:
            rankByStudentId.get(studentId) ??
            rankByStudentId.get(studentDoc.id) ??
            null,
          studentData,
          studentDocumentId: studentDoc.id,
        });
      })
      .filter((student): student is AdminStudentRecord => student !== null)
      .sort((left, right) =>
        left.studentId.localeCompare(right.studentId),
      );

    return {
      academicYear: currentYearId,
      computedAt: new Date().toISOString(),
      students,
    };
  }
}

export const adminStudentsService = new AdminStudentsService();
