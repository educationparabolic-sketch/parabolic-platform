/* eslint-disable max-len, require-jsdoc */
import {Timestamp} from "firebase-admin/firestore";
import type {
  VendorLicenseCatalogCommandIntent,
  VendorLicenseCatalogCommandReceipt,
  VendorLicenseCatalogResult,
  VendorLicensePlanFeatureFlags,
  VendorLicensePlanLimits,
  VendorLicensePlanVersion,
} from "../../../shared/contracts/vendorCommercial";
import type {
  VendorCommercialActorContext,
  VendorLicenseCatalogCommandRequest,
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
  normalizeMoney,
  optionalStoredString,
  positiveInteger,
  providerOperation,
  providerResultOperation,
  requiredString,
  stableSerialize,
  storedPositiveInteger,
  storedString,
  timestamp,
  UnavailableVendorCommercialProvider,
  VendorCommercialProvider,
  VendorCommercialProviderResult,
  validationError,
} from "./vendorCommercialCommon";

const CONFIG_REFERENCE = "vendorConfig/pricingPlans";
const PLANS_COLLECTION = "pricingPlans";
const COMMANDS_COLLECTION = "commands";
const ROOT_AUDITS = "vendorAuditLogs";
const MAX_PLANS = 50;

interface CatalogDependencies {
  firestore: FirebaseFirestore.Firestore;
  now: () => Date;
  provider: VendorCommercialProvider;
}

const LAYERS = ["L0", "L1", "L2", "L3"] as const;
const PLAN_STATUSES = ["draft", "published", "retired"] as const;

const actor = (request: VendorCommercialActorContext): string => {
  if (request.actorRole !== "vendor") {
    throw new Error("Vendor catalog authority is required.");
  }
  return identifier(request.actorId, "actorId");
};

const layer = (value: unknown, field: string) => {
  const normalized = requiredString(value, field, 2).toUpperCase();
  if (!LAYERS.includes(normalized as typeof LAYERS[number])) {
    return validationError(`Field "${field}" is invalid.`);
  }
  return normalized as typeof LAYERS[number];
};

const storedLayer = (value: unknown, field: string) => {
  const normalized = storedString(value, field).toUpperCase();
  if (!LAYERS.includes(normalized as typeof LAYERS[number])) {
    return authorityError(`Persisted field "${field}" is invalid.`);
  }
  return normalized as typeof LAYERS[number];
};

const limits = (value: unknown): VendorLicensePlanLimits => {
  if (!isRecord(value)) return validationError("Field \"limits\" must be an object.");
  return {
    maxAdministrators: positiveInteger(value.maxAdministrators, "limits.maxAdministrators"),
    maxStudents: positiveInteger(value.maxStudents, "limits.maxStudents"),
    maxTeachers: positiveInteger(value.maxTeachers, "limits.maxTeachers"),
  };
};

const features = (value: unknown): VendorLicensePlanFeatureFlags => {
  if (!isRecord(value)) return validationError("Field \"featureFlags\" must be an object.");
  const keys: Array<keyof VendorLicensePlanFeatureFlags> = [
    "advancedAnalytics",
    "customStrategies",
    "governanceAccess",
    "whiteLabeling",
    "yearOverYearAnalytics",
  ];
  for (const key of keys) {
    if (typeof value[key] !== "boolean") {
      return validationError(`Field "featureFlags.${key}" must be boolean.`);
    }
  }
  return Object.fromEntries(keys.map((key) => [key, value[key]])) as unknown as
    VendorLicensePlanFeatureFlags;
};

const parsePlan = (
  snapshot: FirebaseFirestore.DocumentSnapshot,
): VendorLicensePlanVersion => {
  const value = snapshot.data();
  if (!snapshot.exists || !isRecord(value)) {
    return authorityError("Catalog plan authority is unavailable.");
  }
  const status = storedString(value.status, "plan.status").toLowerCase();
  if (!PLAN_STATUSES.includes(status as typeof PLAN_STATUSES[number])) {
    return authorityError("Persisted plan status is invalid.");
  }
  const billingInterval = storedString(
    value.billingInterval,
    "plan.billingInterval",
  ).toLowerCase();
  if (billingInterval !== "month" && billingInterval !== "year") {
    return authorityError("Persisted plan billing interval is invalid.");
  }
  if (!isRecord(value.limits) || !isRecord(value.featureFlags) ||
    !isRecord(value.price)) {
    return authorityError("Persisted plan authority is incomplete.");
  }
  const parsedLimits = limits(value.limits);
  const parsedFeatures = features(value.featureFlags);
  const price = normalizeMoney(value.price, "plan.price");
  const createdAt = timestamp(value.createdAt, "plan.createdAt");
  const versionId = optionalStoredString(value.versionId, "plan.versionId") ??
    snapshot.id;
  if (versionId !== snapshot.id) {
    return authorityError("Persisted plan identity is inconsistent.");
  }
  return {
    billingInterval,
    createdAt: createdAt.toDate().toISOString(),
    featureFlags: parsedFeatures,
    layer: storedLayer(value.layer, "plan.layer"),
    limits: parsedLimits,
    planId: storedString(value.planId, "plan.planId"),
    price,
    revision: storedPositiveInteger(value.revision, "plan.revision"),
    status: status as typeof PLAN_STATUSES[number],
    versionId,
  };
};

const normalizeCommand = (
  command: VendorLicenseCatalogCommandIntent,
): VendorLicenseCatalogCommandIntent => {
  const idempotencyKey = requiredString(command.idempotencyKey, "idempotencyKey", 64);
  const expectedCatalogRevision = typeof command.expectedCatalogRevision === "number" &&
    Number.isSafeInteger(command.expectedCatalogRevision) &&
    command.expectedCatalogRevision >= 0 ? command.expectedCatalogRevision :
    validationError("Field \"expectedCatalogRevision\" must be a non-negative integer.");
  if (command.action === "publish_plan_version") {
    const billingInterval = command.billingInterval;
    if (billingInterval !== "month" && billingInterval !== "year") {
      return validationError("Field \"billingInterval\" is invalid.");
    }
    return {
      action: command.action,
      billingInterval,
      expectedCatalogRevision,
      featureFlags: features(command.featureFlags),
      idempotencyKey,
      layer: layer(command.layer, "layer"),
      limits: limits(command.limits),
      planId: identifier(command.planId, "planId"),
      price: normalizeMoney(command.price, "price"),
    };
  }
  return {
    action: "retire_plan_version",
    expectedCatalogRevision,
    expectedPlanRevision: positiveInteger(
      command.expectedPlanRevision,
      "expectedPlanRevision",
    ),
    idempotencyKey,
    planId: identifier(command.planId, "planId"),
    reason: requiredString(command.reason, "reason", 1000),
    versionId: identifier(command.versionId, "versionId"),
  };
};

export class VendorLicenseCatalogService {
  constructor(private readonly dependencies: CatalogDependencies = {
    firestore: getFirestore(),
    now: () => new Date(),
    provider: new UnavailableVendorCommercialProvider(),
  }) {}

  public getCatalog = async (
    request: VendorCommercialActorContext,
  ): Promise<VendorLicenseCatalogResult> => {
    actor(request);
    const root = this.dependencies.firestore.doc(CONFIG_REFERENCE);
    const [rootSnapshot, plansSnapshot] = await Promise.all([
      root.get(),
      root.collection(PLANS_COLLECTION).limit(MAX_PLANS + 1).get(),
    ]);
    if (plansSnapshot.size > MAX_PLANS) {
      return authorityError("Commercial catalog exceeds the supported bound.");
    }
    const revision = rootSnapshot.exists ? storedPositiveInteger(
      rootSnapshot.get("catalogRevision"),
      "catalog.catalogRevision",
    ) : 0;
    return {
      catalogRevision: revision,
      plans: plansSnapshot.docs.map(parsePlan).sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt)),
    };
  };

  public commandCatalog = async (
    request: VendorLicenseCatalogCommandRequest,
  ): Promise<VendorLicenseCatalogCommandReceipt> => {
    const actorId = actor(request);
    const command = normalizeCommand(request.command);
    const authority = commandAuthority({
      actorId,
      idempotencyKey: command.idempotencyKey,
      intent: command,
      prefix: "vendor_catalog",
      scope: "global_catalog",
    });
    const firestore = this.dependencies.firestore;
    const root = firestore.doc(CONFIG_REFERENCE);
    const commandReference = root.collection(COMMANDS_COLLECTION)
      .doc(authority.commandId);
    const auditReference = firestore.collection(ROOT_AUDITS)
      .doc(authority.auditEventId);
    const reservation = await firestore.runTransaction(async (transaction) => {
      const storedCommand = await transaction.get(commandReference);
      if (storedCommand.exists) {
        const value = assertReplayCommand(
          storedCommand.data(),
          authority.fingerprint,
          authority.idempotencyKeyHash,
        );
        if (isRecord(value.receipt) &&
          isRecord(value.receipt.providerOperation) &&
          value.receipt.providerOperation.state !== "failed_retryable" &&
          value.receipt.providerOperation.state !== "pending") {
          return {receipt: value.receipt as unknown as VendorLicenseCatalogCommandReceipt};
        }
        return {
          attemptCount: typeof value.attemptCount === "number" ? value.attemptCount : 0,
          planId: storedString(value.planDocumentId, "catalogCommand.planDocumentId"),
        };
      }
      const rootSnapshot = await transaction.get(root);
      const currentRevision = rootSnapshot.exists ? storedPositiveInteger(
        rootSnapshot.get("catalogRevision"),
        "catalog.catalogRevision",
      ) : 0;
      if (currentRevision !== command.expectedCatalogRevision) {
        return conflictError("Catalog changed; reload before applying this command.");
      }
      const nextCatalogRevision = currentRevision + 1;
      let planDocumentId: string;
      let nextPlan: VendorLicensePlanVersion;
      if (command.action === "publish_plan_version") {
        planDocumentId = `${command.planId}-v${nextCatalogRevision}`;
        const planReference = root.collection(PLANS_COLLECTION).doc(planDocumentId);
        if ((await transaction.get(planReference)).exists) {
          return conflictError("The catalog plan version already exists.");
        }
        const now = Timestamp.fromDate(this.dependencies.now());
        nextPlan = {
          billingInterval: command.billingInterval,
          createdAt: now.toDate().toISOString(),
          featureFlags: command.featureFlags,
          layer: command.layer,
          limits: command.limits,
          planId: command.planId,
          price: command.price,
          revision: 1,
          status: "draft",
          versionId: planDocumentId,
        };
        transaction.create(planReference, {
          ...nextPlan,
          createdAt: now,
          providerOperation: providerOperation({
            attemptCount: 0,
            operationId: authority.operationId,
            provider: "stripe",
            state: "pending",
            updatedAt: now.toDate(),
          }),
        });
      } else {
        planDocumentId = command.versionId;
        const planReference = root.collection(PLANS_COLLECTION).doc(planDocumentId);
        const planSnapshot = await transaction.get(planReference);
        const plan = parsePlan(planSnapshot);
        if (plan.planId !== command.planId ||
          plan.revision !== command.expectedPlanRevision ||
          plan.status !== "published") {
          return conflictError("Plan version changed or is not published.");
        }
        nextPlan = {...plan};
        transaction.update(planReference, {
          providerOperation: providerOperation({
            attemptCount: 0,
            operationId: authority.operationId,
            provider: "stripe",
            state: "pending",
            updatedAt: this.dependencies.now(),
          }),
        });
      }
      const now = Timestamp.fromDate(this.dependencies.now());
      transaction.set(root, {
        catalogRevision: nextCatalogRevision,
        updatedAt: now,
      }, {merge: true});
      transaction.create(commandReference, {
        action: command.action,
        attemptCount: 0,
        catalogRevision: nextCatalogRevision,
        fingerprint: authority.fingerprint,
        idempotencyKeyHash: authority.idempotencyKeyHash,
        planDocumentId,
        providerOperation: providerOperation({
          attemptCount: 0,
          operationId: authority.operationId,
          provider: "stripe",
          state: "pending",
          updatedAt: now.toDate(),
        }),
      });
      transaction.create(auditReference, dualAuditDocument({
        action: command.action,
        actorId,
        actorRole: "vendor",
        auditEventId: authority.auditEventId,
        fingerprint: authority.fingerprint,
        idempotencyKeyHash: authority.idempotencyKeyHash,
        occurredAt: now,
        summary: `Vendor reserved catalog command ${command.action}.`,
        targetId: planDocumentId,
      }));
      return {attemptCount: 0, planId: planDocumentId, reservedPlan: nextPlan};
    });
    if ("receipt" in reservation) {
      const receipt = reservation.receipt as VendorLicenseCatalogCommandReceipt;
      return {...receipt, replayed: true};
    }
    const result = await this.dependencies.provider.execute({
      kind: command.action === "publish_plan_version" ?
        "catalog_publish" : "catalog_retire",
      operationId: authority.operationId,
      payload: JSON.parse(stableSerialize(command)) as Record<string, unknown>,
    });
    return this.finalizeCommand({
      authority,
      command,
      planDocumentId: reservation.planId,
      providerResult: result,
      replayed: reservation.attemptCount > 0,
    });
  };

  private async finalizeCommand(input: {
    authority: ReturnType<typeof commandAuthority>;
    command: VendorLicenseCatalogCommandIntent;
    planDocumentId: string;
    providerResult: VendorCommercialProviderResult;
    replayed: boolean;
  }): Promise<VendorLicenseCatalogCommandReceipt> {
    const firestore = this.dependencies.firestore;
    const root = firestore.doc(CONFIG_REFERENCE);
    const commandReference = root.collection(COMMANDS_COLLECTION)
      .doc(input.authority.commandId);
    const planReference = root.collection(PLANS_COLLECTION)
      .doc(input.planDocumentId);
    return firestore.runTransaction(async (transaction) => {
      const [commandSnapshot, planSnapshot, rootSnapshot] = await Promise.all([
        transaction.get(commandReference),
        transaction.get(planReference),
        transaction.get(root),
      ]);
      const storedCommand = assertReplayCommand(
        commandSnapshot.data(),
        input.authority.fingerprint,
        input.authority.idempotencyKeyHash,
      );
      const plan = parsePlan(planSnapshot);
      const catalogRevision = storedPositiveInteger(
        rootSnapshot.get("catalogRevision"),
        "catalog.catalogRevision",
      );
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
      let nextPlan = plan;
      if (input.providerResult.state === "succeeded") {
        nextPlan = {
          ...plan,
          revision: input.command.action === "retire_plan_version" ?
            plan.revision + 1 : plan.revision,
          status: input.command.action === "retire_plan_version" ?
            "retired" : "published",
        };
      }
      const receipt: VendorLicenseCatalogCommandReceipt = {
        auditEventId: input.authority.auditEventId,
        catalogRevision,
        commandId: input.authority.commandId,
        completedAt: now.toISOString(),
        plan: nextPlan,
        providerOperation: operation,
        replayed: input.replayed,
      };
      transaction.update(planReference, {
        providerOperation: operation,
        providerPriceReference: input.providerResult.externalReference ?? null,
        revision: nextPlan.revision,
        status: nextPlan.status,
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
  }
}

export const vendorLicenseCatalogService = new VendorLicenseCatalogService();
