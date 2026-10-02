/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
import {createHash} from "node:crypto";
import {Timestamp} from "firebase-admin/firestore";
import type {
  VendorAdministratorCommunicationReceipt,
} from "../../../shared/contracts/vendorInstitutes";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {
  EmailDeliveryProvider,
  EmailDeliveryProviderError,
  emailDeliveryProvider,
} from "./emailDeliveryProvider";

const EMAIL_QUEUE_COLLECTION = "emailQueue";
const SOURCE = "vendor_primary_administrator";
const MAX_RETRIES = 5;
const RETRY_DELAYS_MS = [60_000, 300_000, 900_000, 3_600_000, 21_600_000];
const PROCESSING_LEASE_MS = 5 * 60_000;

type CommunicationKind = VendorAdministratorCommunicationReceipt["kind"];
type CommunicationStatus = "pending" | "processing" | "retrying" | "sent" | "failed" | "cancelled";

interface CommunicationJob {
  communicationKind: CommunicationKind;
  displayName: string;
  idempotencyKeyHash: string;
  instituteId: string;
  maxRetries: number;
  nextAttemptAt?: Timestamp;
  recipientEmail: string;
  retryCount: number;
  source: typeof SOURCE;
  status: CommunicationStatus;
  targetUserId: string;
}

interface CommunicationDependencies {
  auth?: {
    generateEmailVerificationLink(email: string): Promise<string>;
    generatePasswordResetLink(email: string): Promise<string>;
    getUser(uid: string): Promise<{email?: string; uid: string}>;
  };
  firestore: FirebaseFirestore.Firestore;
  now?: () => Timestamp;
  provider?: EmailDeliveryProvider;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
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
  if (!isRecord(value) || value.source !== SOURCE) return null;
  const kind = optionalString(value.communicationKind);
  const status = optionalString(value.status);
  if ((kind !== "primary_administrator_invitation" && kind !== "primary_administrator_password_reset") ||
    !status || !["pending", "processing", "retrying", "sent", "failed", "cancelled"].includes(status) ||
    (value.nextAttemptAt !== null && value.nextAttemptAt !== undefined && !(value.nextAttemptAt instanceof Timestamp))) return null;
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
    source: SOURCE,
    status: status as CommunicationStatus,
    targetUserId: requiredString(value.targetUserId, "targetUserId"),
  };
};

const receiptStatus = (
  status: CommunicationStatus,
): VendorAdministratorCommunicationReceipt["status"] => {
  if (status === "sent") return "delivered";
  if (status === "failed" || status === "cancelled") return "failed";
  return "queued";
};

export class VendorAdministratorCommunicationAuthorityError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "VendorAdministratorCommunicationAuthorityError";
  }
}

const errorDisposition = (error: unknown): {code: string; retryable: boolean} => {
  if (error instanceof EmailDeliveryProviderError) {
    return {code: error.code, retryable: error.retryable};
  }
  if (error instanceof VendorAdministratorCommunicationAuthorityError) {
    return {code: error.code, retryable: false};
  }
  return {code: "vendor_administrator_communication_error", retryable: true};
};

export const buildVendorAdministratorCommunicationDocument = (input: {
  commandIdHash: string;
  completedAt: Timestamp;
  displayName: string;
  instituteId: string;
  kind: CommunicationKind;
  recipientEmail: string;
  targetUserId: string;
}): {communicationId: string; data: Record<string, unknown>} => {
  const communicationId = `vendor_admin_communication_${input.commandIdHash.slice(0, 40)}`;
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
      source: SOURCE,
      status: "pending",
      targetUserId: input.targetUserId,
      templateType: input.kind,
      updatedAt: input.completedAt,
    },
  };
};

/** Processes redacted primary-administrator communication jobs. */
export class VendorAdministratorCommunicationService {
  constructor(private readonly dependencies: CommunicationDependencies = {
    firestore: getFirestore(),
  }) {}

  public async loadReceipt(
    communicationId: string,
  ): Promise<VendorAdministratorCommunicationReceipt> {
    const snapshot = await this.dependencies.firestore.collection(EMAIL_QUEUE_COLLECTION).doc(communicationId).get();
    if (!snapshot.exists) throw new Error("Vendor administrator communication authority is missing.");
    const job = toJob(snapshot.data());
    if (!job) throw new Error("Vendor administrator communication authority is invalid.");
    return {
      communicationId,
      kind: job.communicationKind,
      status: receiptStatus(job.status),
    };
  }

  public async processDueCommunications(limit = 50): Promise<number> {
    const boundedLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 50) : 50;
    const now = this.now();
    const snapshot = await this.dependencies.firestore.collection(EMAIL_QUEUE_COLLECTION)
      .where("source", "==", SOURCE)
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
      if (!job || !job.nextAttemptAt || !["pending", "retrying", "processing"].includes(job.status)) return null;
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
      return true;
    } catch (error) {
      await this.recordFailure(reference, claimed, errorDisposition(error));
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
    const institute = instituteSnapshot.data();
    const users = isRecord(institute?.settingsUsers) ? institute.settingsUsers : {};
    const staff = users[job.targetUserId];
    if (!instituteSnapshot.exists || !isRecord(staff)) {
      throw new VendorAdministratorCommunicationAuthorityError("staff_authority_missing", "Administrator authority no longer exists.");
    }
    const currentEmail = requiredString(staff.email, "settingsUsers.email").toLowerCase();
    if (currentEmail !== job.recipientEmail) {
      throw new VendorAdministratorCommunicationAuthorityError("staff_email_changed", "Administrator email authority changed.");
    }
    if (job.communicationKind === "primary_administrator_invitation") {
      const pending = isRecord(institute?.pendingPrimaryAdministrator) ? institute.pendingPrimaryAdministrator : null;
      if (!pending || pending.userId !== job.targetUserId || staff.status !== "invitation_pending" || staff.invitationStatus === "revoked") {
        throw new VendorAdministratorCommunicationAuthorityError("invitation_revoked", "Primary-administrator invitation is no longer current.");
      }
    } else if (institute?.primaryAdminUserId !== job.targetUserId ||
      (staff.status !== "active" && staff.status !== "suspended")) {
      throw new VendorAdministratorCommunicationAuthorityError("primary_authority_changed", "Primary-administrator reset authority changed.");
    }

    const auth = this.dependencies.auth ?? getFirebaseAdminApp().auth();
    const user = await auth.getUser(job.targetUserId);
    if (user.email?.toLowerCase() !== job.recipientEmail) {
      throw new VendorAdministratorCommunicationAuthorityError("auth_email_mismatch", "Authentication email authority changed.");
    }
    const passwordLink = await auth.generatePasswordResetLink(job.recipientEmail);
    const instituteName = optionalString(institute?.registeredName) ??
      (isRecord(institute?.profile) ? optionalString(institute.profile.instituteName) : undefined) ??
      "your institute";
    const invitation = job.communicationKind === "primary_administrator_invitation";
    const subject = invitation ?
      `Set up your ${instituteName} primary administrator account` :
      `Reset your ${instituteName} primary administrator password`;
    const introduction = invitation ?
      `You have been invited to become the primary administrator for ${instituteName} on Parabolic Platform.` :
      `A password reset was requested for your ${instituteName} primary administrator account.`;
    const verificationLink = invitation ?
      await auth.generateEmailVerificationLink(job.recipientEmail) : null;
    const action = invitation ? "Set your password" : "Reset your password";
    const text = invitation ?
      `${job.displayName},\n\n${introduction}\n\nVerify your email: ${verificationLink}\n\n${action}: ${passwordLink}\n\nSign in after completing both steps. If you did not expect this message, you can ignore it.` :
      `${job.displayName},\n\n${introduction}\n\n${action}: ${passwordLink}\n\nIf you did not expect this message, you can ignore it.`;
    const html = `<p>Hello ${escapeHtml(job.displayName)},</p><p>${escapeHtml(introduction)}</p>` +
      (verificationLink ? `<p><a href="${escapeHtml(verificationLink)}">Verify your email</a></p>` : "") +
      `<p><a href="${escapeHtml(passwordLink)}">${escapeHtml(action)}</a></p>` +
      (invitation ? "<p>Sign in after completing both steps.</p>" : "") +
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

export const vendorAdministratorCommunicationService =
  new VendorAdministratorCommunicationService();
