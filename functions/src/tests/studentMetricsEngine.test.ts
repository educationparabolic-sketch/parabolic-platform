import assert from "node:assert/strict";
import test from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import * as gcpMetadata from "gcp-metadata";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {
  StudentMetricsEngineResult,
} from "../types/studentMetricsEngine";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-43-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();

interface StudentMetricsEngineServiceContract {
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
  ) => Promise<StudentMetricsEngineResult>;
}

let studentMetricsEngineService: StudentMetricsEngineServiceContract;

test.before(async () => {
  const module = await import("../services/studentMetricsEngine.js");
  studentMetricsEngineService = module.studentMetricsEngineService;
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
  "processSubmittedSession incrementally updates yearly student metrics",
  async () => {
    const instituteId = "inst_build_43_success";
    const yearId = "2026";
    const runId = "run_build_43_success";
    const studentId = "student_build_43_success";
    const studentMetricsPath =
      `institutes/${instituteId}/academicYears/${yearId}/` +
      `studentYearMetrics/${studentId}`;
    const runPath =
      `institutes/${instituteId}/academicYears/${yearId}/runs/${runId}`;
    const studentPath = `institutes/${instituteId}/students/${studentId}`;

    await deleteDocumentIfPresent(studentMetricsPath);
    await firestore.doc(runPath).set({
      endWindow: Timestamp.fromMillis(Date.now() + 60_000),
      mode: "Operational",
      runId,
      runName: "BWM-024 Student Result Run",
      startWindow: Timestamp.fromMillis(Date.now() - 60_000),
      testId: "test_bwm_024_student_result",
    });
    await firestore.doc(studentPath).set({
      name: "BWM-024 Student",
      status: "active",
      studentId,
    });

    const firstResult =
      await studentMetricsEngineService.processSubmittedSession(
        {
          eventId: "event_build_43_1",
          instituteId,
          runId,
          sessionId: "session_build_43_1",
          yearId,
        },
        {
          status: "active",
        },
        {
          accuracyPercent: 80,
          answerMap: {
            q1: {response: {kind: "mcq", optionId: "A"}, selectedOption: "A"},
          },
          consecutiveWrongStreakMax: 1,
          disciplineIndex: 90,
          easyRemainingAfterPhase1Percent: 20,
          guessRate: 10,
          hardInPhase1Percent: 15,
          maxTimeViolationPercent: 5,
          minTimeViolationPercent: 10,
          phaseAdherencePercent: 70,
          rawScorePercent: 60,
          riskState: "Stable",
          skipBurstCount: 0,
          startedAt: Timestamp.fromMillis(Date.now() - 30_000),
          status: "submitted",
          studentId,
          submittedAt: Timestamp.fromMillis(Date.now()),
          questionTimeMap: {q1: {cumulativeTimeSpent: 30}},
        },
      );

    assert.equal(firstResult.triggered, true);
    assert.equal(firstResult.idempotent, false);

    const firstSnapshot = await firestore.doc(studentMetricsPath).get();
    const firstData = firstSnapshot.data();
    assert.equal(firstData?.avgRawScorePercent, 60);
    assert.equal(firstData?.avgAccuracyPercent, 80);
    assert.equal(firstData?.disciplineIndex, 90);
    assert.equal(firstData?.disciplineIndexTrend, 0);
    assert.equal(firstData?.guessRate, 10);
    assert.equal(firstData?.guessRateTrend, 0);
    assert.equal(firstData?.avgPhaseAdherence, 70);
    assert.equal(firstData?.easyNeglectRate, 20);
    assert.equal(firstData?.hardBiasRate, 15);
    assert.equal(firstData?.totalTests, 1);
    assert.equal(
      firstData?.processingMarkers?.studentMetricsEngine
        ?.recentGovernanceMetrics?.length,
      1,
    );
    assert.equal(
      firstData?.processingMarkers?.studentMetricsEngine
        ?.lastProcessedSessionId,
      "session_build_43_1",
    );

    const secondResult =
      await studentMetricsEngineService.processSubmittedSession(
        {
          eventId: "event_build_43_2",
          instituteId,
          runId,
          sessionId: "session_build_43_2",
          yearId,
        },
        {
          status: "active",
        },
        {
          accuracyPercent: 60,
          disciplineIndex: 70,
          guessRate: 30,
          phaseAdherencePercent: 50,
          rawScorePercent: 40,
          status: "submitted",
          studentId,
          submittedAt: Timestamp.fromMillis(Date.now() + 1_000),
        },
      );

    assert.equal(secondResult.triggered, true);

    const secondSnapshot = await firestore.doc(studentMetricsPath).get();
    const secondData = secondSnapshot.data();
    assert.equal(secondData?.avgRawScorePercent, 50);
    assert.equal(secondData?.avgAccuracyPercent, 70);
    assert.equal(secondData?.disciplineIndex, 80);
    assert.equal(secondData?.disciplineIndexTrend, -20);
    assert.equal(secondData?.guessRate, 20);
    assert.equal(secondData?.guessRateTrend, 20);
    assert.equal(secondData?.avgPhaseAdherence, 60);
    assert.equal(secondData?.easyNeglectRate, 10);
    assert.equal(secondData?.hardBiasRate, 7.5);
    assert.equal(secondData?.totalTests, 2);
    assert.equal(
      secondData?.processingMarkers?.studentMetricsEngine
        ?.recentGovernanceMetrics?.length,
      2,
    );
    assert.equal(
      secondData?.processingMarkers?.studentMetricsEngine?.latestSessionSummary
        ?.sessionId,
      "session_build_43_2",
    );
    assert.equal(
      secondData?.processingMarkers?.studentMetricsEngine?.latestSessionSummary
        ?.maxTimeViolationPercent,
      0,
    );
    assert.equal(secondData?.testsAttempted, 2);
    assert.equal(secondData?.studentName, "BWM-024 Student");
    const resultSummary = (await firestore.doc(
      `${studentMetricsPath}/results/${runId}`,
    ).get()).data();
    assert.equal(resultSummary?.runName, "BWM-024 Student Result Run");
    assert.equal(resultSummary?.testId, "test_bwm_024_student_result");
    assert.equal(resultSummary?.sessionId, "session_build_43_2");
    assert.ok(resultSummary?.submittedAt instanceof Timestamp);

    await deleteDocumentIfPresent(studentMetricsPath);
    await deleteDocumentIfPresent(runPath);
    await deleteDocumentIfPresent(studentPath);
  },
);

test(
  "processSubmittedSession is idempotent for duplicate student metrics events",
  async () => {
    const instituteId = "inst_build_43_idempotent";
    const yearId = "2026";
    const runId = "run_build_43_idempotent";
    const sessionId = "session_build_43_idempotent";
    const studentId = "student_build_43_idempotent";
    const studentMetricsPath =
      `institutes/${instituteId}/academicYears/${yearId}/` +
      `studentYearMetrics/${studentId}`;
    const submittedAt = Timestamp.fromMillis(Date.now());

    await deleteDocumentIfPresent(studentMetricsPath);

    const payload = {
      accuracyPercent: 75,
      consecutiveWrongStreakMax: 0,
      disciplineIndex: 65,
      guessRate: 12,
      maxTimeViolationPercent: 0,
      minTimeViolationPercent: 0,
      phaseAdherencePercent: 55,
      rawScorePercent: 45,
      skipBurstCount: 0,
      status: "submitted",
      studentId,
      submittedAt,
    };

    const firstResult =
      await studentMetricsEngineService.processSubmittedSession(
        {
          eventId: "event_build_43_idempotent",
          instituteId,
          runId,
          sessionId,
          yearId,
        },
        {
          status: "active",
        },
        payload,
      );

    assert.equal(firstResult.triggered, true);

    const newerResult =
      await studentMetricsEngineService.processSubmittedSession(
        {
          eventId: "event_build_43_idempotent_newer",
          instituteId,
          runId: "run_build_43_idempotent_newer",
          sessionId: "session_build_43_idempotent_newer",
          yearId,
        },
        {status: "active"},
        {
          ...payload,
          rawScorePercent: 55,
          submittedAt: Timestamp.fromMillis(submittedAt.toMillis() + 1_000),
        },
      );
    assert.equal(newerResult.triggered, true);

    const secondResult =
      await studentMetricsEngineService.processSubmittedSession(
        {
          eventId: "event_build_43_idempotent",
          instituteId,
          runId,
          sessionId,
          yearId,
        },
        {
          status: "active",
        },
        payload,
      );

    assert.equal(secondResult.triggered, false);
    assert.equal(secondResult.idempotent, true);
    assert.equal(secondResult.reason, "already_processed");

    const studentMetricsData = (await firestore.doc(studentMetricsPath).get())
      .data();
    assert.equal(studentMetricsData?.totalTests, 2);
    assert.equal(studentMetricsData?.avgRawScorePercent, 50);
    assert.equal(
      studentMetricsData?.processingMarkers?.studentMetricsEngine
        ?.latestSessionSummary?.sessionId,
      "session_build_43_idempotent_newer",
    );
    const originalMarker = (await firestore.doc(
      `${studentMetricsPath}/processingMarkers/${sessionId}`,
    ).get()).data();
    assert.equal(originalMarker?.studentMetricsEngine?.processed, true);

    await deleteDocumentIfPresent(studentMetricsPath);
  },
);

test(
  "processSubmittedSession skips when submitted status transition " +
    "did not occur",
  async () => {
    const result = await studentMetricsEngineService.processSubmittedSession(
      {
        eventId: "event_build_43_skip",
        instituteId: "inst_build_43_skip",
        runId: "run_build_43_skip",
        sessionId: "session_build_43_skip",
        yearId: "2026",
      },
      {
        status: "submitted",
      },
      {
        accuracyPercent: 75,
        disciplineIndex: 65,
        guessRate: 12,
        rawScorePercent: 45,
        status: "submitted",
        studentId: "student_build_43_skip",
        submittedAt: Timestamp.fromMillis(Date.now()),
      },
    );

    assert.equal(result.triggered, false);
    assert.equal(result.reason, "status_not_transitioned");
  },
);
