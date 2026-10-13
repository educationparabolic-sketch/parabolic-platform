/* eslint-disable max-len */
import assert from "node:assert/strict";
import test from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import {VendorAuditReadError, VendorAuditReadService} from "../services/vendorAuditReadModel";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";

assert.equal(process.env.GCLOUD_PROJECT, "demo-parabolic-test");
assert.ok(process.env.FIRESTORE_EMULATOR_HOST);

const firestore = getFirestore();
const instituteId = "bwm040_audit_reader_institute";
const key = Buffer.alloc(32, 40);
const ids = {
  command: "vendor_institute_audit_bwm040_reader",
  system: "bwm040_system_audit",
  calibration: `cal_${"a".repeat(64)}`,
  stripe: "evt_provider_secret_bwm040",
  billing: `${instituteId}__2026-09`,
  license: "bwm040_license_history",
};

const at = (hour: number) =>
  Timestamp.fromDate(new Date(`2026-10-13T${String(hour).padStart(2, "0")}:00:00.000Z`));

const service = () => new VendorAuditReadService({
  firestore,
  cursorKey: key,
  now: () => new Date("2026-10-13T12:00:00.000Z"),
});

const cleanup = async () => {
  await Promise.all([
    firestore.doc(`vendorAuditLogs/${ids.command}`).delete(),
    firestore.doc(`vendorAuditLogs/${ids.system}`).delete(),
    firestore.doc(`vendorCalibrationLogs/${ids.calibration}`).delete(),
    firestore.doc(`vendor/stripeEvents/events/${ids.stripe}`).delete(),
    firestore.doc(`billingSnapshots/${ids.billing}`).delete(),
  ]);
  const institute = firestore.doc(`institutes/${instituteId}`);
  if ((await institute.get()).exists ||
    !(await institute.collection("licenseHistory").limit(1).get()).empty) {
    await firestore.recursiveDelete(institute);
  }
};

const seed = async () => {
  await cleanup();
  await firestore.doc(`vendorAuditLogs/${ids.command}`).create({
    action: "update_profile",
    actorRole: "vendor",
    actorUserId: "vendor_reader_actor",
    auditEventId: ids.command,
    fingerprint: "must-not-project",
    idempotencyKeyHash: "must-not-project",
    instituteId,
    ipAddressHash: "must-not-project",
    occurredAt: at(10),
    summary: "Vendor updated institute profile.",
    userAgentHash: "must-not-project",
  });
  await firestore.doc(`vendorAuditLogs/${ids.system}`).create({
    actionType: "PAYMENT_EVENT_PROCESSED",
    actorRole: "system",
    actorUid: "stripe_webhook",
    auditId: ids.system,
    instituteId: null,
    metadata: {
      billingRecordPath: `institutes/${instituteId}/billingRecords/private`,
      eventId: ids.stripe,
      eventType: "invoice.payment_succeeded",
      instituteId,
      rawPayload: {secret: "must-not-project"},
      stripeWebhookStatus: "succeeded",
    },
    targetCollection: `institutes/${instituteId}/license`,
    targetId: "current",
    timestamp: at(9),
  });
  const completedAt = "2026-10-13T08:00:00.000Z";
  await firestore.doc(`vendorCalibrationLogs/${ids.calibration}`).create({
    schemaVersion: 1,
    operationId: ids.calibration,
    vendorUid: "vendor_reader_actor",
    requestFingerprint: "b".repeat(64),
    sourceFingerprint: null,
    requestedInstituteIds: [instituteId],
    receipt: {
      schemaVersion: 1,
      operationId: ids.calibration,
      kind: "rollout",
      originalOperationId: null,
      revision: 2,
      versionId: "bwm040_version",
      completedAt,
      vendorCalibrationLogPath: `vendorCalibrationLogs/${ids.calibration}`,
      state: "not_applied",
      targets: [],
      failureCode: "INVALID_TARGET",
    },
  });
  await firestore.doc(`vendor/stripeEvents/events/${ids.stripe}`).create({
    createdAt: at(7),
    eventId: ids.stripe,
    eventType: "invoice.payment_failed",
    instituteId,
    occurredAt: at(7),
    processingState: "failed_retryable",
    provider: "stripe",
    rawPayload: {secret: "must-not-project"},
    reconciliationState: "pending",
    revision: 1,
    updatedAt: at(7),
  });
  await firestore.doc(`billingSnapshots/${ids.billing}`).create({
    activeStudentCount: 12,
    billingCycle: "monthly",
    createdAt: at(6),
    currency: "INR",
    cycleEnd: "2026-09-30T23:59:59.999Z",
    cycleId: "2026-09",
    cycleStart: "2026-09-01T00:00:00.000Z",
    generatedAt: at(6),
    immutable: true,
    instituteId,
    instituteName: "BWM-040 Institute",
    invoiceAmount: 1250,
    invoiceId: ids.billing,
    licenseLayer: "L2",
    licenseTier: "L2",
    monthlyRevenue: 1250,
    monthlyRevenueMinor: 125000,
    peakActiveStudents: 12,
    peakUsage: 12,
    schemaVersion: 1,
    stripeWebhookStatus: "succeeded",
  });
  await firestore.doc(`institutes/${instituteId}`).set({instituteId});
  await firestore.doc(`institutes/${instituteId}/licenseHistory/${ids.license}`).create({
    billingPlan: "Controlled",
    changedBy: "vendor_reader_actor",
    effectiveDate: "2026-10-13T05:00:00.000Z",
    entryId: ids.license,
    instituteId,
    newLayer: "L2",
    previousLayer: "L1",
    reason: "Approved plan change with confidential note.",
    stripeInvoiceId: "in_secret_provider_invoice",
    timestamp: at(5),
  });
};

test.before(seed);
test.after(async () => {
  await cleanup();
  await getFirebaseAdminApp().delete();
});

test("strict fan-in orders all source families and exposes only allowlisted fields", async () => {
  const result = await service().listEvents({instituteId, limit: 25});
  assert.equal(result.generatedAt, "2026-10-13T12:00:00.000Z");
  assert.equal(result.hasMore, false);
  assert.equal(result.nextCursor, null);
  assert.deepEqual(result.items.map((item) => item.source), [
    "vendor_command_audit",
    "vendor_system_audit",
    "calibration_terminal",
    "stripe_event",
    "billing_snapshot",
    "license_history",
  ]);
  assert.deepEqual(result.items.map((item) => item.occurredAt), [10, 9, 8, 7, 6, 5]
    .map((hour) => `2026-10-13T${String(hour).padStart(2, "0")}:00:00.000Z`));
  const serialized = JSON.stringify(result);
  for (const forbidden of [ids.stripe, "rawPayload", "must-not-project",
    "idempotencyKeyHash", "ipAddressHash", "billingRecordPath",
    "in_secret_provider_invoice", "Approved plan change with confidential note"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
  const calibration = result.items.find((item) => item.source === "calibration_terminal");
  assert.equal(calibration?.status, "failed");
  assert.equal(calibration ? "failureCode" in calibration.metadata : true, false);
  assert.equal(calibration?.metadata.affectedInstituteCount, 0);
  const billing = result.items.find((item) => item.source === "billing_snapshot");
  assert.equal(billing?.metadata.amountMinor, 125000);
  assert.equal(billing?.metadata.currency, "INR");
});

test("encrypted filter-bound continuation vectors preserve every merged event", async () => {
  const observed: string[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10; page += 1) {
    const result = await service().listEvents({instituteId, limit: 2, cursor});
    observed.push(...result.items.map((item) => `${item.occurredAt}:${item.source}`));
    if (!result.hasMore) {
      assert.equal(result.nextCursor, null);
      break;
    }
    assert.ok(result.nextCursor);
    assert.equal(Buffer.from(result.nextCursor, "base64url").toString("utf8")
      .includes(ids.stripe), false);
    assert.equal(Buffer.from(result.nextCursor, "base64url").toString("utf8")
      .includes("vendorAuditLogs"), false);
    cursor = result.nextCursor ?? undefined;
  }
  assert.equal(observed.length, 6);
  assert.equal(new Set(observed).size, 6);
  const first = await service().listEvents({instituteId, limit: 2});
  assert.ok(first.nextCursor);
  await assert.rejects(
    service().listEvents({instituteId, limit: 2, category: "billing",
      cursor: first.nextCursor ?? undefined}),
    (error: unknown) => error instanceof VendorAuditReadError &&
      error.code === "VALIDATION_ERROR",
  );
  const cursorValue = first.nextCursor as string;
  const tampered = `${cursorValue.slice(0, -1)}${cursorValue.endsWith("A") ? "B" : "A"}`;
  await assert.rejects(
    service().listEvents({instituteId, limit: 2, cursor: tampered}),
    (error: unknown) => error instanceof VendorAuditReadError &&
      error.code === "VALIDATION_ERROR",
  );
});

test("filters are exact, malformed selected authority fails closed, and reads write nothing", async () => {
  const webhook = await service().listEvents({category: "webhook", instituteId, limit: 25});
  assert.deepEqual(webhook.items.map((item) => item.source), [
    "vendor_system_audit", "stripe_event",
  ]);
  const failed = await service().listEvents({status: "failed", instituteId, limit: 25});
  assert.deepEqual(failed.items.map((item) => item.source), [
    "calibration_terminal", "stripe_event",
  ]);
  const before = await Promise.all([
    firestore.collection("vendorAuditLogs").get(),
    firestore.collection("vendorCalibrationLogs").get(),
    firestore.collection("vendor/stripeEvents/events").get(),
    firestore.collection("billingSnapshots").get(),
    firestore.collectionGroup("licenseHistory").get(),
  ]);
  await service().listEvents({instituteId, from: "2026-10-13T05:00:00.000Z",
    to: "2026-10-13T10:00:00.000Z", limit: 25});
  const after = await Promise.all([
    firestore.collection("vendorAuditLogs").get(),
    firestore.collection("vendorCalibrationLogs").get(),
    firestore.collection("vendor/stripeEvents/events").get(),
    firestore.collection("billingSnapshots").get(),
    firestore.collectionGroup("licenseHistory").get(),
  ]);
  assert.deepEqual(after.map((snapshot) => snapshot.size),
    before.map((snapshot) => snapshot.size));
  assert.deepEqual(after.map((snapshot) => snapshot.docs.map((doc) => [doc.ref.path, doc.data()])),
    before.map((snapshot) => snapshot.docs.map((doc) => [doc.ref.path, doc.data()])));

  await firestore.doc(`vendor/stripeEvents/events/${ids.stripe}`).update({
    eventType: null,
  });
  await assert.rejects(
    service().listEvents({instituteId, limit: 25}),
    (error: unknown) => error instanceof VendorAuditReadError &&
      error.code === "SOURCE_INVALID",
  );
  await firestore.doc(`vendor/stripeEvents/events/${ids.stripe}`).update({
    eventType: "invoice.payment_failed",
  });
});

test("equal-time source ties traverse once even when a newer family splits the page", async () => {
  const original = (await firestore.doc(`vendorAuditLogs/${ids.command}`).get()).data();
  assert.ok(original);
  const refs = Array.from({length: 8}, (_, index) =>
    firestore.doc(`vendorAuditLogs/vendor_institute_audit_bwm040_tie_${index}`));
  try {
    await firestore.doc(`vendorAuditLogs/${ids.command}`).update({occurredAt: at(8)});
    await Promise.all(refs.map((ref) => ref.create({...original,
      auditEventId: ref.id, occurredAt: at(8)})));
    const all = await service().listEvents({instituteId, limit: 50});
    const observed: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 30; page += 1) {
      const result = await service().listEvents({instituteId, limit: 2, cursor});
      observed.push(...result.items.map((item) => item.eventId));
      if (!result.hasMore) break;
      assert.ok(result.nextCursor);
      cursor = result.nextCursor;
    }
    assert.equal(new Set(observed).size, observed.length, "continuation must not repeat a tie");
    assert.deepEqual(observed, all.items.map((item) => item.eventId));
  } finally {
    await Promise.all(refs.map((ref) => ref.delete()));
    await firestore.doc(`vendorAuditLogs/${ids.command}`).set(original);
  }
});

test("each selected source fails closed without leaking its malformed private value", async () => {
  for (const [path, update] of [
    [`vendorAuditLogs/${ids.command}`, {actorRole: 123}],
    [`vendorAuditLogs/${ids.system}`, {actionType: "PRIVATE_UNKNOWN_ACTION"}],
    [`vendorCalibrationLogs/${ids.calibration}`, {schemaVersion: 99}],
    [`vendor/stripeEvents/events/${ids.stripe}`, {processingState: "PRIVATE_UNKNOWN_STATE"}],
    [`billingSnapshots/${ids.billing}`, {monthlyRevenueMinor: -1}],
    [`institutes/${instituteId}/licenseHistory/${ids.license}`, {newLayer: "PRIVATE_LAYER"}],
  ] as const) {
    const ref = firestore.doc(path);
    const original = (await ref.get()).data();
    assert.ok(original);
    try {
      await ref.update(update);
      await assert.rejects(service().listEvents({instituteId, limit: 50}),
        (error: unknown) => error instanceof VendorAuditReadError && error.code === "SOURCE_INVALID");
      assert.deepEqual((await ref.get()).data(), {...original, ...update});
    } finally {
      await ref.set(original);
    }
  }
});

test("sparse filtered pages progress and every selection dimension binds the cursor", async () => {
  const first = await service().listEvents({instituteId, limit: 1});
  assert.ok(first.nextCursor);
  for (const change of [{instituteId: "other"}, {limit: 2}, {status: "pending"},
    {category: "billing"}, {from: "2026-10-13T00:00:00.000Z"},
    {to: "2026-10-13T23:00:00.000Z"}] as const) {
    await assert.rejects(service().listEvents({instituteId, limit: 1,
      cursor: first.nextCursor, ...change}),
    (error: unknown) => error instanceof VendorAuditReadError && error.code === "VALIDATION_ERROR");
  }
  const otherKey = new VendorAuditReadService({firestore, cursorKey: Buffer.alloc(32, 41)});
  await assert.rejects(otherKey.listEvents({instituteId, limit: 1, cursor: first.nextCursor}),
    (error: unknown) => error instanceof VendorAuditReadError && error.code === "VALIDATION_ERROR");
  let cursor: string | undefined;
  let finished = false;
  for (let page = 0; page < 10; page += 1) {
    const result = await service().listEvents({instituteId: "absent_institute", limit: 1, cursor});
    assert.deepEqual(result.items, []);
    if (!result.hasMore) {
      finished = true;
      break;
    }
    assert.ok(result.nextCursor);
    assert.notEqual(result.nextCursor, cursor);
    cursor = result.nextCursor;
  }
  assert.equal(finished, true, "sparse scans must reach the end without invented events");
});
