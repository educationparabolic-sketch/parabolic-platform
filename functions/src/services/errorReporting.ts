import * as functions from "firebase-functions";
import {
  ErrorReportingContext,
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

import {
  discloseDiagnostics, mergeDiagnosticContexts, runtimeEnvironment, runtimeVersion,
  safeDiagnosticMessage, safeRequestId, safeRuntimeError, safeService,
} from "./diagnosticDisclosure";

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
      ...mergeDiagnosticContexts(context),
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
        ...mergeDiagnosticContexts(this.baseContext, context),
        service: String(mergeDiagnosticContexts(context).service ?? this.baseContext.service),
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
    const normalizedError = safeRuntimeError(error);
    const service = safeService(mergedContext.service);
    const version = runtimeVersion();
    const message = `${safeDiagnosticMessage(mergedContext.message, normalizedError.message).slice(0, 400)}\n` +
      `${normalizedError.stack.slice(0, 1400)}\nrequestId: ${mergedContext.requestId}`;
    const metadata = {
      ...discloseDiagnostics(mergedContext),
      "errorName": normalizedError.name,
      "errorMessage": normalizedError.message,
      "stack": normalizedError.stack,
      "serviceContext": {service, version},
      "@type": ERROR_REPORT_EVENT_TYPE,
    };
    functions.logger.write({...metadata, severity: mergedContext.severity ?? "ERROR", message});

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
    const merged = mergeDiagnosticContexts(this.baseContext, context);
    return {
      ...merged,
      requestId: safeRequestId(merged.requestId),
      environment: runtimeEnvironment(),
      service: safeService(merged.service ?? DEFAULT_SERVICE_NAME),
      severity: merged.severity === "CRITICAL" ? "CRITICAL" : "ERROR",
      version: runtimeVersion(),
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
  const service = String(mergeDiagnosticContexts(context).service ?? DEFAULT_SERVICE_NAME);
  return createErrorReporter(service, context).report(error, context);
};

const getUnhandledErrorContext = (
  service: string,
  operation: string,
  severity: ErrorReportingContext["severity"],
): ErrorReportingContext => ({
  environment: runtimeEnvironment(),
  handled: false,
  operation,
  service,
  severity,
  version: runtimeVersion(),
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
