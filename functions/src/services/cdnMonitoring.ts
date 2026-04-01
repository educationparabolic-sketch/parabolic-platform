import {
  CdnMonitoringHealthStatus,
  CdnMonitoringSnapshot,
  CdnMonitoringViolation,
  EvaluateCdnMonitoringSnapshotRequest,
  InitializedCdnMonitoringConfiguration,
  SummarizeCdnMonitoringRequest,
  CdnMonitoringSummary,
} from "../types/cdnMonitoring";
import {createLogger} from "./logging";

const CACHE_HIT_RATIO_TARGET_PERCENT = 90;
const BYTES_PER_MEGABYTE = 1024 * 1024;

const LATENCY_TARGETS_MS = {
  dashboardImage: 300,
  pdfDownload: 2000,
  questionImage: 200,
} as const;

const roundToTwoDecimals = (value: number): number =>
  Math.round(value * 100) / 100;

const normalizeNonNegativeInteger = (
  value: number,
  fieldName: string,
): number => {
  if (!Number.isInteger(value) || value < 0) {
    throw new CdnMonitoringValidationError(
      `CDN monitoring field "${fieldName}" must be a non-negative integer.`,
    );
  }

  return value;
};

const normalizeNonNegativeNumber = (
  value: number,
  fieldName: string,
): number => {
  if (!Number.isFinite(value) || value < 0) {
    throw new CdnMonitoringValidationError(
      `CDN monitoring field "${fieldName}" must be a non-negative number.`,
    );
  }

  return value;
};

const calculateRatePercent = (
  numerator: number,
  denominator: number,
): number => {
  if (denominator === 0) {
    return 0;
  }

  return roundToTwoDecimals((numerator / denominator) * 100);
};

const resolveOverallHealthStatus = (
  statuses: CdnMonitoringHealthStatus[],
): CdnMonitoringHealthStatus => {
  if (statuses.includes("critical")) {
    return "critical";
  }

  if (statuses.includes("degraded")) {
    return "degraded";
  }

  if (statuses.includes("healthy")) {
    return "healthy";
  }

  return "unknown";
};

/**
 * Raised when CDN monitoring metrics are malformed.
 */
export class CdnMonitoringValidationError extends Error {
  /**
   * @param {string} message Validation failure detail.
   */
  constructor(message: string) {
    super(message);
    this.name = "CdnMonitoringValidationError";
  }
}

/**
 * Evaluates asset-delivery health metrics for vendor system monitoring flows.
 */
export class CdnMonitoringService {
  private readonly logger = createLogger("CdnMonitoringService");

  /**
   * Returns the deterministic monitoring targets derived from architecture.
   * @return {InitializedCdnMonitoringConfiguration} Monitoring thresholds.
   */
  public initializeConfiguration(): InitializedCdnMonitoringConfiguration {
    return {
      cacheHitRatioTargetPercent: CACHE_HIT_RATIO_TARGET_PERCENT,
      latencyTargets: {
        dashboardImage: {
          assetType: "dashboardImage",
          maxEdgeLatencyMs: LATENCY_TARGETS_MS.dashboardImage,
        },
        pdfDownload: {
          assetType: "pdfDownload",
          maxEdgeLatencyMs: LATENCY_TARGETS_MS.pdfDownload,
        },
        questionImage: {
          assetType: "questionImage",
          maxEdgeLatencyMs: LATENCY_TARGETS_MS.questionImage,
        },
      },
    };
  }

  /**
   * Normalizes one CDN monitoring window into dashboard-friendly metrics.
   * @param {EvaluateCdnMonitoringSnapshotRequest} request Raw metric inputs.
   * @return {CdnMonitoringSnapshot} Normalized snapshot metrics and health.
   */
  public evaluateSnapshot(
    request: EvaluateCdnMonitoringSnapshotRequest,
  ): CdnMonitoringSnapshot {
    const configuration = this.initializeConfiguration();
    const requestCount = normalizeNonNegativeInteger(
      request.requestCount,
      "requestCount",
    );
    const cacheHitCount = normalizeNonNegativeInteger(
      request.cacheHitCount,
      "cacheHitCount",
    );
    const http4xxCount = normalizeNonNegativeInteger(
      request.http4xxCount,
      "http4xxCount",
    );
    const http5xxCount = normalizeNonNegativeInteger(
      request.http5xxCount,
      "http5xxCount",
    );
    const bandwidthBytes = normalizeNonNegativeInteger(
      request.bandwidthBytes,
      "bandwidthBytes",
    );
    const edgeLatencyMs = normalizeNonNegativeNumber(
      request.edgeLatencyMs,
      "edgeLatencyMs",
    );

    if (cacheHitCount > requestCount) {
      throw new CdnMonitoringValidationError(
        "\"cacheHitCount\" cannot exceed \"requestCount\".",
      );
    }

    if (http4xxCount + http5xxCount > requestCount) {
      throw new CdnMonitoringValidationError(
        "HTTP error counts cannot exceed \"requestCount\".",
      );
    }

    const edgeLatencyTargetMs =
      configuration.latencyTargets[request.assetType].maxEdgeLatencyMs;
    const cacheHitRatioPercent = calculateRatePercent(
      cacheHitCount,
      requestCount,
    );
    const http4xxRatePercent = calculateRatePercent(http4xxCount, requestCount);
    const http5xxRatePercent = calculateRatePercent(http5xxCount, requestCount);
    const totalErrorRatePercent = calculateRatePercent(
      http4xxCount + http5xxCount,
      requestCount,
    );
    const bandwidthMegabytes = roundToTwoDecimals(
      bandwidthBytes / BYTES_PER_MEGABYTE,
    );
    const violations: CdnMonitoringViolation[] = [];

    if (
      requestCount > 0 &&
      cacheHitRatioPercent < configuration.cacheHitRatioTargetPercent
    ) {
      violations.push("cacheHitRatioBelowTarget");
    }

    if (requestCount > 0 && edgeLatencyMs > edgeLatencyTargetMs) {
      violations.push("edgeLatencyAboveTarget");
    }

    if (requestCount > 0 && http4xxCount > 0) {
      violations.push("http4xxDetected");
    }

    if (requestCount > 0 && http5xxCount > 0) {
      violations.push("http5xxDetected");
    }

    const healthStatus: CdnMonitoringHealthStatus = requestCount === 0 ?
      "unknown" :
      http5xxCount > 0 ?
        "critical" :
        violations.length > 0 ?
          "degraded" :
          "healthy";

    const snapshot: CdnMonitoringSnapshot = {
      assetType: request.assetType,
      bandwidthBytes,
      bandwidthMegabytes,
      cacheHitCount,
      cacheHitRatioPercent,
      edgeLatencyMs: roundToTwoDecimals(edgeLatencyMs),
      edgeLatencyTargetMs,
      healthStatus,
      http4xxCount,
      http4xxRatePercent,
      http5xxCount,
      http5xxRatePercent,
      requestCount,
      totalErrorRatePercent,
      violations,
    };

    this.logger.info("Evaluated CDN monitoring snapshot.", {
      assetType: snapshot.assetType,
      cacheHitRatioPercent: snapshot.cacheHitRatioPercent,
      edgeLatencyMs: snapshot.edgeLatencyMs,
      healthStatus: snapshot.healthStatus,
      http4xxCount: snapshot.http4xxCount,
      http5xxCount: snapshot.http5xxCount,
      requestCount: snapshot.requestCount,
      violations: snapshot.violations,
    });

    return snapshot;
  }

  /**
   * Aggregates multiple asset snapshots into one asset-delivery summary.
   * @param {SummarizeCdnMonitoringRequest} request Snapshot collection input.
   * @return {CdnMonitoringSummary} Summary metrics for vendor dashboards.
   */
  public summarizeSnapshots(
    request: SummarizeCdnMonitoringRequest,
  ): CdnMonitoringSummary {
    const assetSummaries = request.snapshots.map((snapshot) =>
      this.evaluateSnapshot(snapshot),
    );
    const requestCount = assetSummaries.reduce(
      (total, snapshot) => total + snapshot.requestCount,
      0,
    );
    const cacheHitCount = assetSummaries.reduce(
      (total, snapshot) => total + snapshot.cacheHitCount,
      0,
    );
    const http4xxCount = assetSummaries.reduce(
      (total, snapshot) => total + snapshot.http4xxCount,
      0,
    );
    const http5xxCount = assetSummaries.reduce(
      (total, snapshot) => total + snapshot.http5xxCount,
      0,
    );
    const bandwidthBytes = assetSummaries.reduce(
      (total, snapshot) => total + snapshot.bandwidthBytes,
      0,
    );
    const weightedLatencyNumerator = assetSummaries.reduce(
      (total, snapshot) =>
        total + (snapshot.edgeLatencyMs * snapshot.requestCount),
      0,
    );
    const summary: CdnMonitoringSummary = {
      assetSummaries,
      averageEdgeLatencyMs: requestCount === 0 ? 0 : roundToTwoDecimals(
        weightedLatencyNumerator / requestCount,
      ),
      bandwidthBytes,
      bandwidthMegabytes: roundToTwoDecimals(
        bandwidthBytes / BYTES_PER_MEGABYTE,
      ),
      cacheHitRatioPercent: calculateRatePercent(cacheHitCount, requestCount),
      healthStatus: resolveOverallHealthStatus(
        assetSummaries.map((snapshot) => snapshot.healthStatus),
      ),
      http4xxCount,
      http4xxRatePercent: calculateRatePercent(http4xxCount, requestCount),
      http5xxCount,
      http5xxRatePercent: calculateRatePercent(http5xxCount, requestCount),
      requestCount,
      totalErrorRatePercent: calculateRatePercent(
        http4xxCount + http5xxCount,
        requestCount,
      ),
    };

    this.logger.info("Summarized CDN monitoring metrics.", {
      averageEdgeLatencyMs: summary.averageEdgeLatencyMs,
      cacheHitRatioPercent: summary.cacheHitRatioPercent,
      healthStatus: summary.healthStatus,
      http4xxCount: summary.http4xxCount,
      http5xxCount: summary.http5xxCount,
      requestCount: summary.requestCount,
    });

    return summary;
  }
}

export const cdnMonitoringService = new CdnMonitoringService();
