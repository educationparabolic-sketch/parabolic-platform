import { getFirebaseAuth } from "./firebaseClient";
import type {
  FrontendApiFailureEventInput,
  FrontendApiTimingEventInput,
  FrontendClientCrashEventInput,
  FrontendMonitoringInitializationOptions,
  FrontendMonitoringSnapshot,
  FrontendPortalId,
  FrontendTelemetryEvent,
  FrontendTelemetryEventType,
  FrontendTelemetrySeverity,
} from "../types/frontendMonitoring";

const TELEMETRY_STORAGE_KEY = "parabolic.frontendTelemetry.events";
const TELEMETRY_SESSION_KEY = "parabolic.frontendTelemetry.session";
const MAX_RECENT_CRITICAL_EVENTS = 12;

let telemetryInitialized = false;
let activePortal: FrontendPortalId | "unknown" = "unknown";
let eventCounter = 0;
let inMemoryEvents: FrontendTelemetryEvent[] = [];

function canUseDomApis(): boolean {
  return typeof window !== "undefined";
}

function readFromStorage(): FrontendTelemetryEvent[] {
  if (!canUseDomApis()) {
    return inMemoryEvents;
  }

  try {
    const raw = window.localStorage.getItem(TELEMETRY_STORAGE_KEY);
    if (!raw) {
      return inMemoryEvents;
    }

    const parsed = JSON.parse(raw) as FrontendTelemetryEvent[];
    if (!Array.isArray(parsed)) {
      return inMemoryEvents;
    }

    return parsed;
  } catch {
    return inMemoryEvents;
  }
}

function writeToStorage(events: FrontendTelemetryEvent[]): void {
  inMemoryEvents = events;

  if (!canUseDomApis()) {
    return;
  }

  try {
    window.localStorage.setItem(TELEMETRY_STORAGE_KEY, JSON.stringify(events));
  } catch {
    // Keep in-memory fallback if localStorage quota is exceeded.
  }
}

function resolveSessionIdentifier(): string {
  if (!canUseDomApis()) {
    return "session-serverless";
  }

  try {
    const existing = window.sessionStorage.getItem(TELEMETRY_SESSION_KEY);
    if (existing && existing.trim().length > 0) {
      return existing;
    }
  } catch {
    // Continue with fallback generation.
  }

  const generated =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ?
      crypto.randomUUID() :
      `frontend-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;

  try {
    window.sessionStorage.setItem(TELEMETRY_SESSION_KEY, generated);
  } catch {
    // Best effort only.
  }

  return generated;
}

function resolveActorId(): string {
  try {
    const auth = getFirebaseAuth();
    return auth.currentUser?.uid ?? "anonymous";
  } catch {
    return "anonymous";
  }
}

function isCriticalMonitoringEvent(eventType: FrontendTelemetryEventType): boolean {
  return eventType === "runtime_exception" || eventType === "unhandled_rejection" || eventType === "client_crash";
}

function toSeverityFromStatus(status: number): FrontendTelemetrySeverity {
  if (status >= 500 || status === 0) {
    return "critical";
  }
  if (status >= 400) {
    return "error";
  }
  return "warning";
}

function appendTelemetryEvent(
  eventType: FrontendTelemetryEventType,
  severity: FrontendTelemetrySeverity,
  payload: Omit<FrontendTelemetryEvent, "eventId" | "eventType" | "severity" | "timestamp" | "portal" | "sessionIdentifier" | "actorId">,
): FrontendTelemetryEvent {
  const sessionIdentifier = resolveSessionIdentifier();
  const actorId = resolveActorId();
  const timestamp = new Date().toISOString();
  eventCounter += 1;

  const event: FrontendTelemetryEvent = {
    eventId: `${timestamp}-${eventCounter}`,
    eventType,
    severity,
    portal: activePortal,
    timestamp,
    sessionIdentifier,
    actorId,
    ...payload,
  };

  if (isCriticalMonitoringEvent(eventType)) {
    event.audit = {
      persistencePath: `auditLogs/${event.eventId}`,
      appendOnly: true,
      actorId,
      recordedAt: timestamp,
    };
  }

  const events = readFromStorage();
  writeToStorage([...events, event]);
  return event;
}

function toErrorMetadata(reason: unknown): { name?: string; message: string; stack?: string } {
  if (reason instanceof Error) {
    return {
      name: reason.name,
      message: reason.message || "Unknown runtime error.",
      stack: reason.stack,
    };
  }

  if (typeof reason === "string") {
    return {
      message: reason,
    };
  }

  return {
    message: "Unknown runtime error payload.",
  };
}

function captureNavigationTiming(): void {
  if (!canUseDomApis() || typeof performance === "undefined") {
    return;
  }

  const navigationEntry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  if (!navigationEntry) {
    return;
  }

  appendTelemetryEvent("navigation_timing", "info", {
    performance: {
      domInteractiveMs: Math.round(navigationEntry.domInteractive),
      domContentLoadedMs: Math.round(navigationEntry.domContentLoadedEventEnd),
      loadEventMs: Math.round(navigationEntry.loadEventEnd),
      transferSizeBytes: Math.round(navigationEntry.transferSize),
    },
  });
}

export function initializeFrontendMonitoring(options: FrontendMonitoringInitializationOptions): void {
  activePortal = options.portal;

  if (!canUseDomApis()) {
    return;
  }

  if (telemetryInitialized) {
    return;
  }

  telemetryInitialized = true;
  captureNavigationTiming();

  window.addEventListener("error", (event) => {
    const errorMetadata = toErrorMetadata(event.error ?? event.message);
    appendTelemetryEvent("runtime_exception", "critical", {
      error: errorMetadata,
      request: {
        path: window.location.pathname,
        url: window.location.href,
      },
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const errorMetadata = toErrorMetadata(event.reason);
    appendTelemetryEvent("unhandled_rejection", "critical", {
      error: errorMetadata,
      request: {
        path: window.location.pathname,
        url: window.location.href,
      },
    });
  });
}

export function captureFrontendApiFailure(input: FrontendApiFailureEventInput): void {
  appendTelemetryEvent("api_failure", toSeverityFromStatus(input.status), {
    error: {
      name: input.code,
      message: input.message,
    },
    request: {
      method: input.method,
      path: input.path,
      url: input.url,
      status: input.status,
      attempt: input.attempt,
      durationMs: input.durationMs,
    },
  });
}

export function captureFrontendApiTiming(input: FrontendApiTimingEventInput): void {
  appendTelemetryEvent("api_request_timing", "info", {
    request: {
      method: input.method,
      path: input.path,
      url: input.url,
      status: input.status,
      attempt: input.attempt,
      durationMs: input.durationMs,
    },
    performance: {
      requestDurationMs: input.durationMs,
    },
  });
}

export function captureFrontendClientCrash(input: FrontendClientCrashEventInput): FrontendTelemetryEvent {
  const path = input.path ?? (canUseDomApis() ? window.location.pathname : undefined);
  const url = input.url ?? (canUseDomApis() ? window.location.href : undefined);
  const stack =
    input.componentStack && input.componentStack.trim().length > 0 ?
      `${input.stack ?? ""}\nComponent stack:${input.componentStack}`.trim() :
      input.stack;

  return appendTelemetryEvent("client_crash", "critical", {
    error: {
      name: input.name,
      message: input.message,
      stack,
    },
    request: {
      path,
      url,
    },
  });
}

export function getFrontendMonitoringSnapshot(): FrontendMonitoringSnapshot {
  const events = readFromStorage();
  const runtimeExceptionCount = events.filter((event) =>
    event.eventType === "runtime_exception" || event.eventType === "unhandled_rejection" || event.eventType === "client_crash"
  ).length;
  const failedApiCallCount = events.filter((event) => event.eventType === "api_failure").length;
  const timingEvents = events.filter((event) => event.eventType === "api_request_timing");
  const averageApiLatencyMs =
    timingEvents.length === 0 ?
      0 :
      Math.round(
        timingEvents.reduce((sum, event) => sum + (event.request?.durationMs ?? 0), 0) / timingEvents.length,
      );

  const recentCriticalEvents = events
    .filter((event) => event.severity === "critical" || event.severity === "error")
    .slice(-MAX_RECENT_CRITICAL_EVENTS)
    .reverse();

  return {
    sessionIdentifier: resolveSessionIdentifier(),
    capturedAt: new Date().toISOString(),
    runtimeExceptionCount,
    failedApiCallCount,
    averageApiLatencyMs,
    recentCriticalEvents,
  };
}
