import * as functions from "firebase-functions";
import {
  createErrorReporterContextFromLog,
  reportRuntimeError,
} from "./errorReporting";
import {LogContext, LogLevel, StructuredLogEntry} from "../types/logging";

import {
  discloseDiagnostics, mergeDiagnosticContexts, requestCorrelationId, runtimeEnvironment,
  runtimeVersion, safeDiagnosticMessage, safeRequestId, safeService,
} from "./diagnosticDisclosure";

const emitLog = (entry: StructuredLogEntry): void => {
  if (entry.level === "DEBUG" && entry.environment === "production") return;
  // write avoids the SDK error() helper creating a second, unsanitized stack/message.
  functions.logger.write({...entry, severity: entry.level});
};

const maybeReportRuntimeError = (level: LogLevel, message: string, context: LogContext): void => {
  if (context.error === undefined || (level !== "ERROR" && level !== "CRITICAL")) return;
  reportRuntimeError(context.error, createErrorReporterContextFromLog(context, level, message));
};

const buildLogEntry = (level: LogLevel, message: string, context: LogContext): StructuredLogEntry => ({
  ...discloseDiagnostics(context),
  environment: runtimeEnvironment(),
  version: runtimeVersion(),
  requestId: safeRequestId(context.requestId),
  service: safeService(context.service),
  level,
  message: safeDiagnosticMessage(message),
  timestamp: new Date().toISOString(),
});

/**
 * Emits structured Cloud Logging events for a single backend service.
 */
export class StructuredLogger {
  private readonly baseContext: LogContext;

  /**
   * Creates a logger instance bound to a service-level context.
   * @param {string} service The backend service name for emitted logs.
   * @param {LogContext} context Default metadata attached to each log entry.
   */
  constructor(service: string, context: LogContext = {}) {
    this.baseContext = {
      ...mergeDiagnosticContexts(context),
      requestId: safeRequestId(mergeDiagnosticContexts(context).requestId),
      service,
    };
  }

  /**
   * Creates a child logger that inherits the parent context.
   * @param {LogContext} context Additional metadata for the child logger.
   * @return {StructuredLogger} A logger with merged context.
   */
  public child(context: LogContext): StructuredLogger {
    return new StructuredLogger(this.baseContext.service ?? "unknown-service", {
      ...mergeDiagnosticContexts(this.baseContext, context),
      requestId: safeRequestId(mergeDiagnosticContexts(context).requestId ?? this.baseContext.requestId),
    });
  }

  /**
   * Returns the request identifier attached to this logger instance.
   * @return {string} The request identifier used for traceability.
   */
  public getRequestId(): string {
    return this.baseContext.requestId as string;
  }

  /**
   * Writes a development-only diagnostic log entry.
   * @param {string} message The log message.
   * @param {LogContext} context Additional metadata for this log entry.
   */
  public debug(message: string, context: LogContext = {}): void {
    emitLog(buildLogEntry("DEBUG", message, this.mergeContext(context)));
  }

  /**
   * Writes a standard informational log entry.
   * @param {string} message The log message.
   * @param {LogContext} context Additional metadata for this log entry.
   */
  public info(message: string, context: LogContext = {}): void {
    emitLog(buildLogEntry("INFO", message, this.mergeContext(context)));
  }

  /**
   * Writes a recoverable warning log entry.
   * @param {string} message The log message.
   * @param {LogContext} context Additional metadata for this log entry.
   */
  public warn(message: string, context: LogContext = {}): void {
    emitLog(buildLogEntry("WARNING", message, this.mergeContext(context)));
  }

  /**
   * Writes a failed-operation log entry.
   * @param {string} message The log message.
   * @param {LogContext} context Additional metadata for this log entry.
   */
  public error(message: string, context: LogContext = {}): void {
    const merged = this.mergeContext(context);
    maybeReportRuntimeError("ERROR", message, merged);
    emitLog(buildLogEntry("ERROR", message, merged));
  }

  /**
   * Writes a high-severity integrity-risk log entry.
   * @param {string} message The log message.
   * @param {LogContext} context Additional metadata for this log entry.
   */
  public critical(message: string, context: LogContext = {}): void {
    const merged = this.mergeContext(context);
    maybeReportRuntimeError("CRITICAL", message, merged);
    emitLog(buildLogEntry("CRITICAL", message, merged));
  }

  /**
   * Merges per-call metadata into the logger's base context.
   * @param {LogContext} context Per-call metadata to merge.
   * @return {LogContext} The merged logging context.
   */
  private mergeContext(context: LogContext): LogContext {
    return {
      ...mergeDiagnosticContexts(this.baseContext, context),
      requestId: safeRequestId(mergeDiagnosticContexts(context).requestId ?? this.baseContext.requestId),
      service: this.baseContext.service,
    };
  }
}

export const createLogger = (
  service: string,
  context: LogContext = {},
): StructuredLogger => new StructuredLogger(service, context);

export const createRequestLogger = (
  service: string,
  request: functions.https.Request,
  context: LogContext = {},
): StructuredLogger => {
  const requestId = requestCorrelationId(request);
  return createLogger(service, {
    ...mergeDiagnosticContexts(context),
    request: {method: request.method},
    requestId,
  });
};
