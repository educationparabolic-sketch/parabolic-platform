import {Timestamp} from "firebase-admin/firestore";
import {adminSettingsService} from "./adminSettings";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  AdminAnalyticsRunRecord,
  AdminAnalyticsSnapshot,
  AdminAnalyticsStudentMetricRecord,
  AdminAnalyticsValidatedRequest,
  AdminAnalyticsValidationError,
  AdminAnalyticsYearBehaviorSummary,
} from "../types/adminAnalytics";

const INSTITUTES_COLLECTION = "institutes";
const ACADEMIC_YEARS_COLLECTION = "academicYears";
const GOVERNANCE_SNAPSHOTS_COLLECTION = "governanceSnapshots";
const RUN_ANALYTICS_COLLECTION = "runAnalytics";
const STUDENT_YEAR_METRICS_COLLECTION = "studentYearMetrics";

function normalizeRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AdminAnalyticsValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a non-empty string.`,
    );
  }

  return value.trim();
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

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 100) / 100));
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

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function toTrend(value: unknown): "down" | "stable" | "up" {
  if (value === "down" || value === "stable" || value === "up") {
    return value;
  }

  const numericValue = toNumberOrZero(value);
  if (numericValue >= 2) {
    return "up";
  }
  if (numericValue <= -2) {
    return "down";
  }
  return "stable";
}

function percentileBuckets(values: number[]): number[] {
  const buckets = [0, 0, 0, 0];
  for (const value of values) {
    if (value < 40) {
      buckets[0] += 1;
    } else if (value < 60) {
      buckets[1] += 1;
    } else if (value < 80) {
      buckets[2] += 1;
    } else {
      buckets[3] += 1;
    }
  }

  return buckets;
}

function toRiskCluster(
  value: unknown,
): "critical" | "high" | "low" | "medium" {
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
      normalized === "driftprone" ||
      normalized === "drift-prone" ||
      normalized === "impulsive" ||
      normalized === "overextended"
    ) {
      return "medium";
    }
  }

  return "low";
}

function normalizeRiskDistribution(value: unknown): AdminAnalyticsRunRecord["riskDistribution"] {
  const defaultDistribution = {
    critical: 0,
    high: 0,
    low: 0,
    medium: 0,
  };

  if (!value || typeof value !== "object") {
    return defaultDistribution;
  }

  const source = value as Record<string, unknown>;
  return {
    critical: toNumberOrZero(
      source.critical ?? source.Critical ?? source.volatile,
    ),
    high: toNumberOrZero(source.high ?? source.High),
    low: toNumberOrZero(source.low ?? source.Low ?? source.stable),
    medium: toNumberOrZero(
      source.medium ??
        source.Medium ??
        source["Drift-Prone"] ??
        source.driftProne ??
        source.impulsive ??
        source.overextended,
    ),
  };
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

function normalizeRunRecord(
  document: FirebaseFirestore.QueryDocumentSnapshot,
  academicYear: string,
): AdminAnalyticsRunRecord {
  const data = document.data();
  const rawScoreHistogram = Array.isArray(data.rawScoreHistogram) ?
    data.rawScoreHistogram.map(toNumberOrZero) :
    percentileBuckets([toNumberOrZero(data.avgRawScorePercent)]);
  const accuracyHistogram = Array.isArray(data.accuracyHistogram) ?
    data.accuracyHistogram.map(toNumberOrZero) :
    percentileBuckets([toNumberOrZero(data.avgAccuracyPercent)]);
  const sectionAccuracyPercentages = Array.isArray(data.sectionAccuracyPercentages) ?
    data.sectionAccuracyPercentages.map(toNumberOrZero) :
    [toNumberOrZero(data.avgAccuracyPercent)];
  const topicHeatmap = Array.isArray(data.topicHeatmap) ?
    data.topicHeatmap.map(toNumberOrZero) :
    [
      toNumberOrZero(data.avgAccuracyPercent),
      toNumberOrZero(data.avgRawScorePercent),
      toNumberOrZero(data.avgPhaseAdherencePercent ?? data.avgPhaseAdherence),
    ];
  const disciplineIndexDistribution = Array.isArray(
    data.disciplineIndexDistribution,
  ) ?
    data.disciplineIndexDistribution.map(toNumberOrZero) :
    percentileBuckets([toNumberOrZero(
      data.disciplineIndexAverage ?? data.disciplineAverage,
    )]);

  return {
    academicYear,
    accuracyHistogram,
    avgAccuracyPercent: toNumberOrZero(data.avgAccuracyPercent),
    avgPhaseAdherencePercent: toNumberOrZero(
      data.avgPhaseAdherencePercent ?? data.avgPhaseAdherence,
    ),
    avgRawScorePercent: toNumberOrZero(data.avgRawScorePercent),
    batchId: toNonEmptyString(data.batchId ?? data.batch, "unassigned"),
    batchName: toNonEmptyString(
      data.batchName ?? data.batch ?? data.batchId,
      "Unassigned Batch",
    ),
    behaviorDistribution: {
      driftPronePercent: toNumberOrZero(
        (data.behaviorDistribution as Record<string, unknown> | undefined)
          ?.driftPronePercent,
      ),
      overextendedPercent: toNumberOrZero(
        (data.behaviorDistribution as Record<string, unknown> | undefined)
          ?.overextendedPercent,
      ),
      rushedPercent: toNumberOrZero(
        (data.behaviorDistribution as Record<string, unknown> | undefined)
          ?.rushedPercent,
      ),
    },
    completionRatePercent: toNumberOrZero(
      data.completionRatePercent ?? data.completionRate,
    ),
    controlledCompliancePercent: toNumberOrZero(data.controlledCompliancePercent),
    disciplineIndexAverage: toNumberOrZero(
      data.disciplineIndexAverage ?? data.disciplineAverage,
    ),
    disciplineIndexDistribution,
    easyNeglectPercent: toNumberOrZero(data.easyNeglectPercent),
    followedPhaseSplitPercent: toNumberOrZero(data.followedPhaseSplitPercent),
    guessRatePercent: toNumberOrZero(
      data.guessRatePercent ?? data.guessRateAverage,
    ),
    hardBiasPercent: toNumberOrZero(data.hardBiasPercent),
    maxTimeViolationPercent: toNumberOrZero(data.maxTimeViolationPercent),
    medianRawScorePercent: toNumberOrZero(
      data.medianRawScorePercent ?? data.medianRawPercent,
    ),
    minTimeViolationPercent: toNumberOrZero(data.minTimeViolationPercent),
    mode: toNonEmptyString(data.mode, "Operational"),
    pacingGuardrailViolationPercent: toNumberOrZero(
      data.pacingGuardrailViolationPercent,
    ),
    participants: toNumberOrZero(
      data.totalParticipants ??
        data.participants ??
        data.processingMarkers?.runAnalyticsEngine?.submittedSessionCount,
    ),
    rawScoreHistogram,
    rawScoreStdDeviation: toNumberOrZero(
      data.rawScoreStdDeviation ?? data.stdDeviation,
    ),
    riskDistribution: normalizeRiskDistribution(data.riskDistribution),
    runId: toNonEmptyString(data.runId, document.id),
    runName: toNonEmptyString(
      data.runName ?? data.testName ?? data.name,
      document.id,
    ),
    sectionAccuracyPercentages,
    startedAt:
      toIsoString(data.startedAt) ??
      toIsoString(data.startTime) ??
      toIsoString(data.createdAt) ??
      new Date(0).toISOString(),
    structuralOverridePercent: toNumberOrZero(
      data.structuralOverridePercent ?? data.overrideCount,
    ),
    timeMisallocationPercent: toNumberOrZero(data.timeMisallocationPercent),
    topicHeatmap,
  };
}

function normalizeStudentMetricRecord(
  document: FirebaseFirestore.QueryDocumentSnapshot,
): AdminAnalyticsStudentMetricRecord {
  const data = document.data();

  return {
    avgAccuracyPercent: toNumberOrZero(data.avgAccuracyPercent),
    avgRawScorePercent: toNumberOrZero(data.avgRawScorePercent),
    batchId: toNonEmptyString(data.batchId ?? data.batch, "unassigned"),
    batchName: toNonEmptyString(
      data.batchName ?? data.batch ?? data.batchId,
      "Unassigned Batch",
    ),
    disciplineIndex: toNumberOrZero(data.disciplineIndex),
    disciplineIndexTrend: toTrend(
      data.disciplineIndexTrend ?? data.disciplineIndexTrendDelta,
    ),
    guessRatePercent: toNumberOrZero(
      data.guessRatePercent ?? data.guessRateAverage ?? data.avgGuessRatePercent,
    ),
    rollingRiskCluster: toRiskCluster(
      data.rollingRiskCluster ?? data.riskState,
    ),
    studentId: toNonEmptyString(data.studentId, document.id),
    studentName: toNonEmptyString(
      data.studentName ?? data.fullName ?? data.name,
      document.id,
    ),
    testsAttempted: toNumberOrZero(
      data.testsAttempted ?? data.totalTests,
    ),
  };
}

function deriveYearBehaviorSummary(
  academicYear: string,
  computedAt: string,
  governanceSnapshot: Record<string, unknown> | null,
  runAnalytics: AdminAnalyticsRunRecord[],
  studentYearMetrics: AdminAnalyticsStudentMetricRecord[],
): AdminAnalyticsYearBehaviorSummary {
  const runRiskDistribution = {
    critical: average(runAnalytics.map((run) => run.riskDistribution.critical)),
    high: average(runAnalytics.map((run) => run.riskDistribution.high)),
    low: average(runAnalytics.map((run) => run.riskDistribution.low)),
    medium: average(runAnalytics.map((run) => run.riskDistribution.medium)),
  };
  const riskCounts = {
    critical: 0,
    driftProne: 0,
    high: 0,
    impulsive: 0,
    low: 0,
    medium: 0,
    overextended: 0,
    stable: 0,
    volatile: 0,
  };

  for (const student of studentYearMetrics) {
    if (student.rollingRiskCluster === "critical") {
      riskCounts.critical += 1;
    } else if (student.rollingRiskCluster === "high") {
      riskCounts.high += 1;
      riskCounts.volatile += 1;
    } else if (student.rollingRiskCluster === "medium") {
      riskCounts.medium += 1;
      riskCounts.driftProne += 1;
    } else {
      riskCounts.low += 1;
      riskCounts.stable += 1;
    }
  }

  const studentTotal = Math.max(1, studentYearMetrics.length);
  const batchMap = new Map<string, AdminAnalyticsYearBehaviorSummary["batchDiagnosticHeatmap"][number]>();
  for (const run of runAnalytics) {
    const key = `${run.batchId}:${run.batchName}`;
    const current = batchMap.get(key) ?? {
      batchId: run.batchId,
      batchName: run.batchName,
      percentEasyNeglect: 0,
      percentHardBias: 0,
      percentLatePhaseDrop: 0,
      percentPacingDrift: 0,
      percentRushedPattern: 0,
      percentTopicAvoidance: 0,
    };
    current.percentEasyNeglect += run.easyNeglectPercent;
    current.percentHardBias += run.hardBiasPercent;
    current.percentLatePhaseDrop += Math.max(
      run.pacingGuardrailViolationPercent,
      0,
    );
    current.percentPacingDrift += run.pacingGuardrailViolationPercent;
    current.percentRushedPattern += run.behaviorDistribution.rushedPercent;
    current.percentTopicAvoidance += run.timeMisallocationPercent;
    batchMap.set(key, current);
  }

  const divisor = Math.max(1, runAnalytics.length);
  const batchDiagnosticHeatmap = [...batchMap.values()].map((entry) => ({
    ...entry,
    percentEasyNeglect: clampPercent(entry.percentEasyNeglect / divisor),
    percentHardBias: clampPercent(entry.percentHardBias / divisor),
    percentLatePhaseDrop: clampPercent(entry.percentLatePhaseDrop / divisor),
    percentPacingDrift: clampPercent(entry.percentPacingDrift / divisor),
    percentRushedPattern: clampPercent(entry.percentRushedPattern / divisor),
    percentTopicAvoidance: clampPercent(entry.percentTopicAvoidance / divisor),
  }));

  return {
    academicYear,
    avgDisciplineIndex: clampPercent(average(
      studentYearMetrics.map((entry) => entry.disciplineIndex),
    )),
    batchDiagnosticHeatmap,
    computedAt,
    consecutiveWrongClusterPercent: clampPercent(
      toNumberOrZero(governanceSnapshot?.wrongStreakPercent),
    ),
    controlledModeUsagePercent: clampPercent(
      (runAnalytics.filter((entry) =>
        entry.mode.trim().toLowerCase() === "controlled"
      ).length / Math.max(1, runAnalytics.length)) * 100,
    ),
    executionStabilityIndex: clampPercent(
      toNumberOrZero(governanceSnapshot?.stabilityIndex) ||
        average(runAnalytics.map((entry) =>
          100 - entry.rawScoreStdDeviation
        )),
    ),
    guessProbabilityClusterPercent: clampPercent(average(
      studentYearMetrics.map((entry) => entry.guessRatePercent),
    )),
    riskSignals: {
      percentEasyNeglect: clampPercent(average(
        runAnalytics.map((entry) => entry.easyNeglectPercent),
      )),
      percentHardBias: clampPercent(average(
        runAnalytics.map((entry) => entry.hardBiasPercent),
      )),
      percentLatePhaseDrop: clampPercent(average(
        runAnalytics.map((entry) => entry.pacingGuardrailViolationPercent),
      )),
      percentPacingDrift: clampPercent(average(
        runAnalytics.map((entry) => entry.pacingGuardrailViolationPercent),
      )),
      percentRushedPattern: clampPercent(
        toNumberOrZero(governanceSnapshot?.rushPatternPercent) ||
          average(runAnalytics.map((entry) =>
            entry.behaviorDistribution.rushedPercent
          )),
      ),
      percentTopicAvoidance: clampPercent(average(
        runAnalytics.map((entry) => entry.timeMisallocationPercent),
      )),
    },
    riskStateDistribution: {
      critical: clampPercent((riskCounts.critical / studentTotal) * 100),
      driftProne: clampPercent((riskCounts.driftProne / studentTotal) * 100),
      high: clampPercent(((riskCounts.high || runRiskDistribution.high) / studentTotal) * 100),
      impulsive: clampPercent((riskCounts.impulsive / studentTotal) * 100),
      low: clampPercent(((riskCounts.low || runRiskDistribution.low) / studentTotal) * 100),
      medium: clampPercent(((riskCounts.medium || runRiskDistribution.medium) / studentTotal) * 100),
      overextended: clampPercent((riskCounts.overextended / studentTotal) * 100),
      stable: clampPercent((riskCounts.stable / studentTotal) * 100),
      volatile: clampPercent((riskCounts.volatile / studentTotal) * 100),
    },
  };
}

export class AdminAnalyticsService {
  constructor(
    private readonly firestore: FirebaseFirestore.Firestore = getFirestore(),
  ) {}

  public normalizeRequest(input: {
    actorId?: unknown;
    actorRole?: unknown;
    instituteId?: unknown;
  }): AdminAnalyticsValidatedRequest {
    return {
      actorId: normalizeRequiredString(input.actorId, "actorId"),
      actorRole: normalizeRequiredString(input.actorRole, "actorRole"),
      instituteId: normalizeRequiredString(input.instituteId, "instituteId"),
    };
  }

  public async getAnalyticsSnapshot(
    request: AdminAnalyticsValidatedRequest,
  ): Promise<AdminAnalyticsSnapshot> {
    const settingsSnapshot = await adminSettingsService.loadSettingsSnapshot(
      request.instituteId,
    );
    const currentYearId = resolveCurrentYearId(settingsSnapshot.academicYears);
    const currentYearRef = this.firestore
      .collection(INSTITUTES_COLLECTION)
      .doc(request.instituteId)
      .collection(ACADEMIC_YEARS_COLLECTION)
      .doc(currentYearId);

    const [runAnalyticsSnapshot, studentMetricsSnapshot, governanceSnapshot] =
      await Promise.all([
        currentYearRef.collection(RUN_ANALYTICS_COLLECTION).get(),
        currentYearRef.collection(STUDENT_YEAR_METRICS_COLLECTION).get(),
        currentYearRef
          .collection(GOVERNANCE_SNAPSHOTS_COLLECTION)
          .orderBy("month", "desc")
          .limit(1)
          .get(),
      ]);

    const runAnalytics = runAnalyticsSnapshot.docs
      .map((document) => normalizeRunRecord(document, currentYearId))
      .sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt));
    const studentYearMetrics = studentMetricsSnapshot.docs
      .map((document) => normalizeStudentMetricRecord(document))
      .sort((left, right) => left.studentId.localeCompare(right.studentId));
    const latestGovernance = governanceSnapshot.docs[0]?.data() ?? null;
    const computedAt =
      toIsoString(latestGovernance?.generatedAt) ??
      runAnalytics[0]?.startedAt ??
      new Date().toISOString();

    const yearBehaviorSummary = deriveYearBehaviorSummary(
      currentYearId,
      computedAt,
      latestGovernance,
      runAnalytics,
      studentYearMetrics,
    );

    return {
      runAnalytics,
      studentYearMetrics,
      yearBehaviorSummary,
    };
  }
}

export const adminAnalyticsService = new AdminAnalyticsService();
