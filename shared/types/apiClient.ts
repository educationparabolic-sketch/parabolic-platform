import type {
  ApiErrorDetail,
  ApiErrorEnvelope,
} from "./apiResponse";

export type ApiHttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApiClientRequestOptions<TRequestBody = unknown> {
  method?: ApiHttpMethod;
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: TRequestBody;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  skipAuth?: boolean;
  retry?: Partial<ApiRetryPolicy>;
  responseAdapter?: (value: unknown) => unknown;
}

export interface ApiRetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryUnsafeMethods: boolean;
}

export interface ApiErrorPayload extends Partial<Omit<ApiErrorEnvelope, "error">> {
  error?: Partial<ApiErrorDetail>;
  message?: string;
}

export interface ApiClientErrorMetadata<TDetails = unknown> {
  details?: TDetails;
  requestId?: string | null;
}

export class ApiClientError<TDetails = unknown> extends Error {
  readonly status: number;
  readonly code: string;
  readonly payload: unknown;
  readonly requestId: string | null;
  readonly details: TDetails | undefined;

  constructor(
    message: string,
    status: number,
    code: string,
    payload: unknown,
    metadata: ApiClientErrorMetadata<TDetails> = {},
  ) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.payload = payload;
    this.requestId = metadata.requestId ?? null;
    this.details = metadata.details;
  }
}

export interface ApiClientConfig {
  baseUrl?: string;
  defaultHeaders?: Record<string, string>;
  retryPolicy?: Partial<ApiRetryPolicy>;
}

export interface ApiRequestContext {
  method: ApiHttpMethod;
  path: string;
  attempt: number;
}

export interface ApiClient {
  request<TData, TRequestBody = unknown>(
    path: string,
    options?: ApiClientRequestOptions<TRequestBody>,
  ): Promise<TData>;
  get<TData>(
    path: string,
    options?: Omit<ApiClientRequestOptions<never>, "method" | "body">,
  ): Promise<TData>;
  post<TData, TRequestBody = unknown>(
    path: string,
    options?: Omit<ApiClientRequestOptions<TRequestBody>, "method">,
  ): Promise<TData>;
  put<TData, TRequestBody = unknown>(
    path: string,
    options?: Omit<ApiClientRequestOptions<TRequestBody>, "method">,
  ): Promise<TData>;
  patch<TData, TRequestBody = unknown>(
    path: string,
    options?: Omit<ApiClientRequestOptions<TRequestBody>, "method">,
  ): Promise<TData>;
  delete<TData>(
    path: string,
    options?: Omit<ApiClientRequestOptions<never>, "method" | "body">,
  ): Promise<TData>;
}
