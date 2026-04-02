import {RuntimeEnvironment} from "./environment";
import {StudentRiskState} from "./riskEngine";

export interface SimulationRiskDistribution {
  "Drift-Prone": number;
  "Impulsive": number;
  "Overextended": number;
  Stable: number;
  Volatile: number;
}

export interface SimulationPatternExpectationSummary {
  easyNeglectActive: boolean;
  hardBiasActive: boolean;
  rushPatternActive: boolean;
  skipBurstActive: boolean;
  wrongStreakActive: boolean;
}

export interface SimulationPatternDetectionAccuracy {
  accuracyPercent: number;
  matchedStudents: number;
  perPatternAccuracy: Record<keyof SimulationPatternExpectationSummary, number>;
  totalStudentsCompared: number;
}

export interface SimulationRiskClusterStability {
  averageSeverityDrift: number;
  exactMatchPercent: number;
  matchedStudents: number;
  totalStudentsCompared: number;
}

export interface SimulationPhaseAdherenceVariation {
  actualStudentAverage: number;
  actualStudentStandardDeviation: number;
  expectedSessionAverage: number;
  expectedSessionStandardDeviation: number;
  variationDelta: number;
}

export interface SimulationControlledModeImprovement {
  available: boolean;
  controlledDisciplineAverage: number | null;
  controlledPhaseAdherenceAverage: number | null;
  disciplineLiftPercent: number | null;
  nonControlledDisciplineAverage: number | null;
  nonControlledPhaseAdherenceAverage: number | null;
  phaseAdherenceLiftPercent: number | null;
}

export interface SimulationStabilityIndexBehavior {
  actualStabilityIndex: number;
  expectedStabilityIndex: number;
  stabilityDelta: number;
}

export interface SimulationValidationReportDocument {
  calibrationVersion: string;
  completedAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  createdAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  environmentPath: string;
  instituteId: string;
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
  recommendedCalibrationActions: string[];
  reportId: string;
  riskClusterStability: SimulationRiskClusterStability;
  riskDistributionAlignmentPercent: number;
  riskDistributionDelta: SimulationRiskDistribution;
  riskModelVersion: string;
  simulationId: string;
  simulationVersion: string;
  sourceLoadReportPath: string;
  stabilityIndexBehavior: SimulationStabilityIndexBehavior;
  status: "completed" | "running";
  totalStudentsCompared: number;
  validatedAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  validationVersion: "build_80_v1";
  yearId: string;
  expectedPatterns: Record<string, SimulationPatternExpectationSummary>;
  actualPatterns: Record<string, SimulationPatternExpectationSummary>;
  expectedRiskDistribution: SimulationRiskDistribution;
  actualRiskDistribution: SimulationRiskDistribution;
  patternDetectionAccuracy: SimulationPatternDetectionAccuracy;
  phaseAdherenceVariation: SimulationPhaseAdherenceVariation;
  controlledModeImprovement: SimulationControlledModeImprovement;
}

export interface RunSimulationValidationInput {
  nodeEnv: RuntimeEnvironment;
  simulationId: string;
  yearId: string;
}

export interface RunSimulationValidationResult {
  environmentPath: string;
  reportPath: string;
  reusedExistingReport: boolean;
  validationReport: SimulationValidationReportDocument;
}

export interface RunSimulationValidationSuccessResponse {
  code: "OK";
  data: RunSimulationValidationResult;
  message: string;
  requestId: string;
  success: true;
  timestamp: string;
}

export const STUDENT_RISK_STATES: readonly StudentRiskState[] = [
  "Stable",
  "Drift-Prone",
  "Impulsive",
  "Overextended",
  "Volatile",
] as const;
