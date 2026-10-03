/** Shared BWM-035 Vendor commercial read and command contracts. */

export type VendorCommercialLicenseLayer = "L0" | "L1" | "L2" | "L3";

export interface VendorCommercialCommandMetadata {
  /** Client-generated UUID; only an actor/scope-bound SHA-256 hash is stored. */
  idempotencyKey: string;
}

export interface VendorCommercialRevisionedCommandMetadata
  extends VendorCommercialCommandMetadata {
  /** Positive revision observed by the caller; stale commands fail with 409. */
  expectedRevision: number;
}

export interface VendorCommercialCursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface VendorMoney {
  /** Integer in the currency's ISO 4217 minor unit; never a floating amount. */
  amountMinor: number;
  /** Uppercase ISO 4217 currency code persisted with the amount. */
  currency: string;
}

export type VendorCommercialProviderState =
  | "not_required"
  | "pending"
  | "processing"
  | "succeeded"
  | "failed_retryable"
  | "failed_terminal";

export interface VendorCommercialProviderOperation {
  attemptCount: number;
  lastErrorCode: string | null;
  nextAttemptAt: string | null;
  operationId: string;
  provider: "stripe" | "manual";
  state: VendorCommercialProviderState;
  updatedAt: string;
}

export type VendorCommercialPropagationState =
  | "not_required"
  | "pending_bwm_036";

export interface VendorCommercialAuditReference {
  auditEventId: string;
  occurredAt: string;
}

export type VendorLicenseRequestStatus =
  | "pending"
  | "payment_required"
  | "approved"
  | "rejected";

export type VendorLicenseRequestDecisionState =
  | "undecided"
  | "provider_pending"
  | "provider_failed"
  | "decided";

export interface VendorLicenseRequestListQuery {
  cursor?: string;
  instituteId?: string;
  /** Defaults to 25 and may not exceed 50. */
  limit?: number;
  requestedLayer?: VendorCommercialLicenseLayer;
  status?: VendorLicenseRequestStatus;
}

export interface VendorLicenseRequestSummary {
  createdAt: string;
  currentLayer: VendorCommercialLicenseLayer;
  decisionState: VendorLicenseRequestDecisionState;
  instituteId: string;
  requestId: string;
  requestedLayer: VendorCommercialLicenseLayer;
  requestedPlanId: string;
  revision: number;
  status: VendorLicenseRequestStatus;
  updatedAt: string;
}

export interface VendorLicenseRequestListResult
  extends VendorCommercialCursorPage<VendorLicenseRequestSummary> {
  totalMatching: number;
}

export interface VendorLicenseRequestDetail
  extends VendorLicenseRequestSummary {
  /** Newest 50 immutable request audit references. */
  audit: VendorCommercialAuditReference[];
  decisionNote: string | null;
  providerOperation: VendorCommercialProviderOperation | null;
  reason: string;
  requestKind: "evaluation" | "upgrade";
}

export type VendorLicenseRequestDecisionIntent =
  | ({
      action: "approve";
      note?: string;
    } & VendorCommercialRevisionedCommandMetadata)
  | ({
      action: "require_payment";
      note?: string;
    } & VendorCommercialRevisionedCommandMetadata)
  | ({
      action: "reject";
      reason: string;
    } & VendorCommercialRevisionedCommandMetadata);

export interface VendorLicenseRequestDecisionReceipt {
  auditEventId: string;
  commandId: string;
  completedAt: string;
  decisionState: VendorLicenseRequestDecisionState;
  propagationState: VendorCommercialPropagationState;
  providerOperation: VendorCommercialProviderOperation | null;
  replayed: boolean;
  requestId: string;
  revision: number;
  status: VendorLicenseRequestStatus;
}

export type VendorLicensePlanStatus = "draft" | "published" | "retired";

export type VendorLicenseBillingInterval = "month" | "year";

export interface VendorLicensePlanLimits {
  maxAdministrators: number;
  maxStudents: number;
  maxTeachers: number;
}

export interface VendorLicensePlanFeatureFlags {
  advancedAnalytics: boolean;
  customStrategies: boolean;
  governanceAccess: boolean;
  whiteLabeling: boolean;
  yearOverYearAnalytics: boolean;
}

export interface VendorLicensePlanVersion {
  billingInterval: VendorLicenseBillingInterval;
  createdAt: string;
  featureFlags: VendorLicensePlanFeatureFlags;
  layer: VendorCommercialLicenseLayer;
  limits: VendorLicensePlanLimits;
  planId: string;
  price: VendorMoney;
  revision: number;
  status: VendorLicensePlanStatus;
  versionId: string;
}

export interface VendorLicenseCatalogResult {
  catalogRevision: number;
  /** At most 50 current and retained plan versions. */
  plans: VendorLicensePlanVersion[];
}

export type VendorLicenseCatalogCommandIntent =
  | ({
      action: "publish_plan_version";
      billingInterval: VendorLicenseBillingInterval;
      expectedCatalogRevision: number;
      featureFlags: VendorLicensePlanFeatureFlags;
      layer: VendorCommercialLicenseLayer;
      limits: VendorLicensePlanLimits;
      planId: string;
      price: VendorMoney;
    } & VendorCommercialCommandMetadata)
  | ({
      action: "retire_plan_version";
      expectedCatalogRevision: number;
      expectedPlanRevision: number;
      planId: string;
      reason: string;
      versionId: string;
    } & VendorCommercialCommandMetadata);

export interface VendorLicenseCatalogCommandReceipt {
  auditEventId: string;
  catalogRevision: number;
  commandId: string;
  completedAt: string;
  plan: VendorLicensePlanVersion;
  providerOperation: VendorCommercialProviderOperation;
  replayed: boolean;
}

export type VendorSubscriptionStatus =
  | "not_configured"
  | "trialing"
  | "active"
  | "past_due"
  | "paused"
  | "canceled"
  | "incomplete"
  | "provider_unavailable";

export interface VendorSubscriptionDetail {
  cancelAtPeriodEnd: boolean;
  currentPeriodEndsAt: string | null;
  currentPeriodStartsAt: string | null;
  instituteId: string;
  planId: string | null;
  planVersionId: string | null;
  provider: "stripe" | "manual" | null;
  providerOperation: VendorCommercialProviderOperation | null;
  revision: number;
  status: VendorSubscriptionStatus;
  trialEndsAt: string | null;
  updatedAt: string;
}

export type VendorSubscriptionCommandIntent =
  | ({
      action: "change_plan";
      effective: "immediate" | "next_billing_cycle";
      planId: string;
      planVersionId: string;
      reason: string;
    } & VendorCommercialRevisionedCommandMetadata)
  | ({
      action: "extend_trial";
      extensionDays: number;
      reason: string;
    } & VendorCommercialRevisionedCommandMetadata)
  | ({
      action: "cancel_at_period_end" | "cancel_now" | "resume";
      reason: string;
    } & VendorCommercialRevisionedCommandMetadata)
  | ({
      action: "sync_provider";
      reason: string;
    } & VendorCommercialRevisionedCommandMetadata);

export interface VendorSubscriptionCommandReceipt {
  auditEventId: string;
  commandId: string;
  completedAt: string;
  propagationState: VendorCommercialPropagationState;
  providerOperation: VendorCommercialProviderOperation;
  replayed: boolean;
  revision: number;
  status: VendorSubscriptionStatus;
}

export type VendorInvoiceStatus =
  | "draft"
  | "open"
  | "past_due"
  | "paid"
  | "void"
  | "uncollectible"
  | "provider_unavailable";

export interface VendorInvoiceListQuery {
  cursor?: string;
  instituteId?: string;
  /** Defaults to 25 and may not exceed 50. */
  limit?: number;
  status?: VendorInvoiceStatus;
}

export interface VendorInvoiceSummary {
  amountDue: VendorMoney;
  amountPaid: VendorMoney;
  dueAt: string | null;
  instituteId: string;
  invoiceId: string;
  issuedAt: string | null;
  provider: "stripe" | "manual";
  revision: number;
  status: VendorInvoiceStatus;
  updatedAt: string;
}

export interface VendorInvoiceListResult
  extends VendorCommercialCursorPage<VendorInvoiceSummary> {
  totalMatching: number;
}

export interface VendorPaymentAttemptSummary {
  amount: VendorMoney;
  attemptId: string;
  occurredAt: string;
  providerEventId: string | null;
  state: "pending" | "succeeded" | "failed";
}

export type VendorOfflinePaymentStatus =
  | "pending_verification"
  | "verified"
  | "rejected"
  | "voided"
  | "provider_pending"
  | "provider_failed";

export interface VendorOfflinePaymentSummary {
  amount: VendorMoney;
  method: "bank_transfer" | "upi" | "cheque" | "other";
  occurredAt: string;
  offlinePaymentId: string;
  recordedAt: string;
  revision: number;
  status: VendorOfflinePaymentStatus;
}

export interface VendorInvoiceExternalActions {
  downloadUrl: string | null;
  expiresAt: string | null;
  hostedPaymentUrl: string | null;
}

export interface VendorInvoiceDetail extends VendorInvoiceSummary {
  externalActions: VendorInvoiceExternalActions;
  /** Newest 50 offline-payment records. */
  offlinePayments: VendorOfflinePaymentSummary[];
  /** Newest 50 provider/manual attempts. */
  paymentAttempts: VendorPaymentAttemptSummary[];
  providerOperation: VendorCommercialProviderOperation | null;
}

export type VendorInvoiceCommandIntent =
  | ({
      action: "finalize" | "void" | "retry_collection";
      reason: string;
    } & VendorCommercialRevisionedCommandMetadata)
  | ({
      action: "sync_provider";
      reason: string;
    } & VendorCommercialRevisionedCommandMetadata);

export interface VendorInvoiceCommandReceipt {
  auditEventId: string;
  commandId: string;
  completedAt: string;
  providerOperation: VendorCommercialProviderOperation;
  replayed: boolean;
  revision: number;
  status: VendorInvoiceStatus;
}

export interface VendorBillingCommunicationIntent
  extends VendorCommercialRevisionedCommandMetadata {
  action: "resend_invoice" | "send_payment_reminder";
  /** The backend resolves the authoritative billing contact and message body. */
  reason: string;
}

export interface VendorBillingCommunicationReceipt {
  auditEventId: string;
  commandId: string;
  completedAt: string;
  deliveryId: string;
  deliveryState: "queued" | "delivered" | "failed_retryable";
  recipientClass: "institute_billing_contact";
  replayed: boolean;
}

export type VendorOfflinePaymentCommandIntent =
  | ({
      action: "record";
      amount: VendorMoney;
      evidenceReference: string;
      externalReference: string;
      method: "bank_transfer" | "upi" | "cheque" | "other";
      occurredAt: string;
      reason: string;
    } & VendorCommercialRevisionedCommandMetadata)
  | ({
      action: "verify" | "reject" | "void";
      expectedOfflinePaymentRevision: number;
      offlinePaymentId: string;
      reason: string;
    } & VendorCommercialRevisionedCommandMetadata);

export interface VendorOfflinePaymentCommandReceipt {
  auditEventId: string;
  commandId: string;
  completedAt: string;
  invoiceRevision: number;
  offlinePayment: VendorOfflinePaymentSummary;
  providerOperation: VendorCommercialProviderOperation;
  replayed: boolean;
}

export type VendorPaymentEventProcessingState =
  | "received"
  | "processing"
  | "applied"
  | "ignored"
  | "failed_retryable"
  | "failed_terminal";

export type VendorPaymentEventReconciliationState =
  | "pending"
  | "reconciled"
  | "mismatch"
  | "manual_review";

export interface VendorPaymentEventListQuery {
  cursor?: string;
  instituteId?: string;
  /** Defaults to 25 and may not exceed 50. */
  limit?: number;
  processingState?: VendorPaymentEventProcessingState;
  reconciliationState?: VendorPaymentEventReconciliationState;
}

export interface VendorPaymentEventSummary {
  eventId: string;
  eventType: string;
  instituteId: string | null;
  occurredAt: string;
  processingState: VendorPaymentEventProcessingState;
  provider: "stripe" | "manual";
  reconciliationState: VendorPaymentEventReconciliationState;
  revision: number;
  updatedAt: string;
}

export interface VendorPaymentEventListResult
  extends VendorCommercialCursorPage<VendorPaymentEventSummary> {
  totalMatching: number;
}

export interface VendorPaymentEventCommandIntent
  extends VendorCommercialRevisionedCommandMetadata {
  action: "retry_reconciliation";
  reason: string;
}

export interface VendorPaymentEventCommandReceipt {
  auditEventId: string;
  commandId: string;
  completedAt: string;
  processingState: VendorPaymentEventProcessingState;
  providerOperation: VendorCommercialProviderOperation;
  reconciliationState: VendorPaymentEventReconciliationState;
  replayed: boolean;
  revision: number;
}

/**
 * Firestore stores durable commands and read models. Stripe remains authoritative
 * for provider-backed subscription, invoice, and payment outcomes. Webhook or
 * explicit reconciliation applies provider truth; browsers never author those
 * outcomes or raw provider events. Provider price references are immutable, so a
 * price change publishes a new plan version.
 *
 * Recording an offline payment never marks an invoice paid. Verification requires
 * a different current Vendor actor, and provider-backed invoices settle only after
 * provider reconciliation. Evidence references are opaque managed references, not
 * browser-authored Storage paths or URLs.
 *
 * Every mutation writes immutable Vendor and institute audit records in the same
 * durable workflow. Communication commands derive their recipient and content from
 * backend authority. Entitlement-changing receipts may report only
 * `pending_bwm_036`; BWM-036 owns fleet claim/session fan-out, retries, latency, and
 * stale-session proof.
 */
export interface VendorCommercialAuthorityContract {
  auditAuthority: "immutable_dual_audit";
  commandAuthority: "firestore_revisioned_idempotent";
  communicationAuthority: "backend_outbox_redacted";
  entitlementAuthority: "license_current_only";
  offlinePaymentAuthority: "two_actor_verified_reconciled";
  providerAuthority: "stripe_webhook_and_reconciliation";
}
