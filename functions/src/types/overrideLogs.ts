export type OverrideType =
  | "MIN_TIME_BYPASS"
  | "FORCE_SUBMIT"
  | "MODE_CHANGE"
  | "EMERGENCY_ADJUSTMENT";

export interface OverrideLogEntryInput {
  overrideId?: string;
  instituteId: string;
  runId: string;
  studentId: string;
  sessionId: string;
  overrideType: OverrideType;
  justification: string;
  performedBy: string;
}

export interface OverrideLogEntry {
  overrideId: string;
  instituteId: string;
  runId: string;
  studentId: string;
  sessionId: string;
  overrideType: OverrideType;
  justification: string;
  performedBy: string;
  timestamp: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
}

export interface OverrideLogWriteResult {
  overrideId: string;
  instituteId: string;
  path: string;
}
