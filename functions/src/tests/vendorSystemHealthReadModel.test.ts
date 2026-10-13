/* eslint-disable max-len */
import assert from "node:assert/strict";
import test from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import {VendorSystemHealthReadService} from "../services/vendorSystemHealthReadModel";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";

assert.equal(process.env.GCLOUD_PROJECT, "demo-parabolic-test");
assert.ok(process.env.FIRESTORE_EMULATOR_HOST);

const firestore = getFirestore();
const prefix = "bwm040_health_";
const at = (hour: number) => Timestamp.fromDate(
  new Date(`2026-10-13T${String(hour).padStart(2, "0")}:00:00.000Z`),
);
const iso = (hour: number) => at(hour).toDate().toISOString();
const references = [
  ...["pending", "processing", "retrying", "completed", "failed"].map((state) =>
    firestore.doc(`systemFlags/failureRecoveryRetryQueue/jobs/${prefix}${state}`)),
  ...["pending", "processing", "retrying", "sent", "failed"].map((state) =>
    firestore.doc(`emailQueue/${prefix}${state}`)),
  ...["pending", "reconciled", "mismatch", "manual_review"].map((state) =>
    firestore.doc(`vendor/stripeEvents/events/${prefix}${state}`)),
  ...["pending", "applied", "not_applied", "rolled_back"].map((state) =>
    firestore.doc(`vendorCalibrationRollouts/${prefix}${state}`)),
];

const environment = {
  RELEASE_ID: "bwm040-health-release",
  RELEASE_COMMIT_SHA: "a".repeat(40),
  RELEASE_BUILT_AT: "2026-10-13T00:00:00.000Z",
  NODE_ENV: "test",
  K_REVISION: "bwm040-health-r1",
};

const service = (overrides: Record<string, string | undefined> = environment) =>
  new VendorSystemHealthReadService({
    firestore,
    environment: overrides,
    now: () => new Date("2026-10-13T12:00:00.000Z"),
  });

const cleanup = async () => Promise.all(references.map((reference) => reference.delete()));

const writeOverflowCalibrationDocuments = async (deleteOnly = false) => {
  const documentCount = 997;
  for (let offset = 0; offset < documentCount; offset += 400) {
    const batch = firestore.batch();
    for (let index = offset; index < Math.min(offset + 400, documentCount); index += 1) {
      const reference = firestore.doc(
        `vendorCalibrationRollouts/${prefix}overflow_${String(index).padStart(4, "0")}`,
      );
      if (deleteOnly) {
        batch.delete(reference);
      } else {
        batch.create(reference, {createdAt: iso(1), state: "applied", updatedAt: iso(1)});
      }
    }
    await batch.commit();
  }
};

const seed = async () => {
  await cleanup();
  await Promise.all([
    ...["pending", "processing", "retrying", "completed", "failed"].map((state, index) =>
      firestore.doc(`systemFlags/failureRecoveryRetryQueue/jobs/${prefix}${state}`).create({
        createdAt: at(index + 1), status: state, updatedAt: at(index + 2),
      })),
    ...["pending", "processing", "retrying", "sent", "failed"].map((state, index) =>
      firestore.doc(`emailQueue/${prefix}${state}`).create({
        createdAt: at(index + 2), sentAt: state === "sent" ? at(index + 3) : null,
        status: state, updatedAt: state === "pending" ? null : at(index + 3),
      })),
    ...["pending", "reconciled", "mismatch", "manual_review"].map((state, index) =>
      firestore.doc(`vendor/stripeEvents/events/${prefix}${state}`).create({
        createdAt: at(index + 3), occurredAt: at(index + 3), reconciliationState: state,
        updatedAt: at(index + 4),
      })),
    ...["pending", "applied", "not_applied", "rolled_back"].map((state, index) =>
      firestore.doc(`vendorCalibrationRollouts/${prefix}${state}`).create({
        createdAt: iso(index + 4), state, updatedAt: iso(index + 5),
      })),
  ]);
};

test.before(seed);
test.after(async () => {
  await cleanup();
  await getFirebaseAdminApp().delete();
});

test("system health returns exact source-specific counts, ages, release and unsupported availability", async () => {
  const result = await service().read();
  assert.equal(result.generatedAt, "2026-10-13T12:00:00.000Z");
  assert.deepEqual(result.release, {
    availability: "available",
    observedAt: result.generatedAt,
    data: {
      releaseId: environment.RELEASE_ID,
      commitSha: environment.RELEASE_COMMIT_SHA,
      builtAt: environment.RELEASE_BUILT_AT,
      environment: "test",
      functionsRevision: environment.K_REVISION,
    },
  });
  assert.deepEqual(result.failureRecovery, {
    availability: "available", observedAt: result.generatedAt,
    data: {totalCount: 5, outstandingCount: 3, processingCount: 1,
      retryingCount: 1, succeededCount: 1, failedCount: 1,
      oldestOutstandingAt: iso(1), newestActivityAt: iso(6)},
  });
  assert.deepEqual(result.emailDelivery, {
    availability: "available", observedAt: result.generatedAt,
    data: {totalCount: 5, outstandingCount: 3, processingCount: 1,
      retryingCount: 1, succeededCount: 1, failedCount: 1,
      oldestOutstandingAt: iso(2), newestActivityAt: iso(7)},
  });
  assert.deepEqual(result.stripeReconciliation, {
    availability: "available", observedAt: result.generatedAt,
    data: {totalCount: 4, outstandingCount: 3, processingCount: 1,
      retryingCount: 0, succeededCount: 1, failedCount: 1,
      oldestOutstandingAt: iso(3), newestActivityAt: iso(7)},
  });
  assert.deepEqual(result.calibrationOperations, {
    availability: "available", observedAt: result.generatedAt,
    data: {totalCount: 4, outstandingCount: 1, processingCount: 1,
      retryingCount: 0, succeededCount: 2, failedCount: 1,
      oldestOutstandingAt: iso(4), newestActivityAt: iso(8)},
  });
  assert.deepEqual(Object.fromEntries([
    "cloudMonitoring", "errorReporting", "costAndUsage", "latencyAndErrorMetrics",
    "frontendTelemetry", "deploymentHistory",
  ].map((key) => [key, result[key as keyof typeof result]])), {
    cloudMonitoring: {availability: "unavailable", reason: "adapter_not_implemented",
      observedAt: result.generatedAt},
    errorReporting: {availability: "unavailable", reason: "adapter_not_implemented",
      observedAt: result.generatedAt},
    costAndUsage: {availability: "unavailable", reason: "no_durable_source",
      observedAt: result.generatedAt},
    latencyAndErrorMetrics: {availability: "unavailable", reason: "no_durable_source",
      observedAt: result.generatedAt},
    frontendTelemetry: {availability: "unavailable", reason: "no_durable_source",
      observedAt: result.generatedAt},
    deploymentHistory: {availability: "unavailable", reason: "no_durable_source",
      observedAt: result.generatedAt},
  });
});

test("malformed durable state fails closed per source and reads do not mutate authority", async () => {
  await firestore.doc(`emailQueue/${prefix}pending`).update({status: "delivered"});
  const before = await Promise.all(references.map(async (reference) =>
    JSON.stringify((await reference.get()).data())));
  const result = await service().read();
  assert.deepEqual(result.emailDelivery, {
    availability: "unavailable", reason: "source_unavailable",
    observedAt: result.generatedAt,
  });
  assert.equal(result.failureRecovery.availability, "available");
  assert.equal(result.stripeReconciliation.availability, "available");
  assert.equal(result.calibrationOperations.availability, "available");
  const after = await Promise.all(references.map(async (reference) =>
    JSON.stringify((await reference.get()).data())));
  assert.deepEqual(after, before);
  await firestore.doc(`emailQueue/${prefix}pending`).update({status: "pending"});
});

test("missing and malformed runtime release identity are explicit unavailable sources", async () => {
  const missing = await service({}).read();
  assert.deepEqual(missing.release, {availability: "unavailable", reason: "not_configured",
    observedAt: missing.generatedAt});
  const malformed = await service({RELEASE_ID: "bad id", NODE_ENV: "test"}).read();
  assert.deepEqual(malformed.release, {availability: "unavailable", reason: "source_unavailable",
    observedAt: malformed.generatedAt});
});

test("every durable source isolates malformed states and timestamps and preserves stored bytes", async () => {
  const sources = [
    ["failureRecovery", `systemFlags/failureRecoveryRetryQueue/jobs/${prefix}pending`, "status", "createdAt"],
    ["emailDelivery", `emailQueue/${prefix}pending`, "status", "createdAt"],
    ["stripeReconciliation", `vendor/stripeEvents/events/${prefix}pending`, "reconciliationState", "createdAt"],
    ["calibrationOperations", `vendorCalibrationRollouts/${prefix}pending`, "state", "createdAt"],
  ] as const;
  for (const [name, path, stateField, timeField] of sources) {
    const ref = firestore.doc(path);
    const original = (await ref.get()).data();
    assert.ok(original);
    try {
      for (const field of [stateField, timeField]) {
        await ref.set({...original, [field]: "PRIVATE_INVALID_VALUE"});
        const before = (await ref.get()).data();
        const result = await service().read();
        assert.deepEqual(result[name], {availability: "unavailable", reason: "source_unavailable",
          observedAt: result.generatedAt});
        for (const [other] of sources) {
          if (other !== name) assert.equal(result[other].availability, "available");
        }
        assert.equal(JSON.stringify(result).includes("PRIVATE_INVALID_VALUE"), false);
        assert.deepEqual((await ref.get()).data(), before);
      }
    } finally {
      await ref.set(original);
    }
  }
});

test("absent durable sources report exact empty evidence rather than invented health", async () => {
  await cleanup();
  try {
    const result = await service().read();
    for (const name of ["failureRecovery", "emailDelivery", "stripeReconciliation", "calibrationOperations"] as const) {
      assert.deepEqual(result[name], {availability: "available", observedAt: result.generatedAt,
        data: {totalCount: 0, outstandingCount: 0, processingCount: 0, retryingCount: 0,
          succeededCount: 0, failedCount: 0, oldestOutstandingAt: null, newestActivityAt: null}});
    }
    assert.equal(result.cloudMonitoring.availability, "unavailable");
  } finally {
    await seed();
  }
});

test("a durable source above the exact read cap is unavailable, never truncated", async () => {
  try {
    await writeOverflowCalibrationDocuments();
    const last = firestore.doc(`vendorCalibrationRollouts/${prefix}overflow_0996`);
    await last.delete();
    const atCap = await service().read();
    assert.equal(atCap.calibrationOperations.availability, "available");
    if (atCap.calibrationOperations.availability === "available") {
      assert.equal(atCap.calibrationOperations.data.totalCount, 1000);
    }
    await last.create({createdAt: iso(1), state: "applied", updatedAt: iso(1)});
    const result = await service().read();
    assert.deepEqual(result.calibrationOperations, {
      availability: "unavailable", reason: "source_limit_exceeded",
      observedAt: result.generatedAt,
    });
    assert.equal(result.failureRecovery.availability, "available");
    assert.equal(result.emailDelivery.availability, "available");
    assert.equal(result.stripeReconciliation.availability, "available");
  } finally {
    await writeOverflowCalibrationDocuments(true);
  }
});
