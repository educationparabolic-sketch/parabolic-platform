/* eslint-disable max-len, require-jsdoc */
import {createHash} from "node:crypto";
import {Timestamp} from "firebase-admin/firestore";
import type {
  SupportAssignedTeam,
  SupportNotificationKind,
  SupportNotificationReceipt,
  SupportTicketStatus,
} from "../../../shared/contracts/adminSupport";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  EmailDeliveryProvider,
  EmailDeliveryProviderError,
  emailDeliveryProvider,
} from "./emailDeliveryProvider";
import {createLogger} from "./logging";

const EMAIL_QUEUE_COLLECTION = "emailQueue";
const SOURCE = "admin_support";
const MAX_RETRIES = 5;
const RETRY_DELAYS_MS = [60_000, 300_000, 900_000, 3_600_000, 21_600_000];
const PROCESSING_LEASE_MS = 5 * 60_000;

type JobStatus = "cancelled" | "failed" | "pending" | "processing" | "retrying" | "sent";

interface SupportNotificationJob {
  assignedTeam: SupportAssignedTeam;
  instituteId: string;
  maxRetries: number;
  nextAttemptAt?: Timestamp;
  notificationKind: SupportNotificationKind;
  recipientEmail: string;
  recipientTargetId: string;
  retryCount: number;
  source: typeof SOURCE;
  status: JobStatus;
  ticketDisplayId: string;
  ticketId: string;
  ticketStatus: SupportTicketStatus;
}

interface Dependencies {
  firestore: FirebaseFirestore.Firestore;
  now: () => Timestamp;
  provider: EmailDeliveryProvider;
  resolveSupportInbox: () => string;
}

export interface SupportNotificationDocumentInput {
  assignedTeam: SupportAssignedTeam;
  commandHash: string;
  createdAt: Timestamp;
  instituteId: string;
  kind: SupportNotificationKind;
  recipientEmail: string;
  recipientTargetId: string;
  ticketDisplayId: string;
  ticketId: string;
  ticketStatus: SupportTicketStatus;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const requiredString = (value: unknown, field: string, maximum = 500): string => {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maximum) {
    throw new Error(`Support notification field "${field}" is invalid.`);
  }
  return value.trim();
};

const normalizeEmail = (value: unknown, field: string): string => {
  const email = requiredString(value, field, 320).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
    throw new Error(`Support notification field "${field}" is invalid.`);
  }
  return email;
};

const defaultSupportInbox = (): string =>
  normalizeEmail(process.env.SUPPORT_NOTIFICATION_EMAIL, "SUPPORT_NOTIFICATION_EMAIL");

const toJob = (value: unknown): SupportNotificationJob | null => {
  if (!isRecord(value) || value.source !== SOURCE) return null;
  const kind = value.notificationKind;
  const status = value.status;
  const assignedTeam = value.assignedTeam;
  const ticketStatus = value.ticketStatus;
  if (typeof kind !== "string" || ![
    "assignment_changed", "institute_replied", "status_changed", "support_replied", "ticket_created",
  ].includes(kind) || typeof status !== "string" || ![
    "cancelled", "failed", "pending", "processing", "retrying", "sent",
  ].includes(status) || typeof assignedTeam !== "string" || ![
    "institute_operations", "platform_support", "vendor_billing",
  ].includes(assignedTeam) || typeof ticketStatus !== "string" || ![
    "open", "in_progress", "awaiting_institute", "resolved", "closed",
  ].includes(ticketStatus) || (value.nextAttemptAt !== null && !(value.nextAttemptAt instanceof Timestamp))) {
    return null;
  }
  return {
    assignedTeam: assignedTeam as SupportAssignedTeam,
    instituteId: requiredString(value.instituteId, "instituteId", 128),
    maxRetries: Number.isInteger(value.maxRetries) && Number(value.maxRetries) > 0 ? Number(value.maxRetries) : MAX_RETRIES,
    nextAttemptAt: value.nextAttemptAt instanceof Timestamp ? value.nextAttemptAt : undefined,
    notificationKind: kind as SupportNotificationKind,
    recipientEmail: normalizeEmail(value.recipientEmail, "recipientEmail"),
    recipientTargetId: requiredString(value.recipientTargetId, "recipientTargetId", 128),
    retryCount: Number.isInteger(value.retryCount) && Number(value.retryCount) >= 0 ? Number(value.retryCount) : 0,
    source: SOURCE,
    status: status as JobStatus,
    ticketDisplayId: requiredString(value.ticketDisplayId, "ticketDisplayId", 64),
    ticketId: requiredString(value.ticketId, "ticketId", 128),
    ticketStatus: ticketStatus as SupportTicketStatus,
  };
};

const disposition = (error: unknown): {code: string; retryable: boolean} =>
  error instanceof EmailDeliveryProviderError ?
    {code: error.code, retryable: error.retryable} :
    {code: "support_notification_processing_error", retryable: true};

const eventLabel = (kind: SupportNotificationKind): string => {
  if (kind === "ticket_created") return "A support ticket was created";
  if (kind === "institute_replied") return "An institute replied to a support ticket";
  if (kind === "support_replied") return "Support replied to your ticket";
  if (kind === "assignment_changed") return "Support ticket assignment changed";
  return "Support ticket status changed";
};

export class SupportNotificationService {
  private readonly dependencies: Dependencies;
  private readonly logger = createLogger("SupportNotificationService");

  constructor(dependencies: Partial<Dependencies> = {}) {
    this.dependencies = {
      firestore: dependencies.firestore ?? getFirestore(),
      now: dependencies.now ?? (() => Timestamp.now()),
      provider: dependencies.provider ?? emailDeliveryProvider,
      resolveSupportInbox: dependencies.resolveSupportInbox ?? defaultSupportInbox,
    };
  }

  public supportInbox(): string {
    return normalizeEmail(this.dependencies.resolveSupportInbox(), "SUPPORT_NOTIFICATION_EMAIL");
  }

  public buildDocument(input: SupportNotificationDocumentInput): {
    data: Record<string, unknown>;
    receipt: SupportNotificationReceipt;
    reference: FirebaseFirestore.DocumentReference;
  } {
    const notificationId = `support_notification_${sha256(`${input.commandHash}:${input.kind}:${input.recipientTargetId}`).slice(0, 40)}`;
    return {
      data: {
        activeAttempt: null,
        assignedTeam: input.assignedTeam,
        createdAt: input.createdAt,
        instituteId: input.instituteId,
        lastAttemptAt: null,
        lastErrorCode: null,
        maxRetries: MAX_RETRIES,
        nextAttemptAt: input.createdAt,
        notificationId,
        notificationKind: input.kind,
        providerMessageIdHash: null,
        recipientEmail: normalizeEmail(input.recipientEmail, "recipientEmail"),
        recipientTargetId: requiredString(input.recipientTargetId, "recipientTargetId", 128),
        retryCount: 0,
        sentAt: null,
        source: SOURCE,
        status: "pending",
        templateType: `support_${input.kind}`,
        ticketDisplayId: input.ticketDisplayId,
        ticketId: input.ticketId,
        ticketStatus: input.ticketStatus,
        updatedAt: input.createdAt,
      },
      receipt: {kind: input.kind, notificationId, status: "queued"},
      reference: this.dependencies.firestore.collection(EMAIL_QUEUE_COLLECTION).doc(notificationId),
    };
  }

  public async processDueNotifications(limit = 50): Promise<number> {
    const bounded = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 50) : 50;
    const snapshot = await this.dependencies.firestore.collection(EMAIL_QUEUE_COLLECTION)
      .where("source", "==", SOURCE)
      .where("nextAttemptAt", "<=", this.dependencies.now())
      .limit(bounded)
      .get();
    let processed = 0;
    for (const document of snapshot.docs) {
      if (await this.processNotification(document.id)) processed += 1;
    }
    return processed;
  }

  public async processNotification(notificationId: string): Promise<boolean> {
    const reference = this.dependencies.firestore.collection(EMAIL_QUEUE_COLLECTION).doc(notificationId);
    const claimed = await this.dependencies.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      const job = snapshot.exists ? toJob(snapshot.data()) : null;
      if (!job || !job.nextAttemptAt || !["pending", "processing", "retrying"].includes(job.status)) return null;
      const now = this.dependencies.now();
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
      const label = eventLabel(claimed.job.notificationKind);
      const subject = `${label}: ${claimed.job.ticketDisplayId}`;
      const text = `${label}. Ticket ${claimed.job.ticketDisplayId} is ${claimed.job.ticketStatus}. Sign in to Parabolic Platform to review it.`;
      const html = `<p>${label}.</p><p>Ticket <strong>${claimed.job.ticketDisplayId}</strong> is ${claimed.job.ticketStatus}.</p><p>Sign in to Parabolic Platform to review it.</p>`;
      const delivery = await this.dependencies.provider.send({
        html,
        idempotencyKey: notificationId,
        recipientEmail: claimed.job.recipientEmail,
        subject,
        text,
      });
      const now = this.dependencies.now();
      await this.dependencies.firestore.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists || snapshot.get("status") !== "processing" || snapshot.get("activeAttempt") !== claimed.attemptNumber) return;
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
      this.logger.info("Support notification delivered.", {kind: claimed.job.notificationKind, notificationId});
    } catch (error) {
      const failure = disposition(error);
      const now = this.dependencies.now();
      const retryCount = claimed.attemptNumber;
      const retryable = failure.retryable && retryCount < claimed.job.maxRetries;
      const delay = RETRY_DELAYS_MS[Math.min(retryCount - 1, RETRY_DELAYS_MS.length - 1)] ?? RETRY_DELAYS_MS[0];
      await this.dependencies.firestore.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists || snapshot.get("status") !== "processing" || snapshot.get("activeAttempt") !== claimed.attemptNumber) return;
        transaction.update(reference, {
          activeAttempt: null,
          lastErrorCode: failure.code,
          nextAttemptAt: retryable ? Timestamp.fromMillis(now.toMillis() + delay) : null,
          retryCount,
          status: retryable ? "retrying" : "failed",
          updatedAt: now,
        });
      });
      this.logger.warn("Support notification attempt failed.", {
        errorCode: failure.code,
        notificationId,
        retryable,
      });
    }
    return true;
  }
}

export const supportNotificationService = new SupportNotificationService();
