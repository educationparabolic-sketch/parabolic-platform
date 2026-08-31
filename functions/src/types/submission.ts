import {ExamOperationalDataAccessPolicy} from "./dataTierPartition";
import type {
  ExamSubmissionReason,
  ExamSubmissionRiskState,
  ExamSubmitRequestBody,
  ExamSubmitResult,
} from "../../../shared/contracts/apiDtos";

export type SubmissionErrorCode =
  "FORBIDDEN" |
  "INTERNAL_ERROR" |
  "NOT_FOUND" |
  "SESSION_NOT_ACTIVE" |
  "SUBMISSION_LOCKED" |
  "TENANT_MISMATCH" |
  "UNAUTHORIZED" |
  "VALIDATION_ERROR";

export interface SubmissionContext extends ExamSubmitRequestBody {
  sessionId: string;
  studentId: string;
}

export type SubmissionRiskState = ExamSubmissionRiskState;

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
  status: "submitted";
  submissionReason: ExamSubmissionReason;
  submittedAt: string;
}

export interface SubmissionResponseData extends ExamSubmitResult {
  operationalDataAccessPolicy: ExamOperationalDataAccessPolicy;
}

export interface SubmissionSuccessResponse {
  code: "OK";
  data: SubmissionResponseData;
  message: string;
  requestId: string;
  success: true;
  timestamp: string;
}
