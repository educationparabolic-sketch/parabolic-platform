import {RequestLogMetadata} from "./logging";

export type RuntimeErrorSeverity = "ERROR" | "CRITICAL";

export interface ErrorReportingContext {
  environment?: string;
  featureFlags?: string[];
  handled?: boolean;
  message?: string;
  operation?: string;
  request?: RequestLogMetadata;
  requestId?: string;
  service?: string;
  severity?: RuntimeErrorSeverity;
  version?: string;
  [key: string]: unknown;
}

export interface NormalizedRuntimeError {
  message: string;
  name: string;
  stack?: string;
}

export interface RuntimeErrorReport {
  error: NormalizedRuntimeError;
  eventType: string;
  message: string;
  metadata: Record<string, unknown>;
  serviceContext: {
    service: string;
    version: string;
  };
}
