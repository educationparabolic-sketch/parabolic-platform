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
  disciplineIndex: number;
  guessRate: number;
  maxTimeViolationPercent: number;
  minTimeViolationPercent: number;
  phaseAdherencePercent: number;
  rawScorePercent: number;
  riskState: SubmissionRiskState;
}

export interface SubmissionResult extends SubmissionMetrics {
  idempotent: boolean;
  sessionPath: string;
}
