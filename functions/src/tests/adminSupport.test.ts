/* eslint-disable max-len */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import test from "node:test";
import * as gcpMetadata from "gcp-metadata";
import {Timestamp} from "firebase-admin/firestore";
import {AdminSupportService} from "../services/adminSupport";
import {SupportAttachmentService} from "../services/supportAttachments";
import {AdminSupportValidationError} from "../types/adminSupport";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= "127.0.0.1:9199";
process.env.GCLOUD_PROJECT ??= "demo-parabolic-test";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
process.env.SUPPORT_ATTACHMENTS_BUCKET ??= `${process.env.GCLOUD_PROJECT}.appspot.com`;
process.env.SUPPORT_NOTIFICATION_EMAIL ??= "support-operations@parabolic.test";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();
const bucket = getFirebaseAdminApp().storage().bucket(
  process.env.SUPPORT_ATTACHMENTS_BUCKET,
);

const deleteCollection = async (path: string): Promise<void> => {
  const snapshot = await firestore.collection(path).get();
  await Promise.all(snapshot.docs.map((document) => document.ref.delete()));
};

const cleanupInstitute = async (instituteId: string): Promise<void> => {
  const institutePath = `institutes/${instituteId}`;
  const tickets = await firestore.collection(`${institutePath}/supportTickets`).get();
  await Promise.all(tickets.docs.map(async (ticket) => {
    await deleteCollection(`${ticket.ref.path}/messages`);
    await ticket.ref.delete();
  }));
  await Promise.all([
    deleteCollection(`${institutePath}/auditLogs`),
    deleteCollection(`${institutePath}/supportAttachments`),
    deleteCollection(`${institutePath}/supportCommands`),
    deleteCollection(`${institutePath}/supportTicketStats`),
  ]);
  const notifications = await firestore.collection("emailQueue")
    .where("instituteId", "==", instituteId).get();
  await Promise.all(notifications.docs.map((document) => document.ref.delete()));
  const instituteHash = createHash("sha256").update(instituteId).digest("hex").slice(0, 40);
  await bucket.deleteFiles({prefix: `institutes/${instituteHash}/support-attachments/`});
  const institute = firestore.doc(institutePath);
  if ((await institute.get()).exists) await institute.delete();
};

const seedInstitute = async (instituteId: string): Promise<void> => {
  await cleanupInstitute(instituteId);
  await firestore.doc(`institutes/${instituteId}`).set({
    instituteId,
    settingsUsers: {
      admin_support: {
        displayName: "Support Administrator",
        email: "admin-support@institute.test",
        role: "admin",
        status: "active",
      },
      teacher_support: {
        displayName: "Support Teacher",
        email: "teacher-support@institute.test",
        role: "teacher",
        status: "active",
      },
    },
  });
};

const createClock = () => {
  let millis = Date.parse("2026-09-27T10:00:00.000Z");
  return {
    advance(seconds = 1) {
      millis += seconds * 1_000;
    },
    now: () => Timestamp.fromMillis(millis),
  };
};

const createRequest = (
  instituteId: string,
  key: string,
  overrides: Record<string, unknown> = {},
) => ({
  actorId: "admin_support",
  actorRole: "admin" as const,
  attachments: [],
  category: "technical_issue" as const,
  description: "The publishing workflow returns an unavailable state.",
  idempotencyKey: key,
  instituteId,
  priority: "high" as const,
  sourceRoute: "/admin/tests",
  subject: "Unable to publish a test",
  ...overrides,
});

const pngAttachment = (
  clientAttachmentId = "00000000-0000-4000-8000-000000000499",
) => {
  const bytes = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d,
  ]);
  return {
    clientAttachmentId,
    contentBase64: bytes.toString("base64"),
    contentSha256: createHash("sha256").update(bytes).digest("hex"),
    fileName: "support-evidence.png",
    mediaType: "image/png" as const,
    sizeBytes: bytes.length,
  };
};

const attachmentService = (clock: ReturnType<typeof createClock>) =>
  new SupportAttachmentService({
    firestore,
    generateDownloadUrl: async ({expiresAt, objectPath}) =>
      `https://downloads.parabolic.test/${createHash("sha256")
        .update(`${objectPath}:${expiresAt.toISOString()}`).digest("hex")}`,
    now: clock.now,
  });

test.after(async () => {
  await getFirebaseAdminApp().delete();
});

test("ticket create is server-routed, audited, durable, and exactly replayable", async () => {
  const instituteId = "inst_support_create";
  await seedInstitute(instituteId);
  const clock = createClock();
  const service = new AdminSupportService({firestore, now: clock.now});
  const key = "00000000-0000-4000-8000-000000000401";

  const applied = await service.createTicket(createRequest(instituteId, key));
  assert.equal(applied.disposition, "applied");
  assert.equal(applied.ticket.assignedTeam, "platform_support");
  assert.equal(applied.ticket.status, "open");
  assert.equal(applied.ticket.revision, 1);
  assert.equal(applied.message?.authorDisplayName, "Support Administrator");
  assert.equal(applied.message?.authorType, "institute");
  assert.equal(applied.notification.status, "queued");
  assert.match(applied.notification.notificationId ?? "", /^support_notification_[a-f0-9]{40}$/u);

  clock.advance();
  const replayed = await service.createTicket(createRequest(instituteId, key));
  assert.equal(replayed.disposition, "replayed");
  assert.deepEqual(replayed.ticket, applied.ticket);
  assert.deepEqual(replayed.message, applied.message);

  const institutePath = `institutes/${instituteId}`;
  const [commands, audits, tickets, stats] = await Promise.all([
    firestore.collection(`${institutePath}/supportCommands`).get(),
    firestore.collection(`${institutePath}/auditLogs`).get(),
    firestore.collection(`${institutePath}/supportTickets`).get(),
    firestore.doc(`${institutePath}/supportTicketStats/current`).get(),
  ]);
  assert.equal(commands.size, 1);
  assert.equal(audits.size, 1);
  assert.equal(tickets.size, 1);
  assert.equal(stats.get("open"), 1);
  assert.equal(stats.get("urgentNotClosed"), 0);
  assert.equal("description" in commands.docs[0].data(), false);
  assert.equal("body" in commands.docs[0].data(), false);
  assert.equal("description" in audits.docs[0].data(), false);
  assert.equal("body" in audits.docs[0].data(), false);
  assert.equal("idempotencyKey" in commands.docs[0].data(), false);
  const notifications = await firestore.collection("emailQueue")
    .where("instituteId", "==", instituteId).get();
  assert.equal(notifications.size, 1);
  assert.equal(notifications.docs[0].get("source"), "admin_support");
  assert.equal("body" in notifications.docs[0].data(), false);
  assert.equal("attachments" in notifications.docs[0].data(), false);

  await assert.rejects(
    service.createTicket(createRequest(instituteId, key, {
      subject: "Same key with changed intent",
    })),
    (error: unknown) => error instanceof AdminSupportValidationError &&
      error.code === "CONFLICT",
  );
});

test("tenant-scoped list/detail use bounded filter-bound cursors", async () => {
  const instituteId = "inst_support_pages";
  const otherInstituteId = "inst_support_pages_other";
  await seedInstitute(instituteId);
  await seedInstitute(otherInstituteId);
  const clock = createClock();
  const service = new AdminSupportService({firestore, now: clock.now});

  for (const [index, priority] of ["normal", "high", "urgent"].entries()) {
    await service.createTicket(createRequest(
      instituteId,
      `00000000-0000-4000-8000-00000000041${index}`,
      {priority},
    ));
    clock.advance();
  }
  await service.createTicket(createRequest(
    otherInstituteId,
    "00000000-0000-4000-8000-000000000419",
  ));

  const first = await service.listTickets({
    actorId: "admin_support",
    actorRole: "admin",
    instituteId,
    limit: 2,
    status: "open",
  });
  assert.equal(first.items.length, 2);
  assert.ok(first.nextCursor);
  assert.equal(first.counts.open, 3);
  assert.equal(first.counts.urgentNotClosed, 1);
  assert.ok(first.items.every((item) => item.status === "open"));

  const second = await service.listTickets({
    actorId: "admin_support",
    actorRole: "admin",
    cursor: first.nextCursor as string,
    instituteId,
    limit: 2,
    status: "open",
  });
  assert.equal(second.items.length, 1);
  assert.equal(second.nextCursor, null);
  assert.equal(new Set([...first.items, ...second.items].map((item) => item.ticketId)).size, 3);

  await assert.rejects(
    service.listTickets({
      actorId: "admin_support",
      actorRole: "admin",
      cursor: first.nextCursor as string,
      instituteId,
      limit: 2,
      priority: "urgent",
      status: "open",
    }),
    (error: unknown) => error instanceof AdminSupportValidationError &&
      error.code === "VALIDATION_ERROR",
  );

  const foreign = await service.listTickets({
    actorId: "admin_support",
    actorRole: "admin",
    instituteId: otherInstituteId,
    limit: 10,
  });
  assert.equal(foreign.items.length, 1);
  await assert.rejects(
    service.getTicketDetail({
      actorId: "admin_support",
      actorRole: "admin",
      instituteId: otherInstituteId,
      ticketId: first.items[0].ticketId,
    }),
    (error: unknown) => error instanceof AdminSupportValidationError &&
      error.code === "NOT_FOUND",
  );
});

test("reply and lifecycle commands enforce revision and legal transitions", async () => {
  const instituteId = "inst_support_lifecycle";
  await seedInstitute(instituteId);
  const clock = createClock();
  const service = new AdminSupportService({firestore, now: clock.now});
  const created = await service.createTicket(createRequest(
    instituteId,
    "00000000-0000-4000-8000-000000000421",
    {priority: "urgent"},
  ));
  const ticketId = created.ticket.ticketId;

  await assert.rejects(
    service.executeCommand({
      action: "CHANGE_INSTITUTE_LIFECYCLE",
      actorId: "admin_support",
      actorRole: "admin",
      expectedRevision: 1,
      idempotencyKey: "00000000-0000-4000-8000-000000000422",
      instituteId,
      lifecycleAction: "close",
      ticketId,
    }),
    (error: unknown) => error instanceof AdminSupportValidationError &&
      error.code === "CONFLICT",
  );

  clock.advance();
  const reply = await service.executeCommand({
    action: "ADD_INSTITUTE_REPLY",
    actorId: "teacher_support",
    actorRole: "teacher",
    attachments: [],
    body: "A second reproducible example is now available.",
    expectedRevision: 1,
    idempotencyKey: "00000000-0000-4000-8000-000000000423",
    instituteId,
    ticketId,
  });
  assert.equal(reply.ticket.revision, 2);
  assert.equal(reply.ticket.messageCount, 2);
  assert.equal(reply.message?.authorDisplayName, "Support Teacher");

  clock.advance();
  const resolved = await service.executeCommand({
    action: "CHANGE_INSTITUTE_LIFECYCLE",
    actorId: "admin_support",
    actorRole: "admin",
    expectedRevision: 2,
    idempotencyKey: "00000000-0000-4000-8000-000000000424",
    instituteId,
    lifecycleAction: "resolve",
    ticketId,
  });
  assert.equal(resolved.ticket.status, "resolved");
  assert.equal(resolved.ticket.revision, 3);

  await assert.rejects(
    service.executeCommand({
      action: "ADD_INSTITUTE_REPLY",
      actorId: "admin_support",
      actorRole: "admin",
      attachments: [],
      body: "This reply requires an explicit reopen.",
      expectedRevision: 3,
      idempotencyKey: "00000000-0000-4000-8000-000000000425",
      instituteId,
      ticketId,
    }),
    (error: unknown) => error instanceof AdminSupportValidationError &&
      error.code === "CONFLICT",
  );

  clock.advance();
  const closed = await service.executeCommand({
    action: "CHANGE_INSTITUTE_LIFECYCLE",
    actorId: "admin_support",
    actorRole: "admin",
    expectedRevision: 3,
    idempotencyKey: "00000000-0000-4000-8000-000000000426",
    instituteId,
    lifecycleAction: "close",
    ticketId,
  });
  assert.equal(closed.ticket.status, "closed");

  clock.advance();
  const reopened = await service.executeCommand({
    action: "CHANGE_INSTITUTE_LIFECYCLE",
    actorId: "admin_support",
    actorRole: "admin",
    expectedRevision: 4,
    idempotencyKey: "00000000-0000-4000-8000-000000000427",
    instituteId,
    lifecycleAction: "reopen",
    ticketId,
  });
  assert.equal(reopened.ticket.status, "open");
  assert.equal(reopened.ticket.revision, 5);

  const replayed = await service.executeCommand({
    action: "ADD_INSTITUTE_REPLY",
    actorId: "teacher_support",
    actorRole: "teacher",
    attachments: [],
    body: "A second reproducible example is now available.",
    expectedRevision: 1,
    idempotencyKey: "00000000-0000-4000-8000-000000000423",
    instituteId,
    ticketId,
  });
  assert.equal(replayed.disposition, "replayed");
  assert.equal(replayed.ticket.revision, 2);

  const detailPageOne = await service.getTicketDetail({
    actorId: "admin_support",
    actorRole: "admin",
    instituteId,
    messageLimit: 1,
    ticketId,
  });
  assert.equal(detailPageOne.ticket.revision, 5);
  assert.equal(detailPageOne.messages.items.length, 1);
  assert.ok(detailPageOne.messages.nextCursor);
  const detailPageTwo = await service.getTicketDetail({
    actorId: "admin_support",
    actorRole: "admin",
    instituteId,
    messageCursor: detailPageOne.messages.nextCursor as string,
    messageLimit: 1,
    ticketId,
  });
  assert.equal(detailPageTwo.messages.items.length, 1);
  assert.equal(detailPageTwo.messages.nextCursor, null);

  const stats = await firestore.doc(
    `institutes/${instituteId}/supportTicketStats/current`,
  ).get();
  assert.equal(stats.get("open"), 1);
  assert.equal(stats.get("closed"), 0);
  assert.equal(stats.get("resolved"), 0);
  assert.equal(stats.get("urgentNotClosed"), 1);
});

test("concurrent commands against one expected revision commit at most once", async () => {
  const instituteId = "inst_support_concurrency";
  await seedInstitute(instituteId);
  const clock = createClock();
  const service = new AdminSupportService({firestore, now: clock.now});
  const created = await service.createTicket(createRequest(
    instituteId,
    "00000000-0000-4000-8000-000000000431",
  ));
  clock.advance();
  const command = (key: string, body: string) => service.executeCommand({
    action: "ADD_INSTITUTE_REPLY" as const,
    actorId: "admin_support",
    actorRole: "admin" as const,
    attachments: [],
    body,
    expectedRevision: 1,
    idempotencyKey: key,
    instituteId,
    ticketId: created.ticket.ticketId,
  });
  const settled = await Promise.allSettled([
    command("00000000-0000-4000-8000-000000000432", "Concurrent reply A"),
    command("00000000-0000-4000-8000-000000000433", "Concurrent reply B"),
  ]);
  assert.equal(settled.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(settled.filter((result) => result.status === "rejected").length, 1);
  const rejected = settled.find((result) => result.status === "rejected");
  assert.ok(rejected && rejected.status === "rejected" &&
    rejected.reason instanceof AdminSupportValidationError &&
    rejected.reason.code === "CONFLICT");

  const detail = await service.getTicketDetail({
    actorId: "admin_support",
    actorRole: "admin",
    instituteId,
    ticketId: created.ticket.ticketId,
  });
  assert.equal(detail.ticket.revision, 2);
  assert.equal(detail.ticket.messageCount, 2);
  assert.equal(detail.messages.items.length, 2);
});

test("attachment validation verifies bounds, hashes, extensions, and byte signatures", async () => {
  const clock = createClock();
  const attachments = attachmentService(clock);
  assert.equal(attachments.normalizeUploads([pngAttachment()]).length, 1);

  await assert.rejects(
    Promise.resolve().then(() => attachments.normalizeUploads([
      pngAttachment("00000000-0000-4000-8000-000000000491"),
      pngAttachment("00000000-0000-4000-8000-000000000492"),
      pngAttachment("00000000-0000-4000-8000-000000000493"),
      pngAttachment("00000000-0000-4000-8000-000000000494"),
      pngAttachment("00000000-0000-4000-8000-000000000495"),
      pngAttachment("00000000-0000-4000-8000-000000000496"),
    ])),
    (error: unknown) => error instanceof AdminSupportValidationError &&
      error.code === "VALIDATION_ERROR",
  );
  await assert.rejects(
    Promise.resolve().then(() => attachments.normalizeUploads([{
      ...pngAttachment(),
      contentSha256: "0".repeat(64),
    }])),
    (error: unknown) => error instanceof AdminSupportValidationError &&
      /does not match/u.test(error.message),
  );
  await assert.rejects(
    Promise.resolve().then(() => attachments.normalizeUploads([{
      ...pngAttachment(),
      fileName: "support-evidence.pdf",
    }])),
    (error: unknown) => error instanceof AdminSupportValidationError &&
      /extension/u.test(error.message),
  );
  const fakePng = Buffer.from("not-a-png");
  await assert.rejects(
    Promise.resolve().then(() => attachments.normalizeUploads([{
      ...pngAttachment(),
      contentBase64: fakePng.toString("base64"),
      contentSha256: createHash("sha256").update(fakePng).digest("hex"),
      sizeBytes: fakePng.length,
    }])),
    (error: unknown) => error instanceof AdminSupportValidationError &&
      /signature/u.test(error.message),
  );
});

test("direct browser-style support attachment Storage writes remain denied", async () => {
  const storageHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
  assert.ok(storageHost);
  const response = await fetch(
    `http://${storageHost}/v0/b/${process.env.SUPPORT_ATTACHMENTS_BUCKET}/o` +
      "?uploadType=media&name=institutes%2Fbrowser-bypass%2Fsupport-attachments%2Fprobe",
    {
      body: "browser-write-must-fail",
      headers: {"Content-Type": "application/pdf"},
      method: "POST",
    },
  );
  assert.equal(response.status, 403);
});

test("attachment cleanup removes command-bound uploads abandoned in staging", async () => {
  const instituteId = "inst_support_attachment_orphan";
  await seedInstitute(instituteId);
  const clock = createClock();
  const attachments = attachmentService(clock);
  const prepared = await attachments.prepare({
    commandHash: "a".repeat(64),
    instituteId,
    messageId: `support_message_${"b".repeat(40)}`,
    ticketId: `support_ticket_${"c".repeat(40)}`,
    uploads: attachments.normalizeUploads([pngAttachment()]),
  });
  assert.equal(prepared.length, 1);
  assert.equal((await bucket.file(prepared[0].objectPath).exists())[0], true);

  clock.advance(25 * 60 * 60);
  const cleanup = await attachments.cleanupExpired();
  assert.equal(cleanup.stagingDeleted, 1);
  assert.equal((await prepared[0].reference.get()).exists, false);
  assert.equal((await bucket.file(prepared[0].objectPath).exists())[0], false);
});

test("attachments are private create-only objects with replay-safe opaque metadata and authorized downloads", async () => {
  const instituteId = "inst_support_attachments";
  await seedInstitute(instituteId);
  const clock = createClock();
  const attachments = attachmentService(clock);
  const service = new AdminSupportService({attachments, firestore, now: clock.now});
  const key = "00000000-0000-4000-8000-000000000481";
  const upload = pngAttachment();

  const applied = await service.createTicket(createRequest(instituteId, key, {
    attachments: [upload],
  }));
  assert.equal(applied.message?.attachments.length, 1);
  const record = applied.message?.attachments[0];
  assert.ok(record);
  assert.match(record.attachmentId, /^support_attachment_[a-f0-9]{40}$/u);
  assert.equal(record.downloadAvailable, true);
  assert.equal("bucketName" in record, false);
  assert.equal("objectPath" in record, false);
  assert.equal("contentBase64" in record, false);

  const metadata = await firestore.doc(
    `institutes/${instituteId}/supportAttachments/${record.attachmentId}`,
  ).get();
  assert.equal(metadata.get("state"), "committed");
  assert.equal(metadata.get("ticketId"), applied.ticket.ticketId);
  assert.ok(metadata.get("deleteAfter") instanceof Timestamp);
  const objectPath = metadata.get("objectPath") as string;
  const [exists] = await bucket.file(objectPath).exists();
  assert.equal(exists, true);
  assert.doesNotMatch(objectPath, new RegExp(instituteId, "u"));

  const replayed = await service.createTicket(createRequest(instituteId, key, {
    attachments: [upload],
  }));
  assert.equal(replayed.disposition, "replayed");
  assert.deepEqual(replayed.message?.attachments, applied.message?.attachments);
  const [storedObjects] = await bucket.getFiles({
    prefix: objectPath.slice(0, objectPath.lastIndexOf("/") + 1),
  });
  assert.equal(storedObjects.length, 1);

  const download = await service.downloadAttachment({
    actorId: "admin_support",
    actorRole: "admin",
    attachmentId: record.attachmentId,
    instituteId,
    ticketId: applied.ticket.ticketId,
  });
  assert.equal(download.attachmentId, record.attachmentId);
  assert.equal(download.fileName, upload.fileName);
  assert.match(download.url, /^https:\/\/downloads\.parabolic\.test\/[a-f0-9]{64}$/u);
  assert.equal(Date.parse(download.expiresAt) - clock.now().toMillis(), 5 * 60 * 1_000);

  const audit = await firestore.collection(`institutes/${instituteId}/auditLogs`)
    .where("action", "==", "ATTACHMENT_DOWNLOADED").get();
  assert.equal(audit.size, 1);
  assert.equal("fileName" in audit.docs[0].data(), false);
  assert.equal("objectPath" in audit.docs[0].data(), false);

  const otherInstituteId = "inst_support_attachments_other";
  await seedInstitute(otherInstituteId);
  await assert.rejects(
    service.downloadAttachment({
      actorId: "admin_support",
      actorRole: "admin",
      attachmentId: record.attachmentId,
      instituteId: otherInstituteId,
      ticketId: applied.ticket.ticketId,
    }),
    (error: unknown) => error instanceof AdminSupportValidationError &&
      error.code === "NOT_FOUND",
  );
});

test("attachment cleanup removes expired staging and retained objects while preserving opaque message history", async () => {
  const instituteId = "inst_support_attachment_retention";
  await seedInstitute(instituteId);
  const clock = createClock();
  const attachments = attachmentService(clock);
  const service = new AdminSupportService({attachments, firestore, now: clock.now});
  const applied = await service.createTicket(createRequest(
    instituteId,
    "00000000-0000-4000-8000-000000000482",
    {attachments: [pngAttachment()]},
  ));
  const record = applied.message?.attachments[0];
  assert.ok(record);
  const metadataReference = firestore.doc(
    `institutes/${instituteId}/supportAttachments/${record.attachmentId}`,
  );
  const before = await metadataReference.get();
  const objectPath = before.get("objectPath") as string;
  await metadataReference.update({
    deleteAfter: Timestamp.fromMillis(clock.now().toMillis() - 1),
  });

  const cleanup = await attachments.cleanupExpired();
  assert.equal(cleanup.committedDeleted, 1);
  const after = await metadataReference.get();
  assert.equal(after.get("state"), "deleted");
  assert.equal(after.get("deleteReason"), "retention_expired");
  assert.equal(after.get("bucketName"), undefined);
  assert.equal(after.get("objectPath"), undefined);
  assert.equal((await bucket.file(objectPath).exists())[0], false);

  const detail = await service.getTicketDetail({
    actorId: "admin_support",
    actorRole: "admin",
    instituteId,
    ticketId: applied.ticket.ticketId,
  });
  assert.equal(detail.messages.items[0].attachments[0].downloadAvailable, false);
  await assert.rejects(
    service.downloadAttachment({
      actorId: "admin_support",
      actorRole: "admin",
      attachmentId: record.attachmentId,
      instituteId,
      ticketId: applied.ticket.ticketId,
    }),
    (error: unknown) => error instanceof AdminSupportValidationError &&
      error.code === "NOT_FOUND",
  );
});
