export const API_SUCCESS_CODE = "OK" as const;

export const STANDARD_API_ERROR_CODES = [
  "FORBIDDEN",
  "INTERNAL_ERROR",
  "LICENSE_RESTRICTED",
  "METHOD_NOT_ALLOWED",
  "NOT_FOUND",
  "SESSION_LOCKED",
  "SESSION_NOT_ACTIVE",
  "SUBMISSION_LOCKED",
  "TENANT_MISMATCH",
  "UNAUTHORIZED",
  "VALIDATION_ERROR",
  "WINDOW_CLOSED",
] as const;

export type ApiSuccessCode = typeof API_SUCCESS_CODE;
export type StandardApiErrorCode = (typeof STANDARD_API_ERROR_CODES)[number];

export interface ApiEnvelopeMetadata {
  requestId: string;
  timestamp: string;
}

export interface ApiSuccessEnvelope<TData> extends ApiEnvelopeMetadata {
  code: ApiSuccessCode;
  data: TData;
  message: string;
  success: true;
}

export interface ApiErrorDetail<TDetails = unknown> {
  code: StandardApiErrorCode;
  details?: TDetails;
  message: string;
}

export interface ApiErrorEnvelope<TDetails = unknown> extends ApiEnvelopeMetadata {
  error: ApiErrorDetail<TDetails>;
  success: false;
}

export type ApiEnvelope<TData, TDetails = unknown> =
  | ApiSuccessEnvelope<TData>
  | ApiErrorEnvelope<TDetails>;

export class ApiEnvelopeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiEnvelopeValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoTimestamp(value: unknown): value is string {
  if (!isNonEmptyString(value)) {
    return false;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function assertEnvelopeMetadata(
  payload: Record<string, unknown>,
): asserts payload is Record<string, unknown> & ApiEnvelopeMetadata {
  if (!isNonEmptyString(payload.requestId)) {
    throw new ApiEnvelopeValidationError("API envelope requestId must be a non-empty string.");
  }

  if (!isIsoTimestamp(payload.timestamp)) {
    throw new ApiEnvelopeValidationError("API envelope timestamp must be an ISO-8601 UTC timestamp.");
  }
}

export function parseApiSuccessEnvelope<TData>(payload: unknown): ApiSuccessEnvelope<TData> {
  if (!isRecord(payload)) {
    throw new ApiEnvelopeValidationError("Successful API responses must use an object envelope.");
  }

  if (payload.success !== true) {
    throw new ApiEnvelopeValidationError("Successful API responses must set success to true.");
  }

  if (payload.code !== API_SUCCESS_CODE) {
    throw new ApiEnvelopeValidationError(`Successful API responses must use code ${API_SUCCESS_CODE}.`);
  }

  if (!Object.prototype.hasOwnProperty.call(payload, "data")) {
    throw new ApiEnvelopeValidationError("Successful API responses must include data.");
  }

  if (!isNonEmptyString(payload.message)) {
    throw new ApiEnvelopeValidationError("Successful API responses must include a non-empty message.");
  }

  assertEnvelopeMetadata(payload);
  return payload as unknown as ApiSuccessEnvelope<TData>;
}

export function unwrapApiSuccessData<TData>(payload: unknown): TData {
  return parseApiSuccessEnvelope<TData>(payload).data;
}

export function parseApiErrorEnvelope<TDetails = unknown>(payload: unknown): ApiErrorEnvelope<TDetails> {
  if (!isRecord(payload)) {
    throw new ApiEnvelopeValidationError("Failed API responses must use an object envelope.");
  }

  if (payload.success !== false) {
    throw new ApiEnvelopeValidationError("Failed API responses must set success to false.");
  }

  if (!isRecord(payload.error)) {
    throw new ApiEnvelopeValidationError("Failed API responses must include an error object.");
  }

  if (!(STANDARD_API_ERROR_CODES as readonly unknown[]).includes(payload.error.code)) {
    throw new ApiEnvelopeValidationError("Failed API responses must use a standard error code.");
  }

  if (!isNonEmptyString(payload.error.message)) {
    throw new ApiEnvelopeValidationError("Failed API responses must include a non-empty error message.");
  }

  assertEnvelopeMetadata(payload);
  return payload as unknown as ApiErrorEnvelope<TDetails>;
}
