export type SystemEventDomain =
  | "content"
  | "template"
  | "assignment"
  | "sessionExecution"
  | "postSubmission"
  | "vendorIntelligence"
  | "archiveLifecycle";

export type SystemEventExecutionMode =
  | "synchronous"
  | "asynchronous"
  | "scheduled";

export type SystemEventSourceKind =
  | "firestore.onCreate"
  | "firestore.onUpdate"
  | "firestore.onWrite"
  | "https.onRequest"
  | "scheduled";

export type SystemEventName =
  | "QuestionCreated"
  | "TemplateCreated"
  | "AssignmentCreated"
  | "SessionStarted"
  | "AnswerBatchReceived"
  | "SessionSubmitted"
  | "AnalyticsGenerated"
  | "InsightsGenerated"
  | "VendorAggregatesUpdated"
  | "BillingMeterUpdated"
  | "StudentYearMetricsUpdated"
  | "BillingWebhookReceived"
  | "UsageUpdated"
  | "GovernanceSnapshotScheduled"
  | "ArchiveTriggered";

export interface SystemEventDefinition {
  description: string;
  domain: SystemEventDomain;
  downstreamEvents: readonly SystemEventName[];
  executionMode: SystemEventExecutionMode;
  name: SystemEventName;
  primaryHandler: string;
  source: string;
  sourceKind: SystemEventSourceKind;
}

export interface SystemEventDispatchContext {
  eventId?: string;
  instituteId?: string;
  requestId?: string;
  runId?: string;
  sessionId?: string;
  sourcePath?: string;
  studentId?: string;
  testId?: string;
  yearId?: string;
}
