/* eslint-disable max-len, require-jsdoc */
import {Timestamp} from "firebase-admin/firestore";
import type {
  VendorBillingCommunicationReceipt,
  VendorInvoiceCommandIntent,
  VendorInvoiceCommandReceipt,
  VendorInvoiceDetail,
  VendorInvoiceStatus,
  VendorInvoiceSummary,
  VendorOfflinePaymentCommandIntent,
  VendorOfflinePaymentCommandReceipt,
  VendorOfflinePaymentStatus,
  VendorOfflinePaymentSummary,
  VendorPaymentAttemptSummary,
} from "../../../shared/contracts/vendorCommercial";
import type {
  VendorBillingCommunicationRequest,
  VendorInvoiceCommandRequest,
  VendorInvoiceListRequest,
  VendorInvoiceListResult,
  VendorInvoiceRequest,
  VendorOfflinePaymentCommandRequest,
} from "../types/vendorCommercial";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  assertReplayCommand,
  authorityError,
  commandAuthority,
  conflictError,
  dualAuditDocument,
  identifier,
  isRecord,
  isoDate,
  MAX_COMMERCIAL_CURSOR,
  normalizeMoney,
  optionalStoredString,
  optionalTimestampIso,
  positiveInteger,
  providerOperation,
  providerResultOperation,
  requiredString,
  sha256,
  stableSerialize,
  storedMoney,
  storedPositiveInteger,
  storedString,
  timestamp,
  UnavailableVendorCommercialProvider,
  VendorCommercialProvider,
  VendorCommercialProviderResult,
  validationError,
} from "./vendorCommercialCommon";

const INVOICES = "billingRecords";
const COMMANDS = "commercialCommands";
const ROOT_AUDITS = "vendorAuditLogs";
const INSTITUTE_AUDITS = "auditLogs";
const ATTEMPTS = "paymentAttempts";
const OFFLINE_PAYMENTS = "offlinePayments";
const COMMUNICATIONS = "communications";
const EMAIL_QUEUE = "emailQueue";
const MAX_DETAIL_ITEMS = 50;
const INVOICE_STATUSES: readonly VendorInvoiceStatus[] = [
  "draft",
  "open",
  "past_due",
  "paid",
  "void",
  "uncollectible",
  "provider_unavailable",
];
const OFFLINE_STATUSES: readonly VendorOfflinePaymentStatus[] = [
  "pending_verification",
  "verified",
  "rejected",
  "voided",
  "provider_pending",
  "provider_failed",
];

interface InvoiceDependencies {
  firestore: FirebaseFirestore.Firestore;
  now: () => Date;
  provider: VendorCommercialProvider;
}

interface InvoiceCursor {
  fingerprint: string;
  instituteId: string;
  invoiceId: string;
  updatedAtMillis: number;
  version: 1;
}

const context = (request: {actorId: string; actorRole: "vendor"}) => {
  if (request.actorRole !== "vendor") {
    throw new Error("Vendor invoice authority is required.");
  }
  return identifier(request.actorId, "actorId");
};

const instituteContext = (request: VendorInvoiceRequest) => ({
  actorId: context(request),
  instituteId: identifier(request.instituteId, "instituteId"),
  invoiceId: identifier(request.invoiceId, "invoiceId"),
});

const invoiceStatus = (value: unknown): VendorInvoiceStatus => {
  const normalized = storedString(value, "invoice.status").toLowerCase();
  const legacy = normalized === "failed" ? "past_due" : normalized;
  if (!INVOICE_STATUSES.includes(legacy as VendorInvoiceStatus)) {
    return authorityError("Persisted invoice status is invalid.");
  }
  return legacy as VendorInvoiceStatus;
};

const legacyBillingStatus = (
  status: VendorInvoiceStatus,
): Record<string, "paid" | "failed"> => {
  if (status === "paid") return {status: "paid"};
  if (["past_due", "uncollectible", "provider_unavailable"].includes(status)) {
    return {status: "failed"};
  }
  return {};
};

const invoiceUpdatedAt = (value: Record<string, unknown>): Timestamp =>
  timestamp(value.updatedAt ?? value.createdAt, "invoice.updatedAt");

const parseInvoiceSummary = (
  snapshot: FirebaseFirestore.DocumentSnapshot,
): VendorInvoiceSummary => {
  const value = snapshot.data();
  const instituteReference = snapshot.ref.parent.parent;
  if (!snapshot.exists || !isRecord(value) || !instituteReference ||
    instituteReference.parent.id !== "institutes") {
    return authorityError("Invoice authority is unavailable.");
  }
  const instituteId = optionalStoredString(value.instituteId, "invoice.instituteId") ??
    instituteReference.id;
  if (instituteId !== instituteReference.id) {
    return authorityError("Invoice institute authority is inconsistent.");
  }
  const status = invoiceStatus(value.commercialStatus ?? value.status);
  const legacyAmount = value.amountPaid;
  const amountPaid = value.amountPaidMinor !== undefined ?
    storedMoney(value, "amountPaid", legacyAmount) :
    status === "paid" ? storedMoney(value, "amountPaid", legacyAmount) :
      {...storedMoney(value, "amountPaid", 0), amountMinor: 0};
  const amountDue = value.amountDueMinor !== undefined ?
    storedMoney(value, "amountDue", value.amountDue) :
    storedMoney(value, "amountDue", legacyAmount);
  const provider = value.provider === "manual" ? "manual" : "stripe";
  return {
    amountDue,
    amountPaid,
    dueAt: optionalTimestampIso(value.dueAt, "invoice.dueAt"),
    instituteId,
    invoiceId: snapshot.id,
    issuedAt: optionalTimestampIso(
      value.issuedAt ?? value.createdAt,
      "invoice.issuedAt",
    ),
    provider,
    revision: storedPositiveInteger(value.revision, "invoice.revision", 1),
    status,
    updatedAt: invoiceUpdatedAt(value).toDate().toISOString(),
  };
};

const parseAttempt = (
  snapshot: FirebaseFirestore.DocumentSnapshot,
): VendorPaymentAttemptSummary => {
  const value = snapshot.data();
  if (!snapshot.exists || !isRecord(value)) {
    return authorityError("Payment-attempt authority is unavailable.");
  }
  const state = storedString(value.state, "paymentAttempt.state").toLowerCase();
  if (state !== "pending" && state !== "succeeded" && state !== "failed") {
    return authorityError("Persisted payment-attempt state is invalid.");
  }
  return {
    amount: storedMoney(value, "amount", value.amount),
    attemptId: snapshot.id,
    occurredAt: timestamp(value.occurredAt, "paymentAttempt.occurredAt")
      .toDate().toISOString(),
    providerEventId: optionalStoredString(
      value.providerEventId,
      "paymentAttempt.providerEventId",
    ),
    state,
  };
};

const parseOfflinePayment = (
  snapshot: FirebaseFirestore.DocumentSnapshot,
): VendorOfflinePaymentSummary => {
  const value = snapshot.data();
  if (!snapshot.exists || !isRecord(value)) {
    return authorityError("Offline-payment authority is unavailable.");
  }
  const status = storedString(value.status, "offlinePayment.status").toLowerCase();
  if (!OFFLINE_STATUSES.includes(status as VendorOfflinePaymentStatus)) {
    return authorityError("Persisted offline-payment status is invalid.");
  }
  const method = storedString(value.method, "offlinePayment.method").toLowerCase();
  if (!["bank_transfer", "upi", "cheque", "other"].includes(method)) {
    return authorityError("Persisted offline-payment method is invalid.");
  }
  return {
    amount: storedMoney(value, "amount", value.amount),
    method: method as VendorOfflinePaymentSummary["method"],
    occurredAt: timestamp(value.occurredAt, "offlinePayment.occurredAt")
      .toDate().toISOString(),
    offlinePaymentId: snapshot.id,
    recordedAt: timestamp(value.recordedAt, "offlinePayment.recordedAt")
      .toDate().toISOString(),
    revision: storedPositiveInteger(value.revision, "offlinePayment.revision"),
    status: status as VendorOfflinePaymentStatus,
  };
};

const filterFingerprint = (request: VendorInvoiceListRequest) => sha256(
  stableSerialize({
    instituteId: request.instituteId ?? null,
    status: request.status ?? null,
  }),
);

const encodeCursor = (value: InvoiceCursor): string =>
  Buffer.from(JSON.stringify(value), "utf8").toString("base64url");

const decodeCursor = (value: string, fingerprint: string): InvoiceCursor => {
  if (value.length > MAX_COMMERCIAL_CURSOR) {
    return validationError("Field \"cursor\" is too long.");
  }
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!isRecord(parsed) || parsed.version !== 1 ||
      parsed.fingerprint !== fingerprint ||
      typeof parsed.updatedAtMillis !== "number" ||
      !Number.isSafeInteger(parsed.updatedAtMillis)) {
      return validationError("Field \"cursor\" is invalid for these filters.");
    }
    return {
      fingerprint,
      instituteId: identifier(parsed.instituteId, "cursor.instituteId"),
      invoiceId: identifier(parsed.invoiceId, "cursor.invoiceId"),
      updatedAtMillis: parsed.updatedAtMillis,
      version: 1,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "VendorCommercialValidationError") throw error;
    return validationError("Field \"cursor\" is malformed.");
  }
};

const normalizedInvoiceCommand = (
  command: VendorInvoiceCommandIntent,
): VendorInvoiceCommandIntent => {
  if (!["finalize", "void", "retry_collection", "sync_provider"]
    .includes(command.action)) {
    return validationError("Field \"action\" is invalid.");
  }
  return {
    action: command.action,
    expectedRevision: positiveInteger(command.expectedRevision, "expectedRevision"),
    idempotencyKey: requiredString(command.idempotencyKey, "idempotencyKey", 64),
    reason: requiredString(command.reason, "reason", 1000),
  };
};

const projectionDate = (value: unknown, field: string): Timestamp | null => {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    return authorityError(`Provider field "${field}" is invalid.`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return authorityError(`Provider field "${field}" is invalid.`);
  }
  return Timestamp.fromDate(date);
};

const invoiceProjection = (
  result: VendorCommercialProviderResult,
): Record<string, unknown> => {
  if (!isRecord(result.projection)) {
    return authorityError("Successful invoice provider result has no projection.");
  }
  const status = requiredString(result.projection.status, "provider.status", 32)
    .toLowerCase();
  if (!INVOICE_STATUSES.includes(status as VendorInvoiceStatus) ||
    status === "provider_unavailable") {
    return authorityError("Invoice provider returned an invalid status.");
  }
  const amountDue = normalizeMoney(result.projection.amountDue, "provider.amountDue");
  const amountPaid = normalizeMoney(result.projection.amountPaid, "provider.amountPaid");
  if (amountDue.currency !== amountPaid.currency) {
    return authorityError("Invoice provider returned inconsistent currency.");
  }
  const externalActions = isRecord(result.projection.externalActions) ?
    result.projection.externalActions : {};
  const safeUrl = (value: unknown, field: string): string | null => {
    if (value === null || value === undefined) return null;
    const normalized = requiredString(value, `provider.${field}`, 2048);
    try {
      const url = new URL(normalized);
      if (url.protocol !== "https:") throw new Error("invalid");
      return url.toString();
    } catch {
      return authorityError(`Provider field "${field}" is not HTTPS.`);
    }
  };
  return {
    amountDueMinor: amountDue.amountMinor,
    amountPaidMinor: amountPaid.amountMinor,
    currency: amountDue.currency,
    dueAt: projectionDate(result.projection.dueAt, "dueAt"),
    externalActions: {
      downloadUrl: safeUrl(externalActions.downloadUrl, "downloadUrl"),
      expiresAt: projectionDate(externalActions.expiresAt, "expiresAt"),
      hostedPaymentUrl: safeUrl(
        externalActions.hostedPaymentUrl,
        "hostedPaymentUrl",
      ),
    },
    issuedAt: projectionDate(result.projection.issuedAt, "issuedAt"),
    provider: "stripe",
    commercialStatus: status,
  };
};

export class VendorInvoicesService {
  constructor(private readonly dependencies: InvoiceDependencies = {
    firestore: getFirestore(),
    now: () => new Date(),
    provider: new UnavailableVendorCommercialProvider(),
  }) {}

  public listInvoices = async (
    request: VendorInvoiceListRequest,
  ): Promise<VendorInvoiceListResult> => {
    context(request);
    const fingerprint = filterFingerprint(request);
    let filtered: FirebaseFirestore.Query = this.dependencies.firestore
      .collectionGroup(INVOICES);
    if (request.instituteId) {
      filtered = filtered.where("instituteId", "==", identifier(
        request.instituteId,
        "instituteId",
      ));
    }
    if (request.status) {
      if (!INVOICE_STATUSES.includes(request.status)) {
        return validationError("Field \"status\" is invalid.");
      }
      filtered = filtered.where("commercialStatus", "==", request.status);
    }
    let pageQuery = filtered.orderBy("updatedAt", "desc")
      .orderBy("instituteId", "asc").orderBy("invoiceId", "asc");
    if (request.cursor) {
      const cursor = decodeCursor(request.cursor, fingerprint);
      pageQuery = pageQuery.startAfter(
        Timestamp.fromMillis(cursor.updatedAtMillis),
        cursor.instituteId,
        cursor.invoiceId,
      );
    }
    const [pageSnapshot, countSnapshot] = await Promise.all([
      pageQuery.limit(request.limit + 1).get(),
      filtered.count().get(),
    ]);
    const page = pageSnapshot.docs.slice(0, request.limit);
    const items = page.map(parseInvoiceSummary);
    const last = items[items.length - 1];
    return {
      items,
      nextCursor: pageSnapshot.size > request.limit && last ? encodeCursor({
        fingerprint,
        instituteId: last.instituteId,
        invoiceId: last.invoiceId,
        updatedAtMillis: new Date(last.updatedAt).getTime(),
        version: 1,
      }) : null,
      totalMatching: countSnapshot.data().count,
    };
  };

  public getInvoice = async (
    request: VendorInvoiceRequest,
  ): Promise<VendorInvoiceDetail> => {
    const resolved = instituteContext(request);
    const reference = this.dependencies.firestore.collection("institutes")
      .doc(resolved.instituteId).collection(INVOICES).doc(resolved.invoiceId);
    const [invoice, attempts, offline] = await Promise.all([
      reference.get(),
      reference.collection(ATTEMPTS).orderBy("occurredAt", "desc")
        .limit(MAX_DETAIL_ITEMS + 1).get(),
      reference.collection(OFFLINE_PAYMENTS).orderBy("recordedAt", "desc")
        .limit(MAX_DETAIL_ITEMS + 1).get(),
    ]);
    if (attempts.size > MAX_DETAIL_ITEMS || offline.size > MAX_DETAIL_ITEMS) {
      return authorityError("Invoice detail exceeds the supported bound.");
    }
    const summary = parseInvoiceSummary(invoice);
    const value = invoice.data() as Record<string, unknown>;
    const actions = isRecord(value.externalActions) ? value.externalActions : {};
    const actionUrl = (field: string): string | null => {
      const candidate = optionalStoredString(actions[field], `invoice.${field}`);
      if (!candidate) return null;
      try {
        const url = new URL(candidate);
        return url.protocol === "https:" ? url.toString() :
          authorityError(`Persisted invoice ${field} is not HTTPS.`);
      } catch {
        return authorityError(`Persisted invoice ${field} is invalid.`);
      }
    };
    return {
      ...summary,
      externalActions: {
        downloadUrl: actionUrl("downloadUrl"),
        expiresAt: optionalTimestampIso(actions.expiresAt, "invoice.expiresAt"),
        hostedPaymentUrl: actionUrl("hostedPaymentUrl"),
      },
      offlinePayments: offline.docs.map(parseOfflinePayment),
      paymentAttempts: attempts.docs.map(parseAttempt),
      providerOperation: isRecord(value.providerOperation) ?
        value.providerOperation as unknown as VendorInvoiceDetail["providerOperation"] : null,
    };
  };

  public commandInvoice = async (
    request: VendorInvoiceCommandRequest,
  ): Promise<VendorInvoiceCommandReceipt> => {
    const resolved = instituteContext(request);
    const command = normalizedInvoiceCommand(request.command);
    const authority = commandAuthority({
      actorId: resolved.actorId,
      idempotencyKey: command.idempotencyKey,
      intent: command,
      prefix: "vendor_invoice",
      scope: `${resolved.instituteId}:${resolved.invoiceId}`,
    });
    const references = this.references(resolved.instituteId, resolved.invoiceId, authority);
    const reservation = await this.dependencies.firestore.runTransaction(async (transaction) => {
      const storedCommandSnapshot = await transaction.get(references.command);
      if (storedCommandSnapshot.exists) {
        const storedCommand = assertReplayCommand(
          storedCommandSnapshot.data(), authority.fingerprint, authority.idempotencyKeyHash,
        );
        if (isRecord(storedCommand.receipt) &&
          isRecord(storedCommand.receipt.providerOperation) &&
          !["pending", "failed_retryable"].includes(
            storedCommand.receipt.providerOperation.state as string,
          )) {
          return {receipt: storedCommand.receipt as unknown as VendorInvoiceCommandReceipt};
        }
        return {attemptCount: typeof storedCommand.attemptCount === "number" ?
          storedCommand.attemptCount : 0};
      }
      const [institute, invoice] = await Promise.all([
        transaction.get(references.institute),
        transaction.get(references.invoice),
      ]);
      if (!institute.exists || !isRecord(institute.data())) {
        throw new Error("Institute commercial authority was not found.");
      }
      const current = parseInvoiceSummary(invoice);
      if (current.revision !== command.expectedRevision) {
        return conflictError("Invoice changed; reload before applying this command.");
      }
      const revision = current.revision + 1;
      const now = this.dependencies.now();
      const pending = providerOperation({
        attemptCount: 0,
        operationId: authority.operationId,
        provider: current.provider,
        state: current.provider === "manual" ? "not_required" : "pending",
        updatedAt: now,
      });
      transaction.update(references.invoice, {
        instituteId: resolved.instituteId,
        invoiceId: resolved.invoiceId,
        providerOperation: pending,
        revision,
        updatedAt: Timestamp.fromDate(now),
      });
      transaction.create(references.command, {
        action: command.action,
        attemptCount: 0,
        fingerprint: authority.fingerprint,
        idempotencyKeyHash: authority.idempotencyKeyHash,
        invoiceId: resolved.invoiceId,
        providerOperation: pending,
        revision,
      });
      this.writeDualAudits(transaction, references, authority, resolved.actorId,
        command.action, now, `Vendor reserved invoice command ${command.action}.`);
      return {attemptCount: 0, provider: current.provider};
    });
    if ("receipt" in reservation) {
      const receipt = reservation.receipt as VendorInvoiceCommandReceipt;
      return {...receipt, replayed: true};
    }
    const result: VendorCommercialProviderResult = reservation.provider === "manual" ? {
      projection: await this.manualInvoiceProjection(
        resolved.instituteId,
        resolved.invoiceId,
        command.action,
      ),
      state: "succeeded",
    } : await this.dependencies.provider.execute({
      instituteId: resolved.instituteId,
      invoiceId: resolved.invoiceId,
      kind: command.action === "sync_provider" ?
        "invoice_sync" : `invoice_${command.action}` as
          Parameters<VendorCommercialProvider["execute"]>[0]["kind"],
      operationId: authority.operationId,
      payload: {...command},
    });
    return this.finalizeInvoiceCommand(
      resolved, command, authority, result, reservation.attemptCount > 0,
    );
  };

  public communicateInvoice = async (
    request: VendorBillingCommunicationRequest,
  ): Promise<VendorBillingCommunicationReceipt> => {
    const resolved = instituteContext(request);
    const command = request.command;
    if (command.action !== "resend_invoice" &&
      command.action !== "send_payment_reminder") {
      return validationError("Field \"action\" is invalid.");
    }
    const normalized = {
      action: command.action,
      expectedRevision: positiveInteger(command.expectedRevision, "expectedRevision"),
      idempotencyKey: requiredString(command.idempotencyKey, "idempotencyKey", 64),
      reason: requiredString(command.reason, "reason", 1000),
    };
    const authority = commandAuthority({
      actorId: resolved.actorId,
      idempotencyKey: normalized.idempotencyKey,
      intent: normalized,
      prefix: "vendor_billing_communication",
      scope: `${resolved.instituteId}:${resolved.invoiceId}`,
    });
    const references = this.references(resolved.instituteId, resolved.invoiceId, authority);
    const deliveryId = `commercial_email_${authority.commandId.slice(-40)}`;
    return this.dependencies.firestore.runTransaction(async (transaction) => {
      const storedCommandSnapshot = await transaction.get(references.command);
      if (storedCommandSnapshot.exists) {
        const storedCommand = assertReplayCommand(
          storedCommandSnapshot.data(), authority.fingerprint, authority.idempotencyKeyHash,
        );
        if (!isRecord(storedCommand.receipt)) {
          return authorityError("Persisted billing communication receipt is invalid.");
        }
        return {
          ...(storedCommand.receipt as unknown as VendorBillingCommunicationReceipt),
          replayed: true,
        };
      }
      const [institute, invoice] = await Promise.all([
        transaction.get(references.institute),
        transaction.get(references.invoice),
      ]);
      if (!institute.exists || !isRecord(institute.data())) {
        throw new Error("Institute billing authority was not found.");
      }
      const current = parseInvoiceSummary(invoice);
      if (current.revision !== normalized.expectedRevision) {
        return conflictError("Invoice changed; reload before sending communication.");
      }
      const instituteData = institute.data() as Record<string, unknown>;
      const profile = isRecord(instituteData.profile) ? instituteData.profile : {};
      const recipientEmail = requiredString(
        instituteData.billingContactEmail ?? profile.contactEmail,
        "institute.billingContactEmail",
        320,
      ).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(recipientEmail)) {
        return authorityError("Persisted institute billing contact is invalid.");
      }
      const now = this.dependencies.now();
      const receipt: VendorBillingCommunicationReceipt = {
        auditEventId: authority.auditEventId,
        commandId: authority.commandId,
        completedAt: now.toISOString(),
        deliveryId,
        deliveryState: "queued",
        recipientClass: "institute_billing_contact",
        replayed: false,
      };
      transaction.create(this.dependencies.firestore.collection(EMAIL_QUEUE).doc(deliveryId), {
        createdAt: Timestamp.fromDate(now),
        instituteId: resolved.instituteId,
        payload: {
          action: normalized.action,
          instituteId: resolved.instituteId,
          invoiceId: resolved.invoiceId,
        },
        recipientClass: "institute_billing_contact",
        recipientEmail,
        retryCount: 0,
        sentAt: null,
        status: "pending",
        subject: normalized.action === "resend_invoice" ?
          "Invoice available" : "Payment reminder",
        templateType: `commercial_${normalized.action}`,
      });
      transaction.create(references.invoice.collection(COMMUNICATIONS).doc(deliveryId), {
        action: normalized.action,
        createdAt: Timestamp.fromDate(now),
        deliveryId,
        recipientClass: "institute_billing_contact",
        status: "queued",
      });
      transaction.create(references.command, {
        fingerprint: authority.fingerprint,
        idempotencyKeyHash: authority.idempotencyKeyHash,
        receipt,
      });
      this.writeDualAudits(transaction, references, authority, resolved.actorId,
        normalized.action, now, "Vendor queued backend-derived billing communication.");
      return receipt;
    });
  };

  public commandOfflinePayment = async (
    request: VendorOfflinePaymentCommandRequest,
  ): Promise<VendorOfflinePaymentCommandReceipt> => {
    const resolved = instituteContext(request);
    const command = this.normalizeOfflineCommand(request.command);
    const authority = commandAuthority({
      actorId: resolved.actorId,
      idempotencyKey: command.idempotencyKey,
      intent: command,
      prefix: "vendor_offline_payment",
      scope: `${resolved.instituteId}:${resolved.invoiceId}`,
    });
    const references = this.references(resolved.instituteId, resolved.invoiceId, authority);
    const offlinePaymentId = command.action === "record" ?
      `offline_${authority.commandId.slice(-40)}` : command.offlinePaymentId;
    const offlineReference = references.invoice.collection(OFFLINE_PAYMENTS)
      .doc(offlinePaymentId);
    const reservation = await this.dependencies.firestore.runTransaction(
      async (transaction) => {
        const storedCommandSnapshot = await transaction.get(references.command);
        if (storedCommandSnapshot.exists) {
          const storedCommand = assertReplayCommand(
            storedCommandSnapshot.data(), authority.fingerprint, authority.idempotencyKeyHash,
          );
          if (isRecord(storedCommand.receipt) &&
            isRecord(storedCommand.receipt.providerOperation) &&
            storedCommand.receipt.providerOperation.state !== "failed_retryable") {
            return {receipt: storedCommand.receipt as unknown as VendorOfflinePaymentCommandReceipt};
          }
          return {attemptCount: typeof storedCommand.attemptCount === "number" ?
            storedCommand.attemptCount : 0, needsProvider: true};
        }
        const [institute, invoice, offline] = await Promise.all([
          transaction.get(references.institute),
          transaction.get(references.invoice),
          transaction.get(offlineReference),
        ]);
        if (!institute.exists || !isRecord(institute.data())) {
          throw new Error("Institute commercial authority was not found.");
        }
        const current = parseInvoiceSummary(invoice);
        if (current.revision !== command.expectedRevision) {
          return conflictError("Invoice changed; reload before recording payment authority.");
        }
        const now = this.dependencies.now();
        const invoiceRevision = current.revision + 1;
        let offlineDocument: Record<string, unknown>;
        let needsProvider = false;
        if (command.action === "record") {
          if (offline.exists) return conflictError("Offline payment already exists.");
          if (command.amount.currency !== current.amountDue.currency ||
            command.amount.amountMinor <= 0 ||
            command.amount.amountMinor > current.amountDue.amountMinor) {
            return conflictError("Offline payment amount exceeds invoice authority or currency.");
          }
          offlineDocument = {
            amountMinor: command.amount.amountMinor,
            currency: command.amount.currency,
            evidenceReferenceHash: sha256(command.evidenceReference),
            externalReferenceHash: sha256(command.externalReference),
            method: command.method,
            occurredAt: Timestamp.fromDate(new Date(command.occurredAt)),
            recordedAt: Timestamp.fromDate(now),
            recordedByUserId: resolved.actorId,
            revision: 1,
            status: "pending_verification",
          };
          transaction.create(offlineReference, offlineDocument);
        } else {
          if (!offline.exists || !isRecord(offline.data())) {
            throw new Error("Offline-payment authority was not found.");
          }
          const parsed = parseOfflinePayment(offline);
          if (parsed.revision !== command.expectedOfflinePaymentRevision) {
            return conflictError("Offline payment changed; reload before applying this command.");
          }
          const data = offline.data() as Record<string, unknown>;
          if (command.action === "verify") {
            if (parsed.status !== "pending_verification" && parsed.status !== "provider_failed") {
              return conflictError("Offline payment is not eligible for verification.");
            }
            if (data.recordedByUserId === resolved.actorId) {
              return conflictError("Offline payment verification requires a different Vendor actor.");
            }
            needsProvider = current.provider === "stripe";
            offlineDocument = {
              revision: parsed.revision + 1,
              status: needsProvider ? "provider_pending" : "verified",
              verifiedByUserId: resolved.actorId,
              verifiedAt: Timestamp.fromDate(now),
            };
          } else {
            const allowed = command.action === "reject" ?
              ["pending_verification", "provider_failed"] :
              ["pending_verification", "rejected", "verified", "provider_failed"];
            if (!allowed.includes(parsed.status)) {
              return conflictError("Offline payment cannot make this transition.");
            }
            offlineDocument = {
              decidedAt: Timestamp.fromDate(now),
              decidedByUserId: resolved.actorId,
              revision: parsed.revision + 1,
              status: command.action === "reject" ? "rejected" : "voided",
            };
          }
          transaction.update(offlineReference, offlineDocument);
        }
        const manualOperation = providerOperation({
          attemptCount: needsProvider ? 0 : 1,
          operationId: authority.operationId,
          provider: needsProvider ? "stripe" : "manual",
          state: needsProvider ? "pending" : "succeeded",
          updatedAt: now,
        });
        const nextStatus = offlineDocument.status as VendorOfflinePaymentStatus;
        const currentOffline = command.action === "record" ? {
          amount: command.amount,
          method: command.method,
          occurredAt: command.occurredAt,
          offlinePaymentId,
          recordedAt: now.toISOString(),
          revision: 1,
          status: nextStatus,
        } : {
          ...parseOfflinePayment(offline),
          revision: offlineDocument.revision as number,
          status: nextStatus,
        };
        const receipt: VendorOfflinePaymentCommandReceipt = {
          auditEventId: authority.auditEventId,
          commandId: authority.commandId,
          completedAt: now.toISOString(),
          invoiceRevision,
          offlinePayment: currentOffline,
          providerOperation: manualOperation,
          replayed: false,
        };
        const invoiceUpdate: Record<string, unknown> = {
          invoiceId: resolved.invoiceId,
          instituteId: resolved.instituteId,
          revision: invoiceRevision,
          updatedAt: Timestamp.fromDate(now),
        };
        if (command.action === "verify" && !needsProvider) {
          invoiceUpdate.amountPaidMinor = Math.min(
            current.amountDue.amountMinor,
            current.amountPaid.amountMinor + currentOffline.amount.amountMinor,
          );
          invoiceUpdate.currency = currentOffline.amount.currency;
          if (invoiceUpdate.amountPaidMinor === current.amountDue.amountMinor) {
            invoiceUpdate.commercialStatus = "paid";
            invoiceUpdate.status = "paid";
          }
        }
        transaction.update(references.invoice, invoiceUpdate);
        transaction.create(references.command, {
          action: command.action,
          attemptCount: 0,
          fingerprint: authority.fingerprint,
          idempotencyKeyHash: authority.idempotencyKeyHash,
          invoiceRevision,
          offlinePaymentId,
          providerOperation: manualOperation,
          receipt,
        });
        this.writeDualAudits(transaction, references, authority, resolved.actorId,
          `offline_payment_${command.action}`, now,
          `Vendor recorded offline-payment command ${command.action}.`);
        return {attemptCount: 0, needsProvider, receipt};
      },
    );
    if ("receipt" in reservation && !reservation.needsProvider) {
      const receipt = reservation.receipt as VendorOfflinePaymentCommandReceipt;
      return {...receipt, replayed: (reservation.attemptCount ?? 0) > 0};
    }
    if (!reservation.needsProvider) {
      return reservation.receipt as VendorOfflinePaymentCommandReceipt;
    }
    const providerResult = await this.dependencies.provider.execute({
      instituteId: resolved.instituteId,
      invoiceId: resolved.invoiceId,
      kind: "offline_payment_verify",
      operationId: authority.operationId,
      payload: {offlinePaymentId},
    });
    return this.finalizeOfflineProvider(
      resolved, authority, offlinePaymentId, providerResult,
      reservation.attemptCount > 0,
    );
  };

  private references(
    instituteId: string,
    invoiceId: string,
    authority: ReturnType<typeof commandAuthority>,
  ) {
    const institute = this.dependencies.firestore.collection("institutes")
      .doc(instituteId);
    return {
      command: institute.collection(COMMANDS).doc(authority.commandId),
      institute,
      instituteAudit: institute.collection(INSTITUTE_AUDITS)
        .doc(authority.auditEventId),
      invoice: institute.collection(INVOICES).doc(invoiceId),
      rootAudit: this.dependencies.firestore.collection(ROOT_AUDITS)
        .doc(authority.auditEventId),
    };
  }

  private writeDualAudits(
    transaction: FirebaseFirestore.Transaction,
    references: ReturnType<VendorInvoicesService["references"]>,
    authority: ReturnType<typeof commandAuthority>,
    actorId: string,
    action: string,
    now: Date,
    summary: string,
  ) {
    const audit = dualAuditDocument({
      action,
      actorId,
      actorRole: "vendor",
      auditEventId: authority.auditEventId,
      fingerprint: authority.fingerprint,
      idempotencyKeyHash: authority.idempotencyKeyHash,
      instituteId: references.institute.id,
      occurredAt: Timestamp.fromDate(now),
      summary,
      targetId: references.invoice.id,
    });
    transaction.create(references.rootAudit, audit);
    transaction.create(references.instituteAudit, audit);
  }

  private async manualInvoiceProjection(
    instituteId: string,
    invoiceId: string,
    action: VendorInvoiceCommandIntent["action"],
  ): Promise<Record<string, unknown>> {
    const snapshot = await this.dependencies.firestore.collection("institutes")
      .doc(instituteId).collection(INVOICES).doc(invoiceId).get();
    const current = parseInvoiceSummary(snapshot);
    const status: VendorInvoiceStatus = action === "void" ? "void" :
      action === "finalize" && current.status === "draft" ? "open" : current.status;
    return {
      amountDue: current.amountDue,
      amountPaid: current.amountPaid,
      dueAt: current.dueAt,
      externalActions: {},
      issuedAt: current.issuedAt,
      status,
    };
  }

  private async finalizeInvoiceCommand(
    resolved: ReturnType<typeof instituteContext>,
    command: VendorInvoiceCommandIntent,
    authority: ReturnType<typeof commandAuthority>,
    result: VendorCommercialProviderResult,
    replayed: boolean,
  ): Promise<VendorInvoiceCommandReceipt> {
    const references = this.references(resolved.instituteId, resolved.invoiceId, authority);
    return this.dependencies.firestore.runTransaction(async (transaction) => {
      const [storedCommandSnapshot, invoiceSnapshot] = await Promise.all([
        transaction.get(references.command),
        transaction.get(references.invoice),
      ]);
      const storedCommand = assertReplayCommand(
        storedCommandSnapshot.data(), authority.fingerprint, authority.idempotencyKeyHash,
      );
      const current = parseInvoiceSummary(invoiceSnapshot);
      if (current.revision !== storedCommand.revision) {
        return conflictError("Invoice provider operation lost revision authority.");
      }
      const attemptCount = (typeof storedCommand.attemptCount === "number" ?
        storedCommand.attemptCount : 0) + 1;
      const now = this.dependencies.now();
      const operation = providerResultOperation({
        attemptCount,
        operationId: authority.operationId,
        provider: current.provider,
        result,
        updatedAt: now,
      });
      const projection = result.state === "succeeded" ? invoiceProjection(result) : {};
      const status = result.state === "succeeded" ?
        projection.commercialStatus as VendorInvoiceStatus : "provider_unavailable";
      const receipt: VendorInvoiceCommandReceipt = {
        auditEventId: authority.auditEventId,
        commandId: authority.commandId,
        completedAt: now.toISOString(),
        providerOperation: operation,
        replayed,
        revision: current.revision,
        status,
      };
      transaction.update(references.invoice, {
        ...projection,
        ...legacyBillingStatus(status),
        commercialStatus: status,
        providerOperation: operation,
        updatedAt: Timestamp.fromDate(now),
      });
      transaction.update(references.command, {
        attemptCount,
        completedAt: Timestamp.fromDate(now),
        providerOperation: operation,
        receipt,
      });
      return receipt;
    });
  }

  private normalizeOfflineCommand(
    command: VendorOfflinePaymentCommandIntent,
  ): VendorOfflinePaymentCommandIntent {
    const base = {
      expectedRevision: positiveInteger(command.expectedRevision, "expectedRevision"),
      idempotencyKey: requiredString(command.idempotencyKey, "idempotencyKey", 64),
      reason: requiredString(command.reason, "reason", 1000),
    };
    if (command.action === "record") {
      const method = command.method;
      if (!["bank_transfer", "upi", "cheque", "other"].includes(method)) {
        return validationError("Field \"method\" is invalid.");
      }
      return {
        ...base,
        action: command.action,
        amount: normalizeMoney(command.amount, "amount"),
        evidenceReference: requiredString(
          command.evidenceReference,
          "evidenceReference",
          512,
        ),
        externalReference: requiredString(
          command.externalReference,
          "externalReference",
          256,
        ),
        method,
        occurredAt: isoDate(command.occurredAt, "occurredAt"),
      };
    }
    if (!["verify", "reject", "void"].includes(command.action)) {
      return validationError("Field \"action\" is invalid.");
    }
    return {
      ...base,
      action: command.action,
      expectedOfflinePaymentRevision: positiveInteger(
        command.expectedOfflinePaymentRevision,
        "expectedOfflinePaymentRevision",
      ),
      offlinePaymentId: identifier(command.offlinePaymentId, "offlinePaymentId"),
    };
  }

  private async finalizeOfflineProvider(
    resolved: ReturnType<typeof instituteContext>,
    authority: ReturnType<typeof commandAuthority>,
    offlinePaymentId: string,
    result: VendorCommercialProviderResult,
    replayed: boolean,
  ): Promise<VendorOfflinePaymentCommandReceipt> {
    const references = this.references(resolved.instituteId, resolved.invoiceId, authority);
    const offlineReference = references.invoice.collection(OFFLINE_PAYMENTS)
      .doc(offlinePaymentId);
    return this.dependencies.firestore.runTransaction(async (transaction) => {
      const [storedCommandSnapshot, invoiceSnapshot, offlineSnapshot] = await Promise.all([
        transaction.get(references.command),
        transaction.get(references.invoice),
        transaction.get(offlineReference),
      ]);
      const storedCommand = assertReplayCommand(
        storedCommandSnapshot.data(), authority.fingerprint, authority.idempotencyKeyHash,
      );
      const invoice = parseInvoiceSummary(invoiceSnapshot);
      const offline = parseOfflinePayment(offlineSnapshot);
      if (invoice.revision !== storedCommand.invoiceRevision) {
        return conflictError("Offline-payment provider operation lost invoice revision authority.");
      }
      const attemptCount = (typeof storedCommand.attemptCount === "number" ?
        storedCommand.attemptCount : 0) + 1;
      const now = this.dependencies.now();
      const operation = providerResultOperation({
        attemptCount,
        operationId: authority.operationId,
        provider: "stripe",
        result,
        updatedAt: now,
      });
      const status: VendorOfflinePaymentStatus = result.state === "succeeded" ?
        "verified" : "provider_failed";
      const nextOffline = {...offline, status};
      const receipt: VendorOfflinePaymentCommandReceipt = {
        auditEventId: authority.auditEventId,
        commandId: authority.commandId,
        completedAt: now.toISOString(),
        invoiceRevision: invoice.revision,
        offlinePayment: nextOffline,
        providerOperation: operation,
        replayed,
      };
      transaction.update(offlineReference, {
        providerOperation: operation,
        status,
        updatedAt: Timestamp.fromDate(now),
      });
      const nextAmountPaidMinor = Math.min(
        invoice.amountDue.amountMinor,
        invoice.amountPaid.amountMinor + offline.amount.amountMinor,
      );
      const paid = nextAmountPaidMinor === invoice.amountDue.amountMinor;
      transaction.update(references.invoice, {
        ...(result.state === "succeeded" ? {
          amountPaidMinor: nextAmountPaidMinor,
          currency: offline.amount.currency,
          ...(paid ? {commercialStatus: "paid", status: "paid"} : {}),
        } : {}),
        providerOperation: operation,
        updatedAt: Timestamp.fromDate(now),
      });
      transaction.update(references.command, {
        attemptCount,
        completedAt: Timestamp.fromDate(now),
        providerOperation: operation,
        receipt,
      });
      return receipt;
    });
  }
}

export const vendorInvoicesService = new VendorInvoicesService();
