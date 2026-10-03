import { ApiClientError } from "../../../../../shared/services/apiClient";
import { getPortalApiClient } from "../../../../../shared/services/portalIntegration";
import type {
  VendorBillingCommunicationIntent,
  VendorBillingCommunicationReceipt,
  VendorCommercialAuditReference,
  VendorCommercialProviderOperation,
  VendorInvoiceCommandIntent,
  VendorInvoiceCommandReceipt,
  VendorInvoiceDetail,
  VendorInvoiceListQuery,
  VendorInvoiceListResult,
  VendorInvoiceSummary,
  VendorLicenseCatalogCommandIntent,
  VendorLicenseCatalogCommandReceipt,
  VendorLicenseCatalogResult,
  VendorLicensePlanVersion,
  VendorLicenseRequestDecisionIntent,
  VendorLicenseRequestDecisionReceipt,
  VendorLicenseRequestDetail,
  VendorLicenseRequestListQuery,
  VendorLicenseRequestListResult,
  VendorLicenseRequestSummary,
  VendorMoney,
  VendorOfflinePaymentCommandIntent,
  VendorOfflinePaymentCommandReceipt,
  VendorOfflinePaymentSummary,
  VendorPaymentAttemptSummary,
  VendorPaymentEventCommandIntent,
  VendorPaymentEventCommandReceipt,
  VendorPaymentEventListQuery,
  VendorPaymentEventListResult,
  VendorPaymentEventSummary,
  VendorSubscriptionCommandIntent,
  VendorSubscriptionCommandReceipt,
  VendorSubscriptionDetail,
} from "../../../../../shared/contracts/vendorCommercial";

type RecordValue = Record<string, unknown>;

const apiClient = getPortalApiClient("vendor");

export type VendorCommercialFailureKind =
  | "conflict"
  | "permission"
  | "provider_unavailable"
  | "unavailable"
  | "validation";

export interface VendorCommercialFailure {
  kind: VendorCommercialFailureKind;
  message: string;
  requestId: string | null;
}

function invalid(path: string, expectation: string): never {
  throw new Error(`Invalid Vendor commercial response at ${path}: ${expectation}.`);
}

function record(value: unknown, path: string): RecordValue {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return invalid(path, "expected an object");
  }
  return value as RecordValue;
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string") return invalid(path, "expected text");
  return value;
}

function nullableText(value: unknown, path: string): string | null {
  return value === null ? null : text(value, path);
}

function integer(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    return invalid(path, "expected a non-negative safe integer");
  }
  return Number(value);
}

function positiveInteger(value: unknown, path: string): number {
  const parsed = integer(value, path);
  if (parsed < 1) return invalid(path, "expected a positive integer");
  return parsed;
}

function booleanValue(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") return invalid(path, "expected a boolean");
  return value;
}

function oneOf<const Value extends string>(
  value: unknown,
  allowed: readonly Value[],
  path: string,
): Value {
  if (typeof value !== "string" || !allowed.includes(value as Value)) {
    return invalid(path, `expected one of ${allowed.join(", ")}`);
  }
  return value as Value;
}

function list<Value>(
  value: unknown,
  path: string,
  parser: (item: unknown, itemPath: string) => Value,
): Value[] {
  if (!Array.isArray(value)) return invalid(path, "expected an array");
  return value.map((item, index) => parser(item, `${path}[${index}]`));
}

const LAYERS = ["L0", "L1", "L2", "L3"] as const;
const REQUEST_STATUSES = ["pending", "payment_required", "approved", "rejected"] as const;
const DECISION_STATES = ["undecided", "provider_pending", "provider_failed", "decided"] as const;
const PROVIDER_STATES = [
  "not_required",
  "pending",
  "processing",
  "succeeded",
  "failed_retryable",
  "failed_terminal",
] as const;
const SUBSCRIPTION_STATUSES = [
  "not_configured",
  "trialing",
  "active",
  "past_due",
  "paused",
  "canceled",
  "incomplete",
  "provider_unavailable",
] as const;
const INVOICE_STATUSES = [
  "draft",
  "open",
  "past_due",
  "paid",
  "void",
  "uncollectible",
  "provider_unavailable",
] as const;
const OFFLINE_STATUSES = [
  "pending_verification",
  "verified",
  "rejected",
  "voided",
  "provider_pending",
  "provider_failed",
] as const;
const PROCESSING_STATES = [
  "received",
  "processing",
  "applied",
  "ignored",
  "failed_retryable",
  "failed_terminal",
] as const;
const RECONCILIATION_STATES = ["pending", "reconciled", "mismatch", "manual_review"] as const;

function parseMoney(value: unknown, path: string): VendorMoney {
  const item = record(value, path);
  const currency = text(item.currency, `${path}.currency`);
  if (!/^[A-Z]{3}$/u.test(currency)) return invalid(`${path}.currency`, "expected ISO currency");
  return { amountMinor: integer(item.amountMinor, `${path}.amountMinor`), currency };
}

function parseProviderOperation(
  value: unknown,
  path: string,
): VendorCommercialProviderOperation {
  const item = record(value, path);
  return {
    attemptCount: integer(item.attemptCount, `${path}.attemptCount`),
    lastErrorCode: nullableText(item.lastErrorCode, `${path}.lastErrorCode`),
    nextAttemptAt: nullableText(item.nextAttemptAt, `${path}.nextAttemptAt`),
    operationId: text(item.operationId, `${path}.operationId`),
    provider: oneOf(item.provider, ["stripe", "manual"] as const, `${path}.provider`),
    state: oneOf(item.state, PROVIDER_STATES, `${path}.state`),
    updatedAt: text(item.updatedAt, `${path}.updatedAt`),
  };
}

function nullableProviderOperation(
  value: unknown,
  path: string,
): VendorCommercialProviderOperation | null {
  return value === null ? null : parseProviderOperation(value, path);
}

function parseAudit(value: unknown, path: string): VendorCommercialAuditReference {
  const item = record(value, path);
  return {
    auditEventId: text(item.auditEventId, `${path}.auditEventId`),
    occurredAt: text(item.occurredAt, `${path}.occurredAt`),
  };
}

function parseRequestSummary(value: unknown, path: string): VendorLicenseRequestSummary {
  const item = record(value, path);
  return {
    createdAt: text(item.createdAt, `${path}.createdAt`),
    currentLayer: oneOf(item.currentLayer, LAYERS, `${path}.currentLayer`),
    decisionState: oneOf(item.decisionState, DECISION_STATES, `${path}.decisionState`),
    instituteId: text(item.instituteId, `${path}.instituteId`),
    requestId: text(item.requestId, `${path}.requestId`),
    requestedLayer: oneOf(item.requestedLayer, LAYERS, `${path}.requestedLayer`),
    requestedPlanId: text(item.requestedPlanId, `${path}.requestedPlanId`),
    revision: positiveInteger(item.revision, `${path}.revision`),
    status: oneOf(item.status, REQUEST_STATUSES, `${path}.status`),
    updatedAt: text(item.updatedAt, `${path}.updatedAt`),
  };
}

function parseRequestList(value: unknown): VendorLicenseRequestListResult {
  const item = record(value, "licenseRequests");
  return {
    items: list(item.items, "licenseRequests.items", parseRequestSummary),
    nextCursor: nullableText(item.nextCursor, "licenseRequests.nextCursor"),
    totalMatching: integer(item.totalMatching, "licenseRequests.totalMatching"),
  };
}

function parseRequestDetail(value: unknown): VendorLicenseRequestDetail {
  const item = record(value, "licenseRequest");
  return {
    ...parseRequestSummary(item, "licenseRequest"),
    audit: list(item.audit, "licenseRequest.audit", parseAudit),
    decisionNote: nullableText(item.decisionNote, "licenseRequest.decisionNote"),
    providerOperation: nullableProviderOperation(
      item.providerOperation,
      "licenseRequest.providerOperation",
    ),
    reason: text(item.reason, "licenseRequest.reason"),
    requestKind: oneOf(
      item.requestKind,
      ["evaluation", "upgrade"] as const,
      "licenseRequest.requestKind",
    ),
  };
}

function parseRequestReceipt(value: unknown): VendorLicenseRequestDecisionReceipt {
  const item = record(value, "licenseRequestDecision");
  return {
    auditEventId: text(item.auditEventId, "licenseRequestDecision.auditEventId"),
    commandId: text(item.commandId, "licenseRequestDecision.commandId"),
    completedAt: text(item.completedAt, "licenseRequestDecision.completedAt"),
    decisionState: oneOf(item.decisionState, DECISION_STATES, "licenseRequestDecision.decisionState"),
    propagationState: oneOf(
      item.propagationState,
      ["not_required", "pending_bwm_036"] as const,
      "licenseRequestDecision.propagationState",
    ),
    providerOperation: nullableProviderOperation(
      item.providerOperation,
      "licenseRequestDecision.providerOperation",
    ),
    replayed: booleanValue(item.replayed, "licenseRequestDecision.replayed"),
    requestId: text(item.requestId, "licenseRequestDecision.requestId"),
    revision: positiveInteger(item.revision, "licenseRequestDecision.revision"),
    status: oneOf(item.status, REQUEST_STATUSES, "licenseRequestDecision.status"),
  };
}

function parsePlan(value: unknown, path: string): VendorLicensePlanVersion {
  const item = record(value, path);
  const limits = record(item.limits, `${path}.limits`);
  const features = record(item.featureFlags, `${path}.featureFlags`);
  return {
    billingInterval: oneOf(item.billingInterval, ["month", "year"] as const, `${path}.billingInterval`),
    createdAt: text(item.createdAt, `${path}.createdAt`),
    featureFlags: {
      advancedAnalytics: booleanValue(features.advancedAnalytics, `${path}.featureFlags.advancedAnalytics`),
      customStrategies: booleanValue(features.customStrategies, `${path}.featureFlags.customStrategies`),
      governanceAccess: booleanValue(features.governanceAccess, `${path}.featureFlags.governanceAccess`),
      whiteLabeling: booleanValue(features.whiteLabeling, `${path}.featureFlags.whiteLabeling`),
      yearOverYearAnalytics: booleanValue(
        features.yearOverYearAnalytics,
        `${path}.featureFlags.yearOverYearAnalytics`,
      ),
    },
    layer: oneOf(item.layer, LAYERS, `${path}.layer`),
    limits: {
      maxAdministrators: integer(limits.maxAdministrators, `${path}.limits.maxAdministrators`),
      maxStudents: integer(limits.maxStudents, `${path}.limits.maxStudents`),
      maxTeachers: integer(limits.maxTeachers, `${path}.limits.maxTeachers`),
    },
    planId: text(item.planId, `${path}.planId`),
    price: parseMoney(item.price, `${path}.price`),
    revision: positiveInteger(item.revision, `${path}.revision`),
    status: oneOf(item.status, ["draft", "published", "retired"] as const, `${path}.status`),
    versionId: text(item.versionId, `${path}.versionId`),
  };
}

function parseCatalog(value: unknown): VendorLicenseCatalogResult {
  const item = record(value, "licenseCatalog");
  return {
    catalogRevision: integer(item.catalogRevision, "licenseCatalog.catalogRevision"),
    plans: list(item.plans, "licenseCatalog.plans", parsePlan),
  };
}

function parseCatalogReceipt(value: unknown): VendorLicenseCatalogCommandReceipt {
  const item = record(value, "licenseCatalogCommand");
  return {
    auditEventId: text(item.auditEventId, "licenseCatalogCommand.auditEventId"),
    catalogRevision: positiveInteger(item.catalogRevision, "licenseCatalogCommand.catalogRevision"),
    commandId: text(item.commandId, "licenseCatalogCommand.commandId"),
    completedAt: text(item.completedAt, "licenseCatalogCommand.completedAt"),
    plan: parsePlan(item.plan, "licenseCatalogCommand.plan"),
    providerOperation: parseProviderOperation(
      item.providerOperation,
      "licenseCatalogCommand.providerOperation",
    ),
    replayed: booleanValue(item.replayed, "licenseCatalogCommand.replayed"),
  };
}

function parseSubscription(value: unknown): VendorSubscriptionDetail {
  const item = record(value, "subscription");
  return {
    cancelAtPeriodEnd: booleanValue(item.cancelAtPeriodEnd, "subscription.cancelAtPeriodEnd"),
    currentPeriodEndsAt: nullableText(item.currentPeriodEndsAt, "subscription.currentPeriodEndsAt"),
    currentPeriodStartsAt: nullableText(
      item.currentPeriodStartsAt,
      "subscription.currentPeriodStartsAt",
    ),
    instituteId: text(item.instituteId, "subscription.instituteId"),
    planId: nullableText(item.planId, "subscription.planId"),
    planVersionId: nullableText(item.planVersionId, "subscription.planVersionId"),
    provider: item.provider === null
      ? null
      : oneOf(item.provider, ["stripe", "manual"] as const, "subscription.provider"),
    providerOperation: nullableProviderOperation(item.providerOperation, "subscription.providerOperation"),
    revision: positiveInteger(item.revision, "subscription.revision"),
    status: oneOf(item.status, SUBSCRIPTION_STATUSES, "subscription.status"),
    trialEndsAt: nullableText(item.trialEndsAt, "subscription.trialEndsAt"),
    updatedAt: text(item.updatedAt, "subscription.updatedAt"),
  };
}

function parseSubscriptionReceipt(value: unknown): VendorSubscriptionCommandReceipt {
  const item = record(value, "subscriptionCommand");
  return {
    auditEventId: text(item.auditEventId, "subscriptionCommand.auditEventId"),
    commandId: text(item.commandId, "subscriptionCommand.commandId"),
    completedAt: text(item.completedAt, "subscriptionCommand.completedAt"),
    propagationState: oneOf(
      item.propagationState,
      ["not_required", "pending_bwm_036"] as const,
      "subscriptionCommand.propagationState",
    ),
    providerOperation: parseProviderOperation(
      item.providerOperation,
      "subscriptionCommand.providerOperation",
    ),
    replayed: booleanValue(item.replayed, "subscriptionCommand.replayed"),
    revision: positiveInteger(item.revision, "subscriptionCommand.revision"),
    status: oneOf(item.status, SUBSCRIPTION_STATUSES, "subscriptionCommand.status"),
  };
}

function parseInvoiceSummary(value: unknown, path: string): VendorInvoiceSummary {
  const item = record(value, path);
  return {
    amountDue: parseMoney(item.amountDue, `${path}.amountDue`),
    amountPaid: parseMoney(item.amountPaid, `${path}.amountPaid`),
    dueAt: nullableText(item.dueAt, `${path}.dueAt`),
    instituteId: text(item.instituteId, `${path}.instituteId`),
    invoiceId: text(item.invoiceId, `${path}.invoiceId`),
    issuedAt: nullableText(item.issuedAt, `${path}.issuedAt`),
    provider: oneOf(item.provider, ["stripe", "manual"] as const, `${path}.provider`),
    revision: positiveInteger(item.revision, `${path}.revision`),
    status: oneOf(item.status, INVOICE_STATUSES, `${path}.status`),
    updatedAt: text(item.updatedAt, `${path}.updatedAt`),
  };
}

function parseInvoiceList(value: unknown): VendorInvoiceListResult {
  const item = record(value, "invoices");
  return {
    items: list(item.items, "invoices.items", parseInvoiceSummary),
    nextCursor: nullableText(item.nextCursor, "invoices.nextCursor"),
    totalMatching: integer(item.totalMatching, "invoices.totalMatching"),
  };
}

function parsePaymentAttempt(value: unknown, path: string): VendorPaymentAttemptSummary {
  const item = record(value, path);
  return {
    amount: parseMoney(item.amount, `${path}.amount`),
    attemptId: text(item.attemptId, `${path}.attemptId`),
    occurredAt: text(item.occurredAt, `${path}.occurredAt`),
    providerEventId: nullableText(item.providerEventId, `${path}.providerEventId`),
    state: oneOf(item.state, ["pending", "succeeded", "failed"] as const, `${path}.state`),
  };
}

function parseOfflinePayment(value: unknown, path: string): VendorOfflinePaymentSummary {
  const item = record(value, path);
  return {
    amount: parseMoney(item.amount, `${path}.amount`),
    method: oneOf(
      item.method,
      ["bank_transfer", "upi", "cheque", "other"] as const,
      `${path}.method`,
    ),
    occurredAt: text(item.occurredAt, `${path}.occurredAt`),
    offlinePaymentId: text(item.offlinePaymentId, `${path}.offlinePaymentId`),
    recordedAt: text(item.recordedAt, `${path}.recordedAt`),
    revision: positiveInteger(item.revision, `${path}.revision`),
    status: oneOf(item.status, OFFLINE_STATUSES, `${path}.status`),
  };
}

function parseInvoiceDetail(value: unknown): VendorInvoiceDetail {
  const item = record(value, "invoice");
  const actions = record(item.externalActions, "invoice.externalActions");
  return {
    ...parseInvoiceSummary(item, "invoice"),
    externalActions: {
      downloadUrl: nullableText(actions.downloadUrl, "invoice.externalActions.downloadUrl"),
      expiresAt: nullableText(actions.expiresAt, "invoice.externalActions.expiresAt"),
      hostedPaymentUrl: nullableText(
        actions.hostedPaymentUrl,
        "invoice.externalActions.hostedPaymentUrl",
      ),
    },
    offlinePayments: list(item.offlinePayments, "invoice.offlinePayments", parseOfflinePayment),
    paymentAttempts: list(item.paymentAttempts, "invoice.paymentAttempts", parsePaymentAttempt),
    providerOperation: nullableProviderOperation(item.providerOperation, "invoice.providerOperation"),
  };
}

function parseInvoiceReceipt(value: unknown): VendorInvoiceCommandReceipt {
  const item = record(value, "invoiceCommand");
  return {
    auditEventId: text(item.auditEventId, "invoiceCommand.auditEventId"),
    commandId: text(item.commandId, "invoiceCommand.commandId"),
    completedAt: text(item.completedAt, "invoiceCommand.completedAt"),
    providerOperation: parseProviderOperation(item.providerOperation, "invoiceCommand.providerOperation"),
    replayed: booleanValue(item.replayed, "invoiceCommand.replayed"),
    revision: positiveInteger(item.revision, "invoiceCommand.revision"),
    status: oneOf(item.status, INVOICE_STATUSES, "invoiceCommand.status"),
  };
}

function parseCommunicationReceipt(value: unknown): VendorBillingCommunicationReceipt {
  const item = record(value, "billingCommunication");
  return {
    auditEventId: text(item.auditEventId, "billingCommunication.auditEventId"),
    commandId: text(item.commandId, "billingCommunication.commandId"),
    completedAt: text(item.completedAt, "billingCommunication.completedAt"),
    deliveryId: text(item.deliveryId, "billingCommunication.deliveryId"),
    deliveryState: oneOf(
      item.deliveryState,
      ["queued", "delivered", "failed_retryable"] as const,
      "billingCommunication.deliveryState",
    ),
    recipientClass: oneOf(
      item.recipientClass,
      ["institute_billing_contact"] as const,
      "billingCommunication.recipientClass",
    ),
    replayed: booleanValue(item.replayed, "billingCommunication.replayed"),
  };
}

function parseOfflineReceipt(value: unknown): VendorOfflinePaymentCommandReceipt {
  const item = record(value, "offlinePaymentCommand");
  return {
    auditEventId: text(item.auditEventId, "offlinePaymentCommand.auditEventId"),
    commandId: text(item.commandId, "offlinePaymentCommand.commandId"),
    completedAt: text(item.completedAt, "offlinePaymentCommand.completedAt"),
    invoiceRevision: positiveInteger(item.invoiceRevision, "offlinePaymentCommand.invoiceRevision"),
    offlinePayment: parseOfflinePayment(
      item.offlinePayment,
      "offlinePaymentCommand.offlinePayment",
    ),
    providerOperation: parseProviderOperation(
      item.providerOperation,
      "offlinePaymentCommand.providerOperation",
    ),
    replayed: booleanValue(item.replayed, "offlinePaymentCommand.replayed"),
  };
}

function parsePaymentEvent(value: unknown, path: string): VendorPaymentEventSummary {
  const item = record(value, path);
  return {
    eventId: text(item.eventId, `${path}.eventId`),
    eventType: text(item.eventType, `${path}.eventType`),
    instituteId: nullableText(item.instituteId, `${path}.instituteId`),
    occurredAt: text(item.occurredAt, `${path}.occurredAt`),
    processingState: oneOf(item.processingState, PROCESSING_STATES, `${path}.processingState`),
    provider: oneOf(item.provider, ["stripe", "manual"] as const, `${path}.provider`),
    reconciliationState: oneOf(
      item.reconciliationState,
      RECONCILIATION_STATES,
      `${path}.reconciliationState`,
    ),
    revision: positiveInteger(item.revision, `${path}.revision`),
    updatedAt: text(item.updatedAt, `${path}.updatedAt`),
  };
}

function parsePaymentEventList(value: unknown): VendorPaymentEventListResult {
  const item = record(value, "paymentEvents");
  return {
    items: list(item.items, "paymentEvents.items", parsePaymentEvent),
    nextCursor: nullableText(item.nextCursor, "paymentEvents.nextCursor"),
    totalMatching: integer(item.totalMatching, "paymentEvents.totalMatching"),
  };
}

function parsePaymentEventReceipt(value: unknown): VendorPaymentEventCommandReceipt {
  const item = record(value, "paymentEventCommand");
  return {
    auditEventId: text(item.auditEventId, "paymentEventCommand.auditEventId"),
    commandId: text(item.commandId, "paymentEventCommand.commandId"),
    completedAt: text(item.completedAt, "paymentEventCommand.completedAt"),
    processingState: oneOf(
      item.processingState,
      PROCESSING_STATES,
      "paymentEventCommand.processingState",
    ),
    providerOperation: parseProviderOperation(
      item.providerOperation,
      "paymentEventCommand.providerOperation",
    ),
    reconciliationState: oneOf(
      item.reconciliationState,
      RECONCILIATION_STATES,
      "paymentEventCommand.reconciliationState",
    ),
    replayed: booleanValue(item.replayed, "paymentEventCommand.replayed"),
    revision: positiveInteger(item.revision, "paymentEventCommand.revision"),
  };
}

function encode(value: string): string {
  return encodeURIComponent(value);
}

const readyOptions = { emptyResultIsReady: true, handledFailureIsReady: true } as const;

export const vendorCommercialApi = {
  listLicenseRequests: (query: VendorLicenseRequestListQuery, signal?: AbortSignal) =>
    apiClient.get<VendorLicenseRequestListResult>("/vendor/license-requests", {
      ...readyOptions,
      query: { ...query },
      responseAdapter: parseRequestList,
      signal,
    }),
  getLicenseRequest: (instituteId: string, requestId: string, signal?: AbortSignal) =>
    apiClient.get<VendorLicenseRequestDetail>(
      `/vendor/institutes/${encode(instituteId)}/license-requests/${encode(requestId)}`,
      { ...readyOptions, responseAdapter: parseRequestDetail, signal },
    ),
  decideLicenseRequest: (
    instituteId: string,
    requestId: string,
    intent: VendorLicenseRequestDecisionIntent,
  ) => apiClient.post<VendorLicenseRequestDecisionReceipt, VendorLicenseRequestDecisionIntent>(
    `/vendor/institutes/${encode(instituteId)}/license-requests/${encode(requestId)}/decision`,
    { ...readyOptions, body: intent, responseAdapter: parseRequestReceipt },
  ),
  getLicenseCatalog: (signal?: AbortSignal) =>
    apiClient.get<VendorLicenseCatalogResult>("/vendor/license-catalog", {
      ...readyOptions,
      responseAdapter: parseCatalog,
      signal,
    }),
  commandLicenseCatalog: (intent: VendorLicenseCatalogCommandIntent) =>
    apiClient.post<VendorLicenseCatalogCommandReceipt, VendorLicenseCatalogCommandIntent>(
      "/vendor/license-catalog/commands",
      { ...readyOptions, body: intent, responseAdapter: parseCatalogReceipt },
    ),
  getSubscription: (instituteId: string, signal?: AbortSignal) =>
    apiClient.get<VendorSubscriptionDetail>(
      `/vendor/institutes/${encode(instituteId)}/subscription`,
      { ...readyOptions, responseAdapter: parseSubscription, signal },
    ),
  commandSubscription: (instituteId: string, intent: VendorSubscriptionCommandIntent) =>
    apiClient.post<VendorSubscriptionCommandReceipt, VendorSubscriptionCommandIntent>(
      `/vendor/institutes/${encode(instituteId)}/subscription/commands`,
      { ...readyOptions, body: intent, responseAdapter: parseSubscriptionReceipt },
    ),
  listInvoices: (query: VendorInvoiceListQuery, signal?: AbortSignal) =>
    apiClient.get<VendorInvoiceListResult>("/vendor/invoices", {
      ...readyOptions,
      query: { ...query },
      responseAdapter: parseInvoiceList,
      signal,
    }),
  getInvoice: (instituteId: string, invoiceId: string, signal?: AbortSignal) =>
    apiClient.get<VendorInvoiceDetail>(
      `/vendor/institutes/${encode(instituteId)}/invoices/${encode(invoiceId)}`,
      { ...readyOptions, responseAdapter: parseInvoiceDetail, signal },
    ),
  commandInvoice: (instituteId: string, invoiceId: string, intent: VendorInvoiceCommandIntent) =>
    apiClient.post<VendorInvoiceCommandReceipt, VendorInvoiceCommandIntent>(
      `/vendor/institutes/${encode(instituteId)}/invoices/${encode(invoiceId)}/commands`,
      { ...readyOptions, body: intent, responseAdapter: parseInvoiceReceipt },
    ),
  communicateInvoice: (
    instituteId: string,
    invoiceId: string,
    intent: VendorBillingCommunicationIntent,
  ) => apiClient.post<VendorBillingCommunicationReceipt, VendorBillingCommunicationIntent>(
    `/vendor/institutes/${encode(instituteId)}/invoices/${encode(invoiceId)}/communications`,
    { ...readyOptions, body: intent, responseAdapter: parseCommunicationReceipt },
  ),
  commandOfflinePayment: (
    instituteId: string,
    invoiceId: string,
    intent: VendorOfflinePaymentCommandIntent,
  ) => apiClient.post<VendorOfflinePaymentCommandReceipt, VendorOfflinePaymentCommandIntent>(
    `/vendor/institutes/${encode(instituteId)}/invoices/${encode(invoiceId)}/offline-payments`,
    { ...readyOptions, body: intent, responseAdapter: parseOfflineReceipt },
  ),
  listPaymentEvents: (query: VendorPaymentEventListQuery, signal?: AbortSignal) =>
    apiClient.get<VendorPaymentEventListResult>("/vendor/payment-events", {
      ...readyOptions,
      query: { ...query },
      responseAdapter: parsePaymentEventList,
      signal,
    }),
  retryPaymentEvent: (eventId: string, intent: VendorPaymentEventCommandIntent) =>
    apiClient.post<VendorPaymentEventCommandReceipt, VendorPaymentEventCommandIntent>(
      `/vendor/payment-events/${encode(eventId)}/commands`,
      { ...readyOptions, body: intent, responseAdapter: parsePaymentEventReceipt },
    ),
};

export function createCommercialIdempotencyKey(): string {
  return crypto.randomUUID();
}

export function providerFailure(
  operation: VendorCommercialProviderOperation | null,
): VendorCommercialFailure | null {
  if (!operation || !["failed_retryable", "failed_terminal"].includes(operation.state)) {
    return null;
  }
  return {
    kind: "provider_unavailable",
    message: operation.lastErrorCode === "provider_not_configured"
      ? "The payment provider is not configured. The command remains retryable; no success was recorded."
      : "The payment provider did not complete the command. Authoritative failure state was retained.",
    requestId: null,
  };
}

export function classifyVendorCommercialFailure(error: unknown): VendorCommercialFailure {
  if (error instanceof ApiClientError) {
    if (error.status === 401 || error.status === 403) {
      return {
        kind: "permission",
        message: "Your current Vendor session cannot manage commercial authority.",
        requestId: error.requestId,
      };
    }
    if (error.status === 409 || error.code === "CONFLICT") {
      return {
        kind: "conflict",
        message: "Authoritative commercial state changed. Reload before retrying.",
        requestId: error.requestId,
      };
    }
    if (error.status === 400 || error.status === 422 || error.code === "VALIDATION_ERROR") {
      return { kind: "validation", message: error.message, requestId: error.requestId };
    }
    return {
      kind: "unavailable",
      message: error.message || "Commercial authority is temporarily unavailable.",
      requestId: error.requestId,
    };
  }
  return {
    kind: "unavailable",
    message: error instanceof Error
      ? error.message
      : "The commercial response could not be validated. No fallback data is shown.",
    requestId: null,
  };
}
