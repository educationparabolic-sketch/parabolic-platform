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
    const studentPaths = [
      `institutes/${instituteId}/students/student_build_25_1`,
      `institutes/${instituteId}/students/student_build_25_2`,
      `institutes/${instituteId}/students/student_build_25_3`,
    ];

    await deleteDocumentIfPresent(assignmentEventPath);
    await deleteDocumentIfPresent(usageMeterPath);
    await deleteDocumentIfPresent(licensePath);
    await Promise.all(studentPaths.map(deleteDocumentIfPresent));

    await firestore.doc(licensePath).set({
      activeStudentLimit: 2,
      currentLayer: "L1",
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
    assert.equal(usageMeterData?.activeStudentLimit, 2);
    assert.equal(usageMeterData?.billingTierCompliance, true);
    assert.equal(usageMeterData?.cycleId, cycleId);
    assert.equal(usageMeterData?.lastAssignmentRunId, runId);
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
