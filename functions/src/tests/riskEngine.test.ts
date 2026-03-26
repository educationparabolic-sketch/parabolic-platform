import assert from "node:assert/strict";
import test from "node:test";
import * as gcpMetadata from "gcp-metadata";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {RiskEngineResult} from "../types/riskEngine";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-44-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();

interface RiskEngineServiceContract {
  processStudentYearMetricsUpdate: (
    context: {
      eventId?: string;
      instituteId: string;
      studentId: string;
      yearId: string;
    },
    beforeData: Record<string, unknown> | undefined,
    afterData: Record<string, unknown> | undefined,
  ) => Promise<RiskEngineResult>;
}

let riskEngineService: RiskEngineServiceContract;

test.before(async () => {
  const module = await import("../services/riskEngine.js");
  riskEngineService = module.riskEngineService;
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
  "processStudentYearMetricsUpdate computes student risk classification",
  async () => {
    const instituteId = "inst_build_44_success";
    const yearId = "2026";
    const studentId = "student_build_44_success";
    const studentMetricsPath =
      `institutes/${instituteId}/academicYears/${yearId}/` +
      `studentYearMetrics/${studentId}`;

    await deleteDocumentIfPresent(studentMetricsPath);

    await firestore.doc(studentMetricsPath).set({
      avgAccuracyPercent: 72,
      avgPhaseAdherence: 80,
      avgRawScorePercent: 68,
      easyNeglectRate: 10,
      guessRate: 18,
      hardBiasRate: 12,
      processingMarkers: {
        studentMetricsEngine: {
          lastProcessedSessionId: "session_build_44_1",
        },
      },
      studentId,
      totalTests: 1,
    });

    const firstResult = await riskEngineService.processStudentYearMetricsUpdate(
      {
        eventId: "event_build_44_1",
        instituteId,
        studentId,
        yearId,
      },
      undefined,
      {
        avgAccuracyPercent: 72,
        avgPhaseAdherence: 80,
        avgRawScorePercent: 68,
        easyNeglectRate: 10,
        guessRate: 18,
        hardBiasRate: 12,
        processingMarkers: {
          studentMetricsEngine: {
            lastProcessedSessionId: "session_build_44_1",
          },
        },
        totalTests: 1,
      },
    );

    assert.equal(firstResult.triggered, true);
    assert.equal(firstResult.idempotent, false);

    const firstData = (await firestore.doc(studentMetricsPath).get()).data();
    assert.equal(firstData?.riskState, "Stable");
    assert.equal(firstData?.riskScore, 14.3);
    assert.equal(firstData?.disciplineIndex, 81.59);
    assert.equal(firstData?.rollingRiskScore, 14.3);
    assert.equal(firstData?.rollingRiskCluster, "Stable");
    assert.equal(firstData?.riskModelVersion, "risk_v1");
    assert.deepEqual(
      firstData?.processingMarkers?.riskEngine?.recentRiskScores,
      [14.3],
    );

    await firestore.doc(studentMetricsPath).set({
      avgAccuracyPercent: 75,
      avgPhaseAdherence: 25,
      avgRawScorePercent: 70,
      easyNeglectRate: 20,
      guessRate: 90,
      hardBiasRate: 15,
      processingMarkers: {
        studentMetricsEngine: {
          lastProcessedSessionId: "session_build_44_2",
        },
      },
      totalTests: 2,
    }, {merge: true});

    const secondResult =
      await riskEngineService.processStudentYearMetricsUpdate(
        {
          eventId: "event_build_44_2",
          instituteId,
          studentId,
          yearId,
        },
        {
          processingMarkers: {
            studentMetricsEngine: {
              lastProcessedSessionId: "session_build_44_1",
            },
          },
        },
        {
          avgAccuracyPercent: 75,
          avgPhaseAdherence: 25,
          avgRawScorePercent: 70,
          easyNeglectRate: 20,
          guessRate: 90,
          hardBiasRate: 15,
          processingMarkers: {
            studentMetricsEngine: {
              lastProcessedSessionId: "session_build_44_2",
            },
          },
          totalTests: 2,
        },
      );

    assert.equal(secondResult.triggered, true);

    const secondData = (await firestore.doc(studentMetricsPath).get()).data();
    assert.equal(secondData?.riskState, "Volatile");
    assert.equal(secondData?.riskScore, 85);
    assert.equal(secondData?.disciplineIndex, 33);
    assert.equal(secondData?.rollingRiskScore, 49.65);
    assert.equal(secondData?.rollingRiskCluster, "Impulsive");
    assert.deepEqual(
      secondData?.processingMarkers?.riskEngine?.recentRiskScores,
      [14.3, 85],
    );

    await deleteDocumentIfPresent(studentMetricsPath);
  },
);

test(
  "processStudentYearMetricsUpdate is idempotent for duplicate upstream " +
    "student metrics updates",
  async () => {
    const instituteId = "inst_build_44_idempotent";
    const yearId = "2026";
    const studentId = "student_build_44_idempotent";
    const studentMetricsPath =
      `institutes/${instituteId}/academicYears/${yearId}/` +
      `studentYearMetrics/${studentId}`;

    await deleteDocumentIfPresent(studentMetricsPath);

    await firestore.doc(studentMetricsPath).set({
      avgAccuracyPercent: 64,
      avgPhaseAdherence: 50,
      avgRawScorePercent: 60,
      easyNeglectRate: 25,
      guessRate: 45,
      hardBiasRate: 20,
      processingMarkers: {
        studentMetricsEngine: {
          lastProcessedSessionId: "session_build_44_idempotent",
        },
      },
      totalTests: 1,
    });

    const firstResult = await riskEngineService.processStudentYearMetricsUpdate(
      {
        eventId: "event_build_44_idempotent_1",
        instituteId,
        studentId,
        yearId,
      },
      undefined,
      {
        avgAccuracyPercent: 64,
        avgPhaseAdherence: 50,
        avgRawScorePercent: 60,
        easyNeglectRate: 25,
        guessRate: 45,
        hardBiasRate: 20,
        processingMarkers: {
          studentMetricsEngine: {
            lastProcessedSessionId: "session_build_44_idempotent",
          },
        },
        totalTests: 1,
      },
    );

    assert.equal(firstResult.triggered, true);

    const secondResult =
      await riskEngineService.processStudentYearMetricsUpdate(
        {
          eventId: "event_build_44_idempotent_2",
          instituteId,
          studentId,
          yearId,
        },
        {
          processingMarkers: {
            studentMetricsEngine: {
              lastProcessedSessionId: "session_build_44_idempotent",
            },
          },
        },
        {
          avgAccuracyPercent: 64,
          avgPhaseAdherence: 50,
          avgRawScorePercent: 60,
          easyNeglectRate: 25,
          guessRate: 45,
          hardBiasRate: 20,
          processingMarkers: {
            studentMetricsEngine: {
              lastProcessedSessionId: "session_build_44_idempotent",
            },
          },
          totalTests: 1,
        },
      );

    assert.equal(secondResult.triggered, false);
    assert.equal(secondResult.idempotent, true);
    assert.equal(secondResult.reason, "already_processed");

    const data = (await firestore.doc(studentMetricsPath).get()).data();
    assert.deepEqual(
      data?.processingMarkers?.riskEngine?.recentRiskScores,
      [33.15],
    );

    await deleteDocumentIfPresent(studentMetricsPath);
  },
);

test(
  "processStudentYearMetricsUpdate skips documents without upstream " +
    "student-metrics markers",
  async () => {
    const result = await riskEngineService.processStudentYearMetricsUpdate(
      {
        eventId: "event_build_44_skip",
        instituteId: "inst_build_44_skip",
        studentId: "student_build_44_skip",
        yearId: "2026",
      },
      undefined,
      {
        avgAccuracyPercent: 60,
        avgPhaseAdherence: 60,
        avgRawScorePercent: 58,
        guessRate: 10,
        totalTests: 1,
      },
    );

    assert.equal(result.triggered, false);
    assert.equal(result.reason, "missing_upstream_marker");
  },
);
