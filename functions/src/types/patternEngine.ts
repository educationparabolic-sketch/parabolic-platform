export interface PatternEngineContext {
  eventId?: string;
  instituteId: string;
  studentId: string;
  yearId: string;
}

export type PatternSeverity = "Moderate" | "High";
export type WrongStreakSeverity = "Moderate" | "Critical";
export type PatternEscalationLevel = "Moderate" | "High" | "Critical";

export interface PatternEngineResult {
  idempotent: boolean;
  reason?:
    "already_processed" |
    "deleted" |
    "missing_upstream_marker" |
    "missing_session_summary";
  studentYearMetricsPath: string;
  triggered: boolean;
}
