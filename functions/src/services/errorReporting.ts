import * as functions from "firebase-functions";
import {
  ErrorReportingContext,
  NormalizedRuntimeError,
  RuntimeErrorReport,
} from "../types/errorReporting";
import {LogContext} from "../types/logging";

const ERROR_REPORT_EVENT_TYPE =
  "type.googleapis.com/" +
  "google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent";

const DEFAULT_SERVICE_NAME =
  process.env.K_SERVICE?.trim() ||
  process.env.FUNCTION_TARGET?.trim() ||
  "parabolic-platform-functions";

let globalHandlersRegistered = false;

const getRuntimeEnvironment = (): string =>
  process.env.NODE_ENV?.trim() || "development";

const getRuntimeVersion = (): string =>
  process.env.K_REVISION?.trim() ||
  process.env.FUNCTIONS_VERSION?.trim() ||
  process.env.npm_package_version?.trim() ||
  "unknown";

const toError = (error: unknown): Error => {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === "string") {
    return new Error(error);
  }

  try {
    return new Error(JSON.stringify(error));
  } catch {
    return new Error(String(error));
  }
};

const normalizeError = (error: unknown): NormalizedRuntimeError => {
  const normalizedError = toError(error);

  return {
    message: normalizedError.message,
    name: normalizedError.name,
    stack: normalizedError.stack,
  };
};

const buildReportedMessage = (
  normalizedError: NormalizedRuntimeError,
  context: ErrorReportingContext,
): string => {
  const baseMessage = context.message ||
    `${normalizedError.name}: ${normalizedError.message}`;
  const stack = normalizedError.stack || baseMessage;
  const requestIdLine = context.requestId ?
    `\nrequestId: ${context.requestId}` :
    "";

  return `${baseMessage}\n${stack}${requestIdLine}`;
};

const sanitizeContext = (
  context: ErrorReportingContext,
): Record<string, unknown> => {
  const metadata = {...context};

  if (metadata.featureFlags && !Array.isArray(metadata.featureFlags)) {
    metadata.featureFlags = [String(metadata.featureFlags)];
  }

  return metadata;
};

/**
 * Emits Cloud Error Reporting-compatible runtime failure events.
 */
export class RuntimeErrorReporter {
  private readonly baseContext: ErrorReportingContext;

  /**
   * Creates an error reporter bound to a backend service.
   * @param {string} service The service name attached to emitted reports.
   * @param {ErrorReportingContext} context Default metadata for reports.
   */
  constructor(service: string, context: ErrorReportingContext = {}) {
    this.baseContext = {
      ...context,
      service,
    };
  }

  /**
   * Creates a child reporter with inherited metadata.
   * @param {ErrorReportingContext} context Extra metadata for the child.
   * @return {RuntimeErrorReporter} A reporter with merged context.
   */
  public child(context: ErrorReportingContext): RuntimeErrorReporter {
    return new RuntimeErrorReporter(
      this.baseContext.service ?? DEFAULT_SERVICE_NAME,
      {
        ...this.baseContext,
        ...context,
        service: context.service ?? this.baseContext.service,
      },
    );
  }

  /**
   * Reports a runtime error with Cloud Error Reporting metadata.
   * @param {unknown} error The runtime failure to report.
   * @param {ErrorReportingContext} context Per-call report metadata.
   * @return {RuntimeErrorReport} The emitted error report payload.
   */
  public report(
    error: unknown,
    context: ErrorReportingContext = {},
  ): RuntimeErrorReport {
    const mergedContext = this.mergeContext(context);
    const normalizedError = normalizeError(error);
    const service = mergedContext.service ?? DEFAULT_SERVICE_NAME;
    const version = mergedContext.version ?? getRuntimeVersion();
    const message = buildReportedMessage(normalizedError, mergedContext);
    const metadata = {
      ...sanitizeContext(mergedContext),
      "errorName": normalizedError.name,
      "errorMessage": normalizedError.message,
      "stack": normalizedError.stack,
      "serviceContext": {
        service,
        version,
      },
      "@type": ERROR_REPORT_EVENT_TYPE,
    };

    functions.logger.error(message, metadata);

    return {
      error: normalizedError,
      eventType: ERROR_REPORT_EVENT_TYPE,
      message,
      metadata,
      serviceContext: {
        service,
        version,
      },
    };
  }

  /**
   * Resolves runtime defaults for a single report operation.
   * @param {ErrorReportingContext} context Per-call report metadata.
   * @return {ErrorReportingContext} Merged report context.
   */
  private mergeContext(context: ErrorReportingContext): ErrorReportingContext {
    return {
      ...this.baseContext,
      ...context,
      environment: context.environment ??
        this.baseContext.environment ??
        getRuntimeEnvironment(),
      service:
        context.service ??
        this.baseContext.service ??
        DEFAULT_SERVICE_NAME,
      version:
        context.version ??
        this.baseContext.version ??
        getRuntimeVersion(),
    };
  }
}

export const createErrorReporter = (
  service: string,
  context: ErrorReportingContext = {},
): RuntimeErrorReporter => new RuntimeErrorReporter(service, context);

export const reportRuntimeError = (
  error: unknown,
  context: ErrorReportingContext = {},
): RuntimeErrorReport => {
  const service = context.service ?? DEFAULT_SERVICE_NAME;
  return createErrorReporter(service, context).report(error, context);
};

const getUnhandledErrorContext = (
  service: string,
  operation: string,
  severity: ErrorReportingContext["severity"],
): ErrorReportingContext => ({
  environment: getRuntimeEnvironment(),
  handled: false,
  operation,
  service,
  severity,
  version: getRuntimeVersion(),
});

export const registerGlobalErrorHandlers = (): void => {
  if (globalHandlersRegistered) {
    return;
  }

  process.on("uncaughtException", (error: Error) => {
    reportRuntimeError(
      error,
      getUnhandledErrorContext(
        DEFAULT_SERVICE_NAME,
        "uncaughtException",
        "CRITICAL",
      ),
    );

    process.exitCode = 1;
  });

  process.on("unhandledRejection", (reason: unknown) => {
    reportRuntimeError(
      reason,
      getUnhandledErrorContext(
        DEFAULT_SERVICE_NAME,
        "unhandledRejection",
        "ERROR",
      ),
    );
  });

  globalHandlersRegistered = true;
};

export const createErrorReporterContextFromLog = (
  context: LogContext,
  severity: ErrorReportingContext["severity"],
  message: string,
): ErrorReportingContext => ({
  environment: context.environment,
  featureFlags: context.featureFlags,
  handled: true,
  message,
  request: context.request,
  requestId: context.requestId,
  service: context.service,
  severity,
  version: context.version,
});
