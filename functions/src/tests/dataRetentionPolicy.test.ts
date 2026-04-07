import assert from "node:assert/strict";
import test from "node:test";
import * as gcpMetadata from "gcp-metadata";
import {Timestamp} from "firebase-admin/firestore";
import {
  DataRetentionPolicyService,
} from "../services/dataRetentionPolicy";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-102-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();

const createRetentionService = (): DataRetentionPolicyService =>
  new DataRetentionPolicyService({
    firestore,
    now: () => new Date("2026-04-07T00:00:00.000Z"),
    resolveConfig: () => ({
      auditLogRetentionDays: 365 * 7,
      billingRecordRetentionDays: 30,
      emailLogRetentionDays: 365,
      maxDocumentsPerRun: 50,
      sessionArchiveGraceDays: 30,
      sessionArchiveRetentionDays: 365 * 5,
    }),
  });

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
  "executePolicy drains archived academic-year session documents " +
    "without removing retained summaries",
  async () => {
    const archivedInstituteId = "inst_build_102_archived";
    const activeInstituteId = "inst_build_102_active";
    const archivedYearPath =
      `institutes/${archivedInstituteId}/academicYears/2024`;
    const archivedRunPath = `${archivedYearPath}/runs/run_archived`;
    const archivedSessionPath = `${archivedRunPath}/sessions/session_archived`;
    const activeYearPath =
      `institutes/${activeInstituteId}/academicYears/2026`;
    const activeRunPath = `${activeYearPath}/runs/run_active`;
    const activeSessionPath = `${activeRunPath}/sessions/session_active`;
    const archivedRunAnalyticsPath = `${archivedYearPath}/runAnalytics/` +
      "run_archived";

    await Promise.all([
      deleteDocumentIfPresent(archivedSessionPath),
      deleteDocumentIfPresent(archivedRunPath),
      deleteDocumentIfPresent(archivedRunAnalyticsPath),
      deleteDocumentIfPresent(archivedYearPath),
      deleteDocumentIfPresent(`institutes/${archivedInstituteId}`),
      deleteDocumentIfPresent(activeSessionPath),
      deleteDocumentIfPresent(activeRunPath),
      deleteDocumentIfPresent(activeYearPath),
      deleteDocumentIfPresent(`institutes/${activeInstituteId}`),
    ]);

    await firestore.doc(`institutes/${archivedInstituteId}`).set({
      instituteId: archivedInstituteId,
    });
    await firestore.doc(archivedYearPath).set({
      archivedAt: Timestamp.fromDate(new Date("2026-02-01T00:00:00.000Z")),
      snapshotGenerated: true,
      status: "archived",
    });
    await firestore.doc(archivedRunPath).set({
      runId: "run_archived",
      status: "archived",
    });
    await firestore.doc(archivedSessionPath).set({
      createdAt: Timestamp.fromDate(new Date("2026-01-05T08:00:00.000Z")),
      status: "submitted",
      submittedAt: Timestamp.fromDate(new Date("2026-01-05T09:00:00.000Z")),
    });
    await firestore.doc(archivedRunAnalyticsPath).set({
      avgRawScorePercent: 74,
    });

    await firestore.doc(`institutes/${activeInstituteId}`).set({
      instituteId: activeInstituteId,
    });
    await firestore.doc(activeYearPath).set({
      status: "active",
    });
    await firestore.doc(activeRunPath).set({
      runId: "run_active",
      status: "completed",
    });
    await firestore.doc(activeSessionPath).set({
      createdAt: Timestamp.fromDate(new Date("2026-04-01T08:00:00.000Z")),
      status: "submitted",
      submittedAt: Timestamp.fromDate(new Date("2026-04-01T09:00:00.000Z")),
    });

    const result = await createRetentionService().executePolicy();
    const [archivedSession, activeSession, archivedRunAnalytics] =
      await Promise.all([
        firestore.doc(archivedSessionPath).get(),
        firestore.doc(activeSessionPath).get(),
        firestore.doc(archivedRunAnalyticsPath).get(),
      ]);

    assert.equal(result.sessions.archivedAcademicYearsReviewed, 1);
    assert.equal(result.sessions.sessionDocumentsDeleted, 1);
    assert.equal(result.sessions.summaryDocumentsRetained, 1);
    assert.equal(archivedSession.exists, false);
    assert.equal(activeSession.exists, true);
    assert.equal(archivedRunAnalytics.exists, true);

    await Promise.all([
      deleteDocumentIfPresent(archivedRunAnalyticsPath),
      deleteDocumentIfPresent(archivedRunPath),
      deleteDocumentIfPresent(archivedYearPath),
      deleteDocumentIfPresent(`institutes/${archivedInstituteId}`),
      deleteDocumentIfPresent(activeSessionPath),
      deleteDocumentIfPresent(activeRunPath),
      deleteDocumentIfPresent(activeYearPath),
      deleteDocumentIfPresent(`institutes/${activeInstituteId}`),
    ]);
  },
);

test(
  "executePolicy deletes expired billing records and terminal email jobs " +
    "while preserving active queue items",
  async () => {
    const instituteId = "inst_build_102_finance";
    const billingPath =
      `institutes/${instituteId}/billingRecords/invoice_build_102_old`;
    const oldEmailPath = "emailQueue/email_build_102_old";
    const pendingEmailPath = "emailQueue/email_build_102_pending";
    const recentEmailPath = "emailQueue/email_build_102_recent";

    await Promise.all([
      deleteDocumentIfPresent(billingPath),
      deleteDocumentIfPresent(oldEmailPath),
      deleteDocumentIfPresent(pendingEmailPath),
      deleteDocumentIfPresent(recentEmailPath),
      deleteDocumentIfPresent(`institutes/${instituteId}`),
    ]);

    await firestore.doc(`institutes/${instituteId}`).set({instituteId});
    await firestore.doc(billingPath).set({
      createdAt: Timestamp.fromDate(new Date("2026-02-20T00:00:00.000Z")),
      status: "paid",
      stripeInvoiceId: "invoice_build_102_old",
    });
    await firestore.doc(oldEmailPath).set({
      createdAt: Timestamp.fromDate(new Date("2025-01-01T00:00:00.000Z")),
      sentAt: Timestamp.fromDate(new Date("2025-01-01T00:10:00.000Z")),
      status: "sent",
    });
    await firestore.doc(pendingEmailPath).set({
      createdAt: Timestamp.fromDate(new Date("2025-01-01T00:00:00.000Z")),
      sentAt: null,
      status: "pending",
    });
    await firestore.doc(recentEmailPath).set({
      createdAt: Timestamp.fromDate(new Date("2026-03-20T00:00:00.000Z")),
      sentAt: Timestamp.fromDate(new Date("2026-03-20T00:05:00.000Z")),
      status: "failed",
    });

    const result = await createRetentionService().executePolicy();
    const [billingSnapshot, oldEmailSnapshot, pendingEmailSnapshot,
      recentEmailSnapshot] = await Promise.all([
      firestore.doc(billingPath).get(),
      firestore.doc(oldEmailPath).get(),
      firestore.doc(pendingEmailPath).get(),
      firestore.doc(recentEmailPath).get(),
    ]);

    assert.equal(result.billingRecords.documentsDeleted, 1);
    assert.equal(result.emailQueue.documentsDeleted, 1);
    assert.equal(result.emailQueue.documentsRetained, 1);
    assert.equal(billingSnapshot.exists, false);
    assert.equal(oldEmailSnapshot.exists, false);
    assert.equal(pendingEmailSnapshot.exists, true);
    assert.equal(recentEmailSnapshot.exists, true);

    await Promise.all([
      deleteDocumentIfPresent(pendingEmailPath),
      deleteDocumentIfPresent(recentEmailPath),
      deleteDocumentIfPresent(`institutes/${instituteId}`),
    ]);
  },
);

test(
  "executePolicy preserves compliance and permanent historical logs",
  async () => {
    const instituteAuditPath =
      "institutes/inst_build_102_logs/auditLogs/audit_102_inst";
    const rootAuditPath = "auditLogs/audit_102_root";
    const vendorAuditPath = "vendorAuditLogs/audit_102_vendor";
    const instituteCalibrationPath =
      "institutes/inst_build_102_logs/calibrationHistory/cal_102_inst";
    const vendorCalibrationPath = "vendorCalibrationLogs/cal_102_vendor";

    await Promise.all([
      deleteDocumentIfPresent(instituteAuditPath),
      deleteDocumentIfPresent(rootAuditPath),
      deleteDocumentIfPresent(vendorAuditPath),
      deleteDocumentIfPresent(instituteCalibrationPath),
      deleteDocumentIfPresent(vendorCalibrationPath),
      deleteDocumentIfPresent("institutes/inst_build_102_logs"),
    ]);

    await firestore.doc("institutes/inst_build_102_logs").set({
      instituteId: "inst_build_102_logs",
    });
    await firestore.doc(rootAuditPath).set({
      actionType: "TEST",
      timestamp: Timestamp.fromDate(new Date("2018-01-01T00:00:00.000Z")),
    });
    await firestore.doc(instituteAuditPath).set({
      actionType: "TEST",
      timestamp: Timestamp.fromDate(new Date("2018-01-01T00:00:00.000Z")),
    });
    await firestore.doc(vendorAuditPath).set({
      actionType: "TEST",
      timestamp: Timestamp.fromDate(new Date("2018-01-01T00:00:00.000Z")),
    });
    await firestore.doc(instituteCalibrationPath).set({
      calibrationVersion: "cal_v1",
      timestamp: Timestamp.fromDate(new Date("2020-01-01T00:00:00.000Z")),
    });
    await firestore.doc(vendorCalibrationPath).set({
      calibrationVersion: "cal_v1",
      timestamp: Timestamp.fromDate(new Date("2020-01-01T00:00:00.000Z")),
    });

    const result = await createRetentionService().executePolicy();
    const snapshots = await Promise.all([
      firestore.doc(rootAuditPath).get(),
      firestore.doc(instituteAuditPath).get(),
      firestore.doc(vendorAuditPath).get(),
      firestore.doc(instituteCalibrationPath).get(),
      firestore.doc(vendorCalibrationPath).get(),
    ]);

    assert.equal(result.auditLogs.documentsReviewed, 2);
    assert.equal(result.auditLogs.protectedDocumentsRetained, 2);
    assert.equal(result.auditLogs.vendorDocumentsReviewed, 1);
    assert.equal(result.calibrationHistory.documentsReviewed, 1);
    assert.equal(result.calibrationHistory.vendorDocumentsReviewed, 1);
    snapshots.forEach((snapshot) => {
      assert.equal(snapshot.exists, true);
    });

    await Promise.all([
      deleteDocumentIfPresent(instituteAuditPath),
      deleteDocumentIfPresent(rootAuditPath),
      deleteDocumentIfPresent(vendorAuditPath),
      deleteDocumentIfPresent(instituteCalibrationPath),
      deleteDocumentIfPresent(vendorCalibrationPath),
      deleteDocumentIfPresent("institutes/inst_build_102_logs"),
    ]);
  },
);
