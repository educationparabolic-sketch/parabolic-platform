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
  const lastActive =
    toIsoString(input.metricsData.lastActive) ??
    toIsoString(input.metricsData.lastActiveAt) ??
    toIsoString(input.studentData.lastActive) ??
    toIsoString(input.studentData.lastActiveAt);

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
    disciplineTrend: toStringArray(input.metricsData.disciplineTrend),
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
    guessRateTrend: toStringArray(input.metricsData.guessRateTrend),
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
    overrideRecords: toStringArray(
      input.metricsData.overrideRecords ?? input.metricsData.overrides,
    ),
    phaseAdherencePercent: toNumberOrZero(
      input.metricsData.phaseAdherencePercent ??
        input.metricsData.avgPhaseAdherence ??
        input.metricsData.phaseAdherenceAverage,
    ),
    rankInBatch: input.rankInBatch,
    riskState: toRiskState(
      input.metricsData.riskState ?? input.metricsData.rollingRiskCluster,
      disciplineIndex,
    ),
    riskTimeline: toStringArray(input.metricsData.riskTimeline),
    scorePercentile: toOptionalNumber(
      input.metricsData.scorePercentile ??
        input.metricsData.batchRelativePercentile,
    ),
    status: toStudentStatus(input.studentData.status),
    studentId,
    testHistory: toStringArray(
      input.metricsData.testHistory ??
        input.metricsData.history ??
        input.metricsData.recentTests,
    ),
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
