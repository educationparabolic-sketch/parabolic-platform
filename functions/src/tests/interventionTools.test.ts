import assert from "node:assert/strict";
import test from "node:test";
import * as gcpMetadata from "gcp-metadata";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {
  interventionToolsService,
  InterventionToolsService,
} from "../services/interventionTools";
import {
  administrativeActionLoggingService,
} from "../services/administrativeActionLogging";
import {
  AdminInterventionValidationError,
} from "../types/interventionTools";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-124-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();

const deleteCollectionDocuments = async (path: string): Promise<void> => {
  const snapshot = await firestore.collection(path).get();
  await Promise.all(snapshot.docs.map((document) => document.ref.delete()));
};

const deleteDocumentIfPresent = async (path: string): Promise<void> => {
  const reference = firestore.doc(path);
  const snapshot = await reference.get();

  if (snapshot.exists) {
    await reference.delete();
  }
};

test.after(async () => {
  await getFirebaseAdminApp().delete();
});

test(
  "intervention tools create immutable audit entries and list them by year",
  async () => {
    const instituteId = "inst_build_124";
    const yearId = "2026";
    const studentId = "student_build_124";
    const auditPath = `institutes/${instituteId}/auditLogs`;
    const studentPath = `institutes/${instituteId}/students/${studentId}`;
    const metricsPath =
      `institutes/${instituteId}/academicYears/${yearId}/` +
      `studentYearMetrics/${studentId}`;

    const service = new InterventionToolsService({
      firestore,
      logInterventionOutcomeUpdate:
        administrativeActionLoggingService.logInterventionOutcomeUpdate.bind(
          administrativeActionLoggingService,
        ),
      logInterventionRemedialAssignment:
        administrativeActionLoggingService
          .logInterventionRemedialAssignment
          .bind(administrativeActionLoggingService),
      logInterventionStudentAlert:
        administrativeActionLoggingService.logInterventionStudentAlert.bind(
          administrativeActionLoggingService,
        ),
    });

    await deleteCollectionDocuments(auditPath);
    await Promise.all([
      deleteDocumentIfPresent(metricsPath),
      deleteDocumentIfPresent(studentPath),
      deleteDocumentIfPresent(
        `institutes/${instituteId}/academicYears/${yearId}`,
      ),
      deleteDocumentIfPresent(`institutes/${instituteId}`),
    ]);

    await firestore.doc(`institutes/${instituteId}`).set({
      instituteId,
      name: "Build 124 Institute",
    });
    await firestore.doc(
      `institutes/${instituteId}/academicYears/${yearId}`,
    ).set({
      status: "active",
      yearId,
    });
    await firestore.doc(studentPath).set({
      name: "Build 124 Student",
      studentId,
    });
    await firestore.doc(metricsPath).set({
      disciplineIndex: 42,
      guessRatePercent: 31,
      rollingRiskCluster: "critical",
      studentId,
    });

    const remedialAction = await service.executeRequest({
      actionType: "ASSIGN_REMEDIAL_TEST",
      actorId: "teacher_build_124",
      actorRole: "teacher",
      instituteId,
      remedialTestId: "remedial-controlled-discipline",
      studentId,
      yearId,
    });

    const alertAction = await service.executeRequest({
      actionType: "SEND_ALERT",
      actorId: "teacher_build_124",
      actorRole: "teacher",
      alertMessage: "Complete remedial assignment before the next run.",
      instituteId,
      studentId,
      yearId,
    });

    const outcomeAction = await service.executeRequest({
      actionType: "TRACK_OUTCOME",
      actorId: "teacher_build_124",
      actorRole: "teacher",
      instituteId,
      outcomeNotes: "Guess-rate reduced after intervention.",
      outcomeStatus: "improving",
      studentId,
      yearId,
    });

    const listedActions = await service.executeRequest({
      actionType: "LIST_ACTIONS",
      actorId: "teacher_build_124",
      actorRole: "teacher",
      instituteId,
      limit: 10,
      yearId,
    });

    assert.equal(remedialAction.mode, "action");
    assert.equal(alertAction.mode, "action");
    assert.equal(outcomeAction.mode, "action");
    assert.equal(listedActions.mode, "list");
    assert.equal(listedActions.actions.length, 3);

    const actionTypes = new Set(
      listedActions.actions.map((entry) => entry.actionType),
    );
    assert.equal(actionTypes.has("ASSIGN_REMEDIAL_TEST"), true);
    assert.equal(actionTypes.has("SEND_ALERT"), true);
    assert.equal(actionTypes.has("TRACK_OUTCOME"), true);

    const auditSnapshot = await firestore.collection(auditPath)
      .where("targetId", "==", studentId)
      .get();
    assert.equal(auditSnapshot.size >= 2, true);

    await deleteCollectionDocuments(auditPath);
    await Promise.all([
      deleteDocumentIfPresent(metricsPath),
      deleteDocumentIfPresent(studentPath),
      deleteDocumentIfPresent(
        `institutes/${instituteId}/academicYears/${yearId}`,
      ),
      deleteDocumentIfPresent(`institutes/${instituteId}`),
    ]);
  },
);

test("intervention tools reject missing students", async () => {
  await assert.rejects(
    async () => {
      await interventionToolsService.executeRequest({
        actionType: "SEND_ALERT",
        actorId: "teacher_build_124",
        actorRole: "teacher",
        alertMessage: "Follow up required.",
        instituteId: "inst_build_124_missing",
        studentId: "student_missing",
        yearId: "2026",
      });
    },
    (error: unknown) => {
      assert.equal(error instanceof AdminInterventionValidationError, true);
      assert.equal(
        (error as AdminInterventionValidationError).code,
        "NOT_FOUND",
      );
      return true;
    },
  );
});
