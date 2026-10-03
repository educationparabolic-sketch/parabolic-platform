/* eslint-disable max-len */
import assert from "node:assert/strict";
import test from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import * as gcpMetadata from "gcp-metadata";
import {VendorLicenseRequestsService} from "../services/vendorLicenseRequests";
import {VendorCommercialValidationError} from "../types/vendorCommercial";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "demo-parabolic-test";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();
const TEST_PREFIX = "bwm035_license_request_";
let currentTime = new Date("2026-10-02T12:00:00.000Z");
const service = new VendorLicenseRequestsService({
  firestore,
  now: () => new Date(currentTime),
});

const at = (value: string): Timestamp => Timestamp.fromDate(new Date(value));

const uuid = (suffix: string): string =>
  `20000000-0000-4000-8000-${suffix.padStart(12, "0")}`;

const requestId = (suffix: string): string => `license_request_${suffix}`;

const submissionAuditId = (suffix: string): string =>
  `license_request_audit_${suffix}`;

const cleanup = async (): Promise<void> => {
  const institutes = await firestore.collection("institutes").get();
  await Promise.all(institutes.docs
    .filter((document) => document.id.startsWith(TEST_PREFIX))
    .map((document) => firestore.recursiveDelete(document.ref)));
  const audits = await firestore.collection("vendorAuditLogs")
    .where("instituteId", ">=", TEST_PREFIX)
    .where("instituteId", "<", `${TEST_PREFIX}\uf8ff`)
    .get();
  await Promise.all(audits.docs.map((document) => document.ref.delete()));
};

const seedRequest = async (input: {
  instituteId: string;
  legacyRevision?: boolean;
  requestSuffix: string;
  requestedLayer?: "L2" | "L3";
  status?: "pending" | "payment_required";
  submittedAt?: string;
}): Promise<{requestId: string; submissionAuditId: string}> => {
  const id = requestId(input.requestSuffix);
  const auditId = submissionAuditId(input.requestSuffix);
  const submittedAt = at(input.submittedAt ?? "2026-10-02T10:00:00.000Z");
  const instituteReference = firestore.collection("institutes")
    .doc(input.instituteId);
  await instituteReference.set({
    instituteId: input.instituteId,
    licenseVersion: `license_${input.instituteId}_v1`,
    registeredName: `Institute ${input.instituteId}`,
    status: "active",
  });
  await instituteReference.collection("license").doc("current").set({
    currentLayer: "L1",
    licenseState: "active",
    licenseVersion: `license_${input.instituteId}_v1`,
    planId: "L1-standard",
  });
  await instituteReference.collection("licenseRequests").doc(id).set({
    currentLayer: "L1",
    currentPlanId: "L1-standard",
    decidedAt: null,
    decidedByUserId: null,
    decisionAuditEventIds: [],
    decisionNote: null,
    decisionState: "undecided",
    expectedLicenseVersion: `license_${input.instituteId}_v1`,
    instituteId: input.instituteId,
    reason: "The institute requires controlled examination capability.",
    requestId: id,
    requestKind: input.requestedLayer === "L3" ? "evaluation" : "upgrade",
    requestedLayer: input.requestedLayer ?? "L2",
    requestedPlanId: `${input.requestedLayer ?? "L2"}-standard`,
    ...(!input.legacyRevision ? {revision: 1} : {}),
    status: input.status ?? "pending",
    submissionAuditEventId: auditId,
    submittedAt,
    submittedByUserId: `admin_${input.instituteId}`,
    ...(!input.legacyRevision ? {updatedAt: submittedAt} : {}),
  });
  await instituteReference.collection("licenseRequestAudit").doc(auditId).set({
    auditEventId: auditId,
    instituteId: input.instituteId,
    occurredAt: submittedAt,
    requestId: id,
  });
  await instituteReference.collection("licenseRequestState").doc("current").set({
    openRequestId: id,
    updatedAt: submittedAt,
  });
  return {requestId: id, submissionAuditId: auditId};
};

const decision = (input: {
  action: "approve" | "require_payment" | "reject";
  expectedRevision: number;
  idempotencyKey: string;
  instituteId: string;
  requestId: string;
}) => service.normalizeDecisionRequest({
  action: input.action,
  actorId: "vendor_license_operator",
  actorRole: "vendor",
  expectedRevision: input.expectedRevision,
  idempotencyKey: input.idempotencyKey,
  instituteId: input.instituteId,
  note: input.action === "reject" ? undefined : "Commercial review completed.",
  reason: input.action === "reject" ?
    "Commercial prerequisites were not satisfied." : undefined,
  requestId: input.requestId,
});

const expectCode = async (
  promise: Promise<unknown>,
  code: VendorCommercialValidationError["code"],
): Promise<void> => {
  await assert.rejects(promise, (error: unknown) =>
    error instanceof VendorCommercialValidationError && error.code === code);
};

test.before(async () => {
  await cleanup();
});

test.after(async () => {
  await cleanup();
  await getFirebaseAdminApp().delete();
});

test("normalizers require Vendor context and bounded decision intent", () => {
  assert.deepEqual(service.normalizeListRequest({
    actorId: "vendor_operator",
    actorRole: "vendor",
    requestedLayer: "l2",
    status: "PENDING",
  }), {
    actorId: "vendor_operator",
    actorRole: "vendor",
    limit: 25,
    requestedLayer: "L2",
    status: "pending",
  });
  assert.throws(() => service.normalizeListRequest({
    actorId: "admin_operator",
    actorRole: "admin",
  }), (error: unknown) =>
    error instanceof VendorCommercialValidationError &&
    error.code === "FORBIDDEN");
  assert.throws(() => service.normalizeListRequest({
    actorId: "vendor_operator",
    actorRole: "vendor",
    limit: 51,
  }));
  assert.throws(() => service.normalizeDecisionRequest({
    action: "approve",
    actorId: "vendor_operator",
    actorRole: "vendor",
    expectedRevision: 0,
    idempotencyKey: "not-a-uuid",
    instituteId: `${TEST_PREFIX}normalize`,
    requestId: requestId("normalize"),
  }));
});

test("request queue is bounded, filter-bound, and supports legacy revision one", async () => {
  const instituteId = `${TEST_PREFIX}list`;
  const newest = await seedRequest({
    instituteId,
    legacyRevision: true,
    requestSuffix: "list_newest",
    submittedAt: "2026-10-02T11:00:00.000Z",
  });
  await seedRequest({
    instituteId: `${TEST_PREFIX}list_second`,
    requestSuffix: "list_second",
    requestedLayer: "L3",
    submittedAt: "2026-10-02T10:00:00.000Z",
  });

  const first = await service.listRequests(service.normalizeListRequest({
    actorId: "vendor_operator",
    actorRole: "vendor",
    limit: 1,
    status: "pending",
  }));
  assert.equal(first.items.length, 1);
  assert.equal(first.items[0]?.requestId, newest.requestId);
  assert.equal(first.items[0]?.revision, 1);
  assert.equal(first.totalMatching, 2);
  assert.ok(first.nextCursor);

  const second = await service.listRequests(service.normalizeListRequest({
    actorId: "vendor_operator",
    actorRole: "vendor",
    cursor: first.nextCursor,
    limit: 1,
    status: "pending",
  }));
  assert.equal(second.items.length, 1);
  assert.notEqual(second.items[0]?.requestId, newest.requestId);
  assert.equal(second.nextCursor, null);

  await assert.rejects(service.listRequests(service.normalizeListRequest({
    actorId: "vendor_operator",
    actorRole: "vendor",
    cursor: first.nextCursor,
    limit: 1,
    requestedLayer: "L3",
    status: "pending",
  })), /cursor/u);

  const detail = await service.getRequestDetail(
    service.normalizeDetailRequest({
      actorId: "vendor_operator",
      actorRole: "vendor",
      instituteId,
      requestId: newest.requestId,
    }),
  );
  assert.equal(detail.revision, 1);
  assert.equal(detail.audit.length, 1);
  assert.equal(detail.audit[0]?.auditEventId, newest.submissionAuditId);
});

test("payment-required then approval is replay-safe and never mutates entitlement", async () => {
  const instituteId = `${TEST_PREFIX}approve`;
  const seeded = await seedRequest({
    instituteId,
    requestSuffix: "approve",
  });
  const institutePath = `institutes/${instituteId}`;
  const licenseReference = firestore.doc(`${institutePath}/license/current`);
  const licenseBefore = (await licenseReference.get()).data();
  const paymentCommand = decision({
    action: "require_payment",
    expectedRevision: 1,
    idempotencyKey: uuid("1"),
    instituteId,
    requestId: seeded.requestId,
  });

  const paymentRequired = await service.decideRequest(paymentCommand);
  const replayed = await service.decideRequest(paymentCommand);
  assert.equal(paymentRequired.status, "payment_required");
  assert.equal(paymentRequired.revision, 2);
  assert.equal(paymentRequired.propagationState, "not_required");
  assert.equal(paymentRequired.providerOperation, null);
  assert.equal(replayed.replayed, true);
  assert.equal(replayed.commandId, paymentRequired.commandId);
  assert.equal(
    (await firestore.doc(`${institutePath}/licenseRequestState/current`).get())
      .get("openRequestId"),
    seeded.requestId,
  );

  currentTime = new Date("2026-10-02T12:05:00.000Z");
  const approved = await service.decideRequest(decision({
    action: "approve",
    expectedRevision: 2,
    idempotencyKey: uuid("2"),
    instituteId,
    requestId: seeded.requestId,
  }));
  assert.equal(approved.status, "approved");
  assert.equal(approved.revision, 3);
  assert.equal(approved.propagationState, "not_required");
  assert.equal(
    (await firestore.doc(`${institutePath}/licenseRequestState/current`).get())
      .get("openRequestId"),
    null,
  );
  assert.deepEqual((await licenseReference.get()).data(), licenseBefore);
  assert.equal(
    (await firestore.collection(`${institutePath}/licenseHistory`).get()).size,
    0,
  );

  const [commands, instituteAudits, rootAudits, detail] = await Promise.all([
    firestore.collection(`${institutePath}/commercialCommands`).get(),
    firestore.collection(`${institutePath}/auditLogs`).get(),
    firestore.collection("vendorAuditLogs")
      .where("instituteId", "==", instituteId).get(),
    service.getRequestDetail(service.normalizeDetailRequest({
      actorId: "vendor_operator",
      actorRole: "vendor",
      instituteId,
      requestId: seeded.requestId,
    })),
  ]);
  assert.equal(commands.size, 2);
  assert.equal(instituteAudits.size, 2);
  assert.equal(rootAudits.size, 2);
  assert.equal(detail.audit.length, 3);
  assert.equal(detail.status, "approved");
  assert.equal(detail.decisionNote, "Commercial review completed.");
  assert.equal(JSON.stringify(commands.docs[0]?.data()).includes(uuid("1")), false);
});

test("concurrent terminal decisions admit one winner and preserve sentinel integrity", async () => {
  const instituteId = `${TEST_PREFIX}race`;
  const seeded = await seedRequest({
    instituteId,
    requestSuffix: "race",
  });
  const results = await Promise.allSettled([
    service.decideRequest(decision({
      action: "approve",
      expectedRevision: 1,
      idempotencyKey: uuid("3"),
      instituteId,
      requestId: seeded.requestId,
    })),
    service.decideRequest(decision({
      action: "reject",
      expectedRevision: 1,
      idempotencyKey: uuid("4"),
      instituteId,
      requestId: seeded.requestId,
    })),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  const rejected = results.find((result) => result.status === "rejected");
  assert.ok(rejected && rejected.status === "rejected");
  assert.ok(rejected.reason instanceof VendorCommercialValidationError);
  assert.equal(rejected.reason.code, "CONFLICT");

  const institutePath = `institutes/${instituteId}`;
  const [storedRequest, state, commands, audits] = await Promise.all([
    firestore.doc(`${institutePath}/licenseRequests/${seeded.requestId}`).get(),
    firestore.doc(`${institutePath}/licenseRequestState/current`).get(),
    firestore.collection(`${institutePath}/commercialCommands`).get(),
    firestore.collection(`${institutePath}/auditLogs`).get(),
  ]);
  assert.ok(["approved", "rejected"].includes(storedRequest.get("status")));
  assert.equal(storedRequest.get("revision"), 2);
  assert.equal(state.get("openRequestId"), null);
  assert.equal(commands.size, 1);
  assert.equal(audits.size, 1);
});

test("stale revisions, changed command intent, and broken sentinel fail closed", async () => {
  const instituteId = `${TEST_PREFIX}conflict`;
  const seeded = await seedRequest({
    instituteId,
    requestSuffix: "conflict",
  });
  await expectCode(service.decideRequest(decision({
    action: "approve",
    expectedRevision: 2,
    idempotencyKey: uuid("5"),
    instituteId,
    requestId: seeded.requestId,
  })), "CONFLICT");

  const command = decision({
    action: "require_payment",
    expectedRevision: 1,
    idempotencyKey: uuid("6"),
    instituteId,
    requestId: seeded.requestId,
  });
  await service.decideRequest(command);
  if (command.command.action !== "require_payment") {
    throw new Error("Expected payment-required command.");
  }
  await expectCode(service.decideRequest({
    ...command,
    command: {...command.command, note: "Changed intent."},
  }), "CONFLICT");

  const brokenInstituteId = `${TEST_PREFIX}broken_sentinel`;
  const broken = await seedRequest({
    instituteId: brokenInstituteId,
    requestSuffix: "broken_sentinel",
  });
  await firestore.doc(
    `institutes/${brokenInstituteId}/licenseRequestState/current`,
  ).set({openRequestId: "different_request", updatedAt: at("2026-10-02T12:00:00.000Z")});
  await expectCode(service.decideRequest(decision({
    action: "reject",
    expectedRevision: 1,
    idempotencyKey: uuid("7"),
    instituteId: brokenInstituteId,
    requestId: broken.requestId,
  })), "INTERNAL_ERROR");
});
