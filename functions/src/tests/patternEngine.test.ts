import assert from "node:assert/strict";
import test from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import * as gcpMetadata from "gcp-metadata";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {PatternEngineResult} from "../types/patternEngine";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-45-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();

interface PatternEngineServiceContract {
  processStudentYearMetricsUpdate: (
    context: {
      eventId?: string;
      instituteId: string;
      studentId: string;
      yearId: string;
    },
    beforeData: Record<string, unknown> | undefined,
    afterData: Record<string, unknown> | undefined,
  ) => Promise<PatternEngineResult>;
}

let patternEngineService: PatternEngineServiceContract;

test.before(async () => {
  const module = await import("../services/patternEngine.js");
  patternEngineService = module.patternEngineService;
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

const buildMetricsPayload = (
  sessionId: string,
  submittedAt: FirebaseFirestore.Timestamp,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  processingMarkers: {
    studentMetricsEngine: {
      lastProcessedSessionId: sessionId,
      lastProcessedSubmittedAt: submittedAt,
      latestSessionSummary: {
        accuracyPercent: 62,
        consecutiveWrongStreakMax: 2,
        easyRemainingAfterPhase1Percent: 10,
        guessRate: 40,
        hardInPhase1Percent: 10,
        maxTimeViolationPercent: 0,
        minTimeViolationPercent: 40,
        phaseAdherencePercent: 78,
        rawScorePercent: 55,
        sessionId,
        skipBurstCount: 0,
        submittedAt,
        ...overrides,
      },
    },
  },
});

test(
  "processStudentYearMetricsUpdate computes rolling rush pattern state",
  async () => {
    const instituteId = "inst_build_45_success";
    const yearId = "2026";
    const studentId = "student_build_45_success";
    const studentMetricsPath =
      `institutes/${instituteId}/academicYears/${yearId}/` +
      `studentYearMetrics/${studentId}`;

    await deleteDocumentIfPresent(studentMetricsPath);

    for (let index = 0; index < 4; index += 1) {
      const sessionId = `session_build_45_${index + 1}`;
      const submittedAt = Timestamp.fromMillis(Date.now() + (index * 1_000));
      const payload = buildMetricsPayload(sessionId, submittedAt);
      await firestore.doc(studentMetricsPath).set(payload, {merge: true});

      const result = await patternEngineService.processStudentYearMetricsUpdate(
        {
          eventId: `event_build_45_${index + 1}`,
          instituteId,
          studentId,
          yearId,
        },
        undefined,
        payload,
      );

      assert.equal(result.triggered, true);
      assert.equal(result.idempotent, false);
    }

    const snapshot = await firestore.doc(studentMetricsPath).get();
    const data = snapshot.data();
    assert.equal(data?.rushPatternActive, true);
    assert.equal(data?.easyNeglectActive, false);
    assert.equal(data?.patterns?.rush?.frequency, 4);
    assert.equal(data?.patterns?.rush?.severity, "High");
    assert.equal(data?.interventionSuggestion, "Recommend Controlled Mode");
    assert.equal(data?.escalationLevel, "High");
    assert.deepEqual(
      data?.processingMarkers?.patternEngine?.lastNTestIds,
      [
        "session_build_45_1",
        "session_build_45_2",
        "session_build_45_3",
        "session_build_45_4",
      ],
    );

    await deleteDocumentIfPresent(studentMetricsPath);
  },
);

test(
  "processStudentYearMetricsUpdate is idempotent for duplicate session input",
  async () => {
    const instituteId = "inst_build_45_idempotent";
    const yearId = "2026";
    const studentId = "student_build_45_idempotent";
    const studentMetricsPath =
      `institutes/${instituteId}/academicYears/${yearId}/` +
      `studentYearMetrics/${studentId}`;
    const submittedAt = Timestamp.fromMillis(Date.now());
    const payload = buildMetricsPayload(
      "session_build_45_idempotent",
      submittedAt,
      {
        consecutiveWrongStreakMax: 5,
        guessRate: 15,
        minTimeViolationPercent: 10,
      },
    );

    await deleteDocumentIfPresent(studentMetricsPath);
    await firestore.doc(studentMetricsPath).set(payload);

    const firstResult =
      await patternEngineService.processStudentYearMetricsUpdate(
        {
          eventId: "event_build_45_idempotent_1",
          instituteId,
          studentId,
          yearId,
        },
        undefined,
        payload,
      );

    assert.equal(firstResult.triggered, true);

    const secondResult =
      await patternEngineService.processStudentYearMetricsUpdate(
        {
          eventId: "event_build_45_idempotent_2",
          instituteId,
          studentId,
          yearId,
        },
        payload,
        payload,
      );

    assert.equal(secondResult.triggered, false);
    assert.equal(secondResult.idempotent, true);
    assert.equal(secondResult.reason, "already_processed");

    const snapshot = await firestore.doc(studentMetricsPath).get();
    const data = snapshot.data();
    assert.equal(data?.wrongStreakActive, true);
    assert.equal(data?.patterns?.wrongStreak?.severity, "Critical");
    assert.equal(data?.interventionSuggestion, "Recommend Hard Mode");
    assert.equal(data?.escalationLevel, "Critical");

    await deleteDocumentIfPresent(studentMetricsPath);
  },
);
