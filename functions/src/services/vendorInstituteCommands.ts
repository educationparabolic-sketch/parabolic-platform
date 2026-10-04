/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
import {createHash} from "node:crypto";
import {FieldValue, Timestamp} from "firebase-admin/firestore";
import type {
  VendorInstituteAccessStatus,
  VendorInstituteCreateReceipt,
  VendorInstituteDeletionSummary,
  VendorInstituteDetail,
  VendorInstituteLifecycleIntent,
  VendorInstituteLifecycleState,
  VendorInstituteMutationReceipt,
  VendorInstituteProfileUpdateIntent,
} from "../../../shared/contracts/vendorInstitutes";
import type {ClaimPropagationPublicReceipt} from "../../../shared/contracts/claimPropagation";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  buildClaimPropagationDesiredAuthority,
  ClaimPropagationCoordinator,
  nextClaimAuthorizationVersion,
} from "./claimPropagation";
import {
  VendorInstituteCreateValidatedRequest,
  VendorInstituteLifecycleValidatedRequest,
  VendorInstituteProfileUpdateValidatedRequest,
  VendorInstituteValidationError,
} from "../types/vendorInstitutes";

const INSTITUTES_COLLECTION = "institutes";
const ONBOARDING_COLLECTION = "vendorOnboarding";
const ROOT_COMMANDS_COLLECTION = "vendorInstituteCommands";
const INSTITUTE_COMMANDS_COLLECTION = "vendorCommands";
const ROOT_AUDIT_COLLECTION = "vendorAuditLogs";
const INSTITUTE_AUDIT_COLLECTION = "auditLogs";
const ONBOARDING_EVENTS_COLLECTION = "events";
const RETENTION_PERIOD_MILLIS = 30 * 24 * 60 * 60 * 1000;
const MAX_IDENTIFIER_LENGTH = 128;
const MAX_REGISTERED_NAME_LENGTH = 160;
const MAX_VENDOR_REFERENCE_LENGTH = 256;
const MAX_REASON_LENGTH = 1000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

interface VendorInstituteCommandDependencies {
  firestore: FirebaseFirestore.Firestore;
  now: () => Date;
}

interface VendorCommandInputContext {
  actorId?: unknown;
  actorRole?: unknown;
  ipAddress?: string;
  userAgent?: string;
}

interface VendorInstituteCreateInput extends VendorCommandInputContext {
  expectedOnboardingRevision?: unknown;
  idempotencyKey?: unknown;
  onboardingId?: unknown;
}

interface VendorInstituteProfileUpdateInput extends VendorCommandInputContext {
  expectedRevision?: unknown;
  idempotencyKey?: unknown;
  instituteId?: unknown;
  profile?: unknown;
}

interface VendorInstituteLifecycleInput extends VendorCommandInputContext {
  action?: unknown;
  confirmInstituteId?: unknown;
  expectedRevision?: unknown;
  idempotencyKey?: unknown;
  instituteId?: unknown;
  reason?: unknown;
}

interface CommandAuthority {
  auditEventId: string;
  commandId: string;
  fingerprint: string;
  idempotencyKeyHash: string;
}

interface StoredDeletionAuthority {
  attempt: number;
  checkpoint: string;
  eligibleAt: Timestamp;
  lastErrorCode: string | null;
  operationId: string;
  scheduledAt: Timestamp;
  stage: "scheduled" | "quiescing" | "purging" | "failed" | "purged";
}

interface StoredInstituteAuthority {
  accessStatus: VendorInstituteAccessStatus;
  deletion: StoredDeletionAuthority | null;
  lifecycleState: VendorInstituteLifecycleState;
  revision: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const validationError = (message: string): never => {
  throw new VendorInstituteValidationError("VALIDATION_ERROR", message);
};

const authorityError = (message: string): never => {
  throw new VendorInstituteValidationError("INTERNAL_ERROR", message);
};

const conflictError = (message: string): never => {
  throw new VendorInstituteValidationError("CONFLICT", message);
};

const requiredString = (
  value: unknown,
  field: string,
  maximumLength = 256,
): string => {
  if (typeof value !== "string" || !value.trim()) {
    return validationError(`Field "${field}" must be a non-empty string.`);
  }
  const normalized = value.trim();
  if (normalized.length > maximumLength) {
    return validationError(
      `Field "${field}" must be at most ${maximumLength} characters.`,
    );
  }
  return normalized;
};

const optionalCommandString = (
  value: unknown,
  field: string,
  maximumLength: number,
): string | null => {
  if (value === null) return null;
  return requiredString(value, field, maximumLength);
};

const nonNegativeInteger = (value: unknown, field: string): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    return validationError(`Field "${field}" must be a non-negative integer.`);
  }
  return value;
};

const positiveStoredInteger = (value: unknown, field: string): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    return authorityError(`Persisted field "${field}" is invalid.`);
  }
  return value;
};

const nonNegativeStoredInteger = (value: unknown, field: string): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    return authorityError(`Persisted field "${field}" is invalid.`);
  }
  return value;
};

const storedString = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !value.trim()) {
    return authorityError(`Persisted field "${field}" is invalid.`);
  }
  return value.trim();
};

const storedTimestamp = (value: unknown, field: string): Timestamp => {
  if (!(value instanceof Timestamp)) {
    return authorityError(`Persisted field "${field}" is not a timestamp.`);
  }
  return value;
};

const normalizeIdempotencyKey = (value: unknown): string => {
  const normalized = requiredString(value, "idempotencyKey", 64).toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    return validationError("Field \"idempotencyKey\" must be a UUID.");
  }
  return normalized;
};

const requireVendorContext = (input: VendorCommandInputContext) => {
  const actorId = requiredString(input.actorId, "actorId", MAX_IDENTIFIER_LENGTH);
  const actorRole = requiredString(input.actorRole, "actorRole", 32).toLowerCase();
  if (actorRole !== "vendor") {
    throw new VendorInstituteValidationError(
      "FORBIDDEN",
      "Vendor institute commands require current Vendor authority.",
    );
  }
  return {
    actorId,
    actorRole: "vendor" as const,
    ...(input.ipAddress ? {ipAddress: input.ipAddress} : {}),
    ...(input.userAgent ? {userAgent: input.userAgent} : {}),
  };
};

const stableSerialize = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const commandAuthority = (
  scope: string,
  actorId: string,
  idempotencyKey: string,
  fingerprintValue: unknown,
): CommandAuthority => {
  const idempotencyKeyHash = sha256(`${actorId}:${scope}:${idempotencyKey}`);
  const suffix = idempotencyKeyHash.slice(0, 40);
  return {
    auditEventId: `vendor_institute_audit_${suffix}`,
    commandId: `vendor_institute_command_${suffix}`,
    fingerprint: sha256(stableSerialize(fingerprintValue)),
    idempotencyKeyHash,
  };
};

const serverTimestamp = (now: () => Date): {date: Date; timestamp: Timestamp} => {
  const date = now();
  if (Number.isNaN(date.getTime())) {
    return authorityError("Vendor institute command server time is invalid.");
  }
  return {date, timestamp: Timestamp.fromDate(date)};
};

const searchFilterKeys = (registeredName: string): string[] => {
  const normalized = registeredName.toLowerCase().replace(/\s+/gu, " ").trim();
  const values = new Set<string>([`query=${normalized}`]);
  const addPrefixes = (value: string): void => {
    for (let length = 1; length <= Math.min(value.length, 40); length += 1) {
      values.add(`query=${value.slice(0, length)}`);
    }
  };
  addPrefixes(normalized);
  normalized.split(" ").filter(Boolean).forEach(addPrefixes);
  return [...values].slice(0, 100);
};

const deletionSummary = (
  deletion: StoredDeletionAuthority | null,
): VendorInstituteDeletionSummary => deletion ? {
  eligibleAt: deletion.eligibleAt.toDate().toISOString(),
  lastErrorCode: deletion.lastErrorCode,
  operationId: deletion.operationId,
  scheduledAt: deletion.scheduledAt.toDate().toISOString(),
  stage: deletion.stage,
} : {
  eligibleAt: null,
  lastErrorCode: null,
  operationId: null,
  scheduledAt: null,
  stage: "none",
};

const storedDeletionAuthority = (value: unknown): StoredDeletionAuthority | null => {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) {
    return authorityError("Persisted institute deletion authority is invalid.");
  }
  const stage = storedString(value.stage, "deletionOperation.stage");
  if (!["scheduled", "quiescing", "purging", "failed", "purged"].includes(stage)) {
    return authorityError("Persisted institute deletion stage is invalid.");
  }
  const lastErrorCode = value.lastErrorCode === undefined || value.lastErrorCode === null ?
    null : storedString(value.lastErrorCode, "deletionOperation.lastErrorCode");
  return {
    attempt: nonNegativeStoredInteger(value.attempt ?? 0, "deletionOperation.attempt"),
    checkpoint: storedString(value.checkpoint ?? "scheduled", "deletionOperation.checkpoint"),
    eligibleAt: storedTimestamp(value.eligibleAt, "deletionOperation.eligibleAt"),
    lastErrorCode,
    operationId: storedString(value.operationId, "deletionOperation.operationId"),
    scheduledAt: storedTimestamp(value.scheduledAt, "deletionOperation.scheduledAt"),
    stage: stage as StoredDeletionAuthority["stage"],
  };
};

const storedInstituteAuthority = (
  snapshot: FirebaseFirestore.DocumentSnapshot,
  instituteId: string,
): StoredInstituteAuthority => {
  if (!snapshot.exists || !isRecord(snapshot.data())) {
    throw new VendorInstituteValidationError(
      "NOT_FOUND",
      "Vendor institute was not found.",
    );
  }
  const value = snapshot.data() as Record<string, unknown>;
  if (storedString(value.instituteId, "instituteId") !== instituteId) {
    return authorityError("Persisted institute identity conflicts with its path.");
  }
  const lifecycleState = storedString(
    value.vendorLifecycleState,
    "vendorLifecycleState",
  ) as VendorInstituteLifecycleState;
  const lifecycleStates: readonly VendorInstituteLifecycleState[] = [
    "onboarding",
    "active",
    "suspended",
    "archived",
    "deletion_scheduled",
    "purging",
    "purged",
    "recovery_required",
  ];
  if (!lifecycleStates.includes(lifecycleState)) {
    return authorityError("Persisted Vendor institute lifecycle state is invalid.");
  }
  if (value.status !== "active" && value.status !== "suspended") {
    return authorityError("Persisted institute access status is invalid.");
  }
  const accessStatus = value.status;
  const expectedAccessStatus = lifecycleState === "active" ? "active" : "suspended";
  if (accessStatus !== expectedAccessStatus) {
    return authorityError("Institute access status conflicts with lifecycle authority.");
  }
  const deletion = storedDeletionAuthority(value.deletionOperation);
  if (lifecycleState === "deletion_scheduled" && deletion?.stage !== "scheduled") {
    return authorityError("Scheduled deletion lifecycle lacks scheduled operation authority.");
  }
  if (lifecycleState === "purging" &&
    deletion?.stage !== "quiescing" && deletion?.stage !== "purging") {
    return authorityError("Purging lifecycle lacks resumable deletion authority.");
  }
  if (lifecycleState === "recovery_required" && deletion?.stage !== "failed") {
    return authorityError("Recovery lifecycle lacks failed deletion authority.");
  }
  return {
    accessStatus,
    deletion,
    lifecycleState,
    revision: positiveStoredInteger(value.instituteRevision, "instituteRevision"),
  };
};

const assertCommandReplay = (
  value: unknown,
  authority: CommandAuthority,
  action: string,
): Record<string, unknown> => {
  if (!isRecord(value) ||
    value.action !== action ||
    value.auditEventId !== authority.auditEventId ||
    value.commandId !== authority.commandId ||
    value.fingerprint !== authority.fingerprint ||
    value.idempotencyKeyHash !== authority.idempotencyKeyHash) {
    return conflictError(
      "Idempotency key was already used for a different Vendor institute intent.",
    );
  }
  if (!isRecord(value.receipt) ||
    typeof value.receiptHash !== "string" ||
    sha256(stableSerialize(value.receipt)) !== value.receiptHash) {
    return authorityError("Persisted Vendor institute command receipt is invalid.");
  }
  return value.receipt;
};

const assertReplayAudits = (
  snapshots: readonly FirebaseFirestore.DocumentSnapshot[],
  authority: CommandAuthority,
): void => {
  for (const snapshot of snapshots) {
    if (!snapshot.exists || !isRecord(snapshot.data())) {
      return authorityError("Persisted Vendor institute replay audit is unavailable.");
    }
    const value = snapshot.data() as Record<string, unknown>;
    if (value.auditEventId !== authority.auditEventId ||
      value.fingerprint !== authority.fingerprint ||
      value.idempotencyKeyHash !== authority.idempotencyKeyHash) {
      return authorityError("Persisted Vendor institute replay audit is invalid.");
    }
  }
};

const replayCreateReceipt = (
  value: Record<string, unknown>,
  authority: CommandAuthority,
): VendorInstituteCreateReceipt => {
  if (value.auditEventId !== authority.auditEventId ||
    value.commandId !== authority.commandId ||
    typeof value.completedAt !== "string" ||
    !isRecord(value.institute)) {
    return authorityError("Persisted institute-creation receipt is invalid.");
  }
  return {
    ...(value as unknown as VendorInstituteCreateReceipt),
    replayed: true,
  };
};

const replayMutationReceipt = (
  value: Record<string, unknown>,
  authority: CommandAuthority,
  instituteId: string,
): VendorInstituteMutationReceipt => {
  if (value.auditEventId !== authority.auditEventId ||
    value.commandId !== authority.commandId ||
    value.instituteId !== instituteId ||
    typeof value.completedAt !== "string" ||
    !isRecord(value.deletion)) {
    return authorityError("Persisted institute-mutation receipt is invalid.");
  }
  return {
    ...(value as unknown as VendorInstituteMutationReceipt),
    replayed: true,
  };
};

const commonAudit = (
  request: {actorId: string; actorRole: "vendor"; ipAddress?: string; userAgent?: string},
  authority: CommandAuthority,
  instituteId: string,
  action: string,
  occurredAt: Timestamp,
  summary: string,
): Record<string, unknown> => ({
  action,
  actorRole: request.actorRole,
  actorUserId: request.actorId,
  auditEventId: authority.auditEventId,
  fingerprint: authority.fingerprint,
  idempotencyKeyHash: authority.idempotencyKeyHash,
  instituteId,
  ipAddressHash: request.ipAddress ? sha256(request.ipAddress) : null,
  occurredAt,
  summary,
  userAgentHash: request.userAgent ? sha256(request.userAgent) : null,
});

const mutationReceipt = (
  authority: CommandAuthority,
  completedAt: Date,
  instituteId: string,
  lifecycleState: VendorInstituteLifecycleState,
  revision: number,
  deletion: StoredDeletionAuthority | null,
  propagation: ClaimPropagationPublicReceipt,
): VendorInstituteMutationReceipt => ({
  auditEventId: authority.auditEventId,
  commandId: authority.commandId,
  completedAt: completedAt.toISOString(),
  deletion: deletionSummary(deletion),
  instituteId,
  lifecycleState,
  propagation,
  propagationState: propagation.state,
  replayed: false,
  revision,
});

const instituteDetailAtCreation = (
  instituteId: string,
  registeredName: string,
  createdAt: Date,
): VendorInstituteDetail => ({
  accessStatus: "suspended",
  administrators: [],
  aggregate: {
    activeStudentCount: null,
    aggregateAsOf: null,
    lastActiveAt: null,
    monthlyTestRuns: null,
  },
  commercial: {
    authorityState: "not_configured",
    licenseLayer: null,
    licenseState: null,
    licenseVersion: null,
    planId: null,
  },
  createdAt: createdAt.toISOString(),
  deletion: deletionSummary(null),
  instituteId,
  lifecycleState: "onboarding",
  primaryAdministrator: null,
  profile: {registeredName, vendorAccountReference: null},
  registeredName,
  revision: 1,
  settingsRevision: 0,
  updatedAt: createdAt.toISOString(),
});

export class VendorInstituteCommandsService {
  private readonly propagationCoordinator: ClaimPropagationCoordinator;

  constructor(
    private readonly dependencies: VendorInstituteCommandDependencies = {
      firestore: getFirestore(),
      now: () => new Date(),
    },
  ) {
    this.propagationCoordinator = new ClaimPropagationCoordinator(dependencies);
  }

  public normalizeCreateRequest(
    input: VendorInstituteCreateInput,
  ): VendorInstituteCreateValidatedRequest {
    return {
      ...requireVendorContext(input),
      expectedOnboardingRevision: nonNegativeInteger(
        input.expectedOnboardingRevision,
        "expectedOnboardingRevision",
      ),
      idempotencyKey: normalizeIdempotencyKey(input.idempotencyKey),
      onboardingId: requiredString(
        input.onboardingId,
        "onboardingId",
        MAX_IDENTIFIER_LENGTH,
      ),
    };
  }

  public normalizeProfileUpdateRequest(
    input: VendorInstituteProfileUpdateInput,
  ): VendorInstituteProfileUpdateValidatedRequest {
    const context = requireVendorContext(input);
    if (!isRecord(input.profile)) {
      return validationError("Field \"profile\" must be an object.");
    }
    const profile: VendorInstituteProfileUpdateIntent["profile"] = {};
    if (Object.prototype.hasOwnProperty.call(input.profile, "registeredName")) {
      profile.registeredName = requiredString(
        input.profile.registeredName,
        "profile.registeredName",
        MAX_REGISTERED_NAME_LENGTH,
      );
    }
    if (Object.prototype.hasOwnProperty.call(input.profile, "vendorAccountReference")) {
      profile.vendorAccountReference = optionalCommandString(
        input.profile.vendorAccountReference,
        "profile.vendorAccountReference",
        MAX_VENDOR_REFERENCE_LENGTH,
      );
    }
    if (Object.keys(profile).length === 0) {
      return validationError("Field \"profile\" must include an owned profile field.");
    }
    return {
      ...context,
      command: {
        expectedRevision: nonNegativeInteger(input.expectedRevision, "expectedRevision"),
        idempotencyKey: normalizeIdempotencyKey(input.idempotencyKey),
        profile,
      },
      instituteId: requiredString(
        input.instituteId,
        "instituteId",
        MAX_IDENTIFIER_LENGTH,
      ),
    };
  }

  public normalizeLifecycleRequest(
    input: VendorInstituteLifecycleInput,
  ): VendorInstituteLifecycleValidatedRequest {
    const context = requireVendorContext(input);
    const action = requiredString(input.action, "action", 40);
    const metadata = {
      expectedRevision: nonNegativeInteger(input.expectedRevision, "expectedRevision"),
      idempotencyKey: normalizeIdempotencyKey(input.idempotencyKey),
    };
    let command: VendorInstituteLifecycleIntent;
    if (action === "suspend" || action === "restore" || action === "archive" ||
      action === "cancel_deletion") {
      command = {
        action,
        ...metadata,
        reason: requiredString(input.reason, "reason", MAX_REASON_LENGTH),
      };
    } else if (action === "schedule_deletion") {
      command = {
        action,
        ...metadata,
        confirmInstituteId: requiredString(
          input.confirmInstituteId,
          "confirmInstituteId",
          MAX_IDENTIFIER_LENGTH,
        ),
        reason: requiredString(input.reason, "reason", MAX_REASON_LENGTH),
      };
    } else if (action === "execute_purge" || action === "retry_purge") {
      command = {
        action,
        ...metadata,
        confirmInstituteId: requiredString(
          input.confirmInstituteId,
          "confirmInstituteId",
          MAX_IDENTIFIER_LENGTH,
        ),
      };
    } else {
      return validationError("Field \"action\" is not a supported lifecycle command.");
    }
    return {
      ...context,
      command,
      instituteId: requiredString(
        input.instituteId,
        "instituteId",
        MAX_IDENTIFIER_LENGTH,
      ),
    };
  }

  public async createInstitute(
    rawRequest: VendorInstituteCreateValidatedRequest,
  ): Promise<VendorInstituteCreateReceipt> {
    const request = this.normalizeCreateRequest(rawRequest);
    const firestore = this.dependencies.firestore;
    const {date: completedAt, timestamp} = serverTimestamp(this.dependencies.now);
    const authority = commandAuthority(
      `create:${request.onboardingId}`,
      request.actorId,
      request.idempotencyKey,
      {
        actorId: request.actorId,
        expectedOnboardingRevision: request.expectedOnboardingRevision,
        onboardingId: request.onboardingId,
      },
    );
    const instituteId = `inst_${sha256(request.onboardingId).slice(0, 24)}`;
    const onboardingReference = firestore.collection(ONBOARDING_COLLECTION)
      .doc(request.onboardingId);
    const commandReference = firestore.collection(ROOT_COMMANDS_COLLECTION)
      .doc(authority.commandId);
    const instituteReference = firestore.collection(INSTITUTES_COLLECTION)
      .doc(instituteId);
    const auditReference = firestore.collection(ROOT_AUDIT_COLLECTION)
      .doc(authority.auditEventId);
    const instituteAuditReference = instituteReference
      .collection(INSTITUTE_AUDIT_COLLECTION).doc(authority.auditEventId);
    const onboardingEventReference = onboardingReference
      .collection(ONBOARDING_EVENTS_COLLECTION)
      .doc(`institute_created_${authority.commandId.slice(-20)}`);

    return firestore.runTransaction(async (transaction) => {
      const commandSnapshot = await transaction.get(commandReference);
      if (commandSnapshot.exists) {
        const receipt = assertCommandReplay(
          commandSnapshot.data(),
          authority,
          "create_institute",
        );
        assertReplayAudits(await Promise.all([
          transaction.get(auditReference),
          transaction.get(instituteAuditReference),
        ]), authority);
        return replayCreateReceipt(receipt, authority);
      }
      const [onboardingSnapshot, instituteSnapshot] = await Promise.all([
        transaction.get(onboardingReference),
        transaction.get(instituteReference),
      ]);
      if (!onboardingSnapshot.exists || !isRecord(onboardingSnapshot.data())) {
        throw new VendorInstituteValidationError(
          "NOT_FOUND",
          "Approved Vendor onboarding authority was not found.",
        );
      }
      const onboarding = onboardingSnapshot.data() as Record<string, unknown>;
      const revision = positiveStoredInteger(
        onboarding.revision,
        "vendorOnboarding.revision",
      );
      if (revision !== request.expectedOnboardingRevision) {
        return conflictError(
          "Onboarding revision changed; reload before creating the institute.",
        );
      }
      if (onboarding.status !== "approved") {
        return conflictError("Only approved onboarding authority can create an institute.");
      }
      if (onboarding.instituteId !== null && onboarding.instituteId !== undefined) {
        return conflictError("Onboarding authority is already linked to an institute.");
      }
      if (instituteSnapshot.exists) {
        return conflictError("The deterministic institute authority already exists.");
      }
      if (!isRecord(onboarding.application)) {
        return authorityError("Approved onboarding application authority is invalid.");
      }
      const registeredName = storedString(
        onboarding.application.registeredName,
        "vendorOnboarding.application.registeredName",
      );
      if (registeredName.length > MAX_REGISTERED_NAME_LENGTH) {
        return authorityError("Approved onboarding registered name exceeds its bound.");
      }
      const nextOnboardingRevision = revision + 1;
      const detail = instituteDetailAtCreation(
        instituteId,
        registeredName,
        completedAt,
      );
      const receipt: VendorInstituteCreateReceipt = {
        auditEventId: authority.auditEventId,
        commandId: authority.commandId,
        completedAt: completedAt.toISOString(),
        institute: detail,
        replayed: false,
      };
      const audit = {
        ...commonAudit(
          request,
          authority,
          instituteId,
          "CREATE_INSTITUTE",
          timestamp,
          "Vendor created institute authority from approved onboarding.",
        ),
        onboardingId: request.onboardingId,
        onboardingRevision: nextOnboardingRevision,
        resultingInstituteRevision: 1,
      };
      transaction.create(instituteReference, {
        createdAt: timestamp,
        instituteId,
        instituteRevision: 1,
        primaryAdminUserId: null,
        registeredName,
        settingsRevision: 0,
        settingsUsers: {},
        status: "suspended",
        updatedAt: timestamp,
        vendorAccountReference: null,
        vendorFilterKeys: searchFilterKeys(registeredName),
        vendorLifecycleState: "onboarding",
        vendorSummary: null,
      });
      transaction.update(onboardingReference, {
        instituteId,
        revision: nextOnboardingRevision,
        status: "institute_provisioned",
        updatedAt: timestamp,
      });
      transaction.create(onboardingEventReference, {
        actorUserId: request.actorId,
        eventId: onboardingEventReference.id,
        occurredAt: timestamp,
        revision: nextOnboardingRevision,
        summary: "Approved onboarding provisioned institute authority.",
        type: "institute_created",
      });
      transaction.create(auditReference, audit);
      transaction.create(instituteAuditReference, audit);
      transaction.create(commandReference, {
        action: "create_institute",
        auditEventId: authority.auditEventId,
        commandId: authority.commandId,
        completedAt: timestamp,
        fingerprint: authority.fingerprint,
        idempotencyKeyHash: authority.idempotencyKeyHash,
        instituteId,
        onboardingId: request.onboardingId,
        receipt,
        receiptHash: sha256(stableSerialize(receipt)),
      });
      return receipt;
    });
  }

  public async updateProfile(
    rawRequest: VendorInstituteProfileUpdateValidatedRequest,
  ): Promise<VendorInstituteMutationReceipt> {
    const request = this.normalizeProfileUpdateRequest({
      ...rawRequest,
      ...rawRequest.command,
    });
    const action = "update_profile";
    const authority = commandAuthority(
      `${action}:${request.instituteId}`,
      request.actorId,
      request.command.idempotencyKey,
      {
        action,
        actorId: request.actorId,
        expectedRevision: request.command.expectedRevision,
        instituteId: request.instituteId,
        profile: request.command.profile,
      },
    );
    const {date: completedAt, timestamp} = serverTimestamp(this.dependencies.now);
    const instituteReference = this.dependencies.firestore
      .collection(INSTITUTES_COLLECTION).doc(request.instituteId);
    const commandReference = instituteReference.collection(INSTITUTE_COMMANDS_COLLECTION)
      .doc(authority.commandId);
    const rootAuditReference = this.dependencies.firestore
      .collection(ROOT_AUDIT_COLLECTION).doc(authority.auditEventId);
    const instituteAuditReference = instituteReference
      .collection(INSTITUTE_AUDIT_COLLECTION).doc(authority.auditEventId);

    return this.dependencies.firestore.runTransaction(async (transaction) => {
      const commandSnapshot = await transaction.get(commandReference);
      if (commandSnapshot.exists) {
        const receipt = assertCommandReplay(
          commandSnapshot.data(),
          authority,
          action,
        );
        assertReplayAudits(await Promise.all([
          transaction.get(rootAuditReference),
          transaction.get(instituteAuditReference),
        ]), authority);
        return replayMutationReceipt(receipt, authority, request.instituteId);
      }
      const instituteSnapshot = await transaction.get(instituteReference);
      const current = storedInstituteAuthority(instituteSnapshot, request.instituteId);
      if (current.revision !== request.command.expectedRevision) {
        return conflictError("Institute revision changed; reload before updating the profile.");
      }
      if (current.lifecycleState === "purged" || current.lifecycleState === "purging") {
        return conflictError("Institute profile cannot change during or after purge.");
      }
      const nextRevision = current.revision + 1;
      const update: Record<string, unknown> = {
        instituteRevision: nextRevision,
        updatedAt: timestamp,
      };
      if (request.command.profile.registeredName !== undefined) {
        update.registeredName = request.command.profile.registeredName;
        update.vendorFilterKeys = searchFilterKeys(
          request.command.profile.registeredName,
        );
      }
      if (request.command.profile.vendorAccountReference !== undefined) {
        update.vendorAccountReference = request.command.profile.vendorAccountReference;
      }
      const receipt = mutationReceipt(
        authority,
        completedAt,
        request.instituteId,
        current.lifecycleState,
        nextRevision,
        current.deletion,
        {
          authorizationVersion: 0,
          browserDeadlineAt: null,
          operationId: null,
          serverDeadlineAt: null,
          state: "not_required",
        },
      );
      const audit = {
        ...commonAudit(
          request,
          authority,
          request.instituteId,
          "UPDATE_INSTITUTE_PROFILE",
          timestamp,
          "Vendor updated Vendor-owned institute profile authority.",
        ),
        expectedRevision: current.revision,
        resultingRevision: nextRevision,
        updatedFields: Object.keys(request.command.profile).sort(),
      };
      transaction.update(instituteReference, update);
      transaction.create(rootAuditReference, audit);
      transaction.create(instituteAuditReference, audit);
      transaction.create(commandReference, {
        action,
        auditEventId: authority.auditEventId,
        commandId: authority.commandId,
        completedAt: timestamp,
        fingerprint: authority.fingerprint,
        idempotencyKeyHash: authority.idempotencyKeyHash,
        receipt,
        receiptHash: sha256(stableSerialize(receipt)),
      });
      return receipt;
    });
  }

  public async transitionLifecycle(
    rawRequest: VendorInstituteLifecycleValidatedRequest,
  ): Promise<VendorInstituteMutationReceipt> {
    const request = this.normalizeLifecycleRequest({
      ...rawRequest,
      ...rawRequest.command,
    });
    const action = request.command.action;
    const authority = commandAuthority(
      `${action}:${request.instituteId}`,
      request.actorId,
      request.command.idempotencyKey,
      {
        action,
        actorId: request.actorId,
        command: request.command,
        instituteId: request.instituteId,
      },
    );
    const {date: completedAt, timestamp} = serverTimestamp(this.dependencies.now);
    const instituteReference = this.dependencies.firestore
      .collection(INSTITUTES_COLLECTION).doc(request.instituteId);
    const licenseReference = instituteReference.collection("license").doc("current");
    const commandReference = instituteReference.collection(INSTITUTE_COMMANDS_COLLECTION)
      .doc(authority.commandId);
    const rootAuditReference = this.dependencies.firestore
      .collection(ROOT_AUDIT_COLLECTION).doc(authority.auditEventId);
    const instituteAuditReference = instituteReference
      .collection(INSTITUTE_AUDIT_COLLECTION).doc(authority.auditEventId);

    return this.dependencies.firestore.runTransaction(async (transaction) => {
      const commandSnapshot = await transaction.get(commandReference);
      if (commandSnapshot.exists) {
        const receipt = assertCommandReplay(
          commandSnapshot.data(),
          authority,
          action,
        );
        assertReplayAudits(await Promise.all([
          transaction.get(rootAuditReference),
          transaction.get(instituteAuditReference),
        ]), authority);
        return replayMutationReceipt(receipt, authority, request.instituteId);
      }
      const instituteSnapshot = await transaction.get(instituteReference);
      const current = storedInstituteAuthority(instituteSnapshot, request.instituteId);
      if (current.revision !== request.command.expectedRevision) {
        return conflictError("Institute revision changed; reload before changing lifecycle.");
      }
      const instituteData = instituteSnapshot.data() as Record<string, unknown>;
      if (instituteData.deletionLegalHold !== undefined &&
        typeof instituteData.deletionLegalHold !== "boolean") {
        return authorityError("Persisted institute deletion legal-hold authority is invalid.");
      }
      let nextLifecycle: VendorInstituteLifecycleState;
      let nextAccess: VendorInstituteAccessStatus;
      let nextDeletion = current.deletion;
      let deletionWrite: unknown = current.deletion;
      let propagation: ClaimPropagationPublicReceipt = {
        authorizationVersion: 0,
        browserDeadlineAt: null,
        operationId: null,
        serverDeadlineAt: null,
        state: "not_required",
      };
      let propagationSource: "institute_archived" | "institute_restored" |
        "institute_suspended" | null = null;

      if (action === "suspend") {
        if (current.lifecycleState !== "active") {
          return conflictError("Only an active institute can be suspended.");
        }
        nextLifecycle = "suspended";
        nextAccess = "suspended";
        propagationSource = "institute_suspended";
      } else if (action === "restore") {
        if (current.lifecycleState !== "suspended") {
          return conflictError("Only a suspended institute can be restored.");
        }
        nextLifecycle = "active";
        nextAccess = "active";
        propagationSource = "institute_restored";
      } else if (action === "archive") {
        if (!["onboarding", "active", "suspended"].includes(current.lifecycleState)) {
          return conflictError("Institute lifecycle cannot transition to archived.");
        }
        nextLifecycle = "archived";
        nextAccess = "suspended";
        propagationSource = "institute_archived";
      } else if (action === "schedule_deletion") {
        if (current.lifecycleState !== "archived") {
          return conflictError("Only an archived institute can schedule deletion.");
        }
        if (request.command.confirmInstituteId !== request.instituteId) {
          return validationError("Deletion confirmation does not match the target institute.");
        }
        if (instituteData.deletionLegalHold === true) {
          return conflictError("Institute deletion is blocked by a legal or compliance hold.");
        }
        nextLifecycle = "deletion_scheduled";
        nextAccess = "suspended";
        nextDeletion = {
          attempt: 0,
          checkpoint: "retention_scheduled",
          eligibleAt: Timestamp.fromMillis(timestamp.toMillis() + RETENTION_PERIOD_MILLIS),
          lastErrorCode: null,
          operationId: `vendor_delete_${sha256(`${request.instituteId}:${current.revision + 1}`).slice(0, 32)}`,
          scheduledAt: timestamp,
          stage: "scheduled",
        };
        deletionWrite = {
          ...nextDeletion,
          preservedAuthorities: [
            "institute_tombstone",
            "immutable_audits",
            "commercial_records",
            "compliance_records",
            "recovery_metadata",
          ],
          updatedAt: timestamp,
          workerState: "retention_wait",
        };
      } else if (action === "cancel_deletion") {
        if (current.lifecycleState !== "deletion_scheduled" ||
          current.deletion?.stage !== "scheduled") {
          return conflictError("Only a scheduled deletion can be cancelled.");
        }
        nextLifecycle = "archived";
        nextAccess = "suspended";
        nextDeletion = null;
        deletionWrite = FieldValue.delete();
      } else if (action === "execute_purge") {
        if (request.command.confirmInstituteId !== request.instituteId) {
          return validationError("Purge confirmation does not match the target institute.");
        }
        if (current.lifecycleState !== "deletion_scheduled" ||
          current.deletion?.stage !== "scheduled") {
          return conflictError("Only an eligible scheduled deletion can reserve purge.");
        }
        if (current.deletion.eligibleAt.toMillis() > timestamp.toMillis()) {
          return conflictError("The minimum 30-day retention period has not elapsed.");
        }
        if (instituteData.deletionLegalHold === true) {
          return conflictError("Institute purge is blocked by a legal or compliance hold.");
        }
        nextLifecycle = "purging";
        nextAccess = "suspended";
        nextDeletion = {
          ...current.deletion,
          attempt: current.deletion.attempt + 1,
          checkpoint: "retention_and_legal_hold_verified",
          lastErrorCode: null,
          stage: "quiescing",
        };
        deletionWrite = {
          ...nextDeletion,
          startedAt: timestamp,
          updatedAt: timestamp,
          workerState: "reserved",
        };
      } else {
        if (request.command.confirmInstituteId !== request.instituteId) {
          return validationError("Purge confirmation does not match the target institute.");
        }
        if (current.lifecycleState !== "recovery_required" ||
          current.deletion?.stage !== "failed") {
          return conflictError("Only a failed purge can be reserved for retry.");
        }
        if (instituteData.deletionLegalHold === true) {
          return conflictError("Institute purge retry is blocked by a legal or compliance hold.");
        }
        nextLifecycle = "purging";
        nextAccess = "suspended";
        nextDeletion = {
          ...current.deletion,
          attempt: current.deletion.attempt + 1,
          checkpoint: "retry_reserved",
          lastErrorCode: null,
          stage: "quiescing",
        };
        deletionWrite = {
          ...nextDeletion,
          updatedAt: timestamp,
          workerState: "reserved",
        };
      }

      const nextRevision = current.revision + 1;
      const authorizationVersion = propagationSource ?
        nextClaimAuthorizationVersion(instituteData.authorizationVersion) :
        instituteData.authorizationVersion;
      if (propagationSource) {
        const licenseSnapshot = await transaction.get(licenseReference);
        if (!licenseSnapshot.exists) {
          return authorityError("Institute lifecycle propagation requires license/current authority.");
        }
        const desiredAuthority = buildClaimPropagationDesiredAuthority(
          request.instituteId,
          {
            ...instituteData,
            authorizationVersion,
            instituteRevision: nextRevision,
            status: nextAccess,
          },
          licenseSnapshot.data() ?? {},
        );
        propagation = this.propagationCoordinator.stageOperation(
          transaction,
          {desiredAuthority, source: propagationSource},
          completedAt,
        );
      }
      const receipt = mutationReceipt(
        authority,
        completedAt,
        request.instituteId,
        nextLifecycle,
        nextRevision,
        nextDeletion,
        propagation,
      );
      const auditAction = action.toUpperCase();
      const reason = "reason" in request.command ? request.command.reason : null;
      const audit = {
        ...commonAudit(
          request,
          authority,
          request.instituteId,
          auditAction,
          timestamp,
          `Vendor accepted institute lifecycle command ${action}.`,
        ),
        expectedRevision: current.revision,
        fromLifecycleState: current.lifecycleState,
        propagationOperationId: propagation.operationId,
        propagationState: propagation.state,
        reasonHash: reason ? sha256(reason) : null,
        resultingRevision: nextRevision,
        toLifecycleState: nextLifecycle,
      };
      transaction.update(instituteReference, {
        deletionOperation: deletionWrite,
        ...(propagationSource ? {authorizationVersion} : {}),
        instituteRevision: nextRevision,
        status: nextAccess,
        updatedAt: timestamp,
        vendorLifecyclePropagationOperationId: propagation.operationId,
        vendorLifecyclePropagationState: propagation.state,
        vendorLifecycleState: nextLifecycle,
      });
      transaction.create(rootAuditReference, audit);
      transaction.create(instituteAuditReference, audit);
      transaction.create(commandReference, {
        action,
        auditEventId: authority.auditEventId,
        commandId: authority.commandId,
        completedAt: timestamp,
        fingerprint: authority.fingerprint,
        idempotencyKeyHash: authority.idempotencyKeyHash,
        receipt,
        receiptHash: sha256(stableSerialize(receipt)),
      });
      return receipt;
    });
  }
}

export const vendorInstituteCommandsService =
  new VendorInstituteCommandsService();
