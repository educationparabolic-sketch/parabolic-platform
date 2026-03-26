export interface InsightEngineContext {
  eventId?: string;
  instituteId: string;
  runId: string;
  sessionId: string;
  yearId: string;
}

export type InsightSnapshotType = "student" | "run" | "batch";

export interface InsightEngineResult {
  idempotent: boolean;
  reason?:
    "already_processed" |
    "missing_run_analytics" |
    "missing_student_metrics" |
    "status_not_transitioned";
  snapshotPaths: string[];
  triggered: boolean;
}
