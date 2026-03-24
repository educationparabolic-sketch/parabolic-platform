export type SessionStatus =
  "created" |
  "started" |
  "active" |
  "submitted" |
  "expired" |
  "terminated";

export type SessionStartErrorCode =
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
  runId: string;
  studentId: string;
  studentUid: string;
  yearId: string;
}

export interface SessionTokenClaims {
  instituteId: string;
  role: "student";
  runId: string;
  sessionId: string;
  studentId: string;
  yearId: string;
}

export interface SessionStartResult {
  sessionId: string;
  sessionPath: string;
  sessionToken: string;
  status: SessionStatus;
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
