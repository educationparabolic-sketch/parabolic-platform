import { ApiClientError, type ApiClient } from "../../../shared/types/apiClient";

export class RuntimeTransportError extends ApiClientError {
  readonly retryAfterMs: number | null;
  constructor(message: string, status: number, code: string, retryAfterMs: number | null = null,
    details?: unknown) {super(message, status, code, null, {details}); this.retryAfterMs = retryAfterMs;}
}
export function retryAfterMs(value: string | null, serverDate: string | null): number | null {
  if (!value) return null;
  if (/^\d+$/u.test(value)) {
    const seconds = Number(value);
    return Number.isSafeInteger(seconds * 1000) ? seconds * 1000 : null;
  }
  // HTTP dates need a server Date anchor; never use the candidate wall clock.
  if (!/^[A-Z][a-z]{2}, /u.test(value) || !serverDate) return null;
  const until = Date.parse(value), from = Date.parse(serverDate);
  return Number.isFinite(until) && Number.isFinite(from) ? Math.max(0, until - from) : null;
}
const retryable = new Set([0, 408, 425, 429, 500, 502, 503, 504]);
export const isTransientTransportError = (error: unknown) => error instanceof ApiClientError &&
  retryable.has(error.status) && error.code !== "AUTH_SCOPE_CHANGED" &&
  (error.code !== "INVALID_RESPONSE" || error.status >= 400);

export async function withRuntimeDeadline<T>(parent: AbortSignal, work: (signal: AbortSignal) => Promise<T>, milliseconds: number) {
  const controller = new AbortController();
  const abort = () => controller.abort(parent.reason);
  parent.addEventListener("abort", abort, {once: true});
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    if (parent.aborted) throw parent.reason;
    // Arm cancellation before invoking SDK work, including a synchronous Auth-change callback.
    const canceled = new Promise<never>((_, reject) => {
      const fail = () => reject(parent.aborted ? parent.reason :
        new RuntimeTransportError("Request timed out. Confirmation is unavailable; pending changes are retained.", 0, "TIMEOUT"));
      controller.signal.addEventListener("abort", fail, {once: true});
      timer = setTimeout(() => controller.abort(), milliseconds);
      if (controller.signal.aborted) fail();
    });
    return await Promise.race([canceled, Promise.resolve().then(() => {
      controller.signal.throwIfAborted(); return work(controller.signal);
    })]);
  } finally {clearTimeout(timer); parent.removeEventListener("abort", abort); controller.abort();}
}
function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {reject(signal.reason); return;}
    const abort = () => {clearTimeout(timer); reject(signal.reason);};
    const timer = setTimeout(() => {signal.removeEventListener("abort", abort); resolve();}, ms);
    signal.addEventListener("abort", abort, {once: true});
  });
}
export interface RuntimeOperation {
  signal: AbortSignal;
  current: () => boolean;
  available: () => boolean;
  token: (force: boolean, signal: AbortSignal) => Promise<string>;
  dispatch: (token: string, signal: AbortSignal) => Promise<unknown>;
  onUnauthorized?: () => void;
  wait?: (ms: number, signal: AbortSignal) => Promise<void>;
  timeoutMs?: number;
}
/** One retained intent, one budget. Shared HTTP mutation retry remains unchanged. */
export async function runRuntimeOperation(operation: RuntimeOperation): Promise<unknown> {
  let refreshUsed = false, forceRefresh = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (operation.signal.aborted || !operation.current()) throw new Error("Current exam authority is required.");
    if (!operation.available()) throw new RuntimeTransportError("Connection or visibility changed. Confirm current authority before retrying.", 0, "SUSPENDED");
    try {
      return await withRuntimeDeadline(operation.signal, async signal => {
        const token = await operation.token(forceRefresh, signal);
        forceRefresh = false;
        if (signal.aborted || !operation.current()) throw new Error("Exam request canceled.");
        const result = await operation.dispatch(token, signal);
        if (signal.aborted || !operation.current()) throw new Error("Exam receipt arrived after authority ended.");
        return result;
      }, operation.timeoutMs ?? 15_000);
    } catch (error) {
      if (operation.signal.aborted || !operation.current()) throw error;
      if (error instanceof ApiClientError && error.status === 401 && !refreshUsed && attempt < 2) {
        operation.onUnauthorized?.();
        refreshUsed = true; forceRefresh = true; continue;
      }
      if (!isTransientTransportError(error) || attempt === 2) throw error;
      const requested = error instanceof RuntimeTransportError ? error.retryAfterMs : null;
      if (requested !== null && requested > 30_000) throw new RuntimeTransportError(
        `Server asks for a retry after at least ${Math.ceil(requested / 1000)} seconds. Use Retry after that wait.`,
        (error as ApiClientError).status, "RETRY_LATER", requested);
      await (operation.wait ?? wait)(Math.max(1000 * 2 ** attempt, requested ?? 0), operation.signal);
    }
  }
  throw new Error("Exam confirmation unavailable. Use Retry.");
}
export async function dispatchRuntimeRequest(client: ApiClient, path: string, serializedBody: string | undefined,
  headers: Record<string, string>, validate: (token: string | null) => void, signal: AbortSignal) {
  let retryAfter: number | null = null;
  try {
    return await client.post<unknown>(path, {body: serializedBody === undefined ? undefined : JSON.parse(serializedBody),
      headers, signal, retry: {maxAttempts: 1}, refreshAuthOn401: false, handledFailureIsReady: true,
      validateAuthToken: token => {signal.throwIfAborted(); validate(token);},
      onResponseHeaders: responseHeaders => {retryAfter = retryAfterMs(responseHeaders.get("Retry-After"), responseHeaders.get("Date"));}});
  } catch (error) {
    if (error instanceof ApiClientError && retryAfter !== null) throw new RuntimeTransportError(error.message, error.status, error.code, retryAfter, error.details);
    throw error;
  }
}
