/* eslint-disable max-len, require-jsdoc */
import {createHash} from "node:crypto";
import {Timestamp} from "firebase-admin/firestore";
import type {
  VendorCommercialProviderOperation,
  VendorCommercialProviderState,
  VendorMoney,
} from "../../../shared/contracts/vendorCommercial";
import {VendorCommercialValidationError} from "../types/vendorCommercial";

export const MAX_COMMERCIAL_PAGE = 50;
export const DEFAULT_COMMERCIAL_PAGE = 25;
export const MAX_COMMERCIAL_CURSOR = 4096;
export const MAX_COMMERCIAL_IDENTIFIER = 128;
export const MAX_COMMERCIAL_REASON = 1000;

export type VendorCommercialProviderCommandKind =
  | "catalog_publish"
  | "catalog_retire"
  | "subscription_change_plan"
  | "subscription_extend_trial"
  | "subscription_cancel_at_period_end"
  | "subscription_cancel_now"
  | "subscription_resume"
  | "subscription_sync"
  | "invoice_finalize"
  | "invoice_void"
  | "invoice_retry_collection"
  | "invoice_sync"
  | "offline_payment_verify"
  | "payment_event_reconcile";

export interface VendorCommercialProviderCommand {
  eventId?: string;
  instituteId?: string;
  invoiceId?: string;
  kind: VendorCommercialProviderCommandKind;
  operationId: string;
  payload: Record<string, unknown>;
}

export interface VendorCommercialProviderResult {
  errorCode?: string;
  externalReference?: string;
  projection?: Record<string, unknown>;
  state: "succeeded" | "failed_retryable" | "failed_terminal";
}

export interface VendorCommercialProvider {
  execute(
    command: VendorCommercialProviderCommand,
  ): Promise<VendorCommercialProviderResult>;
}

export class UnavailableVendorCommercialProvider
implements VendorCommercialProvider {
  public async execute(): Promise<VendorCommercialProviderResult> {
    return {
      errorCode: "provider_not_configured",
      state: "failed_retryable",
    };
  }
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const validationError = (message: string): never => {
  throw new VendorCommercialValidationError("VALIDATION_ERROR", message);
};

export const conflictError = (message: string): never => {
  throw new VendorCommercialValidationError("CONFLICT", message);
};

export const authorityError = (message: string): never => {
  throw new VendorCommercialValidationError("INTERNAL_ERROR", message);
};

export const notFoundError = (message: string): never => {
  throw new VendorCommercialValidationError("NOT_FOUND", message);
};

export const requiredString = (
  value: unknown,
  field: string,
  maximumLength = MAX_COMMERCIAL_IDENTIFIER,
): string => {
  if (typeof value !== "string" || !value.trim()) {
    return validationError(`Field "${field}" must be a non-empty string.`);
  }
  const normalized = value.trim();
  if (normalized.length > maximumLength) {
    return validationError(
      `Field "${field}" must be at most ${maximumLength} characters.`,
    );
  }
  return normalized;
};

export const storedString = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !value.trim()) {
    return authorityError(`Persisted field "${field}" is invalid.`);
  }
  return value.trim();
};

export const optionalStoredString = (
  value: unknown,
  field: string,
): string | null => value === undefined || value === null ?
  null : storedString(value, field);

export const identifier = (value: unknown, field: string): string => {
  const normalized = requiredString(value, field);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(normalized)) {
    return validationError(`Field "${field}" has an invalid identifier.`);
  }
  return normalized;
};

export const storedIdentifier = (value: unknown, field: string): string => {
  const normalized = storedString(value, field);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(normalized)) {
    return authorityError(`Persisted field "${field}" is invalid.`);
  }
  return normalized;
};

export const positiveInteger = (value: unknown, field: string): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    return validationError(`Field "${field}" must be a positive integer.`);
  }
  return value;
};

export const storedPositiveInteger = (
  value: unknown,
  field: string,
  fallback?: number,
): number => {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    return authorityError(`Persisted field "${field}" is invalid.`);
  }
  return value;
};

export const normalizedLimit = (value: unknown): number => {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_COMMERCIAL_PAGE;
  }
  const normalized = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < 1 ||
    normalized > MAX_COMMERCIAL_PAGE) {
    return validationError(
      `Field "limit" must be an integer from 1 to ${MAX_COMMERCIAL_PAGE}.`,
    );
  }
  return normalized;
};

export const timestamp = (value: unknown, field: string): Timestamp => {
  if (!(value instanceof Timestamp) || Number.isNaN(value.toMillis())) {
    return authorityError(`Persisted field "${field}" is invalid.`);
  }
  return value;
};

export const optionalTimestampIso = (
  value: unknown,
  field: string,
): string | null => value === undefined || value === null ?
  null : timestamp(value, field).toDate().toISOString();

export const isoDate = (value: unknown, field: string): string => {
  const normalized = requiredString(value, field, 64);
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return validationError(`Field "${field}" must be an ISO timestamp.`);
  }
  return parsed.toISOString();
};

export const stableSerialize = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

export const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

export const commandAuthority = (input: {
  actorId: string;
  idempotencyKey: string;
  intent: unknown;
  prefix: string;
  scope: string;
}): {
  auditEventId: string;
  commandId: string;
  fingerprint: string;
  idempotencyKeyHash: string;
  operationId: string;
} => {
  const normalizedKey = requiredString(
    input.idempotencyKey,
    "idempotencyKey",
    64,
  ).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(normalizedKey)) {
    return validationError("Field \"idempotencyKey\" must be a UUID.");
  }
  const keyHash = sha256(`${input.actorId}:${input.scope}:${normalizedKey}`);
  const suffix = keyHash.slice(0, 40);
  return {
    auditEventId: `${input.prefix}_audit_${suffix}`,
    commandId: `${input.prefix}_command_${suffix}`,
    fingerprint: sha256(stableSerialize(input.intent)),
    idempotencyKeyHash: keyHash,
    operationId: `${input.prefix}_operation_${suffix}`,
  };
};

export const normalizeMoney = (value: unknown, field: string): VendorMoney => {
  if (!isRecord(value) || typeof value.amountMinor !== "number" ||
    !Number.isSafeInteger(value.amountMinor) || value.amountMinor < 0) {
    return validationError(`Field "${field}.amountMinor" must be a non-negative integer.`);
  }
  const currency = requiredString(value.currency, `${field}.currency`, 3)
    .toUpperCase();
  if (!/^[A-Z]{3}$/u.test(currency)) {
    return validationError(`Field "${field}.currency" must be an ISO currency code.`);
  }
  return {amountMinor: value.amountMinor, currency};
};

export const storedMoney = (
  value: Record<string, unknown>,
  prefix: string,
  legacyAmount?: unknown,
): VendorMoney => {
  const amountMinor = value[`${prefix}Minor`];
  const currency = storedString(value.currency, `${prefix}.currency`).toUpperCase();
  const normalizedAmount = typeof amountMinor === "number" &&
    Number.isSafeInteger(amountMinor) && amountMinor >= 0 ? amountMinor :
    typeof legacyAmount === "number" && Number.isFinite(legacyAmount) &&
      legacyAmount >= 0 ? Math.round(legacyAmount * 100) : null;
  if (normalizedAmount === null || !/^[A-Z]{3}$/u.test(currency)) {
    return authorityError(`Persisted money field "${prefix}" is invalid.`);
  }
  return {amountMinor: normalizedAmount, currency};
};

export const providerOperation = (input: {
  attemptCount: number;
  errorCode?: string | null;
  nextAttemptAt?: Date | null;
  operationId: string;
  provider: "stripe" | "manual";
  state: VendorCommercialProviderState;
  updatedAt: Date;
}): VendorCommercialProviderOperation => ({
  attemptCount: input.attemptCount,
  lastErrorCode: input.errorCode ?? null,
  nextAttemptAt: input.nextAttemptAt?.toISOString() ?? null,
  operationId: input.operationId,
  provider: input.provider,
  state: input.state,
  updatedAt: input.updatedAt.toISOString(),
});

export const providerResultOperation = (input: {
  attemptCount: number;
  operationId: string;
  provider: "stripe" | "manual";
  result: VendorCommercialProviderResult;
  updatedAt: Date;
}): VendorCommercialProviderOperation => providerOperation({
  attemptCount: input.attemptCount,
  errorCode: input.result.errorCode ?? null,
  nextAttemptAt: input.result.state === "failed_retryable" ?
    new Date(input.updatedAt.getTime() + 5 * 60 * 1000) : null,
  operationId: input.operationId,
  provider: input.provider,
  state: input.result.state,
  updatedAt: input.updatedAt,
});

export const assertReplayCommand = (
  value: unknown,
  fingerprint: string,
  keyHash: string,
): Record<string, unknown> => {
  if (!isRecord(value) || value.fingerprint !== fingerprint ||
    value.idempotencyKeyHash !== keyHash) {
    return conflictError(
      "Idempotency key was already used for different commercial intent.",
    );
  }
  return value;
};

export const dualAuditDocument = (input: {
  action: string;
  actorId: string;
  actorRole: "vendor";
  auditEventId: string;
  fingerprint: string;
  idempotencyKeyHash: string;
  instituteId?: string;
  occurredAt: Timestamp;
  summary: string;
  targetId: string;
}) => ({
  action: input.action,
  actorRole: input.actorRole,
  actorUserId: input.actorId,
  auditEventId: input.auditEventId,
  fingerprint: input.fingerprint,
  idempotencyKeyHash: input.idempotencyKeyHash,
  instituteId: input.instituteId ?? null,
  occurredAt: input.occurredAt,
  summary: input.summary,
  targetId: input.targetId,
});
