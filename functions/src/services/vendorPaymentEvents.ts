/* eslint-disable max-len, require-jsdoc */
import {Timestamp} from "firebase-admin/firestore";
import type {
  VendorPaymentEventCommandIntent,
  VendorPaymentEventCommandReceipt,
  VendorPaymentEventProcessingState,
  VendorPaymentEventReconciliationState,
  VendorPaymentEventSummary,
} from "../../../shared/contracts/vendorCommercial";
import type {
  VendorPaymentEventCommandRequest,
  VendorPaymentEventListRequest,
  VendorPaymentEventListResult,
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
  MAX_COMMERCIAL_CURSOR,
  optionalStoredString,
  positiveInteger,
  providerOperation,
  providerResultOperation,
  requiredString,
  sha256,
  stableSerialize,
  storedPositiveInteger,
  storedString,
  timestamp,
  UnavailableVendorCommercialProvider,
  VendorCommercialProvider,
  validationError,
} from "./vendorCommercialCommon";

const EVENT_COLLECTION = "vendor/stripeEvents/events";
const COMMAND_COLLECTION = "vendor/stripeEvents/commands";
const ROOT_AUDITS = "vendorAuditLogs";
const INSTITUTE_AUDITS = "auditLogs";
const PROCESSING_STATES: readonly VendorPaymentEventProcessingState[] = [
  "received",
  "processing",
  "applied",
  "ignored",
  "failed_retryable",
  "failed_terminal",
];
const RECONCILIATION_STATES: readonly VendorPaymentEventReconciliationState[] = [
  "pending",
  "reconciled",
  "mismatch",
  "manual_review",
];

interface PaymentEventDependencies {
  firestore: FirebaseFirestore.Firestore;
  now: () => Date;
  provider: VendorCommercialProvider;
}

interface PaymentEventCursor {
  eventId: string;
  fingerprint: string;
  updatedAtMillis: number;
  version: 1;
}

const actor = (request: {actorId: string; actorRole: "vendor"}) => {
  if (request.actorRole !== "vendor") {
    throw new Error("Vendor payment-event authority is required.");
  }
  return identifier(request.actorId, "actorId");
};

const processingState = (value: unknown): VendorPaymentEventProcessingState => {
  const normalized = storedString(value, "paymentEvent.processingState").toLowerCase();
  const legacy = normalized === "processed" ? "applied" : normalized;
  if (!PROCESSING_STATES.includes(legacy as VendorPaymentEventProcessingState)) {
    return authorityError("Persisted payment-event processing state is invalid.");
  }
  return legacy as VendorPaymentEventProcessingState;
};

const reconciliationState = (
  value: unknown,
): VendorPaymentEventReconciliationState => {
  if (value === undefined || value === null) return "manual_review";
  const normalized = storedString(value, "paymentEvent.reconciliationState")
    .toLowerCase();
  if (!RECONCILIATION_STATES.includes(
    normalized as VendorPaymentEventReconciliationState,
  )) {
    return authorityError("Persisted payment-event reconciliation state is invalid.");
  }
  return normalized as VendorPaymentEventReconciliationState;
};

const parseEvent = (
  snapshot: FirebaseFirestore.DocumentSnapshot,
): VendorPaymentEventSummary => {
  const value = snapshot.data();
  if (!snapshot.exists || !isRecord(value)) {
    return authorityError("Payment-event authority is unavailable.");
  }
  const eventId = optionalStoredString(value.eventId, "paymentEvent.eventId") ??
    snapshot.id;
  if (eventId !== snapshot.id) {
    return authorityError("Payment-event identity is inconsistent.");
  }
  return {
    eventId,
    eventType: storedString(value.eventType, "paymentEvent.eventType"),
    instituteId: optionalStoredString(value.instituteId, "paymentEvent.instituteId"),
    occurredAt: timestamp(
      value.occurredAt ?? value.createdAt,
      "paymentEvent.occurredAt",
    ).toDate().toISOString(),
    processingState: processingState(value.processingState ?? value.status),
    provider: value.provider === "manual" ? "manual" : "stripe",
    reconciliationState: reconciliationState(value.reconciliationState),
    revision: storedPositiveInteger(value.revision, "paymentEvent.revision", 1),
    updatedAt: timestamp(
      value.updatedAt ?? value.createdAt,
      "paymentEvent.updatedAt",
    ).toDate().toISOString(),
  };
};

const filterFingerprint = (request: VendorPaymentEventListRequest) => sha256(
  stableSerialize({
    instituteId: request.instituteId ?? null,
    processingState: request.processingState ?? null,
    reconciliationState: request.reconciliationState ?? null,
  }),
);

const encodeCursor = (cursor: PaymentEventCursor): string =>
  Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");

const decodeCursor = (
  value: string,
  fingerprint: string,
): PaymentEventCursor => {
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
      eventId: identifier(parsed.eventId, "cursor.eventId"),
      fingerprint,
      updatedAtMillis: parsed.updatedAtMillis,
      version: 1,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "VendorCommercialValidationError") throw error;
    return validationError("Field \"cursor\" is malformed.");
  }
};

const normalizedCommand = (
  command: VendorPaymentEventCommandIntent,
): VendorPaymentEventCommandIntent => {
  if (command.action !== "retry_reconciliation") {
    return validationError("Field \"action\" is invalid.");
  }
  return {
    action: command.action,
    expectedRevision: positiveInteger(command.expectedRevision, "expectedRevision"),
    idempotencyKey: requiredString(command.idempotencyKey, "idempotencyKey", 64),
    reason: requiredString(command.reason, "reason", 1000),
  };
};

export class VendorPaymentEventsService {
  constructor(private readonly dependencies: PaymentEventDependencies = {
    firestore: getFirestore(),
    now: () => new Date(),
    provider: new UnavailableVendorCommercialProvider(),
  }) {}

  public listEvents = async (
    request: VendorPaymentEventListRequest,
  ): Promise<VendorPaymentEventListResult> => {
    actor(request);
    const fingerprint = filterFingerprint(request);
    let filtered: FirebaseFirestore.Query = this.dependencies.firestore
      .collection(EVENT_COLLECTION);
    if (request.instituteId) {
      filtered = filtered.where("instituteId", "==", identifier(
        request.instituteId,
        "instituteId",
      ));
    }
    if (request.processingState) {
      if (!PROCESSING_STATES.includes(request.processingState)) {
        return validationError("Field \"processingState\" is invalid.");
      }
      filtered = filtered.where("processingState", "==", request.processingState);
    }
    if (request.reconciliationState) {
      if (!RECONCILIATION_STATES.includes(request.reconciliationState)) {
        return validationError("Field \"reconciliationState\" is invalid.");
      }
      filtered = filtered.where(
        "reconciliationState",
        "==",
        request.reconciliationState,
      );
    }
    let pageQuery = filtered.orderBy("updatedAt", "desc")
      .orderBy("eventId", "asc");
    if (request.cursor) {
      const cursor = decodeCursor(request.cursor, fingerprint);
      pageQuery = pageQuery.startAfter(
        Timestamp.fromMillis(cursor.updatedAtMillis),
        cursor.eventId,
      );
    }
    const [pageSnapshot, countSnapshot] = await Promise.all([
      pageQuery.limit(request.limit + 1).get(),
      filtered.count().get(),
    ]);
    const items = pageSnapshot.docs.slice(0, request.limit).map(parseEvent);
    const last = items[items.length - 1];
    return {
      items,
      nextCursor: pageSnapshot.size > request.limit && last ? encodeCursor({
        eventId: last.eventId,
        fingerprint,
        updatedAtMillis: new Date(last.updatedAt).getTime(),
        version: 1,
      }) : null,
      totalMatching: countSnapshot.data().count,
    };
  };

  public retryEvent = async (
    request: VendorPaymentEventCommandRequest,
  ): Promise<VendorPaymentEventCommandReceipt> => {
    const actorId = actor(request);
    const eventId = identifier(request.eventId, "eventId");
    const command = normalizedCommand(request.command);
    const authority = commandAuthority({
      actorId,
      idempotencyKey: command.idempotencyKey,
      intent: {...command, eventId},
      prefix: "vendor_payment_event",
      scope: eventId,
    });
    const firestore = this.dependencies.firestore;
    const eventReference = firestore.collection(EVENT_COLLECTION).doc(eventId);
    const commandReference = firestore.collection(COMMAND_COLLECTION)
      .doc(authority.commandId);
    const auditReference = firestore.collection(ROOT_AUDITS)
      .doc(authority.auditEventId);
    const reservation = await firestore.runTransaction(async (transaction) => {
      const storedCommandSnapshot = await transaction.get(commandReference);
      if (storedCommandSnapshot.exists) {
        const storedCommand = assertReplayCommand(
          storedCommandSnapshot.data(), authority.fingerprint, authority.idempotencyKeyHash,
        );
        if (isRecord(storedCommand.receipt) &&
          isRecord(storedCommand.receipt.providerOperation) &&
          !["pending", "failed_retryable"].includes(
            storedCommand.receipt.providerOperation.state as string,
          )) {
          return {receipt: storedCommand.receipt as unknown as VendorPaymentEventCommandReceipt};
        }
        return {attemptCount: typeof storedCommand.attemptCount === "number" ?
          storedCommand.attemptCount : 0};
      }
      const eventSnapshot = await transaction.get(eventReference);
      const event = parseEvent(eventSnapshot);
      if (event.revision !== command.expectedRevision) {
        return conflictError("Payment event changed; reload before retrying reconciliation.");
      }
      if (event.processingState === "processing") {
        return conflictError("Payment event reconciliation is already processing.");
      }
      const revision = event.revision + 1;
      const now = this.dependencies.now();
      const pending = providerOperation({
        attemptCount: 0,
        operationId: authority.operationId,
        provider: "stripe",
        state: "pending",
        updatedAt: now,
      });
      transaction.update(eventReference, {
        processingState: "processing",
        providerOperation: pending,
        revision,
        updatedAt: Timestamp.fromDate(now),
      });
      transaction.create(commandReference, {
        attemptCount: 0,
        eventId,
        fingerprint: authority.fingerprint,
        idempotencyKeyHash: authority.idempotencyKeyHash,
        providerOperation: pending,
        revision,
      });
      transaction.create(auditReference, dualAuditDocument({
        action: command.action,
        actorId,
        actorRole: "vendor",
        auditEventId: authority.auditEventId,
        fingerprint: authority.fingerprint,
        idempotencyKeyHash: authority.idempotencyKeyHash,
        instituteId: event.instituteId ?? undefined,
        occurredAt: Timestamp.fromDate(now),
        summary: "Vendor reserved payment-event reconciliation retry.",
        targetId: eventId,
      }));
      if (event.instituteId) {
        transaction.create(
          firestore.collection("institutes").doc(event.instituteId)
            .collection(INSTITUTE_AUDITS).doc(authority.auditEventId),
          dualAuditDocument({
            action: command.action,
            actorId,
            actorRole: "vendor",
            auditEventId: authority.auditEventId,
            fingerprint: authority.fingerprint,
            idempotencyKeyHash: authority.idempotencyKeyHash,
            instituteId: event.instituteId,
            occurredAt: Timestamp.fromDate(now),
            summary: "Vendor reserved payment-event reconciliation retry.",
            targetId: eventId,
          }),
        );
      }
      return {attemptCount: 0};
    });
    if ("receipt" in reservation) {
      const receipt = reservation.receipt as VendorPaymentEventCommandReceipt;
      return {...receipt, replayed: true};
    }
    const result = await this.dependencies.provider.execute({
      eventId,
      kind: "payment_event_reconcile",
      operationId: authority.operationId,
      payload: {eventId},
    });
    return firestore.runTransaction(async (transaction) => {
      const [storedCommandSnapshot, eventSnapshot] = await Promise.all([
        transaction.get(commandReference),
        transaction.get(eventReference),
      ]);
      const storedCommand = assertReplayCommand(
        storedCommandSnapshot.data(), authority.fingerprint, authority.idempotencyKeyHash,
      );
      const event = parseEvent(eventSnapshot);
      if (event.revision !== storedCommand.revision) {
        return conflictError("Payment-event reconciliation lost revision authority.");
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
      const projection = result.projection;
      let nextProcessing: VendorPaymentEventProcessingState =
        result.state === "failed_retryable" ? "failed_retryable" :
          result.state === "failed_terminal" ? "failed_terminal" : "applied";
      let nextReconciliation: VendorPaymentEventReconciliationState =
        result.state === "succeeded" ? "reconciled" : "manual_review";
      if (result.state === "succeeded" && isRecord(projection)) {
        if (typeof projection.processingState === "string" &&
          PROCESSING_STATES.includes(
            projection.processingState as VendorPaymentEventProcessingState,
          )) {
          nextProcessing = projection.processingState as VendorPaymentEventProcessingState;
        }
        if (typeof projection.reconciliationState === "string" &&
          RECONCILIATION_STATES.includes(
            projection.reconciliationState as VendorPaymentEventReconciliationState,
          )) {
          nextReconciliation = projection.reconciliationState as
            VendorPaymentEventReconciliationState;
        }
      }
      const receipt: VendorPaymentEventCommandReceipt = {
        auditEventId: authority.auditEventId,
        commandId: authority.commandId,
        completedAt: now.toISOString(),
        processingState: nextProcessing,
        providerOperation: operation,
        reconciliationState: nextReconciliation,
        replayed: reservation.attemptCount > 0,
        revision: event.revision,
      };
      transaction.update(eventReference, {
        processingState: nextProcessing,
        providerOperation: operation,
        reconciliationState: nextReconciliation,
        updatedAt: Timestamp.fromDate(now),
      });
      transaction.update(commandReference, {
        attemptCount,
        completedAt: Timestamp.fromDate(now),
        providerOperation: operation,
        receipt,
      });
      return receipt;
    });
  };
}

export const vendorPaymentEventsService = new VendorPaymentEventsService();
