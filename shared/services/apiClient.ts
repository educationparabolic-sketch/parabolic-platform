import { getIdToken, type User } from "firebase/auth";
import { readCrossPortalIdToken } from "./crossPortalAuthSession";
import { getFrontendEnvironment } from "./frontendEnvironment";
import { getFirebaseAuth } from "./firebaseClient";
import {
  captureFrontendApiFailure,
  captureFrontendApiTiming,
} from "./frontendMonitoring";
import type {
  ApiClient,
  ApiClientConfig,
  ApiClientRequestOptions,
  ApiErrorPayload,
  ApiHttpMethod,
  ApiRequestContext,
  ApiRetryPolicy,
} from "../types/apiClient";

const DEFAULT_RETRY_POLICY: ApiRetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 250,
  maxDelayMs: 1500,
  retryUnsafeMethods: false,
};

const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const IDEMPOTENT_METHODS = new Set<ApiHttpMethod>(["GET", "DELETE"]);

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly payload: unknown;

  constructor(message: string, status: number, code: string, payload: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

function ensureLeadingSlash(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function removeTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function resolveBaseUrl(config: ApiClientConfig): string {
  if (config.baseUrl && config.baseUrl.trim().length > 0) {
    return removeTrailingSlash(config.baseUrl.trim());
  }

  const envBaseUrl = getFrontendEnvironment().apiBaseUrl;
  if (!envBaseUrl || envBaseUrl.trim().length === 0) {
    return "";
  }

  return removeTrailingSlash(envBaseUrl.trim());
}

function withQueryString(
  path: string,
  query: ApiClientRequestOptions["query"],
): string {
  if (!query || Object.keys(query).length === 0) {
    return path;
  }

  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === null || typeof value === "undefined") {
      continue;
    }

    searchParams.set(key, String(value));
  }

  const serialized = searchParams.toString();
  if (!serialized) {
    return path;
  }

  return `${path}?${serialized}`;
}

function resolveUrl(baseUrl: string, path: string, query: ApiClientRequestOptions["query"]): string {
  const normalizedPath = ensureLeadingSlash(path);
  const targetPath = withQueryString(normalizedPath, query);

  if (!baseUrl) {
    return targetPath;
  }

  return `${baseUrl}${targetPath}`;
}

function toRetryPolicy(config: ApiClientConfig, requestRetry: ApiClientRequestOptions["retry"]): ApiRetryPolicy {
  return {
    ...DEFAULT_RETRY_POLICY,
    ...config.retryPolicy,
    ...requestRetry,
  };
}

function isRetryableRequest(
  method: ApiHttpMethod,
  policy: ApiRetryPolicy,
  statusOrNull: number | null,
  networkFailure: boolean,
): boolean {
  const methodAllowed = policy.retryUnsafeMethods || IDEMPOTENT_METHODS.has(method);

  if (!methodAllowed) {
    return false;
  }

  if (networkFailure) {
    return true;
  }

  return statusOrNull !== null && RETRYABLE_STATUS_CODES.has(statusOrNull);
}

function delayForAttempt(policy: ApiRetryPolicy, attempt: number): number {
  const exponential = policy.baseDelayMs * 2 ** Math.max(0, attempt - 1);
  return Math.min(policy.maxDelayMs, exponential);
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function resolveToken(skipAuth?: boolean): Promise<string | null> {
  if (skipAuth) {
    return null;
  }

  let currentUser: User | null = null;
  try {
    currentUser = getFirebaseAuth().currentUser;
  } catch {
    return null;
  }

  if (!currentUser) {
    return readCrossPortalIdToken();
  }

  return getIdToken(currentUser, false);
}

async function refreshToken(user: User | null): Promise<string | null> {
  if (!user) {
    return readCrossPortalIdToken();
  }

  return getIdToken(user, true);
}

function normalizeErrorPayload(payload: unknown): ApiErrorPayload {
  if (payload && typeof payload === "object") {
    return payload as ApiErrorPayload;
  }

  return {};
}

function toApiError(
  context: ApiRequestContext,
  status: number,
  payload: unknown,
): ApiClientError {
  const normalized = normalizeErrorPayload(payload);
  const code = normalized.error?.code ?? `HTTP_${status}`;
  const message =
    normalized.error?.message ??
    normalized.message ??
    `API request failed for ${context.method} ${context.path} with status ${status}`;

  return new ApiClientError(message, status, code, payload);
}

function isJsonResponse(response: Response): boolean {
  const contentType = response.headers.get("content-type") ?? "";
  return contentType.toLowerCase().includes("application/json");
}

async function readResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }

  if (isJsonResponse(response)) {
    return response.json();
  }

  const text = await response.text();
  return text.length > 0 ? text : null;
}

export function createApiClient(config: ApiClientConfig = {}): ApiClient {
  const baseUrl = resolveBaseUrl(config);

  async function request<TResponse, TRequestBody = unknown>(
    path: string,
    options: ApiClientRequestOptions<TRequestBody> = {},
  ): Promise<TResponse> {
    const requestStartedAt =
      typeof performance !== "undefined" && typeof performance.now === "function" ?
        performance.now() :
        Date.now();
    const method = options.method ?? "GET";
    const policy = toRetryPolicy(config, options.retry);
    const requestPath = ensureLeadingSlash(path);
    const requestUrl = resolveUrl(baseUrl, requestPath, options.query);

    for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
      const context: ApiRequestContext = {
        method,
        path: requestPath,
        attempt,
      };

      let response: Response | null = null;
      let payload: unknown = null;

      try {
        let token = await resolveToken(options.skipAuth);

        const requestHeaders = new Headers({
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(config.defaultHeaders ?? {}),
          ...(options.headers ?? {}),
        });

        if (token) {
          requestHeaders.set("Authorization", `Bearer ${token}`);
        }

        response = await fetch(requestUrl, {
          method,
          headers: requestHeaders,
          signal: options.signal,
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
        });

        payload = await readResponseBody(response);

        let currentUser: User | null = null;
        try {
          currentUser = getFirebaseAuth().currentUser;
        } catch {
          currentUser = null;
        }

        if (!response.ok && response.status === 401 && !options.skipAuth && currentUser) {
          token = await refreshToken(currentUser);
          if (token) {
            requestHeaders.set("Authorization", `Bearer ${token}`);
            response = await fetch(requestUrl, {
              method,
              headers: requestHeaders,
              signal: options.signal,
              body: options.body === undefined ? undefined : JSON.stringify(options.body),
            });
            payload = await readResponseBody(response);
          }
        }

        if (response.ok) {
          const finishedAt =
            typeof performance !== "undefined" && typeof performance.now === "function" ?
              performance.now() :
              Date.now();
          captureFrontendApiTiming({
            method,
            path: requestPath,
            url: requestUrl,
            status: response.status,
            attempt,
            durationMs: Math.max(0, Math.round(finishedAt - requestStartedAt)),
          });
          return payload as TResponse;
        }

        const retryable = isRetryableRequest(method, policy, response.status, false);

        if (!retryable || attempt >= policy.maxAttempts) {
          const finishedAt =
            typeof performance !== "undefined" && typeof performance.now === "function" ?
              performance.now() :
              Date.now();
          captureFrontendApiFailure({
            method,
            path: requestPath,
            url: requestUrl,
            status: response.status,
            attempt,
            durationMs: Math.max(0, Math.round(finishedAt - requestStartedAt)),
            code: (payload as ApiErrorPayload | null)?.error?.code ?? `HTTP_${response.status}`,
            message:
              (payload as ApiErrorPayload | null)?.error?.message ??
              `API request failed for ${method} ${requestPath}`,
          });
          throw toApiError(context, response.status, payload);
        }
      } catch (error) {
        const alreadyTypedError = error instanceof ApiClientError;

        if (alreadyTypedError) {
          throw error;
        }

        const retryable = isRetryableRequest(method, policy, response?.status ?? null, true);
        if (!retryable || attempt >= policy.maxAttempts) {
          const finishedAt =
            typeof performance !== "undefined" && typeof performance.now === "function" ?
              performance.now() :
              Date.now();
          captureFrontendApiFailure({
            method,
            path: requestPath,
            url: requestUrl,
            status: response?.status ?? 0,
            attempt,
            durationMs: Math.max(0, Math.round(finishedAt - requestStartedAt)),
            code: "NETWORK_ERROR",
            message: `Network failure for ${context.method} ${context.path}`,
          });
          throw new ApiClientError(
            `Network failure for ${context.method} ${context.path}`,
            response?.status ?? 0,
            "NETWORK_ERROR",
            payload,
          );
        }
      }

      await delay(delayForAttempt(policy, attempt));
    }

    throw new ApiClientError(
      `API request failed for ${method} ${requestPath}`,
      0,
      "UNREACHABLE",
      null,
    );
  }

  return {
    request,
    get: <TResponse>(path: string, options?: Omit<ApiClientRequestOptions<never>, "method" | "body">) =>
      request<TResponse>(path, { ...options, method: "GET" }),
    post: <TResponse, TRequestBody = unknown>(
      path: string,
      options?: Omit<ApiClientRequestOptions<TRequestBody>, "method">,
    ) => request<TResponse, TRequestBody>(path, { ...options, method: "POST" }),
    put: <TResponse, TRequestBody = unknown>(
      path: string,
      options?: Omit<ApiClientRequestOptions<TRequestBody>, "method">,
    ) => request<TResponse, TRequestBody>(path, { ...options, method: "PUT" }),
    patch: <TResponse, TRequestBody = unknown>(
      path: string,
      options?: Omit<ApiClientRequestOptions<TRequestBody>, "method">,
    ) => request<TResponse, TRequestBody>(path, { ...options, method: "PATCH" }),
    delete: <TResponse>(
      path: string,
      options?: Omit<ApiClientRequestOptions<never>, "method" | "body">,
    ) => request<TResponse>(path, { ...options, method: "DELETE" }),
  };
}

export const apiClient = createApiClient();
