import { getFrontendMonitoringSnapshot } from "../../../../../shared/services/frontendMonitoring";

export interface SystemHealthMetric {
  id:
    | "FirestoreReadCount"
    | "FirestoreWriteCount"
    | "CloudFunctionInvocations"
    | "BigQueryStorageSize"
    | "HostingBandwidth"
    | "EstimatedMonthlyCost"
    | "ErrorRate"
    | "FailedFunctionCount";
  label: string;
  value: string;
  helper: string;
}

export interface SystemHealthTrendPoint {
  minute: string;
  errorRatePercent: number;
  failedFunctions: number;
  estimatedCostUsd: number;
}

export interface InfrastructureAlert {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  message: string;
  raisedAt: string;
}

export type GlobalFeatureFlagName =
  | "EnableBetaFeatures"
  | "EnableExperimentalRiskEngine"
  | "EnableNewUI"
  | "SetRolloutPercentage";

export interface GlobalFeatureFlagRecord {
  flagName: GlobalFeatureFlagName;
  valueType: "boolean" | "number";
  booleanValue?: boolean;
  numberValue?: number;
  description: string;
  middlewareEnforced: true;
  documentPath: string;
}

export interface DataOperationRecord {
  operation:
    | "ExportPlatformMetrics"
    | "ExportInstituteData"
    | "TriggerManualBackup"
    | "RestoreSimulationEnvironment";
  sourceCollections: readonly string[];
  mode: "snapshot-only";
  status: "ready" | "in-progress";
  lastExecutedAt: string;
}

export interface StructuralGuaranteeCheck {
  id:
    | "cross_institute_intelligence_aggregation"
    | "calibration_simulation_without_raw_recompute"
    | "immutable_calibration_versioning"
    | "vendor_authoritative_licensing"
    | "feature_flag_based_rollout"
    | "strong_tenant_separation";
  label: string;
  status: "pass";
  evidence: string;
}

export interface SystemHealthPerformanceIndicator {
  indicator:
    | "ApiLatencyP95"
    | "QueueBacklog"
    | "EmulatorServiceHealth"
    | "ErrorBudgetConsumption";
  value: string;
  status: "healthy" | "degraded";
}

export interface VendorSystemHealthDataset {
  sourceSystems: readonly ["platform metrics", "error logs", "monitoring dashboards"];
  healthMetrics: SystemHealthMetric[];
  trend: SystemHealthTrendPoint[];
  alerts: InfrastructureAlert[];
  featureFlags: GlobalFeatureFlagRecord[];
  dataOperations: DataOperationRecord[];
  structuralGuarantees: StructuralGuaranteeCheck[];
  performanceIndicators: SystemHealthPerformanceIndicator[];
  frontendTelemetry: FrontendTelemetrySummary;
}

export interface FrontendTelemetryCriticalEvent {
  eventId: string;
  portal: string;
  eventType: string;
  severity: string;
  actorId: string;
  timestamp: string;
  message: string;
  requestPath: string;
}

export interface FrontendTelemetrySummary {
  sessionIdentifier: string;
  capturedAt: string;
  runtimeExceptionCount: number;
  failedApiCallCount: number;
  averageApiLatencyMs: number;
  recentCriticalEvents: FrontendTelemetryCriticalEvent[];
}

export function getVendorSystemHealthDataset(): VendorSystemHealthDataset {
  const frontendTelemetrySnapshot = getFrontendMonitoringSnapshot();

  return {
    sourceSystems: ["platform metrics", "error logs", "monitoring dashboards"],
    healthMetrics: [
      {
        id: "FirestoreReadCount",
        label: "Firestore Reads (1h)",
        value: "1.86M",
        helper: "Summary from platform metrics pipeline.",
      },
      {
        id: "FirestoreWriteCount",
        label: "Firestore Writes (1h)",
        value: "412K",
        helper: "Includes session + analytics summary writes only.",
      },
      {
        id: "CloudFunctionInvocations",
        label: "Function Invocations (1h)",
        value: "94.2K",
        helper: "Aggregated invocation telemetry.",
      },
      {
        id: "BigQueryStorageSize",
        label: "BigQuery Storage",
        value: "2.4 TB",
        helper: "Archive and governance snapshot storage.",
      },
      {
        id: "HostingBandwidth",
        label: "Hosting Bandwidth (24h)",
        value: "428 GB",
        helper: "Portal delivery and static assets.",
      },
      {
        id: "EstimatedMonthlyCost",
        label: "Estimated Monthly Cost",
        value: "$18,460",
        helper: "Firestore, Functions, Hosting, BigQuery blended estimate.",
      },
      {
        id: "ErrorRate",
        label: "API Error Rate",
        value: "0.84%",
        helper: "HTTP >= 400 ratio across vendor+portal APIs.",
      },
      {
        id: "FailedFunctionCount",
        label: "Failed Functions (1h)",
        value: "37",
        helper: "Post-retry failures captured from monitoring dashboards.",
      },
    ],
    trend: [
      { minute: "09:00", errorRatePercent: 0.71, failedFunctions: 5, estimatedCostUsd: 24.1 },
      { minute: "09:10", errorRatePercent: 0.69, failedFunctions: 4, estimatedCostUsd: 24.4 },
      { minute: "09:20", errorRatePercent: 0.74, failedFunctions: 5, estimatedCostUsd: 24.7 },
      { minute: "09:30", errorRatePercent: 0.86, failedFunctions: 8, estimatedCostUsd: 25.0 },
      { minute: "09:40", errorRatePercent: 0.93, failedFunctions: 7, estimatedCostUsd: 25.4 },
      { minute: "09:50", errorRatePercent: 0.84, failedFunctions: 8, estimatedCostUsd: 25.7 },
    ],
    alerts: [
      {
        id: "alert-critical-1",
        severity: "critical",
        title: "Function failure burst detected",
        message: "Submission analytics trigger retries exceeded baseline in asia-south1.",
        raisedAt: "2026-04-22T09:41:00.000Z",
      },
      {
        id: "alert-warning-1",
        severity: "warning",
        title: "Firestore write surge",
        message: "Write throughput is 17% above expected morning baseline.",
        raisedAt: "2026-04-22T09:35:00.000Z",
      },
      {
        id: "alert-info-1",
        severity: "info",
        title: "Backup snapshot completed",
        message: "Nightly vendor aggregate snapshot export completed successfully.",
        raisedAt: "2026-04-22T08:02:00.000Z",
      },
    ],
    featureFlags: [
      {
        flagName: "EnableBetaFeatures",
        valueType: "boolean",
        booleanValue: true,
        description: "Enables beta-only operator features for selected rollout cohorts.",
        middlewareEnforced: true,
        documentPath: "globalFeatureFlags/EnableBetaFeatures",
      },
      {
        flagName: "EnableExperimentalRiskEngine",
        valueType: "boolean",
        booleanValue: false,
        description: "Controls risk-engine experiment routing behind vendor middleware checks.",
        middlewareEnforced: true,
        documentPath: "globalFeatureFlags/EnableExperimentalRiskEngine",
      },
      {
        flagName: "EnableNewUI",
        valueType: "boolean",
        booleanValue: true,
        description: "Gates new portal UI package visibility by backend-evaluated flags.",
        middlewareEnforced: true,
        documentPath: "globalFeatureFlags/EnableNewUI",
      },
      {
        flagName: "SetRolloutPercentage",
        valueType: "number",
        numberValue: 35,
        description: "Controls rollout percentage applied by middleware for flagged capabilities.",
        middlewareEnforced: true,
        documentPath: "globalFeatureFlags/SetRolloutPercentage",
      },
    ],
    dataOperations: [
      {
        operation: "ExportPlatformMetrics",
        sourceCollections: ["vendorMetrics", "vendorAggregates"],
        mode: "snapshot-only",
        status: "ready",
        lastExecutedAt: "2026-04-22T07:00:00.000Z",
      },
      {
        operation: "ExportInstituteData",
        sourceCollections: ["governanceSnapshots", "studentYearMetrics", "runAnalytics"],
        mode: "snapshot-only",
        status: "ready",
        lastExecutedAt: "2026-04-21T18:10:00.000Z",
      },
      {
        operation: "TriggerManualBackup",
        sourceCollections: ["vendorAggregates", "calibrationVersions", "globalFeatureFlags", "auditLogs"],
        mode: "snapshot-only",
        status: "in-progress",
        lastExecutedAt: "2026-04-22T09:12:00.000Z",
      },
      {
        operation: "RestoreSimulationEnvironment",
        sourceCollections: ["vendorAggregates", "vendorMetrics", "auditLogs"],
        mode: "snapshot-only",
        status: "ready",
        lastExecutedAt: "2026-04-20T13:45:00.000Z",
      },
    ],
    structuralGuarantees: [
      {
        id: "cross_institute_intelligence_aggregation",
        label: "Cross-institute intelligence aggregation",
        status: "pass",
        evidence: "Dashboard uses precomputed vendorAggregates summaries only.",
      },
      {
        id: "calibration_simulation_without_raw_recompute",
        label: "Calibration simulation without raw recomputation",
        status: "pass",
        evidence: "Simulation views consume summary metrics and prohibit raw session scans.",
      },
      {
        id: "immutable_calibration_versioning",
        label: "Immutable calibration versioning",
        status: "pass",
        evidence: "Calibration version history remains append-only with rollback references.",
      },
      {
        id: "vendor_authoritative_licensing",
        label: "Vendor-authoritative licensing",
        status: "pass",
        evidence: "License updates and history are controlled from vendor-authorized flows.",
      },
      {
        id: "feature_flag_based_rollout",
        label: "Feature-flag-based rollout control",
        status: "pass",
        evidence: "Global feature flags are mapped to middleware-enforced evaluation paths.",
      },
      {
        id: "strong_tenant_separation",
        label: "Strong tenant separation and scalability",
        status: "pass",
        evidence: "Vendor dashboard queries aggregated global collections, not institute raw sessions.",
      },
    ],
    performanceIndicators: [
      { indicator: "ApiLatencyP95", value: "418 ms", status: "healthy" },
      { indicator: "QueueBacklog", value: "57 jobs", status: "healthy" },
      { indicator: "EmulatorServiceHealth", value: "degraded: auth reconnects", status: "degraded" },
      { indicator: "ErrorBudgetConsumption", value: "42% (30d)", status: "healthy" },
    ],
    frontendTelemetry: {
      sessionIdentifier: frontendTelemetrySnapshot.sessionIdentifier,
      capturedAt: frontendTelemetrySnapshot.capturedAt,
      runtimeExceptionCount: frontendTelemetrySnapshot.runtimeExceptionCount,
      failedApiCallCount: frontendTelemetrySnapshot.failedApiCallCount,
      averageApiLatencyMs: frontendTelemetrySnapshot.averageApiLatencyMs,
      recentCriticalEvents: frontendTelemetrySnapshot.recentCriticalEvents.map((event) => ({
        eventId: event.eventId,
        portal: event.portal,
        eventType: event.eventType,
        severity: event.severity,
        actorId: event.actorId,
        timestamp: event.timestamp,
        message: event.error?.message ?? "No error message captured.",
        requestPath: event.request?.path ?? "N/A",
      })),
    },
  };
}
