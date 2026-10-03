/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
import {createHash} from "node:crypto";
import {Timestamp} from "firebase-admin/firestore";
import type {
  AdminLicenseBillingPage,
  AdminLicenseBillingRecordSnapshot,
  AdminLicenseCapabilityLockReason,
  AdminLicenseCapabilitySnapshot,
  AdminLicenseExternalAction,
  AdminLicenseFeatureFlags,
  AdminLicenseHistoryEntrySnapshot,
  AdminLicenseHistoryPage,
  AdminLicenseInvoiceStatus,
  AdminLicenseLayer,
  AdminLicensePlanSnapshot,
  AdminLicenseRequestPage,
  AdminLicenseRequestStatus,
  AdminLicenseSnapshot,
  AdminLicenseState,
  AdminLicenseUpgradeRequestIntent,
  AdminLicenseUpgradeRequestReceipt,
  AdminLicenseUpgradeRequestSnapshot,
  AdminLicenseUsageSnapshot,
} from "../../../shared/contracts/adminLicensing";
import {createLogger} from "./logging";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  AdminLicensingResult,
  AdminLicensingValidatedRequest,
  AdminLicensingValidationError,
} from "../types/adminLicensing";

const INSTITUTES_COLLECTION = "institutes";
const LICENSE_COLLECTION = "license";
const LICENSE_CURRENT_DOCUMENT_ID = "current";
const LICENSE_HISTORY_COLLECTION = "licenseHistory";
const USAGE_METER_COLLECTION = "usageMeter";
const BILLING_RECORDS_COLLECTION = "billingRecords";
const LICENSE_REQUESTS_COLLECTION = "licenseRequests";
const LICENSE_REQUEST_COMMANDS_COLLECTION = "licenseRequestCommands";
const LICENSE_REQUEST_AUDIT_COLLECTION = "licenseRequestAudit";
const LICENSE_REQUEST_STATE_COLLECTION = "licenseRequestState";
const LICENSE_REQUEST_STATE_DOCUMENT_ID = "current";
const VENDOR_CONFIG_COLLECTION = "vendorConfig";
const PRICING_PLANS_DOCUMENT_ID = "pricingPlans";
const PRICING_PLANS_COLLECTION = "pricingPlans";
const PAGE_LIMIT = 25;
const PRICING_PLAN_LIMIT = 50;
const REQUEST_REASON_MIN_LENGTH = 15;
const REQUEST_REASON_MAX_LENGTH = 1000;

const LICENSE_LAYER_ORDER: Record<AdminLicenseLayer, number> = {
  L0: 0,
  L1: 1,
  L2: 2,
  L3: 3,
};

interface AdminLicensingDependencies {
  firestore: FirebaseFirestore.Firestore;
  now: () => Date;
}

interface AdminLicensingRequestInput {
  actionType?: unknown;
  actorId?: unknown;
  actorRole?: unknown;
  expectedLicenseVersion?: unknown;
  idempotencyKey?: unknown;
  instituteId?: unknown;
  ipAddress?: string;
  reason?: unknown;
  requestedPlanId?: unknown;
  requestKind?: unknown;
  userAgent?: string;
}

interface LicenseRequestCommandAuthority {
  auditEventId: string;
  commandDocumentId: string;
  fingerprint: string;
  idempotencyKeyHash: string;
  requestId: string;
}

interface CapabilityDefinition {
  capabilityId: string;
  description: string;
  featureFlag: keyof AdminLicenseFeatureFlags | null;
  label: string;
  minimumLayer: AdminLicenseLayer;
}

const CAPABILITY_DEFINITIONS: readonly CapabilityDefinition[] = [
  {
    capabilityId: "basic_test_engine",
    description: "Core test authoring, assignment, and execution.",
    featureFlag: null,
    label: "Basic test engine",
    minimumLayer: "L0",
  },
  {
    capabilityId: "raw_accuracy_analytics",
    description: "Raw score and accuracy analytics.",
    featureFlag: null,
    label: "Raw and accuracy analytics",
    minimumLayer: "L0",
  },
  {
    capabilityId: "risk_overview",
    description: "Institute and Student risk summaries.",
    featureFlag: "riskOverview",
    label: "Risk overview",
    minimumLayer: "L1",
  },
  {
    capabilityId: "pattern_alerts",
    description: "Behavior-pattern monitoring and alerts.",
    featureFlag: "riskOverview",
    label: "Pattern alerts",
    minimumLayer: "L1",
  },
  {
    capabilityId: "adaptive_phase",
    description: "Adaptive phase orchestration.",
    featureFlag: "adaptivePhase",
    label: "Adaptive phase",
    minimumLayer: "L2",
  },
  {
    capabilityId: "controlled_mode",
    description: "Controlled examination mode.",
    featureFlag: "controlledMode",
    label: "Controlled mode",
    minimumLayer: "L2",
  },
  {
    capabilityId: "hard_mode",
    description: "Hard-mode assignment controls.",
    featureFlag: "hardMode",
    label: "Hard mode",
    minimumLayer: "L2",
  },
  {
    capabilityId: "governance_dashboard",
    description: "Institutional governance intelligence.",
    featureFlag: "governanceAccess",
    label: "Governance dashboard",
    minimumLayer: "L3",
  },
  {
    capabilityId: "override_audit",
    description: "Immutable override audit visibility.",
    featureFlag: "governanceAccess",
    label: "Override audit",
    minimumLayer: "L3",
  },
];

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const authorityError = (message: string): AdminLicensingValidationError =>
  new AdminLicensingValidationError("INTERNAL_ERROR", message);

const normalizeRequiredString = (value: unknown, field: string): string => {
  if (typeof value !== "string") {
    throw new AdminLicensingValidationError(
      "VALIDATION_ERROR",
      `Field "${field}" must be a string.`,
    );
  }

  const normalized = value.trim();
  if (!normalized) {
    throw new AdminLicensingValidationError(
      "VALIDATION_ERROR",
      `Field "${field}" must be a non-empty string.`,
    );
  }

  return normalized;
};

const normalizeBoundedString = (
  value: unknown,
  field: string,
  minLength: number,
  maxLength: number,
): string => {
  const normalized = normalizeRequiredString(value, field);
  if (normalized.length < minLength || normalized.length > maxLength) {
    throw new AdminLicensingValidationError(
      "VALIDATION_ERROR",
      `Field "${field}" must contain ${minLength}-${maxLength} characters.`,
    );
  }

  return normalized;
};

const normalizeIdempotencyKey = (value: unknown): string => {
  const normalized = normalizeRequiredString(value, "idempotencyKey").toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)) {
    throw new AdminLicensingValidationError(
      "VALIDATION_ERROR",
      "Field \"idempotencyKey\" must be a UUID.",
    );
  }

  return normalized;
};

const normalizeRequestKind = (value: unknown): "evaluation" | "upgrade" => {
  const normalized = normalizeRequiredString(value, "requestKind").toLowerCase();
  if (normalized !== "evaluation" && normalized !== "upgrade") {
    throw new AdminLicensingValidationError(
      "VALIDATION_ERROR",
      "Field \"requestKind\" must be evaluation or upgrade.",
    );
  }

  return normalized;
};

const stableSerialize = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const buildLicenseRequestCommandAuthority = (
  request: AdminLicensingValidatedRequest & AdminLicenseUpgradeRequestIntent,
): LicenseRequestCommandAuthority => {
  const idempotencyKeyHash = sha256(
    `${request.instituteId}:${request.idempotencyKey}`,
  );
  const suffix = idempotencyKeyHash.slice(0, 40);
  return {
    auditEventId: `license_request_audit_${suffix}`,
    commandDocumentId: `license_request_command_${suffix}`,
    fingerprint: sha256(stableSerialize({
      actionType: request.actionType,
      actorUserId: request.actorId,
      expectedLicenseVersion: request.expectedLicenseVersion,
      reason: request.reason,
      requestedPlanId: request.requestedPlanId,
      requestKind: request.requestKind,
    })),
    idempotencyKeyHash,
    requestId: `license_request_${suffix}`,
  };
};

const requireAuthorityString = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw authorityError(`Licensing authority field "${field}" is invalid.`);
  }

  return value.trim();
};

const normalizeOptionalString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
};

const normalizeOptionalNumber = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return Number(value.toFixed(2));
};

const requireAuthorityNumber = (value: unknown, field: string): number => {
  const normalized = normalizeOptionalNumber(value);
  if (normalized === null) {
    throw authorityError(`Licensing authority field "${field}" is invalid.`);
  }

  return normalized;
};

const requireAuthorityCount = (value: unknown, field: string): number => {
  const normalized = requireAuthorityNumber(value, field);
  if (!Number.isInteger(normalized)) {
    throw authorityError(`Licensing authority field "${field}" must be an integer.`);
  }

  return normalized;
};

const requireAuthorityBoolean = (value: unknown, field: string): boolean => {
  if (typeof value !== "boolean") {
    throw authorityError(`Licensing authority field "${field}" is invalid.`);
  }

  return value;
};

const normalizeLayer = (value: unknown): AdminLicenseLayer | null => {
  const normalized = normalizeOptionalString(value)?.toUpperCase();
  if (normalized === "L0" || normalized === "L1" || normalized === "L2" || normalized === "L3") {
    return normalized;
  }

  return null;
};

const resolvePlanLayer = (value: unknown, planId: string): AdminLicenseLayer | null => {
  const explicit = normalizeLayer(value);
  if (explicit) {
    return explicit;
  }

  const match = planId.toUpperCase().match(/^(L[0-3])(?:-|$)/);
  return normalizeLayer(match?.[1]);
};

const requireAuthorityLayer = (value: unknown, field: string): AdminLicenseLayer => {
  const layer = normalizeLayer(value);
  if (!layer) {
    throw authorityError(`Licensing authority field "${field}" is invalid.`);
  }

  return layer;
};

const normalizeIsoString = (value: unknown): string | null => {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }

  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return null;
  }

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const requireAuthorityTimestamp = (value: unknown, field: string): string => {
  const normalized = normalizeIsoString(value);
  if (!normalized) {
    throw authorityError(`Licensing authority field "${field}" is invalid.`);
  }

  return normalized;
};

const normalizeOptionalAuthorityTimestamp = (value: unknown, field: string): string | null => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return requireAuthorityTimestamp(value, field);
};

const normalizeFeatureFlags = (value: unknown): AdminLicenseFeatureFlags => {
  const flags = isPlainObject(value) ? value : {};
  return {
    adaptivePhase: flags.adaptivePhase === true,
    controlledMode: flags.controlledMode === true,
    governanceAccess: flags.governanceAccess === true,
    hardMode: flags.hardMode === true,
    riskOverview: flags.riskOverview === true,
  };
};

const normalizeBillingCycle = (value: unknown): "monthly" | "annual" | null => {
  const normalized = normalizeOptionalString(value)?.toLowerCase();
  return normalized === "monthly" || normalized === "annual" ? normalized : null;
};

const normalizeLicenseState = (value: unknown): AdminLicenseState | null => {
  const normalized = normalizeOptionalString(value)?.toLowerCase();
  return normalized === "active" || normalized === "grace" || normalized === "expired" ?
    normalized :
    null;
};

const resolveEffectiveState = (
  storedState: AdminLicenseState,
  expiryDate: string | null,
  gracePeriodEndsAt: string | null,
  now: Date,
): AdminLicenseState => {
  if (storedState === "expired") {
    return "expired";
  }
  if (storedState === "grace") {
    if (!gracePeriodEndsAt) {
      return "expired";
    }
    return new Date(gracePeriodEndsAt).getTime() <= now.getTime() ? "expired" : "grace";
  }
  if (expiryDate && new Date(expiryDate).getTime() <= now.getTime()) {
    return "expired";
  }

  return "active";
};

const hasLayerAccess = (
  currentLayer: AdminLicenseLayer,
  requiredLayer: AdminLicenseLayer,
): boolean => LICENSE_LAYER_ORDER[currentLayer] >= LICENSE_LAYER_ORDER[requiredLayer];

const buildCapabilities = (
  currentLayer: AdminLicenseLayer,
  featureFlags: AdminLicenseFeatureFlags,
  licenseState: AdminLicenseState,
): AdminLicenseCapabilitySnapshot[] =>
  CAPABILITY_DEFINITIONS.map((definition) => {
    const layers = Object.fromEntries(
      (Object.keys(LICENSE_LAYER_ORDER) as AdminLicenseLayer[]).map((layer) => [
        layer,
        hasLayerAccess(layer, definition.minimumLayer) ? "enabled" : "locked",
      ]),
    ) as Record<AdminLicenseLayer, "enabled" | "locked">;
    let lockReason: AdminLicenseCapabilityLockReason | null = null;

    if (licenseState === "expired") {
      lockReason = "license_expired";
    } else if (licenseState === "grace") {
      lockReason = "license_grace";
    } else if (!hasLayerAccess(currentLayer, definition.minimumLayer)) {
      lockReason = "minimum_layer";
    } else if (definition.featureFlag && featureFlags[definition.featureFlag] !== true) {
      lockReason = "feature_disabled";
    }

    return {
      ...definition,
      layers,
      lockReason,
      state: lockReason ? "locked" : "enabled",
    };
  });

const buildInstitutePath = (instituteId: string): string =>
  `${INSTITUTES_COLLECTION}/${instituteId}`;

const buildLicensePath = (instituteId: string): string =>
  `${buildInstitutePath(instituteId)}/${LICENSE_COLLECTION}/${LICENSE_CURRENT_DOCUMENT_ID}`;

const buildPricingPlansCollectionPath = (): string =>
  `${VENDOR_CONFIG_COLLECTION}/${PRICING_PLANS_DOCUMENT_ID}/${PRICING_PLANS_COLLECTION}`;

const resolveInstituteName = (value: Record<string, unknown>): string =>
  requireAuthorityString(
    value.instituteName ?? value.name ?? value.registeredName,
    "institute.instituteName",
  );

const parsePlan = (document: FirebaseFirestore.DocumentSnapshot): AdminLicensePlanSnapshot => {
  const value = document.data();
  if (!isPlainObject(value)) {
    throw authorityError(`Pricing plan "${document.id}" is malformed.`);
  }
  const planId = normalizeOptionalString(value.planId) ?? document.id;
  const layer = resolvePlanLayer(value.layer ?? value.licenseLayer ?? value.planId, planId);
  if (!layer) {
    throw authorityError(`Pricing plan "${document.id}" has no valid license layer.`);
  }

  return {
    activeStudentLimit: normalizeOptionalNumber(value.studentLimit),
    basePriceMonthly: normalizeOptionalNumber(value.basePriceMonthly),
    concurrencyLimit: normalizeOptionalNumber(
      value.concurrencyLimit ?? value.maxConcurrentStudents,
    ),
    currency: normalizeOptionalString(value.currency)?.toUpperCase() ?? null,
    featureFlags: normalizeFeatureFlags(value.featureFlags),
    layer,
    monthlySessionExecutionLimit: normalizeOptionalNumber(
      value.monthlySessionExecutionLimit ?? value.maxExamSessionsPerMonth,
    ),
    name: normalizeOptionalString(value.name) ?? normalizeOptionalString(value.planName),
    planId,
    pricePerStudent: normalizeOptionalNumber(value.pricePerStudent),
  };
};

const parseUsage = (
  document: FirebaseFirestore.QueryDocumentSnapshot | undefined,
  projectedInvoiceCurrency: string | null,
): AdminLicenseUsageSnapshot | null => {
  if (!document) {
    return null;
  }
  const value = document.data();
  if (!isPlainObject(value)) {
    throw authorityError(`Usage meter "${document.id}" is malformed.`);
  }
  const cycleId = requireAuthorityString(value.cycleId, "usage.cycleId");
  if (!/^\d{4}-\d{2}$/.test(cycleId)) {
    throw authorityError("Licensing authority field \"usage.cycleId\" is invalid.");
  }

  return {
    activeStudentCount: requireAuthorityCount(value.activeStudentCount, "usage.activeStudentCount"),
    activeStudentLimit: normalizeOptionalNumber(value.activeStudentLimit),
    approachingLimit: requireAuthorityBoolean(value.approachingLimit, "usage.approachingLimit"),
    assignedStudentCount: requireAuthorityCount(
      value.assignedStudentsCount,
      "usage.assignedStudentsCount",
    ),
    assignmentsCreated: requireAuthorityCount(value.assignmentsCreated, "usage.assignmentsCreated"),
    billingTierCompliant: requireAuthorityBoolean(
      value.billingTierCompliance,
      "usage.billingTierCompliance",
    ),
    cycleId,
    overLimit: requireAuthorityBoolean(value.overLimit, "usage.overLimit"),
    peakActiveStudents: requireAuthorityCount(value.peakActiveStudents, "usage.peakActiveStudents"),
    peakStudentUsage: requireAuthorityCount(value.peakStudentUsage, "usage.peakStudentUsage"),
    pricingPlanId: normalizeOptionalString(value.pricingPlanId),
    projectedInvoiceAmount: normalizeOptionalNumber(value.projectedInvoiceAmount),
    projectedInvoiceCurrency:
      normalizeOptionalString(value.currency)?.toUpperCase() ?? projectedInvoiceCurrency,
    sessionExecutionVolume: requireAuthorityCount(
      value.sessionExecutionVolume,
      "usage.sessionExecutionVolume",
    ),
    updatedAt: requireAuthorityTimestamp(value.updatedAt, "usage.updatedAt"),
  };
};

const parseHistoryEntry = (
  document: FirebaseFirestore.QueryDocumentSnapshot,
): AdminLicenseHistoryEntrySnapshot => {
  const value = document.data();
  if (!isPlainObject(value)) {
    throw authorityError(`License history entry "${document.id}" is malformed.`);
  }
  const storedEntryId = normalizeOptionalString(value.entryId);
  if (storedEntryId && storedEntryId !== document.id) {
    throw authorityError(`License history entry "${document.id}" has conflicting identity.`);
  }

  return {
    billingPlan: requireAuthorityString(value.billingPlan, "history.billingPlan"),
    changedBy: requireAuthorityString(value.changedBy, "history.changedBy"),
    effectiveDate: requireAuthorityTimestamp(value.effectiveDate, "history.effectiveDate"),
    entryId: document.id,
    newLayer: requireAuthorityLayer(value.newLayer, "history.newLayer"),
    newStudentLimit: normalizeOptionalNumber(value.newStudentLimit),
    previousLayer: requireAuthorityLayer(value.previousLayer, "history.previousLayer"),
    previousStudentLimit: normalizeOptionalNumber(value.previousStudentLimit),
    reason: requireAuthorityString(value.reason, "history.reason"),
    stripeInvoiceId: normalizeOptionalString(value.stripeInvoiceId),
    timestamp: requireAuthorityTimestamp(value.timestamp, "history.timestamp"),
  };
};

const normalizeInvoiceStatus = (value: unknown): AdminLicenseInvoiceStatus | null => {
  const normalized = normalizeOptionalString(value)?.toLowerCase();
  return normalized === "paid" || normalized === "failed" ? normalized : null;
};

const parseBillingRecord = (
  document: FirebaseFirestore.QueryDocumentSnapshot,
): AdminLicenseBillingRecordSnapshot => {
  const value = document.data();
  if (!isPlainObject(value)) {
    throw authorityError(`Billing record "${document.id}" is malformed.`);
  }
  const storedInvoiceId = normalizeOptionalString(value.stripeInvoiceId);
  if (storedInvoiceId && storedInvoiceId !== document.id) {
    throw authorityError(`Billing record "${document.id}" has conflicting identity.`);
  }
  const status = normalizeInvoiceStatus(value.status);
  if (!status) {
    throw authorityError(`Billing record "${document.id}" has invalid status.`);
  }

  return {
    amountPaid: requireAuthorityNumber(value.amountPaid, "billing.amountPaid"),
    billingPeriodEnd: normalizeOptionalAuthorityTimestamp(
      value.billingPeriodEnd,
      "billing.billingPeriodEnd",
    ),
    billingPeriodStart: normalizeOptionalAuthorityTimestamp(
      value.billingPeriodStart,
      "billing.billingPeriodStart",
    ),
    createdAt: requireAuthorityTimestamp(value.createdAt, "billing.createdAt"),
    currency: requireAuthorityString(value.currency, "billing.currency").toUpperCase(),
    invoiceId: document.id,
    status,
  };
};

const normalizeRequestStatus = (value: unknown): AdminLicenseRequestStatus | null => {
  const normalized = normalizeOptionalString(value)?.toLowerCase();
  if (
    normalized === "pending" ||
    normalized === "payment_required" ||
    normalized === "approved" ||
    normalized === "rejected"
  ) {
    return normalized;
  }

  return null;
};

const parseRequest = (
  document: FirebaseFirestore.DocumentSnapshot,
): AdminLicenseUpgradeRequestSnapshot => {
  const value = document.data();
  if (!document.exists || !isPlainObject(value)) {
    throw authorityError(`License request "${document.id}" is malformed.`);
  }
  const storedRequestId = normalizeOptionalString(value.requestId);
  if (storedRequestId && storedRequestId !== document.id) {
    throw authorityError(`License request "${document.id}" has conflicting identity.`);
  }
  const requestKind = normalizeOptionalString(value.requestKind)?.toLowerCase();
  if (requestKind !== "upgrade" && requestKind !== "evaluation") {
    throw authorityError(`License request "${document.id}" has invalid request kind.`);
  }
  const status = normalizeRequestStatus(value.status);
  if (!status) {
    throw authorityError(`License request "${document.id}" has invalid status.`);
  }

  return {
    currentLayer: requireAuthorityLayer(value.currentLayer, "request.currentLayer"),
    currentPlanId: requireAuthorityString(value.currentPlanId, "request.currentPlanId"),
    decidedAt: normalizeOptionalAuthorityTimestamp(value.decidedAt, "request.decidedAt"),
    decidedByUserId: normalizeOptionalString(value.decidedByUserId),
    decisionNote: normalizeOptionalString(value.decisionNote),
    expectedLicenseVersion: requireAuthorityString(
      value.expectedLicenseVersion,
      "request.expectedLicenseVersion",
    ),
    reason: requireAuthorityString(value.reason, "request.reason"),
    requestId: document.id,
    requestKind,
    requestedLayer: requireAuthorityLayer(value.requestedLayer, "request.requestedLayer"),
    requestedPlanId: requireAuthorityString(value.requestedPlanId, "request.requestedPlanId"),
    status,
    submittedAt: requireAuthorityTimestamp(value.submittedAt, "request.submittedAt"),
    submittedByUserId: requireAuthorityString(value.submittedByUserId, "request.submittedByUserId"),
  };
};

const parseExternalActions = (value: unknown): AdminLicenseExternalAction[] => {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw authorityError("Licensing external action authority is malformed.");
  }
  const supportedActions = new Set<AdminLicenseExternalAction["action"]>([
    "billing_history",
    "contact_support",
    "invoice_download",
    "payment_method",
  ]);

  return value.map((entry, index) => {
    if (!isPlainObject(entry)) {
      throw authorityError(`Licensing external action ${index} is malformed.`);
    }
    const action = normalizeOptionalString(entry.action) as
      | AdminLicenseExternalAction["action"]
      | null;
    const url = normalizeOptionalString(entry.url);
    if (!action || !supportedActions.has(action) || !url) {
      throw authorityError(`Licensing external action ${index} is invalid.`);
    }
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw authorityError(`Licensing external action ${index} has an invalid URL.`);
    }
    if (parsedUrl.protocol !== "https:") {
      throw authorityError(`Licensing external action ${index} must use HTTPS.`);
    }

    return {action, url: parsedUrl.toString()};
  });
};

const pageCursor = (documents: FirebaseFirestore.QueryDocumentSnapshot[]): string | null =>
  documents.length > PAGE_LIMIT ? documents[PAGE_LIMIT - 1].id : null;

export class AdminLicensingService {
  private readonly logger = createLogger("AdminLicensingService");

  constructor(
    private readonly dependencies: AdminLicensingDependencies = {
      firestore: getFirestore(),
      now: () => new Date(),
    },
  ) {}

  public normalizeRequest(
    input: AdminLicensingRequestInput,
  ): AdminLicensingValidatedRequest {
    const actionType = normalizeRequiredString(input.actionType, "actionType");
    const authority = {
      actorId: normalizeRequiredString(input.actorId, "actorId"),
      actorRole: normalizeRequiredString(input.actorRole, "actorRole").toLowerCase(),
      instituteId: normalizeRequiredString(input.instituteId, "instituteId"),
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    };

    if (actionType === "GET_LICENSE_SNAPSHOT") {
      return {actionType, ...authority};
    }
    if (actionType !== "REQUEST_LICENSE_UPGRADE") {
      throw new AdminLicensingValidationError(
        "VALIDATION_ERROR",
        "Field \"actionType\" is not supported.",
      );
    }
    if (authority.actorRole !== "admin") {
      throw new AdminLicensingValidationError(
        "FORBIDDEN",
        "Only institute administrators can submit licensing requests.",
      );
    }

    return {
      actionType,
      ...authority,
      expectedLicenseVersion: normalizeBoundedString(
        input.expectedLicenseVersion,
        "expectedLicenseVersion",
        1,
        200,
      ),
      idempotencyKey: normalizeIdempotencyKey(input.idempotencyKey),
      reason: normalizeBoundedString(
        input.reason,
        "reason",
        REQUEST_REASON_MIN_LENGTH,
        REQUEST_REASON_MAX_LENGTH,
      ),
      requestedPlanId: normalizeBoundedString(
        input.requestedPlanId,
        "requestedPlanId",
        1,
        200,
      ),
      requestKind: normalizeRequestKind(input.requestKind),
    };
  }

  public async executeRequest(
    request: AdminLicensingValidatedRequest,
  ): Promise<AdminLicensingResult> {
    if (request.actionType === "REQUEST_LICENSE_UPGRADE") {
      const receipt = await this.createLicenseRequest(request);
      const snapshot = await this.getSnapshot(request.instituteId);
      return {actionType: request.actionType, receipt, snapshot};
    }

    const snapshot = await this.getSnapshot(request.instituteId);
    return {actionType: "GET_LICENSE_SNAPSHOT", snapshot};
  }

  private async createLicenseRequest(
    request: Extract<
      AdminLicensingValidatedRequest,
      {actionType: "REQUEST_LICENSE_UPGRADE"}
    >,
  ): Promise<AdminLicenseUpgradeRequestReceipt> {
    const firestore = this.dependencies.firestore;
    const authority = buildLicenseRequestCommandAuthority(request);
    const institutePath = buildInstitutePath(request.instituteId);
    const instituteReference = firestore.doc(institutePath);
    const currentLicenseReference = firestore.doc(
      buildLicensePath(request.instituteId),
    );
    const requestReference = instituteReference
      .collection(LICENSE_REQUESTS_COLLECTION)
      .doc(authority.requestId);
    const requestStateReference = instituteReference
      .collection(LICENSE_REQUEST_STATE_COLLECTION)
      .doc(LICENSE_REQUEST_STATE_DOCUMENT_ID);
    const commandReference = instituteReference
      .collection(LICENSE_REQUEST_COMMANDS_COLLECTION)
      .doc(authority.commandDocumentId);
    const auditReference = instituteReference
      .collection(LICENSE_REQUEST_AUDIT_COLLECTION)
      .doc(authority.auditEventId);
    const openRequestsQuery = instituteReference
      .collection(LICENSE_REQUESTS_COLLECTION)
      .where("status", "in", ["pending", "payment_required"])
      .limit(2);
    const pricingPlansQuery = firestore
      .collection(buildPricingPlansCollectionPath())
      .limit(PRICING_PLAN_LIMIT + 1);
    const submittedAtDate = this.dependencies.now();
    if (Number.isNaN(submittedAtDate.getTime())) {
      throw authorityError("Licensing request server time is invalid.");
    }
    const submittedAt = Timestamp.fromDate(submittedAtDate);

    const receipt = await firestore.runTransaction<AdminLicenseUpgradeRequestReceipt>(
      async (transaction) => {
        const commandSnapshot = await transaction.get(commandReference);
        if (commandSnapshot.exists) {
          const commandData = commandSnapshot.data();
          if (
            !isPlainObject(commandData) ||
          commandData.actionType !== request.actionType ||
          commandData.fingerprint !== authority.fingerprint ||
          commandData.idempotencyKeyHash !== authority.idempotencyKeyHash ||
          commandData.requestId !== authority.requestId ||
          commandData.auditEventId !== authority.auditEventId
          ) {
            throw new AdminLicensingValidationError(
              "CONFLICT",
              "Idempotency key was already used for different licensing intent.",
            );
          }
          const [storedRequestSnapshot, storedAuditSnapshot] = await Promise.all([
            transaction.get(requestReference),
            transaction.get(auditReference),
          ]);
          if (!storedAuditSnapshot.exists) {
            throw authorityError("Persisted licensing request audit is unavailable.");
          }
          const auditData = storedAuditSnapshot.data();
          if (
            !isPlainObject(auditData) ||
          auditData.requestId !== authority.requestId ||
          auditData.fingerprint !== authority.fingerprint ||
          auditData.idempotencyKeyHash !== authority.idempotencyKeyHash
          ) {
            throw authorityError("Persisted licensing request audit is invalid.");
          }

          return {
            auditEventId: authority.auditEventId,
            disposition: "replayed",
            licenseVersion: requireAuthorityString(
              commandData.licenseVersion,
              "licenseRequestCommands.licenseVersion",
            ),
            request: parseRequest(storedRequestSnapshot),
          };
        }

        const [
          instituteSnapshot,
          currentLicenseSnapshot,
          requestStateSnapshot,
          openRequestsSnapshot,
          pricingPlansSnapshot,
        ] = await Promise.all([
          transaction.get(instituteReference),
          transaction.get(currentLicenseReference),
          transaction.get(requestStateReference),
          transaction.get(openRequestsQuery),
          transaction.get(pricingPlansQuery),
        ]);
        if (!instituteSnapshot.exists || !isPlainObject(instituteSnapshot.data())) {
          throw new AdminLicensingValidationError(
            "NOT_FOUND",
            "Institute licensing authority was not found.",
          );
        }
        if (!currentLicenseSnapshot.exists || !isPlainObject(currentLicenseSnapshot.data())) {
          throw authorityError("Authoritative license/current is unavailable.");
        }
        if (pricingPlansSnapshot.docs.length > PRICING_PLAN_LIMIT) {
          throw authorityError("Published pricing plan authority exceeds the supported bound.");
        }
        if (openRequestsSnapshot.docs.length > 0) {
          throw new AdminLicensingValidationError(
            "CONFLICT",
            "A licensing request is already pending vendor review.",
          );
        }
        if (requestStateSnapshot.exists) {
          const requestState = requestStateSnapshot.data();
          if (!isPlainObject(requestState)) {
            throw authorityError("License request state authority is malformed.");
          }
          if (requestState.openRequestId !== null && requestState.openRequestId !== undefined) {
            requireAuthorityString(
              requestState.openRequestId,
              "requestState.openRequestId",
            );
            throw new AdminLicensingValidationError(
              "CONFLICT",
              "A licensing request is already pending vendor review.",
            );
          }
        }

        const instituteData = instituteSnapshot.data() ?? {};
        const currentLicenseData = currentLicenseSnapshot.data() ?? {};
        const currentLayer = requireAuthorityLayer(
          currentLicenseData.currentLayer,
          "license.currentLayer",
        );
        const currentPlanId = requireAuthorityString(
          currentLicenseData.planId,
          "license.planId",
        );
        const licenseVersion = requireAuthorityString(
          currentLicenseData.licenseVersion ?? instituteData.licenseVersion,
          "license.licenseVersion",
        );
        if (licenseVersion !== request.expectedLicenseVersion) {
          throw new AdminLicensingValidationError(
            "CONFLICT",
            "License version changed; reload licensing authority before submitting.",
          );
        }

        const plans = pricingPlansSnapshot.docs.map(parsePlan);
        const currentPlan = plans.find((plan) => plan.planId === currentPlanId);
        if (!currentPlan || currentPlan.layer !== currentLayer) {
          throw authorityError(
            "Current license does not match published pricing-plan authority.",
          );
        }
        const requestedPlan = plans.find(
          (plan) => plan.planId === request.requestedPlanId,
        );
        if (!requestedPlan) {
          throw new AdminLicensingValidationError(
            "NOT_FOUND",
            "Requested pricing plan is not published.",
          );
        }
        if (
          requestedPlan.planId === currentPlanId ||
        LICENSE_LAYER_ORDER[requestedPlan.layer] <= LICENSE_LAYER_ORDER[currentLayer]
        ) {
          throw new AdminLicensingValidationError(
            "CONFLICT",
            "Licensing requests must target a published higher-layer plan.",
          );
        }
        const expectedRequestKind = requestedPlan.layer === "L3" ?
          "evaluation" :
          "upgrade";
        if (request.requestKind !== expectedRequestKind) {
          throw new AdminLicensingValidationError(
            "CONFLICT",
            requestedPlan.layer === "L3" ?
              "L3 requires an evaluation request." :
              "Non-L3 plans require an upgrade request.",
          );
        }

        const requestSnapshot: AdminLicenseUpgradeRequestSnapshot = {
          currentLayer,
          currentPlanId,
          decidedAt: null,
          decidedByUserId: null,
          decisionNote: null,
          expectedLicenseVersion: licenseVersion,
          reason: request.reason,
          requestId: authority.requestId,
          requestKind: request.requestKind,
          requestedLayer: requestedPlan.layer,
          requestedPlanId: requestedPlan.planId,
          status: "pending",
          submittedAt: submittedAtDate.toISOString(),
          submittedByUserId: request.actorId,
        };

        transaction.create(requestReference, {
          ...requestSnapshot,
          decisionAuditEventIds: [],
          decisionState: "undecided",
          instituteId: request.instituteId,
          revision: 1,
          submissionAuditEventId: authority.auditEventId,
          submittedAt,
          updatedAt: submittedAt,
        });
        transaction.set(requestStateReference, {
          openRequestId: authority.requestId,
          updatedAt: submittedAt,
        });
        transaction.create(auditReference, {
          actionType: request.actionType,
          actorRole: request.actorRole,
          actorUserId: request.actorId,
          auditEventId: authority.auditEventId,
          createdAt: submittedAt,
          currentLayer,
          currentPlanId,
          expectedLicenseVersion: licenseVersion,
          fingerprint: authority.fingerprint,
          idempotencyKeyHash: authority.idempotencyKeyHash,
          instituteId: request.instituteId,
          ipAddressHash: request.ipAddress ? sha256(request.ipAddress) : null,
          occurredAt: submittedAt,
          requestId: authority.requestId,
          requestedLayer: requestedPlan.layer,
          requestedPlanId: requestedPlan.planId,
          requestKind: request.requestKind,
          summary: "Institute administrator submitted a licensing request for vendor review.",
          userAgentHash: request.userAgent ? sha256(request.userAgent) : null,
        });
        transaction.create(commandReference, {
          actionType: request.actionType,
          auditEventId: authority.auditEventId,
          completedAt: submittedAt,
          fingerprint: authority.fingerprint,
          idempotencyKeyHash: authority.idempotencyKeyHash,
          licenseVersion,
          requestId: authority.requestId,
        });

        return {
          auditEventId: authority.auditEventId,
          disposition: "applied",
          licenseVersion,
          request: requestSnapshot,
        };
      },
    );
    this.logger.info("Admin licensing request accepted for vendor review.", {
      disposition: receipt.disposition,
      instituteId: request.instituteId,
      requestId: receipt.request.requestId,
      requestedLayer: receipt.request.requestedLayer,
    });
    return receipt;
  }

  private async getSnapshot(instituteId: string): Promise<AdminLicenseSnapshot> {
    const firestore = this.dependencies.firestore;
    const now = this.dependencies.now();
    const institutePath = buildInstitutePath(instituteId);
    const instituteReference = firestore.doc(institutePath);
    const currentLicenseReference = firestore.doc(buildLicensePath(instituteId));
    const usageQuery = firestore
      .collection(`${institutePath}/${USAGE_METER_COLLECTION}`)
      .orderBy("cycleId", "desc")
      .limit(1);
    const historyQuery = firestore
      .collection(`${institutePath}/${LICENSE_HISTORY_COLLECTION}`)
      .orderBy("timestamp", "desc")
      .limit(PAGE_LIMIT + 1);
    const billingQuery = firestore
      .collection(`${institutePath}/${BILLING_RECORDS_COLLECTION}`)
      .orderBy("createdAt", "desc")
      .limit(PAGE_LIMIT + 1);
    const requestQuery = firestore
      .collection(`${institutePath}/${LICENSE_REQUESTS_COLLECTION}`)
      .orderBy("submittedAt", "desc")
      .limit(PAGE_LIMIT + 1);
    const requestStateReference = firestore.doc(
      `${institutePath}/${LICENSE_REQUEST_STATE_COLLECTION}/${LICENSE_REQUEST_STATE_DOCUMENT_ID}`,
    );
    const pricingPlansQuery = firestore
      .collection(buildPricingPlansCollectionPath())
      .limit(PRICING_PLAN_LIMIT + 1);

    const [
      instituteSnapshot,
      currentLicenseSnapshot,
      usageSnapshot,
      historySnapshot,
      billingSnapshot,
      requestSnapshot,
      requestStateSnapshot,
      pricingPlansSnapshot,
    ] = await Promise.all([
      instituteReference.get(),
      currentLicenseReference.get(),
      usageQuery.get(),
      historyQuery.get(),
      billingQuery.get(),
      requestQuery.get(),
      requestStateReference.get(),
      pricingPlansQuery.get(),
    ]);

    if (!instituteSnapshot.exists || !isPlainObject(instituteSnapshot.data())) {
      throw authorityError("Institute licensing authority is unavailable.");
    }
    if (!currentLicenseSnapshot.exists || !isPlainObject(currentLicenseSnapshot.data())) {
      throw authorityError("Authoritative license/current is unavailable.");
    }
    if (pricingPlansSnapshot.docs.length > PRICING_PLAN_LIMIT) {
      throw authorityError("Published pricing plan authority exceeds the supported bound.");
    }

    const instituteData = instituteSnapshot.data() ?? {};
    const licenseData = currentLicenseSnapshot.data() ?? {};
    const layer = requireAuthorityLayer(licenseData.currentLayer, "license.currentLayer");
    const licenseVersion = requireAuthorityString(
      licenseData.licenseVersion ?? instituteData.licenseVersion,
      "license.licenseVersion",
    );
    const planId = requireAuthorityString(licenseData.planId, "license.planId");
    const billingCycle = normalizeBillingCycle(licenseData.billingCycle);
    if (!billingCycle) {
      throw authorityError("Licensing authority field \"license.billingCycle\" is invalid.");
    }
    const storedState = normalizeLicenseState(licenseData.licenseState);
    if (!storedState) {
      throw authorityError("Licensing authority field \"license.licenseState\" is invalid.");
    }
    const expiryDate = normalizeOptionalAuthorityTimestamp(
      licenseData.expiryDate,
      "license.expiryDate",
    );
    const gracePeriodEndsAt = normalizeOptionalAuthorityTimestamp(
      licenseData.gracePeriodEndsAt,
      "license.gracePeriodEndsAt",
    );
    const state = resolveEffectiveState(storedState, expiryDate, gracePeriodEndsAt, now);
    const featureFlags = normalizeFeatureFlags(licenseData.featureFlags);
    const plans = pricingPlansSnapshot.docs
      .map(parsePlan)
      .sort(
        (left, right) =>
          LICENSE_LAYER_ORDER[left.layer] - LICENSE_LAYER_ORDER[right.layer] ||
          left.planId.localeCompare(right.planId),
      );
    const currentPlan = plans.find((plan) => plan.planId === planId);
    if (!currentPlan) {
      throw authorityError("Current license references an unpublished pricing plan.");
    }
    if (currentPlan.layer !== layer) {
      throw authorityError("Current license layer does not match its published pricing plan.");
    }

    const activeStudentLimit = normalizeOptionalNumber(licenseData.activeStudentLimit);
    if (
      activeStudentLimit !== null &&
      currentPlan.activeStudentLimit !== null &&
      activeStudentLimit !== currentPlan.activeStudentLimit
    ) {
      throw authorityError("Current license student limit conflicts with its pricing plan.");
    }

    const historyDocuments = historySnapshot.docs;
    const billingDocuments = billingSnapshot.docs;
    const requestDocuments = requestSnapshot.docs;
    const history: AdminLicenseHistoryPage = {
      items: historyDocuments.slice(0, PAGE_LIMIT).map(parseHistoryEntry),
      nextCursor: pageCursor(historyDocuments),
    };
    const billing: AdminLicenseBillingPage = {
      items: billingDocuments.slice(0, PAGE_LIMIT).map(parseBillingRecord),
      nextCursor: pageCursor(billingDocuments),
    };

    let openRequestId: string | null = null;
    if (requestStateSnapshot.exists) {
      const requestState = requestStateSnapshot.data();
      if (!isPlainObject(requestState)) {
        throw authorityError("License request state authority is malformed.");
      }
      if (requestState.openRequestId !== null && requestState.openRequestId !== undefined) {
        openRequestId = requireAuthorityString(
          requestState.openRequestId,
          "requestState.openRequestId",
        );
      }
    }

    let requestItems = requestDocuments.slice(0, PAGE_LIMIT).map(parseRequest);
    if (openRequestId && !requestItems.some((request) => request.requestId === openRequestId)) {
      const openRequestSnapshot = await firestore
        .doc(`${institutePath}/${LICENSE_REQUESTS_COLLECTION}/${openRequestId}`)
        .get();
      requestItems = [parseRequest(openRequestSnapshot), ...requestItems].slice(0, PAGE_LIMIT);
    }
    const openRequests = requestItems.filter(
      (request) => request.status === "pending" || request.status === "payment_required",
    );
    if (openRequests.length > 1) {
      throw authorityError("License request authority contains multiple open requests.");
    }
    if (
      (openRequestId === null && openRequests.length > 0) ||
      (openRequestId !== null && openRequests[0]?.requestId !== openRequestId)
    ) {
      throw authorityError("License request state does not match request authority.");
    }
    const requests: AdminLicenseRequestPage = {
      items: requestItems,
      nextCursor: pageCursor(requestDocuments),
      openRequestId,
    };

    const usage = parseUsage(usageSnapshot.docs[0], currentPlan.currency);
    const snapshot: AdminLicenseSnapshot = {
      asOf: now.toISOString(),
      billing,
      capabilities: buildCapabilities(layer, featureFlags, state),
      currentLicense: {
        activeStudentLimit,
        billingCycle,
        concurrencyLimit: normalizeOptionalNumber(licenseData.concurrencyLimit),
        expiryDate,
        featureFlags,
        gracePeriodEndsAt,
        instituteId,
        instituteName: resolveInstituteName(instituteData),
        layer,
        licenseVersion,
        planId,
        planName: normalizeOptionalString(licenseData.planName),
        renewalDate: normalizeOptionalAuthorityTimestamp(
          licenseData.renewalDate,
          "license.renewalDate",
        ),
        startDate: normalizeOptionalAuthorityTimestamp(licenseData.startDate, "license.startDate"),
        state,
      },
      externalActions: parseExternalActions(licenseData.externalActions),
      history,
      plans,
      requests,
      usage,
    };

    this.logger.info("Authoritative Admin licensing snapshot loaded.", {
      billingCount: snapshot.billing.items.length,
      currentLayer: layer,
      historyCount: snapshot.history.items.length,
      instituteId,
      planCount: snapshot.plans.length,
      requestCount: snapshot.requests.items.length,
      usageCycleId: snapshot.usage?.cycleId ?? null,
    });

    return snapshot;
  }
}

export const adminLicensingService = new AdminLicensingService();
