export type FrontendPortalId = "admin" | "student" | "vendor" | "exam";

export type FrontendTelemetryEventType =
  | "runtime_exception"
  | "unhandled_rejection"
  | "api_failure"
  | "api_request_timing"
  | "navigation_timing"
  | "client_crash";

export type FrontendTelemetrySeverity = "info" | "warning" | "error" | "critical";

export interface FrontendTelemetryRequestMetadata {
  method?: string;
  path?: string;
  url?: string;
  status?: number;
  attempt?: number;
  durationMs?: number;
}

export interface FrontendTelemetryErrorMetadata {
  name?: string;
  message: string;
  stack?: string;
}

export interface FrontendTelemetryAuditRecord {
  persistencePath: string;
  appendOnly: true;
  actorId: string;
  recordedAt: string;
}

export interface FrontendTelemetryEvent {
  eventId: string;
  eventType: FrontendTelemetryEventType;
  severity: FrontendTelemetrySeverity;
  portal: FrontendPortalId | "unknown";
  timestamp: string;
  sessionIdentifier: string;
  actorId: string;
  request?: FrontendTelemetryRequestMetadata;
  error?: FrontendTelemetryErrorMetadata;
  performance?: Record<string, number>;
  audit?: FrontendTelemetryAuditRecord;
}

export interface FrontendMonitoringSnapshot {
  sessionIdentifier: string;
  capturedAt: string;
  runtimeExceptionCount: number;
  failedApiCallCount: number;
  averageApiLatencyMs: number;
  recentCriticalEvents: FrontendTelemetryEvent[];
}

export interface FrontendMonitoringInitializationOptions {
  portal: FrontendPortalId;
}

export interface FrontendApiFailureEventInput {
  method: string;
  path: string;
  url: string;
  status: number;
  attempt: number;
  durationMs: number;
  code: string;
  message: string;
}

export interface FrontendApiTimingEventInput {
  method: string;
  path: string;
  url: string;
  status: number;
  attempt: number;
  durationMs: number;
}

export interface FrontendClientCrashEventInput {
  message: string;
  name?: string;
  stack?: string;
  componentStack?: string;
  path?: string;
  url?: string;
}
