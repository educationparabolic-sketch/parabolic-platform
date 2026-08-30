import {ExamOperationalDataAccessPolicy} from "./dataTierPartition";
import type {
  ExamRuntimeSnapshot,
  StudentExamLaunchDisposition,
  StudentExamLaunchIntent,
  StudentExamSessionStatus,
} from "../../../shared/contracts/apiDtos";

export type {
  StudentExamLaunchDisposition,
  StudentExamLaunchIntent,
  StudentExamSessionStatus,
} from "../../../shared/contracts/apiDtos";

export type SessionStatus =
  "created" |
  "started" |
  "active" |
  "submitted" |
  "expired" |
  "terminated";

export type SessionStartErrorCode =
  "CONFLICT" |
  "FORBIDDEN" |
  "LICENSE_RESTRICTED" |
  "NOT_FOUND" |
  "SESSION_LOCKED" |
  "TENANT_MISMATCH" |
  "UNAUTHORIZED" |
  "VALIDATION_ERROR" |
  "WINDOW_CLOSED";

export interface SessionStartContext {
  instituteId: string;
  intent: StudentExamLaunchIntent;
  licenseLayer: "L0" | "L1" | "L2" | "L3";
  runId: string;
  studentId: string;
  studentUid: string;
}

export interface SessionTokenClaims {
  instituteId: string;
  launchNonce: string;
  licenseLayer: "L0" | "L1" | "L2" | "L3";
  role: "student";
  runId: string;
  sessionId: string;
  studentId: string;
  yearId: string;
}

export interface SessionDocumentInitializationContext {
  calibrationVersion: string;
  consumedLaunchCredentialHashes: string[];
  instituteId: string;
  licenseSnapshot: Record<string, unknown>;
  launchCredentialHashes: string[];
  mode: SessionExecutionMode;
  phaseConfigSnapshot: Record<string, unknown>;
  questionTimeMap: SessionQuestionTimeMap;
  riskModelVersion: string;
  runtimeSnapshot: ExamRuntimeSnapshot;
  runId: string;
  sessionId: string;
  sessionTokenHash: string;
  studentId: string;
  studentUid: string;
  templateSnapshot: Record<string, unknown>;
  templateVersion: string;
  timingProfileSnapshot: SessionTimingProfileSnapshot;
  yearId: string;
}

export interface SessionTimingWindow {
  max: number;
  min: number;
  recommended?: number;
}

export interface SessionTimingProfileSnapshot {
  easy: SessionTimingWindow;
  hard: SessionTimingWindow;
  medium: SessionTimingWindow;
}

export type SessionExecutionMode =
  "Operational" |
  "Diagnostic" |
  "Controlled" |
  "Hard";

export interface SessionQuestionTimeRecord {
  bufferTimeSpent?: number;
  cumulativeTimeSpent: number;
  enteredAt: number | null;
  exitedAt: number | null;
  lastEntryTimestamp: number | null;
  maxTime: number;
  minTime: number;
  phase1TimeSpent?: number;
  phase2TimeSpent?: number;
  phase3TimeSpent?: number;
  phaseTimingRules?: {
    buffer: SessionTimingWindow;
    phase1: SessionTimingWindow;
    phase2: SessionTimingWindow;
    phase3: SessionTimingWindow;
  };
  recommendedTime?: number;
}

export type SessionQuestionTimeMap = Record<string, SessionQuestionTimeRecord>;

export interface SessionDocumentInitializationRecord {
  answerMap: Record<string, unknown>;
  calibrationVersion: string;
  consumedLaunchCredentialHashes: string[];
  createdAt: FirebaseFirestore.FieldValue;
  deadlineAt: null;
  instituteId: string;
  licenseSnapshot: Record<string, unknown>;
  launchCredentialHashes: string[];
  mode: SessionExecutionMode;
  operationalDataAccessPolicy: ExamOperationalDataAccessPolicy;
  phaseConfigSnapshot: Record<string, unknown>;
  questionTimeMap: SessionQuestionTimeMap;
  riskModelVersion: string;
  runtimeSnapshot: ExamRuntimeSnapshot;
  runId: string;
  sessionId: string;
  sessionTokenHash: string;
  startedAt: null;
  status: "created";
  studentId: string;
  studentUid: string;
  submissionLock: false;
  submittedAt: null;
  templateSnapshot: Record<string, unknown>;
  templateVersion: string;
  timingProfileSnapshot: SessionTimingProfileSnapshot;
  updatedAt: FirebaseFirestore.FieldValue;
  version: 1;
  yearId: string;
}

export interface SessionStartResult {
  disposition: StudentExamLaunchDisposition;
  launchCredential: string;
  operationalDataAccessPolicy: ExamOperationalDataAccessPolicy;
  sessionId: string;
  sessionPath: string;
  status: StudentExamSessionStatus;
  yearId: string;
}

export interface SessionEntryValidationContext {
  instituteId: string;
  launchNonce: string;
  licenseLayer: "L0" | "L1" | "L2" | "L3";
  runId: string;
  sessionId: string;
  sessionToken: string;
  studentId: string;
  studentUid: string;
  yearId: string;
}

export interface SessionEntryValidationResult {
  deadlineAt: string | null;
  instituteId: string;
  licenseSnapshot: Record<string, unknown>;
  mode: SessionExecutionMode;
  operationalDataAccessPolicy: ExamOperationalDataAccessPolicy;
  phaseConfigSnapshot: Record<string, unknown>;
  runId: string;
  runtimeSnapshot: ExamRuntimeSnapshot;
  serverTime: string;
  sessionId: string;
  sessionPath: string;
  startedAt: string | null;
  status: SessionStatus;
  studentId: string;
  templateSnapshot: Record<string, unknown>;
  timingProfileSnapshot: SessionTimingProfileSnapshot;
  yearId: string;
}

export interface SessionEntryResumeContext extends SessionActivationContext {
  licenseLayer: "L0" | "L1" | "L2" | "L3";
}

export interface SessionActivationContext {
  instituteId: string;
  runId: string;
  sessionId: string;
  studentId: string;
  studentUid: string;
  yearId: string;
}

export interface SessionActivationResult {
  deadlineAt: string;
  replayed: boolean;
  serverTime: string;
  sessionId: string;
  sessionPath: string;
  startedAt: string | null;
  status: "active" | "expired";
}

export type SessionTransitionActorType =
  "student" |
  "backend" |
  "system";

export interface SessionStateTransitionContext {
  actorType: SessionTransitionActorType;
  instituteId: string;
  runId: string;
  sessionId: string;
  yearId: string;
}

export interface SessionStateTransitionResult {
  fromStatus: SessionStatus;
  sessionPath: string;
  sessionId: string;
  status: SessionStatus;
}

export interface SessionWriteBatchingPolicy {
  maxPendingAnswers: number;
  minimumWriteIntervalMs: number;
}

export type SessionWriteBatchingReason =
  "MAX_PENDING_ANSWERS_REACHED" |
  "WRITE_INTERVAL_ELAPSED";

export interface SessionWriteBatchingEvaluationInput {
  millisecondsSinceLastWrite: number;
  pendingAnswersCount: number;
}

export interface SessionWriteBatchingEvaluationResult {
  policy: SessionWriteBatchingPolicy;
  reasons: SessionWriteBatchingReason[];
  shouldWrite: boolean;
}
