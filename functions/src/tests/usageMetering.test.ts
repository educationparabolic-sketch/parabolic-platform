import assert from "node:assert/strict";
import test from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import * as gcpMetadata from "gcp-metadata";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {UsageMeteringResult} from "../types/usageMetering";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-25-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();

interface UsageMeteringServiceContract {
  recordAssignmentUsage: (
    context: {instituteId: string; runId: string; yearId: string},
    runData: unknown,
  ) => Promise<UsageMeteringResult>;
  recordSessionExecutionUsage: (
    context: {
      eventId?: string;
      instituteId: string;
      runId: string;
      sessionId: string;
      yearId: string;
    },
    beforeData: unknown,
    afterData: unknown,
  ) => Promise<UsageMeteringResult>;
  recordStudentStatusChange: (
    context: {eventId: string; instituteId: string; studentId: string},
    beforeData: unknown,
    afterData: unknown,
  ) => Promise<UsageMeteringResult>;
}

let usageMeteringService: UsageMeteringServiceContract;

test.before(async () => {
  const module = await import("../services/usageMetering.js");
  usageMeteringService = module.usageMeteringService;
});

test.after(async () => {
  await getFirebaseAdminApp().delete();
});

const deleteDocumentIfPresent = async (path: string): Promise<void> => {
  const documentReference = firestore.doc(path);
  const snapshot = await documentReference.get();

  if (snapshot.exists) {
    await documentReference.delete();
  }
};

test(
  "recordAssignmentUsage updates monthly usage meter and remains idempotent " +
    "for retried assignment events",
  async () => {
    const instituteId = "inst_build_25";
    const yearId = "2026";
    const runId = "run_build_25";
    const cycleId = "2026-03";
    const usageMeterPath = `institutes/${instituteId}/usageMeter/${cycleId}`;
    const assignmentEventPath =
      `institutes/${instituteId}/usageMeter/${cycleId}/` +
      `assignmentEvents/${runId}`;
    const licensePath = `institutes/${instituteId}/license/main`;
    const pricingPlanPath = "vendorConfig/pricingPlans/pricingPlans/L1";
    const studentPaths = [
      `institutes/${instituteId}/students/student_build_25_1`,
      `institutes/${instituteId}/students/student_build_25_2`,
      `institutes/${instituteId}/students/student_build_25_3`,
    ];

    await deleteDocumentIfPresent(assignmentEventPath);
    await deleteDocumentIfPresent(usageMeterPath);
    await deleteDocumentIfPresent(licensePath);
    await deleteDocumentIfPresent(pricingPlanPath);
    await Promise.all(studentPaths.map(deleteDocumentIfPresent));

    await firestore.doc(licensePath).set({
      activeStudentLimit: 2,
      currentLayer: "L1",
      studentLimit: 2,
    });
    await firestore.doc(pricingPlanPath).set({
      basePriceMonthly: 100,
      name: "Growth",
      planId: "L1",
      pricePerStudent: 5,
      studentLimit: 2,
    });

    await firestore.doc(studentPaths[0]).set({
      archived: false,
      status: "active",
      studentId: "student_build_25_1",
    });
    await firestore.doc(studentPaths[1]).set({
      archived: false,
      status: "active",
      studentId: "student_build_25_2",
    });
    await firestore.doc(studentPaths[2]).set({
      archived: true,
      status: "active",
      studentId: "student_build_25_3",
    });

    const runData = {
      createdAt: Timestamp.fromDate(new Date("2026-03-14T08:00:00.000Z")),
      recipientStudentIds: [
        "student_build_25_1",
        "student_build_25_2",
        "student_build_25_3",
      ],
      runId,
    };

    const firstResult = await usageMeteringService.recordAssignmentUsage(
      {instituteId, runId, yearId},
      runData,
    );
    assert.equal(firstResult.cycleId, cycleId);
    assert.equal(firstResult.usageMeterPath, usageMeterPath);
    assert.equal(firstResult.wasUpdated, true);

    const usageMeterSnapshot = await firestore.doc(usageMeterPath).get();
    const usageMeterData = usageMeterSnapshot.data();

    assert.equal(usageMeterData?.assignmentsCreated, 1);
    assert.equal(usageMeterData?.assignedStudentsCount, 3);
    assert.equal(usageMeterData?.activeStudentCount, 2);
    assert.equal(usageMeterData?.peakStudentUsage, 2);
    assert.equal(usageMeterData?.peakActiveStudents, 2);
    assert.equal(usageMeterData?.activeStudentLimit, 2);
    assert.equal(usageMeterData?.billingTierCompliance, true);
    assert.equal(usageMeterData?.basePriceMonthly, 100);
    assert.equal(usageMeterData?.cycleId, cycleId);
    assert.equal(usageMeterData?.lastAssignmentRunId, runId);
    assert.equal(usageMeterData?.pricePerStudent, 5);
    assert.equal(usageMeterData?.pricingPlanId, "L1");
    assert.equal(usageMeterData?.projectedInvoiceAmount, 110);
    assert.equal(usageMeterData?.sessionExecutionVolume, 0);
    assert.ok(usageMeterData?.updatedAt instanceof Timestamp);

    const secondResult = await usageMeteringService.recordAssignmentUsage(
      {instituteId, runId, yearId},
      runData,
    );
    assert.equal(secondResult.wasUpdated, false);

    const usageMeterSnapshotAfterRetry = await firestore
      .doc(usageMeterPath)
      .get();
    const usageMeterDataAfterRetry = usageMeterSnapshotAfterRetry.data();

    assert.equal(usageMeterDataAfterRetry?.assignmentsCreated, 1);
    assert.equal(usageMeterDataAfterRetry?.assignedStudentsCount, 3);

    await deleteDocumentIfPresent(assignmentEventPath);
    await deleteDocumentIfPresent(usageMeterPath);
    await deleteDocumentIfPresent(licensePath);
    await deleteDocumentIfPresent(pricingPlanPath);
    await Promise.all(studentPaths.map(deleteDocumentIfPresent));
  },
);

test(
  "recordAssignmentUsage rejects run payload with mismatched runId",
  async () => {
    await assert.rejects(
      usageMeteringService.recordAssignmentUsage(
        {
          instituteId: "inst_build_25_invalid",
          runId: "run_build_25_invalid",
          yearId: "2026",
        },
        {
          recipientStudentIds: ["student_build_25_invalid_1"],
          runId: "different_run_id",
        },
      ),
      (error: unknown) => {
        assert.match(String(error), /runId/i);
        return true;
      },
    );
  },
);

test(
  "recordStudentStatusChange updates active counts, peak usage, and remains " +
    "idempotent for retried student lifecycle events",
  async () => {
    const instituteId = "inst_build_91_student";
    const studentId = "student_build_91_student";
    const cycleId = "2026-04";
    const usageMeterPath = `institutes/${instituteId}/usageMeter/${cycleId}`;
    const studentEventPath =
      `institutes/${instituteId}/usageMeter/${cycleId}/studentEvents/` +
      "event_build_91_student_activate";
    const studentPath = `institutes/${instituteId}/students/${studentId}`;
    const licensePath = `institutes/${instituteId}/license/main`;
    const pricingPlanPath = "vendorConfig/pricingPlans/pricingPlans/L2";

    await Promise.all([
      deleteDocumentIfPresent(studentEventPath),
      deleteDocumentIfPresent(usageMeterPath),
      deleteDocumentIfPresent(studentPath),
      deleteDocumentIfPresent(licensePath),
      deleteDocumentIfPresent(pricingPlanPath),
    ]);

    await firestore.doc(licensePath).set({
      activeStudentLimit: 2,
      currentLayer: "L2",
    });
    await firestore.doc(pricingPlanPath).set({
      basePriceMonthly: 200,
      name: "Advanced",
      planId: "L2",
      pricePerStudent: 10,
      studentLimit: 2,
    });
    await firestore.doc(studentPath).set({
      archived: false,
      status: "active",
      studentId,
      updatedAt: Timestamp.fromDate(new Date("2026-04-02T08:00:00.000Z")),
    });

    const activatedResult =
      await usageMeteringService.recordStudentStatusChange(
        {
          eventId: "event_build_91_student_activate",
          instituteId,
          studentId,
        },
        {
          archived: false,
          status: "inactive",
          studentId,
          updatedAt: Timestamp.fromDate(new Date("2026-04-02T07:55:00.000Z")),
        },
        {
          archived: false,
          status: "active",
          studentId,
          updatedAt: Timestamp.fromDate(new Date("2026-04-02T08:00:00.000Z")),
        },
      );

    assert.equal(activatedResult.wasUpdated, true);
    assert.equal(activatedResult.cycleId, cycleId);

    const activatedUsageSnapshot = await firestore.doc(usageMeterPath).get();
    const activatedUsageData = activatedUsageSnapshot.data();

    assert.equal(activatedUsageData?.activeStudentCount, 1);
    assert.equal(activatedUsageData?.peakActiveStudents, 1);
    assert.equal(activatedUsageData?.billingTierCompliance, true);
    assert.equal(activatedUsageData?.projectedInvoiceAmount, 210);

    const retriedResult = await usageMeteringService.recordStudentStatusChange(
      {
        eventId: "event_build_91_student_activate",
        instituteId,
        studentId,
      },
      {
        archived: false,
        status: "inactive",
        studentId,
      },
      {
        archived: false,
        status: "active",
        studentId,
      },
    );

    assert.equal(retriedResult.wasUpdated, false);

    const deactivateEventPath =
      `institutes/${instituteId}/usageMeter/${cycleId}/studentEvents/` +
      "event_build_91_student_deactivate";

    await firestore.doc(studentPath).set({
      archived: true,
      archivedAt: Timestamp.fromDate(new Date("2026-04-12T08:00:00.000Z")),
      status: "archived",
      studentId,
      updatedAt: Timestamp.fromDate(new Date("2026-04-12T08:00:00.000Z")),
    });

    const deactivatedResult =
      await usageMeteringService.recordStudentStatusChange(
        {
          eventId: "event_build_91_student_deactivate",
          instituteId,
          studentId,
        },
        {
          archived: false,
          status: "active",
          studentId,
          updatedAt: Timestamp.fromDate(new Date("2026-04-12T07:55:00.000Z")),
        },
        {
          archived: true,
          archivedAt: Timestamp.fromDate(new Date("2026-04-12T08:00:00.000Z")),
          status: "archived",
          studentId,
          updatedAt: Timestamp.fromDate(new Date("2026-04-12T08:00:00.000Z")),
        },
      );

    assert.equal(deactivatedResult.wasUpdated, true);

    const deactivatedUsageSnapshot = await firestore.doc(usageMeterPath).get();
    const deactivatedUsageData = deactivatedUsageSnapshot.data();

    assert.equal(deactivatedUsageData?.activeStudentCount, 0);
    assert.equal(deactivatedUsageData?.peakActiveStudents, 1);
    assert.equal(deactivatedUsageData?.projectedInvoiceAmount, 200);

    await Promise.all([
      deleteDocumentIfPresent(deactivateEventPath),
      deleteDocumentIfPresent(studentEventPath),
      deleteDocumentIfPresent(usageMeterPath),
      deleteDocumentIfPresent(studentPath),
      deleteDocumentIfPresent(licensePath),
      deleteDocumentIfPresent(pricingPlanPath),
    ]);
  },
);

test(
  "recordStudentStatusChange removes soft-deleted students from billing " +
    "counts",
  async () => {
    const instituteId = "inst_build_104_usage";
    const studentId = "student_build_104_usage";
    const cycleId = "2026-04";
    const usageMeterPath = `institutes/${instituteId}/usageMeter/${cycleId}`;
    const studentEventPath =
      `institutes/${instituteId}/usageMeter/${cycleId}/studentEvents/` +
      "event_build_104_student_delete";
    const studentPath = `institutes/${instituteId}/students/${studentId}`;
    const licensePath = `institutes/${instituteId}/license/main`;
    const pricingPlanPath = "vendorConfig/pricingPlans/pricingPlans/L1";

    await Promise.all([
      deleteDocumentIfPresent(studentEventPath),
      deleteDocumentIfPresent(usageMeterPath),
      deleteDocumentIfPresent(studentPath),
      deleteDocumentIfPresent(licensePath),
      deleteDocumentIfPresent(pricingPlanPath),
    ]);

    await firestore.doc(licensePath).set({
      activeStudentLimit: 5,
      currentLayer: "L1",
    });
    await firestore.doc(pricingPlanPath).set({
      basePriceMonthly: 100,
      name: "Growth",
      planId: "L1",
      pricePerStudent: 5,
      studentLimit: 5,
    });

    const beforeState = {
      archived: false,
      deleted: false,
      status: "active",
      studentId,
      updatedAt: Timestamp.fromDate(new Date("2026-04-15T07:55:00.000Z")),
    };
    const afterState = {
      archived: false,
      deleted: true,
      status: "active",
      studentId,
      updatedAt: Timestamp.fromDate(new Date("2026-04-15T08:00:00.000Z")),
    };

    await firestore.doc(studentPath).set(afterState);

    const result = await usageMeteringService.recordStudentStatusChange(
      {
        eventId: "event_build_104_student_delete",
        instituteId,
        studentId,
      },
      beforeState,
      afterState,
    );

    assert.equal(result.wasUpdated, true);

    const usageMeterSnapshot = await firestore.doc(usageMeterPath).get();
    const usageMeterData = usageMeterSnapshot.data();

    assert.equal(usageMeterData?.activeStudentCount, 0);
    assert.equal(usageMeterData?.projectedInvoiceAmount, 100);

    await Promise.all([
      deleteDocumentIfPresent(studentEventPath),
      deleteDocumentIfPresent(usageMeterPath),
      deleteDocumentIfPresent(studentPath),
      deleteDocumentIfPresent(licensePath),
      deleteDocumentIfPresent(pricingPlanPath),
    ]);
  },
);

test(
  "recordSessionExecutionUsage increments submitted session volume once per " +
    "session",
  async () => {
    const instituteId = "inst_build_91_session";
    const yearId = "2026";
    const runId = "run_build_91_session";
    const sessionId = "session_build_91_session";
    const cycleId = "2026-04";
    const usageMeterPath = `institutes/${instituteId}/usageMeter/${cycleId}`;
    const sessionEventPath =
      `institutes/${instituteId}/usageMeter/${cycleId}/sessionEvents/` +
      `${sessionId}`;
    const studentPath = `institutes/${instituteId}/students/student_build_91`;
    const licensePath = `institutes/${instituteId}/license/main`;
    const pricingPlanPath = "vendorConfig/pricingPlans/pricingPlans/L3";

    await Promise.all([
      deleteDocumentIfPresent(sessionEventPath),
      deleteDocumentIfPresent(usageMeterPath),
      deleteDocumentIfPresent(studentPath),
      deleteDocumentIfPresent(licensePath),
      deleteDocumentIfPresent(pricingPlanPath),
    ]);

    await firestore.doc(studentPath).set({
      archived: false,
      status: "active",
      studentId: "student_build_91",
    });
    await firestore.doc(licensePath).set({
      currentLayer: "L3",
      studentLimit: 1,
    });
    await firestore.doc(pricingPlanPath).set({
      basePriceMonthly: 300,
      name: "Enterprise",
      planId: "L3",
      pricePerStudent: 20,
      studentLimit: 1,
    });

    const submittedAt =
      Timestamp.fromDate(new Date("2026-04-15T09:30:00.000Z"));

    const firstResult = await usageMeteringService.recordSessionExecutionUsage(
      {
        eventId: "event_build_91_session",
        instituteId,
        runId,
        sessionId,
        yearId,
      },
      {
        status: "active",
        submittedAt: null,
      },
      {
        status: "submitted",
        submittedAt,
      },
    );

    assert.equal(firstResult.wasUpdated, true);
    assert.equal(firstResult.cycleId, cycleId);

    const usageSnapshot = await firestore.doc(usageMeterPath).get();
    const usageData = usageSnapshot.data();

    assert.equal(usageData?.activeStudentCount, 1);
    assert.equal(usageData?.billingTierCompliance, true);
    assert.equal(usageData?.projectedInvoiceAmount, 320);
    assert.equal(usageData?.sessionExecutionVolume, 1);

    const secondResult = await usageMeteringService.recordSessionExecutionUsage(
      {
        eventId: "event_build_91_session",
        instituteId,
        runId,
        sessionId,
        yearId,
      },
      {
        status: "active",
        submittedAt: null,
      },
      {
        status: "submitted",
        submittedAt,
      },
    );

    assert.equal(secondResult.wasUpdated, false);

    await Promise.all([
      deleteDocumentIfPresent(sessionEventPath),
      deleteDocumentIfPresent(usageMeterPath),
      deleteDocumentIfPresent(studentPath),
      deleteDocumentIfPresent(licensePath),
      deleteDocumentIfPresent(pricingPlanPath),
    ]);
  },
);
