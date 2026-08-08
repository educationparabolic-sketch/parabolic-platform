import { getIdToken, type User } from "firebase/auth";
import { readCrossPortalIdToken } from "./crossPortalAuthSession";
import { getFrontendEnvironment } from "./frontendEnvironment";
import { getFirebaseAuth } from "./firebaseClient";
import {
  beginFrontendDataRequest,
  completeFrontendDataRequest,
  failFrontendDataRequest,
} from "./frontendDataState";
import {
  captureFrontendApiFailure,
  captureFrontendApiTiming,
} from "./frontendMonitoring";
import {
  ApiEnvelopeValidationError,
  parseApiErrorEnvelope,
  unwrapApiSuccessData,
  type ApiErrorEnvelope,
} from "../types/apiResponse";
import {
  ApiClientError,
  type ApiClient,
  type ApiClientConfig,
  type ApiClientRequestOptions,
  type ApiHttpMethod,
  type ApiRequestContext,
  type ApiRetryPolicy,
} from "../types/apiClient";

export { ApiClientError } from "../types/apiClient";

const DEFAULT_RETRY_POLICY: ApiRetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 250,
  maxDelayMs: 1500,
  retryUnsafeMethods: false,
};

const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const IDEMPOTENT_METHODS = new Set<ApiHttpMethod>(["GET", "DELETE"]);

export const SAME_ORIGIN_API_BASE_URL = "/api/v1";

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
    return SAME_ORIGIN_API_BASE_URL;
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

function toApiError<TDetails>(
  context: ApiRequestContext,
  status: number,
  payload: ApiErrorEnvelope<TDetails>,
): ApiClientError<TDetails> {
  const code = payload.error.code;
  const message = payload.error.message ||
    `API request failed for ${context.method} ${context.path} with status ${status}`;

  return new ApiClientError(message, status, code, payload, {
    details: payload.error.details,
    requestId: payload.requestId,
  });
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
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  const text = await response.text();
  return text.length > 0 ? text : null;
}

export function createApiClient(config: ApiClientConfig = {}): ApiClient {
  const baseUrl = resolveBaseUrl(config);

  async function executeRequest<TData, TRequestBody = unknown>(
    path: string,
    options: ApiClientRequestOptions<TRequestBody> = {},
  ): Promise<TData> {
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
          let data: TData;
          try {
            data = unwrapApiSuccessData<TData>(payload);
          } catch (error) {
            if (!(error instanceof ApiEnvelopeValidationError)) {
              throw error;
            }

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
              code: "INVALID_RESPONSE",
              message: error.message,
            });
            throw new ApiClientError(error.message, response.status, "INVALID_RESPONSE", payload);
          }

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
          return data;
        }

        let errorEnvelope: ApiErrorEnvelope;
        try {
          errorEnvelope = parseApiErrorEnvelope(payload);
          payload = errorEnvelope;
        } catch (error) {
          if (!(error instanceof ApiEnvelopeValidationError)) {
            throw error;
          }

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
            code: "INVALID_RESPONSE",
            message: error.message,
          });
          throw new ApiClientError(error.message, response.status, "INVALID_RESPONSE", payload);
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
            code: errorEnvelope.error.code,
            message: errorEnvelope.error.message,
          });
          throw toApiError(context, response.status, errorEnvelope);
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

  async function request<TData, TRequestBody = unknown>(
    path: string,
    options: ApiClientRequestOptions<TRequestBody> = {},
  ): Promise<TData> {
    const method = options.method ?? "GET";
    const requestPath = ensureLeadingSlash(path);
    const dataRequestId = beginFrontendDataRequest(method, requestPath);

    try {
      const data = await executeRequest<TData, TRequestBody>(path, options);
      completeFrontendDataRequest(dataRequestId, data);
      return data;
    } catch (error) {
      failFrontendDataRequest(dataRequestId, error);
      throw error;
    }
  }

  return {
    request,
    get: <TData>(path: string, options?: Omit<ApiClientRequestOptions<never>, "method" | "body">) =>
      request<TData>(path, { ...options, method: "GET" }),
    post: <TData, TRequestBody = unknown>(
      path: string,
      options?: Omit<ApiClientRequestOptions<TRequestBody>, "method">,
    ) => request<TData, TRequestBody>(path, { ...options, method: "POST" }),
    put: <TData, TRequestBody = unknown>(
      path: string,
      options?: Omit<ApiClientRequestOptions<TRequestBody>, "method">,
    ) => request<TData, TRequestBody>(path, { ...options, method: "PUT" }),
    patch: <TData, TRequestBody = unknown>(
      path: string,
      options?: Omit<ApiClientRequestOptions<TRequestBody>, "method">,
    ) => request<TData, TRequestBody>(path, { ...options, method: "PATCH" }),
    delete: <TData>(
      path: string,
      options?: Omit<ApiClientRequestOptions<never>, "method" | "body">,
    ) => request<TData>(path, { ...options, method: "DELETE" }),
  };
}

export const apiClient = createApiClient();
