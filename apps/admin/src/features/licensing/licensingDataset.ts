import { ApiClientError } from "../../../../../shared/services/apiClient";
import { shouldUseFixtureData } from "../../../../../shared/services/frontendEnvironment";
import { getPortalApiClient } from "../../../../../shared/services/portalIntegration";
import type {
  AdminCurrentLicenseSnapshot,
  AdminLicenseBillingPage,
  AdminLicenseBillingRecordSnapshot,
  AdminLicenseCapabilityLockReason,
  AdminLicenseCapabilitySnapshot,
  AdminLicenseCapabilityState,
  AdminLicenseExternalAction,
  AdminLicenseFeatureFlags,
  AdminLicenseHistoryEntrySnapshot,
  AdminLicenseHistoryPage,
  AdminLicenseLayer,
  AdminLicensePlanSnapshot,
  AdminLicenseRequestKind,
  AdminLicenseRequestPage,
  AdminLicenseRequestStatus,
  AdminLicenseSnapshot,
  AdminLicenseUpgradeRequestReceipt,
  AdminLicenseUpgradeRequestSnapshot,
  AdminLicenseUsageSnapshot,
} from "../../../../../shared/contracts/adminLicensing";

const apiClient = getPortalApiClient("admin");
const LICENSE_LAYERS = new Set<AdminLicenseLayer>(["L0", "L1", "L2", "L3"]);
const CAPABILITY_STATES = new Set<AdminLicenseCapabilityState>(["enabled", "locked"]);
const CAPABILITY_LOCK_REASONS = new Set<AdminLicenseCapabilityLockReason>([
  "feature_disabled",
  "license_expired",
  "license_grace",
  "minimum_layer",
]);
const REQUEST_STATUSES = new Set<AdminLicenseRequestStatus>([
  "pending",
  "payment_required",
  "approved",
  "rejected",
]);
const EXTERNAL_ACTIONS = new Set<AdminLicenseExternalAction["action"]>([
  "billing_history",
  "contact_support",
  "invoice_download",
  "payment_method",
]);
const FEATURE_FLAG_NAMES = new Set<keyof AdminLicenseFeatureFlags>([
  "adaptivePhase",
  "controlledMode",
  "governanceAccess",
  "hardMode",
  "riskOverview",
]);

export type AdminLicensingSnapshot = AdminLicenseSnapshot;
export type AdminLicensePlan = AdminLicensePlanSnapshot;
export type AdminLicenseRequest = AdminLicenseUpgradeRequestSnapshot;

export interface SubmitLicenseUpgradeRequestInput {
  expectedLicenseVersion: string;
  idempotencyKey: string;
  reason: string;
  requestKind: AdminLicenseRequestKind;
  requestedPlanId: string;
}

export interface SubmitLicenseUpgradeRequestResult {
  receipt: AdminLicenseUpgradeRequestReceipt;
  snapshot: AdminLicensingSnapshot;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredObject(value: unknown, field: string): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new Error(`Licensing response field "${field}" is invalid.`);
  }
  return value;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Licensing response field "${field}" is invalid.`);
  }
  return value.trim();
}

function nullableString(value: unknown, field: string): string | null {
  return value === null ? null : requiredString(value, field);
}

function requiredIso(value: unknown, field: string): string {
  const normalized = requiredString(value, field);
  if (Number.isNaN(Date.parse(normalized))) {
    throw new Error(`Licensing response field "${field}" is not a valid timestamp.`);
  }
  return normalized;
}

function nullableIso(value: unknown, field: string): string | null {
  return value === null ? null : requiredIso(value, field);
}

function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Licensing response field "${field}" is invalid.`);
  }
  return value;
}

function requiredNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`Licensing response field "${field}" is invalid.`);
  }
  return value;
}

function requiredInteger(value: unknown, field: string): number {
  const normalized = requiredNumber(value, field);
  if (!Number.isInteger(normalized)) {
    throw new Error(`Licensing response field "${field}" is invalid.`);
  }
  return normalized;
}

function nullableInteger(value: unknown, field: string): number | null {
  return value === null ? null : requiredInteger(value, field);
}

function nullableNumber(value: unknown, field: string): number | null {
  return value === null ? null : requiredNumber(value, field);
}

function strictArray(value: unknown, field: string, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) {
    throw new Error(`Licensing response field "${field}" is invalid or exceeds ${maximum} items.`);
  }
  return value;
}

function normalizeLayer(value: unknown, field: string): AdminLicenseLayer {
  const layer = requiredString(value, field) as AdminLicenseLayer;
  if (!LICENSE_LAYERS.has(layer)) {
    throw new Error(`Licensing response field "${field}" has an unsupported layer.`);
  }
  return layer;
}

function normalizeFeatureFlags(value: unknown, field: string): AdminLicenseFeatureFlags {
  const source = requiredObject(value, field);
  return {
    adaptivePhase: requiredBoolean(source.adaptivePhase, `${field}.adaptivePhase`),
    controlledMode: requiredBoolean(source.controlledMode, `${field}.controlledMode`),
    governanceAccess: requiredBoolean(source.governanceAccess, `${field}.governanceAccess`),
    hardMode: requiredBoolean(source.hardMode, `${field}.hardMode`),
    riskOverview: requiredBoolean(source.riskOverview, `${field}.riskOverview`),
  };
}

function normalizeCurrentLicense(value: unknown): AdminCurrentLicenseSnapshot {
  const source = requiredObject(value, "currentLicense");
  const billingCycle = requiredString(source.billingCycle, "currentLicense.billingCycle");
  const state = requiredString(source.state, "currentLicense.state");
  if (billingCycle !== "monthly" && billingCycle !== "annual") {
    throw new Error("Licensing response current billing cycle is unsupported.");
  }
  if (state !== "active" && state !== "grace" && state !== "expired") {
    throw new Error("Licensing response current license state is unsupported.");
  }
  return {
    activeStudentLimit: nullableInteger(
      source.activeStudentLimit,
      "currentLicense.activeStudentLimit",
    ),
    billingCycle,
    concurrencyLimit: nullableInteger(source.concurrencyLimit, "currentLicense.concurrencyLimit"),
    expiryDate: nullableIso(source.expiryDate, "currentLicense.expiryDate"),
    featureFlags: normalizeFeatureFlags(source.featureFlags, "currentLicense.featureFlags"),
    gracePeriodEndsAt: nullableIso(
      source.gracePeriodEndsAt,
      "currentLicense.gracePeriodEndsAt",
    ),
    instituteId: requiredString(source.instituteId, "currentLicense.instituteId"),
    instituteName: requiredString(source.instituteName, "currentLicense.instituteName"),
    layer: normalizeLayer(source.layer, "currentLicense.layer"),
    licenseVersion: requiredString(source.licenseVersion, "currentLicense.licenseVersion"),
    planId: requiredString(source.planId, "currentLicense.planId"),
    planName: nullableString(source.planName, "currentLicense.planName"),
    renewalDate: nullableIso(source.renewalDate, "currentLicense.renewalDate"),
    startDate: nullableIso(source.startDate, "currentLicense.startDate"),
    state,
  };
}

function normalizeCapability(value: unknown, index: number): AdminLicenseCapabilitySnapshot {
  const field = `capabilities[${index}]`;
  const source = requiredObject(value, field);
  const states = requiredObject(source.layers, `${field}.layers`);
  const normalizedLayers = Object.fromEntries(
    (["L0", "L1", "L2", "L3"] as const).map((layer) => {
      const state = requiredString(states[layer], `${field}.layers.${layer}`) as
        AdminLicenseCapabilityState;
      if (!CAPABILITY_STATES.has(state)) {
        throw new Error(`Licensing response ${field} has an unsupported layer state.`);
      }
      return [layer, state];
    }),
  ) as Record<AdminLicenseLayer, AdminLicenseCapabilityState>;
  const state = requiredString(source.state, `${field}.state`) as AdminLicenseCapabilityState;
  if (!CAPABILITY_STATES.has(state)) {
    throw new Error(`Licensing response ${field} has an unsupported state.`);
  }
  const lockReason = source.lockReason === null ? null :
    requiredString(source.lockReason, `${field}.lockReason`) as AdminLicenseCapabilityLockReason;
  if (lockReason !== null && !CAPABILITY_LOCK_REASONS.has(lockReason)) {
    throw new Error(`Licensing response ${field} has an unsupported lock reason.`);
  }
  const featureFlag = source.featureFlag === null ? null :
    requiredString(source.featureFlag, `${field}.featureFlag`) as keyof AdminLicenseFeatureFlags;
  if (featureFlag !== null && !FEATURE_FLAG_NAMES.has(featureFlag)) {
    throw new Error(`Licensing response ${field} has an unsupported feature flag.`);
  }
  return {
    capabilityId: requiredString(source.capabilityId, `${field}.capabilityId`),
    description: requiredString(source.description, `${field}.description`),
    featureFlag,
    label: requiredString(source.label, `${field}.label`),
    layers: normalizedLayers,
    lockReason,
    minimumLayer: normalizeLayer(source.minimumLayer, `${field}.minimumLayer`),
    state,
  };
}

function normalizePlan(value: unknown, index: number): AdminLicensePlanSnapshot {
  const field = `plans[${index}]`;
  const source = requiredObject(value, field);
  return {
    activeStudentLimit: nullableInteger(source.activeStudentLimit, `${field}.activeStudentLimit`),
    basePriceMonthly: nullableNumber(source.basePriceMonthly, `${field}.basePriceMonthly`),
    concurrencyLimit: nullableInteger(source.concurrencyLimit, `${field}.concurrencyLimit`),
    currency: nullableString(source.currency, `${field}.currency`),
    featureFlags: normalizeFeatureFlags(source.featureFlags, `${field}.featureFlags`),
    layer: normalizeLayer(source.layer, `${field}.layer`),
    monthlySessionExecutionLimit: nullableInteger(
      source.monthlySessionExecutionLimit,
      `${field}.monthlySessionExecutionLimit`,
    ),
    name: nullableString(source.name, `${field}.name`),
    planId: requiredString(source.planId, `${field}.planId`),
    pricePerStudent: nullableNumber(source.pricePerStudent, `${field}.pricePerStudent`),
  };
}

function normalizeUsage(value: unknown): AdminLicenseUsageSnapshot | null {
  if (value === null) return null;
  const source = requiredObject(value, "usage");
  return {
    activeStudentCount: requiredInteger(source.activeStudentCount, "usage.activeStudentCount"),
    activeStudentLimit: nullableInteger(source.activeStudentLimit, "usage.activeStudentLimit"),
    approachingLimit: requiredBoolean(source.approachingLimit, "usage.approachingLimit"),
    assignedStudentCount: requiredInteger(
      source.assignedStudentCount,
      "usage.assignedStudentCount",
    ),
    assignmentsCreated: requiredInteger(source.assignmentsCreated, "usage.assignmentsCreated"),
    billingTierCompliant: requiredBoolean(
      source.billingTierCompliant,
      "usage.billingTierCompliant",
    ),
    cycleId: requiredString(source.cycleId, "usage.cycleId"),
    overLimit: requiredBoolean(source.overLimit, "usage.overLimit"),
    peakActiveStudents: requiredInteger(source.peakActiveStudents, "usage.peakActiveStudents"),
    peakStudentUsage: requiredInteger(source.peakStudentUsage, "usage.peakStudentUsage"),
    pricingPlanId: nullableString(source.pricingPlanId, "usage.pricingPlanId"),
    projectedInvoiceAmount: nullableNumber(
      source.projectedInvoiceAmount,
      "usage.projectedInvoiceAmount",
    ),
    projectedInvoiceCurrency: nullableString(
      source.projectedInvoiceCurrency,
      "usage.projectedInvoiceCurrency",
    ),
    sessionExecutionVolume: requiredInteger(
      source.sessionExecutionVolume,
      "usage.sessionExecutionVolume",
    ),
    updatedAt: requiredIso(source.updatedAt, "usage.updatedAt"),
  };
}

function normalizeBillingRecord(
  value: unknown,
  index: number,
): AdminLicenseBillingRecordSnapshot {
  const field = `billing.items[${index}]`;
  const source = requiredObject(value, field);
  const status = requiredString(source.status, `${field}.status`);
  if (status !== "failed" && status !== "paid") {
    throw new Error(`Licensing response ${field} has an unsupported status.`);
  }
  return {
    amountPaid: requiredNumber(source.amountPaid, `${field}.amountPaid`),
    billingPeriodEnd: nullableIso(source.billingPeriodEnd, `${field}.billingPeriodEnd`),
    billingPeriodStart: nullableIso(source.billingPeriodStart, `${field}.billingPeriodStart`),
    createdAt: requiredIso(source.createdAt, `${field}.createdAt`),
    currency: requiredString(source.currency, `${field}.currency`),
    invoiceId: requiredString(source.invoiceId, `${field}.invoiceId`),
    status,
  };
}

function normalizeHistoryEntry(
  value: unknown,
  index: number,
): AdminLicenseHistoryEntrySnapshot {
  const field = `history.items[${index}]`;
  const source = requiredObject(value, field);
  return {
    billingPlan: requiredString(source.billingPlan, `${field}.billingPlan`),
    changedBy: requiredString(source.changedBy, `${field}.changedBy`),
    effectiveDate: requiredIso(source.effectiveDate, `${field}.effectiveDate`),
    entryId: requiredString(source.entryId, `${field}.entryId`),
    newLayer: normalizeLayer(source.newLayer, `${field}.newLayer`),
    newStudentLimit: nullableInteger(source.newStudentLimit, `${field}.newStudentLimit`),
    previousLayer: normalizeLayer(source.previousLayer, `${field}.previousLayer`),
    previousStudentLimit: nullableInteger(
      source.previousStudentLimit,
      `${field}.previousStudentLimit`,
    ),
    reason: requiredString(source.reason, `${field}.reason`),
    stripeInvoiceId: nullableString(source.stripeInvoiceId, `${field}.stripeInvoiceId`),
    timestamp: requiredIso(source.timestamp, `${field}.timestamp`),
  };
}

function normalizeRequest(value: unknown, index: number): AdminLicenseUpgradeRequestSnapshot {
  const field = `requests.items[${index}]`;
  const source = requiredObject(value, field);
  const requestKind = requiredString(source.requestKind, `${field}.requestKind`);
  const status = requiredString(source.status, `${field}.status`) as AdminLicenseRequestStatus;
  if (requestKind !== "evaluation" && requestKind !== "upgrade") {
    throw new Error(`Licensing response ${field} has an unsupported request kind.`);
  }
  if (!REQUEST_STATUSES.has(status)) {
    throw new Error(`Licensing response ${field} has an unsupported status.`);
  }
  return {
    currentLayer: normalizeLayer(source.currentLayer, `${field}.currentLayer`),
    currentPlanId: requiredString(source.currentPlanId, `${field}.currentPlanId`),
    decidedAt: nullableIso(source.decidedAt, `${field}.decidedAt`),
    decidedByUserId: nullableString(source.decidedByUserId, `${field}.decidedByUserId`),
    decisionNote: nullableString(source.decisionNote, `${field}.decisionNote`),
    expectedLicenseVersion: requiredString(
      source.expectedLicenseVersion,
      `${field}.expectedLicenseVersion`,
    ),
    reason: requiredString(source.reason, `${field}.reason`),
    requestId: requiredString(source.requestId, `${field}.requestId`),
    requestKind,
    requestedLayer: normalizeLayer(source.requestedLayer, `${field}.requestedLayer`),
    requestedPlanId: requiredString(source.requestedPlanId, `${field}.requestedPlanId`),
    status,
    submittedAt: requiredIso(source.submittedAt, `${field}.submittedAt`),
    submittedByUserId: requiredString(source.submittedByUserId, `${field}.submittedByUserId`),
  };
}

function normalizePageCursor(value: unknown, field: string): string | null {
  return value === null ? null : requiredString(value, field);
}

function normalizeBillingPage(value: unknown): AdminLicenseBillingPage {
  const source = requiredObject(value, "billing");
  return {
    items: strictArray(source.items, "billing.items", 25).map(normalizeBillingRecord),
    nextCursor: normalizePageCursor(source.nextCursor, "billing.nextCursor"),
  };
}

function normalizeHistoryPage(value: unknown): AdminLicenseHistoryPage {
  const source = requiredObject(value, "history");
  return {
    items: strictArray(source.items, "history.items", 25).map(normalizeHistoryEntry),
    nextCursor: normalizePageCursor(source.nextCursor, "history.nextCursor"),
  };
}

function normalizeRequestPage(value: unknown): AdminLicenseRequestPage {
  const source = requiredObject(value, "requests");
  const items = strictArray(source.items, "requests.items", 25).map(normalizeRequest);
  const openRequestId = source.openRequestId === null ? null :
    requiredString(source.openRequestId, "requests.openRequestId");
  if (openRequestId !== null && !items.some((request) => request.requestId === openRequestId)) {
    throw new Error("Licensing response open request is absent from the bounded request page.");
  }
  return {
    items,
    nextCursor: normalizePageCursor(source.nextCursor, "requests.nextCursor"),
    openRequestId,
  };
}

function normalizeExternalAction(value: unknown, index: number): AdminLicenseExternalAction {
  const field = `externalActions[${index}]`;
  const source = requiredObject(value, field);
  const action = requiredString(source.action, `${field}.action`) as
    AdminLicenseExternalAction["action"];
  const url = requiredString(source.url, `${field}.url`);
  if (!EXTERNAL_ACTIONS.has(action) || !url.startsWith("https://")) {
    throw new Error(`Licensing response ${field} is unsupported.`);
  }
  return { action, url };
}

function normalizeSnapshot(value: unknown): AdminLicensingSnapshot {
  const source = requiredObject(value, "snapshot");
  const plans = strictArray(source.plans, "plans", 50).map(normalizePlan);
  if (new Set(plans.map((plan) => plan.planId)).size !== plans.length) {
    throw new Error("Licensing response contains duplicate published plans.");
  }
  return {
    asOf: requiredIso(source.asOf, "asOf"),
    billing: normalizeBillingPage(source.billing),
    capabilities: strictArray(source.capabilities, "capabilities", 25).map(
      normalizeCapability,
    ),
    currentLicense: normalizeCurrentLicense(source.currentLicense),
    externalActions: strictArray(source.externalActions, "externalActions", 4).map(
      normalizeExternalAction,
    ),
    history: normalizeHistoryPage(source.history),
    plans,
    requests: normalizeRequestPage(source.requests),
    usage: normalizeUsage(source.usage),
  };
}

function normalizeReceipt(value: unknown): AdminLicenseUpgradeRequestReceipt {
  const source = requiredObject(value, "receipt");
  const disposition = requiredString(source.disposition, "receipt.disposition");
  if (disposition !== "applied" && disposition !== "replayed") {
    throw new Error("Licensing response receipt disposition is unsupported.");
  }
  return {
    auditEventId: requiredString(source.auditEventId, "receipt.auditEventId"),
    disposition,
    licenseVersion: requiredString(source.licenseVersion, "receipt.licenseVersion"),
    request: normalizeRequest(source.request, 0),
  };
}

function requireLiveLicensing(): void {
  if (isLocalLicensingReadMode()) {
    throw new Error(
      "Authoritative licensing data is unavailable while fixture mode is active.",
    );
  }
}

export function isLocalLicensingReadMode(): boolean {
  return shouldUseFixtureData();
}

export async function fetchLicensingSnapshot(): Promise<AdminLicensingSnapshot> {
  requireLiveLicensing();
  const result = requiredObject(
    await apiClient.post<unknown, {actionType: "GET_LICENSE_SNAPSHOT"}>(
      "/admin/licensing",
      {body: {actionType: "GET_LICENSE_SNAPSHOT"}},
    ),
    "response",
  );
  if (result.actionType !== "GET_LICENSE_SNAPSHOT") {
    throw new Error("Licensing response action does not match the snapshot request.");
  }
  return normalizeSnapshot(result.snapshot);
}

export async function submitLicenseUpgradeRequest(
  input: SubmitLicenseUpgradeRequestInput,
): Promise<SubmitLicenseUpgradeRequestResult> {
  requireLiveLicensing();
  const result = requiredObject(
    await apiClient.post<unknown, SubmitLicenseUpgradeRequestInput & {
      actionType: "REQUEST_LICENSE_UPGRADE";
    }>("/admin/licensing", {
      body: {actionType: "REQUEST_LICENSE_UPGRADE", ...input},
    }),
    "response",
  );
  if (result.actionType !== "REQUEST_LICENSE_UPGRADE") {
    throw new Error("Licensing response action does not match the upgrade request.");
  }
  const receipt = normalizeReceipt(result.receipt);
  if (
    receipt.licenseVersion !== input.expectedLicenseVersion ||
    receipt.request.expectedLicenseVersion !== input.expectedLicenseVersion ||
    receipt.request.requestKind !== input.requestKind ||
    receipt.request.requestedPlanId !== input.requestedPlanId
  ) {
    throw new Error("Licensing response receipt does not match the submitted request.");
  }

  const snapshot = await fetchLicensingSnapshot();
  const reloadedRequest = snapshot.requests.items.find(
    (request) => request.requestId === receipt.request.requestId,
  );
  if (
    snapshot.currentLicense.licenseVersion !== receipt.licenseVersion ||
    !reloadedRequest ||
    reloadedRequest.expectedLicenseVersion !== input.expectedLicenseVersion ||
    reloadedRequest.requestKind !== input.requestKind ||
    reloadedRequest.requestedPlanId !== input.requestedPlanId
  ) {
    throw new Error(
      "Licensing request was not confirmed by an authoritative snapshot reload.",
    );
  }
  return {receipt, snapshot};
}

export function createLicenseRequestIdempotencyKey(): string {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error("Secure request identity is unavailable in this browser.");
  }
  return globalThis.crypto.randomUUID();
}

export function getLayerRank(layer: AdminLicenseLayer): number {
  return {L0: 0, L1: 1, L2: 2, L3: 3}[layer];
}

export { ApiClientError };
