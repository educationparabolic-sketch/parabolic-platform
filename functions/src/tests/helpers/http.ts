interface MockRequestOverrides {
  body?: unknown;
  headers?: Record<string, string>;
  method?: string;
  originalUrl?: string;
  path?: string;
  url?: string;
}

export interface MockResponse {
  body: unknown;
  json: (value: unknown) => MockResponse;
  status: (statusCode: number) => MockResponse;
  statusCode: number;
}

export const createMockResponse = (): MockResponse => {
  const response: MockResponse = {
    body: undefined,
    json(value: unknown) {
      response.body = value;
      return response;
    },
    status(statusCode: number) {
      response.statusCode = statusCode;
      return response;
    },
    statusCode: 200,
  };

  return response;
};

export const createMockRequest = (
  overrides: MockRequestOverrides = {},
): Record<string, unknown> => {
  const headers = Object.fromEntries(
    Object.entries(overrides.headers ?? {}).map(([key, value]) => [
      key.toLowerCase(),
      value,
    ]),
  );
  const path = overrides.path ?? "/";

  return {
    body: overrides.body ?? {},
    get(name: string) {
      return headers[name.toLowerCase()];
    },
    header(name: string) {
      return headers[name.toLowerCase()];
    },
    headers,
    ip: "127.0.0.1",
    method: overrides.method ?? "POST",
    originalUrl: overrides.originalUrl ?? path,
    path,
    url: overrides.url ?? path,
  };
};
