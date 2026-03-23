export interface RunAnalyticsInitializationContext {
  instituteId: string;
  runId: string;
  yearId: string;
}

export interface RunAnalyticsInitializationResult {
  runAnalyticsPath: string;
  wasCreated: boolean;
}
