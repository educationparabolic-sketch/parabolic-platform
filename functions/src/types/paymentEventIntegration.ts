import {StandardApiErrorCode} from "./apiResponse";
import {BillingSnapshotWebhookStatus} from "./billingSnapshot";
import {LicenseLayer} from "./middleware";

export type StripeWebhookEventType =
  | "checkout.session.completed"
  | "customer.subscription.created"
  | "customer.subscription.deleted"
  | "customer.subscription.updated"
  | "invoice.payment_failed"
  | "invoice.payment_succeeded";

export interface StripeWebhookProcessingResult {
  billingRecordPath: string | null;
  duplicate: boolean;
  eventId: string;
  eventLogPath: string;
  eventType: StripeWebhookEventType;
  instituteId: string | null;
  licenseHistoryPath: string | null;
  licensePath: string | null;
  status: "ignored" | "processed";
  stripeWebhookStatus: BillingSnapshotWebhookStatus | null;
}

export interface StripeWebhookSuccessResponse {
  code: "OK";
  data: StripeWebhookProcessingResult;
  message: string;
  requestId: string;
  success: true;
  timestamp: string;
}

/**
 * Structured validation error raised by the Stripe webhook integration.
 */
export class PaymentEventIntegrationValidationError extends Error {
  public readonly code: StandardApiErrorCode;

  /**
   * @param {StandardApiErrorCode} code Stable API error code.
   * @param {string} message Safe validation detail for clients and tests.
   */
  constructor(code: StandardApiErrorCode, message: string) {
    super(message);
    this.name = "PaymentEventIntegrationValidationError";
    this.code = code;
  }
}

export interface StripeWebhookLicenseMutationContext {
  activeStudentLimit: number | null;
  billingCycle: "annual" | "monthly";
  changedBy: string;
  effectiveDate: string;
  expiryDate: string | null;
  failureDate: string | null;
  gracePeriodEndsAt: string | null;
  instituteId: string;
  licenseState: "active" | "expired" | "grace";
  newLayer: LicenseLayer | null;
  planId: string | null;
  planName: string | null;
  previousLayer: LicenseLayer | null;
  reason: string;
  startDate: string | null;
  stripeCustomerId: string | null;
  stripeEventId: string;
  stripeInvoiceId: string | null;
  stripeSubscriptionId: string | null;
  stripeWebhookStatus: BillingSnapshotWebhookStatus;
}
