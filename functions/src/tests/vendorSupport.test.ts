/* eslint-disable max-len */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import test from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import {AdminSupportService} from "../services/adminSupport";
import {EmailDeliveryProviderError} from "../services/emailDeliveryProvider";
import {SupportAttachmentService} from "../services/supportAttachments";
import {SupportNotificationService} from "../services/supportNotifications";
import {AdminSupportValidationError} from "../types/adminSupport";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= "127.0.0.1:9199";
process.env.GCLOUD_PROJECT ??= "demo-parabolic-test";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.SUPPORT_ATTACHMENTS_BUCKET ??= `${process.env.GCLOUD_PROJECT}.appspot.com`;
process.env.SUPPORT_NOTIFICATION_EMAIL ??= "support-operations@parabolic.test";

const firestore = getFirestore();
const bucket = getFirebaseAdminApp().storage().bucket(process.env.SUPPORT_ATTACHMENTS_BUCKET);

const clock = (() => {
  let millis = Date.parse("2026-09-30T10:00:00.000Z");
  return {
    advance(milliseconds = 1_000) {
      millis += milliseconds;
    },
    now: () => Timestamp.fromMillis(millis),
  };
})();

const deleteCollection = async (path: string): Promise<void> => {
  const snapshot = await firestore.collection(path).get();
  await Promise.all(snapshot.docs.map((document) => document.ref.delete()));
};

const cleanup = async (instituteId: string): Promise<void> => {
  const root = `institutes/${instituteId}`;
  const tickets = await firestore.collection(`${root}/supportTickets`).get();
  await Promise.all(tickets.docs.map(async (ticket) => {
    await deleteCollection(`${ticket.ref.path}/messages`);
    await ticket.ref.delete();
  }));
  await Promise.all([
    deleteCollection(`${root}/auditLogs`),
    deleteCollection(`${root}/supportAttachments`),
    deleteCollection(`${root}/supportCommands`),
    deleteCollection(`${root}/supportTicketStats`),
  ]);
  const jobs = await firestore.collection("emailQueue").where("instituteId", "==", instituteId).get();
  await Promise.all(jobs.docs.map((document) => document.ref.delete()));
  const vendorAudits = await firestore.collection("vendorAuditLogs").where("instituteId", "==", instituteId).get();
  await Promise.all(vendorAudits.docs.map((document) => document.ref.delete()));
  const instituteHash = createHash("sha256").update(instituteId).digest("hex").slice(0, 40);
  await bucket.deleteFiles({prefix: `institutes/${instituteHash}/support-attachments/`});
  const institute = firestore.doc(root);
  if ((await institute.get()).exists) await institute.delete();
};

const seed = async (instituteId: string): Promise<void> => {
  await cleanup(instituteId);
  await firestore.doc(`institutes/${instituteId}`).set({
    instituteId,
    settingsUsers: {
      admin_vendor_flow: {
        displayName: "Institute Administrator",
        email: `${instituteId}@institute.test`,
        role: "admin",
        status: "active",
      },
    },
  });
};

const png = () => {
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return {
    clientAttachmentId: "00000000-0000-4000-8000-000000000701",
    contentBase64: bytes.toString("base64"),
    contentSha256: createHash("sha256").update(bytes).digest("hex"),
    fileName: "evidence.png",
    mediaType: "image/png" as const,
    sizeBytes: bytes.length,
  };
};

const createService = (provider?: {send: () => Promise<{providerMessageId?: string}>}) => {
  const notifications = new SupportNotificationService({
    firestore,
    now: clock.now,
    provider: provider ?? {send: async () => ({providerMessageId: "support-provider-id"})},
    resolveSupportInbox: () => "support-operations@parabolic.test",
  });
  const attachments = new SupportAttachmentService({
    firestore,
    generateDownloadUrl: async ({expiresAt, objectPath}) =>
      `https://downloads.parabolic.test/${createHash("sha256").update(`${objectPath}:${expiresAt.toISOString()}`).digest("hex")}`,
    now: clock.now,
  });
  return {
    notifications,
    service: new AdminSupportService({
      attachments,
      firestore,
      notifications,
      now: clock.now,
      resolveVendorOperator: async (userId) => {
        if (userId !== "vendor_operator_assigned") {
          throw new AdminSupportValidationError("VALIDATION_ERROR", "Assigned support operator is not an active Vendor identity.");
        }
        return {displayName: "Assigned Operator", email: "operator@parabolic.test"};
      },
    }),
  };
};

test("Vendor support queue, commands, dual audit, download, replay, and redacted delivery are authoritative", async () => {
  const instituteId = "inst_vendor_support_flow";
  await seed(instituteId);
  const {notifications, service} = createService();
  const created = await service.createTicket({
    actorId: "admin_vendor_flow",
    actorRole: "admin",
    attachments: [png()] as never,
    category: "technical_issue",
    description: "A reproducible platform issue needs operator review.",
    idempotencyKey: "00000000-0000-4000-8000-000000000702",
    instituteId,
    priority: "urgent",
    sourceRoute: "/admin/tests",
    subject: "Operator workflow verification",
  });
  const context = {
    actorDisplayName: "Vendor Support Operator",
    actorId: "vendor_operator_actor",
    actorRole: "vendor" as const,
  };
  const queue = await service.listVendorTickets({
    ...context,
    assignedTeam: "platform_support",
    instituteId,
    limit: 10,
  });
  assert.equal(queue.items.length, 1);
  assert.equal(queue.items[0].instituteId, instituteId);
  assert.equal(queue.counts.open >= 1, true);

  clock.advance();
  const assigned = await service.executeVendorCommand({
    ...context,
    action: "ASSIGN_SUPPORT_OPERATOR",
    assignedOperatorUserId: "vendor_operator_assigned",
    expectedRevision: 1,
    idempotencyKey: "00000000-0000-4000-8000-000000000703",
    ticketId: created.ticket.ticketId,
  });
  assert.equal(assigned.ticket.assignedOperatorUserId, "vendor_operator_assigned");
  assert.equal(assigned.notification.status, "queued");

  clock.advance();
  const reply = await service.executeVendorCommand({
    ...context,
    action: "ADD_SUPPORT_REPLY",
    attachments: [],
    body: "Support has reproduced the issue and is investigating.",
    expectedRevision: 2,
    idempotencyKey: "00000000-0000-4000-8000-000000000704",
    ticketId: created.ticket.ticketId,
  });
  assert.equal(reply.ticket.status, "awaiting_institute");
  assert.equal(reply.message?.authorType, "support");
  assert.equal(reply.message?.authorDisplayName, "Vendor Support Operator");
  const replay = await service.executeVendorCommand({
    ...context,
    action: "ADD_SUPPORT_REPLY",
    attachments: [],
    body: "Support has reproduced the issue and is investigating.",
    expectedRevision: 2,
    idempotencyKey: "00000000-0000-4000-8000-000000000704",
    ticketId: created.ticket.ticketId,
  });
  assert.equal(replay.disposition, "replayed");
  assert.equal(replay.ticket.revision, 3);

  const detail = await service.getVendorTicketDetail({...context, ticketId: created.ticket.ticketId});
  assert.equal(detail.messages.items.length, 2);
  assert.equal(detail.ticket.assignedOperatorUserId, "vendor_operator_assigned");

  const attachment = created.message?.attachments[0];
  assert.ok(attachment);
  const download = await service.downloadVendorAttachment({
    ...context,
    attachmentId: attachment.attachmentId,
    ticketId: created.ticket.ticketId,
  });
  assert.match(download.url, /^https:\/\/downloads\.parabolic\.test\/[a-f0-9]{64}$/u);

  const [instituteAudits, vendorAudits, jobs] = await Promise.all([
    firestore.collection(`institutes/${instituteId}/auditLogs`).get(),
    firestore.collection("vendorAuditLogs").where("instituteId", "==", instituteId).get(),
    firestore.collection("emailQueue").where("instituteId", "==", instituteId).get(),
  ]);
  assert.equal(instituteAudits.docs.some((document) => document.get("action") === "SUPPORT_REPLY_ADDED"), true);
  assert.equal(vendorAudits.docs.some((document) => document.get("action") === "SUPPORT_REPLY_ADDED"), true);
  assert.equal(vendorAudits.docs.some((document) => document.get("action") === "ATTACHMENT_DOWNLOADED"), true);
  assert.equal(jobs.size, 3);
  for (const job of jobs.docs) {
    assert.equal(job.get("source"), "admin_support");
    assert.equal("body" in job.data(), false);
    assert.equal("attachments" in job.data(), false);
    assert.equal("fileName" in job.data(), false);
  }
  assert.ok(reply.notification.notificationId);
  assert.equal(await notifications.processNotification(reply.notification.notificationId as string), true);
  const delivered = await firestore.doc(`emailQueue/${reply.notification.notificationId}`).get();
  assert.equal(delivered.get("status"), "sent");
  assert.equal(typeof delivered.get("providerMessageIdHash"), "string");

  await assert.rejects(
    service.executeVendorCommand({
      ...context,
      action: "ASSIGN_SUPPORT_OPERATOR",
      assignedOperatorUserId: "not_a_vendor",
      expectedRevision: 3,
      idempotencyKey: "00000000-0000-4000-8000-000000000705",
      ticketId: created.ticket.ticketId,
    }),
    (error: unknown) => error instanceof AdminSupportValidationError && error.code === "VALIDATION_ERROR",
  );
});

test("support notification provider failures use bounded retry authority", async () => {
  const instituteId = "inst_vendor_support_retry";
  await seed(instituteId);
  let calls = 0;
  const {notifications, service} = createService({
    send: async () => {
      calls += 1;
      if (calls === 1) throw new EmailDeliveryProviderError("provider_http_429", true, "retry");
      return {providerMessageId: "retry-success"};
    },
  });
  const created = await service.createTicket({
    actorId: "admin_vendor_flow",
    actorRole: "admin",
    attachments: [],
    category: "other",
    description: "Notification retry verification.",
    idempotencyKey: "00000000-0000-4000-8000-000000000706",
    instituteId,
    priority: "normal",
    sourceRoute: "/admin/help",
    subject: "Notification retry verification",
  });
  const notificationId = created.notification.notificationId as string;
  assert.equal(await notifications.processNotification(notificationId), true);
  let snapshot = await firestore.doc(`emailQueue/${notificationId}`).get();
  assert.equal(snapshot.get("status"), "retrying");
  assert.equal(snapshot.get("retryCount"), 1);
  assert.equal(snapshot.get("lastErrorCode"), "provider_http_429");
  clock.advance(61_000);
  assert.equal(await notifications.processNotification(notificationId), true);
  snapshot = await firestore.doc(`emailQueue/${notificationId}`).get();
  assert.equal(snapshot.get("status"), "sent");
  assert.equal(calls, 2);
});
