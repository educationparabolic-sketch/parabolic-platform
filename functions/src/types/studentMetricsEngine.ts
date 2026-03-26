export interface StudentMetricsEngineContext {
  eventId?: string;
  instituteId: string;
  runId: string;
  sessionId: string;
  yearId: string;
}

export interface StudentMetricsEngineResult {
  idempotent: boolean;
  reason?: "already_processed" | "status_not_transitioned";
  studentYearMetricsPath: string;
  triggered: boolean;
}
