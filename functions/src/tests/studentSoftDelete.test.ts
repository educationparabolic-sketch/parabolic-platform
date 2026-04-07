import assert from "node:assert/strict";
import test from "node:test";
import * as gcpMetadata from "gcp-metadata";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {
  StudentSoftDeleteService,
} from "../services/studentSoftDelete";
import {
  administrativeActionLoggingService,
} from "../services/administrativeActionLogging";
import {
  StudentSoftDeleteValidationError,
} from "../types/studentSoftDelete";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-104-tests";
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
  const documentReference = firestore.doc(path);
  const snapshot = await documentReference.get();

  if (snapshot.exists) {
    await documentReference.delete();
  }
};

test.after(async () => {
  await getFirebaseAdminApp().delete();
});

test(
  "softDeleteStudent marks the student deleted and logs an audit entry " +
    "without mutating analytics documents",
  async () => {
    const instituteId = "inst_build_104";
    const studentId = "student_build_104";
    const yearId = "2026";
    const auditLogsPath = `institutes/${instituteId}/auditLogs`;
    const studentPath = `institutes/${instituteId}/students/${studentId}`;
    const metricsPath =
      `institutes/${instituteId}/academicYears/${yearId}/` +
      `studentYearMetrics/${studentId}`;
    const service = new StudentSoftDeleteService({
      firestore,
      logStudentSoftDelete:
        administrativeActionLoggingService.logStudentSoftDelete.bind(
          administrativeActionLoggingService,
        ),
    });

    await deleteCollectionDocuments(auditLogsPath);
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
      name: "Build 104 Institute",
    });
    await firestore.doc(
      `institutes/${instituteId}/academicYears/${yearId}`,
    ).set({
      status: "active",
      yearId,
    });
    await firestore.doc(studentPath).set({
      batchId: "batch-104",
      deleted: false,
      name: "Build 104 Student",
      status: "active",
      studentId,
    });
    await firestore.doc(metricsPath).set({
      avgRawScorePercent: 76,
      disciplineIndex: 82,
      riskState: "Stable",
      studentId,
    });

    const result = await service.softDeleteStudent({
      actorId: "admin_build_104",
      actorRole: "admin",
      instituteId,
      studentId,
    });

    const studentSnapshot = await firestore.doc(studentPath).get();
    const metricsSnapshot = await firestore.doc(metricsPath).get();
    const auditSnapshot = await firestore.collection(auditLogsPath)
      .where("actionType", "==", "SOFT_DELETE_STUDENT")
      .get();

    assert.equal(result.deleted, true);
    assert.equal(result.alreadyDeleted, false);
    assert.equal(studentSnapshot.get("deleted"), true);
    assert.equal(metricsSnapshot.exists, true);
    assert.equal(auditSnapshot.size, 1);
    assert.equal(auditSnapshot.docs[0]?.get("targetId"), studentId);

    await deleteCollectionDocuments(auditLogsPath);
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

test(
  "softDeleteStudent is idempotent for already deleted students",
  async () => {
    const instituteId = "inst_build_104_idempotent";
    const studentId = "student_build_104_idempotent";
    const auditLogsPath = `institutes/${instituteId}/auditLogs`;
    const studentPath = `institutes/${instituteId}/students/${studentId}`;
    const service = new StudentSoftDeleteService({
      firestore,
      logStudentSoftDelete:
        administrativeActionLoggingService.logStudentSoftDelete.bind(
          administrativeActionLoggingService,
        ),
    });

    await deleteCollectionDocuments(auditLogsPath);
    await Promise.all([
      deleteDocumentIfPresent(studentPath),
      deleteDocumentIfPresent(`institutes/${instituteId}`),
    ]);

    await firestore.doc(`institutes/${instituteId}`).set({instituteId});
    await firestore.doc(studentPath).set({
      deleted: true,
      studentId,
    });

    const result = await service.softDeleteStudent({
      actorId: "admin_build_104",
      actorRole: "admin",
      instituteId,
      studentId,
    });

    const auditSnapshot = await firestore.collection(auditLogsPath)
      .where("actionType", "==", "SOFT_DELETE_STUDENT")
      .get();

    assert.equal(result.alreadyDeleted, true);
    assert.equal(auditSnapshot.size, 0);

    await deleteCollectionDocuments(auditLogsPath);
    await Promise.all([
      deleteDocumentIfPresent(studentPath),
      deleteDocumentIfPresent(`institutes/${instituteId}`),
    ]);
  },
);

test("softDeleteStudent rejects missing students", async () => {
  const service = new StudentSoftDeleteService({
    firestore,
    logStudentSoftDelete:
      administrativeActionLoggingService.logStudentSoftDelete.bind(
        administrativeActionLoggingService,
      ),
  });

  await assert.rejects(
    async () => {
      await service.softDeleteStudent({
        actorId: "admin_build_104",
        actorRole: "admin",
        instituteId: "inst_build_104_missing",
        studentId: "student_missing",
      });
    },
    (error: unknown) => {
      assert.equal(error instanceof StudentSoftDeleteValidationError, true);
      assert.equal(
        (error as StudentSoftDeleteValidationError).code,
        "NOT_FOUND",
      );
      return true;
    },
  );
});
