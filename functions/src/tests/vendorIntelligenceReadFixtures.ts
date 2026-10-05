import {getFirestore} from "../utils/firebaseAdmin";

export const VENDOR_INTELLIGENCE_TEST_QUERY = {
  asOfMonth: "2026-08",
  windowMonths: 3 as const,
};

const deleteCollection = async (path: string): Promise<void> => {
  const firestore = getFirestore();
  const snapshot = await firestore.collection(path).get();
  await Promise.all(snapshot.docs.map((document) =>
    firestore.recursiveDelete(document.ref)));
};

export const resetVendorIntelligenceReadFixtures = async (): Promise<void> => {
  await Promise.all([
    deleteCollection("vendorIntelligenceSnapshots"),
    deleteCollection("vendorIntelligenceRollups"),
    deleteCollection("vendorAggregates"),
  ]);
};

export const seedVendorIntelligenceReadFixtures = async (): Promise<void> => {
  const firestore = getFirestore();
  const batch = firestore.batch();
  const snapshots = [
    {
      activeInstituteCount: 2,
      currency: "INR",
      generatedAt: "2026-07-01T02:00:00.000Z",
      instituteCountByLayer: {L0: 0, L1: 1, L2: 1, L3: 0},
      monthId: "2026-06",
      revenueByLayerMinor: {L0: 0, L1: 40000, L2: 60000, L3: 0},
      sourceDocumentCounts: {
        billingSnapshots: 2,
        governanceSnapshots: 2,
        licenseHistory: 1,
        usageMeter: 2,
      },
      sourceFingerprint: "a".repeat(64),
      suspendedInstituteCount: 0,
      totalActiveStudents: 100,
      totalInstituteCount: 2,
      totalMonthlyRevenueMinor: 100000,
      totalSessionExecutions: 200,
      totalTestRuns: 10,
      transitionCount: 1,
    },
    {
      activeInstituteCount: 2,
      currency: "INR",
      generatedAt: "2026-08-01T02:00:00.000Z",
      instituteCountByLayer: {L0: 0, L1: 1, L2: 2, L3: 0},
      monthId: "2026-07",
      revenueByLayerMinor: {L0: 0, L1: 40000, L2: 110000, L3: 0},
      sourceDocumentCounts: {
        billingSnapshots: 3,
        governanceSnapshots: 3,
        licenseHistory: 2,
        usageMeter: 3,
      },
      sourceFingerprint: "b".repeat(64),
      suspendedInstituteCount: 1,
      totalActiveStudents: 150,
      totalInstituteCount: 3,
      totalMonthlyRevenueMinor: 150000,
      totalSessionExecutions: 300,
      totalTestRuns: 15,
      transitionCount: 2,
    },
    {
      activeInstituteCount: 2,
      currency: "INR",
      generatedAt: "2026-09-01T02:00:00.000Z",
      instituteCountByLayer: {L0: 0, L1: 1, L2: 1, L3: 1},
      monthId: "2026-08",
      revenueByLayerMinor: {L0: 0, L1: 40000, L2: 60000, L3: 80000},
      sourceDocumentCounts: {
        billingSnapshots: 3,
        governanceSnapshots: 3,
        licenseHistory: 2,
        usageMeter: 3,
      },
      sourceFingerprint: "c".repeat(64),
      suspendedInstituteCount: 1,
      totalActiveStudents: 180,
      totalInstituteCount: 3,
      totalMonthlyRevenueMinor: 180000,
      totalSessionExecutions: 390,
      totalTestRuns: 20,
      transitionCount: 2,
    },
  ];
  for (const snapshot of snapshots) {
    batch.set(
      firestore.doc(`vendorIntelligenceSnapshots/${snapshot.monthId}`),
      {
        ...snapshot,
        excludedInstituteCount: 0,
        immutable: true,
        schemaVersion: 1,
        status: "complete",
      },
    );
  }
  batch.set(firestore.doc("vendorIntelligenceRollups/2026-08"), {
    monthId: "2026-08",
    phase: "complete",
    rollingFingerprint: "c".repeat(64),
    schemaVersion: 1,
    state: "complete",
  });
  const items = [
    {
      activeStudentCount: 100,
      currentLayer: "L3",
      instituteId: "inst_reader_a",
      instituteName: "Reader Institute A",
      instituteStatus: "active",
      lastActivityAt: "2026-08-25T00:00:00.000Z",
      monthlyRecurringRevenue: {amountMinor: 80000, currency: "INR"},
      monthlySessionExecutions: 200,
      monthlyTestRuns: 10,
    },
    {
      activeStudentCount: 60,
      currentLayer: "L2",
      instituteId: "inst_reader_b",
      instituteName: "Reader Institute B",
      instituteStatus: "active",
      lastActivityAt: "2026-06-01T00:00:00.000Z",
      monthlyRecurringRevenue: {amountMinor: 60000, currency: "INR"},
      monthlySessionExecutions: 140,
      monthlyTestRuns: 7,
    },
    {
      activeStudentCount: 20,
      currentLayer: "L1",
      instituteId: "inst_reader_c",
      instituteName: null,
      instituteStatus: "suspended",
      lastActivityAt: null,
      monthlyRecurringRevenue: {amountMinor: 40000, currency: "INR"},
      monthlySessionExecutions: 50,
      monthlyTestRuns: 3,
    },
  ] as const;
  for (const item of items) {
    batch.set(
      firestore.doc(
        `vendorIntelligenceRollups/2026-08/items/${item.instituteId}`,
      ),
      {
        ...item,
        generatedAt: "2026-09-01T02:00:00.000Z",
        governanceSnapshotPresent: true,
        latestCompleteMonth: "2026-08",
        licenseTransitionCount: item.instituteId === "inst_reader_a" ? 1 : 0,
        schemaVersion: 1,
        sourceFingerprint: item.instituteId === "inst_reader_a" ?
          "d".repeat(64) : item.instituteId === "inst_reader_b" ?
            "e".repeat(64) : "f".repeat(64),
        sourcePresence: {
          billingSnapshot: true,
          governanceSnapshot: true,
          licenseHistory: item.instituteId === "inst_reader_a",
          usageMeter: true,
        },
      },
    );
  }
  await batch.commit();
};
