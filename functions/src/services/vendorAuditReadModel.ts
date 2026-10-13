/* eslint-disable max-len, require-jsdoc */
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto";
import {FieldPath, Timestamp} from "firebase-admin/firestore";
import type {
  VendorAuditCategory,
  VendorAuditCursorAnchor,
  VendorAuditCursorAnchors,
  VendorAuditCursorPayload,
  VendorAuditEvent,
  VendorAuditEventMetadata,
  VendorAuditEventsQuery,
  VendorAuditEventsResult,
  VendorAuditSource,
  VendorAuditStatus,
} from "../../../shared/contracts/vendorAuditHealth";
import {validateCalibrationOperationResult} from "./calibrationOperationResult";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 50;
const MAX_CURSOR_LENGTH = 4096;
const CURSOR_KEY_BYTES = 32;
const CURSOR_IV_BYTES = 12;
const CURSOR_TAG_BYTES = 16;
const CURSOR_AAD = Buffer.from("vendor-audit-cursor:v1", "utf8");
const QUERY_KEYS = new Set([
  "category", "instituteId", "status", "from", "to", "limit", "cursor",
]);
const CATEGORIES: readonly VendorAuditCategory[] = [
  "institute", "onboarding", "access", "support", "license", "billing",
  "webhook", "calibration",
];
const STATUSES: readonly VendorAuditStatus[] = ["completed", "pending", "failed"];
const SOURCE_NAMES = [
  "vendorCommandAudit",
  "vendorSystemAudit",
  "calibrationTerminal",
  "stripeEvent",
  "billingSnapshot",
  "licenseHistory",
] as const;
type SourceName = typeof SOURCE_NAMES[number];

const SOURCE_ORDER: Record<SourceName, number> = {
  vendorCommandAudit: 0,
  vendorSystemAudit: 1,
  calibrationTerminal: 2,
  stripeEvent: 3,
  billingSnapshot: 4,
  licenseHistory: 5,
};

type AuditTargetKind = NonNullable<VendorAuditEvent["target"]>["kind"];

interface NormalizedAuditQuery {
  category: VendorAuditCategory | null;
  instituteId: string | null;
  status: VendorAuditStatus | null;
  from: string | null;
  to: string | null;
  limit: number;
  cursor: string | null;
}

interface SourceCandidate {
  event: VendorAuditEvent;
  instituteIds: readonly string[];
  sourceName: SourceName;
  sourcePath: string;
}

interface SourcePage {
  candidates: SourceCandidate[];
  hasMore: boolean;
  priorAnchor: VendorAuditCursorAnchor | null;
  sourceName: SourceName;
}

interface SourceDescriptor {
  name: SourceName;
  timeField: string;
  timeKind: "timestamp" | "iso";
  query: () => FirebaseFirestore.Query;
  acceptsPath: (path: string) => boolean;
  parse: (snapshot: FirebaseFirestore.QueryDocumentSnapshot) => SourceCandidate;
}

export type VendorAuditReadErrorCode = "VALIDATION_ERROR" | "SOURCE_INVALID";

export class VendorAuditReadError extends Error {
  constructor(
    public readonly code: VendorAuditReadErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "VendorAuditReadError";
  }
}

const invalidQuery = (message: string): never => {
  throw new VendorAuditReadError("VALIDATION_ERROR", message);
};

const invalidSource = (message: string): never => {
  throw new VendorAuditReadError("SOURCE_INVALID", message);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const exactKeys = (
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean => {
  const expected = [...keys].sort();
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify(expected);
};

const storedString = (
  value: unknown,
  field: string,
  maximumLength = 1000,
): string => {
  if (typeof value !== "string" || !value.trim() || value.length > maximumLength) {
    return invalidSource(`Persisted ${field} is invalid.`);
  }
  return value.trim();
};

const optionalStoredString = (
  value: unknown,
  field: string,
  maximumLength = 1000,
): string | null => value === undefined || value === null ?
  null : storedString(value, field, maximumLength);

const identifier = (value: unknown, field: string): string => {
  const normalized = storedString(value, field, 128);
  if (/[/\s]/u.test(normalized)) {
    return invalidSource(`Persisted ${field} is invalid.`);
  }
  return normalized;
};

const optionalIdentifier = (value: unknown, field: string): string | null =>
  value === undefined || value === null ? null : identifier(value, field);

const storedTimestamp = (value: unknown, field: string): Timestamp => {
  if (!(value instanceof Timestamp) || !Number.isFinite(value.toMillis())) {
    return invalidSource(`Persisted ${field} is invalid.`);
  }
  return value;
};

const canonicalIso = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !value || !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value) {
    return invalidSource(`Persisted ${field} is invalid.`);
  }
  return value;
};

const safeInteger = (
  value: unknown,
  field: string,
  minimum = 0,
): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) {
    return invalidSource(`Persisted ${field} is invalid.`);
  }
  return value;
};

const emptyMetadata = (): VendorAuditEventMetadata => ({
  operationId: null,
  requestId: null,
  invoiceId: null,
  versionId: null,
  cycleId: null,
  eventType: null,
  processingState: null,
  reconciliationState: null,
  previousLicenseLayer: null,
  nextLicenseLayer: null,
  amountMinor: null,
  currency: null,
  affectedInstituteCount: null,
  revision: null,
});

const normalizeQuery = (input: unknown): NormalizedAuditQuery => {
  if (!isRecord(input) || Object.keys(input).some((key) => !QUERY_KEYS.has(key))) {
    return invalidQuery("Audit query contains unsupported fields.");
  }
  const category = input.category === undefined ? null : input.category;
  if (category !== null && !CATEGORIES.includes(category as VendorAuditCategory)) {
    return invalidQuery("Field \"category\" is invalid.");
  }
  const status = input.status === undefined ? null : input.status;
  if (status !== null && !STATUSES.includes(status as VendorAuditStatus)) {
    return invalidQuery("Field \"status\" is invalid.");
  }
  let instituteId: string | null = null;
  if (input.instituteId !== undefined) {
    if (typeof input.instituteId !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(input.instituteId)) {
      return invalidQuery("Field \"instituteId\" is invalid.");
    }
    instituteId = input.instituteId;
  }
  const normalizeQueryTime = (value: unknown, field: string): string | null => {
    if (value === undefined) return null;
    if (typeof value !== "string" || !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString() !== value) {
      return invalidQuery(`Field "${field}" must be a canonical ISO timestamp.`);
    }
    return value;
  };
  const from = normalizeQueryTime(input.from, "from");
  const to = normalizeQueryTime(input.to, "to");
  if (from && to && from > to) {
    return invalidQuery("Field \"from\" must not be after \"to\".");
  }
  const limit = input.limit === undefined ? DEFAULT_PAGE_SIZE : input.limit;
  if (typeof limit !== "number" || !Number.isSafeInteger(limit) ||
    limit < 1 || limit > MAX_PAGE_SIZE) {
    return invalidQuery(`Field "limit" must be an integer from 1 to ${MAX_PAGE_SIZE}.`);
  }
  let cursor: string | null = null;
  if (input.cursor !== undefined) {
    if (typeof input.cursor !== "string" || !input.cursor ||
      input.cursor.length > MAX_CURSOR_LENGTH) {
      return invalidQuery("Field \"cursor\" is invalid.");
    }
    cursor = input.cursor;
  }
  return {
    category: category as VendorAuditCategory | null,
    instituteId,
    status: status as VendorAuditStatus | null,
    from,
    to,
    limit,
    cursor,
  };
};

const queryFingerprint = (query: NormalizedAuditQuery): string =>
  createHash("sha256").update(JSON.stringify({
    category: query.category,
    instituteId: query.instituteId,
    status: query.status,
    from: query.from,
    to: query.to,
    limit: query.limit,
  })).digest("hex");

const blankAnchors = (): VendorAuditCursorAnchors => ({
  vendorCommandAudit: null,
  vendorSystemAudit: null,
  calibrationTerminal: null,
  stripeEvent: null,
  billingSnapshot: null,
  licenseHistory: null,
});

const validateAnchor = (value: unknown): VendorAuditCursorAnchor | null => {
  if (value === null) return null;
  if (!isRecord(value) || !exactKeys(value, ["occurredAt", "continuation"])) {
    return invalidQuery("Audit cursor contains an invalid source anchor.");
  }
  if (typeof value.occurredAt !== "string" ||
    !Number.isFinite(Date.parse(value.occurredAt)) ||
    new Date(value.occurredAt).toISOString() !== value.occurredAt ||
    typeof value.continuation !== "string" || !value.continuation ||
    value.continuation.length > 1600) {
    return invalidQuery("Audit cursor contains an invalid source anchor.");
  }
  return {occurredAt: value.occurredAt, continuation: value.continuation};
};

const decodePayload = (plaintext: Buffer, fingerprint: string): VendorAuditCursorPayload => {
  let value: unknown;
  try {
    value = JSON.parse(plaintext.toString("utf8"));
  } catch {
    return invalidQuery("Field \"cursor\" is malformed.");
  }
  if (!isRecord(value) || !exactKeys(value, ["version", "filterFingerprint", "anchors"]) ||
    value.version !== 1 || value.filterFingerprint !== fingerprint ||
    !isRecord(value.anchors) || !exactKeys(value.anchors, SOURCE_NAMES)) {
    return invalidQuery("Field \"cursor\" is invalid for these filters.");
  }
  const anchors = blankAnchors();
  for (const name of SOURCE_NAMES) anchors[name] = validateAnchor(value.anchors[name]);
  return {version: 1, filterFingerprint: fingerprint, anchors};
};

const decodeCursor = (
  cursor: string,
  key: Buffer,
  fingerprint: string,
): VendorAuditCursorPayload => {
  if (!/^[A-Za-z0-9_-]+$/u.test(cursor) || cursor.length > MAX_CURSOR_LENGTH) {
    return invalidQuery("Field \"cursor\" is malformed.");
  }
  try {
    const bytes = Buffer.from(cursor, "base64url");
    if (bytes.toString("base64url") !== cursor ||
      bytes.length <= 1 + CURSOR_IV_BYTES + CURSOR_TAG_BYTES || bytes[0] !== 1) {
      return invalidQuery("Field \"cursor\" is malformed.");
    }
    const iv = bytes.subarray(1, 1 + CURSOR_IV_BYTES);
    const tag = bytes.subarray(1 + CURSOR_IV_BYTES,
      1 + CURSOR_IV_BYTES + CURSOR_TAG_BYTES);
    const ciphertext = bytes.subarray(1 + CURSOR_IV_BYTES + CURSOR_TAG_BYTES);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(CURSOR_AAD);
    decipher.setAuthTag(tag);
    return decodePayload(Buffer.concat([
      decipher.update(ciphertext), decipher.final(),
    ]), fingerprint);
  } catch (error) {
    if (error instanceof VendorAuditReadError) throw error;
    return invalidQuery("Field \"cursor\" failed authentication.");
  }
};

const encodeCursor = (payload: VendorAuditCursorPayload, key: Buffer): string => {
  const iv = randomBytes(CURSOR_IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(CURSOR_AAD);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"), cipher.final(),
  ]);
  const encoded = Buffer.concat([
    Buffer.from([1]), iv, cipher.getAuthTag(), ciphertext,
  ]).toString("base64url");
  if (encoded.length > MAX_CURSOR_LENGTH) {
    throw new VendorAuditReadError("SOURCE_INVALID", "Audit cursor exceeded its bound.");
  }
  return encoded;
};

const commandFamily = (documentId: string): {
  category: VendorAuditCategory;
  status: VendorAuditStatus;
  targetKind: AuditTargetKind;
} => {
  const families: readonly [string, VendorAuditCategory, VendorAuditStatus, AuditTargetKind][] = [
    ["vendor_institute_audit_", "institute", "completed", "institute"],
    ["vendor_onboarding_audit_", "onboarding", "completed", "onboarding"],
    ["vendor_admin_audit_", "access", "completed", "administrator"],
    ["support_vendor_audit_", "support", "completed", "support_ticket"],
    ["vendor_license_decision_audit_", "license", "completed", "license"],
    ["vendor_catalog_audit_", "license", "pending", "license"],
    ["vendor_subscription_audit_", "license", "pending", "license"],
    ["vendor_invoice_audit_", "billing", "pending", "invoice"],
    ["vendor_billing_communication_audit_", "billing", "pending", "invoice"],
    ["vendor_offline_payment_audit_", "billing", "pending", "invoice"],
    ["vendor_payment_event_audit_", "webhook", "pending", "payment_event"],
  ];
  const family = families.find(([prefix]) => documentId.startsWith(prefix));
  if (!family) return invalidSource("Persisted Vendor command-audit family is unsupported.");
  return {category: family[1], status: family[2], targetKind: family[3]};
};

export class VendorAuditReadService {
  private readonly cursorKey: Buffer;
  private readonly now: () => Date;

  constructor(private readonly dependencies: {
    firestore: FirebaseFirestore.Firestore;
    cursorKey: Uint8Array;
    now?: () => Date;
  }) {
    this.cursorKey = Buffer.from(dependencies.cursorKey);
    if (this.cursorKey.length !== CURSOR_KEY_BYTES) {
      throw new Error("Vendor audit cursor key must contain exactly 32 bytes.");
    }
    this.now = dependencies.now ?? (() => new Date());
  }

  private publicId(source: SourceName, storedId: string): string {
    return `audit_${createHmac("sha256", this.cursorKey)
      .update(`${source}:${storedId}`).digest("base64url").slice(0, 24)}`;
  }

  private event(
    sourceName: SourceName,
    source: VendorAuditSource,
    snapshot: FirebaseFirestore.QueryDocumentSnapshot,
    input: Omit<VendorAuditEvent, "eventId" | "source">,
    instituteIds: readonly string[],
  ): SourceCandidate {
    return {
      event: {
        ...input,
        eventId: this.publicId(sourceName, snapshot.ref.path),
        source,
      },
      instituteIds,
      sourceName,
      sourcePath: snapshot.ref.path,
    };
  }

  private parseCommandAudit = (
    snapshot: FirebaseFirestore.QueryDocumentSnapshot,
  ): SourceCandidate => {
    const value = snapshot.data();
    if (!isRecord(value) || value.timestamp !== undefined) {
      return invalidSource("Persisted Vendor command audit is malformed.");
    }
    const auditEventId = value.auditEventId === undefined ? null :
      identifier(value.auditEventId, "commandAudit.auditEventId");
    const eventId = value.eventId === undefined ? null :
      identifier(value.eventId, "commandAudit.eventId");
    if ((auditEventId === null && eventId === null) ||
      (auditEventId !== null && auditEventId !== snapshot.id) ||
      (eventId !== null && eventId !== snapshot.id)) {
      return invalidSource("Persisted Vendor command-audit identity is inconsistent.");
    }
    const family = commandFamily(snapshot.id);
    const action = storedString(value.action, "commandAudit.action", 128);
    const actorId = identifier(value.actorUserId, "commandAudit.actorUserId");
    const actorRole = storedString(value.actorRole, "commandAudit.actorRole", 64);
    const instituteId = optionalIdentifier(value.instituteId, "commandAudit.instituteId");
    const occurredAt = storedTimestamp(value.occurredAt, "commandAudit.occurredAt")
      .toDate().toISOString();
    const summary = storedString(value.summary, "commandAudit.summary", 1000);
    let targetId = optionalIdentifier(value.targetId, "commandAudit.targetId") ??
      optionalIdentifier(value.requestId, "commandAudit.requestId") ??
      optionalIdentifier(value.onboardingId, "commandAudit.onboardingId") ??
      optionalIdentifier(value.ticketId, "commandAudit.ticketId") ?? instituteId;
    if (!targetId) {
      return invalidSource("Persisted Vendor command-audit target is unavailable.");
    }
    if (family.targetKind === "payment_event") {
      targetId = this.publicId("vendorCommandAudit", targetId);
    }
    const revisionValue = value.revision ?? value.settingsRevision;
    const revision = revisionValue === undefined ? null :
      safeInteger(revisionValue, "commandAudit.revision", 1);
    const metadata = {
      ...emptyMetadata(),
      requestId: optionalIdentifier(value.requestId, "commandAudit.requestId"),
      invoiceId: family.targetKind === "invoice" ? targetId : null,
      revision,
    };
    return this.event("vendorCommandAudit", "vendor_command_audit", snapshot, {
      occurredAt,
      category: family.category,
      status: family.status,
      action,
      summary,
      actor: {userId: actorId, role: actorRole},
      institute: instituteId ? {instituteId, displayName: null} : null,
      target: {kind: family.targetKind, targetId},
      metadata,
    }, instituteId ? [instituteId] : []);
  };

  private parseSystemAudit = (
    snapshot: FirebaseFirestore.QueryDocumentSnapshot,
  ): SourceCandidate => {
    const value = snapshot.data();
    if (!isRecord(value) || value.occurredAt !== undefined ||
      identifier(value.auditId, "systemAudit.auditId") !== snapshot.id) {
      return invalidSource("Persisted Vendor system audit is malformed.");
    }
    const action = storedString(value.actionType, "systemAudit.actionType", 128);
    const occurredAt = storedTimestamp(value.timestamp, "systemAudit.timestamp")
      .toDate().toISOString();
    const actorId = identifier(value.actorUid, "systemAudit.actorUid");
    const actorRole = storedString(value.actorRole, "systemAudit.actorRole", 64);
    if (!isRecord(value.metadata)) {
      return invalidSource("Persisted Vendor system-audit metadata is invalid.");
    }
    const metadata = emptyMetadata();
    let category: VendorAuditCategory;
    let status: VendorAuditStatus = "completed";
    let targetKind: AuditTargetKind;
    let targetId: string;
    let instituteId = optionalIdentifier(value.instituteId, "systemAudit.instituteId");
    let summary: string;
    if (action === "PAYMENT_EVENT_PROCESSED") {
      category = "webhook";
      targetKind = "payment_event";
      const providerEventId = identifier(value.metadata.eventId, "systemAudit.metadata.eventId");
      targetId = this.publicId("vendorSystemAudit", providerEventId);
      instituteId = identifier(value.metadata.instituteId, "systemAudit.metadata.instituteId");
      metadata.eventType = storedString(value.metadata.eventType,
        "systemAudit.metadata.eventType", 160);
      const webhookStatus = storedString(value.metadata.stripeWebhookStatus,
        "systemAudit.metadata.stripeWebhookStatus", 32);
      if (!["pending", "succeeded", "failed", "not_applicable"].includes(webhookStatus)) {
        return invalidSource("Persisted Vendor webhook status is invalid.");
      }
      metadata.processingState = webhookStatus;
      status = webhookStatus === "failed" ? "failed" :
        webhookStatus === "pending" ? "pending" : "completed";
      summary = "Stripe payment event processed.";
    } else if (action === "UPDATE_CALIBRATION") {
      category = "calibration";
      targetKind = "calibration";
      targetId = identifier(value.targetId, "systemAudit.targetId");
      metadata.versionId = optionalIdentifier(value.metadata.calibrationVersion,
        "systemAudit.metadata.calibrationVersion") ?? targetId;
      summary = "Vendor calibration updated.";
    } else {
      return invalidSource("Persisted Vendor system-audit action is unsupported.");
    }
    return this.event("vendorSystemAudit", "vendor_system_audit", snapshot, {
      occurredAt,
      category,
      status,
      action,
      summary,
      actor: {userId: actorId, role: actorRole},
      institute: instituteId ? {instituteId, displayName: null} : null,
      target: {kind: targetKind, targetId},
      metadata,
    }, instituteId ? [instituteId] : []);
  };

  private parseCalibration = (
    snapshot: FirebaseFirestore.QueryDocumentSnapshot,
  ): SourceCandidate => {
    const value = snapshot.data();
    if (!isRecord(value) || !exactKeys(value, ["schemaVersion", "operationId",
      "vendorUid", "requestFingerprint", "sourceFingerprint",
      "requestedInstituteIds", "receipt"]) || value.schemaVersion !== 1 ||
      value.operationId !== snapshot.id || typeof value.vendorUid !== "string" ||
      !value.vendorUid || !/^[0-9a-f]{64}$/u.test(String(value.requestFingerprint)) ||
      (value.sourceFingerprint !== null &&
        !/^[0-9a-f]{64}$/u.test(String(value.sourceFingerprint))) ||
      !Array.isArray(value.requestedInstituteIds) ||
      value.requestedInstituteIds.length < 1 || value.requestedInstituteIds.length > 20) {
      return invalidSource("Persisted calibration terminal fact is invalid.");
    }
    const instituteIds = value.requestedInstituteIds.map((item) =>
      identifier(item, "calibrationLog.requestedInstituteIds"));
    if (new Set(instituteIds).size !== instituteIds.length || !isRecord(value.receipt)) {
      return invalidSource("Persisted calibration terminal targets are invalid.");
    }
    let result;
    try {
      result = validateCalibrationOperationResult({
        operationId: snapshot.id,
        revision: 2,
        state: value.receipt.state,
        receipt: value.receipt,
        rollbackOperationId: null,
      }, snapshot.id);
    } catch {
      return invalidSource("Persisted calibration terminal receipt is invalid.");
    }
    if (!result.receipt || result.receipt.operationId !== snapshot.id) {
      return invalidSource("Persisted calibration terminal receipt is unavailable.");
    }
    const receiptInstitutes = result.receipt.targets.map((target) => target.instituteId);
    if (receiptInstitutes.length > 0 &&
      JSON.stringify(receiptInstitutes) !== JSON.stringify(instituteIds)) {
      return invalidSource("Persisted calibration terminal targets are inconsistent.");
    }
    const status: VendorAuditStatus = result.state === "not_applied" ? "failed" : "completed";
    const metadata = {
      ...emptyMetadata(),
      operationId: snapshot.id,
      versionId: result.receipt.versionId,
      affectedInstituteCount: result.receipt.targets.length,
      revision: result.receipt.revision,
    };
    const singleInstitute = instituteIds.length === 1 ? instituteIds[0] : null;
    return this.event("calibrationTerminal", "calibration_terminal", snapshot, {
      occurredAt: result.receipt.completedAt,
      category: "calibration",
      status,
      action: `calibration_${result.receipt.kind}`,
      summary: result.state === "not_applied" ?
        "Calibration operation was not applied." :
        `Calibration ${result.receipt.kind} completed.`,
      actor: {userId: identifier(value.vendorUid, "calibrationLog.vendorUid"), role: "vendor"},
      institute: singleInstitute ? {instituteId: singleInstitute, displayName: null} : null,
      target: {kind: "calibration", targetId: result.receipt.versionId},
      metadata,
    }, instituteIds);
  };

  private parseStripeEvent = (
    snapshot: FirebaseFirestore.QueryDocumentSnapshot,
  ): SourceCandidate => {
    const value = snapshot.data();
    if (!isRecord(value)) return invalidSource("Persisted Stripe event is invalid.");
    const storedEventId = identifier(value.eventId, "stripeEvent.eventId");
    if (storedEventId !== snapshot.id) {
      return invalidSource("Persisted Stripe-event identity is inconsistent.");
    }
    const eventType = storedString(value.eventType, "stripeEvent.eventType", 160);
    const instituteId = optionalIdentifier(value.instituteId, "stripeEvent.instituteId");
    const occurredAt = storedTimestamp(value.occurredAt ?? value.createdAt,
      "stripeEvent.occurredAt").toDate().toISOString();
    const processingState = storedString(value.processingState ?? value.status,
      "stripeEvent.processingState", 32).toLowerCase();
    if (!["received", "processing", "applied", "ignored", "failed_retryable",
      "failed_terminal", "processed"].includes(processingState)) {
      return invalidSource("Persisted Stripe-event processing state is invalid.");
    }
    const reconciliationState = value.reconciliationState === undefined ||
      value.reconciliationState === null ? "manual_review" :
      storedString(value.reconciliationState, "stripeEvent.reconciliationState", 32)
        .toLowerCase();
    if (!["pending", "reconciled", "mismatch", "manual_review"].includes(reconciliationState)) {
      return invalidSource("Persisted Stripe-event reconciliation state is invalid.");
    }
    const normalizedProcessing = processingState === "processed" ? "applied" : processingState;
    const status: VendorAuditStatus = normalizedProcessing.startsWith("failed") ? "failed" :
      (["received", "processing"].includes(normalizedProcessing) ||
        reconciliationState !== "reconciled") ? "pending" : "completed";
    const revision = value.revision === undefined ? 1 :
      safeInteger(value.revision, "stripeEvent.revision", 1);
    storedTimestamp(value.updatedAt ?? value.createdAt, "stripeEvent.updatedAt");
    const publicEventId = this.publicId("stripeEvent", storedEventId);
    const metadata = {
      ...emptyMetadata(),
      eventType,
      processingState: normalizedProcessing,
      reconciliationState,
      revision,
    };
    return this.event("stripeEvent", "stripe_event", snapshot, {
      occurredAt,
      category: "webhook",
      status,
      action: "stripe_event_received",
      summary: `Stripe event ${eventType} recorded.`,
      actor: null,
      institute: instituteId ? {instituteId, displayName: null} : null,
      target: {kind: "payment_event", targetId: publicEventId},
      metadata,
    }, instituteId ? [instituteId] : []);
  };

  private parseBillingSnapshot = (
    snapshot: FirebaseFirestore.QueryDocumentSnapshot,
  ): SourceCandidate => {
    const value = snapshot.data();
    if (!isRecord(value) || value.schemaVersion !== 1 || value.immutable !== true ||
      identifier(value.invoiceId, "billingSnapshot.invoiceId") !== snapshot.id) {
      return invalidSource("Persisted billing snapshot is invalid.");
    }
    const instituteId = identifier(value.instituteId, "billingSnapshot.instituteId");
    const cycleId = storedString(value.cycleId, "billingSnapshot.cycleId", 7);
    if (!/^\d{4}-\d{2}$/u.test(cycleId)) {
      return invalidSource("Persisted billing snapshot cycle is invalid.");
    }
    const occurredAt = storedTimestamp(value.generatedAt, "billingSnapshot.generatedAt")
      .toDate().toISOString();
    const webhookStatus = storedString(value.stripeWebhookStatus,
      "billingSnapshot.stripeWebhookStatus", 32);
    if (!["pending", "succeeded", "failed", "not_applicable"].includes(webhookStatus)) {
      return invalidSource("Persisted billing snapshot webhook status is invalid.");
    }
    let amountMinor: number | null = null;
    const currency: string | null = value.currency === null ? null :
      storedString(value.currency, "billingSnapshot.currency", 3).toUpperCase();
    if (currency !== null && !/^[A-Z]{3}$/u.test(currency)) {
      return invalidSource("Persisted billing snapshot currency is invalid.");
    }
    if (value.monthlyRevenueMinor !== null) {
      amountMinor = safeInteger(value.monthlyRevenueMinor,
        "billingSnapshot.monthlyRevenueMinor");
      if (currency === null) {
        return invalidSource("Persisted billing snapshot amount/currency is inconsistent.");
      }
    }
    const status: VendorAuditStatus = webhookStatus === "failed" ? "failed" :
      webhookStatus === "pending" ? "pending" : "completed";
    const metadata = {
      ...emptyMetadata(),
      invoiceId: snapshot.id,
      cycleId,
      eventType: "billing_snapshot",
      processingState: webhookStatus,
      amountMinor,
      currency,
    };
    return this.event("billingSnapshot", "billing_snapshot", snapshot, {
      occurredAt,
      category: "billing",
      status,
      action: "billing_snapshot_generated",
      summary: `Billing snapshot generated for ${cycleId}.`,
      actor: null,
      institute: {instituteId, displayName: optionalStoredString(value.instituteName,
        "billingSnapshot.instituteName", 160)},
      target: {kind: "invoice", targetId: snapshot.id},
      metadata,
    }, [instituteId]);
  };

  private parseLicenseHistory = (
    snapshot: FirebaseFirestore.QueryDocumentSnapshot,
  ): SourceCandidate => {
    const value = snapshot.data();
    const instituteReference = snapshot.ref.parent.parent;
    if (!isRecord(value) || !instituteReference ||
      identifier(value.entryId, "licenseHistory.entryId") !== snapshot.id) {
      return invalidSource("Persisted license history is invalid.");
    }
    const instituteId = identifier(value.instituteId, "licenseHistory.instituteId");
    if (instituteReference.id !== instituteId ||
      instituteReference.parent.id !== "institutes") {
      return invalidSource("Persisted license-history ownership is inconsistent.");
    }
    const layers = [
      storedString(value.previousLayer, "licenseHistory.previousLayer", 2),
      storedString(value.newLayer, "licenseHistory.newLayer", 2),
    ];
    if (layers.some((layer) => !["L0", "L1", "L2", "L3"].includes(layer))) {
      return invalidSource("Persisted license-history layer is invalid.");
    }
    storedString(value.billingPlan, "licenseHistory.billingPlan", 160);
    storedString(value.reason, "licenseHistory.reason", 1000);
    canonicalIso(value.effectiveDate, "licenseHistory.effectiveDate");
    const actorId = identifier(value.changedBy, "licenseHistory.changedBy");
    const occurredAt = storedTimestamp(value.timestamp, "licenseHistory.timestamp")
      .toDate().toISOString();
    const metadata = {
      ...emptyMetadata(),
      previousLicenseLayer: layers[0],
      nextLicenseLayer: layers[1],
    };
    return this.event("licenseHistory", "license_history", snapshot, {
      occurredAt,
      category: "license",
      status: "completed",
      action: "license_layer_changed",
      summary: `License changed from ${layers[0]} to ${layers[1]}.`,
      actor: {userId: actorId, role: null},
      institute: {instituteId, displayName: null},
      target: {kind: "license", targetId: instituteId},
      metadata,
    }, [instituteId]);
  };

  private descriptors(): SourceDescriptor[] {
    const firestore = this.dependencies.firestore;
    return [
      {
        name: "vendorCommandAudit", timeField: "occurredAt", timeKind: "timestamp",
        query: () => firestore.collection("vendorAuditLogs"),
        acceptsPath: (path) => /^vendorAuditLogs\/[^/]+$/u.test(path),
        parse: this.parseCommandAudit,
      },
      {
        name: "vendorSystemAudit", timeField: "timestamp", timeKind: "timestamp",
        query: () => firestore.collection("vendorAuditLogs"),
        acceptsPath: (path) => /^vendorAuditLogs\/[^/]+$/u.test(path),
        parse: this.parseSystemAudit,
      },
      {
        name: "calibrationTerminal", timeField: "receipt.completedAt", timeKind: "iso",
        query: () => firestore.collection("vendorCalibrationLogs"),
        acceptsPath: (path) => /^vendorCalibrationLogs\/[^/]+$/u.test(path),
        parse: this.parseCalibration,
      },
      {
        name: "stripeEvent", timeField: "occurredAt", timeKind: "timestamp",
        query: () => firestore.collection("vendor/stripeEvents/events"),
        acceptsPath: (path) => /^vendor\/stripeEvents\/events\/[^/]+$/u.test(path),
        parse: this.parseStripeEvent,
      },
      {
        name: "billingSnapshot", timeField: "generatedAt", timeKind: "timestamp",
        query: () => firestore.collection("billingSnapshots"),
        acceptsPath: (path) => /^billingSnapshots\/[^/]+$/u.test(path),
        parse: this.parseBillingSnapshot,
      },
      {
        name: "licenseHistory", timeField: "timestamp", timeKind: "timestamp",
        query: () => firestore.collectionGroup("licenseHistory"),
        acceptsPath: (path) => /^institutes\/[^/]+\/licenseHistory\/[^/]+$/u.test(path),
        parse: this.parseLicenseHistory,
      },
    ];
  }

  private sourceTime(
    descriptor: SourceDescriptor,
    value: string,
  ): Timestamp | string {
    return descriptor.timeKind === "timestamp" ?
      Timestamp.fromDate(new Date(value)) : value;
  }

  private async readSource(
    descriptor: SourceDescriptor,
    query: NormalizedAuditQuery,
    anchor: VendorAuditCursorAnchor | null,
  ): Promise<SourcePage> {
    if (anchor && !descriptor.acceptsPath(anchor.continuation)) {
      return invalidQuery("Audit cursor source anchor is invalid.");
    }
    let sourceQuery = descriptor.query();
    if (query.from) {
      sourceQuery = sourceQuery.where(descriptor.timeField, ">=",
        this.sourceTime(descriptor, query.from));
    }
    if (query.to) {
      sourceQuery = sourceQuery.where(descriptor.timeField, "<=",
        this.sourceTime(descriptor, query.to));
    }
    sourceQuery = sourceQuery.orderBy(descriptor.timeField, "desc")
      .orderBy(FieldPath.documentId(), "desc");
    if (anchor) {
      sourceQuery = sourceQuery.startAfter(
        this.sourceTime(descriptor, anchor.occurredAt),
        this.dependencies.firestore.doc(anchor.continuation),
      );
    }
    const snapshot = await sourceQuery.limit(query.limit + 1).get();
    const selected = snapshot.docs.slice(0, query.limit);
    const candidates = selected.map((document) => descriptor.parse(document));
    return {
      candidates,
      hasMore: snapshot.size > query.limit,
      priorAnchor: anchor,
      sourceName: descriptor.name,
    };
  }

  private matches(candidate: SourceCandidate, query: NormalizedAuditQuery): boolean {
    return (query.category === null || candidate.event.category === query.category) &&
      (query.status === null || candidate.event.status === query.status) &&
      (query.instituteId === null || candidate.instituteIds.includes(query.instituteId));
  }

  public async listEvents(input: VendorAuditEventsQuery): Promise<VendorAuditEventsResult> {
    const query = normalizeQuery(input);
    const fingerprint = queryFingerprint(query);
    const cursor = query.cursor ? decodeCursor(query.cursor, this.cursorKey, fingerprint) : {
      version: 1 as const,
      filterFingerprint: fingerprint,
      anchors: blankAnchors(),
    };
    const pages = await Promise.all(this.descriptors().map((descriptor) =>
      this.readSource(descriptor, query, cursor.anchors[descriptor.name])));
    const matching = pages.flatMap((page) => page.candidates)
      .filter((candidate) => this.matches(candidate, query))
      .sort((left, right) => {
        const time = Date.parse(right.event.occurredAt) - Date.parse(left.event.occurredAt);
        if (time !== 0) return time;
        const source = SOURCE_ORDER[left.sourceName] - SOURCE_ORDER[right.sourceName];
        if (source !== 0) return source;
        // A continuation consumes a prefix of Firestore's document-ID-descending
        // source order. HMAC public IDs are opaque and cannot reorder that prefix.
        return left.sourcePath < right.sourcePath ? 1 :
          left.sourcePath > right.sourcePath ? -1 : 0;
      });
    const returned = matching.slice(0, query.limit);
    const returnedKeys = new Set(returned.map((candidate) =>
      `${candidate.sourceName}:${candidate.sourcePath}`));
    const nextAnchors = {...cursor.anchors};
    let hasMore = false;
    for (const page of pages) {
      const firstUnreturned = page.candidates.findIndex((candidate) =>
        this.matches(candidate, query) &&
        !returnedKeys.has(`${candidate.sourceName}:${candidate.sourcePath}`));
      const consumed = firstUnreturned === -1 ? page.candidates.length : firstUnreturned;
      if (consumed > 0) {
        const last = page.candidates[consumed - 1];
        nextAnchors[page.sourceName] = {
          occurredAt: last.event.occurredAt,
          continuation: last.sourcePath,
        };
      } else {
        nextAnchors[page.sourceName] = page.priorAnchor;
      }
      if (page.hasMore || firstUnreturned !== -1) hasMore = true;
    }
    const nextCursor = hasMore ? encodeCursor({
      version: 1,
      filterFingerprint: fingerprint,
      anchors: nextAnchors,
    }, this.cursorKey) : null;
    return {
      generatedAt: this.now().toISOString(),
      items: returned.map((candidate) => candidate.event),
      hasMore,
      nextCursor,
    };
  }
}
