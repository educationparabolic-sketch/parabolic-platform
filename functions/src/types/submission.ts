import {ExamOperationalDataAccessPolicy} from "./dataTierPartition";

export type SubmissionErrorCode =
  "FORBIDDEN" |
  "INTERNAL_ERROR" |
  "NOT_FOUND" |
  "SESSION_NOT_ACTIVE" |
  "SUBMISSION_LOCKED" |
  "TENANT_MISMATCH" |
  "UNAUTHORIZED" |
  "VALIDATION_ERROR";

export interface SubmissionContext {
  instituteId: string;
  runId: string;
  sessionId: string;
  studentId: string;
  yearId: string;
}

export type SubmissionRiskState =
  "Stable" |
  "Drift-Prone" |
  "Impulsive" |
  "Overextended" |
  "Volatile";

export interface SubmissionMetrics {
  accuracyPercent: number;
  behaviourTagSummary?: string;
  consecutiveWrongStreakMax: number;
  disciplineIndex: number;
  easyAttemptRatePercent?: number;
  easyNeglectRatePercent?: number;
  easyRemainingAfterPhase1Percent: number;
  guessRate: number;
  guessRatePercent?: number;
  hardAttemptRatioPercent?: number;
  hardBiasRatePercent?: number;
  hardInPhase1Percent: number;
  maxTimeViolationPercent: number;
  minTimeViolationPercent: number;
  normalizedRiskScore?: number;
  overstayQuestionsPercent?: number;
  phaseObjectiveAdherencePercent?: number;
  phaseAdherencePercent: number;
  phaseTimingAdherencePercent?: number;
  rawScorePercent: number;
  riskState: SubmissionRiskState;
  skipBurstCount: number;
}

export interface SubmissionResult extends SubmissionMetrics {
  idempotent: boolean;
  sessionPath: string;
}

export interface SubmissionResponseData {
  accuracyPercent: number;
  disciplineIndex: number;
  operationalDataAccessPolicy: ExamOperationalDataAccessPolicy;
  rawScorePercent: number;
  riskState: SubmissionRiskState;
}

export interface SubmissionSuccessResponse {
  code: "OK";
  data: SubmissionResponseData;
  message: string;
  requestId: string;
  success: true;
  timestamp: string;
}
