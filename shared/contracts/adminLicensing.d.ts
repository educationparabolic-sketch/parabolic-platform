/**
 * Shared Admin licensing transport and entitlement contracts.
 *
 * BWM-031 owns the institute-facing snapshot, request submission, and shared
 * enforcement vocabulary. BWM-035 owns Vendor catalog, decision, invoice,
 * payment, and communication commands over the same persisted records.
 * BWM-036 owns fleet-wide propagation timing and stale-session revocation after
 * Vendor mutations; it must reuse, not redefine, the entitlement claim shape.
 */

export type AdminLicensingActionType = "GET_LICENSE_SNAPSHOT" | "REQUEST_LICENSE_UPGRADE";

export type AdminLicenseLayer = "L0" | "L1" | "L2" | "L3";
export interface AdminLicenseFeatureFlags {
  adaptivePhase: boolean;
  controlledMode: boolean;
  governanceAccess: boolean;
  hardMode: boolean;
  riskOverview: boolean;
}
export type AdminLicenseState = "active" | "grace" | "expired";
export type AdminLicenseBillingCycle = "monthly" | "annual";
export type AdminLicenseCapabilityState = "enabled" | "locked";
export type AdminLicenseCapabilityLockReason =
  | "feature_disabled"
  | "license_expired"
  | "license_grace"
  | "minimum_layer";
export type AdminLicenseRequestKind = "evaluation" | "upgrade";
export type AdminLicenseRequestStatus = "pending" | "payment_required" | "approved" | "rejected";
export type AdminLicenseInvoiceStatus = "failed" | "paid";
export type AdminLicenseMutationDisposition = "applied" | "replayed";

/** Public snapshot intent. Institute and actor are resolved from identity. */
export interface AdminLicenseSnapshotRequest {
  actionType: "GET_LICENSE_SNAPSHOT";
}

/**
 * Public request intent. The current plan/layer, actor, institute, status, and
 * decision are server-owned and deliberately absent.
 */
export interface AdminLicenseUpgradeRequestIntent {
  actionType: "REQUEST_LICENSE_UPGRADE";
  expectedLicenseVersion: string;
  /** UUID command key; the backend persists only its institute-scoped hash. */
  idempotencyKey: string;
  /** Trimmed operational justification containing 15-1000 characters. */
  reason: string;
  /** L3 uses evaluation; other higher-layer plans use upgrade. */
  requestKind: AdminLicenseRequestKind;
  /** Must resolve to a currently published plan above the current layer. */
  requestedPlanId: string;
}

export type AdminLicensingPublicRequest =
  | AdminLicenseSnapshotRequest
  | AdminLicenseUpgradeRequestIntent;

/** Backend-only authority attached after authentication. */
export interface AdminLicensingResolvedAuthority {
  actorRole: "admin" | "director";
  actorUserId: string;
  instituteId: string;
}

/**
 * Claim fields that all license-aware middleware must interpret identically.
 * Missing or malformed fields fail closed. Grace, an elapsed grace deadline,
 * explicit expiry, or an elapsed expiry date cannot grant privileged access.
 */
export interface LicenseEntitlementClaimContract {
  expiryDate: string | null;
  featureFlags: AdminLicenseFeatureFlags;
  gracePeriodEndsAt: string | null;
  licenseLayer: AdminLicenseLayer;
  licenseState: AdminLicenseState;
  licenseVersion: string;
}

export interface AdminCurrentLicenseSnapshot {
  activeStudentLimit: number | null;
  billingCycle: AdminLicenseBillingCycle;
  concurrencyLimit: number | null;
  expiryDate: string | null;
  featureFlags: AdminLicenseFeatureFlags;
  gracePeriodEndsAt: string | null;
  instituteId: string;
  instituteName: string;
  layer: AdminLicenseLayer;
  licenseVersion: string;
  planId: string;
  planName: string | null;
  renewalDate: string | null;
  startDate: string | null;
  state: AdminLicenseState;
}

export interface AdminLicenseCapabilitySnapshot {
  capabilityId: string;
  description: string;
  featureFlag: keyof AdminLicenseFeatureFlags | null;
  label: string;
  layers: Record<AdminLicenseLayer, AdminLicenseCapabilityState>;
  lockReason: AdminLicenseCapabilityLockReason | null;
  minimumLayer: AdminLicenseLayer;
  state: AdminLicenseCapabilityState;
}

export interface AdminLicensePlanSnapshot {
  activeStudentLimit: number | null;
  basePriceMonthly: number | null;
  concurrencyLimit: number | null;
  currency: string | null;
  featureFlags: AdminLicenseFeatureFlags;
  layer: AdminLicenseLayer;
  monthlySessionExecutionLimit: number | null;
  name: string | null;
  planId: string;
  pricePerStudent: number | null;
}

export interface AdminLicenseUsageSnapshot {
  activeStudentCount: number;
  activeStudentLimit: number | null;
  approachingLimit: boolean;
  assignedStudentCount: number;
  assignmentsCreated: number;
  billingTierCompliant: boolean;
  cycleId: string;
  overLimit: boolean;
  peakActiveStudents: number;
  peakStudentUsage: number;
  pricingPlanId: string | null;
  projectedInvoiceAmount: number | null;
  projectedInvoiceCurrency: string | null;
  sessionExecutionVolume: number;
  updatedAt: string;
}

export interface AdminLicenseBillingRecordSnapshot {
  amountPaid: number;
  billingPeriodEnd: string | null;
  billingPeriodStart: string | null;
  createdAt: string;
  currency: string;
  invoiceId: string;
  status: AdminLicenseInvoiceStatus;
}

export interface AdminLicenseHistoryEntrySnapshot {
  billingPlan: string;
  changedBy: string;
  effectiveDate: string;
  entryId: string;
  newLayer: AdminLicenseLayer;
  newStudentLimit: number | null;
  previousLayer: AdminLicenseLayer;
  previousStudentLimit: number | null;
  reason: string;
  stripeInvoiceId: string | null;
  timestamp: string;
}

export interface AdminLicenseUpgradeRequestSnapshot {
  currentLayer: AdminLicenseLayer;
  currentPlanId: string;
  decidedAt: string | null;
  decidedByUserId: string | null;
  decisionNote: string | null;
  expectedLicenseVersion: string;
  reason: string;
  requestId: string;
  requestKind: AdminLicenseRequestKind;
  requestedLayer: AdminLicenseLayer;
  requestedPlanId: string;
  status: AdminLicenseRequestStatus;
  submittedAt: string;
  submittedByUserId: string;
}

export interface AdminLicenseBillingPage {
  items: AdminLicenseBillingRecordSnapshot[];
  nextCursor: string | null;
}

export interface AdminLicenseHistoryPage {
  items: AdminLicenseHistoryEntrySnapshot[];
  nextCursor: string | null;
}

export interface AdminLicenseRequestPage {
  items: AdminLicenseUpgradeRequestSnapshot[];
  nextCursor: string | null;
  /** At most one pending or payment-required request may be present. */
  openRequestId: string | null;
}

export interface AdminLicenseExternalAction {
  action: "billing_history" | "contact_support" | "invoice_download" | "payment_method";
  url: string;
}

export interface AdminLicenseSnapshot {
  asOf: string;
  billing: AdminLicenseBillingPage;
  capabilities: AdminLicenseCapabilitySnapshot[];
  currentLicense: AdminCurrentLicenseSnapshot;
  externalActions: AdminLicenseExternalAction[];
  history: AdminLicenseHistoryPage;
  plans: AdminLicensePlanSnapshot[];
  requests: AdminLicenseRequestPage;
  /** Null means no authoritative usage cycle exists; callers must not invent one. */
  usage: AdminLicenseUsageSnapshot | null;
}

export interface AdminLicenseUpgradeRequestReceipt {
  auditEventId: string;
  disposition: AdminLicenseMutationDisposition;
  licenseVersion: string;
  request: AdminLicenseUpgradeRequestSnapshot;
}

export type AdminLicensingResult =
  | {
      actionType: "GET_LICENSE_SNAPSHOT";
      snapshot: AdminLicenseSnapshot;
    }
  | {
      actionType: "REQUEST_LICENSE_UPGRADE";
      receipt: AdminLicenseUpgradeRequestReceipt;
      snapshot: AdminLicenseSnapshot;
    };
