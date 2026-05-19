/* eslint-disable require-jsdoc */
import {StandardApiErrorCode} from "./apiResponse";

export type AdminStudentStatus =
  "active" |
  "archived" |
  "inactive" |
  "invited" |
  "suspended";

export type AdminStudentRiskState =
  "critical" |
  "high" |
  "low" |
  "medium";

export interface AdminStudentsValidatedRequest {
  actorId: string;
  actorRole: string;
  instituteId: string;
  limit: number;
}

export interface AdminStudentRecord {
  academicYear: string;
  avgAccuracyPercent: number;
  avgRawScorePercent: number;
  batch: string;
  batchId: string;
  behaviorTagSummary: string;
  controlledModeDelta: number;
  controlledModePerformanceDelta: number;
  disciplineIndex: number;
  disciplineTrend: unknown[];
  easyNeglectRate: number;
  email: string;
  executionStabilityFlag: string;
  fullName: string;
  guessRatePercent: number;
  guessRateTrend: unknown[];
  hardBiasRate: number;
  id: string;
  lastActive: string | null;
  maxTimeViolationPercent: number;
  minTimeViolationPercent: number;
  overrideRecords: unknown[];
  phaseAdherencePercent: number;
  rankInBatch: number | null;
  riskState: AdminStudentRiskState;
  riskTimeline: unknown[];
  scorePercentile: number | null;
  status: AdminStudentStatus;
  studentId: string;
  testHistory: unknown[];
  testsAttempted: number;
  timeMisallocationPercent: number;
  topicWeaknessSummary: string;
}

export interface AdminStudentsSnapshot {
  academicYear: string;
  computedAt: string;
  students: AdminStudentRecord[];
}

export interface AdminStudentsSuccessResponse {
  code: "OK";
  data: AdminStudentsSnapshot;
  message: string;
  requestId: string;
  students: AdminStudentRecord[];
  success: true;
  timestamp: string;
}

export class AdminStudentsValidationError extends Error {
  constructor(
    public readonly code: StandardApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AdminStudentsValidationError";
  }
}
