/**
 * BWM-040 Vendor audit/system-health wire contract, not a runtime validator.
 *
 * The two reads are current-Vendor, read-only projections over existing server
 * authority. Unknown fields, coercion, partial source acceptance and browser
 * fallback values are forbidden. No type in this file authorizes a writer,
 * source backfill, global health verdict or telemetry ingestion endpoint.
 */

export type VendorAuditCategory =
  | "institute"
  | "onboarding"
  | "access"
  | "support"
  | "license"
  | "billing"
  | "webhook"
  | "calibration";

export type VendorAuditStatus = "completed" | "pending" | "failed";

export type VendorAuditSource =
  | "vendor_command_audit"
  | "vendor_system_audit"
  | "calibration_terminal"
  | "stripe_event"
  | "billing_snapshot"
  | "license_history";

/**
 * GET /api/v1/vendor/audit-events.
 *
 * `from` and `to` are strict ISO-8601 instants and form an inclusive range.
 * Omitted category/instituteId/status/range means no filter for that dimension.
 * A cursor is valid only with the exact same normalized filter set and limit.
 * Default limit is 25; maximum is 50. Unknown and duplicate query keys fail.
 */
export interface VendorAuditEventsQuery {
  category?: VendorAuditCategory;
  instituteId?: string;
  status?: VendorAuditStatus;
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
}

/** Closed allowlist. Every property is present and nullable when inapplicable. */
export interface VendorAuditEventMetadata {
  operationId: string | null;
  requestId: string | null;
  invoiceId: string | null;
  versionId: string | null;
  cycleId: string | null;
  eventType: string | null;
  processingState: string | null;
  reconciliationState: string | null;
  previousLicenseLayer: string | null;
  nextLicenseLayer: string | null;
  amountMinor: number | null;
  currency: string | null;
  affectedInstituteCount: number | null;
  revision: number | null;
}

export interface VendorAuditEvent {
  /** Opaque pseudonym, not a sort key. Order: time DESC, source precedence,
   * then private source document ID DESC (never exposed in the DTO). */
  eventId: string;
  occurredAt: string;
  source: VendorAuditSource;
  category: VendorAuditCategory;
  status: VendorAuditStatus;
  action: string;
  summary: string;
  actor: {
    userId: string;
    role: string | null;
  } | null;
  institute: {
    instituteId: string;
    displayName: string | null;
  } | null;
  target: {
    kind: "institute" | "onboarding" | "administrator" |
      "support_ticket" | "license" | "invoice" | "payment_event" |
      "calibration";
    targetId: string;
  } | null;
  metadata: VendorAuditEventMetadata;
}

export interface VendorAuditEventsResult {
  generatedAt: string;
  items: VendorAuditEvent[];
  hasMore: boolean;
  nextCursor: string | null;
}

/**
 * Server-only decoded cursor contract. The public cursor is an opaque bounded
 * base64url token. The runtime must protect the complete payload with
 * authenticated encryption so internal continuation paths/provider identifiers
 * are never disclosed; payloads, hashes and PII are never cursor inputs.
 */
export interface VendorAuditCursorAnchor {
  occurredAt: string;
  continuation: string;
}

export interface VendorAuditCursorAnchors {
  vendorCommandAudit: VendorAuditCursorAnchor | null;
  vendorSystemAudit: VendorAuditCursorAnchor | null;
  calibrationTerminal: VendorAuditCursorAnchor | null;
  stripeEvent: VendorAuditCursorAnchor | null;
  billingSnapshot: VendorAuditCursorAnchor | null;
  licenseHistory: VendorAuditCursorAnchor | null;
}

export interface VendorAuditCursorPayload {
  version: 1;
  filterFingerprint: string;
  anchors: VendorAuditCursorAnchors;
}

export type VendorHealthUnavailableReason =
  | "not_configured"
  | "no_durable_source"
  | "adapter_not_implemented"
  | "source_limit_exceeded"
  | "source_unavailable";

export interface VendorHealthUnavailableSource {
  availability: "unavailable";
  reason: VendorHealthUnavailableReason;
  observedAt: string;
}

export type VendorHealthAvailableSource<T> = {
  availability: "available";
  observedAt: string;
  data: T;
};

export type VendorHealthSource<T> =
  | VendorHealthAvailableSource<T>
  | VendorHealthUnavailableSource;

export interface VendorRuntimeReleaseIdentity {
  releaseId: string | null;
  commitSha: string | null;
  builtAt: string | null;
  environment: string | null;
  functionsRevision: string | null;
}

/** Exact source-specific state only; named subcounts need not partition total
 * or outstanding (for example Stripe manual review has no retrying claim).
 * This does not imply availability, an SLA or an overall health verdict.
 */
export interface VendorOperationalQueueEvidence {
  totalCount: number;
  outstandingCount: number;
  processingCount: number;
  retryingCount: number;
  succeededCount: number;
  failedCount: number;
  oldestOutstandingAt: string | null;
  newestActivityAt: string | null;
}

/** GET /api/v1/vendor/system-health. No query parameters or request body. */
export interface VendorSystemHealthResult {
  generatedAt: string;
  release: VendorHealthSource<VendorRuntimeReleaseIdentity>;
  failureRecovery: VendorHealthSource<VendorOperationalQueueEvidence>;
  emailDelivery: VendorHealthSource<VendorOperationalQueueEvidence>;
  stripeReconciliation: VendorHealthSource<VendorOperationalQueueEvidence>;
  calibrationOperations: VendorHealthSource<VendorOperationalQueueEvidence>;
  cloudMonitoring: VendorHealthUnavailableSource;
  errorReporting: VendorHealthUnavailableSource;
  costAndUsage: VendorHealthUnavailableSource;
  latencyAndErrorMetrics: VendorHealthUnavailableSource;
  frontendTelemetry: VendorHealthUnavailableSource;
  deploymentHistory: VendorHealthUnavailableSource;
}

/** Declarative validation/ownership rules; runtime must enforce every literal. */
export interface VendorAuditHealthContractRules {
  schemaVersion: 1;
  auditRoute: "GET /api/v1/vendor/audit-events";
  healthRoute: "GET /api/v1/vendor/system-health";
  auditCapability: "vendor.audit.read";
  healthCapability: "vendor.system_health.read";
  currentRevocationCheckedVendorRequired: true;
  defaultAuditPageSize: 25;
  maximumAuditPageSize: 50;
  maximumCursorLength: 4096;
  maximumHealthSourceDocuments: 1000;
  healthSourceOverflowDisposition: "unavailable";
  cursorEncoding: "base64url";
  cursorProtection: "authenticated_encryption";
  cursorFilterBound: true;
  cursorSourceAnchorsRequired: true;
  readOnly: true;
  sourceBackfillAllowed: false;
  browserTelemetryIngestionAllowed: false;
  inferredOverallHealthAllowed: false;
  partialAuditSourceAcceptanceAllowed: false;
  rawProviderPayloadAllowed: false;
  rawProviderIdentifierAllowed: false;
  internalPathAllowed: false;
  arbitraryStoredMetadataAllowed: false;
  rawSessionOrAnswerDataAllowed: false;
  unsupportedCloudObservabilityOwner: "BWM-051";
  productionProviderAndIamOwner: "BWM-052";
  deployedIndexAndBackfillOwner: "BWM-053";
}
