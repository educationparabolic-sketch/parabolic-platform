import assert from "node:assert/strict";
import test from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import * as gcpMetadata from "gcp-metadata";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {
  NotificationQueueGenerationResult,
} from "../types/notificationQueueGeneration";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-47-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();

interface NotificationQueueGenerationServiceContract {
  processSubmittedSession: (
    context: {
      eventId?: string;
      instituteId: string;
      runId: string;
      sessionId: string;
      yearId: string;
    },
    beforeData: Record<string, unknown> | undefined,
    afterData: Record<string, unknown> | undefined,
  ) => Promise<NotificationQueueGenerationResult>;
}

let notificationQueueGenerationService:
  NotificationQueueGenerationServiceContract;

test.before(async () => {
  const module = await import("../services/notificationQueueGeneration.js");
  notificationQueueGenerationService =
    module.notificationQueueGenerationService;
});

test.after(async () => {
  await getFirebaseAdminApp().delete();
});

const deleteDocumentIfPresent = async (path: string): Promise<void> => {
  const snapshot = await firestore.doc(path).get();

  if (snapshot.exists) {
    await firestore.doc(path).delete();
  }
};

test(
  "processSubmittedSession creates high-risk and discipline queue jobs",
  async () => {
    const instituteId = "inst_build_47_alerts";
    const yearId = "2026";
    const runId = "run_build_47_alerts";
    const sessionId = "session_build_47_alerts";
    const studentId = "student_build_47_alerts";
    const studentPath = `institutes/${instituteId}/students/${studentId}`;
    const studentMetricsPath =
      `institutes/${instituteId}/academicYears/${yearId}/` +
      `studentYearMetrics/${studentId}`;
    const highRiskJobPath =
      "emailQueue/high_risk_student_alert_" +
      `${instituteId}_${yearId}_${runId}_${sessionId}_${studentId}`;
    const disciplineJobPath =
      "emailQueue/discipline_violation_notification_" +
      `${instituteId}_${yearId}_${runId}_${sessionId}_${studentId}`;

    await deleteDocumentIfPresent(studentPath);
    await deleteDocumentIfPresent(studentMetricsPath);
    await deleteDocumentIfPresent(highRiskJobPath);
    await deleteDocumentIfPresent(disciplineJobPath);

    await firestore.doc(studentPath).set({
      email: "student.alerts@example.com",
      name: "Alerts Student",
      studentId,
    });
    await firestore.doc(studentMetricsPath).set({
      escalationLevel: "High",
      interventionSuggestion: "Recommend Controlled Mode",
      patterns: {
        rush: {
          active: true,
          frequency: 3,
          severity: "Moderate",
        },
      },
      riskScore: 87,
      riskState: "Volatile",
    });

    const submittedAt = Timestamp.fromMillis(Date.now());
    const result = await notificationQueueGenerationService
      .processSubmittedSession(
        {
          eventId: "event_build_47_alerts",
          instituteId,
          runId,
          sessionId,
          yearId,
        },
        {
          status: "active",
        },
        {
          accuracyPercent: 58,
          disciplineIndex: 42,
          rawScorePercent: 54,
          status: "submitted",
          studentId,
          submittedAt,
        },
      );

    assert.equal(result.triggered, true);
    assert.equal(result.idempotent, false);
    assert.deepEqual(result.jobPaths, [
      highRiskJobPath,
      disciplineJobPath,
    ]);

    const [highRiskJob, disciplineJob] = await Promise.all([
      firestore.doc(highRiskJobPath).get(),
      firestore.doc(disciplineJobPath).get(),
    ]);

    assert.equal(highRiskJob.data()?.templateType, "high_risk_student_alert");
    assert.equal(highRiskJob.data()?.recipientEmail,
      "student.alerts@example.com");
    assert.equal(highRiskJob.data()?.payload?.riskState, "Volatile");
    assert.equal(
      disciplineJob.data()?.templateType,
      "discipline_violation_notification",
    );
    assert.equal(disciplineJob.data()?.payload?.triggeredPatterns, "rush");

    await deleteDocumentIfPresent(studentPath);
    await deleteDocumentIfPresent(studentMetricsPath);
    await deleteDocumentIfPresent(highRiskJobPath);
    await deleteDocumentIfPresent(disciplineJobPath);
  },
);

test(
  "processSubmittedSession creates recognition job and stays idempotent",
  async () => {
    const instituteId = "inst_build_47_recognition";
    const yearId = "2026";
    const runId = "run_build_47_recognition";
    const sessionId = "session_build_47_recognition";
    const studentId = "student_build_47_recognition";
    const studentPath = `institutes/${instituteId}/students/${studentId}`;
    const studentMetricsPath =
      `institutes/${instituteId}/academicYears/${yearId}/` +
      `studentYearMetrics/${studentId}`;
    const recognitionJobPath =
      "emailQueue/exceptional_performance_recognition_" +
      `${instituteId}_${yearId}_${runId}_${sessionId}_${studentId}`;

    await deleteDocumentIfPresent(studentPath);
    await deleteDocumentIfPresent(studentMetricsPath);
    await deleteDocumentIfPresent(recognitionJobPath);

    await firestore.doc(studentPath).set({
      email: "student.recognition@example.com",
      name: "Recognition Student",
      studentId,
    });
    await firestore.doc(studentMetricsPath).set({
      riskScore: 18,
      riskState: "Stable",
    });

    const submittedAt = Timestamp.fromMillis(Date.now());
    const firstResult = await notificationQueueGenerationService
      .processSubmittedSession(
        {
          eventId: "event_build_47_recognition_1",
          instituteId,
          runId,
          sessionId,
          yearId,
        },
        {
          status: "active",
        },
        {
          accuracyPercent: 92,
          disciplineIndex: 88,
          rawScorePercent: 90,
          status: "submitted",
          studentId,
          submittedAt,
        },
      );

    assert.equal(firstResult.triggered, true);
    assert.deepEqual(firstResult.jobPaths, [recognitionJobPath]);

    const secondResult = await notificationQueueGenerationService
      .processSubmittedSession(
        {
          eventId: "event_build_47_recognition_2",
          instituteId,
          runId,
          sessionId,
          yearId,
        },
        {
          status: "active",
        },
        {
          accuracyPercent: 92,
          disciplineIndex: 88,
          rawScorePercent: 90,
          status: "submitted",
          studentId,
          submittedAt,
        },
      );

    assert.equal(secondResult.triggered, false);
    assert.equal(secondResult.idempotent, true);
    assert.equal(secondResult.reason, "already_processed");

    const recognitionJob = await firestore.doc(recognitionJobPath).get();
    assert.equal(
      recognitionJob.data()?.templateType,
      "exceptional_performance_recognition",
    );
    assert.equal(recognitionJob.data()?.payload?.rawScorePercent, 90);

    await deleteDocumentIfPresent(studentPath);
    await deleteDocumentIfPresent(studentMetricsPath);
    await deleteDocumentIfPresent(recognitionJobPath);
  },
);

test(
  "processSubmittedSession skips queue generation without student email",
  async () => {
    const instituteId = "inst_build_47_missing_email";
    const yearId = "2026";
    const runId = "run_build_47_missing_email";
    const sessionId = "session_build_47_missing_email";
    const studentId = "student_build_47_missing_email";
    const studentPath = `institutes/${instituteId}/students/${studentId}`;
    const studentMetricsPath =
      `institutes/${instituteId}/academicYears/${yearId}/` +
      `studentYearMetrics/${studentId}`;

    await deleteDocumentIfPresent(studentPath);
    await deleteDocumentIfPresent(studentMetricsPath);

    await firestore.doc(studentPath).set({
      name: "Missing Email Student",
      studentId,
    });
    await firestore.doc(studentMetricsPath).set({
      riskScore: 90,
      riskState: "Volatile",
    });

    const result = await notificationQueueGenerationService
      .processSubmittedSession(
        {
          eventId:
            "event_build_47_missing_email",
          instituteId,
          runId,
          sessionId,
          yearId,
        },
        {
          status: "active",
        },
        {
          accuracyPercent: 49,
          disciplineIndex: 44,
          rawScorePercent: 51,
          status: "submitted",
          studentId,
          submittedAt:
            Timestamp.fromMillis(Date.now()),
        },
      );

    assert.equal(result.triggered, false);
    assert.equal(result.reason, "missing_recipient_email");
    assert.deepEqual(result.jobPaths, []);

    await deleteDocumentIfPresent(studentPath);
    await deleteDocumentIfPresent(studentMetricsPath);
  },
);
