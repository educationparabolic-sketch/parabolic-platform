import type { ApiHttpMethod } from "../types/apiClient";

export type FrontendDataStateKind =
  | "loading"
  | "ready"
  | "empty"
  | "unavailable"
  | "permission"
  | "validation";

export interface FrontendDataStateSnapshot {
  kind: FrontendDataStateKind;
  message: string;
  method: ApiHttpMethod | null;
  path: string | null;
  revision: number;
}

interface FrontendDataErrorShape {
  code?: unknown;
  message?: unknown;
  status?: unknown;
}

const listeners = new Set<() => void>();
const pendingRequests = new Map<number, { method: ApiHttpMethod; path: string }>();
let nextRequestId = 1;
let successfulNonEmptyRequest = false;
let failureIsActive = false;
let snapshot: FrontendDataStateSnapshot = {
  kind: "ready",
  message: "",
  method: null,
  path: null,
  revision: 0,
};

function publish(nextSnapshot: Omit<FrontendDataStateSnapshot, "revision">): void {
  snapshot = {
    ...nextSnapshot,
    revision: snapshot.revision + 1,
  };
  listeners.forEach((listener) => listener());
}

function toErrorShape(error: unknown): FrontendDataErrorShape {
  return error && typeof error === "object" ? (error as FrontendDataErrorShape) : {};
}

export function classifyFrontendDataFailure(
  error: unknown,
): Exclude<FrontendDataStateKind, "loading" | "ready" | "empty"> {
  const candidate = toErrorShape(error);
  const status = typeof candidate.status === "number" ? candidate.status : 0;
  const code = typeof candidate.code === "string" ? candidate.code.toUpperCase() : "";

  if (
    status === 401 ||
    status === 403 ||
    ["FORBIDDEN", "LICENSE_RESTRICTED", "TENANT_MISMATCH", "UNAUTHORIZED"].includes(code)
  ) {
    return "permission";
  }

  if (
    status === 400 ||
    status === 409 ||
    status === 422 ||
    ["INVALID_RESPONSE", "VALIDATION_ERROR"].includes(code)
  ) {
    return "validation";
  }

  return "unavailable";
}

export function isFrontendDataEmpty(data: unknown): boolean {
  if (data === null || typeof data === "undefined") {
    return true;
  }

  if (Array.isArray(data)) {
    return data.length === 0;
  }

  if (typeof data !== "object") {
    return false;
  }

  const values = Object.values(data as Record<string, unknown>);
  return (
    values.length === 0 ||
    values.every((value) => {
      if (Array.isArray(value)) {
        return value.length === 0;
      }
      if (value === null || typeof value === "undefined" || value === "") {
        return true;
      }
      return typeof value === "number" && value === 0;
    })
  );
}

export function resetFrontendDataState(): void {
  pendingRequests.clear();
  successfulNonEmptyRequest = false;
  failureIsActive = false;
  publish({
    kind: "loading",
    message: "Loading authoritative data…",
    method: null,
    path: null,
  });
}

export function releaseFrontendDataStateIfIdle(): void {
  if (pendingRequests.size === 0 && !failureIsActive && snapshot.kind === "loading") {
    publish({
      kind: "ready",
      message: "",
      method: null,
      path: null,
    });
  }
}

export function beginFrontendDataRequest(method: ApiHttpMethod, path: string): number {
  if (pendingRequests.size === 0) {
    successfulNonEmptyRequest = false;
    failureIsActive = false;
  }

  const requestId = nextRequestId;
  nextRequestId += 1;
  pendingRequests.set(requestId, { method, path });

  if (!failureIsActive) {
    publish({
      kind: "loading",
      message: `Loading ${method} ${path}…`,
      method,
      path,
    });
  }

  return requestId;
}

export function completeFrontendDataRequest(requestId: number, data: unknown): void {
  const request = pendingRequests.get(requestId) ?? null;
  pendingRequests.delete(requestId);

  if (!request) {
    return;
  }

  if (failureIsActive) {
    return;
  }

  if (request.method !== "GET" || !isFrontendDataEmpty(data)) {
    successfulNonEmptyRequest = true;
  }

  if (pendingRequests.size > 0) {
    return;
  }

  publish({
    kind: successfulNonEmptyRequest ? "ready" : "empty",
    message: successfulNonEmptyRequest
      ? ""
      : "No authoritative records are available for this view.",
    method: request?.method ?? null,
    path: request?.path ?? null,
  });
}

export function failFrontendDataRequest(requestId: number, error: unknown): void {
  const request = pendingRequests.get(requestId) ?? null;
  pendingRequests.delete(requestId);

  if (!request) {
    return;
  }

  failureIsActive = true;
  const candidate = toErrorShape(error);

  publish({
    kind: classifyFrontendDataFailure(error),
    message:
      typeof candidate.message === "string" && candidate.message.trim().length > 0
        ? candidate.message.trim()
        : "Authoritative data could not be loaded.",
    method: request?.method ?? null,
    path: request?.path ?? null,
  });
}

export function getFrontendDataStateSnapshot(): FrontendDataStateSnapshot {
  return snapshot;
}

export function subscribeToFrontendDataState(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
