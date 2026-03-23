export interface TemplateAnalyticsInitializationContext {
  instituteId: string;
  testId: string;
}

export interface TemplateAnalyticsInitializationResult {
  templateAnalyticsPath: string;
  wasCreated: boolean;
  yearId: string;
}
