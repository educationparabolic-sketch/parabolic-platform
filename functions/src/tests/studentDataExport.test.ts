import assert from "node:assert/strict";
import test from "node:test";
import * as gcpMetadata from "gcp-metadata";
import {Timestamp} from "firebase-admin/firestore";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {
  StudentDataExportService,
} from "../services/studentDataExport";
import {
  administrativeActionLoggingService,
} from "../services/administrativeActionLogging";
import {
  StudentDataExportValidationError,
} from "../types/studentDataExport";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-103-tests";
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
  "generateExport uploads a signed student data export and logs approval",
  async () => {
    const instituteId = "inst_build_103";
    const studentId = "student_build_103";
    const yearId = "2026";
    const runId = "run_build_103";
    const sessionId = "session_build_103";
    const academicYearPath =
      `institutes/${instituteId}/academicYears/${yearId}`;
    const auditLogsPath = `institutes/${instituteId}/auditLogs`;
    const insightsPath = `${academicYearPath}/insightSnapshots`;
    const metricPath =
      `${academicYearPath}/studentYearMetrics/${studentId}`;
    const studentPath = `institutes/${instituteId}/students/${studentId}`;
    const runPath = `${academicYearPath}/runs/${runId}`;
    const sessionPath = `${runPath}/sessions/${sessionId}`;
    const uploads: Array<{
      content: string;
      metadata: Record<string, string>;
      target: {bucketName: string; objectPath: string};
    }> = [];
    const service = new StudentDataExportService({
      createExportAuditLog:
        administrativeActionLoggingService.logStudentDataExport.bind(
          administrativeActionLoggingService,
        ),
      firestore,
      generateDownloadUrl: () => ({
        accessContext: "dataExportDownload",
        cdnPath:
          `${instituteId}/reports/2026/04/${studentId}-data-export.csv`,
        expiresAt: "2026-04-08T00:00:00.000Z",
        expiresInSeconds: 86400,
        signedUrl: "https://cdn.example.com/build-103-export.csv",
      }),
      now: () => new Date("2026-04-07T00:00:00.000Z"),
      resolveStorageTarget: () => ({
        bucketKey: "reports",
        bucketName: "build-103-reports",
        cdnBaseUrl: "https://cdn.example.com",
        cdnPath:
          `${instituteId}/reports/2026/04/${studentId}-data-export.csv`,
        contentType: "text/csv",
        directoryPath: `${instituteId}/reports/2026/04`,
        gsUri:
          `gs://build-103-reports/${instituteId}/reports/2026/04/` +
          `${studentId}-data-export.csv`,
        objectPath:
          `${instituteId}/reports/2026/04/${studentId}-data-export.csv`,
        requiresSignedUrl: true,
      }),
      uploadExportFile: async (target, content, metadata): Promise<void> => {
        uploads.push({
          content,
          metadata,
          target: {
            bucketName: target.bucketName,
            objectPath: target.objectPath,
          },
        });
      },
    });

    await deleteCollectionDocuments(auditLogsPath);
    await deleteCollectionDocuments(insightsPath);
    await Promise.all([
      deleteDocumentIfPresent(sessionPath),
      deleteDocumentIfPresent(runPath),
      deleteDocumentIfPresent(metricPath),
      deleteDocumentIfPresent(studentPath),
      deleteDocumentIfPresent(academicYearPath),
      deleteDocumentIfPresent(`institutes/${instituteId}`),
    ]);

    await firestore.doc(`institutes/${instituteId}`).set({
      instituteId,
      name: "Build 103 Institute",
    });
    await firestore.doc(studentPath).set({
      batchId: "batch-103",
      email: "student103@example.com",
      fullName: "Build 103 Student",
      studentId,
    });
    await firestore.doc(academicYearPath).set({
      status: "active",
      yearId,
    });
    await firestore.doc(metricPath).set({
      avgAccuracyPercent: 81,
      avgPhaseAdherence: 77,
      avgRawScorePercent: 78,
      disciplineIndex: 84,
      riskState: "Stable",
    });
    await firestore.doc(runPath).set({
      examType: "Mock",
      mode: "Controlled",
      testId: "test_build_103",
    });
    await firestore.doc(sessionPath).set({
      accuracyPercent: 80,
      calibrationVersion: "cal_v103",
      disciplineIndex: 84,
      phaseAdherencePercent: 77,
      rawScorePercent: 78,
      riskState: "Stable",
      status: "submitted",
      studentId,
      submittedAt: Timestamp.fromDate(new Date("2026-03-07T10:00:00.000Z")),
    });
    await firestore
      .doc(`${insightsPath}/student_${studentId}_${sessionId}`)
      .set({
        runId,
        sessionId,
        snapshotType: "student",
        sourceSubmittedAt: Timestamp.fromDate(
          new Date("2026-03-07T10:00:00.000Z"),
        ),
        studentId,
        summary: "Disciplined execution and steady scoring.",
        title: "March performance summary",
      });

    const result = await service.generateExport({
      actorId: "admin_build_103",
      actorRole: "admin",
      includeAiSummaries: true,
      instituteId,
      studentId,
    });

    const auditSnapshot = await firestore.collection(auditLogsPath)
      .where("actionType", "==", "DATA_EXPORT")
      .get();

    assert.equal(result.studentId, studentId);
    assert.equal(result.approvedBy, "admin_build_103");
    assert.equal(result.records.academicYearCount, 1);
    assert.equal(result.records.metricDocumentCount, 1);
    assert.equal(result.records.sessionCount, 1);
    assert.equal(result.records.aiSummaryCount, 1);
    assert.equal(result.download.accessContext, "dataExportDownload");
    assert.equal(uploads.length, 1);
    assert.equal(
      uploads[0]?.target.objectPath,
      `${instituteId}/reports/2026/04/${studentId}-data-export.csv`,
    );
    assert.match(uploads[0]?.content ?? "", /student_profile/i);
    assert.match(uploads[0]?.content ?? "", /session_history/i);
    assert.match(uploads[0]?.content ?? "", /Disciplined execution/i);
    assert.equal(uploads[0]?.metadata.requestedBy, studentId);
    assert.equal(auditSnapshot.size, 1);
    assert.equal(auditSnapshot.docs[0]?.get("targetId"), studentId);
    assert.equal(auditSnapshot.docs[0]?.get("metadata").approvedBy,
      "admin_build_103");

    await deleteCollectionDocuments(auditLogsPath);
    await deleteCollectionDocuments(insightsPath);
    await Promise.all([
      deleteDocumentIfPresent(sessionPath),
      deleteDocumentIfPresent(runPath),
      deleteDocumentIfPresent(metricPath),
      deleteDocumentIfPresent(studentPath),
      deleteDocumentIfPresent(academicYearPath),
      deleteDocumentIfPresent(`institutes/${instituteId}`),
    ]);
  },
);

test("generateExport rejects missing students", async () => {
  const service = new StudentDataExportService({
    createExportAuditLog:
      administrativeActionLoggingService.logStudentDataExport.bind(
        administrativeActionLoggingService,
      ),
    firestore,
    generateDownloadUrl: () => {
      throw new Error("generateDownloadUrl should not be called");
    },
    now: () => new Date("2026-04-07T00:00:00.000Z"),
    resolveStorageTarget: () => {
      throw new Error("resolveStorageTarget should not be called");
    },
    uploadExportFile: async () => {
      throw new Error("uploadExportFile should not be called");
    },
  });

  await assert.rejects(
    async () => {
      await service.generateExport({
        actorId: "admin_build_103",
        actorRole: "admin",
        includeAiSummaries: true,
        instituteId: "inst_build_103_missing",
        studentId: "student_missing",
      });
    },
    (error: unknown) => {
      assert.equal(error instanceof StudentDataExportValidationError, true);
      assert.equal(
        (error as StudentDataExportValidationError).code,
        "NOT_FOUND",
      );
      return true;
    },
  );
});
