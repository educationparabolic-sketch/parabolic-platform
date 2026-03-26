import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {getFirestore} from "../utils/firebaseAdmin";
import {createLogger} from "./logging";
import {
  InsightEngineContext,
  InsightEngineResult,
  InsightSnapshotType,
} from "../types/insightEngine";
import {SubmissionRiskState} from "../types/submission";

const INSTITUTES_COLLECTION = "institutes";
const ACADEMIC_YEARS_COLLECTION = "academicYears";
const RUN_ANALYTICS_COLLECTION = "runAnalytics";
const STUDENT_YEAR_METRICS_COLLECTION = "studentYearMetrics";
const INSIGHT_SNAPSHOTS_COLLECTION = "insightSnapshots";
const ALLOWED_RISK_STATES = new Set<SubmissionRiskState>([
  "Stable",
  "Drift-Prone",
  "Impulsive",
  "Overextended",
  "Volatile",
]);

interface SubmittedSessionSnapshot {
  accuracyPercent?: unknown;
  disciplineIndex?: unknown;
  rawScorePercent?: unknown;
  riskState?: unknown;
  status?: unknown;
  studentId?: unknown;
  submittedAt?: unknown;
}

interface InsightSnapshotDocument {
  entityId: string;
  highlights: string[];
  instituteId: string;
  metrics: Record<string, number | string | null>;
  recommendations: string[];
  runId: string;
  sessionId: string;
  snapshotType: InsightSnapshotType;
  sourceSubmittedAt: FirebaseFirestore.Timestamp;
  studentId: string | null;
  summary: string;
  title: string;
  yearId: string;
}

/**
 * Raised when insight-engine inputs are structurally invalid.
 */
class InsightEngineValidationError extends Error {
  /**
   * @param {string} message Validation failure detail.
   */
  constructor(message: string) {
    super(message);
    this.name = "InsightEngineValidationError";
  }
}

const isPlainObject = (
  value: unknown,
): value is Record<string, unknown> => typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof Timestamp);

const toNonEmptyString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalizedValue = value.trim();
  return normalizedValue || undefined;
};

const toRequiredString = (value: unknown, fieldName: string): string => {
  const normalizedValue = toNonEmptyString(value);

  if (!normalizedValue) {
    throw new InsightEngineValidationError(
      `Insight engine field "${fieldName}" must be a non-empty string.`,
    );
  }

  return normalizedValue;
};

const toStatus = (value: unknown): string | undefined =>
  toNonEmptyString(value)?.toLowerCase();

const toTimestampOrUndefined = (
  value: unknown,
): FirebaseFirestore.Timestamp | undefined => {
  if (value instanceof Timestamp) {
    return value;
  }

  return undefined;
};

const toPercent = (
  value: unknown,
  fieldName: string,
  fallback?: number,
): number => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100
  ) {
    if (typeof fallback === "number") {
      return fallback;
    }

    throw new InsightEngineValidationError(
      `Insight engine field "${fieldName}" must be a number between 0 and 100.`,
    );
  }

  return Math.round(value * 100) / 100;
};

const toNonNegativeInteger = (value: unknown, fallback = 0): number => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    return fallback;
  }

  return value;
};

const toRiskState = (
  value: unknown,
  fieldName: string,
): SubmissionRiskState => {
  const normalizedValue = toRequiredString(value, fieldName);

  if (!ALLOWED_RISK_STATES.has(normalizedValue as SubmissionRiskState)) {
    throw new InsightEngineValidationError(
      `Insight engine field "${fieldName}" must be a supported risk state.`,
    );
  }

  return normalizedValue as SubmissionRiskState;
};

const toRiskStateOrUndefined = (
  value: unknown,
): SubmissionRiskState | undefined => {
  const normalizedValue = toNonEmptyString(value);

  if (!normalizedValue) {
    return undefined;
  }

  if (!ALLOWED_RISK_STATES.has(normalizedValue as SubmissionRiskState)) {
    return undefined;
  }

  return normalizedValue as SubmissionRiskState;
};

const toDistributionCount = (value: unknown): number =>
  toNonNegativeInteger(value, 0);

const summarizePerformance = (rawScorePercent: number): string => {
  if (rawScorePercent >= 85) {
    return "strong";
  }

  if (rawScorePercent >= 70) {
    return "steady";
  }

  if (rawScorePercent >= 50) {
    return "developing";
  }

  return "at-risk";
};

const summarizeDiscipline = (disciplineIndex: number): string => {
  if (disciplineIndex >= 80) {
    return "Disciplined execution is a current strength.";
  }

  if (disciplineIndex >= 60) {
    return "Execution discipline is acceptable but inconsistent.";
  }

  return "Execution discipline needs immediate stabilization.";
};

const summarizeRiskAlert = (
  riskState: SubmissionRiskState,
  riskScore: number,
): string => {
  if (riskState === "Stable") {
    return `Risk remains controlled (${riskScore}).`;
  }

  return `${riskState} risk detected (${riskScore}).`;
};

const summarizeRunPerformance = (
  avgRawScorePercent: number,
  completionRate: number,
): string => {
  const performanceBand = summarizePerformance(avgRawScorePercent);

  if (completionRate >= 85) {
    return `Run completion is healthy with ${performanceBand} cohort output.`;
  }

  if (completionRate >= 60) {
    return `Run completion is moderate with ${performanceBand} cohort output.`;
  }

  return `Run completion is weak and cohort output is ${performanceBand}.`;
};

const summarizeBatchRisk = (
  stableCount: number,
  volatileCount: number,
  impulsiveCount: number,
): string => {
  if (volatileCount > 0) {
    return "Batch contains volatile students that require immediate follow-up.";
  }

  if (impulsiveCount > stableCount) {
    return "Batch behavior is trending impulsive and should be monitored.";
  }

  return "Batch risk distribution remains mostly controlled.";
};

const toSnapshotId = (
  snapshotType: InsightSnapshotType,
  runId: string,
  sessionId: string,
  studentId?: string,
): string => {
  if (snapshotType === "student") {
    return `${snapshotType}_${studentId ?? "unknown"}_${sessionId}`;
  }

  return `${snapshotType}_${runId}_${sessionId}`;
};

const buildInsightSnapshots = (input: {
  instituteId: string;
  runAnalyticsData: Record<string, unknown>;
  runId: string;
  sessionData: SubmittedSessionSnapshot;
  sessionId: string;
  studentId: string;
  studentMetricsData: Record<string, unknown>;
  submittedAt: FirebaseFirestore.Timestamp;
  yearId: string;
}): InsightSnapshotDocument[] => {
  const sessionRawScorePercent = toPercent(
    input.sessionData.rawScorePercent,
    "session.rawScorePercent",
  );
  const sessionAccuracyPercent = toPercent(
    input.sessionData.accuracyPercent,
    "session.accuracyPercent",
  );
  const sessionDisciplineIndex = toPercent(
    input.sessionData.disciplineIndex,
    "session.disciplineIndex",
  );
  const sessionRiskState = toRiskState(
    input.sessionData.riskState,
    "session.riskState",
  );
  const avgRawScorePercent = toPercent(
    input.runAnalyticsData.avgRawScorePercent,
    "runAnalytics.avgRawScorePercent",
  );
  const avgAccuracyPercent = toPercent(
    input.runAnalyticsData.avgAccuracyPercent,
    "runAnalytics.avgAccuracyPercent",
  );
  const completionRate = toPercent(
    input.runAnalyticsData.completionRate,
    "runAnalytics.completionRate",
  );
  const disciplineAverage = toPercent(
    input.runAnalyticsData.disciplineAverage,
    "runAnalytics.disciplineAverage",
    sessionDisciplineIndex,
  );
  const guessRateAverage = toPercent(
    input.runAnalyticsData.guessRateAverage,
    "runAnalytics.guessRateAverage",
    0,
  );
  const phaseAdherenceAverage = toPercent(
    input.runAnalyticsData.phaseAdherenceAverage,
    "runAnalytics.phaseAdherenceAverage",
    100,
  );
  const studentAvgRawScorePercent = toPercent(
    input.studentMetricsData.avgRawScorePercent,
    "studentMetrics.avgRawScorePercent",
  );
  const studentAvgAccuracyPercent = toPercent(
    input.studentMetricsData.avgAccuracyPercent,
    "studentMetrics.avgAccuracyPercent",
  );
  const studentDisciplineIndex = toPercent(
    input.studentMetricsData.disciplineIndex,
    "studentMetrics.disciplineIndex",
    sessionDisciplineIndex,
  );
  const studentRiskScore = toPercent(
    input.studentMetricsData.riskScore,
    "studentMetrics.riskScore",
    sessionRiskState === "Stable" ? 20 : 60,
  );
  const studentRiskState = toRiskStateOrUndefined(
    input.studentMetricsData.riskState,
  ) ?? sessionRiskState;
  const totalTests = toNonNegativeInteger(
    input.studentMetricsData.totalTests,
    0,
  );
  const interventionSuggestion = toNonEmptyString(
    input.studentMetricsData.interventionSuggestion,
  );
  const escalationLevel = toNonEmptyString(
    input.studentMetricsData.escalationLevel,
  );
  const patterns = isPlainObject(input.studentMetricsData.patterns) ?
    input.studentMetricsData.patterns :
    undefined;
  const rushActive = Boolean(
    isPlainObject(patterns?.rush) ? patterns?.rush.active : false,
  );
  const easyNeglectActive = Boolean(
    isPlainObject(patterns?.easyNeglect) ?
      patterns?.easyNeglect.active :
      false,
  );
  const hardBiasActive = Boolean(
    isPlainObject(patterns?.hardBias) ?
      patterns?.hardBias.active :
      false,
  );
  const wrongStreakActive = Boolean(
    isPlainObject(patterns?.wrongStreak) ?
      patterns?.wrongStreak.active :
      false,
  );
  const riskDistribution = isPlainObject(
    input.runAnalyticsData.riskDistribution,
  ) ?
    input.runAnalyticsData.riskDistribution :
    {};
  const stableCount = toDistributionCount(riskDistribution["Stable"]);
  const driftProneCount = toDistributionCount(
    riskDistribution["Drift-Prone"],
  );
  const impulsiveCount = toDistributionCount(riskDistribution.Impulsive);
  const overextendedCount = toDistributionCount(
    riskDistribution.Overextended,
  );
  const volatileCount = toDistributionCount(riskDistribution.Volatile);

  const studentRecommendations = interventionSuggestion ?
    [interventionSuggestion] :
    studentRiskState === "Stable" ?
      ["Maintain the current practice cadence and pacing discipline."] :
      ["Review pacing and discipline signals before the next run."];

  if (rushActive) {
    studentRecommendations.push(
      "Reduce rushed answering in early question flow.",
    );
  }
  if (easyNeglectActive) {
    studentRecommendations.push("Rebalance time spent on easier questions.");
  }
  if (hardBiasActive) {
    studentRecommendations.push(
      "Delay difficult-question escalation until a stable base is built.",
    );
  }

  const studentHighlights = [
    "Session performance is " +
      `${summarizePerformance(sessionRawScorePercent)} at ` +
      `${sessionRawScorePercent}% raw and ` +
      `${sessionAccuracyPercent}% accuracy.`,
    summarizeDiscipline(studentDisciplineIndex),
    summarizeRiskAlert(studentRiskState, studentRiskScore),
  ];

  if (wrongStreakActive) {
    studentHighlights.push(
      "Repeated wrong-answer streaks were detected in the recent " +
      "rolling window.",
    );
  }
  if (escalationLevel) {
    studentHighlights.push(`Escalation level is ${escalationLevel}.`);
  }

  const studentSnapshot: InsightSnapshotDocument = {
    entityId: input.studentId,
    highlights: studentHighlights,
    instituteId: input.instituteId,
    metrics: {
      avgAccuracyPercent: studentAvgAccuracyPercent,
      avgRawScorePercent: studentAvgRawScorePercent,
      disciplineIndex: studentDisciplineIndex,
      riskScore: studentRiskScore,
      riskState: studentRiskState,
      sessionAccuracyPercent,
      sessionRawScorePercent,
      totalTests,
    },
    recommendations: Array.from(new Set(studentRecommendations)),
    runId: input.runId,
    sessionId: input.sessionId,
    snapshotType: "student",
    sourceSubmittedAt: input.submittedAt,
    studentId: input.studentId,
    summary:
      `Student insight snapshot after ${totalTests} submitted test(s); ` +
      `current risk is ${studentRiskState}.`,
    title: "Student insight snapshot",
    yearId: input.yearId,
  };

  const runRecommendations = [];
  if (completionRate < 80) {
    runRecommendations.push(
      "Review attendance and submission completion blockers.",
    );
  }
  if (guessRateAverage > 30) {
    runRecommendations.push(
      "Introduce pacing controls to reduce guessing pressure.",
    );
  }
  if (phaseAdherenceAverage < 70) {
    runRecommendations.push(
      "Reinforce template phase adherence during run execution.",
    );
  }
  if (runRecommendations.length === 0) {
    runRecommendations.push("Maintain the current run execution controls.");
  }

  const runSnapshot: InsightSnapshotDocument = {
    entityId: input.runId,
    highlights: [
      summarizeRunPerformance(avgRawScorePercent, completionRate),
      "Average accuracy is " +
        `${avgAccuracyPercent}% with discipline averaging ` +
        `${disciplineAverage}%.`,
      `${volatileCount + overextendedCount} higher-risk submission(s) ` +
        "are currently in the run.",
    ],
    instituteId: input.instituteId,
    metrics: {
      avgAccuracyPercent,
      avgRawScorePercent,
      completionRate,
      disciplineAverage,
      driftProneCount,
      guessRateAverage,
      impulsiveCount,
      overextendedCount,
      phaseAdherenceAverage,
      stableCount,
      volatileCount,
    },
    recommendations: runRecommendations,
    runId: input.runId,
    sessionId: input.sessionId,
    snapshotType: "run",
    sourceSubmittedAt: input.submittedAt,
    studentId: null,
    summary:
      `Run insight snapshot generated after session ${input.sessionId} ` +
      `with completion at ${completionRate}%.`,
    title: "Run insight snapshot",
    yearId: input.yearId,
  };

  const batchRecommendations = [];
  if (volatileCount > 0) {
    batchRecommendations.push(
      "Escalate volatile students for immediate teacher review.",
    );
  }
  if (impulsiveCount + driftProneCount >= Math.max(2, stableCount)) {
    batchRecommendations.push(
      "Schedule a controlled practice batch before the next assessment.",
    );
  }
  if (batchRecommendations.length === 0) {
    batchRecommendations.push(
      "Continue monitoring the cohort with the current intervention cadence.",
    );
  }

  const batchSnapshot: InsightSnapshotDocument = {
    entityId: input.runId,
    highlights: [
      summarizeBatchRisk(stableCount, volatileCount, impulsiveCount),
      `${stableCount} stable, ${driftProneCount} drift-prone, ` +
        `${impulsiveCount} impulsive, ${overextendedCount} overextended, ` +
        `${volatileCount} volatile.`,
      `Current cohort average is ${avgRawScorePercent}% raw and ` +
        `${avgAccuracyPercent}% accuracy.`,
    ],
    instituteId: input.instituteId,
    metrics: {
      avgAccuracyPercent,
      avgRawScorePercent,
      driftProneCount,
      impulsiveCount,
      stableCount,
      volatileCount,
    },
    recommendations: batchRecommendations,
    runId: input.runId,
    sessionId: input.sessionId,
    snapshotType: "batch",
    sourceSubmittedAt: input.submittedAt,
    studentId: null,
    summary:
      "Batch insight snapshot captures current cohort performance and risk " +
      "distribution.",
    title: "Batch insight snapshot",
    yearId: input.yearId,
  };

  return [studentSnapshot, runSnapshot, batchSnapshot];
};

/**
 * Implements Build 46 insight snapshot generation from analytics outputs.
 */
export class InsightEngineService {
  private readonly firestore = getFirestore();
  private readonly logger = createLogger("InsightEngineService");

  /**
   * Generates insight snapshots after a session becomes submitted.
   * @param {InsightEngineContext} context Trigger path context.
   * @param {SubmittedSessionSnapshot | undefined} beforeData Previous session.
   * @param {SubmittedSessionSnapshot | undefined} afterData Submitted session.
   * @return {Promise<InsightEngineResult>} Snapshot generation outcome.
   */
  public async processSubmittedSession(
    context: InsightEngineContext,
    beforeData: SubmittedSessionSnapshot | undefined,
    afterData: SubmittedSessionSnapshot | undefined,
  ): Promise<InsightEngineResult> {
    const instituteId = toRequiredString(context.instituteId, "instituteId");
    const yearId = toRequiredString(context.yearId, "yearId");
    const runId = toRequiredString(context.runId, "runId");
    const sessionId = toRequiredString(context.sessionId, "sessionId");
    const studentId = toRequiredString(afterData?.studentId, "studentId");
    const previousStatus = toStatus(beforeData?.status);
    const nextStatus = toStatus(afterData?.status);
    const insightsCollectionPath =
      `${INSTITUTES_COLLECTION}/${instituteId}/` +
      `${ACADEMIC_YEARS_COLLECTION}/${yearId}/` +
      `${INSIGHT_SNAPSHOTS_COLLECTION}`;
    const snapshotPaths = [
      this.firestore.doc(
        `${insightsCollectionPath}/${toSnapshotId(
          "student",
          runId,
          sessionId,
          studentId,
        )}`,
      ).path,
      this.firestore.doc(
        `${insightsCollectionPath}/${toSnapshotId("run", runId, sessionId)}`,
      ).path,
      this.firestore.doc(
        `${insightsCollectionPath}/${toSnapshotId("batch", runId, sessionId)}`,
      ).path,
    ];

    if (nextStatus !== "submitted" || previousStatus === "submitted") {
      return {
        idempotent: false,
        reason: "status_not_transitioned",
        snapshotPaths,
        triggered: false,
      };
    }

    if (!afterData) {
      throw new InsightEngineValidationError(
        "Submitted session payload is required for insight generation.",
      );
    }

    const submittedAt = toTimestampOrUndefined(afterData?.submittedAt);

    if (!submittedAt) {
      throw new InsightEngineValidationError(
        "Submitted session must include submittedAt timestamp.",
      );
    }

    const submittedSessionData = afterData;

    const runAnalyticsPath =
      `${INSTITUTES_COLLECTION}/${instituteId}/` +
      `${ACADEMIC_YEARS_COLLECTION}/${yearId}/` +
      `${RUN_ANALYTICS_COLLECTION}/${runId}`;
    const studentYearMetricsPath =
      `${INSTITUTES_COLLECTION}/${instituteId}/` +
      `${ACADEMIC_YEARS_COLLECTION}/${yearId}/` +
      `${STUDENT_YEAR_METRICS_COLLECTION}/${studentId}`;

    const [
      runAnalyticsSnapshot,
      studentMetricsSnapshot,
      ...existingSnapshotStates
    ] = await Promise.all([
      this.firestore.doc(runAnalyticsPath).get(),
      this.firestore.doc(studentYearMetricsPath).get(),
      ...snapshotPaths.map((path) => this.firestore.doc(path).get()),
    ]);

    if (
      !runAnalyticsSnapshot.exists ||
      !isPlainObject(runAnalyticsSnapshot.data())
    ) {
      return {
        idempotent: false,
        reason: "missing_run_analytics",
        snapshotPaths,
        triggered: false,
      };
    }

    if (
      !studentMetricsSnapshot.exists ||
      !isPlainObject(studentMetricsSnapshot.data())
    ) {
      return {
        idempotent: false,
        reason: "missing_student_metrics",
        snapshotPaths,
        triggered: false,
      };
    }

    if (existingSnapshotStates.every((snapshot) => snapshot.exists)) {
      return {
        idempotent: true,
        reason: "already_processed",
        snapshotPaths,
        triggered: false,
      };
    }

    const insightSnapshots = buildInsightSnapshots({
      instituteId,
      runAnalyticsData:
        runAnalyticsSnapshot.data() as Record<string, unknown>,
      runId,
      sessionData: submittedSessionData,
      sessionId,
      studentId,
      studentMetricsData:
        studentMetricsSnapshot.data() as Record<string, unknown>,
      submittedAt,
      yearId,
    });

    const snapshotReferences = insightSnapshots.map((snapshot) =>
      this.firestore.doc(
        `${insightsCollectionPath}/${toSnapshotId(
          snapshot.snapshotType,
          runId,
          sessionId,
          snapshot.studentId ?? undefined,
        )}`,
      ),
    );

    await this.firestore.runTransaction(async (transaction) => {
      const currentSnapshots = await transaction.getAll(...snapshotReferences);
      const allExist = currentSnapshots.every((snapshot) => snapshot.exists);

      if (allExist) {
        return;
      }

      insightSnapshots.forEach((snapshot, index) => {
        transaction.set(snapshotReferences[index], {
          ...snapshot,
          generatedAt: FieldValue.serverTimestamp(),
        });
      });
    });

    this.logger.info("Generated insight snapshots from submitted session.", {
      eventId: context.eventId,
      instituteId,
      runAnalyticsPath,
      runId,
      sessionId,
      snapshotPaths,
      studentId,
      studentYearMetricsPath,
      yearId,
    });

    return {
      idempotent: false,
      snapshotPaths,
      triggered: true,
    };
  }
}

export const insightEngineService = new InsightEngineService();
