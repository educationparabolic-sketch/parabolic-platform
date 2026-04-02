import {RuntimeEnvironment} from "./environment";

export type LoadSimulationScenarioType =
  "analyticsProcessingBurst" |
  "dashboardReadSurge" |
  "sessionStartBurst" |
  "submissionSurge" |
  "writeBurst";

export type LoadSimulationStatus =
  "completed" |
  "running";

export interface LoadSimulationScenarioSummary {
  averageLatencyMs: number;
  estimatedReadOperations: number;
  estimatedWriteOperations: number;
  executedOperations: number;
  failedOperations: number;
  functionInvocationTimeMs: number;
  p95LatencyMs: number;
  scenario: LoadSimulationScenarioType;
  targetOperations: number;
  transactionConflicts: number;
}

export interface LoadSimulationOutputMetrics {
  averageLatencyMs: number;
  maxFunctionInvocationTimeMs: number;
  overallEstimatedReadAmplification: number;
  totalExecutedOperations: number;
  totalTransactionConflicts: number;
}

export interface LoadSimulationReportDocument {
  calibrationVersion: string;
  completedAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  createdAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  failedScenarioCount: number;
  instituteId: string;
  outputMetrics: LoadSimulationOutputMetrics;
  parameterSnapshot: {
    archiveSimulationEnabled: boolean;
    difficultyDistribution: string;
    instituteCount: number;
    loadIntensity: string;
    riskDistributionBias: string;
    runCount: number;
    studentCountPerInstitute: number;
    timingAggressiveness: string;
  };
  reportId: string;
  riskModelVersion: string;
  runCount: number;
  scenarioSummaries: LoadSimulationScenarioSummary[];
  simulationId: string;
  simulationVersion: string;
  status: LoadSimulationStatus;
  studentCount: number;
  totalSyntheticSessions: number;
  yearId: string;
}

export interface RunLoadSimulationInput {
  nodeEnv: RuntimeEnvironment;
  simulationId: string;
  yearId: string;
}

export interface RunLoadSimulationResult {
  analyticsDocumentsCreated: {
    insightSnapshotCount: number;
    runAnalyticsCount: number;
    studentYearMetricsCount: number;
  };
  environmentPath: string;
  generatedReport: LoadSimulationReportDocument;
  reportPath: string;
  reusedExistingReport: boolean;
}

export interface RunLoadSimulationSuccessResponse {
  code: "OK";
  data: RunLoadSimulationResult;
  message: string;
  requestId: string;
  success: true;
  timestamp: string;
}
