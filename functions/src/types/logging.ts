export type LogLevel =
  | "DEBUG"
  | "INFO"
  | "WARNING"
  | "ERROR"
  | "CRITICAL";

export interface RequestLogMetadata {
  method?: string;
  path?: string;
  ip?: string;
  userAgent?: string;
}

export interface LogContext {
  environment?: string;
  featureFlags?: string[];
  instituteId?: string;
  request?: RequestLogMetadata;
  requestId?: string;
  runId?: string;
  service?: string;
  tenantId?: string;
  userId?: string;
  version?: string;
  [key: string]: unknown;
}

export interface StructuredLogEntry extends LogContext {
  durationMs?: number;
  error?: unknown;
  level: LogLevel;
  message: string;
  timestamp: string;
}
