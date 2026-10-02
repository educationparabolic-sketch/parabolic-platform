/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
import {createHash} from "node:crypto";
import type {CreateRequest, UpdateRequest, UserRecord} from "firebase-admin/auth";
import {FieldValue, Timestamp} from "firebase-admin/firestore";
import type {
  VendorAdministratorCommandIntent,
  VendorAdministratorCommandReceipt,
  VendorPrimaryAdministratorSummary,
} from "../../../shared/contracts/vendorInstitutes";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {
  VendorAdministratorCommandValidatedRequest,
  VendorInstituteValidationError,
} from "../types/vendorInstitutes";
import {
  IdentitySessionSecurityResult,
  identitySessionSecurityService,
} from "./identitySessionSecurity";
import {CustomClaimSynchronizationError} from "../types/customClaimSynchronization";
import {
  buildVendorAdministratorCommunicationDocument,
  vendorAdministratorCommunicationService,
} from "./vendorAdministratorCommunication";

const INSTITUTES_COLLECTION = "institutes";
const COMMANDS_COLLECTION = "vendorCommands";
const ROOT_AUDIT_COLLECTION = "vendorAuditLogs";
const INSTITUTE_AUDIT_COLLECTION = "auditLogs";
const MAX_STAFF_RECORDS = 100;
const MAX_IDENTIFIER_LENGTH = 128;
const MAX_DISPLAY_NAME_LENGTH = 120;
const MAX_EMAIL_LENGTH = 254;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

type AdministratorAction = VendorAdministratorCommandIntent["action"];
type ReconciliationState = VendorAdministratorCommandReceipt["reconciliationState"];

interface VendorAdministratorDependencies {
  auth?: {
    createUser(input: CreateRequest): Promise<UserRecord>;
    getUser(uid: string): Promise<UserRecord>;
    getUserByEmail(email: string): Promise<UserRecord>;
    updateUser(uid: string, input: UpdateRequest): Promise<UserRecord>;
  };
  communication?: {
    loadReceipt: typeof vendorAdministratorCommunicationService.loadReceipt;
  };
  firestore: FirebaseFirestore.Firestore;
  now?: () => Timestamp;
  sessionSecurity?: {
    clearClaimsAndRevokeSessions(uid: string): Promise<IdentitySessionSecurityResult>;
    revokeSessions(uid: string): Promise<IdentitySessionSecurityResult>;
    synchronizeClaimsAndRevokeSessions(input: {instituteId: string; uid: string}): Promise<IdentitySessionSecurityResult>;
  };
}

interface NormalizedRequest {
  action: AdministratorAction;
  actorId: string;
  actorRole: "vendor";
  administrator?: {displayName: string; email: string};
  expectedRevision: number;
  idempotencyKey: string;
  instituteId: string;
  ipAddress?: string;
  targetUserId?: string;
  userAgent?: string;
}

interface PendingPrimaryAdministrator {
  currentPrimaryUserId: string | null;
  kind: "initial" | "replacement";
  proposedAt: Timestamp;
  userId: string;
}

interface TransactionResult {
  commandDocumentId: string;
  communicationId?: string;
  receipt: VendorAdministratorCommandReceipt;
  replayed: boolean;
  targetUserIds: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const validationError = (message: string): never => {
  throw new VendorInstituteValidationError("VALIDATION_ERROR", message);
};

const conflictError = (message: string): never => {
  throw new VendorInstituteValidationError("CONFLICT", message);
};

const authorityError = (message: string): never => {
  throw new VendorInstituteValidationError("INTERNAL_ERROR", message);
};

const requiredString = (value: unknown, field: string, maximumLength = 256): string => {
  if (typeof value !== "string" || !value.trim()) {
    return validationError(`Field "${field}" must be a non-empty string.`);
  }
  const normalized = value.trim();
  if (normalized.length > maximumLength) {
    return validationError(`Field "${field}" must be at most ${maximumLength} characters.`);
  }
  return normalized;
};

const storedString = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !value.trim()) {
    return authorityError(`Persisted field "${field}" is invalid.`);
  }
  return value.trim();
};

const optionalStoredString = (value: unknown, field: string): string | null => {
  if (value === undefined || value === null) return null;
  return storedString(value, field);
};

const normalizeEmail = (value: unknown, field: string): string => {
  const email = requiredString(value, field, MAX_EMAIL_LENGTH).toLowerCase();
  if (!EMAIL_PATTERN.test(email)) return validationError(`Field "${field}" must be an email address.`);
  return email;
};

const storedTimestamp = (value: unknown, field: string): Timestamp => {
  if (!(value instanceof Timestamp)) return authorityError(`Persisted field "${field}" must be a timestamp.`);
  return value;
};

const timestampIso = (value: unknown, field: string): string => {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === "string" && !Number.isNaN(new Date(value).getTime())) return new Date(value).toISOString();
  return authorityError(`Persisted field "${field}" must be a timestamp.`);
};

const normalizeRevision = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    return validationError("Field \"expectedRevision\" must be a non-negative integer.");
  }
  return value;
};

const storedRevision = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    return authorityError("Persisted settings revision is invalid.");
  }
  return value;
};

const stableSerialize = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const isAuthUserNotFound = (error: unknown): boolean =>
  error instanceof Error && "code" in error &&
  (error as {code?: unknown}).code === "auth/user-not-found";

const parsePending = (value: unknown): PendingPrimaryAdministrator | null => {
  if (value === undefined || value === null) return null;
  if (!isRecord(value) || (value.kind !== "initial" && value.kind !== "replacement")) {
    return authorityError("Persisted pending primary-administrator authority is invalid.");
  }
  return {
    currentPrimaryUserId: optionalStoredString(value.currentPrimaryUserId, "pendingPrimaryAdministrator.currentPrimaryUserId"),
    kind: value.kind,
    proposedAt: storedTimestamp(value.proposedAt, "pendingPrimaryAdministrator.proposedAt"),
    userId: storedString(value.userId, "pendingPrimaryAdministrator.userId"),
  };
};

const administratorSummary = (
  userId: string,
  value: unknown,
): VendorPrimaryAdministratorSummary => {
  if (!isRecord(value) || (value.role !== undefined && value.role !== "admin")) {
    return authorityError("Persisted primary-administrator record is invalid.");
  }
  const status = storedString(value.status, `settingsUsers.${userId}.status`);
  const invitationStatus = value.invitationStatus === undefined && status !== "invitation_pending" ?
    "accepted" : storedString(value.invitationStatus, `settingsUsers.${userId}.invitationStatus`);
  if (!["invitation_pending", "active", "suspended"].includes(status) ||
    !["not_sent", "queued", "delivered", "failed", "revoked", "accepted"].includes(invitationStatus)) {
    return authorityError("Persisted primary-administrator lifecycle authority is invalid.");
  }
  return {
    displayName: storedString(value.displayName, `settingsUsers.${userId}.displayName`),
    email: storedString(value.email, `settingsUsers.${userId}.email`).toLowerCase(),
    invitationStatus: invitationStatus as VendorPrimaryAdministratorSummary["invitationStatus"],
    status: status as VendorPrimaryAdministratorSummary["status"],
    updatedAt: timestampIso(value.updatedAt, `settingsUsers.${userId}.updatedAt`),
    userId,
  };
};

const parseStoredReceipt = (value: unknown): VendorAdministratorCommandReceipt => {
  if (!isRecord(value)) return authorityError("Persisted Vendor administrator receipt is invalid.");
  const state = storedString(value.reconciliationState, "vendorCommands.receipt.reconciliationState");
  if (!["complete", "pending", "blocked_missing_entitlement"].includes(state)) {
    return authorityError("Persisted Vendor administrator reconciliation state is invalid.");
  }
  const primaryAdministrator = value.primaryAdministrator;
  if (primaryAdministrator !== null && !isRecord(primaryAdministrator)) {
    return authorityError("Persisted Vendor administrator receipt primary authority is invalid.");
  }
  return {
    auditEventId: storedString(value.auditEventId, "vendorCommands.receipt.auditEventId"),
    commandId: storedString(value.commandId, "vendorCommands.receipt.commandId"),
    completedAt: timestampIso(value.completedAt, "vendorCommands.receipt.completedAt"),
    instituteId: storedString(value.instituteId, "vendorCommands.receipt.instituteId"),
    primaryAdministrator: primaryAdministrator === null ? null :
      administratorSummary(storedString(primaryAdministrator.userId, "vendorCommands.receipt.primaryAdministrator.userId"), primaryAdministrator),
    reconciliationState: state as ReconciliationState,
    replayed: false,
    settingsRevision: storedRevision(value.settingsRevision),
  };
};

const actionSummary = (action: AdministratorAction): string => ({
  activate_primary_replacement: "Vendor activated verified primary-administrator authority.",
  invite_primary: "Vendor created initial primary-administrator invitation authority.",
  propose_primary_replacement: "Vendor proposed replacement primary-administrator authority.",
  resend_primary_invitation: "Vendor queued a replacement primary-administrator invitation.",
  reset_primary_access: "Vendor queued primary-administrator password reset authority.",
  restore_primary_access: "Vendor restored primary-administrator access authority.",
  revoke_primary_invitation: "Vendor revoked pending primary-administrator invitation authority.",
  suspend_primary_access: "Vendor suspended primary-administrator access authority.",
})[action];

/** Vendor-owned primary-administrator authority and recoverable identity reconciliation. */
export class VendorAdministratorService {
  constructor(private readonly dependencies: VendorAdministratorDependencies = {
    firestore: getFirestore(),
  }) {}

  public normalizeCommandRequest(input: Record<string, unknown>): NormalizedRequest {
    const actorId = requiredString(input.actorId, "actorId", MAX_IDENTIFIER_LENGTH);
    const actorRole = requiredString(input.actorRole, "actorRole", 32).toLowerCase();
    if (actorRole !== "vendor") {
      throw new VendorInstituteValidationError("FORBIDDEN", "Vendor administrator commands require current Vendor authority.");
    }
    const action = requiredString(input.action, "action", 64) as AdministratorAction;
    if (![
      "invite_primary",
      "propose_primary_replacement",
      "resend_primary_invitation",
      "reset_primary_access",
      "suspend_primary_access",
      "restore_primary_access",
      "revoke_primary_invitation",
      "activate_primary_replacement",
    ].includes(action)) return validationError("Field \"action\" is not supported.");
    const idempotencyKey = requiredString(input.idempotencyKey, "idempotencyKey", 64).toLowerCase();
    if (!UUID_PATTERN.test(idempotencyKey)) return validationError("Field \"idempotencyKey\" must be a UUID.");
    const normalized: NormalizedRequest = {
      action,
      actorId,
      actorRole: "vendor",
      expectedRevision: normalizeRevision(input.expectedRevision),
      idempotencyKey,
      instituteId: requiredString(input.instituteId, "instituteId", MAX_IDENTIFIER_LENGTH),
      ...(typeof input.ipAddress === "string" && input.ipAddress ? {ipAddress: input.ipAddress} : {}),
      ...(typeof input.userAgent === "string" && input.userAgent ? {userAgent: input.userAgent} : {}),
    };
    if (action === "invite_primary" || action === "propose_primary_replacement") {
      if (!isRecord(input.administrator)) return validationError("Field \"administrator\" is required.");
      normalized.administrator = {
        displayName: requiredString(input.administrator.displayName, "administrator.displayName", MAX_DISPLAY_NAME_LENGTH),
        email: normalizeEmail(input.administrator.email, "administrator.email"),
      };
    } else {
      normalized.targetUserId = requiredString(input.targetUserId, "targetUserId", MAX_IDENTIFIER_LENGTH);
    }
    return normalized;
  }

  public async executeCommand(
    rawRequest: VendorAdministratorCommandValidatedRequest,
  ): Promise<VendorAdministratorCommandReceipt> {
    const request = this.normalizeCommandRequest({
      ...rawRequest.command,
      ...rawRequest,
    });
    const fingerprint = sha256(stableSerialize({
      action: request.action,
      actorId: request.actorId,
      administrator: request.administrator,
      expectedRevision: request.expectedRevision,
      instituteId: request.instituteId,
      targetUserId: request.targetUserId,
    }));
    const idempotencyKeyHash = sha256(`${request.actorId}:administrator:${request.instituteId}:${request.idempotencyKey}`);
    const suffix = idempotencyKeyHash.slice(0, 40);
    const commandDocumentId = `vendor_admin_command_${suffix}`;
    const auditEventId = `vendor_admin_audit_${suffix}`;
    const commandId = commandDocumentId;
    const instituteReference = this.dependencies.firestore.doc(`${INSTITUTES_COLLECTION}/${request.instituteId}`);
    const commandReference = instituteReference.collection(COMMANDS_COLLECTION).doc(commandDocumentId);
    const rootAuditReference = this.dependencies.firestore.collection(ROOT_AUDIT_COLLECTION).doc(auditEventId);
    const instituteAuditReference = instituteReference.collection(INSTITUTE_AUDIT_COLLECTION).doc(auditEventId);
    const timestamp = (this.dependencies.now ?? (() => Timestamp.now()))();

    const transactionResult = await this.dependencies.firestore.runTransaction(async (transaction): Promise<TransactionResult> => {
      const [instituteSnapshot, commandSnapshot] = await Promise.all([
        transaction.get(instituteReference),
        transaction.get(commandReference),
      ]);
      if (!instituteSnapshot.exists) {
        throw new VendorInstituteValidationError("NOT_FOUND", "Institute authority was not found.");
      }
      if (commandSnapshot.exists) {
        const command = commandSnapshot.data() ?? {};
        if (command.action !== request.action || command.fingerprint !== fingerprint ||
          command.idempotencyKeyHash !== idempotencyKeyHash) {
          return conflictError("Idempotency key was already used for different administrator intent.");
        }
        const effect = command.effect;
        if (!isRecord(effect) || !Array.isArray(effect.targetUserIds) ||
          !effect.targetUserIds.every((value) => typeof value === "string" && value)) {
          return authorityError("Persisted Vendor administrator reconciliation effect is invalid.");
        }
        const storedReceipt = parseStoredReceipt(command.receipt);
        if (storedString(command.receiptHash, "vendorCommands.receiptHash") !==
          sha256(stableSerialize(storedReceipt))) {
          return authorityError("Persisted Vendor administrator receipt integrity is invalid.");
        }
        return {
          commandDocumentId,
          communicationId: typeof command.communicationId === "string" ? command.communicationId : undefined,
          receipt: storedReceipt,
          replayed: true,
          targetUserIds: effect.targetUserIds,
        };
      }

      const institute = instituteSnapshot.data() ?? {};
      const currentRevision = storedRevision(institute.settingsRevision ?? 0);
      if (currentRevision !== request.expectedRevision) {
        return conflictError(`Settings revision conflict: expected ${request.expectedRevision}, current ${currentRevision}.`);
      }
      const users = isRecord(institute.settingsUsers) ? {...institute.settingsUsers} : {};
      if (Object.keys(users).length > MAX_STAFF_RECORDS) {
        return conflictError(`Settings state exceeds the ${MAX_STAFF_RECORDS}-staff-record bound.`);
      }
      let primaryAdminUserId = optionalStoredString(institute.primaryAdminUserId, "primaryAdminUserId");
      let pending = parsePending(institute.pendingPrimaryAdministrator);
      const targetUserIds: string[] = [];
      let communicationDocument: ReturnType<typeof buildVendorAdministratorCommunicationDocument> | undefined;

      if (request.administrator) {
        const targetUserId = `staff_${sha256(`${request.instituteId}:${request.administrator.email}`).slice(0, 40)}`;
        await this.assertAuthOwnership(targetUserId, request.administrator.email);
        if (pending) return conflictError("A primary-administrator invitation is already pending.");
        if (request.action === "invite_primary" && primaryAdminUserId) {
          return conflictError("Institute already has primary-administrator authority.");
        }
        if (request.action === "propose_primary_replacement") {
          if (!primaryAdminUserId) return conflictError("Current primary-administrator authority is required for replacement.");
          const current = users[primaryAdminUserId];
          if (!isRecord(current) || current.role !== "admin" || current.status !== "active" ||
            (current.invitationStatus !== undefined && current.invitationStatus !== "accepted")) {
            return conflictError("Current primary-administrator authority is not active and accepted.");
          }
          current.invitationStatus = "accepted";
          if (targetUserId === primaryAdminUserId) return conflictError("Replacement must use a different authentication identity.");
        }
        const duplicate = Object.entries(users).find(([userId, value]) =>
          userId !== targetUserId && isRecord(value) &&
          typeof value.email === "string" && value.email.trim().toLowerCase() === request.administrator?.email);
        if (duplicate) return conflictError("Another staff identity already uses this email address.");
        const existing = users[targetUserId];
        if (existing !== undefined && (!isRecord(existing) || existing.invitationStatus !== "revoked")) {
          return conflictError("The deterministic administrator identity already exists.");
        }
        if (Object.keys(users).length >= MAX_STAFF_RECORDS && existing === undefined) {
          return conflictError(`No more than ${MAX_STAFF_RECORDS} staff records are supported.`);
        }
        users[targetUserId] = {
          claimsWithheld: true,
          displayName: request.administrator.displayName,
          email: request.administrator.email,
          invitationStatus: "queued",
          role: "admin",
          status: "invitation_pending",
          updatedAt: timestamp,
        };
        pending = {
          currentPrimaryUserId: primaryAdminUserId,
          kind: primaryAdminUserId ? "replacement" : "initial",
          proposedAt: timestamp,
          userId: targetUserId,
        };
        communicationDocument = buildVendorAdministratorCommunicationDocument({
          commandIdHash: idempotencyKeyHash,
          completedAt: timestamp,
          displayName: request.administrator.displayName,
          instituteId: request.instituteId,
          kind: "primary_administrator_invitation",
          recipientEmail: request.administrator.email,
          targetUserId,
        });
        targetUserIds.push(targetUserId);
      } else {
        const targetUserId = request.targetUserId as string;
        const target = users[targetUserId];
        if (!isRecord(target) || target.role !== "admin") {
          throw new VendorInstituteValidationError("NOT_FOUND", "Administrator authority was not found.");
        }
        if (request.action === "resend_primary_invitation") {
          if (!pending || pending.userId !== targetUserId || target.status !== "invitation_pending" || target.invitationStatus === "revoked") {
            return conflictError("A current pending primary-administrator invitation is required.");
          }
          target.invitationStatus = "queued";
          target.updatedAt = timestamp;
          communicationDocument = buildVendorAdministratorCommunicationDocument({
            commandIdHash: idempotencyKeyHash,
            completedAt: timestamp,
            displayName: storedString(target.displayName, `settingsUsers.${targetUserId}.displayName`),
            instituteId: request.instituteId,
            kind: "primary_administrator_invitation",
            recipientEmail: normalizeEmail(target.email, `settingsUsers.${targetUserId}.email`),
            targetUserId,
          });
          targetUserIds.push(targetUserId);
        } else if (request.action === "revoke_primary_invitation") {
          if (!pending || pending.userId !== targetUserId || target.status !== "invitation_pending" || target.invitationStatus === "revoked") {
            return conflictError("A current pending primary-administrator invitation is required.");
          }
          target.invitationStatus = "revoked";
          target.updatedAt = timestamp;
          pending = null;
          targetUserIds.push(targetUserId);
        } else if (request.action === "activate_primary_replacement") {
          if (!pending || pending.userId !== targetUserId || target.status !== "invitation_pending" || target.invitationStatus === "revoked") {
            return conflictError("A current pending primary-administrator invitation is required.");
          }
          await this.assertActivationAuthReadiness(targetUserId, normalizeEmail(target.email, `settingsUsers.${targetUserId}.email`));
          const licenseSnapshot = await transaction.get(instituteReference.collection("license").doc("current"));
          const license = licenseSnapshot.data();
          if (!licenseSnapshot.exists || !isRecord(license) || license.licenseState !== "active" ||
            !["L0", "L1", "L2", "L3"].includes(String(license.currentLayer)) ||
            typeof license.licenseVersion !== "string" || !license.licenseVersion.trim()) {
            return conflictError("Active current-license authority is required before primary activation.");
          }
          const oldPrimaryUserId = primaryAdminUserId;
          if (oldPrimaryUserId && oldPrimaryUserId !== targetUserId) {
            const oldPrimary = users[oldPrimaryUserId];
            if (!isRecord(oldPrimary) || oldPrimary.role !== "admin") {
              return authorityError("Current primary-administrator authority is invalid.");
            }
            oldPrimary.status = "suspended";
            oldPrimary.claimsWithheld = false;
            oldPrimary.updatedAt = timestamp;
            targetUserIds.push(oldPrimaryUserId);
          }
          target.status = "active";
          target.claimsWithheld = false;
          target.invitationStatus = "accepted";
          target.updatedAt = timestamp;
          primaryAdminUserId = targetUserId;
          pending = null;
          targetUserIds.unshift(targetUserId);
        } else {
          if (primaryAdminUserId !== targetUserId) {
            return conflictError("Target is not the current primary administrator.");
          }
          if (request.action === "reset_primary_access") {
            if (target.status !== "active" && target.status !== "suspended") {
              return conflictError("Primary-administrator access is not initialized.");
            }
            communicationDocument = buildVendorAdministratorCommunicationDocument({
              commandIdHash: idempotencyKeyHash,
              completedAt: timestamp,
              displayName: storedString(target.displayName, `settingsUsers.${targetUserId}.displayName`),
              instituteId: request.instituteId,
              kind: "primary_administrator_password_reset",
              recipientEmail: normalizeEmail(target.email, `settingsUsers.${targetUserId}.email`),
              targetUserId,
            });
          } else if (request.action === "suspend_primary_access") {
            if (target.status !== "active") return conflictError("Only active primary-administrator access can be suspended.");
            target.status = "suspended";
          } else if (request.action === "restore_primary_access") {
            if (target.status !== "suspended") return conflictError("Only suspended primary-administrator access can be restored.");
            target.status = "active";
          }
          target.updatedAt = timestamp;
          targetUserIds.push(targetUserId);
        }
      }

      const revision = currentRevision + 1;
      const primaryAdministrator = primaryAdminUserId ? administratorSummary(primaryAdminUserId, users[primaryAdminUserId]) : null;
      const receipt: VendorAdministratorCommandReceipt = {
        auditEventId,
        commandId,
        completedAt: timestamp.toDate().toISOString(),
        instituteId: request.instituteId,
        primaryAdministrator,
        reconciliationState: "pending",
        replayed: false,
        settingsRevision: revision,
      };
      const audit = {
        action: request.action,
        actorRole: "vendor",
        actorUserId: request.actorId,
        auditEventId,
        createdAt: timestamp,
        eventId: auditEventId,
        instituteId: request.instituteId,
        ipAddressHash: request.ipAddress ? sha256(request.ipAddress) : null,
        occurredAt: timestamp,
        settingsRevision: revision,
        summary: actionSummary(request.action),
        targetId: targetUserIds[0],
        userAgentHash: request.userAgent ? sha256(request.userAgent) : null,
      };
      transaction.update(instituteReference, {
        pendingPrimaryAdministrator: pending,
        primaryAdminUserId,
        settingsRevision: revision,
        settingsUsers: users,
        updatedAt: timestamp,
      });
      transaction.create(rootAuditReference, audit);
      transaction.create(instituteAuditReference, audit);
      if (communicationDocument) {
        transaction.create(
          this.dependencies.firestore.collection("emailQueue").doc(communicationDocument.communicationId),
          communicationDocument.data,
        );
      }
      transaction.create(commandReference, {
        action: request.action,
        actorUserId: request.actorId,
        auditEventId,
        commandId,
        communicationId: communicationDocument?.communicationId ?? null,
        completedAt: timestamp,
        effect: {targetUserIds},
        fingerprint,
        idempotencyKeyHash,
        receipt,
        receiptHash: sha256(stableSerialize(receipt)),
        reconciliation: {
          attempts: 0,
          lastErrorCode: null,
          state: "pending",
          updatedAt: timestamp,
        },
      });
      return {
        commandDocumentId,
        communicationId: communicationDocument?.communicationId,
        receipt,
        replayed: false,
        targetUserIds,
      };
    });

    const reconciliationState = await this.reconcileTargets(
      request.instituteId,
      transactionResult.targetUserIds,
    );
    await commandReference.update({
      "receipt.reconciliationState": reconciliationState,
      "reconciliation.attempts": FieldValue.increment(1),
      "reconciliation.lastErrorCode": reconciliationState === "complete" ? null : reconciliationState,
      "reconciliation.state": reconciliationState,
      "reconciliation.updatedAt": (this.dependencies.now ?? (() => Timestamp.now()))(),
      "receiptHash": sha256(stableSerialize({
        ...transactionResult.receipt,
        reconciliationState,
      })),
    });
    const communication = transactionResult.communicationId ?
      this.dependencies.communication ?
        await this.dependencies.communication.loadReceipt(transactionResult.communicationId) :
        await vendorAdministratorCommunicationService.loadReceipt(transactionResult.communicationId) :
      undefined;
    return {
      ...transactionResult.receipt,
      ...(communication ? {communication} : {}),
      reconciliationState,
      replayed: transactionResult.replayed,
    };
  }

  private getAuthClient(): NonNullable<VendorAdministratorDependencies["auth"]> {
    return this.dependencies.auth ?? getFirebaseAdminApp().auth();
  }

  private async assertAuthOwnership(targetUserId: string, email: string): Promise<void> {
    const auth = this.getAuthClient();
    try {
      const byEmail = await auth.getUserByEmail(email);
      if (byEmail.uid !== targetUserId) return conflictError("Administrator email is owned by another authentication identity.");
    } catch (error) {
      if (!isAuthUserNotFound(error)) throw error;
    }
    try {
      const byUid = await auth.getUser(targetUserId);
      if (byUid.email?.toLowerCase() !== email) return conflictError("Deterministic administrator UID is owned by another email.");
    } catch (error) {
      if (!isAuthUserNotFound(error)) throw error;
    }
  }

  private async assertActivationAuthReadiness(targetUserId: string, email: string): Promise<void> {
    let user: UserRecord;
    try {
      user = await this.getAuthClient().getUser(targetUserId);
    } catch (error) {
      if (isAuthUserNotFound(error)) return conflictError("Pending administrator authentication identity is missing.");
      throw error;
    }
    if (user.email?.toLowerCase() !== email || user.disabled ||
      !user.emailVerified || !user.metadata.lastSignInTime) {
      return conflictError("Pending administrator must complete invitation setup and sign in before activation.");
    }
  }

  private async reconcileTargets(
    instituteId: string,
    targetUserIds: string[],
  ): Promise<ReconciliationState> {
    let state: ReconciliationState = "complete";
    for (const targetUserId of [...new Set(targetUserIds)]) {
      try {
        await this.reconcileTarget(instituteId, targetUserId);
      } catch (error) {
        if (error instanceof CustomClaimSynchronizationError &&
          error.code === "AUTHORITY_NOT_FOUND" && /license/iu.test(error.message)) {
          state = "blocked_missing_entitlement";
        } else if (state !== "blocked_missing_entitlement") {
          state = "pending";
        }
      }
    }
    return state;
  }

  private async reconcileTarget(instituteId: string, targetUserId: string): Promise<void> {
    const snapshot = await this.dependencies.firestore.doc(`${INSTITUTES_COLLECTION}/${instituteId}`).get();
    if (!snapshot.exists) throw new Error("Institute authority disappeared during administrator reconciliation.");
    const institute = snapshot.data() ?? {};
    const users = isRecord(institute.settingsUsers) ? institute.settingsUsers : {};
    const record = users[targetUserId];
    const pending = parsePending(institute.pendingPrimaryAdministrator);
    const current = institute.primaryAdminUserId === targetUserId;
    const auth = this.getAuthClient();
    const sessionSecurity = this.dependencies.sessionSecurity ?? identitySessionSecurityService;

    if (!isRecord(record) || record.role !== "admin" || record.invitationStatus === "revoked" ||
      (!current && pending?.userId !== targetUserId)) {
      try {
        await auth.updateUser(targetUserId, {disabled: true});
      } catch (error) {
        if (!isAuthUserNotFound(error)) throw error;
      }
      await sessionSecurity.clearClaimsAndRevokeSessions(targetUserId);
      return;
    }

    const displayName = storedString(record.displayName, `settingsUsers.${targetUserId}.displayName`);
    const email = normalizeEmail(record.email, `settingsUsers.${targetUserId}.email`);
    const status = storedString(record.status, `settingsUsers.${targetUserId}.status`);
    let authUser: UserRecord | undefined;
    try {
      authUser = await auth.getUser(targetUserId);
      if (authUser.email?.toLowerCase() !== email) return conflictError("Administrator UID is owned by a different authentication email.");
    } catch (error) {
      if (!isAuthUserNotFound(error)) throw error;
    }
    if (!authUser) {
      await this.assertAuthOwnership(targetUserId, email);
      try {
        authUser = await auth.createUser({disabled: status === "suspended", displayName, email, uid: targetUserId});
      } catch (error) {
        try {
          authUser = await auth.getUser(targetUserId);
        } catch {
          throw error;
        }
      }
    }
    if (authUser.email?.toLowerCase() !== email) return conflictError("Administrator UID is owned by a different authentication email.");
    await auth.updateUser(targetUserId, {
      disabled: status === "suspended",
      displayName,
      email,
    });

    if (pending?.userId === targetUserId && !current) {
      await sessionSecurity.clearClaimsAndRevokeSessions(targetUserId);
    } else if (status === "suspended") {
      await sessionSecurity.clearClaimsAndRevokeSessions(targetUserId);
    } else if (status === "active") {
      const synchronized = await sessionSecurity.synchronizeClaimsAndRevokeSessions({instituteId, uid: targetUserId});
      if (synchronized.userMissing) throw new Error("Administrator identity disappeared during claim synchronization.");
    } else {
      throw new Error("Administrator lifecycle is not reconcilable.");
    }
  }
}

export const vendorAdministratorService = new VendorAdministratorService();
