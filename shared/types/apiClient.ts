export type ApiHttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApiClientRequestOptions<TRequestBody = unknown> {
  method?: ApiHttpMethod;
  query?: Record<string, string | number | boolean | null | undefined>;
  body?: TRequestBody;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  skipAuth?: boolean;
  retry?: Partial<ApiRetryPolicy>;
}

export interface ApiRetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryUnsafeMethods: boolean;
}

export interface ApiErrorPayload {
  error?: {
    code?: string;
    message?: string;
  };
  message?: string;
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
  request<TResponse, TRequestBody = unknown>(
    path: string,
    options?: ApiClientRequestOptions<TRequestBody>,
  ): Promise<TResponse>;
  get<TResponse>(
    path: string,
    options?: Omit<ApiClientRequestOptions<never>, "method" | "body">,
  ): Promise<TResponse>;
  post<TResponse, TRequestBody = unknown>(
    path: string,
    options?: Omit<ApiClientRequestOptions<TRequestBody>, "method">,
  ): Promise<TResponse>;
  put<TResponse, TRequestBody = unknown>(
    path: string,
    options?: Omit<ApiClientRequestOptions<TRequestBody>, "method">,
  ): Promise<TResponse>;
  patch<TResponse, TRequestBody = unknown>(
    path: string,
    options?: Omit<ApiClientRequestOptions<TRequestBody>, "method">,
  ): Promise<TResponse>;
  delete<TResponse>(
    path: string,
    options?: Omit<ApiClientRequestOptions<never>, "method" | "body">,
  ): Promise<TResponse>;
}
