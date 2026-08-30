import {ExamOperationalDataAccessPolicy} from "./dataTierPartition";
import type {
  ExamAnswerAcknowledgement,
  ExamAnswerFlushReason,
  ExamQuestionResponse,
  ExamRuntimeQuestion,
} from "../../../shared/contracts/apiDtos";

export type AnswerBatchErrorCode =
  "FORBIDDEN" |
  "INTERNAL_ERROR" |
  "NOT_FOUND" |
  "SESSION_LOCKED" |
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
  clientRevision?: number;
  questionId: string;
  response: ExamQuestionResponse;
  timeSpentSeconds: number;
}

export type SessionQuestionResponse = ExamQuestionResponse;

export type SessionRuntimeQuestion = ExamRuntimeQuestion;

export interface PersistAnswerBatchInput {
  adaptivePhaseSnapshot?: unknown;
  answers: unknown;
  batchId?: string;
  batchSequence?: number;
  context: PersistAnswerBatchContext;
  flushReason?: ExamAnswerFlushReason;
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
  bufferTimeSpent?: number;
  cumulativeTimeSpent: number;
  maxTime: number;
  maxTimeViolated: boolean;
  minTime: number;
  minTimeViolated: boolean;
  phase1TimeSpent?: number;
  phase2TimeSpent?: number;
  phase3TimeSpent?: number;
  questionId: string;
  recommendedTime?: number;
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
  acknowledgements: ExamAnswerAcknowledgement[];
  adaptivePhaseSnapshotPersisted: boolean;
  batchId: string;
  batchSequence: number;
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
