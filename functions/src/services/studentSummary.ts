/* eslint-disable require-jsdoc */
import {FieldPath, Timestamp} from "firebase-admin/firestore";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  StudentDashboardRecentResult,
  StudentDashboardRequest,
  StudentDashboardResult,
  StudentDashboardTrendPoint,
  StudentDashboardUpcomingTest,
  StudentLicenseLayer,
  StudentRiskState,
  StudentSummaryValidationError,
  StudentTestRecord,
  StudentTestsRequest,
  StudentTestsResult,
  StudentTestStatus,
} from "../types/studentSummary";
import {AdminRunMode} from "../../../shared/contracts/apiDtos";

const INSTITUTES_COLLECTION = "institutes";
const STUDENTS_COLLECTION = "students";
const ACADEMIC_YEARS_COLLECTION = "academicYears";
const STUDENT_YEAR_METRICS_COLLECTION = "studentYearMetrics";
const RUNS_COLLECTION = "runs";
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;
const MAX_PAGE = 100;
const DASHBOARD_UPCOMING_LIMIT = 4;

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
}

export const studentSummaryService = new StudentSummaryService();
