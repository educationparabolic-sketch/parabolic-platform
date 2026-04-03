import {Timestamp} from "firebase-admin/firestore";
import {createLogger} from "./logging";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  GovernanceRiskCluster,
  GovernanceRiskDistribution,
  GovernanceSnapshotAggregationInput,
  GovernanceSnapshotAggregationResult,
  GovernanceSnapshotDocument,
  GovernanceSnapshotRunResult,
} from "../types/governanceSnapshot";

const INSTITUTES_COLLECTION = "institutes";
const ACADEMIC_YEARS_COLLECTION = "academicYears";
const GOVERNANCE_SNAPSHOTS_COLLECTION = "governanceSnapshots";
const RUN_ANALYTICS_COLLECTION = "runAnalytics";
const STUDENT_YEAR_METRICS_COLLECTION = "studentYearMetrics";

interface AggregatedRunAnalytics {
  avgAccuracyPercent: number;
  avgRawScorePercent: number;
  overrideFrequency: number;
  templateVarianceMean: number;
}

interface AggregatedStudentMetrics {
  avgPhaseAdherence: number;
  disciplineMean: number;
  disciplineVariance: number;
  easyNeglectPercent: number;
  hardBiasPercent: number;
  riskDistribution: GovernanceRiskDistribution;
  rushPatternPercent: number;
  skipBurstPercent: number;
  wrongStreakPercent: number;
}

const GOVERNANCE_RISK_CLUSTERS: GovernanceRiskCluster[] = [
  "stable",
  "driftProne",
  "impulsive",
  "overextended",
  "volatile",
];

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

const toNumberOrUndefined = (value: unknown): number | undefined => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return value;
};

const roundToTwoDecimals = (value: number): number =>
  Math.round(value * 100) / 100;

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(Math.max(value, minimum), maximum);

const buildDefaultSnapshotMonth = (date: Date): string => {
  const year = date.getUTCFullYear();
  const monthIndex = date.getUTCMonth();
  const previousMonthDate = new Date(Date.UTC(year, monthIndex - 1, 1));

  return [
    previousMonthDate.getUTCFullYear(),
    String(previousMonthDate.getUTCMonth() + 1).padStart(2, "0"),
  ].join("-");
};

const normalizeSnapshotMonth = (value: string | undefined): string => {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    return buildDefaultSnapshotMonth(new Date());
  }

  if (!/^\d{4}-\d{2}$/.test(normalizedValue)) {
    throw new Error(
      "Governance snapshot month must match the YYYY-MM format.",
    );
  }

  return normalizedValue;
};

const buildSnapshotDocumentId = (snapshotMonth: string): string =>
  snapshotMonth.replace("-", "_");

const createEmptyRiskDistribution = (): GovernanceRiskDistribution => ({
  driftProne: 0,
  impulsive: 0,
  overextended: 0,
  stable: 0,
  volatile: 0,
});

const computeRiskDistribution = (
  counts: Partial<Record<GovernanceRiskCluster, number>>,
  total: number,
): GovernanceRiskDistribution => {
  if (total <= 0) {
    return createEmptyRiskDistribution();
  }

  return {
    driftProne: roundToTwoDecimals(((counts.driftProne ?? 0) / total) * 100),
    impulsive: roundToTwoDecimals(((counts.impulsive ?? 0) / total) * 100),
    overextended: roundToTwoDecimals(
      ((counts.overextended ?? 0) / total) * 100,
    ),
    stable: roundToTwoDecimals(((counts.stable ?? 0) / total) * 100),
    volatile: roundToTwoDecimals(((counts.volatile ?? 0) / total) * 100),
  };
};

const computeAverage = (values: number[]): number => {
  if (values.length === 0) {
    return 0;
  }

  const sum = values.reduce((total, currentValue) => total + currentValue, 0);
  return roundToTwoDecimals(sum / values.length);
};

const computeVariance = (values: number[]): number => {
  if (values.length === 0) {
    return 0;
  }

  const mean = values.reduce((total, currentValue) => total + currentValue, 0) /
    values.length;
  const squaredDifferenceSum = values.reduce(
    (total, currentValue) =>
      total + ((currentValue - mean) ** 2),
    0,
  );

  return roundToTwoDecimals(squaredDifferenceSum / values.length);
};

const computeWeightedAverage = (
  weightedPairs: Array<{value: number; weight: number}>,
): number => {
  const totalWeight = weightedPairs.reduce(
    (sum, currentPair) => sum + currentPair.weight,
    0,
  );

  if (totalWeight <= 0) {
    return 0;
  }

  const weightedSum = weightedPairs.reduce(
    (sum, currentPair) => sum + (currentPair.value * currentPair.weight),
    0,
  );

  return roundToTwoDecimals(weightedSum / totalWeight);
};

const computeStabilityIndex = (
  riskDistribution: GovernanceRiskDistribution,
  disciplineVariance: number,
  templateVarianceMean: number,
): number => {
  const instabilityScore =
    (riskDistribution.driftProne * 0.2) +
    (riskDistribution.impulsive * 0.4) +
    (riskDistribution.overextended * 0.6) +
    (riskDistribution.volatile * 0.8);
  const stabilityIndex =
    100 -
    (instabilityScore * 0.5) -
    (disciplineVariance * 0.3) -
    (templateVarianceMean * 0.2);

  return roundToTwoDecimals(clamp(stabilityIndex, 0, 100));
};

/**
 * Runs the monthly governance snapshot aggregation pipeline.
 */
export class GovernanceSnapshotAggregationService {
  private readonly firestore = getFirestore();
  private readonly logger = createLogger(
    "GovernanceSnapshotAggregationService",
  );

  /**
   * Generates immutable monthly governance snapshots for every academic year
   * that already has governance summary inputs.
   * @param {GovernanceSnapshotAggregationInput} input Optional month override.
   * @return {Promise<GovernanceSnapshotAggregationResult>} Run summary.
   */
  public async generateMonthlySnapshots(
    input: GovernanceSnapshotAggregationInput = {},
  ): Promise<GovernanceSnapshotAggregationResult> {
    const snapshotMonth = normalizeSnapshotMonth(input.snapshotMonth);
    const institutesSnapshot = await this.firestore
      .collection(INSTITUTES_COLLECTION)
      .get();
    const results: GovernanceSnapshotRunResult[] = [];

    for (const instituteDocument of institutesSnapshot.docs) {
      const instituteId = instituteDocument.id;
      const academicYearsSnapshot = await instituteDocument.ref
        .collection(ACADEMIC_YEARS_COLLECTION)
        .get();

      for (const academicYearDocument of academicYearsSnapshot.docs) {
        const academicYear = academicYearDocument.id;

        try {
          const result = await this.generateSnapshotForAcademicYear(
            instituteId,
            academicYear,
            snapshotMonth,
          );
          results.push(result);
        } catch (error) {
          this.logger.error("Governance snapshot generation failed.", {
            academicYear,
            error,
            instituteId,
            snapshotMonth,
          });
          throw error;
        }
      }
    }

    const createdCount = results.filter((result) => result.created).length;
    const skippedCount = results.length - createdCount;

    this.logger.info("Governance snapshot generation completed.", {
      createdCount,
      instituteCount: institutesSnapshot.size,
      skippedCount,
      snapshotMonth,
      totalAcademicYearsProcessed: results.length,
    });

    return {
      createdCount,
      results,
      skippedCount,
      snapshotMonth,
    };
  }

  /**
   * Builds one immutable governance snapshot for a single academic year.
   * @param {string} instituteId Institute namespace identifier.
   * @param {string} academicYear Academic year document identifier.
   * @param {string} snapshotMonth Month being snapshotted in YYYY-MM format.
   * @return {Promise<GovernanceSnapshotRunResult>} Per-year run result.
   */
  private async generateSnapshotForAcademicYear(
    instituteId: string,
    academicYear: string,
    snapshotMonth: string,
  ): Promise<GovernanceSnapshotRunResult> {
    const academicYearReference = this.firestore
      .collection(INSTITUTES_COLLECTION)
      .doc(instituteId)
      .collection(ACADEMIC_YEARS_COLLECTION)
      .doc(academicYear);
    const [runAnalyticsSnapshot, studentMetricsSnapshot] = await Promise.all([
      academicYearReference.collection(RUN_ANALYTICS_COLLECTION).get(),
      academicYearReference.collection(STUDENT_YEAR_METRICS_COLLECTION).get(),
    ]);
    const snapshotDocumentPath =
      `${academicYearReference.path}/${GOVERNANCE_SNAPSHOTS_COLLECTION}/` +
      buildSnapshotDocumentId(snapshotMonth);

    if (runAnalyticsSnapshot.empty && studentMetricsSnapshot.empty) {
      return {
        academicYear,
        created: false,
        documentPath: snapshotDocumentPath,
        instituteId,
        reason: "no_summary_documents",
      };
    }

    const snapshotReference = academicYearReference
      .collection(GOVERNANCE_SNAPSHOTS_COLLECTION)
      .doc(buildSnapshotDocumentId(snapshotMonth));
    const existingSnapshot = await snapshotReference.get();

    if (existingSnapshot.exists) {
      return {
        academicYear,
        created: false,
        documentPath: snapshotReference.path,
        instituteId,
        reason: "already_exists",
      };
    }

    const aggregatedRunAnalytics = this.aggregateRunAnalytics(
      runAnalyticsSnapshot.docs.map((document) => document.data()),
    );
    const aggregatedStudentMetrics = this.aggregateStudentMetrics(
      studentMetricsSnapshot.docs.map((document) => document.data()),
    );
    const generatedAt = Timestamp.now();
    const snapshotDocument: GovernanceSnapshotDocument = {
      academicYear,
      avgAccuracyPercent: aggregatedRunAnalytics.avgAccuracyPercent,
      avgPhaseAdherence: aggregatedStudentMetrics.avgPhaseAdherence,
      avgRawScorePercent: aggregatedRunAnalytics.avgRawScorePercent,
      createdAt: generatedAt,
      disciplineMean: aggregatedStudentMetrics.disciplineMean,
      disciplineTrend: aggregatedStudentMetrics.disciplineMean,
      disciplineVariance: aggregatedStudentMetrics.disciplineVariance,
      easyNeglectPercent: aggregatedStudentMetrics.easyNeglectPercent,
      generatedAt,
      hardBiasPercent: aggregatedStudentMetrics.hardBiasPercent,
      immutable: true,
      instituteId,
      month: snapshotMonth,
      overrideFrequency: aggregatedRunAnalytics.overrideFrequency,
      phaseCompliancePercent: aggregatedStudentMetrics.avgPhaseAdherence,
      riskClusterDistribution: aggregatedStudentMetrics.riskDistribution,
      riskDistribution: aggregatedStudentMetrics.riskDistribution,
      rushPatternPercent: aggregatedStudentMetrics.rushPatternPercent,
      schemaVersion: 1,
      skipBurstPercent: aggregatedStudentMetrics.skipBurstPercent,
      stabilityIndex: computeStabilityIndex(
        aggregatedStudentMetrics.riskDistribution,
        aggregatedStudentMetrics.disciplineVariance,
        aggregatedRunAnalytics.templateVarianceMean,
      ),
      templateVarianceMean: aggregatedRunAnalytics.templateVarianceMean,
      wrongStreakPercent: aggregatedStudentMetrics.wrongStreakPercent,
    };

    await snapshotReference.create(snapshotDocument);

    this.logger.info("Governance snapshot created.", {
      academicYear,
      documentPath: snapshotReference.path,
      instituteId,
      snapshotMonth,
      stabilityIndex: snapshotDocument.stabilityIndex,
    });

    return {
      academicYear,
      created: true,
      documentPath: snapshotReference.path,
      instituteId,
    };
  }

  /**
   * Aggregates run-level analytics into governance-ready summary metrics.
   * @param {Record<string, unknown>[]} runAnalyticsDocuments Source documents.
   * @return {AggregatedRunAnalytics} Weighted governance run aggregates.
   */
  private aggregateRunAnalytics(
    runAnalyticsDocuments: Record<string, unknown>[],
  ): AggregatedRunAnalytics {
    const avgAccuracyWeightedPairs: Array<{value: number; weight: number}> = [];
    const avgRawWeightedPairs: Array<{value: number; weight: number}> = [];
    const templateVariances: number[] = [];
    let overrideCountTotal = 0;
    let submittedSessionCountTotal = 0;

    for (const runAnalyticsDocument of runAnalyticsDocuments) {
      const processingMarkers = isPlainObject(
        runAnalyticsDocument.processingMarkers,
      ) ?
        runAnalyticsDocument.processingMarkers :
        undefined;
      const runAnalyticsEngine = isPlainObject(
        processingMarkers?.runAnalyticsEngine,
      ) ?
        processingMarkers.runAnalyticsEngine :
        undefined;
      const submittedSessionCount =
        toNumberOrUndefined(runAnalyticsEngine?.submittedSessionCount) ?? 1;
      const avgRawScorePercent =
        toNumberOrUndefined(runAnalyticsDocument.avgRawScorePercent);
      const avgAccuracyPercent =
        toNumberOrUndefined(runAnalyticsDocument.avgAccuracyPercent);
      const stdDeviation = toNumberOrUndefined(
        runAnalyticsDocument.stdDeviation,
      );
      const overrideCount =
        toNumberOrUndefined(runAnalyticsDocument.overrideCount) ??
        0;

      if (avgRawScorePercent !== undefined) {
        avgRawWeightedPairs.push({
          value: avgRawScorePercent,
          weight: submittedSessionCount,
        });
      }

      if (avgAccuracyPercent !== undefined) {
        avgAccuracyWeightedPairs.push({
          value: avgAccuracyPercent,
          weight: submittedSessionCount,
        });
      }

      if (stdDeviation !== undefined) {
        templateVariances.push(stdDeviation);
      }

      overrideCountTotal += overrideCount;
      submittedSessionCountTotal += submittedSessionCount;
    }

    return {
      avgAccuracyPercent: computeWeightedAverage(avgAccuracyWeightedPairs),
      avgRawScorePercent: computeWeightedAverage(avgRawWeightedPairs),
      overrideFrequency: submittedSessionCountTotal > 0 ?
        roundToTwoDecimals(
          (overrideCountTotal / submittedSessionCountTotal) * 100,
        ) :
        0,
      templateVarianceMean: computeAverage(templateVariances),
    };
  }

  /**
   * Aggregates student-year metrics into governance-ready institutional views.
   * @param {Record<string, unknown>[]} studentMetricsDocuments Source docs.
   * @return {AggregatedStudentMetrics} Governance student aggregates.
   */
  private aggregateStudentMetrics(
    studentMetricsDocuments: Record<string, unknown>[],
  ): AggregatedStudentMetrics {
    const avgPhaseAdherenceValues: number[] = [];
    const disciplineValues: number[] = [];
    const riskCounts: Partial<Record<GovernanceRiskCluster, number>> = {};
    let easyNeglectActiveCount = 0;
    let hardBiasActiveCount = 0;
    let rushPatternActiveCount = 0;
    let skipBurstActiveCount = 0;
    let wrongStreakActiveCount = 0;

    for (const studentMetricsDocument of studentMetricsDocuments) {
      const disciplineIndex = toNumberOrUndefined(
        studentMetricsDocument.disciplineIndex,
      );
      const avgPhaseAdherence = toNumberOrUndefined(
        studentMetricsDocument.avgPhaseAdherence,
      );
      const riskState = toNonEmptyString(studentMetricsDocument.riskState) as
        GovernanceRiskCluster | undefined;

      if (disciplineIndex !== undefined) {
        disciplineValues.push(disciplineIndex);
      }

      if (avgPhaseAdherence !== undefined) {
        avgPhaseAdherenceValues.push(avgPhaseAdherence);
      }

      if (riskState && GOVERNANCE_RISK_CLUSTERS.includes(riskState)) {
        riskCounts[riskState] = (riskCounts[riskState] ?? 0) + 1;
      }

      if (studentMetricsDocument.easyNeglectActive === true) {
        easyNeglectActiveCount += 1;
      }

      if (studentMetricsDocument.hardBiasActive === true) {
        hardBiasActiveCount += 1;
      }

      if (studentMetricsDocument.rushPatternActive === true) {
        rushPatternActiveCount += 1;
      }

      if (studentMetricsDocument.skipBurstActive === true) {
        skipBurstActiveCount += 1;
      }

      if (studentMetricsDocument.wrongStreakActive === true) {
        wrongStreakActiveCount += 1;
      }
    }

    const studentCount = studentMetricsDocuments.length;

    return {
      avgPhaseAdherence: computeAverage(avgPhaseAdherenceValues),
      disciplineMean: computeAverage(disciplineValues),
      disciplineVariance: computeVariance(disciplineValues),
      easyNeglectPercent: studentCount > 0 ?
        roundToTwoDecimals((easyNeglectActiveCount / studentCount) * 100) :
        0,
      hardBiasPercent: studentCount > 0 ?
        roundToTwoDecimals((hardBiasActiveCount / studentCount) * 100) :
        0,
      riskDistribution: computeRiskDistribution(riskCounts, studentCount),
      rushPatternPercent: studentCount > 0 ?
        roundToTwoDecimals((rushPatternActiveCount / studentCount) * 100) :
        0,
      skipBurstPercent: studentCount > 0 ?
        roundToTwoDecimals((skipBurstActiveCount / studentCount) * 100) :
        0,
      wrongStreakPercent: studentCount > 0 ?
        roundToTwoDecimals((wrongStreakActiveCount / studentCount) * 100) :
        0,
    };
  }
}

export const governanceSnapshotAggregationService =
  new GovernanceSnapshotAggregationService();
