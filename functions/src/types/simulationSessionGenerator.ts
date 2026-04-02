import {RuntimeEnvironment} from "./environment";
import {
  SessionExecutionMode,
  SessionQuestionTimeMap,
  SessionTimingProfileSnapshot,
} from "./sessionStart";
import {SubmissionRiskState} from "./submission";

export interface GenerateSyntheticSessionsInput {
  nodeEnv: RuntimeEnvironment;
  simulationId: string;
  yearId: string;
}

export interface SyntheticAnswerRecord {
  clientTimestamp: number;
  selectedOption: string;
  timeSpent: number;
}

export interface SyntheticSessionDocument {
  accuracyPercent: number;
  answerMap: Record<string, SyntheticAnswerRecord>;
  consecutiveWrongStreakMax: number;
  createdAt: FirebaseFirestore.Timestamp;
  disciplineIndex: number;
  easyRemainingAfterPhase1Percent: number;
  guessRate: number;
  hardInPhase1Percent: number;
  instituteId: string;
  maxTimeViolationPercent: number;
  minTimeViolationPercent: number;
  mode: SessionExecutionMode;
  phaseAdherencePercent: number;
  questionTimeMap: SessionQuestionTimeMap;
  rawScorePercent: number;
  riskState: SubmissionRiskState;
  runId: string;
  sessionId: string;
  skipBurstCount: number;
  startedAt: FirebaseFirestore.Timestamp;
  status: "submitted";
  studentId: string;
  studentUid: string;
  submissionLock: false;
  submittedAt: FirebaseFirestore.Timestamp;
  timingProfileSnapshot: SessionTimingProfileSnapshot;
  updatedAt: FirebaseFirestore.Timestamp;
  version: 1;
  yearId: string;
}

export interface GenerateSyntheticSessionsResult {
  existingRunCount: number;
  existingSessionCount: number;
  generatedRunCount: number;
  generatedSessionCount: number;
  instituteId: string;
  runCount: number;
  sessionsRootPath: string;
  simulationId: string;
  simulationVersion: string;
  totalStudentCount: number;
  yearId: string;
}

export interface GenerateSyntheticSessionsSuccessResponse {
  code: "OK";
  data: GenerateSyntheticSessionsResult;
  message: string;
  requestId: string;
  success: true;
  timestamp: string;
}
