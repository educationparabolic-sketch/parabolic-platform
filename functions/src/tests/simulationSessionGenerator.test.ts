import assert from "node:assert/strict";
import test from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import * as gcpMetadata from "gcp-metadata";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {
  GenerateSyntheticSessionsResult,
} from "../types/simulationSessionGenerator";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-78-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();

interface SimulationSessionGeneratorServiceContract {
  generateSyntheticSessions: (input: {
    nodeEnv: "development" | "staging" | "production" | "test";
    simulationId: string;
    yearId: string;
  }) => Promise<GenerateSyntheticSessionsResult>;
}

let simulationSessionGeneratorService:
SimulationSessionGeneratorServiceContract;

test.before(async () => {
  const module = await import("../services/simulationSessionGenerator.js");
  simulationSessionGeneratorService = module.simulationSessionGeneratorService;
});

test.after(async () => {
  await getFirebaseAdminApp().delete();
});

const deleteCollection = async (collectionPath: string): Promise<void> => {
  const snapshot = await firestore.collection(collectionPath).get();

  await Promise.all(snapshot.docs.map((documentSnapshot) =>
    documentSnapshot.ref.delete()
  ));
};

const deleteDocumentIfPresent = async (path: string): Promise<void> => {
  const snapshot = await firestore.doc(path).get();

  if (snapshot.exists) {
    await snapshot.ref.delete();
  }
};

const seedSimulationEnvironment = async (
  institutePath: string,
  runCount: number,
): Promise<void> => {
  await firestore.doc(institutePath).set({
    calibrationVersion: "cal_v2026_01",
    createdAt: Timestamp.now(),
    instituteId: institutePath.split("/").pop(),
    parameterSnapshot: {
      archiveSimulationEnabled: true,
      difficultyDistribution: "realistic",
      instituteCount: 1,
      loadIntensity: "medium",
      riskDistributionBias: "balanced",
      runCount,
      studentCountPerInstitute: 2,
      timingAggressiveness: "moderate",
    },
    riskModelVersion: "risk_v3",
    runCount,
    simulationId: institutePath.replace("institutes/sim_", ""),
    simulationVersion: "sim_v1_preview",
    studentCount: 2,
  });
};

const seedSyntheticStudent = async (
  studentsPath: string,
  studentId: string,
  baselineAbility: number,
): Promise<void> => {
  await firestore.doc(`${studentsPath}/${studentId}`).set({
    baselineAbility,
    disciplineProfile: 0.72,
    fatigueFactor: 0.24,
    generatedAt: Timestamp.now(),
    impulsivenessScore: 0.28,
    name: `Synthetic ${studentId}`,
    overconfidenceScore: 0.31,
    simulationId: studentsPath.replace(/^institutes\/sim_/, "").split("/")[0],
    simulationVersion: "sim_v1_preview",
    status: "active",
    studentId,
    topicStrengthMap: {
      calculus: baselineAbility,
      kinematics: Number((baselineAbility - 0.08).toFixed(2)),
    },
  });
};

test(
  "generateSyntheticSessions creates deterministic submitted sessions and " +
    "remains idempotent",
  async () => {
    const simulationId = "build_78_sessions";
    const yearId = "2026";
    const institutePath = `institutes/sim_${simulationId}`;
    const studentsPath = `${institutePath}/students`;
    const runsRootPath = `${institutePath}/academicYears/${yearId}/runs`;

    await deleteCollection(`${runsRootPath}/sim_run_001/sessions`);
    await deleteCollection(`${runsRootPath}/sim_run_002/sessions`);
    await deleteDocumentIfPresent(`${runsRootPath}/sim_run_001`);
    await deleteDocumentIfPresent(`${runsRootPath}/sim_run_002`);
    await deleteCollection(studentsPath);
    await deleteDocumentIfPresent(institutePath);

    await seedSimulationEnvironment(institutePath, 2);
    await seedSyntheticStudent(studentsPath, "sim_student_0001", 0.82);
    await seedSyntheticStudent(studentsPath, "sim_student_0002", 0.64);

    const firstResult =
      await simulationSessionGeneratorService.generateSyntheticSessions({
        nodeEnv: "development",
        simulationId,
        yearId,
      });

    assert.equal(firstResult.generatedRunCount, 2);
    assert.equal(firstResult.generatedSessionCount, 4);
    assert.equal(firstResult.existingRunCount, 0);
    assert.equal(firstResult.existingSessionCount, 0);
    assert.equal(firstResult.sessionsRootPath, runsRootPath);

    const runSnapshot = await firestore
      .doc(`${runsRootPath}/sim_run_001`)
      .get();
    assert.equal(runSnapshot.data()?.mode, "Controlled");
    assert.equal(runSnapshot.data()?.questionIds.length, 20);

    const sessionSnapshot = await firestore.doc(
      `${runsRootPath}/sim_run_001/sessions/sim_run_001_sim_student_0001`,
    ).get();
    const sessionData = sessionSnapshot.data();

    assert.equal(sessionData?.status, "submitted");
    assert.equal(sessionData?.studentId, "sim_student_0001");
    assert.equal(sessionData?.runId, "sim_run_001");
    assert.equal(sessionData?.yearId, yearId);
    assert.equal(sessionData?.submissionLock, false);
    assert.equal(typeof sessionData?.rawScorePercent, "number");
    assert.equal(typeof sessionData?.accuracyPercent, "number");
    assert.equal(typeof sessionData?.disciplineIndex, "number");
    assert.equal(typeof sessionData?.riskState, "string");
    assert.ok(sessionData?.createdAt instanceof Timestamp);
    assert.ok(sessionData?.startedAt instanceof Timestamp);
    assert.ok(sessionData?.submittedAt instanceof Timestamp);
    assert.equal(
      Object.keys(sessionData?.questionTimeMap ?? {}).length,
      20,
    );
    assert.ok(Object.keys(sessionData?.answerMap ?? {}).length > 0);

    const secondResult =
      await simulationSessionGeneratorService.generateSyntheticSessions({
        nodeEnv: "development",
        simulationId: `sim_${simulationId}`,
        yearId,
      });

    assert.equal(secondResult.generatedRunCount, 0);
    assert.equal(secondResult.generatedSessionCount, 0);
    assert.equal(secondResult.existingRunCount, 2);
    assert.equal(secondResult.existingSessionCount, 4);

    await deleteCollection(`${runsRootPath}/sim_run_001/sessions`);
    await deleteCollection(`${runsRootPath}/sim_run_002/sessions`);
    await deleteDocumentIfPresent(`${runsRootPath}/sim_run_001`);
    await deleteDocumentIfPresent(`${runsRootPath}/sim_run_002`);
    await deleteCollection(studentsPath);
    await deleteDocumentIfPresent(institutePath);
  },
);

test(
  "generateSyntheticSessions rejects simulation namespaces without students",
  async () => {
    const simulationId = "build_78_missing_students";
    const institutePath = `institutes/sim_${simulationId}`;

    await deleteDocumentIfPresent(institutePath);
    await seedSimulationEnvironment(institutePath, 1);

    await assert.rejects(
      simulationSessionGeneratorService.generateSyntheticSessions({
        nodeEnv: "development",
        simulationId,
        yearId: "2026",
      }),
      (error: unknown) => {
        assert.match(String(error), /synthetic students must be generated/i);
        return true;
      },
    );

    await deleteDocumentIfPresent(institutePath);
  },
);
