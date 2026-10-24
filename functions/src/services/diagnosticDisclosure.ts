import {createHash, randomUUID} from "node:crypto";
import {
  DISCLOSABLE_FRAME_FILES, DISCLOSABLE_MESSAGES, DISCLOSABLE_SERVICES, DISCLOSABLE_SYMBOLS,
} from "../policy/backendDisclosureCatalog";

export const WITHHELD = "[REDACTED]";
const sensitive = new RegExp("answer|api[-_]?key|auth|cookie|credential|password|secret|token|" +
  "proof|nonce|jpeg|base64|photo|image|url|header|body|claims|payload", "i");
const identifiers = new Set([
  "instituteId",
  "tenantId",
  "userId",
  "uid",
  "studentId",
  "yearId",
  "runId",
  "sessionId",
  "eventId",
  "jobId",
  "questionId",
  "templateId",
  "commandId",
]);
const metrics = new Set([
  "durationMs",
  "count",
  "total",
  "attempt",
  "attempts",
  "retryCount",
  "statusCode",
  "httpStatus",
  "limit",
  "processed",
  "failed",
  "succeeded",
  "skipped",
  "deleted",
  "expired",
  "retried",
  "queued",
  "completed",
  "pending",
  "revision",
  "versionNumber",
  "retryAfterSeconds",
]);
const enums = new Set([
  "code",
  "reason",
  "role",
  "status",
  "state",
  "licenseLayer",
  "level",
  "severity",
  "operation",
  "eventName",
  "handlerName",
  "executionMode",
  "sourceKind",
  "method",
  "availability",
]);
const containers = new Set(["error", "cause", "request", "metadata", "context", "details", "result", "failures"]);
const flags = new Set(["handled", "success", "isReplay", "wasUpdated", "shouldIncrementChapter"]);
const publicReasons = new Set([
  "owner_busy", "app_check_denied", "ownership_lost", "lease_expired", "ownership_upgrade_required", "session_closed",
  "entry_not_consumed", "invalid_owner", "invalid_ownership_request", "invalid_proctoring_request",
  "invalid_integrity_batch", "policy_upgrade_required", "policy_unsupported", "integrity_capacity_reached",
  "integrity_receipt_expired", "integrity_window_closed", "preflight_required", "policy_mismatch",
  "integrity_disabled", "integrity_batch_conflict", "integrity_rate_limited", "recovery_state_invalid",
  "recovery_unavailable",
]);
const errorNames = new Set([
  "Error",
  "TypeError",
  "RangeError",
  "SyntaxError",
  "ReferenceError",
  "URIError",
  "AggregateError",
]);
const scalar = (value: unknown): value is string => typeof value === "string" && value.length <= 2048;

export const safeDiagnosticMessage = (value: unknown, fallback = "Diagnostic data was withheld."): string =>
  scalar(value) && DISCLOSABLE_MESSAGES.has(value) ? value : fallback;

export const safeService = (value: unknown): string =>
  scalar(value) && DISCLOSABLE_SERVICES.has(value) ? value : "unknown-service";

// These fields come only from the process environment, never a per-call/request override.
export const runtimeEnvironment = (): string =>
  ["production", "test", "development", "staging"].includes(process.env.NODE_ENV ?? "") ?
    String(process.env.NODE_ENV) : "development";
export const runtimeVersion = (): string => {
  const value = process.env.K_REVISION || process.env.FUNCTIONS_VERSION || process.env.npm_package_version || "unknown";
  return `release:${createHash("sha256").update(value).digest("hex").slice(0, 16)}`;
};

export const safeRequestId = (value: unknown): string => {
  if (typeof value !== "string" || !/^[A-Za-z0-9._-]{1,128}$/u.test(value) ||
      sensitive.test(value) || /^(?:eyJ|AIza|sk[-_]|pk[-_])/u.test(value) ||
      /[A-Za-z0-9_-]{40,}/u.test(value) || value.split(".").length >= 3) return randomUUID();
  return value;
};

const requestIds = new WeakMap<object, string>();
export const requestCorrelationId = (request: {
  rawHeaders?: string[]; header: (name: string) => unknown;
}): string => {
  const previous = requestIds.get(request);
  if (previous) return previous;
  const names = ["x-request-id", "x-correlation-id"];
  const raw = request.rawHeaders;
  const supplied: unknown[] = [];
  if (Array.isArray(raw)) {
    for (let i = 0; i < raw.length; i += 2) if (names.includes(raw[i].toLowerCase())) supplied.push(raw[i + 1]);
  } else {
    for (const name of names) {
      const value = request.header(name);
      if (value !== undefined) supplied.push(value);
    }
  }
  const id = safeRequestId(supplied.length === 1 ? supplied[0] : undefined);
  requestIds.set(request, id);
  return id;
};

const own = (value: object, key: string): unknown => {
  try {
    return Object.getOwnPropertyDescriptor(value, key)?.value;
  } catch {
    return undefined;
  }
};

export const safeRuntimeError = (error: unknown): {message: string; name: string; stack: string} => {
  const rawName = error && typeof error === "object" ? own(error, "name") : undefined;
  const name = typeof rawName === "string" &&
    (errorNames.has(rawName) || DISCLOSABLE_SYMBOLS.has(rawName) && /Error$/u.test(rawName)) ? rawName : "Error";
  const rawMessage = typeof error === "string" ? error :
    error && typeof error === "object" ? own(error, "message") : undefined;
  const message = safeDiagnosticMessage(rawMessage, "Unexpected runtime failure.");
  const rawStack = error && typeof error === "object" ? own(error, "stack") : undefined;
  const frames: string[] = [];
  if (typeof rawStack === "string") {
    // Never retain the first line, arguments, function names, absolute paths or URL frames.
    for (const line of rawStack.slice(0, 32768).split("\n").slice(1, 51)) {
      if (/https?:|data:|[?#]/u.test(line)) continue;
      const match = /^\s*at (?:[^\r\n]*[/\\])?([A-Za-z0-9_.-]+\.js):(\d{1,7}):(\d{1,7})\)?$/u.exec(line);
      if (match && DISCLOSABLE_FRAME_FILES.has(match[1])) frames.push(`at ${match[1]}:${match[2]}:${match[3]}`);
      if (frames.length >= 20) break;
    }
  }
  return {message, name, stack: [`${name}: ${message}`, ...frames].join("\n").slice(0, 2048)};
};

export const discloseDiagnostics = (value: unknown): Record<string, unknown> => {
  const seen = new WeakSet<object>();
  let nodes = 0; let chars = 0;
  const visit = (current: unknown, key: string, depth: number): unknown => {
    if (++nodes > 1000 || chars > 32768) return "[LIMIT_REACHED]";
    if (depth >= 6) return "[MAX_DEPTH_REACHED]";
    if (sensitive.test(key) && key !== "error") return WITHHELD;
    if (current === undefined || current === null) return current;
    if (typeof current === "object") {
      if (seen.has(current)) return "[CIRCULAR]";
      seen.add(current);
      if (current instanceof Error) {
        const error = safeRuntimeError(current);
        chars += error.message.length + error.stack.length;
        return error;
      }
      if (ArrayBuffer.isView(current) || current instanceof ArrayBuffer) return WITHHELD;
      if (Array.isArray(current)) {
        const length = Number(own(current, "length"));
        const result: unknown[] = [];
        for (let index = 0; index < Math.min(length, 50); index++) {
          result.push(visit(own(current, String(index)), key, depth + 1));
        }
        if (length > 50) result.push("[LIMIT_REACHED]");
        return result;
      }
      const result: Record<string, unknown> = {};
      const keys = Object.keys(current);
      for (const [index, nestedKey] of keys.slice(0, 50).entries()) {
        const known = identifiers.has(nestedKey) || metrics.has(nestedKey) || enums.has(nestedKey) ||
          containers.has(nestedKey) || flags.has(nestedKey) ||
          ["requestId", "service", "message", "name", "stack"].includes(nestedKey);
        const outputKey = known ? nestedKey : `withheldField${index}`;
        const nested = own(current, nestedKey);
        result[outputKey] = known ? visit(nested, nestedKey, depth + 1) : WITHHELD;
      }
      if (keys.length > 50) result.overflow = "[LIMIT_REACHED]";
      return result;
    }
    if (metrics.has(key)) {
      return typeof current === "number" && Number.isFinite(current) &&
      Math.abs(current) <= 1e12 ? current : WITHHELD;
    }
    if (flags.has(key)) return typeof current === "boolean" ? current : WITHHELD;
    if (!scalar(current)) return WITHHELD;
    chars += current.length;
    if (identifiers.has(key)) return `sha256:${createHash("sha256").update(current).digest("hex")}`;
    if (key === "requestId") return safeRequestId(current);
    if (key === "service") return safeService(current);
    if (key === "message") return safeDiagnosticMessage(current);
    if (key === "name") {
      return errorNames.has(current) ||
      DISCLOSABLE_SYMBOLS.has(current) && /Error$/u.test(current) ? current : "Error";
    }
    if (enums.has(key)) {
      return DISCLOSABLE_SYMBOLS.has(current) ||
      ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"].includes(current) ? current : WITHHELD;
    }
    return WITHHELD;
  };
  try {
    return visit(value, "context", 0) as Record<string, unknown>;
  } catch {
    return {disclosure: "[UNAVAILABLE]"};
  }
};

export const safeErrorDetails = (details: unknown): unknown => {
  if (!details || typeof details !== "object" || Array.isArray(details)) return undefined;
  const result: Record<string, unknown> = {};
  const reason = own(details, "reason");
  const field = own(details, "field");
  const retry = own(details, "retryAfterSeconds");
  if (typeof reason === "string" && publicReasons.has(reason)) result.reason = reason;
  if (typeof field === "string" && ["instituteId", "tenantId", "studentId", "sessionId", "runId", "yearId",
    "role", "licenseLayer", "idempotencyKey"].includes(field)) result.field = field;
  if (Number.isInteger(retry) && Number(retry) >= 0 && Number(retry) <= 3600) result.retryAfterSeconds = retry;
  return Object.keys(result).length ? result : undefined;
};

// Read data descriptors only. Never execute attacker/provider accessors or toJSON.
export const mergeDiagnosticContexts = (...contexts: unknown[]): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const context of contexts) {
    if (!context || typeof context !== "object") continue;
    try {
      for (const key of Object.keys(context).slice(0, 50)) {
        if (["__proto__", "constructor", "prototype"].includes(key)) continue;
        result[key] = own(context, key);
      }
    } catch {
      result.disclosure = "[UNAVAILABLE]";
    }
  }
  return result;
};

// Reject for platform retries, but never hand a raw provider/domain Error to the platform logger.
export const guardBackgroundDiagnostics = <TArgs extends unknown[], TResult>(
  handler: (...args: TArgs) => Promise<TResult> | TResult,
): ((...args: TArgs) => Promise<TResult>) => async (...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      const normalized = safeRuntimeError(error);
      const safe = new Error(normalized.message);
      safe.name = normalized.name;
      safe.stack = normalized.stack;
      throw safe;
    }
  };
