import assert from "node:assert/strict";
import test from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import * as gcpMetadata from "gcp-metadata";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {
  RunAnalyticsEngineResult,
} from "../types/runAnalyticsEngine";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-41-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();

interface RunAnalyticsEngineServiceContract {
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
  ) => Promise<RunAnalyticsEngineResult>;
}

let runAnalyticsEngineService: RunAnalyticsEngineServiceContract;

test.before(async () => {
  const module = await import("../services/runAnalyticsEngine.js");
  runAnalyticsEngineService = module.runAnalyticsEngineService;
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
  "processSubmittedSession incrementally updates run analytics aggregates",
  async () => {
    const instituteId = "inst_build_41_success";
    const yearId = "2026";
    const runId = "run_build_41_success";
    const runPath =
      `institutes/${instituteId}/academicYears/${yearId}/runs/${runId}`;
    const runAnalyticsPath =
      `institutes/${instituteId}/academicYears/${yearId}/runAnalytics/${runId}`;

    await deleteDocumentIfPresent(runPath);
    await deleteDocumentIfPresent(runAnalyticsPath);

    await firestore.doc(runPath).set({
      recipientCount: 4,
      runId,
    });
    await firestore.doc(runAnalyticsPath).set({
      avgAccuracyPercent: 0,
      avgRawScorePercent: 0,
      completionRate: 0,
      createdAt: Timestamp.fromMillis(Date.now()),
      disciplineAverage: 0,
      guessRateAverage: 0,
      overrideCount: 0,
      phaseAdherenceAverage: 0,
      processingMarkers: {
        analyticsTrigger: {
          lastProcessedSessionId: "session_trigger_marker",
        },
      },
      riskDistribution: {},
      stdDeviation: 0,
    });

    const submittedAtOne = Timestamp.fromMillis(Date.now());
    const firstResult = await runAnalyticsEngineService.processSubmittedSession(
      {
        eventId: "event_build_41_1",
        instituteId,
        runId,
        sessionId: "session_build_41_1",
        yearId,
      },
      {
        status: "active",
      },
      {
        accuracyPercent: 80,
        disciplineIndex: 90,
        guessRate: 10,
        phaseAdherencePercent: 70,
        rawScorePercent: 60,
        riskState: "Stable",
        status: "submitted",
        submittedAt: submittedAtOne,
      },
    );

    assert.equal(firstResult.triggered, true);
    assert.equal(firstResult.idempotent, false);

    const firstSnapshot = await firestore.doc(runAnalyticsPath).get();
    const firstData = firstSnapshot.data();
    assert.equal(firstData?.avgRawScorePercent, 60);
    assert.equal(firstData?.avgAccuracyPercent, 80);
    assert.equal(firstData?.disciplineAverage, 90);
    assert.equal(firstData?.phaseAdherenceAverage, 70);
    assert.equal(firstData?.guessRateAverage, 10);
    assert.equal(firstData?.completionRate, 25);
    assert.equal(firstData?.stdDeviation, 0);
    assert.deepEqual(firstData?.riskDistribution, {
      Stable: 1,
    });
    assert.equal(
      firstData?.processingMarkers?.runAnalyticsEngine?.rawScoreHistogram?.[
        "60-69"
      ],
      1,
    );
    assert.equal(
      firstData?.processingMarkers?.analyticsTrigger?.lastProcessedSessionId,
      "session_trigger_marker",
    );

    const submittedAtTwo = Timestamp.fromMillis(Date.now() + 1000);
    const secondResult =
      await runAnalyticsEngineService.processSubmittedSession(
        {
          eventId: "event_build_41_2",
          instituteId,
          runId,
          sessionId: "session_build_41_2",
          yearId,
        },
        {
          status: "active",
        },
        {
          accuracyPercent: 90,
          disciplineIndex: 70,
          guessRate: 20,
          phaseAdherencePercent: 90,
          rawScorePercent: 100,
          riskState: "Impulsive",
          status: "submitted",
          submittedAt: submittedAtTwo,
        },
      );

    assert.equal(secondResult.triggered, true);

    const secondSnapshot = await firestore.doc(runAnalyticsPath).get();
    const secondData = secondSnapshot.data();
    assert.equal(secondData?.avgRawScorePercent, 80);
    assert.equal(secondData?.avgAccuracyPercent, 85);
    assert.equal(secondData?.disciplineAverage, 80);
    assert.equal(secondData?.phaseAdherenceAverage, 80);
    assert.equal(secondData?.guessRateAverage, 15);
    assert.equal(secondData?.completionRate, 50);
    assert.equal(secondData?.stdDeviation, 20);
    assert.deepEqual(secondData?.riskDistribution, {
      Impulsive: 1,
      Stable: 1,
    });
    assert.equal(
      secondData?.processingMarkers?.runAnalyticsEngine?.rawScoreHistogram?.[
        "60-69"
      ],
      1,
    );
    assert.equal(
      secondData?.processingMarkers?.runAnalyticsEngine?.rawScoreHistogram?.[
        "90-100"
      ],
      1,
    );
    assert.equal(
      secondData?.processingMarkers?.runAnalyticsEngine?.accuracyHistogram?.[
        "80-89"
      ],
      1,
    );
    assert.equal(
      secondData?.processingMarkers?.runAnalyticsEngine?.accuracyHistogram?.[
        "90-100"
      ],
      1,
    );

    await deleteDocumentIfPresent(runAnalyticsPath);
    await deleteDocumentIfPresent(runPath);
  },
);

test(
  "processSubmittedSession is idempotent for duplicate submitted events",
  async () => {
    const instituteId = "inst_build_41_idempotent";
    const yearId = "2026";
    const runId = "run_build_41_idempotent";
    const sessionId = "session_build_41_idempotent";
    const runPath =
      `institutes/${instituteId}/academicYears/${yearId}/runs/${runId}`;
    const runAnalyticsPath =
      `institutes/${instituteId}/academicYears/${yearId}/runAnalytics/${runId}`;
    const submittedAt = Timestamp.fromMillis(Date.now());

    await deleteDocumentIfPresent(runPath);
    await deleteDocumentIfPresent(runAnalyticsPath);

    await firestore.doc(runPath).set({
      recipientCount: 2,
      runId,
    });
    await firestore.doc(runAnalyticsPath).set({
      avgAccuracyPercent: 0,
      avgRawScorePercent: 0,
      completionRate: 0,
      createdAt: Timestamp.fromMillis(Date.now()),
      disciplineAverage: 0,
      guessRateAverage: 0,
      overrideCount: 0,
      phaseAdherenceAverage: 0,
      riskDistribution: {},
      stdDeviation: 0,
    });

    const firstResult = await runAnalyticsEngineService.processSubmittedSession(
      {
        eventId: "event_build_41_idempotent_1",
        instituteId,
        runId,
        sessionId,
        yearId,
      },
      {
        status: "active",
      },
      {
        accuracyPercent: 75,
        disciplineIndex: 65,
        guessRate: 12,
        phaseAdherencePercent: 55,
        rawScorePercent: 45,
        riskState: "Drift-Prone",
        status: "submitted",
        submittedAt,
      },
    );

    assert.equal(firstResult.triggered, true);

    const secondResult =
      await runAnalyticsEngineService.processSubmittedSession(
        {
          eventId: "event_build_41_idempotent_1",
          instituteId,
          runId,
          sessionId,
          yearId,
        },
        {
          status: "active",
        },
        {
          accuracyPercent: 75,
          disciplineIndex: 65,
          guessRate: 12,
          phaseAdherencePercent: 55,
          rawScorePercent: 45,
          riskState: "Drift-Prone",
          status: "submitted",
          submittedAt,
        },
      );

    assert.equal(secondResult.triggered, false);
    assert.equal(secondResult.idempotent, true);
    assert.equal(secondResult.reason, "already_processed");

    const snapshot = await firestore.doc(runAnalyticsPath).get();
    const data = snapshot.data();
    assert.equal(
      data?.processingMarkers?.runAnalyticsEngine?.submittedSessionCount,
      1,
    );
    assert.equal(data?.riskDistribution?.["Drift-Prone"], 1);

    await deleteDocumentIfPresent(runAnalyticsPath);
    await deleteDocumentIfPresent(runPath);
  },
);

test(
  "processSubmittedSession skips non-submission transitions",
  async () => {
    const result = await runAnalyticsEngineService.processSubmittedSession(
      {
        instituteId: "inst_build_41_skip",
        runId: "run_build_41_skip",
        sessionId: "session_build_41_skip",
        yearId: "2026",
      },
      {
        status: "active",
      },
      {
        status: "active",
      },
    );

    assert.equal(result.triggered, false);
    assert.equal(result.reason, "status_not_transitioned");
  },
);
