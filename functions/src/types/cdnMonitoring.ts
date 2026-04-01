export type CdnMonitoredAssetType =
  "questionImage" |
  "dashboardImage" |
  "pdfDownload";

export type CdnMonitoringHealthStatus =
  "unknown" |
  "healthy" |
  "degraded" |
  "critical";

export type CdnMonitoringViolation =
  "cacheHitRatioBelowTarget" |
  "edgeLatencyAboveTarget" |
  "http4xxDetected" |
  "http5xxDetected";

export interface CdnMonitoringLatencyTarget {
  assetType: CdnMonitoredAssetType;
  maxEdgeLatencyMs: number;
}

export interface InitializedCdnMonitoringConfiguration {
  cacheHitRatioTargetPercent: number;
  latencyTargets: Record<CdnMonitoredAssetType, CdnMonitoringLatencyTarget>;
}

export interface EvaluateCdnMonitoringSnapshotRequest {
  assetType: CdnMonitoredAssetType;
  bandwidthBytes: number;
  cacheHitCount: number;
  edgeLatencyMs: number;
  http4xxCount: number;
  http5xxCount: number;
  requestCount: number;
}

export interface CdnMonitoringSnapshot {
  assetType: CdnMonitoredAssetType;
  bandwidthBytes: number;
  bandwidthMegabytes: number;
  cacheHitCount: number;
  cacheHitRatioPercent: number;
  edgeLatencyMs: number;
  edgeLatencyTargetMs: number;
  healthStatus: CdnMonitoringHealthStatus;
  http4xxCount: number;
  http4xxRatePercent: number;
  http5xxCount: number;
  http5xxRatePercent: number;
  requestCount: number;
  totalErrorRatePercent: number;
  violations: CdnMonitoringViolation[];
}

export interface SummarizeCdnMonitoringRequest {
  snapshots: EvaluateCdnMonitoringSnapshotRequest[];
}

export interface CdnMonitoringSummary {
  assetSummaries: CdnMonitoringSnapshot[];
  averageEdgeLatencyMs: number;
  bandwidthBytes: number;
  bandwidthMegabytes: number;
  cacheHitRatioPercent: number;
  healthStatus: CdnMonitoringHealthStatus;
  http4xxCount: number;
  http4xxRatePercent: number;
  http5xxCount: number;
  http5xxRatePercent: number;
  requestCount: number;
  totalErrorRatePercent: number;
}
