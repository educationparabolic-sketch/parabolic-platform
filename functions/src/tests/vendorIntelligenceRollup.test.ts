import assert from "node:assert/strict";
import test from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import * as gcpMetadata from "gcp-metadata";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {
  VendorIntelligenceRollupService,
} from "../services/vendorIntelligenceRollup";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-bwm-037-rollup";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();
const monthId = "2026-08";
const instituteIds = [
  "inst_bwm_037_rollup_a",
  "inst_bwm_037_rollup_b",
];

const recursivelyDelete = async (path: string): Promise<void> => {
  const reference = firestore.doc(path);
  const snapshot = await reference.get();
  if (snapshot.exists) await firestore.recursiveDelete(reference);
};

const seedInstitute = async (input: {
  activeStudents: number;
  assignments: number;
  currency?: string;
  instituteId: string;
  layer: "L0" | "L1" | "L2" | "L3";
  revenueMinor: number;
  sessions: number;
  status: "active" | "suspended";
  transition?: {from: "L0" | "L1" | "L2"; to: "L1" | "L2" | "L3"};
}): Promise<void> => {
  const institutePath = `institutes/${input.instituteId}`;
  const batch = firestore.batch();
  batch.set(firestore.doc(institutePath), {
    instituteId: input.instituteId,
    name: `Rollup ${input.instituteId}`,
    status: input.status,
  });
  batch.set(firestore.doc(`${institutePath}/license/current`), {
    currentLayer: input.layer,
    licenseState: "active",
    licenseVersion: `license_${input.instituteId}`,
  });
  batch.set(firestore.doc(`${institutePath}/usageMeter/${monthId}`), {
    activeStudentCount: input.activeStudents,
    assignmentsCreated: input.assignments,
    cycleId: monthId,
    sessionExecutionVolume: input.sessions,
    updatedAt: Timestamp.fromDate(new Date("2026-08-31T20:00:00.000Z")),
  });
  batch.set(
    firestore.doc(`billingSnapshots/${input.instituteId}__${monthId}`),
    {
      currency: input.currency ?? "INR",
      cycleId: monthId,
      immutable: true,
      instituteId: input.instituteId,
      monthlyRevenueMinor: input.revenueMinor,
      schemaVersion: 1,
    },
  );
  batch.set(firestore.doc(`${institutePath}/academicYears/2026-27`), {
    status: "active",
  });
  batch.set(
    firestore.doc(
      `${institutePath}/academicYears/2026-27/` +
      "governanceSnapshots/2026_08",
    ),
    {
      generatedAt: Timestamp.fromDate(new Date("2026-09-01T00:15:00.000Z")),
      immutable: true,
      instituteId: input.instituteId,
      month: monthId,
      schemaVersion: 1,
    },
  );
  if (input.transition) {
    batch.set(
      firestore.doc(
        `${institutePath}/licenseHistory/transition_${input.instituteId}`,
      ),
      {
        effectiveDate: "2026-08-15T00:00:00.000Z",
        instituteId: input.instituteId,
        newLayer: input.transition.to,
        previousLayer: input.transition.from,
      },
    );
  }
  await batch.commit();
};

const seedRetentionSnapshots = async (): Promise<void> => {
  const batch = firestore.batch();
  for (let offset = 0; offset < 25; offset += 1) {
    const date = new Date(Date.UTC(2024, offset, 1));
    const id = `${date.getUTCFullYear()}-${String(
      date.getUTCMonth() + 1,
    ).padStart(2, "0")}`;
    batch.set(firestore.doc(`vendorIntelligenceSnapshots/${id}`), {
      immutable: true,
      monthId: id,
      sourceFingerprint: `retention_${id}`,
      status: "complete",
    });
  }
  await batch.commit();
};

test.before(async () => {
  await Promise.all([
    ...instituteIds.map((id) => recursivelyDelete(`institutes/${id}`)),
    recursivelyDelete(`vendorIntelligenceRollups/${monthId}`),
  ]);
  const existingSnapshots = await firestore
    .collection("vendorIntelligenceSnapshots")
    .get();
  await Promise.all(existingSnapshots.docs.map((document) =>
    firestore.recursiveDelete(document.ref)));
});

test.after(async () => {
  await Promise.all([
    ...instituteIds.map((id) => recursivelyDelete(`institutes/${id}`)),
    recursivelyDelete(`vendorIntelligenceRollups/${monthId}`),
    ...instituteIds.map((id) =>
      recursivelyDelete(`vendorAggregates/${id}`)),
  ]);
  const snapshots = await firestore
    .collection("vendorIntelligenceSnapshots")
    .get();
  await Promise.all(snapshots.docs.map((document) =>
    firestore.recursiveDelete(document.ref)));
  const billing = await firestore.collection("billingSnapshots").get();
  await Promise.all(billing.docs.map((document) =>
    firestore.recursiveDelete(document.ref)));
  await getFirebaseAdminApp().delete();
});

test(
  "rollup resumes bounded pages, installs exact aggregates, retains 24 " +
    "snapshots, and preserves the last complete month on malformed input",
  async () => {
    await seedRetentionSnapshots();
    await seedInstitute({
      activeStudents: 120,
      assignments: 8,
      instituteId: instituteIds[0],
      layer: "L2",
      revenueMinor: 180000,
      sessions: 340,
      status: "active",
      transition: {from: "L1", to: "L2"},
    });
    await seedInstitute({
      activeStudents: 30,
      assignments: 3,
      instituteId: instituteIds[1],
      layer: "L1",
      revenueMinor: 65000,
      sessions: 90,
      status: "suspended",
    });

    const service = new VendorIntelligenceRollupService({
      firestore,
      maxPagesPerRun: 1,
      now: () => new Date("2026-09-01T02:00:00.000Z"),
      pageSize: 1,
    });
    let result = await service.generateMonthlyRollup({
      monthId,
      workerId: "worker_1",
    });
    assert.equal(result.state, "pending");
    for (let attempt = 2; attempt <= 8 && result.state !== "complete"; attempt += 1) {
      result = await service.generateMonthlyRollup({
        monthId,
        workerId: `worker_${attempt}`,
      });
    }
    assert.equal(result.state, "complete");
    assert.equal(result.phase, "complete");

    const [operation, snapshot, aggregateA, aggregateB] = await Promise.all([
      firestore.doc(`vendorIntelligenceRollups/${monthId}`).get(),
      firestore.doc(`vendorIntelligenceSnapshots/${monthId}`).get(),
      firestore.doc(`vendorAggregates/${instituteIds[0]}`).get(),
      firestore.doc(`vendorAggregates/${instituteIds[1]}`).get(),
    ]);
    assert.equal(operation.get("state"), "complete");
    assert.equal(operation.get("processedInstituteCount"), 2);
    assert.equal(snapshot.get("status"), "complete");
    assert.equal(snapshot.get("totalInstituteCount"), 2);
    assert.equal(snapshot.get("activeInstituteCount"), 1);
    assert.equal(snapshot.get("suspendedInstituteCount"), 1);
    assert.equal(snapshot.get("totalActiveStudents"), 150);
    assert.equal(snapshot.get("totalMonthlyRevenueMinor"), 245000);
    assert.equal(snapshot.get("currency"), "INR");
    assert.deepEqual(snapshot.get("instituteCountByLayer"), {
      L0: 0,
      L1: 1,
      L2: 1,
      L3: 0,
    });
    assert.deepEqual(snapshot.get("revenueByLayerMinor"), {
      L0: 0,
      L1: 65000,
      L2: 180000,
      L3: 0,
    });
    assert.deepEqual(snapshot.get("sourceDocumentCounts"), {
      billingSnapshots: 2,
      governanceSnapshots: 2,
      licenseHistory: 1,
      usageMeter: 2,
    });
    assert.equal(snapshot.get("transitionCount"), 1);
    assert.equal(aggregateA.get("currentLayer"), "L2");
    assert.equal(aggregateA.get("monthlyRecurringRevenue.amountMinor"), 180000);
    assert.equal(aggregateB.get("currentLayer"), "L1");
    assert.equal(aggregateB.get("instituteStatus"), "suspended");

    const retained = await firestore
      .collection("vendorIntelligenceSnapshots")
      .get();
    assert.equal(retained.size, 24);
    assert.equal(
      (await firestore.doc("vendorIntelligenceSnapshots/2024-01").get()).exists,
      false,
    );

    const replay = await service.generateMonthlyRollup({
      monthId,
      workerId: "worker_replay",
    });
    assert.equal(replay.state, "complete");
    assert.equal(
      (await firestore.doc(`vendorIntelligenceSnapshots/${monthId}`).get())
        .get("sourceFingerprint"),
      snapshot.get("sourceFingerprint"),
    );

    await recursivelyDelete(`vendorIntelligenceRollups/${monthId}`);
    await firestore.doc(`vendorIntelligenceSnapshots/${monthId}`).delete();
    await firestore.doc(
      `billingSnapshots/${instituteIds[1]}__${monthId}`,
    ).update({currency: "inr"});
    const failureService = new VendorIntelligenceRollupService({
      firestore,
      now: () => new Date("2026-09-01T03:00:00.000Z"),
    });
    await assert.rejects(
      failureService.generateMonthlyRollup({
        monthId,
        workerId: "worker_malformed",
      }),
      /currency/i,
    );
    const failedOperation = await firestore
      .doc(`vendorIntelligenceRollups/${monthId}`)
      .get();
    assert.equal(failedOperation.get("state"), "failed_retryable");
    assert.equal(failedOperation.get("attemptCount"), 1);
    assert.equal(failedOperation.get("lastErrorCode"),
      "ROLLUP_SOURCE_OR_WRITE_FAILED");
    assert.equal(
      (await firestore.doc("vendorIntelligenceSnapshots/2026-01").get()).exists,
      true,
    );
    assert.equal(
      (await firestore.doc(`vendorIntelligenceSnapshots/${monthId}`).get()).exists,
      false,
    );
  },
);
