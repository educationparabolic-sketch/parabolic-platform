import {RuntimeEnvironment} from "./environment";

export interface SimulationParameterSnapshot {
  archiveSimulationEnabled: boolean;
  difficultyDistribution: string;
  instituteCount: number;
  loadIntensity: string;
  riskDistributionBias: string;
  runCount: number;
  studentCountPerInstitute: number;
  timingAggressiveness: string;
}

export interface InitializeSimulationEnvironmentInput {
  calibrationVersion: string;
  nodeEnv: RuntimeEnvironment;
  parameterSnapshot: SimulationParameterSnapshot;
  riskModelVersion: string;
  simulationId: string;
  simulationVersion: string;
}

export interface SimulationEnvironmentMetadata {
  calibrationVersion: string;
  instituteId: string;
  parameterSnapshot: SimulationParameterSnapshot;
  riskModelVersion: string;
  runCount: number;
  simulationId: string;
  simulationVersion: string;
  studentCount: number;
}

export interface InitializeSimulationEnvironmentResult {
  environmentPath: string;
  metadata: SimulationEnvironmentMetadata;
  wasCreated: boolean;
}

export interface InitializeSimulationEnvironmentSuccessResponse {
  code: "OK";
  data: InitializeSimulationEnvironmentResult;
  message: string;
  requestId: string;
  success: true;
  timestamp: string;
}
