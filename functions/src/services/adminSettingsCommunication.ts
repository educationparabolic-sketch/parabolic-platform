/* eslint-disable max-len */
import {createHash} from "node:crypto";
import {Timestamp} from "firebase-admin/firestore";
import type {
  AdminSettingsCommunicationKind,
  AdminSettingsCommunicationReceipt,
} from "../../../shared/contracts/adminSettings";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {
  EmailDeliveryProvider,
  EmailDeliveryProviderError,
  emailDeliveryProvider,
} from "./emailDeliveryProvider";
import {createLogger} from "./logging";

const EMAIL_QUEUE_COLLECTION = "emailQueue";
const ADMIN_SETTINGS_SOURCE = "admin_settings";
const MAX_RETRIES = 5;
const RETRY_DELAYS_MS = [60_000, 300_000, 900_000, 3_600_000, 21_600_000];
const PROCESSING_LEASE_MS = 5 * 60_000;

type CommunicationJobStatus =
  | "pending"
  | "processing"
  | "retrying"
  | "sent"
  | "failed"
  | "cancelled";

interface CommunicationJob {
  communicationKind: AdminSettingsCommunicationKind;
  displayName: string;
  idempotencyKeyHash: string;
  instituteId: string;
  maxRetries: number;
  nextAttemptAt?: Timestamp;
  recipientEmail: string;
  retryCount: number;
  source: typeof ADMIN_SETTINGS_SOURCE;
  status: CommunicationJobStatus;
  targetUserId: string;
}

interface AdminSettingsCommunicationDependencies {
  auth?: {
    generatePasswordResetLink(email: string): Promise<string>;
    getUser(uid: string): Promise<{email?: string; uid: string}>;
  };
  firestore: FirebaseFirestore.Firestore;
  now?: () => Timestamp;
  provider?: EmailDeliveryProvider;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const optionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const requiredString = (value: unknown, field: string): string => {
  const normalized = optionalString(value);
  if (!normalized) throw new Error(`Communication field "${field}" is invalid.`);
  return normalized;
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const escapeHtml = (value: string): string => value
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");

const toJob = (value: unknown): CommunicationJob | null => {
  if (!isPlainObject(value) || value.source !== ADMIN_SETTINGS_SOURCE) return null;
  const kind = optionalString(value.communicationKind);
  const status = optionalString(value.status);
  if ((kind !== "staff_invitation" && kind !== "staff_password_reset") ||
    !status || !["pending", "processing", "retrying", "sent", "failed", "cancelled"].includes(status) ||
    (value.nextAttemptAt !== null && !(value.nextAttemptAt instanceof Timestamp))) return null;
  const retryCount = typeof value.retryCount === "number" && Number.isInteger(value.retryCount) && value.retryCount >= 0 ? value.retryCount : 0;
  const maxRetries = typeof value.maxRetries === "number" && Number.isInteger(value.maxRetries) && value.maxRetries > 0 ? value.maxRetries : MAX_RETRIES;
  return {
    communicationKind: kind,
    displayName: requiredString(value.displayName, "displayName"),
    idempotencyKeyHash: requiredString(value.idempotencyKeyHash, "idempotencyKeyHash"),
    instituteId: requiredString(value.instituteId, "instituteId"),
    maxRetries,
    nextAttemptAt: value.nextAttemptAt instanceof Timestamp ? value.nextAttemptAt : undefined,
    recipientEmail: requiredString(value.recipientEmail, "recipientEmail").toLowerCase(),
    retryCount,
    source: ADMIN_SETTINGS_SOURCE,
    status: status as CommunicationJobStatus,
    targetUserId: requiredString(value.targetUserId, "targetUserId"),
  };
};

const toReceiptStatus = (
  status: CommunicationJobStatus,
): AdminSettingsCommunicationReceipt["status"] => {
  if (status === "sent") return "delivered";
  if (status === "failed" || status === "cancelled") return "failed";
  return "queued";
};

const errorDisposition = (error: unknown): {code: string; retryable: boolean} => {
  if (error instanceof EmailDeliveryProviderError) {
    return {code: error.code, retryable: error.retryable};
  }
  if (error instanceof AdminSettingsCommunicationAuthorityError) {
    return {code: error.code, retryable: false};
  }
  return {code: "communication_processing_error", retryable: true};
};

export class AdminSettingsCommunicationAuthorityError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "AdminSettingsCommunicationAuthorityError";
  }
}

export const buildAdminSettingsCommunicationDocument = (input: {
  commandIdHash: string;
  completedAt: Timestamp;
  displayName: string;
  instituteId: string;
  kind: AdminSettingsCommunicationKind;
  recipientEmail: string;
  targetUserId: string;
}): {communicationId: string; data: Record<string, unknown>} => {
  const communicationId = `settings_communication_${input.commandIdHash.slice(0, 40)}`;
  return {
    communicationId,
    data: {
      communicationId,
      communicationKind: input.kind,
      createdAt: input.completedAt,
      displayName: input.displayName,
      idempotencyKeyHash: input.commandIdHash,
      instituteId: input.instituteId,
      lastAttemptAt: null,
      lastErrorCode: null,
      maxRetries: MAX_RETRIES,
      nextAttemptAt: input.completedAt,
      providerMessageIdHash: null,
      recipientEmail: input.recipientEmail,
      retryCount: 0,
      sentAt: null,
      source: ADMIN_SETTINGS_SOURCE,
      status: "pending",
      targetUserId: input.targetUserId,
      templateType: input.kind,
      updatedAt: input.completedAt,
    },
  };
};

/** Processes queued Admin settings communication without persisting action links. */
export class AdminSettingsCommunicationService {
  private readonly logger = createLogger("AdminSettingsCommunicationService");

  constructor(private readonly dependencies: AdminSettingsCommunicationDependencies = {
    firestore: getFirestore(),
  }) {}

  public async loadReceipt(communicationId: string): Promise<AdminSettingsCommunicationReceipt> {
    const snapshot = await this.dependencies.firestore.collection(EMAIL_QUEUE_COLLECTION).doc(communicationId).get();
    if (!snapshot.exists) throw new Error("Settings communication authority is missing.");
    const job = toJob(snapshot.data());
    if (!job) throw new Error("Settings communication authority is invalid.");
    return {
      communicationId,
      kind: job.communicationKind,
      status: toReceiptStatus(job.status),
    };
  }

  public async processDueCommunications(limit = 50): Promise<number> {
    const boundedLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 50) : 50;
    const now = this.now();
    const snapshot = await this.dependencies.firestore.collection(EMAIL_QUEUE_COLLECTION)
      .where("nextAttemptAt", "<=", now)
      .limit(boundedLimit)
      .get();
    let processed = 0;
    for (const document of snapshot.docs) {
      if (await this.processCommunication(document.id)) processed += 1;
    }
    return processed;
  }

  public async processCommunication(communicationId: string): Promise<boolean> {
    const reference = this.dependencies.firestore.collection(EMAIL_QUEUE_COLLECTION).doc(communicationId);
    const claimed = await this.dependencies.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      const job = snapshot.exists ? toJob(snapshot.data()) : null;
      if (!job || !job.nextAttemptAt ||
        !["pending", "retrying", "processing"].includes(job.status)) return null;
      const now = this.now();
      if (job.nextAttemptAt.toMillis() > now.toMillis()) return null;
      const attemptNumber = job.retryCount + 1;
      transaction.update(reference, {
        activeAttempt: attemptNumber,
        lastAttemptAt: now,
        nextAttemptAt: Timestamp.fromMillis(now.toMillis() + PROCESSING_LEASE_MS),
        status: "processing",
        updatedAt: now,
      });
      return {attemptNumber, job};
    });
    if (!claimed) return false;

    try {
      const message = await this.buildMessage(claimed.job);
      const delivery = await (this.dependencies.provider ?? emailDeliveryProvider).send(message);
      const now = this.now();
      await this.dependencies.firestore.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists || snapshot.get("status") !== "processing" ||
          snapshot.get("activeAttempt") !== claimed.attemptNumber) return;
        transaction.update(reference, {
          activeAttempt: null,
          lastErrorCode: null,
          nextAttemptAt: null,
          providerMessageIdHash: delivery.providerMessageId ? sha256(delivery.providerMessageId) : null,
          sentAt: now,
          status: "sent",
          updatedAt: now,
        });
      });
      this.logger.info("Admin settings communication delivered.", {
        communicationId,
        instituteId: claimed.job.instituteId,
        kind: claimed.job.communicationKind,
      });
      return true;
    } catch (error) {
      const disposition = errorDisposition(error);
      await this.recordFailure(reference, claimed, disposition);
      this.logger.warn("Admin settings communication attempt failed.", {
        communicationId,
        errorCode: disposition.code,
        instituteId: claimed.job.instituteId,
        kind: claimed.job.communicationKind,
        retryable: disposition.retryable,
      });
      return true;
    }
  }

  private async buildMessage(job: CommunicationJob): Promise<{
    html: string;
    idempotencyKey: string;
    recipientEmail: string;
    subject: string;
    text: string;
  }> {
    const instituteSnapshot = await this.dependencies.firestore.doc(`institutes/${job.instituteId}`).get();
    const instituteData = instituteSnapshot.data();
    const users = isPlainObject(instituteData?.settingsUsers) ? instituteData?.settingsUsers : {};
    const staff = users[job.targetUserId];
    if (!instituteSnapshot.exists || !isPlainObject(staff)) {
      throw new AdminSettingsCommunicationAuthorityError("staff_authority_missing", "Staff authority no longer exists.");
    }
    const currentEmail = requiredString(staff.email, "settingsUsers.email").toLowerCase();
    if (currentEmail !== job.recipientEmail) {
      throw new AdminSettingsCommunicationAuthorityError("staff_email_changed", "Staff email authority changed.");
    }
    const auth = this.dependencies.auth ?? getFirebaseAdminApp().auth();
    const user = await auth.getUser(job.targetUserId);
    if (user.email?.toLowerCase() !== job.recipientEmail) {
      throw new AdminSettingsCommunicationAuthorityError("auth_email_mismatch", "Authentication email authority changed.");
    }
    const actionLink = await auth.generatePasswordResetLink(job.recipientEmail);
    const profile = isPlainObject(instituteData?.profile) ? instituteData?.profile : {};
    const instituteName = optionalString(profile.instituteName) ?? "your institute";
    const isInvitation = job.communicationKind === "staff_invitation";
    const subject = isInvitation ?
      `Set up your ${instituteName} staff account` :
      `Reset your ${instituteName} staff password`;
    const introduction = isInvitation ?
      `You have been invited to join ${instituteName} on Parabolic Platform.` :
      `A password reset was requested for your ${instituteName} staff account.`;
    const action = isInvitation ? "Set your password" : "Reset your password";
    const text = `${job.displayName},\n\n${introduction}\n\n${action}: ${actionLink}\n\nIf you did not expect this message, you can ignore it.`;
    const html = `<p>Hello ${escapeHtml(job.displayName)},</p><p>${escapeHtml(introduction)}</p>` +
      `<p><a href="${escapeHtml(actionLink)}">${escapeHtml(action)}</a></p>` +
      "<p>If you did not expect this message, you can ignore it.</p>";
    return {
      html,
      idempotencyKey: job.idempotencyKeyHash,
      recipientEmail: job.recipientEmail,
      subject,
      text,
    };
  }

  private async recordFailure(
    reference: FirebaseFirestore.DocumentReference,
    claimed: {attemptNumber: number; job: CommunicationJob},
    disposition: {code: string; retryable: boolean},
  ): Promise<void> {
    const now = this.now();
    const retryCount = claimed.attemptNumber;
    const retryable = disposition.retryable && retryCount < claimed.job.maxRetries;
    const delay = RETRY_DELAYS_MS[Math.min(retryCount - 1, RETRY_DELAYS_MS.length - 1)] ?? RETRY_DELAYS_MS[0];
    await this.dependencies.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists || snapshot.get("status") !== "processing" ||
        snapshot.get("activeAttempt") !== claimed.attemptNumber) return;
      transaction.update(reference, {
        activeAttempt: null,
        lastErrorCode: disposition.code,
        nextAttemptAt: retryable ? Timestamp.fromMillis(now.toMillis() + delay) : null,
        retryCount,
        status: retryable ? "retrying" : "failed",
        updatedAt: now,
      });
    });
  }

  private now(): Timestamp {
    return (this.dependencies.now ?? (() => Timestamp.now()))();
  }
}

export const adminSettingsCommunicationService = new AdminSettingsCommunicationService();
