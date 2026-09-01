import assert from "node:assert/strict";
import test from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import * as gcpMetadata from "gcp-metadata";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {
  SubmissionAnalyticsTriggerResult,
} from "../types/submissionAnalyticsTrigger";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-39-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();

interface SubmissionAnalyticsTriggerServiceContract {
  markResultPropagationAvailable: (
    context: {
      eventId?: string;
      instituteId: string;
      runId: string;
      sessionId: string;
      yearId: string;
    },
    afterData: {
      status?: unknown;
      studentId?: unknown;
      submittedAt?: unknown;
    } | undefined,
  ) => Promise<void>;
  processSessionSubmissionTransition: (
    context: {
      eventId?: string;
      instituteId: string;
      runId: string;
      sessionId: string;
      yearId: string;
    },
    beforeData: {
      status?: unknown;
      studentId?: unknown;
      submittedAt?: unknown;
    } | undefined,
    afterData: {
      status?: unknown;
      studentId?: unknown;
      submittedAt?: unknown;
    } | undefined,
  ) => Promise<SubmissionAnalyticsTriggerResult>;
}

let submissionAnalyticsTriggerService:
  SubmissionAnalyticsTriggerServiceContract;

test.before(async () => {
  const module = await import("../services/submissionAnalyticsTrigger.js");
  submissionAnalyticsTriggerService = module.submissionAnalyticsTriggerService;
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
  "processSessionSubmissionTransition stores analytics trigger markers and " +
    "stays idempotent on retries",
  async () => {
    const instituteId = "inst_build_39_success";
    const yearId = "2026";
    const runId = "run_build_39_success";
    const sessionId = "session_build_39_success";
    const studentId = "student_build_39_success";
    const submittedAt = Timestamp.fromMillis(Date.now());
    const runAnalyticsPath =
      `institutes/${instituteId}/academicYears/${yearId}/runAnalytics/${runId}`;
    const studentYearMetricsPath =
      `institutes/${instituteId}/academicYears/${yearId}/` +
      `studentYearMetrics/${studentId}`;

    await deleteDocumentIfPresent(runAnalyticsPath);
    await deleteDocumentIfPresent(studentYearMetricsPath);

    const firstResult =
      await submissionAnalyticsTriggerService
        .processSessionSubmissionTransition(
          {
            eventId: "event_build_39_1",
            instituteId,
            runId,
            sessionId,
            yearId,
          },
          {
            status: "active",
            studentId,
            submittedAt: null,
          },
          {
            status: "submitted",
            studentId,
            submittedAt,
          },
        );

    assert.equal(firstResult.triggered, true);
    assert.equal(firstResult.idempotent, false);
    assert.equal(firstResult.runAnalyticsPath, runAnalyticsPath);
    assert.equal(firstResult.studentYearMetricsPath, studentYearMetricsPath);

    const runAnalyticsSnapshot = await firestore.doc(runAnalyticsPath).get();
    const runAnalyticsData = runAnalyticsSnapshot.data();
    assert.equal(
      runAnalyticsData?.processingMarkers?.analyticsTrigger
        ?.lastProcessedSessionId,
      sessionId,
    );
    assert.ok(
      runAnalyticsData?.processingMarkers?.analyticsTrigger
        ?.runAnalyticsQueuedAt instanceof Timestamp,
    );
    assert.ok(
      runAnalyticsData?.processingMarkers?.analyticsTrigger
        ?.studentYearMetricsQueuedAt instanceof Timestamp,
    );
    assert.ok(
      runAnalyticsData?.processingMarkers?.analyticsTrigger
        ?.behavioralPatternDetectionQueuedAt instanceof Timestamp,
    );
    assert.equal(runAnalyticsData?.runId, runId);
    assert.equal(runAnalyticsData?.resultPropagation?.state, "processing");
    assert.equal(runAnalyticsData?.resultPropagation?.sessionId, sessionId);
    assert.equal(runAnalyticsData?.resultPropagation?.retryAfterSeconds, 2);

    const studentMetricsSnapshot = await firestore.doc(studentYearMetricsPath)
      .get();
    const studentMetricsData = studentMetricsSnapshot.data();
    assert.equal(
      studentMetricsData?.processingMarkers?.analyticsTrigger
        ?.lastProcessedSessionId,
      sessionId,
    );
    assert.equal(studentMetricsData?.studentId, studentId);
    assert.equal(studentMetricsData?.resultPropagation?.state, "processing");

    await submissionAnalyticsTriggerService.markResultPropagationAvailable(
      {
        eventId: "event_build_39_1",
        instituteId,
        runId,
        sessionId,
        yearId,
      },
      {
        status: "submitted",
        studentId,
        submittedAt,
      },
    );

    const availableRunAnalytics = (await firestore.doc(runAnalyticsPath).get())
      .data();
    const availableStudentMetrics = (
      await firestore.doc(studentYearMetricsPath).get()
    ).data();
    assert.equal(availableRunAnalytics?.resultPropagation?.state, "available");
    assert.equal(availableRunAnalytics?.resultPropagation?.retryAfterSeconds, 0);
    assert.equal(availableStudentMetrics?.resultPropagation?.state, "available");

    const secondResult =
      await submissionAnalyticsTriggerService
        .processSessionSubmissionTransition(
          {
            eventId: "event_build_39_1",
            instituteId,
            runId,
            sessionId,
            yearId,
          },
          {
            status: "active",
            studentId,
            submittedAt: null,
          },
          {
            status: "submitted",
            studentId,
            submittedAt,
          },
        );

    assert.equal(secondResult.triggered, false);
    assert.equal(secondResult.idempotent, true);
    assert.equal(secondResult.reason, "already_processed");

    const preservedAvailableRun = (await firestore.doc(runAnalyticsPath).get())
      .data();
    assert.equal(preservedAvailableRun?.resultPropagation?.state, "available");

    await deleteDocumentIfPresent(runAnalyticsPath);
    await deleteDocumentIfPresent(studentYearMetricsPath);
  },
);

test(
  "processSessionSubmissionTransition skips when submitted status transition " +
    "did not occur",
  async () => {
    const result =
      await submissionAnalyticsTriggerService
        .processSessionSubmissionTransition(
          {
            eventId: "event_build_39_skip",
            instituteId: "inst_build_39_skip",
            runId: "run_build_39_skip",
            sessionId: "session_build_39_skip",
            yearId: "2026",
          },
          {
            status: "submitted",
            studentId: "student_build_39_skip",
            submittedAt: Timestamp.fromMillis(Date.now() - 10_000),
          },
          {
            status: "submitted",
            studentId: "student_build_39_skip",
            submittedAt: Timestamp.fromMillis(Date.now()),
          },
        );

    assert.equal(result.triggered, false);
    assert.equal(result.reason, "status_not_transitioned");
  },
);

test(
  "processSessionSubmissionTransition rejects submitted transitions without " +
  "submittedAt",
  async () => {
    await assert.rejects(
      submissionAnalyticsTriggerService
        .processSessionSubmissionTransition(
          {
            instituteId: "inst_build_39_invalid",
            runId: "run_build_39_invalid",
            sessionId: "session_build_39_invalid",
            yearId: "2026",
          },
          {
            status: "active",
            studentId: "student_build_39_invalid",
            submittedAt: null,
          },
          {
            status: "submitted",
            studentId: "student_build_39_invalid",
            submittedAt: null,
          },
        ),
      (error: unknown) => {
        assert.match(String(error), /submittedAt timestamp/i);
        return true;
      },
    );
  },
);
