export interface NotificationQueueGenerationContext {
  eventId?: string;
  instituteId: string;
  runId: string;
  sessionId: string;
  yearId: string;
}

export type NotificationTemplateType =
  "discipline_violation_notification" |
  "exceptional_performance_recognition" |
  "high_risk_student_alert";

export interface NotificationQueueGenerationResult {
  idempotent: boolean;
  jobPaths: string[];
  reason?:
    "already_processed" |
    "missing_recipient_email" |
    "missing_student_document" |
    "no_rules_triggered" |
    "status_not_transitioned";
  triggered: boolean;
}
