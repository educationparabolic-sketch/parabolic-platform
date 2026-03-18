import {randomUUID} from "crypto";
import * as functions from "firebase-functions";
import {LogContext, LogLevel, StructuredLogEntry} from "../types/logging";

const REDACTED_VALUE = "[REDACTED]";

const SENSITIVE_KEY_PATTERN = new RegExp(
  "answer|api[-_]?key|auth|authorization|cookie|" +
  "credential|password|secret|token",
  "i",
);

const MAX_LOG_DEPTH = 6;

const PRODUCTION_ENVIRONMENT = "production";

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof Error) &&
  !(value instanceof Date);

const getRuntimeEnvironment = (): string =>
  process.env.NODE_ENV?.trim() || "development";

const getRuntimeVersion = (): string =>
  process.env.K_REVISION?.trim() ||
  process.env.FUNCTIONS_VERSION?.trim() ||
  process.env.npm_package_version?.trim() ||
  "unknown";

const sanitizeValue = (value: unknown, depth = 0): unknown => {
  if (depth >= MAX_LOG_DEPTH) {
    return "[MAX_DEPTH_REACHED]";
  }

  if (value === undefined || value === null) {
    return value;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return {
      message: value.message,
      name: value.name,
      stack: value.stack,
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, depth + 1));
  }

  if (isPlainObject(value)) {
    const sanitizedEntries = Object.entries(value).map(([key, nestedValue]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key) ?
        REDACTED_VALUE :
        sanitizeValue(nestedValue, depth + 1),
    ]);

    return Object.fromEntries(sanitizedEntries);
  }

  return String(value);
};

const emitLog = (entry: StructuredLogEntry): void => {
  switch (entry.level) {
  case "DEBUG":
    if (entry.environment === PRODUCTION_ENVIRONMENT) {
      return;
    }
    functions.logger.debug(entry.message, entry);
    return;
  case "INFO":
    functions.logger.info(entry.message, entry);
    return;
  case "WARNING":
    functions.logger.warn(entry.message, entry);
    return;
  case "ERROR":
  case "CRITICAL":
    functions.logger.error(entry.message, entry);
    return;
  default: {
    const exhaustiveLevel: never = entry.level;
    throw new Error(`Unsupported log level: ${exhaustiveLevel}`);
  }
  }
};

const buildLogEntry = (
  level: LogLevel,
  message: string,
  context: LogContext,
): StructuredLogEntry => {
  const runtimeEnvironment = context.environment ?? getRuntimeEnvironment();
  const runtimeVersion = context.version ?? getRuntimeVersion();
  const requestId = context.requestId ?? randomUUID();

  return {
    ...sanitizeValue({
      ...context,
      environment: runtimeEnvironment,
      requestId,
      service: context.service ?? "unknown-service",
      version: runtimeVersion,
    }) as LogContext,
    level,
    message,
    timestamp: new Date().toISOString(),
  };
};

const normalizeRequestHeaderValue = (
  headerValue: string | string[] | undefined,
): string | undefined => {
  if (Array.isArray(headerValue)) {
    return headerValue[0];
  }

  return headerValue;
};

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
      ...context,
      requestId: context.requestId ?? randomUUID(),
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
      ...this.baseContext,
      ...context,
      requestId: context.requestId ?? this.baseContext.requestId,
    });
  }

  /**
   * Returns the request identifier attached to this logger instance.
   * @return {string} The request identifier used for traceability.
   */
  public getRequestId(): string {
    return this.baseContext.requestId ?? randomUUID();
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
    emitLog(buildLogEntry("ERROR", message, this.mergeContext(context)));
  }

  /**
   * Writes a high-severity integrity-risk log entry.
   * @param {string} message The log message.
   * @param {LogContext} context Additional metadata for this log entry.
   */
  public critical(message: string, context: LogContext = {}): void {
    emitLog(buildLogEntry("CRITICAL", message, this.mergeContext(context)));
  }

  /**
   * Merges per-call metadata into the logger's base context.
   * @param {LogContext} context Per-call metadata to merge.
   * @return {LogContext} The merged logging context.
   */
  private mergeContext(context: LogContext): LogContext {
    return {
      ...this.baseContext,
      ...context,
      requestId: context.requestId ?? this.baseContext.requestId,
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
  const requestId =
    normalizeRequestHeaderValue(request.header("x-request-id")) ||
    normalizeRequestHeaderValue(request.header("x-correlation-id")) ||
    randomUUID();

  return createLogger(service, {
    ...context,
    request: {
      ip: request.ip,
      method: request.method,
      path: request.path,
      userAgent: request.get("user-agent"),
    },
    requestId,
  });
};
