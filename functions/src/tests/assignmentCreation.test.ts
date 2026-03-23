import assert from "node:assert/strict";
import test from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import * as gcpMetadata from "gcp-metadata";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {AssignmentCreationResult} from "../types/assignmentCreation";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-22-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();

interface AssignmentCreationServiceContract {
  processAssignmentCreated: (
    context: {instituteId: string; runId: string; yearId: string},
    data: unknown,
  ) => Promise<AssignmentCreationResult>;
}

let assignmentCreationService: AssignmentCreationServiceContract;

test.before(async () => {
  const module = await import("../services/assignmentCreation.js");
  assignmentCreationService = module.assignmentCreationService;
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

const templateSnapshotFixture = {
  difficultyDistribution: {
    easy: 2,
    hard: 1,
    medium: 3,
  },
  phaseConfigSnapshot: {
    phase1Percent: 30,
    phase2Percent: 40,
    phase3Percent: 30,
  },
  questionIds: [
    "question_build_22_1",
    "question_build_22_2",
    "question_build_22_3",
    "question_build_22_4",
    "question_build_22_5",
    "question_build_22_6",
  ],
  timingProfile: {
    easy: {max: 60, min: 30},
    hard: {max: 210, min: 150},
    medium: {max: 150, min: 60},
  },
};

test(
  "processAssignmentCreated validates assignment payload and enforces " +
    "scheduled state",
  async () => {
    const instituteId = "inst_build_21_success";
    const yearId = "2026";
    const testId = "test_build_21";
    const runId = "run_build_21";
    const studentIds = ["student_build_21_1", "student_build_21_2"];
    const testPath = `institutes/${instituteId}/tests/${testId}`;
    const runPath =
      `institutes/${instituteId}/academicYears/${yearId}/runs/${runId}`;
    const licensePath = `institutes/${instituteId}/license/main`;
    const studentPaths = studentIds.map((studentId) =>
      `institutes/${instituteId}/students/${studentId}`,
    );

    await deleteDocumentIfPresent(testPath);
    await deleteDocumentIfPresent(runPath);
    await deleteDocumentIfPresent(licensePath);
    await Promise.all(studentPaths.map(deleteDocumentIfPresent));

    await firestore.doc(testPath).set({
      allowedModes: ["Operational", "Diagnostic", "Controlled", "Hard"],
      difficultyDistribution: templateSnapshotFixture.difficultyDistribution,
      phaseConfigSnapshot: templateSnapshotFixture.phaseConfigSnapshot,
      questionIds: templateSnapshotFixture.questionIds,
      status: "ready",
      testId,
      timingProfile: templateSnapshotFixture.timingProfile,
      totalRuns: 0,
    });
    await firestore.doc(licensePath).set({
      currentLayer: "L2",
      featureFlags: {
        controlledMode: true,
        hardMode: true,
      },
    });
    await Promise.all(studentPaths.map((path, index) =>
      firestore.doc(path).set({
        status: "active",
        studentId: studentIds[index],
      })
    ));

    const startWindow = Timestamp.fromMillis(Date.now() + 30 * 60 * 1000);
    const endWindow = Timestamp.fromMillis(Date.now() + 90 * 60 * 1000);

    await firestore.doc(runPath).set({
      endWindow,
      mode: "Controlled",
      recipientStudentIds: studentIds,
      runId,
      startWindow,
      status: "draft",
      testId,
    });

    const result = await assignmentCreationService.processAssignmentCreated(
      {instituteId, runId, yearId},
      (await firestore.doc(runPath).get()).data(),
    );

    assert.equal(result.runPath, runPath);
    assert.equal(result.testPath, testPath);
    assert.equal(result.status, "scheduled");
    assert.equal(result.recipientCount, 2);
    assert.deepEqual(
      result.capturedTemplateSnapshot.questionIds,
      templateSnapshotFixture.questionIds,
    );

    const runSnapshot = await firestore.doc(runPath).get();
    const runData = runSnapshot.data();

    assert.equal(runData?.status, "scheduled");
    assert.equal(runData?.recipientCount, 2);
    assert.deepEqual(runData?.recipientStudentIds, studentIds);
    assert.equal(runData?.mode, "Controlled");
    assert.deepEqual(
      runData?.questionIds,
      templateSnapshotFixture.questionIds,
    );
    assert.deepEqual(
      runData?.difficultyDistribution,
      templateSnapshotFixture.difficultyDistribution,
    );
    assert.deepEqual(
      runData?.phaseConfigSnapshot,
      templateSnapshotFixture.phaseConfigSnapshot,
    );
    assert.deepEqual(
      runData?.timingProfileSnapshot,
      templateSnapshotFixture.timingProfile,
    );
    assert.ok(runData?.createdAt instanceof Timestamp);
    assert.equal(runData?.totalSessions, 0);

    const templateSnapshot = await firestore.doc(testPath).get();
    const templateData = templateSnapshot.data();
    assert.equal(templateData?.status, "assigned");
    assert.equal(templateData?.totalRuns, 1);

    await deleteDocumentIfPresent(testPath);
    await deleteDocumentIfPresent(runPath);
    await deleteDocumentIfPresent(licensePath);
    await Promise.all(studentPaths.map(deleteDocumentIfPresent));
  },
);

test(
  "processAssignmentCreated rejects assignments for non-ready templates",
  async () => {
    const instituteId = "inst_build_21_invalid_template";
    const yearId = "2026";
    const testId = "test_build_21_invalid_template";
    const runId = "run_build_21_invalid_template";
    const studentId = "student_build_21_template_check";
    const testPath = `institutes/${instituteId}/tests/${testId}`;
    const runPath =
      `institutes/${instituteId}/academicYears/${yearId}/runs/${runId}`;
    const licensePath = `institutes/${instituteId}/license/main`;
    const studentPath = `institutes/${instituteId}/students/${studentId}`;

    await deleteDocumentIfPresent(testPath);
    await deleteDocumentIfPresent(runPath);
    await deleteDocumentIfPresent(licensePath);
    await deleteDocumentIfPresent(studentPath);

    await firestore.doc(testPath).set({
      difficultyDistribution: templateSnapshotFixture.difficultyDistribution,
      phaseConfigSnapshot: templateSnapshotFixture.phaseConfigSnapshot,
      questionIds: templateSnapshotFixture.questionIds,
      status: "draft",
      testId,
      timingProfile: templateSnapshotFixture.timingProfile,
    });
    await firestore.doc(licensePath).set({
      currentLayer: "L2",
      featureFlags: {
        controlledMode: true,
        hardMode: true,
      },
    });
    await firestore.doc(studentPath).set({
      status: "active",
      studentId,
    });

    await firestore.doc(runPath).set({
      endWindow: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
      mode: "Operational",
      recipientStudentIds: [studentId],
      runId,
      startWindow: Timestamp.fromMillis(Date.now() + 30 * 60 * 1000),
      testId,
    });

    await assert.rejects(
      assignmentCreationService.processAssignmentCreated(
        {instituteId, runId, yearId},
        (await firestore.doc(runPath).get()).data(),
      ),
      (error: unknown) => {
        assert.match(String(error), /template status/i);
        return true;
      },
    );

    await deleteDocumentIfPresent(testPath);
    await deleteDocumentIfPresent(runPath);
    await deleteDocumentIfPresent(licensePath);
    await deleteDocumentIfPresent(studentPath);
  },
);

test(
  "processAssignmentCreated rejects non-active assignment recipients",
  async () => {
    const instituteId = "inst_build_21_invalid_recipients";
    const yearId = "2026";
    const testId = "test_build_21_invalid_recipients";
    const runId = "run_build_21_invalid_recipients";
    const studentId = "student_build_21_inactive";
    const testPath = `institutes/${instituteId}/tests/${testId}`;
    const runPath =
      `institutes/${instituteId}/academicYears/${yearId}/runs/${runId}`;
    const licensePath = `institutes/${instituteId}/license/main`;
    const studentPath = `institutes/${instituteId}/students/${studentId}`;

    await deleteDocumentIfPresent(testPath);
    await deleteDocumentIfPresent(runPath);
    await deleteDocumentIfPresent(licensePath);
    await deleteDocumentIfPresent(studentPath);

    await firestore.doc(testPath).set({
      difficultyDistribution: templateSnapshotFixture.difficultyDistribution,
      phaseConfigSnapshot: templateSnapshotFixture.phaseConfigSnapshot,
      questionIds: templateSnapshotFixture.questionIds,
      status: "ready",
      testId,
      timingProfile: templateSnapshotFixture.timingProfile,
    });
    await firestore.doc(licensePath).set({
      currentLayer: "L1",
      featureFlags: {
        controlledMode: false,
        hardMode: false,
      },
    });
    await firestore.doc(studentPath).set({
      status: "inactive",
      studentId,
    });

    await firestore.doc(runPath).set({
      endWindow: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
      mode: "Diagnostic",
      recipientStudentIds: [studentId],
      runId,
      startWindow: Timestamp.fromMillis(Date.now() + 30 * 60 * 1000),
      testId,
    });

    await assert.rejects(
      assignmentCreationService.processAssignmentCreated(
        {instituteId, runId, yearId},
        (await firestore.doc(runPath).get()).data(),
      ),
      (error: unknown) => {
        assert.match(String(error), /active student/i);
        return true;
      },
    );

    await deleteDocumentIfPresent(testPath);
    await deleteDocumentIfPresent(runPath);
    await deleteDocumentIfPresent(licensePath);
    await deleteDocumentIfPresent(studentPath);
  },
);

test(
  "processAssignmentCreated rejects restricted modes for license layer",
  async () => {
    const instituteId = "inst_build_21_license_restriction";
    const yearId = "2026";
    const testId = "test_build_21_license_restriction";
    const runId = "run_build_21_license_restriction";
    const studentId = "student_build_21_license_restriction";
    const testPath = `institutes/${instituteId}/tests/${testId}`;
    const runPath =
      `institutes/${instituteId}/academicYears/${yearId}/runs/${runId}`;
    const licensePath = `institutes/${instituteId}/license/main`;
    const studentPath = `institutes/${instituteId}/students/${studentId}`;

    await deleteDocumentIfPresent(testPath);
    await deleteDocumentIfPresent(runPath);
    await deleteDocumentIfPresent(licensePath);
    await deleteDocumentIfPresent(studentPath);

    await firestore.doc(testPath).set({
      allowedModes: ["Operational", "Diagnostic", "Controlled"],
      difficultyDistribution: templateSnapshotFixture.difficultyDistribution,
      phaseConfigSnapshot: templateSnapshotFixture.phaseConfigSnapshot,
      questionIds: templateSnapshotFixture.questionIds,
      status: "ready",
      testId,
      timingProfile: templateSnapshotFixture.timingProfile,
    });
    await firestore.doc(licensePath).set({
      currentLayer: "L1",
      featureFlags: {
        controlledMode: true,
        hardMode: false,
      },
    });
    await firestore.doc(studentPath).set({
      status: "active",
      studentId,
    });
    await firestore.doc(runPath).set({
      endWindow: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
      mode: "Controlled",
      recipientStudentIds: [studentId],
      runId,
      startWindow: Timestamp.fromMillis(Date.now() + 30 * 60 * 1000),
      testId,
    });

    await assert.rejects(
      assignmentCreationService.processAssignmentCreated(
        {instituteId, runId, yearId},
        (await firestore.doc(runPath).get()).data(),
      ),
      (error: unknown) => {
        assert.match(String(error), /requires license layer/i);
        return true;
      },
    );

    await deleteDocumentIfPresent(testPath);
    await deleteDocumentIfPresent(runPath);
    await deleteDocumentIfPresent(licensePath);
    await deleteDocumentIfPresent(studentPath);
  },
);

test(
  "processAssignmentCreated rejects template missing required snapshot fields",
  async () => {
    const instituteId = "inst_build_22_missing_snapshot";
    const yearId = "2026";
    const testId = "test_build_22_missing_snapshot";
    const runId = "run_build_22_missing_snapshot";
    const studentId = "student_build_22_missing_snapshot";
    const testPath = `institutes/${instituteId}/tests/${testId}`;
    const runPath =
      `institutes/${instituteId}/academicYears/${yearId}/runs/${runId}`;
    const licensePath = `institutes/${instituteId}/license/main`;
    const studentPath = `institutes/${instituteId}/students/${studentId}`;

    await deleteDocumentIfPresent(testPath);
    await deleteDocumentIfPresent(runPath);
    await deleteDocumentIfPresent(licensePath);
    await deleteDocumentIfPresent(studentPath);

    await firestore.doc(testPath).set({
      status: "ready",
      testId,
    });
    await firestore.doc(licensePath).set({
      currentLayer: "L0",
      featureFlags: {
        controlledMode: false,
        hardMode: false,
      },
    });
    await firestore.doc(studentPath).set({
      status: "active",
      studentId,
    });
    await firestore.doc(runPath).set({
      endWindow: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
      mode: "Operational",
      recipientStudentIds: [studentId],
      runId,
      startWindow: Timestamp.fromMillis(Date.now() + 30 * 60 * 1000),
      testId,
    });

    await assert.rejects(
      assignmentCreationService.processAssignmentCreated(
        {instituteId, runId, yearId},
        (await firestore.doc(runPath).get()).data(),
      ),
      (error: unknown) => {
        assert.match(String(error), /questionIds|difficultyDistribution/i);
        return true;
      },
    );

    await deleteDocumentIfPresent(testPath);
    await deleteDocumentIfPresent(runPath);
    await deleteDocumentIfPresent(licensePath);
    await deleteDocumentIfPresent(studentPath);
  },
);
