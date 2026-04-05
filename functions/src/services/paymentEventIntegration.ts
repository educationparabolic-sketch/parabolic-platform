import {createHmac, timingSafeEqual} from "crypto";
import {FieldValue} from "firebase-admin/firestore";
import {auditLogStorageService} from "./auditLogStorage";
import {billingSnapshotService} from "./billingSnapshot";
import {createLogger} from "./logging";
import {licenseHistoryService} from "./licenseHistory";
import {LicenseLayer} from "../types/middleware";
import {
  PaymentEventIntegrationValidationError,
  StripeWebhookEventType,
  StripeWebhookLicenseMutationContext,
  StripeWebhookProcessingResult,
} from "../types/paymentEventIntegration";
import {
  BillingSnapshotWebhookStatus,
} from "../types/billingSnapshot";
import {getFirestore} from "../utils/firebaseAdmin";
import {loadEnvironmentConfig} from "../utils/environment";

const INSTITUTES_COLLECTION = "institutes";
const LICENSE_COLLECTION = "license";
const LICENSE_CURRENT_DOCUMENT_ID = "current";
const LICENSE_MAIN_DOCUMENT_ID = "main";
const LICENSE_HISTORY_REASON_BY_EVENT:
Record<StripeWebhookEventType, string> = {
  "checkout.session.completed":
    "Stripe checkout completion synchronized institute license state.",
  "customer.subscription.created":
    "Stripe subscription creation synchronized institute license state.",
  "customer.subscription.deleted":
    "Stripe subscription cancellation synchronized institute license state.",
  "customer.subscription.updated":
    "Stripe subscription update synchronized institute license state.",
  "invoice.payment_failed":
    "Stripe payment failure synchronized institute license state.",
  "invoice.payment_succeeded":
    "Stripe payment success synchronized institute license state.",
};
const BILLING_RECORDS_COLLECTION = "billingRecords";
const VENDOR_COLLECTION = "vendor";
const STRIPE_EVENTS_DOCUMENT_ID = "stripeEvents";
const STRIPE_EVENTS_COLLECTION = "events";
const VENDOR_CONFIG_COLLECTION = "vendorConfig";
const PRICING_PLANS_DOCUMENT_ID = "pricingPlans";
const PRICING_PLANS_COLLECTION = "pricingPlans";
const SUPPORTED_EVENTS = new Set<StripeWebhookEventType>([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.deleted",
  "customer.subscription.updated",
  "invoice.payment_failed",
  "invoice.payment_succeeded",
]);
const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;
const DEFAULT_GRACE_PERIOD_DAYS = 7;
const PRODUCT_LAYER_MAP: Record<string, LicenseLayer> = {
  controlled_plan: "L2",
  diagnostic_plan: "L1",
  governance_plan: "L3",
  operational_plan: "L0",
};

interface ParsedStripeEvent {
  created: number | null;
  data: {
    object: Record<string, unknown>;
  };
  id: string;
  type: StripeWebhookEventType;
}

interface NormalizedStripeEventContext {
  activeStudentLimit: number | null;
  amountPaid: number | null;
  billingCycle: "annual" | "monthly";
  billingPeriodEnd: string | null;
  billingPeriodStart: string | null;
  currency: string | null;
  customerId: string | null;
  effectiveDate: string;
  eventId: string;
  eventType: StripeWebhookEventType;
  invoiceId: string | null;
  instituteId: string | null;
  layer: LicenseLayer | null;
  planId: string | null;
  planName: string | null;
  subscriptionId: string | null;
  webhookStatus: BillingSnapshotWebhookStatus;
}

interface SignatureHeaderParts {
  timestamp: string;
  v1: string[];
}

interface PricingPlanResolution {
  activeStudentLimit: number | null;
  layer: LicenseLayer;
  planId: string;
  planName: string | null;
}

const isRecord = (
  value: unknown,
): value is Record<string, unknown> => typeof value === "object" &&
  value !== null &&
  !Array.isArray(value);

const normalizeOptionalString = (
  value: unknown,
): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue || null;
};

const normalizeOptionalNumber = (
  value: unknown,
): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return value;
};

const normalizeCurrencyAmount = (
  value: unknown,
): number | null => {
  const normalizedValue = normalizeOptionalNumber(value);

  if (normalizedValue === null) {
    return null;
  }

  return Number((normalizedValue / 100).toFixed(2));
};

const toIsoStringFromUnixSeconds = (
  value: unknown,
): string | null => {
  const normalizedValue = normalizeOptionalNumber(value);

  if (normalizedValue === null) {
    return null;
  }

  return new Date(normalizedValue * 1000).toISOString();
};

const formatCycleId = (value: string): string => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new PaymentEventIntegrationValidationError(
      "VALIDATION_ERROR",
      "Stripe webhook event contains an invalid billing timestamp.",
    );
  }

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
  ].join("-");
};

const buildStripeEventPath = (eventId: string): string =>
  `${VENDOR_COLLECTION}/${STRIPE_EVENTS_DOCUMENT_ID}/` +
  `${STRIPE_EVENTS_COLLECTION}/${eventId}`;

const buildInstitutePath = (instituteId: string): string =>
  `${INSTITUTES_COLLECTION}/${instituteId}`;

const buildLicensePath = (
  instituteId: string,
  documentId: string,
): string =>
  `${buildInstitutePath(instituteId)}/${LICENSE_COLLECTION}/${documentId}`;

const buildBillingRecordPath = (
  instituteId: string,
  invoiceId: string,
): string =>
  `${buildInstitutePath(instituteId)}/` +
  `${BILLING_RECORDS_COLLECTION}/${invoiceId}`;

const buildPricingPlansCollectionPath = (): string =>
  `${VENDOR_CONFIG_COLLECTION}/${PRICING_PLANS_DOCUMENT_ID}/` +
  `${PRICING_PLANS_COLLECTION}`;

const parseRawPayload = (
  rawBody: Buffer | string | undefined,
  body: unknown,
): string => {
  if (rawBody instanceof Buffer) {
    return rawBody.toString("utf8");
  }

  if (typeof rawBody === "string" && rawBody.trim()) {
    return rawBody;
  }

  if (typeof body === "string" && body.trim()) {
    return body;
  }

  if (isRecord(body) || Array.isArray(body)) {
    return JSON.stringify(body);
  }

  throw new PaymentEventIntegrationValidationError(
    "VALIDATION_ERROR",
    "Stripe webhook request body is required.",
  );
};

const parseStripeSignatureHeader = (
  headerValue: string | undefined,
): SignatureHeaderParts => {
  if (!headerValue) {
    throw new PaymentEventIntegrationValidationError(
      "FORBIDDEN",
      "Missing Stripe signature header.",
    );
  }

  const segments = headerValue
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean);
  const timestamp = segments
    .find((segment) => segment.startsWith("t="))
    ?.slice(2);
  const signatures = segments
    .filter((segment) => segment.startsWith("v1="))
    .map((segment) => segment.slice(3))
    .filter(Boolean);

  if (!timestamp || signatures.length === 0) {
    throw new PaymentEventIntegrationValidationError(
      "FORBIDDEN",
      "Stripe signature header is invalid.",
    );
  }

  return {
    timestamp,
    v1: signatures,
  };
};

const verifyStripeSignature = (
  payload: string,
  signatureHeader: string | undefined,
  secret: string | undefined,
): void => {
  if (!secret) {
    throw new PaymentEventIntegrationValidationError(
      "INTERNAL_ERROR",
      "Stripe webhook secret is not configured.",
    );
  }

  const signatureParts = parseStripeSignatureHeader(signatureHeader);
  const signedPayload = `${signatureParts.timestamp}.${payload}`;
  const expectedSignature = createHmac("sha256", secret)
    .update(signedPayload, "utf8")
    .digest("hex");
  const nowSeconds = Math.floor(Date.now() / 1000);
  const signatureTimestamp = Number(signatureParts.timestamp);

  if (
    !Number.isFinite(signatureTimestamp) ||
    Math.abs(nowSeconds - signatureTimestamp) >
      STRIPE_SIGNATURE_TOLERANCE_SECONDS
  ) {
    throw new PaymentEventIntegrationValidationError(
      "FORBIDDEN",
      "Stripe signature timestamp is outside the allowed tolerance.",
    );
  }

  const signatureMatches = signatureParts.v1.some((signature) => {
    const expectedBuffer = Buffer.from(expectedSignature, "utf8");
    const actualBuffer = Buffer.from(signature, "utf8");

    if (expectedBuffer.length !== actualBuffer.length) {
      return false;
    }

    return timingSafeEqual(expectedBuffer, actualBuffer);
  });

  if (!signatureMatches) {
    throw new PaymentEventIntegrationValidationError(
      "FORBIDDEN",
      "Stripe webhook signature validation failed.",
    );
  }
};

const parseStripeEvent = (payload: string): ParsedStripeEvent => {
  let parsedPayload: unknown;

  try {
    parsedPayload = JSON.parse(payload);
  } catch (error) {
    throw new PaymentEventIntegrationValidationError(
      "VALIDATION_ERROR",
      "Stripe webhook body must be valid JSON.",
    );
  }

  if (
    !isRecord(parsedPayload) ||
    !isRecord(parsedPayload.data) ||
    !isRecord(parsedPayload.data.object)
  ) {
    throw new PaymentEventIntegrationValidationError(
      "VALIDATION_ERROR",
      "Stripe webhook body is missing the expected event structure.",
    );
  }

  const eventId = normalizeOptionalString(parsedPayload.id);
  const eventType = normalizeOptionalString(parsedPayload.type);

  if (
    !eventId ||
    !eventType ||
    !SUPPORTED_EVENTS.has(eventType as StripeWebhookEventType)
  ) {
    throw new PaymentEventIntegrationValidationError(
      "VALIDATION_ERROR",
      "Stripe webhook event type is not supported by this endpoint.",
    );
  }

  return {
    created: normalizeOptionalNumber(parsedPayload.created),
    data: {
      object: parsedPayload.data.object,
    },
    id: eventId,
    type: eventType as StripeWebhookEventType,
  };
};

const resolveMetadata = (
  source: Record<string, unknown>,
): Record<string, unknown> => {
  const metadata = source.metadata;
  return isRecord(metadata) ? metadata : {};
};

const resolveNestedObject = (
  value: unknown,
): Record<string, unknown> | null => isRecord(value) ? value : null;

const resolveSubscriptionLineItem = (
  source: Record<string, unknown>,
): Record<string, unknown> | null => {
  const lines = resolveNestedObject(source.lines);
  const lineItems = lines?.data;

  if (!Array.isArray(lineItems)) {
    return null;
  }

  const firstLineItem = lineItems.find((entry) => isRecord(entry));
  return isRecord(firstLineItem) ? firstLineItem : null;
};

const resolveSubscriptionItem = (
  source: Record<string, unknown>,
): Record<string, unknown> | null => {
  const items = resolveNestedObject(source.items);
  const entries = items?.data;

  if (!Array.isArray(entries)) {
    return null;
  }

  const firstItem = entries.find((entry) => isRecord(entry));
  return isRecord(firstItem) ? firstItem : null;
};

const resolvePriceObject = (
  source: Record<string, unknown>,
): Record<string, unknown> | null => {
  const directPrice = resolveNestedObject(source.price);

  if (directPrice) {
    return directPrice;
  }

  const subscriptionLineItem = resolveSubscriptionLineItem(source);
  const linePrice = resolveNestedObject(subscriptionLineItem?.price);

  if (linePrice) {
    return linePrice;
  }

  const subscriptionItem = resolveSubscriptionItem(source);
  return resolveNestedObject(subscriptionItem?.price);
};

const resolveBillingCycle = (
  source: Record<string, unknown>,
): "annual" | "monthly" => {
  const metadata = resolveMetadata(source);
  const metadataCycle = normalizeOptionalString(metadata.billingCycle)
    ?.toLowerCase();

  if (
    metadataCycle === "annual" ||
    metadataCycle === "year" ||
    metadataCycle === "yearly"
  ) {
    return "annual";
  }

  if (
    metadataCycle === "month" ||
    metadataCycle === "monthly"
  ) {
    return "monthly";
  }

  const priceObject = resolvePriceObject(source);
  const recurring = resolveNestedObject(priceObject?.recurring);
  const interval = normalizeOptionalString(recurring?.interval)?.toLowerCase();

  if (interval === "year") {
    return "annual";
  }

  return "monthly";
};

const resolveEventLayer = (
  source: Record<string, unknown>,
): LicenseLayer | null => {
  const metadata = resolveMetadata(source);
  const metadataCandidates = [
    normalizeOptionalString(metadata.licenseLayer),
    normalizeOptionalString(metadata.planId),
    normalizeOptionalString(metadata.productId),
  ];

  for (const candidate of metadataCandidates) {
    const normalizedCandidate = candidate?.trim().toUpperCase();

    if (
      normalizedCandidate === "L0" ||
      normalizedCandidate === "L1" ||
      normalizedCandidate === "L2" ||
      normalizedCandidate === "L3"
    ) {
      return normalizedCandidate;
    }
  }

  const priceObject = resolvePriceObject(source);
  const rawProductId =
    normalizeOptionalString(priceObject?.product) ??
    normalizeOptionalString(resolveSubscriptionLineItem(source)?.plan) ??
    normalizeOptionalString(source.planId);
  const normalizedProductId = rawProductId?.trim().toLowerCase();

  if (!normalizedProductId) {
    return null;
  }

  if (
    normalizedProductId === "l0" ||
    normalizedProductId === "l1" ||
    normalizedProductId === "l2" ||
    normalizedProductId === "l3"
  ) {
    return normalizedProductId.toUpperCase() as LicenseLayer;
  }

  return PRODUCT_LAYER_MAP[normalizedProductId] ?? null;
};

const resolveInstituteIdFromMetadata = (
  source: Record<string, unknown>,
): string | null => {
  const metadata = resolveMetadata(source);
  return normalizeOptionalString(metadata.instituteId);
};

const resolveEventContext = (
  event: ParsedStripeEvent,
): NormalizedStripeEventContext => {
  const object = event.data.object;
  const priceObject = resolvePriceObject(object);
  const subscriptionLineItem = resolveSubscriptionLineItem(object);
  const lineItemPeriod = resolveNestedObject(subscriptionLineItem?.period);
  const effectiveDate =
    toIsoStringFromUnixSeconds(event.created) ??
    new Date().toISOString();
  const billingPeriodStart =
    toIsoStringFromUnixSeconds(object.period_start) ??
    toIsoStringFromUnixSeconds(lineItemPeriod?.start) ??
    toIsoStringFromUnixSeconds(object.current_period_start) ??
    effectiveDate;
  const billingPeriodEnd =
    toIsoStringFromUnixSeconds(object.period_end) ??
    toIsoStringFromUnixSeconds(lineItemPeriod?.end) ??
    toIsoStringFromUnixSeconds(object.current_period_end);
  const invoiceId =
    normalizeOptionalString(object.id)?.startsWith("in_") === true ?
      normalizeOptionalString(object.id) :
      normalizeOptionalString(object.invoice);
  const customerId = normalizeOptionalString(object.customer);
  const directSubscriptionId = normalizeOptionalString(object.subscription);
  const objectSubscriptionId =
    normalizeOptionalString(object.id)?.startsWith("sub_") === true ?
      normalizeOptionalString(object.id) :
      null;
  const subscriptionId = directSubscriptionId ?? objectSubscriptionId;
  const planId =
    normalizeOptionalString(priceObject?.product) ??
    normalizeOptionalString(resolveMetadata(object).productId);
  const webhookStatus: BillingSnapshotWebhookStatus =
    event.type === "invoice.payment_failed" ? "failed" :
      event.type === "customer.subscription.deleted" ?
        "not_applicable" :
        "succeeded";

  return {
    activeStudentLimit: normalizeOptionalNumber(
      resolveMetadata(object).studentLimit,
    ),
    amountPaid:
      normalizeCurrencyAmount(object.amount_paid) ??
      normalizeCurrencyAmount(object.amount_due) ??
      normalizeCurrencyAmount(object.amount_total),
    billingCycle: resolveBillingCycle(object),
    billingPeriodEnd,
    billingPeriodStart,
    currency: normalizeOptionalString(object.currency)?.toLowerCase() ?? null,
    customerId,
    effectiveDate,
    eventId: event.id,
    eventType: event.type,
    invoiceId,
    instituteId: resolveInstituteIdFromMetadata(object),
    layer: resolveEventLayer(object),
    planId,
    planName:
      normalizeOptionalString(resolveMetadata(object).planName) ??
      normalizeOptionalString(resolveMetadata(object).billingPlan),
    subscriptionId,
    webhookStatus,
  };
};

const resolveFailureDate = (
  eventContext: NormalizedStripeEventContext,
): string | null =>
  eventContext.eventType === "invoice.payment_failed" ?
    eventContext.effectiveDate :
    null;

const resolveGracePeriodEndsAt = (
  failureDate: string | null,
): string | null => {
  if (!failureDate) {
    return null;
  }

  const failureTimestamp = new Date(failureDate);

  if (Number.isNaN(failureTimestamp.getTime())) {
    return null;
  }

  return new Date(
    failureTimestamp.getTime() +
    (DEFAULT_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000),
  ).toISOString();
};

const resolveExistingLicenseLayer = (
  licenseData: Record<string, unknown>,
): LicenseLayer | null => {
  const candidates = [
    normalizeOptionalString(licenseData.currentLayer),
    normalizeOptionalString(licenseData.planId),
  ];

  for (const candidate of candidates) {
    const normalizedCandidate = candidate?.trim().toUpperCase();

    if (
      normalizedCandidate === "L0" ||
      normalizedCandidate === "L1" ||
      normalizedCandidate === "L2" ||
      normalizedCandidate === "L3"
    ) {
      return normalizedCandidate;
    }
  }

  return null;
};

const resolvePricingPlan = async (
  layer: LicenseLayer,
): Promise<PricingPlanResolution> => {
  const firestore = getFirestore();
  const pricingPlanSnapshot = await firestore
    .collection(buildPricingPlansCollectionPath())
    .doc(layer)
    .get();

  if (!pricingPlanSnapshot.exists || !isRecord(pricingPlanSnapshot.data())) {
    throw new PaymentEventIntegrationValidationError(
      "NOT_FOUND",
      `Pricing plan for layer "${layer}" does not exist.`,
    );
  }

  const pricingPlanData = pricingPlanSnapshot.data() as Record<string, unknown>;

  return {
    activeStudentLimit:
      normalizeOptionalNumber(pricingPlanData.studentLimit),
    layer,
    planId: normalizeOptionalString(pricingPlanData.planId) ?? layer,
    planName:
      normalizeOptionalString(pricingPlanData.name) ??
      normalizeOptionalString(pricingPlanData.planName),
  };
};

const resolveInstituteIdFromStripeReferences = async (
  customerId: string | null,
  subscriptionId: string | null,
): Promise<string | null> => {
  const firestore = getFirestore();
  const instituteIds = new Set<string>();
  const candidateQueries: Array<Promise<FirebaseFirestore.QuerySnapshot>> = [];

  if (customerId) {
    candidateQueries.push(
      firestore.collectionGroup(LICENSE_COLLECTION)
        .where("stripeCustomerId", "==", customerId)
        .get(),
    );
  }

  if (subscriptionId) {
    candidateQueries.push(
      firestore.collectionGroup(LICENSE_COLLECTION)
        .where("stripeSubscriptionId", "==", subscriptionId)
        .get(),
    );
  }

  if (candidateQueries.length === 0) {
    return null;
  }

  const querySnapshots = await Promise.all(candidateQueries);

  for (const querySnapshot of querySnapshots) {
    for (const documentSnapshot of querySnapshot.docs) {
      const instituteReference = documentSnapshot.ref.parent.parent;

      if (instituteReference) {
        instituteIds.add(instituteReference.id);
      }
    }
  }

  if (instituteIds.size > 1) {
    throw new PaymentEventIntegrationValidationError(
      "VALIDATION_ERROR",
      "Stripe webhook references multiple institutes.",
    );
  }

  return Array.from(instituteIds)[0] ?? null;
};

const buildLicenseMutationContext = (
  eventContext: NormalizedStripeEventContext,
  pricingPlan: PricingPlanResolution | null,
  baseLicenseData: Record<string, unknown>,
): StripeWebhookLicenseMutationContext => {
  const previousLayer = resolveExistingLicenseLayer(baseLicenseData);
  const failureDate = resolveFailureDate(eventContext);
  const gracePeriodEndsAt = resolveGracePeriodEndsAt(failureDate);
  const cancellationExpiryDate = eventContext.billingPeriodEnd;
  const cancellationIsExpired = cancellationExpiryDate ?
    new Date(cancellationExpiryDate).getTime() <= Date.now() :
    false;

  let licenseState: "active" | "expired" | "grace";
  let newLayer: LicenseLayer | null;

  if (eventContext.eventType === "invoice.payment_failed") {
    licenseState = "grace";
    newLayer = previousLayer;
  } else if (eventContext.eventType === "customer.subscription.deleted") {
    licenseState = cancellationIsExpired ? "expired" : "active";
    newLayer = cancellationIsExpired ? "L0" : previousLayer;
  } else {
    licenseState = "active";
    newLayer = pricingPlan?.layer ?? eventContext.layer ?? previousLayer;
  }

  return {
    activeStudentLimit:
      pricingPlan?.activeStudentLimit ??
      eventContext.activeStudentLimit ??
      normalizeOptionalNumber(baseLicenseData.activeStudentLimit),
    billingCycle: eventContext.billingCycle,
    changedBy: "stripe_webhook",
    effectiveDate: eventContext.effectiveDate,
    expiryDate:
      eventContext.billingPeriodEnd ??
      normalizeOptionalString(baseLicenseData.expiryDate),
    failureDate,
    gracePeriodEndsAt,
    instituteId: "",
    licenseState,
    newLayer,
    planId:
      pricingPlan?.planId ??
      eventContext.planId ??
      normalizeOptionalString(baseLicenseData.planId),
    planName:
      pricingPlan?.planName ??
      eventContext.planName ??
      normalizeOptionalString(baseLicenseData.planName),
    previousLayer,
    reason: LICENSE_HISTORY_REASON_BY_EVENT[eventContext.eventType],
    startDate:
      eventContext.billingPeriodStart ??
      normalizeOptionalString(baseLicenseData.startDate),
    stripeCustomerId:
      eventContext.customerId ??
      normalizeOptionalString(baseLicenseData.stripeCustomerId),
    stripeEventId: eventContext.eventId,
    stripeInvoiceId: eventContext.invoiceId,
    stripeSubscriptionId:
      eventContext.subscriptionId ??
      normalizeOptionalString(baseLicenseData.stripeSubscriptionId),
    stripeWebhookStatus: eventContext.webhookStatus,
  };
};

const buildBillingRecordDocument = (
  eventContext: NormalizedStripeEventContext,
): Record<string, unknown> | null => {
  if (!eventContext.invoiceId) {
    return null;
  }

  if (
    eventContext.eventType !== "invoice.payment_succeeded" &&
    eventContext.eventType !== "invoice.payment_failed"
  ) {
    return null;
  }

  return {
    amountPaid: eventContext.amountPaid ?? 0,
    billingPeriodEnd: eventContext.billingPeriodEnd,
    billingPeriodStart: eventContext.billingPeriodStart,
    createdAt: FieldValue.serverTimestamp(),
    currency: eventContext.currency ?? "usd",
    status:
      eventContext.eventType === "invoice.payment_failed" ?
        "failed" :
        "paid",
    stripeInvoiceId: eventContext.invoiceId,
  };
};

/**
 * Integrates Stripe payment events into license and billing state.
 */
export class PaymentEventIntegrationService {
  private readonly firestore = getFirestore();
  private readonly logger = createLogger("PaymentEventIntegrationService");

  /**
   * Validates, deduplicates, and applies a single Stripe webhook event.
   * @param {object} input Webhook request payload and signature metadata.
   * @return {Promise<StripeWebhookProcessingResult>} Processing result.
   */
  public async processStripeWebhook(
    input: {
      rawBody?: Buffer | string;
      requestBody?: unknown;
      signatureHeader?: string;
    },
  ): Promise<StripeWebhookProcessingResult> {
    const environmentConfig = await loadEnvironmentConfig();
    const rawPayload = parseRawPayload(input.rawBody, input.requestBody);

    verifyStripeSignature(
      rawPayload,
      input.signatureHeader,
      environmentConfig.secrets.stripeWebhookSecret,
    );

    const event = parseStripeEvent(rawPayload);
    const eventContext = resolveEventContext(event);
    const instituteId =
      eventContext.instituteId ??
      await resolveInstituteIdFromStripeReferences(
        eventContext.customerId,
        eventContext.subscriptionId,
      );

    if (!instituteId) {
      throw new PaymentEventIntegrationValidationError(
        "NOT_FOUND",
        "Stripe webhook institute could not be resolved.",
      );
    }

    const eventLogPath = buildStripeEventPath(event.id);
    const eventLogReference = this.firestore.doc(eventLogPath);
    const currentLicensePath = buildLicensePath(
      instituteId,
      LICENSE_CURRENT_DOCUMENT_ID,
    );
    const compatibilityLicensePath = buildLicensePath(
      instituteId,
      LICENSE_MAIN_DOCUMENT_ID,
    );
    const institutePath = buildInstitutePath(instituteId);

    const result = await this.firestore.runTransaction(async (transaction) => {
      const eventLogSnapshot = await transaction.get(eventLogReference);

      if (eventLogSnapshot.exists) {
        return {
          billingRecordPath:
            normalizeOptionalString(eventLogSnapshot.get("billingRecordPath")),
          duplicate: true,
          eventId: event.id,
          eventLogPath,
          eventType: event.type,
          instituteId,
          licenseHistoryPath:
            normalizeOptionalString(
              eventLogSnapshot.get("licenseHistoryPath"),
            ),
          licensePath:
            normalizeOptionalString(eventLogSnapshot.get("licensePath")),
          status:
            normalizeOptionalString(
              eventLogSnapshot.get("status"),
            ) === "ignored" ?
              "ignored" :
              "processed",
          stripeWebhookStatus:
            normalizeOptionalString(
              eventLogSnapshot.get("stripeWebhookStatus"),
            ) as BillingSnapshotWebhookStatus | null,
        } satisfies StripeWebhookProcessingResult;
      }

      const instituteReference = this.firestore.doc(institutePath);
      const currentLicenseReference = this.firestore.doc(currentLicensePath);
      const compatibilityLicenseReference = this.firestore.doc(
        compatibilityLicensePath,
      );
      const [
        instituteSnapshot,
        currentLicenseSnapshot,
        compatibilityLicenseSnapshot,
      ] = await Promise.all([
        transaction.get(instituteReference),
        transaction.get(currentLicenseReference),
        transaction.get(compatibilityLicenseReference),
      ]);

      if (!instituteSnapshot.exists) {
        throw new PaymentEventIntegrationValidationError(
          "NOT_FOUND",
          `Institute "${instituteId}" does not exist.`,
        );
      }

      const currentLicenseData =
        isRecord(currentLicenseSnapshot.data()) ?
          currentLicenseSnapshot.data() as Record<string, unknown> :
          {};
      const compatibilityLicenseData =
        isRecord(compatibilityLicenseSnapshot.data()) ?
          compatibilityLicenseSnapshot.data() as Record<string, unknown> :
          {};
      const baseLicenseData =
        currentLicenseSnapshot.exists ?
          currentLicenseData :
          compatibilityLicenseData;
      const resolvedLayer =
        eventContext.layer ??
        resolveExistingLicenseLayer(baseLicenseData);
      const pricingPlan = resolvedLayer ?
        await resolvePricingPlan(resolvedLayer) :
        null;
      const mutationContext = buildLicenseMutationContext(
        eventContext,
        pricingPlan,
        baseLicenseData,
      );
      mutationContext.instituteId = instituteId;

      const nextLicenseDocument: Record<string, unknown> = {
        ...baseLicenseData,
        activeStudentLimit: mutationContext.activeStudentLimit,
        billingCycle: mutationContext.billingCycle,
        currentLayer: mutationContext.newLayer ??
          resolveExistingLicenseLayer(baseLicenseData) ??
          "L0",
        expiryDate: mutationContext.expiryDate,
        gracePeriodEndsAt: mutationContext.gracePeriodEndsAt,
        lastPaymentFailureAt: mutationContext.failureDate,
        licenseState: mutationContext.licenseState,
        planId: mutationContext.planId,
        planName: mutationContext.planName,
        startDate: mutationContext.startDate,
        stripeCustomerId: mutationContext.stripeCustomerId,
        stripeEventId: mutationContext.stripeEventId,
        stripeInvoiceId: mutationContext.stripeInvoiceId,
        stripeSubscriptionId: mutationContext.stripeSubscriptionId,
        stripeWebhookStatus: mutationContext.stripeWebhookStatus,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: mutationContext.changedBy,
      };

      const licenseHistoryWrite =
        licenseHistoryService.prepareLicenseHistoryEntry({
          billingPlan:
            mutationContext.planName ??
            mutationContext.planId ??
            mutationContext.newLayer ??
            mutationContext.previousLayer ??
            "L0",
          changedBy: mutationContext.changedBy,
          effectiveDate: mutationContext.effectiveDate,
          instituteId,
          newLayer:
            mutationContext.newLayer ??
            mutationContext.previousLayer ??
            "L0",
          newStudentLimit: mutationContext.activeStudentLimit ?? undefined,
          previousLayer: mutationContext.previousLayer ?? "L0",
          previousStudentLimit:
            normalizeOptionalNumber(baseLicenseData.activeStudentLimit) ??
            undefined,
          reason: mutationContext.reason,
          stripeInvoiceId: mutationContext.stripeInvoiceId ?? undefined,
        });
      const billingRecordDocument = buildBillingRecordDocument(eventContext);
      const billingRecordPath =
        eventContext.invoiceId ?
          buildBillingRecordPath(instituteId, eventContext.invoiceId) :
          null;

      transaction.set(
        currentLicenseReference,
        nextLicenseDocument,
        {merge: true},
      );
      transaction.set(
        compatibilityLicenseReference,
        nextLicenseDocument,
        {merge: true},
      );
      transaction.create(
        this.firestore.doc(licenseHistoryWrite.path),
        licenseHistoryWrite.entry,
      );

      if (billingRecordDocument && billingRecordPath) {
        transaction.set(
          this.firestore.doc(billingRecordPath),
          billingRecordDocument,
          {merge: true},
        );
      }

      transaction.create(eventLogReference, {
        billingRecordPath,
        createdAt: FieldValue.serverTimestamp(),
        eventId: event.id,
        eventType: event.type,
        instituteId,
        invoiceId: eventContext.invoiceId,
        licenseHistoryPath: licenseHistoryWrite.path,
        licensePath: currentLicensePath,
        status: "processed",
        stripeCustomerId: eventContext.customerId,
        stripeSubscriptionId: eventContext.subscriptionId,
        stripeWebhookStatus: eventContext.webhookStatus,
      });

      return {
        billingRecordPath,
        duplicate: false,
        eventId: event.id,
        eventLogPath,
        eventType: event.type,
        instituteId,
        licenseHistoryPath: licenseHistoryWrite.path,
        licensePath: currentLicensePath,
        status: "processed",
        stripeWebhookStatus: eventContext.webhookStatus,
      } satisfies StripeWebhookProcessingResult;
    });

    if (!result.duplicate && result.instituteId && result.stripeWebhookStatus) {
      const cycleId = formatCycleId(
        eventContext.billingPeriodStart ?? eventContext.effectiveDate,
      );
      await billingSnapshotService.syncStripeWebhookStatus(
        result.instituteId,
        cycleId,
        result.stripeWebhookStatus,
      );
      await auditLogStorageService.createVendorAuditLog({
        actionType: "PAYMENT_EVENT_PROCESSED",
        actorRole: "system",
        actorUid: "stripe_webhook",
        metadata: {
          billingRecordPath: result.billingRecordPath,
          eventId: result.eventId,
          eventType: result.eventType,
          instituteId: result.instituteId,
          licenseHistoryPath: result.licenseHistoryPath,
          licensePath: result.licensePath,
          stripeWebhookStatus: result.stripeWebhookStatus,
        },
        targetCollection:
          `${INSTITUTES_COLLECTION}/${result.instituteId}/license`,
        targetId: LICENSE_CURRENT_DOCUMENT_ID,
      });
    }

    this.logger.info("Stripe webhook processed.", {
      billingRecordPath: result.billingRecordPath,
      duplicate: result.duplicate,
      eventId: result.eventId,
      eventLogPath: result.eventLogPath,
      eventType: result.eventType,
      instituteId: result.instituteId,
      licenseHistoryPath: result.licenseHistoryPath,
      licensePath: result.licensePath,
      status: result.status,
      stripeWebhookStatus: result.stripeWebhookStatus,
    });

    return result;
  }
}

export const paymentEventIntegrationService =
  new PaymentEventIntegrationService();
