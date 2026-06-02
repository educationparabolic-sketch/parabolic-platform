import {ExamOperationalDataAccessPolicy} from "./dataTierPartition";

export type AnswerBatchErrorCode =
  "FORBIDDEN" |
  "INTERNAL_ERROR" |
  "NOT_FOUND" |
  "TENANT_MISMATCH" |
  "UNAUTHORIZED" |
  "VALIDATION_ERROR";

export interface PersistAnswerBatchContext {
  instituteId: string;
  runId: string;
  sessionId: string;
  studentId: string;
  yearId: string;
}

export interface AdaptivePhaseSessionSnapshot {
  answeredPercent: number;
  currentPhase: string;
  difficultyCompliancePercent: number;
  disciplineIndex: number;
  elapsedPercent: number;
  overspendPercent: number;
  phaseAdherencePercent: number;
  skipPatternScore: number;
}

export interface SessionAnswerWriteInput {
  clientTimestamp: number | string | Date;
  questionId: string;
  selectedOption: string;
  timeSpent: number;
}

export interface PersistAnswerBatchInput {
  adaptivePhaseSnapshot?: unknown;
  answers: unknown;
  context: PersistAnswerBatchContext;
  millisecondsSinceLastWrite: number;
}

export type MinTimeEnforcementLevel = "none" | "track_only" | "soft" | "strict";
export type MaxTimeEnforcementLevel =
  "none" |
  "track_only" |
  "advisory" |
  "strict";

export interface MinTimeViolation {
  enforcementLevel: Exclude<MinTimeEnforcementLevel, "none">;
  minTime: number;
  questionId: string;
  remainingTime: number;
  warningMessage: string | null;
}

export interface MaxTimeViolation {
  enforcementLevel: Exclude<MaxTimeEnforcementLevel, "none">;
  exceededBy: number;
  maxTime: number;
  questionId: string;
  questionLocked: boolean;
  warningMessage: string | null;
}

export interface QuestionTimingMetric {
  cumulativeTimeSpent: number;
  maxTime: number;
  maxTimeViolated: boolean;
  minTime: number;
  minTimeViolated: boolean;
  questionId: string;
}

export interface TimingMetricsExport {
  averageTimePerQuestion: number;
  disciplineIndexInputs: {
    impulsiveAnsweringRiskPercent: number;
    overthinkingRiskPercent: number;
  };
  maxTimeViolationCount: number;
  maxTimeViolationPercent: number;
  minTimeViolationCount: number;
  minTimeViolationPercent: number;
  phaseDeviationFlags: {
    hasMaxTimeDeviation: boolean;
    hasMinTimeDeviation: boolean;
  };
  questionLevelCumulativeTimeRecords: QuestionTimingMetric[];
  serverValidatedTimingMetrics: {
    evaluatedQuestionCount: number;
    persistedQuestionCount: number;
    totalCumulativeTimeSpent: number;
  };
}

export interface PersistAnswerBatchResult {
  adaptivePhaseSnapshotPersisted: boolean;
  blockedQuestionIds: string[];
  ignoredQuestionIds: string[];
  lockedQuestionIds: string[];
  maxTimeEnforcementLevel: MaxTimeEnforcementLevel;
  maxTimeViolations: MaxTimeViolation[];
  minTimeEnforcementLevel: MinTimeEnforcementLevel;
  minTimeViolations: MinTimeViolation[];
  operationalDataAccessPolicy: ExamOperationalDataAccessPolicy;
  persistedQuestionIds: string[];
  sessionPath: string;
  timingMetricsExport: TimingMetricsExport;
}
