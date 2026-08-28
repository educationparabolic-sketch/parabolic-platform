/* eslint-disable require-jsdoc */
import {FieldPath, Timestamp} from "firebase-admin/firestore";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  StudentDashboardRecentResult,
  StudentDashboardRequest,
  StudentDashboardResult,
  StudentDashboardTrendPoint,
  StudentDashboardUpcomingTest,
  StudentControlledModeComparison,
  StudentInsightPattern,
  StudentInsightsRequest,
  StudentInsightsResult,
  StudentInsightSnapshot,
  StudentLicenseLayer,
  StudentPerformancePoint,
  StudentPerformanceRequest,
  StudentPerformanceResult,
  StudentPerformanceRiskState,
  StudentRiskState,
  StudentSolutionItem,
  StudentSolutionsRequest,
  StudentSolutionsResult,
  StudentSummaryValidationError,
  StudentTestRecord,
  StudentTestsRequest,
  StudentTestsResult,
  StudentTestStatus,
  StudentTopicPerformanceEntry,
  StudentTopicWeaknessInsight,
} from "../types/studentSummary";
import {AdminRunMode} from "../../../shared/contracts/apiDtos";

const INSTITUTES_COLLECTION = "institutes";
const STUDENTS_COLLECTION = "students";
const ACADEMIC_YEARS_COLLECTION = "academicYears";
const STUDENT_YEAR_METRICS_COLLECTION = "studentYearMetrics";
const INSIGHT_SNAPSHOTS_COLLECTION = "insightSnapshots";
const RUNS_COLLECTION = "runs";
const SESSIONS_COLLECTION = "sessions";
const QUESTION_BANK_COLLECTION = "questionBank";
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;
const MAX_PAGE = 100;
const DASHBOARD_UPCOMING_LIMIT = 4;
const DEFAULT_SUMMARY_LIMIT = 10;
const MAX_SUMMARY_LIMIT = 20;
const DEFAULT_SOLUTION_PAGE_SIZE = 10;
const MAX_SOLUTION_PAGE_SIZE = 20;

const CURRENT_YEAR_STATUS_PRIORITY = new Map([
  ["active", 0],
  ["started", 1],
  ["scheduled", 2],
]);
const TEST_STATUSES = new Set<StudentTestStatus>([
  "active",
  "archived",
  "completed",
  "scheduled",
]);
const RUN_MODES = new Set<AdminRunMode>([
  "Controlled",
  "Diagnostic",
  "Hard",
  "Operational",
]);
const ALLOWED_MODES_BY_LAYER: Record<StudentLicenseLayer, AdminRunMode[]> = {
  L0: ["Operational"],
  L1: ["Operational", "Diagnostic"],
  L2: ["Operational", "Diagnostic", "Controlled", "Hard"],
  L3: ["Operational", "Diagnostic", "Controlled", "Hard"],
};

interface StudentScope {
  currentYearId: string;
  currentYearReference: FirebaseFirestore.DocumentReference;
  metricsData: FirebaseFirestore.DocumentData;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeRequiredString = (
  value: unknown,
  fieldName: string,
): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new StudentSummaryValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a non-empty string.`,
    );
  }

  return value.trim();
};

const normalizeLicenseLayer = (value: unknown): StudentLicenseLayer => {
  const layer = normalizeRequiredString(value, "licenseLayer");
  if (layer !== "L0" && layer !== "L1" && layer !== "L2" && layer !== "L3") {
    throw new StudentSummaryValidationError(
      "VALIDATION_ERROR",
      "Field \"licenseLayer\" must be one of L0, L1, L2, or L3.",
    );
  }

  return layer;
};

const normalizeInteger = (
  value: unknown,
  fieldName: string,
  fallback: number,
  maximum: number,
): number => {
  if (value === undefined) {
    return fallback;
  }

  const parsed = typeof value === "string" ? Number(value) : value;
  if (
    typeof parsed !== "number" ||
    !Number.isInteger(parsed) ||
    parsed < 1 ||
    parsed > maximum
  ) {
    throw new StudentSummaryValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be an integer between 1 and ${maximum}.`,
    );
  }

  return parsed;
};

const normalizeTestStatus = (value: unknown): StudentTestStatus | "all" => {
  if (value === undefined) {
    return "all";
  }

  const status = normalizeRequiredString(value, "status").toLowerCase();
  if (status === "all" || TEST_STATUSES.has(status as StudentTestStatus)) {
    return status as StudentTestStatus | "all";
  }

  throw new StudentSummaryValidationError(
    "VALIDATION_ERROR",
    "Field \"status\" must be all, scheduled, active, completed, or archived.",
  );
};

const toFiniteNumber = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const toPercent = (value: unknown): number =>
  Math.max(0, Math.min(100, toFiniteNumber(value)));

const toPositiveIntegerOrNull = (value: unknown): number | null => {
  const parsed = toFiniteNumber(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const toNonNegativeInteger = (value: unknown): number => {
  const parsed = toFiniteNumber(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
};

const toOptionalString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const toOptionalNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const toRecordArray = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];

const toIsoString = (value: unknown, fieldName: string): string => {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }

  throw new StudentSummaryValidationError(
    "VALIDATION_ERROR",
    `Persisted summary field "${fieldName}" must be a timestamp.`,
  );
};

const toRunMode = (value: unknown): AdminRunMode => {
  if (typeof value === "string" && RUN_MODES.has(value as AdminRunMode)) {
    return value as AdminRunMode;
  }

  throw new StudentSummaryValidationError(
    "VALIDATION_ERROR",
    "Persisted run field \"mode\" is invalid.",
  );
};

const toStudentStatus = (value: unknown): StudentTestStatus => {
  switch (String(value ?? "").trim().toLowerCase()) {
  case "scheduled":
    return "scheduled";
  case "active":
    return "active";
  case "completed":
    return "completed";
  case "cancelled":
  case "stopped":
    return "archived";
  default:
    throw new StudentSummaryValidationError(
      "VALIDATION_ERROR",
      "Persisted run field \"status\" is invalid.",
    );
  }
};

const toRiskState = (value: unknown): StudentRiskState => {
  switch (String(value ?? "").trim().toLowerCase()) {
  case "medium":
  case "drift-prone":
    return "medium";
  case "high":
  case "impulsive":
  case "volatile":
    return "high";
  case "critical":
  case "overextended":
    return "critical";
  default:
    return "low";
  }
};

const toPerformanceRiskState = (
  value: unknown,
  disciplineIndex: number,
  phaseAdherencePercent: number,
  guessRatePercent: number,
): StudentPerformanceRiskState => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "stable" || normalized === "low") {
    return "Stable";
  }
  if (
    normalized === "improving" ||
    normalized === "medium" ||
    normalized === "drift-prone"
  ) {
    return "Improving";
  }
  if (normalized) {
    return "Building Discipline";
  }
  if (
    disciplineIndex >= 75 &&
    phaseAdherencePercent >= 70 &&
    guessRatePercent <= 20
  ) {
    return "Stable";
  }
  if (disciplineIndex >= 60 || phaseAdherencePercent >= 60) {
    return "Improving";
  }
  return "Building Discipline";
};

const toInsightPattern = (value: unknown): StudentInsightPattern => {
  switch (String(value ?? "").trim().toLowerCase()) {
  case "easy neglect":
  case "easy_neglect":
    return "Easy Neglect";
  case "guess detection":
  case "guess_detection":
    return "Guess Detection";
  case "late-phase drop":
  case "late_phase_drop":
    return "Late-Phase Drop";
  case "rushed pattern":
  case "rushed_pattern":
    return "Rushed Pattern";
  case "skip burst":
  case "skip_burst":
    return "Skip Burst";
  default:
    return "No Pattern Yet";
  }
};

const toStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.flatMap((entry) => {
    const normalized = toOptionalString(entry);
    return normalized ? [normalized] : [];
  }) : [];

const toQuestionIds = (value: unknown): string[] => {
  const ids = toStringArray(value);
  if (ids.length === 0 || new Set(ids).size !== ids.length) {
    throw new StudentSummaryValidationError(
      "CONFLICT",
      "Completed test solution authority has no valid question snapshot.",
    );
  }
  return ids;
};

const compareDocumentsDescending = (
  left: FirebaseFirestore.QueryDocumentSnapshot,
  right: FirebaseFirestore.QueryDocumentSnapshot,
): number => {
  const leftStart = toIsoString(left.data().startWindow, "startWindow");
  const rightStart = toIsoString(right.data().startWindow, "startWindow");
  const timestampOrder = rightStart.localeCompare(leftStart);
  return timestampOrder || right.id.localeCompare(left.id);
};

const resolveCurrentYear = (
  snapshots: FirebaseFirestore.QueryDocumentSnapshot[],
): FirebaseFirestore.QueryDocumentSnapshot => {
  const candidates = snapshots
    .map((snapshot) => ({
      priority: CURRENT_YEAR_STATUS_PRIORITY.get(
        String(snapshot.data().status ?? "").trim().toLowerCase(),
      ),
      snapshot,
    }))
    .filter((entry): entry is {
      priority: number;
      snapshot: FirebaseFirestore.QueryDocumentSnapshot;
    } => entry.priority !== undefined)
    .sort((left, right) =>
      left.priority - right.priority ||
      left.snapshot.id.localeCompare(right.snapshot.id));

  const current = candidates[0]?.snapshot;
  if (!current) {
    throw new StudentSummaryValidationError(
      "CONFLICT",
      "The institute has no current operational academic year.",
    );
  }

  return current;
};

const toStudentTestRecord = (
  document: FirebaseFirestore.QueryDocumentSnapshot,
  academicYear: string,
): StudentTestRecord => {
  const data = document.data();
  const startWindow = toIsoString(data.startWindow, "startWindow");
  const endWindow = toIsoString(data.endWindow, "endWindow");
  const startMillis = Date.parse(startWindow);
  const endMillis = Date.parse(endWindow);
  const testId = normalizeRequiredString(data.testId, "testId");
  const status = toStudentStatus(data.status);

  return {
    academicYear,
    accuracyPercent: null,
    archivedSummary: status === "archived" ?
      "Assignment closed in the current academic year." :
      null,
    attemptedQuestions: null,
    attemptStatusLabel: null,
    completedAt: null,
    currentAcademicYear: true,
    durationMinutes: Math.max(
      0,
      Math.round((endMillis - startMillis) / 60_000),
    ),
    endWindow,
    flaggedQuestions: null,
    mode: toRunMode(data.mode),
    rankInBatch: null,
    rawScorePercent: null,
    runId: document.id,
    sessionId: null,
    sessionLink: null,
    startWindow,
    status,
    summaryPdfUrl: null,
    testId,
    testName:
      toOptionalString(data.testName ?? data.runName) ?? testId,
    timeUsedMinutes: null,
    totalQuestions: null,
  };
};

const toUpcomingTest = (
  document: FirebaseFirestore.QueryDocumentSnapshot,
): StudentDashboardUpcomingTest => {
  const data = document.data();
  const startAt = toIsoString(data.startWindow, "startWindow");
  const endAt = toIsoString(data.endWindow, "endWindow");
  const testId = normalizeRequiredString(data.testId, "testId");

  return {
    durationMinutes: Math.max(
      0,
      Math.round((Date.parse(endAt) - Date.parse(startAt)) / 60_000),
    ),
    endAt,
    mode: toRunMode(data.mode),
    runId: document.id,
    startAt,
    testName: toOptionalString(data.testName ?? data.runName) ?? testId,
  };
};

const toRecentResults = (
  value: unknown,
): StudentDashboardRecentResult[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const runId = toOptionalString(entry.runId);
    const completedAt = entry.completedAt ?? entry.submittedAt;
    if (!runId || !completedAt) {
      return [];
    }

    return [{
      accuracyPercent: toPercent(entry.accuracyPercent),
      completedAt: toIsoString(completedAt, "recentResults.completedAt"),
      rawScorePercent: toPercent(entry.rawScorePercent),
      runId,
      testName:
        toOptionalString(entry.testName ?? entry.runName) ?? runId,
    }];
  }).slice(0, 5);
};

const toTrend = (
  metrics: FirebaseFirestore.DocumentData,
): StudentDashboardTrendPoint[] => {
  const directTrend = metrics.phaseComplianceMiniTrend;
  if (Array.isArray(directTrend)) {
    const normalized = directTrend.flatMap((entry, index) => {
      if (!isRecord(entry)) {
        return [];
      }
      return [{
        label: toOptionalString(entry.label) ?? `P${index + 1}`,
        value: toPercent(entry.value),
      }];
    });
    if (normalized.length > 0) {
      return normalized.slice(-7);
    }
  }

  const processingMarkers = isRecord(metrics.processingMarkers) ?
    metrics.processingMarkers :
    {};
  const engine = isRecord(processingMarkers.studentMetricsEngine) ?
    processingMarkers.studentMetricsEngine :
    {};
  const recent = Array.isArray(engine.recentGovernanceMetrics) ?
    engine.recentGovernanceMetrics :
    [];

  return recent.slice(-7).flatMap((entry, index) => {
    if (!isRecord(entry)) {
      return [];
    }
    return [{
      label: `P${index + 1}`,
      value: toPercent(entry.phaseAdherencePercent),
    }];
  });
};

const toPerformancePoint = (
  entry: Record<string, unknown>,
  index: number,
  l1Allowed: boolean,
  l2Allowed: boolean,
): StudentPerformancePoint | null => {
  const runId = toOptionalString(entry.runId ?? entry.testId);
  const completedAt = entry.completedAt ?? entry.submittedAt;
  if (!runId || !completedAt) {
    return null;
  }

  const phaseAdherencePercent = l1Allowed ? toPercent(
    entry.phaseAdherencePercent ?? entry.phaseCompliancePercent,
  ) : 0;
  const guessRatePercent = l2Allowed ? toPercent(
    entry.guessRatePercent ?? entry.guessRate,
  ) : 0;
  const disciplineIndex = l2Allowed ?
    toPercent(entry.disciplineIndex) :
    0;
  const riskState = l2Allowed ? toPerformanceRiskState(
    entry.riskState ?? entry.riskBadge,
    disciplineIndex,
    phaseAdherencePercent,
    guessRatePercent,
  ) : "Building Discipline";

  return {
    accuracyPercent: toPercent(entry.accuracyPercent),
    completedAt: toIsoString(completedAt, "performance.completedAt"),
    disciplineIndex,
    guessRatePercent,
    maxTimeViolationPercent: l2Allowed ?
      toPercent(entry.maxTimeViolationPercent) :
      0,
    minTimeViolationPercent: l2Allowed ?
      toPercent(entry.minTimeViolationPercent) :
      0,
    overstayFrequencyPercent: l2Allowed ? toPercent(
      entry.overstayFrequencyPercent ?? entry.overstayQuestionsPercent,
    ) : 0,
    phaseAdherencePercent,
    rankInBatch: toOptionalNumber(entry.rankInBatch),
    rawScorePercent: toPercent(entry.rawScorePercent),
    riskState,
    runId,
    runLabel: toOptionalString(
      entry.runLabel ?? entry.testName ?? entry.runName,
    ) ?? `Run ${index + 1}`,
    timeAllocationBalancePercent: l1Allowed ? toPercent(
      entry.timeAllocationBalancePercent ?? entry.timeAllocationPercent,
    ) : 0,
    timeSpentMinutes: Math.max(0, Math.round(toFiniteNumber(
      entry.timeSpentMinutes ?? entry.timeUsedMinutes,
    ))),
  };
};

const toTopicPerformance = (
  value: unknown,
): StudentTopicPerformanceEntry[] => toRecordArray(value).flatMap((entry) => {
  const topic = toOptionalString(entry.topic ?? entry.name);
  if (!topic) {
    return [];
  }
  return [{
    accuracyPercent: toPercent(entry.accuracyPercent),
    rawScorePercent: toPercent(entry.rawScorePercent),
    topic,
  }];
});

const emptyControlledComparison = (): StudentControlledModeComparison => ({
  baselineLabel: "Earlier Runs",
  currentLabel: "Recent Controlled Runs",
  disciplineIndexDeltaPercent: 0,
  guessRateDeltaPercent: 0,
  maxTimeViolationDeltaPercent: 0,
  minTimeViolationDeltaPercent: 0,
  phaseAdherenceDeltaPercent: 0,
});

const toControlledComparison = (
  value: unknown,
  allowed: boolean,
): StudentControlledModeComparison => {
  if (!allowed || !isRecord(value)) {
    return emptyControlledComparison();
  }
  return {
    baselineLabel: toOptionalString(value.baselineLabel) ?? "Earlier Runs",
    currentLabel: toOptionalString(value.currentLabel) ??
      "Recent Controlled Runs",
    disciplineIndexDeltaPercent: toFiniteNumber(
      value.disciplineIndexDeltaPercent,
    ),
    guessRateDeltaPercent: toFiniteNumber(value.guessRateDeltaPercent),
    maxTimeViolationDeltaPercent: toFiniteNumber(
      value.maxTimeViolationDeltaPercent,
    ),
    minTimeViolationDeltaPercent: toFiniteNumber(
      value.minTimeViolationDeltaPercent,
    ),
    phaseAdherenceDeltaPercent: toFiniteNumber(
      value.phaseAdherenceDeltaPercent,
    ),
  };
};

const toInsightSnapshot = (
  document: FirebaseFirestore.QueryDocumentSnapshot,
): StudentInsightSnapshot => {
  const data = document.data();
  const metrics = isRecord(data.metrics) ? data.metrics : {};
  return {
    accuracyPercent: toPercent(
      metrics.sessionAccuracyPercent ?? metrics.accuracyPercent,
    ),
    dominantPattern: toInsightPattern(
      data.dominantPattern ?? metrics.dominantPattern,
    ),
    easyNeglectFrequencyPercent: toPercent(
      metrics.easyNeglectFrequencyPercent ?? metrics.easyNeglectPercent,
    ),
    generatedAt: toIsoString(
      data.generatedAt ?? data.sourceSubmittedAt,
      "insightSnapshots.generatedAt",
    ),
    guessDetectionPercent: toPercent(
      metrics.guessDetectionPercent ?? metrics.guessRatePercent,
    ),
    latePhaseDropPercent: toPercent(metrics.latePhaseDropPercent),
    rawScorePercent: toPercent(
      metrics.sessionRawScorePercent ?? metrics.rawScorePercent,
    ),
    rushedPatternFrequencyPercent: toPercent(
      metrics.rushedPatternFrequencyPercent ?? metrics.rushedPatternPercent,
    ),
    skipBurstFrequencyPercent: toPercent(
      metrics.skipBurstFrequencyPercent ?? metrics.skipBurstPercent,
    ),
    snapshotId: document.id,
  };
};

const toTopicWeaknesses = (
  value: unknown,
): StudentTopicWeaknessInsight[] => toRecordArray(value).flatMap((entry) => {
  const topic = toOptionalString(entry.topic ?? entry.name);
  if (!topic) {
    return [];
  }
  return [{
    feedback: toOptionalString(entry.feedback) ??
      "Use a focused review before the next timed practice.",
    simulationLink: toOptionalString(entry.simulationLink),
    topic,
    tutorialVideoLink: toOptionalString(entry.tutorialVideoLink),
    weaknessPercent: toPercent(entry.weaknessPercent),
  }];
});

const mostFrequentPattern = (
  snapshots: StudentInsightSnapshot[],
): StudentInsightPattern => {
  const counts = new Map<StudentInsightPattern, number>();
  for (const snapshot of snapshots) {
    if (snapshot.dominantPattern !== "No Pattern Yet") {
      counts.set(
        snapshot.dominantPattern,
        (counts.get(snapshot.dominantPattern) ?? 0) + 1,
      );
    }
  }
  return [...counts.entries()].sort((left, right) =>
    right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ??
    "No Pattern Yet";
};

export class StudentSummaryService {
  constructor(
    private readonly firestore: FirebaseFirestore.Firestore = getFirestore(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  public normalizeDashboardRequest(input: {
    instituteId?: unknown;
    licenseLayer?: unknown;
    studentId?: unknown;
  }): StudentDashboardRequest {
    return {
      instituteId: normalizeRequiredString(input.instituteId, "instituteId"),
      licenseLayer: normalizeLicenseLayer(input.licenseLayer),
      studentId: normalizeRequiredString(input.studentId, "studentId"),
    };
  }

  public normalizeTestsRequest(input: {
    instituteId?: unknown;
    licenseLayer?: unknown;
    page?: unknown;
    pageSize?: unknown;
    status?: unknown;
    studentId?: unknown;
  }): StudentTestsRequest {
    return {
      ...this.normalizeDashboardRequest(input),
      page: normalizeInteger(input.page, "page", 1, MAX_PAGE),
      pageSize: normalizeInteger(
        input.pageSize,
        "pageSize",
        DEFAULT_PAGE_SIZE,
        MAX_PAGE_SIZE,
      ),
      status: normalizeTestStatus(input.status),
    };
  }

  public normalizePerformanceRequest(input: {
    instituteId?: unknown;
    lastN?: unknown;
    licenseLayer?: unknown;
    studentId?: unknown;
  }): StudentPerformanceRequest {
    return {
      ...this.normalizeDashboardRequest(input),
      lastN: normalizeInteger(
        input.lastN,
        "lastN",
        DEFAULT_SUMMARY_LIMIT,
        MAX_SUMMARY_LIMIT,
      ),
    };
  }

  public normalizeInsightsRequest(input: {
    instituteId?: unknown;
    licenseLayer?: unknown;
    limit?: unknown;
    studentId?: unknown;
  }): StudentInsightsRequest {
    return {
      ...this.normalizeDashboardRequest(input),
      limit: normalizeInteger(
        input.limit,
        "limit",
        DEFAULT_SUMMARY_LIMIT,
        MAX_SUMMARY_LIMIT,
      ),
    };
  }

  public normalizeSolutionsRequest(input: {
    instituteId?: unknown;
    licenseLayer?: unknown;
    page?: unknown;
    pageSize?: unknown;
    studentId?: unknown;
    testId?: unknown;
  }): StudentSolutionsRequest {
    return {
      ...this.normalizeDashboardRequest(input),
      page: normalizeInteger(input.page, "page", 1, MAX_PAGE),
      pageSize: normalizeInteger(
        input.pageSize,
        "pageSize",
        DEFAULT_SOLUTION_PAGE_SIZE,
        MAX_SOLUTION_PAGE_SIZE,
      ),
      testId: normalizeRequiredString(input.testId, "testId"),
    };
  }

  private async loadStudentScope(
    request: StudentDashboardRequest,
  ): Promise<StudentScope> {
    const instituteReference = this.firestore
      .collection(INSTITUTES_COLLECTION)
      .doc(request.instituteId);
    const [studentSnapshot, yearsSnapshot] = await Promise.all([
      instituteReference
        .collection(STUDENTS_COLLECTION)
        .doc(request.studentId)
        .get(),
      instituteReference.collection(ACADEMIC_YEARS_COLLECTION).get(),
    ]);
    const studentData = studentSnapshot.data();
    const storedStudentId = toOptionalString(studentData?.studentId);
    const studentStatus = String(studentData?.status ?? "")
      .trim()
      .toLowerCase();

    if (
      !studentSnapshot.exists ||
      studentData?.deleted === true ||
      studentStatus !== "active" ||
      (storedStudentId !== null && storedStudentId !== request.studentId)
    ) {
      throw new StudentSummaryValidationError(
        "NOT_FOUND",
        "Active Student summary authority was not found.",
      );
    }

    const currentYearSnapshot = resolveCurrentYear(yearsSnapshot.docs);
    const currentYearReference = currentYearSnapshot.ref;
    const metricsSnapshot = await currentYearReference
      .collection(STUDENT_YEAR_METRICS_COLLECTION)
      .doc(request.studentId)
      .get();

    return {
      currentYearId: currentYearSnapshot.id,
      currentYearReference,
      metricsData: metricsSnapshot.data() ?? {},
    };
  }

  private buildAssignedRunsQuery(
    scope: StudentScope,
    request: StudentDashboardRequest,
  ): FirebaseFirestore.Query {
    return scope.currentYearReference
      .collection(RUNS_COLLECTION)
      .where("recipientStudentIds", "array-contains", request.studentId)
      .where("mode", "in", ALLOWED_MODES_BY_LAYER[request.licenseLayer]);
  }

  public async getDashboard(
    request: StudentDashboardRequest,
  ): Promise<StudentDashboardResult> {
    const scope = await this.loadStudentScope(request);
    const upcomingSnapshot = await this.buildAssignedRunsQuery(scope, request)
      .where("status", "==", "scheduled")
      .where("startWindow", ">=", Timestamp.fromDate(this.now()))
      .orderBy("startWindow", "asc")
      .orderBy(FieldPath.documentId(), "asc")
      .limit(DASHBOARD_UPCOMING_LIMIT)
      .get();
    const metrics = scope.metricsData;
    const l1Allowed = request.licenseLayer !== "L0";
    const l2Allowed = request.licenseLayer === "L2" ||
      request.licenseLayer === "L3";
    const processingMarkers = isRecord(metrics.processingMarkers) ?
      metrics.processingMarkers :
      {};
    const engine = isRecord(processingMarkers.studentMetricsEngine) ?
      processingMarkers.studentMetricsEngine :
      {};
    const latest = isRecord(engine.latestSessionSummary) ?
      engine.latestSessionSummary :
      {};

    return {
      avgAccuracyPercent: toPercent(metrics.avgAccuracyPercent),
      avgRawScorePercent: toPercent(metrics.avgRawScorePercent),
      batchRank: toPositiveIntegerOrNull(
        metrics.rankInBatch ?? metrics.batchRank ?? metrics.currentBatchRank,
      ),
      behaviorSummaryTag: l1Allowed ?
        toOptionalString(
          metrics.behaviorSummaryTag ??
          metrics.behaviourTagSummary ??
          latest.behaviourTagSummary,
        ) ?? "Balanced execution momentum" :
        "Available with L1",
      controlledModeImprovementDeltaPercent: l2Allowed ?
        toFiniteNumber(
          metrics.controlledModeImprovementDeltaPercent ??
          metrics.controlledModePerformanceDelta ??
          metrics.controlledDelta,
        ) :
        0,
      disciplineIndex: l2Allowed ?
        toPercent(metrics.disciplineIndex ?? metrics.avgDisciplineIndex) :
        0,
      easyNeglectPercent: l1Allowed ?
        toPercent(metrics.easyNeglectRatePercent ?? metrics.easyNeglectRate) :
        0,
      executionStabilityFlag: l2Allowed ?
        toOptionalString(
          metrics.executionStabilityFlag ?? metrics.stabilityFlag,
        ) ?? "Stable" :
        "Available with L2",
      guessProbabilityPercent: l2Allowed ?
        toPercent(metrics.guessRatePercent ?? metrics.avgGuessRatePercent) :
        0,
      hardBiasPercent: l1Allowed ?
        toPercent(metrics.hardBiasRatePercent ?? metrics.hardBiasRate) :
        0,
      licenseLayer: request.licenseLayer,
      phaseAdherencePercent: l1Allowed ?
        toPercent(
          metrics.phaseAdherencePercent ?? metrics.avgPhaseAdherencePercent,
        ) :
        0,
      phaseComplianceMiniTrend: l1Allowed ? toTrend(metrics) : [],
      recentResults: toRecentResults(metrics.recentResults),
      riskState: l2Allowed ?
        toRiskState(metrics.riskState ?? metrics.rollingRiskCluster) :
        "low",
      testsAttempted: toNonNegativeInteger(
        metrics.testsAttempted ?? metrics.totalTests,
      ),
      timeMisallocationPercent: l1Allowed ?
        toPercent(
          metrics.timeMisallocationPercent ??
          metrics.avgOverstayQuestionsPercent,
        ) :
        0,
      upcomingTests: upcomingSnapshot.docs.map(toUpcomingTest),
    };
  }

  private async loadTestsForStatus(
    scope: StudentScope,
    request: StudentTestsRequest,
    runStatus?: "active" | "cancelled" | "completed" | "scheduled" | "stopped",
    fetchLimit?: number,
  ): Promise<{
    documents: FirebaseFirestore.QueryDocumentSnapshot[];
    total: number;
  }> {
    let baseQuery = this.buildAssignedRunsQuery(scope, request);
    if (runStatus) {
      baseQuery = baseQuery.where("status", "==", runStatus);
    }

    const orderedQuery = baseQuery
      .orderBy("startWindow", "desc")
      .orderBy(FieldPath.documentId(), "desc");
    const countSnapshot = await baseQuery.count().get();
    const offset = (request.page - 1) * request.pageSize;
    const query = fetchLimit === undefined ?
      orderedQuery.offset(offset).limit(request.pageSize + 1) :
      orderedQuery.limit(fetchLimit);
    const snapshot = await query.get();

    return {
      documents: snapshot.docs,
      total: countSnapshot.data().count,
    };
  }

  public async listTests(
    request: StudentTestsRequest,
  ): Promise<StudentTestsResult> {
    const scope = await this.loadStudentScope(request);
    const offset = (request.page - 1) * request.pageSize;
    let documents: FirebaseFirestore.QueryDocumentSnapshot[];
    let total: number;

    if (request.status === "archived") {
      const fetchLimit = offset + request.pageSize + 1;
      const [cancelled, stopped] = await Promise.all([
        this.loadTestsForStatus(
          scope,
          request,
          "cancelled",
          fetchLimit,
        ),
        this.loadTestsForStatus(scope, request, "stopped", fetchLimit),
      ]);
      documents = [...cancelled.documents, ...stopped.documents]
        .sort(compareDocumentsDescending)
        .slice(offset, offset + request.pageSize + 1);
      total = cancelled.total + stopped.total;
    } else {
      const runStatus = request.status === "all" ?
        undefined :
        request.status;
      const result = await this.loadTestsForStatus(
        scope,
        request,
        runStatus,
      );
      documents = result.documents;
      total = result.total;
    }

    const selected = documents.slice(0, request.pageSize);
    return {
      hasMore: offset + selected.length < total,
      page: request.page,
      pageSize: request.pageSize,
      tests: selected.map((document) =>
        toStudentTestRecord(document, scope.currentYearId)),
      total,
    };
  }

  public async getPerformance(
    request: StudentPerformanceRequest,
  ): Promise<StudentPerformanceResult> {
    const scope = await this.loadStudentScope(request);
    const metrics = scope.metricsData;
    const l1Allowed = request.licenseLayer !== "L0";
    const l2Allowed = request.licenseLayer === "L2" ||
      request.licenseLayer === "L3";
    const timelineSource = metrics.performanceTimeline ??
      metrics.testHistory ??
      metrics.recentResults;
    const timeline = toRecordArray(timelineSource)
      .map((entry, index) => toPerformancePoint(
        entry,
        index,
        l1Allowed,
        l2Allowed,
      ))
      .filter((entry): entry is StudentPerformancePoint => entry !== null)
      .sort((left, right) =>
        left.completedAt.localeCompare(right.completedAt) ||
        left.runId.localeCompare(right.runId))
      .slice(-request.lastN);
    const latest = timeline[timeline.length - 1];
    const guessProbabilityPercent = l2Allowed ? toPercent(
      metrics.guessRatePercent ?? metrics.avgGuessRatePercent,
    ) : 0;

    return {
      controlledModeComparison: toControlledComparison(
        metrics.controlledModeComparison,
        l2Allowed,
      ),
      controlledModeImprovementPercent: l2Allowed ? toFiniteNumber(
        metrics.controlledModeImprovementPercent ??
        metrics.controlledModeImprovementDeltaPercent,
      ) : 0,
      disciplineIndex: l2Allowed ? toPercent(
        metrics.disciplineIndex ?? metrics.avgDisciplineIndex,
      ) : 0,
      easyNeglectFrequencyPercent: l1Allowed ? toPercent(
        metrics.easyNeglectFrequencyPercent ?? metrics.easyNeglectRatePercent,
      ) : 0,
      guessProbabilityCluster: guessProbabilityPercent >= 30 ?
        "High" : guessProbabilityPercent >= 15 ? "Medium" : "Low",
      guessProbabilityPercent,
      hardBiasFrequencyPercent: l1Allowed ? toPercent(
        metrics.hardBiasFrequencyPercent ?? metrics.hardBiasRatePercent,
      ) : 0,
      licenseLayer: request.licenseLayer,
      overstayFrequencyPercent: l2Allowed ? toPercent(
        metrics.overstayFrequencyPercent ??
        metrics.avgOverstayQuestionsPercent,
      ) : 0,
      phaseCompliancePercent: l1Allowed ? toPercent(
        metrics.phaseCompliancePercent ?? metrics.avgPhaseAdherencePercent,
      ) : 0,
      timeAllocationBalancePercent: l1Allowed ? toPercent(
        metrics.timeAllocationBalancePercent ??
        latest?.timeAllocationBalancePercent,
      ) : 0,
      timeline,
      topicPerformanceBreakdown: l1Allowed ? toTopicPerformance(
        metrics.topicPerformanceBreakdown ?? metrics.topicPerformance,
      ) : [],
    };
  }

  public async getInsights(
    request: StudentInsightsRequest,
  ): Promise<StudentInsightsResult> {
    const scope = await this.loadStudentScope(request);
    if (request.licenseLayer === "L0") {
      throw new StudentSummaryValidationError(
        "FORBIDDEN",
        "Student insights require an L1 or higher license.",
      );
    }

    const snapshotQuery = await scope.currentYearReference
      .collection(INSIGHT_SNAPSHOTS_COLLECTION)
      .where("snapshotType", "==", "student")
      .where("studentId", "==", request.studentId)
      .orderBy("sourceSubmittedAt", "desc")
      .orderBy(FieldPath.documentId(), "desc")
      .limit(request.limit)
      .get();
    const snapshots = snapshotQuery.docs.map(toInsightSnapshot).reverse();
    const metrics = scope.metricsData;
    const latest = snapshots[snapshots.length - 1];
    const suggestions = toStringArray(
      metrics.disciplineImprovementSuggestions ?? metrics.suggestions,
    ).slice(0, 5);

    return {
      archivedSummaryOnlyCount: toNonNegativeInteger(
        metrics.archivedSummaryOnlyCount,
      ),
      currentYearSolutionAccessOnly: true,
      disciplineImprovementSuggestions: suggestions,
      guessDetectionAlertPercent: toPercent(
        metrics.guessDetectionAlertPercent ??
        latest?.guessDetectionPercent,
      ),
      latePhaseDropIndicatorPercent: toPercent(
        metrics.latePhaseDropIndicatorPercent ??
        latest?.latePhaseDropPercent,
      ),
      licenseLayer: request.licenseLayer,
      mostFrequentBehaviorPattern: mostFrequentPattern(snapshots),
      phaseAdherenceFeedback: toOptionalString(
        metrics.phaseAdherenceFeedback,
      ) ?? "Complete more tests to build a phase-adherence insight.",
      rushedPatternFrequencyPercent: toPercent(
        metrics.rushedPatternFrequencyPercent ??
        latest?.rushedPatternFrequencyPercent,
      ),
      skipBurstIndicatorPercent: toPercent(
        metrics.skipBurstIndicatorPercent ??
        latest?.skipBurstFrequencyPercent,
      ),
      snapshots,
      topicWeaknessSummary: toTopicWeaknesses(
        metrics.topicWeaknessSummary ?? metrics.topicWeaknesses,
      ),
    };
  }

  public async getSolutions(
    request: StudentSolutionsRequest,
  ): Promise<StudentSolutionsResult> {
    const scope = await this.loadStudentScope(request);
    const runSnapshot = await this.buildAssignedRunsQuery(scope, request)
      .where("status", "==", "completed")
      .where("testId", "==", request.testId)
      .limit(2)
      .get();
    if (runSnapshot.empty) {
      throw new StudentSummaryValidationError(
        "NOT_FOUND",
        "A completed current-year assigned test was not found.",
      );
    }
    if (runSnapshot.size > 1) {
      throw new StudentSummaryValidationError(
        "CONFLICT",
        "Multiple completed assignments match this solution request.",
      );
    }

    const runDocument = runSnapshot.docs[0];
    const runData = runDocument.data();
    const releasedAt = toIsoString(
      runData.solutionReleaseAt ??
      runData.solutionsReleaseAt ??
      runData.resultReleaseAt ??
      runData.endWindow,
      "solutionReleaseAt",
    );
    if (
      runData.solutionsReleased === false ||
      Date.parse(releasedAt) > this.now().getTime()
    ) {
      throw new StudentSummaryValidationError(
        "FORBIDDEN",
        "Solutions have not been released for this completed test.",
      );
    }

    const sessionSnapshot = await runDocument.ref
      .collection(SESSIONS_COLLECTION)
      .where("studentId", "==", request.studentId)
      .where("status", "==", "submitted")
      .limit(2)
      .get();
    if (sessionSnapshot.empty) {
      throw new StudentSummaryValidationError(
        "NOT_FOUND",
        "A submitted Student attempt was not found for this test.",
      );
    }
    if (sessionSnapshot.size > 1) {
      throw new StudentSummaryValidationError(
        "CONFLICT",
        "Multiple submitted attempts match this solution request.",
      );
    }

    const sessionData = sessionSnapshot.docs[0].data();
    const templateSnapshot = isRecord(sessionData.templateSnapshot) ?
      sessionData.templateSnapshot :
      {};
    const questionIds = toQuestionIds(
      runData.questionIds ?? templateSnapshot.questionIds,
    );
    const offset = (request.page - 1) * request.pageSize;
    const selectedQuestionIds = questionIds.slice(
      offset,
      offset + request.pageSize,
    );
    const questionReferences = selectedQuestionIds.map((questionId) =>
      this.firestore.collection(INSTITUTES_COLLECTION)
        .doc(request.instituteId)
        .collection(QUESTION_BANK_COLLECTION)
        .doc(questionId));
    const questionSnapshots = questionReferences.length > 0 ?
      await this.firestore.getAll(...questionReferences) :
      [];
    const answerMap = isRecord(sessionData.answerMap) ?
      sessionData.answerMap :
      {};
    const items: StudentSolutionItem[] = questionSnapshots.map(
      (questionSnapshot, index) => {
        if (!questionSnapshot.exists) {
          throw new StudentSummaryValidationError(
            "CONFLICT",
            "A released solution question snapshot is unavailable.",
          );
        }
        const data = questionSnapshot.data() ?? {};
        const storedAnswer = answerMap[selectedQuestionIds[index]];
        const answer = isRecord(storedAnswer) ? storedAnswer : {};
        return {
          correctAnswer: toOptionalString(data.correctAnswer) ??
            "Not available",
          questionId: selectedQuestionIds[index],
          questionImageUrl: toOptionalString(data.questionImageUrl) ?? "",
          simulationLink: toOptionalString(data.simulationLink),
          solutionImageUrl: toOptionalString(data.solutionImageUrl) ?? "",
          studentAnswer: toOptionalString(answer.selectedOption) ??
            "Not answered",
          tutorialVideoLink: toOptionalString(data.tutorialVideoLink),
        };
      },
    );

    return {
      hasMore: offset + items.length < questionIds.length,
      items,
      page: request.page,
      pageSize: request.pageSize,
      releasedAt,
      runId: runDocument.id,
      testId: request.testId,
      total: questionIds.length,
    };
  }
}

export const studentSummaryService = new StudentSummaryService();
