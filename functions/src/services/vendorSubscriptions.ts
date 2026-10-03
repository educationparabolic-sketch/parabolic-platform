/* eslint-disable max-len, require-jsdoc */
import {Timestamp} from "firebase-admin/firestore";
import type {
  VendorSubscriptionCommandIntent,
  VendorSubscriptionCommandReceipt,
  VendorSubscriptionDetail,
  VendorSubscriptionStatus,
} from "../../../shared/contracts/vendorCommercial";
import type {
  VendorCommercialInstituteRequest,
  VendorSubscriptionCommandRequest,
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
  optionalStoredString,
  optionalTimestampIso,
  positiveInteger,
  providerOperation,
  providerResultOperation,
  requiredString,
  storedPositiveInteger,
  storedString,
  timestamp,
  UnavailableVendorCommercialProvider,
  VendorCommercialProvider,
  VendorCommercialProviderResult,
  validationError,
} from "./vendorCommercialCommon";

const SUBSCRIPTION_PATH = "commercial/subscription";
const COMMANDS = "commercialCommands";
const ROOT_AUDITS = "vendorAuditLogs";
const INSTITUTE_AUDITS = "auditLogs";
const PLAN_ROOT = "vendorConfig/pricingPlans/pricingPlans";
const STATUSES: readonly VendorSubscriptionStatus[] = [
  "not_configured",
  "trialing",
  "active",
  "past_due",
  "paused",
  "canceled",
  "incomplete",
  "provider_unavailable",
];

interface SubscriptionDependencies {
  firestore: FirebaseFirestore.Firestore;
  now: () => Date;
  provider: VendorCommercialProvider;
}

const context = (request: VendorCommercialInstituteRequest) => {
  if (request.actorRole !== "vendor") {
    throw new Error("Vendor subscription authority is required.");
  }
  return {
    actorId: identifier(request.actorId, "actorId"),
    instituteId: identifier(request.instituteId, "instituteId"),
  };
};

const parseStatus = (value: unknown): VendorSubscriptionStatus => {
  const normalized = storedString(value, "subscription.status").toLowerCase();
  if (!STATUSES.includes(normalized as VendorSubscriptionStatus)) {
    return authorityError("Persisted subscription status is invalid.");
  }
  return normalized as VendorSubscriptionStatus;
};

const parseSubscription = (
  snapshot: FirebaseFirestore.DocumentSnapshot,
  instituteId: string,
): VendorSubscriptionDetail => {
  const value = snapshot.data();
  if (!snapshot.exists || !isRecord(value)) {
    return authorityError("Subscription authority is unavailable.");
  }
  const storedInstituteId = optionalStoredString(
    value.instituteId,
    "subscription.instituteId",
  ) ?? instituteId;
  if (storedInstituteId !== instituteId) {
    return authorityError("Subscription institute authority is inconsistent.");
  }
  const provider = value.provider === null || value.provider === undefined ? null :
    storedString(value.provider, "subscription.provider").toLowerCase();
  if (provider !== null && provider !== "stripe" && provider !== "manual") {
    return authorityError("Persisted subscription provider is invalid.");
  }
  return {
    cancelAtPeriodEnd: value.cancelAtPeriodEnd === true,
    currentPeriodEndsAt: optionalTimestampIso(
      value.currentPeriodEndsAt,
      "subscription.currentPeriodEndsAt",
    ),
    currentPeriodStartsAt: optionalTimestampIso(
      value.currentPeriodStartsAt,
      "subscription.currentPeriodStartsAt",
    ),
    instituteId,
    planId: optionalStoredString(value.planId, "subscription.planId"),
    planVersionId: optionalStoredString(
      value.planVersionId,
      "subscription.planVersionId",
    ),
    provider,
    providerOperation: isRecord(value.providerOperation) ?
      value.providerOperation as unknown as VendorSubscriptionDetail["providerOperation"] : null,
    revision: storedPositiveInteger(value.revision, "subscription.revision"),
    status: parseStatus(value.status),
    trialEndsAt: optionalTimestampIso(value.trialEndsAt, "subscription.trialEndsAt"),
    updatedAt: timestamp(value.updatedAt, "subscription.updatedAt")
      .toDate().toISOString(),
  };
};

const normalizedCommand = (
  command: VendorSubscriptionCommandIntent,
): VendorSubscriptionCommandIntent => {
  const base = {
    expectedRevision: positiveInteger(command.expectedRevision, "expectedRevision"),
    idempotencyKey: requiredString(command.idempotencyKey, "idempotencyKey", 64),
    reason: requiredString(command.reason, "reason", 1000),
  };
  if (command.action === "change_plan") {
    if (command.effective !== "immediate" &&
      command.effective !== "next_billing_cycle") {
      return validationError("Field \"effective\" is invalid.");
    }
    return {
      ...base,
      action: command.action,
      effective: command.effective,
      planId: identifier(command.planId, "planId"),
      planVersionId: identifier(command.planVersionId, "planVersionId"),
    };
  }
  if (command.action === "extend_trial") {
    const extensionDays = positiveInteger(command.extensionDays, "extensionDays");
    if (extensionDays > 90) {
      return validationError("Field \"extensionDays\" may not exceed 90.");
    }
    return {...base, action: command.action, extensionDays};
  }
  if (!["cancel_at_period_end", "cancel_now", "resume", "sync_provider"]
    .includes(command.action)) {
    return validationError("Field \"action\" is invalid.");
  }
  return {...base, action: command.action};
};

const projectionTimestamp = (
  value: unknown,
  field: string,
): Timestamp | null => {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    return authorityError(`Provider field "${field}" is invalid.`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return authorityError(`Provider field "${field}" is invalid.`);
  }
  return Timestamp.fromDate(parsed);
};

const validateProjection = (
  result: VendorCommercialProviderResult,
): Record<string, unknown> => {
  if (!isRecord(result.projection)) {
    return authorityError("Successful subscription provider result has no projection.");
  }
  const status = requiredString(result.projection.status, "provider.status", 32)
    .toLowerCase();
  if (!STATUSES.includes(status as VendorSubscriptionStatus) ||
    status === "not_configured" || status === "provider_unavailable") {
    return authorityError("Subscription provider returned an invalid status.");
  }
  const planId = result.projection.planId === null ? null :
    identifier(result.projection.planId, "provider.planId");
  const planVersionId = result.projection.planVersionId === null ? null :
    identifier(result.projection.planVersionId, "provider.planVersionId");
  return {
    cancelAtPeriodEnd: result.projection.cancelAtPeriodEnd === true,
    currentPeriodEndsAt: projectionTimestamp(
      result.projection.currentPeriodEndsAt,
      "currentPeriodEndsAt",
    ),
    currentPeriodStartsAt: projectionTimestamp(
      result.projection.currentPeriodStartsAt,
      "currentPeriodStartsAt",
    ),
    planId,
    planVersionId,
    provider: "stripe",
    status,
    trialEndsAt: projectionTimestamp(result.projection.trialEndsAt, "trialEndsAt"),
  };
};

export class VendorSubscriptionsService {
  constructor(private readonly dependencies: SubscriptionDependencies = {
    firestore: getFirestore(),
    now: () => new Date(),
    provider: new UnavailableVendorCommercialProvider(),
  }) {}

  public getSubscription = async (
    request: VendorCommercialInstituteRequest,
  ): Promise<VendorSubscriptionDetail> => {
    const resolved = context(request);
    const instituteReference = this.dependencies.firestore
      .collection("institutes").doc(resolved.instituteId);
    const subscriptionReference = this.dependencies.firestore.doc(
      `${instituteReference.path}/${SUBSCRIPTION_PATH}`,
    );
    const [instituteSnapshot, subscriptionSnapshot] = await Promise.all([
      instituteReference.get(),
      subscriptionReference.get(),
    ]);
    if (!instituteSnapshot.exists || !isRecord(instituteSnapshot.data())) {
      throw new Error("Institute commercial authority was not found.");
    }
    if (subscriptionSnapshot.exists) {
      return parseSubscription(subscriptionSnapshot, resolved.instituteId);
    }
    const value = instituteSnapshot.data() as Record<string, unknown>;
    const updatedAt = timestamp(
      value.updatedAt ?? value.createdAt,
      "institute.updatedAt",
    ).toDate().toISOString();
    return {
      cancelAtPeriodEnd: false,
      currentPeriodEndsAt: null,
      currentPeriodStartsAt: null,
      instituteId: resolved.instituteId,
      planId: null,
      planVersionId: null,
      provider: null,
      providerOperation: null,
      revision: 1,
      status: "not_configured",
      trialEndsAt: null,
      updatedAt,
    };
  };

  public commandSubscription = async (
    request: VendorSubscriptionCommandRequest,
  ): Promise<VendorSubscriptionCommandReceipt> => {
    const resolved = context(request);
    const command = normalizedCommand(request.command);
    const authority = commandAuthority({
      actorId: resolved.actorId,
      idempotencyKey: command.idempotencyKey,
      intent: command,
      prefix: "vendor_subscription",
      scope: resolved.instituteId,
    });
    const firestore = this.dependencies.firestore;
    const instituteReference = firestore.collection("institutes")
      .doc(resolved.instituteId);
    const subscriptionReference = firestore.doc(
      `${instituteReference.path}/${SUBSCRIPTION_PATH}`,
    );
    const commandReference = instituteReference.collection(COMMANDS)
      .doc(authority.commandId);
    const rootAuditReference = firestore.collection(ROOT_AUDITS)
      .doc(authority.auditEventId);
    const instituteAuditReference = instituteReference.collection(INSTITUTE_AUDITS)
      .doc(authority.auditEventId);
    const reservation = await firestore.runTransaction(async (transaction) => {
      const storedCommandSnapshot = await transaction.get(commandReference);
      if (storedCommandSnapshot.exists) {
        const storedCommand = assertReplayCommand(
          storedCommandSnapshot.data(),
          authority.fingerprint,
          authority.idempotencyKeyHash,
        );
        const receipt = storedCommand.receipt;
        if (isRecord(receipt) && isRecord(receipt.providerOperation) &&
          receipt.providerOperation.state !== "pending" &&
          receipt.providerOperation.state !== "failed_retryable") {
          return {receipt: receipt as unknown as VendorSubscriptionCommandReceipt};
        }
        return {attemptCount: typeof storedCommand.attemptCount === "number" ?
          storedCommand.attemptCount : 0};
      }
      const [instituteSnapshot, subscriptionSnapshot, planSnapshot] =
        await Promise.all([
          transaction.get(instituteReference),
          transaction.get(subscriptionReference),
          command.action === "change_plan" ? transaction.get(
            firestore.doc(`${PLAN_ROOT}/${command.planVersionId}`),
          ) : Promise.resolve(null),
        ]);
      if (!instituteSnapshot.exists || !isRecord(instituteSnapshot.data())) {
        throw new Error("Institute commercial authority was not found.");
      }
      const current = subscriptionSnapshot.exists ?
        parseSubscription(subscriptionSnapshot, resolved.instituteId) : null;
      const currentRevision = current?.revision ?? 1;
      if (currentRevision !== command.expectedRevision) {
        return conflictError("Subscription changed; reload before applying this command.");
      }
      if (isRecord(current?.providerOperation) &&
        ["pending", "processing", "failed_retryable"].includes(
          current.providerOperation.state,
        )) {
        return conflictError("Subscription has an unfinished provider operation.");
      }
      if (command.action === "change_plan") {
        if (!planSnapshot?.exists || !isRecord(planSnapshot.data()) ||
          planSnapshot.get("planId") !== command.planId ||
          planSnapshot.get("status") !== "published") {
          return conflictError("Requested plan version is not published authority.");
        }
      }
      const revision = currentRevision + 1;
      const now = this.dependencies.now();
      const pendingOperation = providerOperation({
        attemptCount: 0,
        operationId: authority.operationId,
        provider: "stripe",
        state: "pending",
        updatedAt: now,
      });
      const base = current ? {
        cancelAtPeriodEnd: current.cancelAtPeriodEnd,
        currentPeriodEndsAt: current.currentPeriodEndsAt ?
          Timestamp.fromDate(new Date(current.currentPeriodEndsAt)) : null,
        currentPeriodStartsAt: current.currentPeriodStartsAt ?
          Timestamp.fromDate(new Date(current.currentPeriodStartsAt)) : null,
        planId: current.planId,
        planVersionId: current.planVersionId,
        provider: current.provider,
        status: current.status,
        trialEndsAt: current.trialEndsAt ?
          Timestamp.fromDate(new Date(current.trialEndsAt)) : null,
      } : {
        cancelAtPeriodEnd: false,
        currentPeriodEndsAt: null,
        currentPeriodStartsAt: null,
        planId: null,
        planVersionId: null,
        provider: "stripe",
        status: "not_configured",
        trialEndsAt: null,
      };
      transaction.set(subscriptionReference, {
        ...base,
        instituteId: resolved.instituteId,
        providerOperation: pendingOperation,
        revision,
        updatedAt: Timestamp.fromDate(now),
      });
      transaction.create(commandReference, {
        action: command.action,
        attemptCount: 0,
        fingerprint: authority.fingerprint,
        idempotencyKeyHash: authority.idempotencyKeyHash,
        instituteId: resolved.instituteId,
        providerOperation: pendingOperation,
        revision,
      });
      const audit = dualAuditDocument({
        action: command.action,
        actorId: resolved.actorId,
        actorRole: "vendor",
        auditEventId: authority.auditEventId,
        fingerprint: authority.fingerprint,
        idempotencyKeyHash: authority.idempotencyKeyHash,
        instituteId: resolved.instituteId,
        occurredAt: Timestamp.fromDate(now),
        summary: `Vendor reserved subscription command ${command.action}.`,
        targetId: resolved.instituteId,
      });
      transaction.create(rootAuditReference, audit);
      transaction.create(instituteAuditReference, audit);
      return {attemptCount: 0};
    });
    if ("receipt" in reservation) {
      const receipt = reservation.receipt as VendorSubscriptionCommandReceipt;
      return {...receipt, replayed: true};
    }
    const result = await this.dependencies.provider.execute({
      instituteId: resolved.instituteId,
      kind: command.action === "sync_provider" ?
        "subscription_sync" : `subscription_${command.action}` as
          Parameters<VendorCommercialProvider["execute"]>[0]["kind"],
      operationId: authority.operationId,
      payload: {...command},
    });
    return this.finalize({
      authority,
      command,
      instituteId: resolved.instituteId,
      providerResult: result,
      replayed: reservation.attemptCount > 0,
    });
  };

  private async finalize(input: {
    authority: ReturnType<typeof commandAuthority>;
    command: VendorSubscriptionCommandIntent;
    instituteId: string;
    providerResult: VendorCommercialProviderResult;
    replayed: boolean;
  }): Promise<VendorSubscriptionCommandReceipt> {
    const firestore = this.dependencies.firestore;
    const instituteReference = firestore.collection("institutes")
      .doc(input.instituteId);
    const subscriptionReference = firestore.doc(
      `${instituteReference.path}/${SUBSCRIPTION_PATH}`,
    );
    const commandReference = instituteReference.collection(COMMANDS)
      .doc(input.authority.commandId);
    return firestore.runTransaction(async (transaction) => {
      const [storedCommandSnapshot, subscriptionSnapshot] = await Promise.all([
        transaction.get(commandReference),
        transaction.get(subscriptionReference),
      ]);
      const storedCommand = assertReplayCommand(
        storedCommandSnapshot.data(),
        input.authority.fingerprint,
        input.authority.idempotencyKeyHash,
      );
      const current = parseSubscription(subscriptionSnapshot, input.instituteId);
      if (current.revision !== storedCommand.revision) {
        return conflictError("Subscription provider operation lost revision authority.");
      }
      const attemptCount = (typeof storedCommand.attemptCount === "number" ?
        storedCommand.attemptCount : 0) + 1;
      const now = this.dependencies.now();
      const operation = providerResultOperation({
        attemptCount,
        operationId: input.authority.operationId,
        provider: "stripe",
        result: input.providerResult,
        updatedAt: now,
      });
      let update: Record<string, unknown> = {
        providerOperation: operation,
        status: input.providerResult.state === "succeeded" ?
          current.status : "provider_unavailable",
        updatedAt: Timestamp.fromDate(now),
      };
      if (input.providerResult.state === "succeeded") {
        update = {...update, ...validateProjection(input.providerResult)};
      }
      const status = input.providerResult.state === "succeeded" ?
        update.status as VendorSubscriptionStatus : "provider_unavailable";
      const receipt: VendorSubscriptionCommandReceipt = {
        auditEventId: input.authority.auditEventId,
        commandId: input.authority.commandId,
        completedAt: now.toISOString(),
        propagationState: "not_required",
        providerOperation: operation,
        replayed: input.replayed,
        revision: current.revision,
        status,
      };
      transaction.update(
        subscriptionReference,
        update as FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>,
      );
      transaction.update(commandReference, {
        attemptCount,
        completedAt: Timestamp.fromDate(now),
        providerOperation: operation,
        receipt,
      });
      return receipt;
    });
  }
}

export const vendorSubscriptionsService = new VendorSubscriptionsService();
