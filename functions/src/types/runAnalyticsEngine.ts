export interface RunAnalyticsEngineContext {
  eventId?: string;
  instituteId: string;
  runId: string;
  sessionId: string;
  yearId: string;
}

export interface RunAnalyticsEngineResult {
  idempotent: boolean;
  reason?: "already_processed" | "status_not_transitioned";
  runAnalyticsPath: string;
  triggered: boolean;
}
