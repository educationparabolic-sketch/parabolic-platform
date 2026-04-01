import assert from "node:assert/strict";
import test from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import * as gcpMetadata from "gcp-metadata";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {
  GenerateSyntheticStudentsResult,
} from "../types/simulationStudentGenerator";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-77-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();

interface SimulationStudentGeneratorServiceContract {
  generateSyntheticStudents: (input: {
    nodeEnv: "development" | "staging" | "production" | "test";
    simulationId: string;
    topicIds?: string[];
  }) => Promise<GenerateSyntheticStudentsResult>;
}

let simulationStudentGeneratorService:
SimulationStudentGeneratorServiceContract;

test.before(async () => {
  const module = await import("../services/simulationStudentGenerator.js");
  simulationStudentGeneratorService = module.simulationStudentGeneratorService;
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
  studentCountPerInstitute: number,
): Promise<void> => {
  await firestore.doc(institutePath).set({
    calibrationVersion: "cal_v2026_01",
    createdAt: Timestamp.now(),
    instituteId: institutePath.split("/").pop(),
    parameterSnapshot: {
      archiveSimulationEnabled: true,
      difficultyDistribution: "realistic",
      instituteCount: 5,
      loadIntensity: "medium",
      riskDistributionBias: "balanced",
      runCount: 20,
      studentCountPerInstitute,
      timingAggressiveness: "moderate",
    },
    riskModelVersion: "risk_v3",
    runCount: 20,
    simulationId: institutePath.replace("institutes/sim_", ""),
    simulationVersion: "sim_v1_preview",
    studentCount: studentCountPerInstitute,
  });
};

test(
  "generateSyntheticStudents creates deterministic student profiles and " +
    "remains idempotent",
  async () => {
    const simulationId = "build_77_students";
    const institutePath = `institutes/sim_${simulationId}`;
    const studentsPath = `${institutePath}/students`;

    await deleteCollection(studentsPath);
    await deleteDocumentIfPresent(institutePath);
    await seedSimulationEnvironment(institutePath, 3);

    const firstResult =
      await simulationStudentGeneratorService.generateSyntheticStudents({
        nodeEnv: "development",
        simulationId,
      });

    assert.equal(firstResult.generatedCount, 3);
    assert.equal(firstResult.existingCount, 0);
    assert.equal(firstResult.studentsPath, studentsPath);
    assert.deepEqual(firstResult.topicIds, ["kinematics", "calculus"]);

    const studentSnapshots = await firestore.collection(studentsPath).get();
    assert.equal(studentSnapshots.size, 3);

    const firstStudentData = studentSnapshots.docs[0]?.data();
    assert.equal(firstStudentData?.studentId, "sim_student_0001");
    assert.equal(firstStudentData?.simulationId, simulationId);
    assert.equal(firstStudentData?.simulationVersion, "sim_v1_preview");
    assert.equal(firstStudentData?.status, "active");
    assert.equal(typeof firstStudentData?.name, "string");
    assert.equal(typeof firstStudentData?.baselineAbility, "number");
    assert.equal(typeof firstStudentData?.disciplineProfile, "number");
    assert.equal(typeof firstStudentData?.impulsivenessScore, "number");
    assert.equal(typeof firstStudentData?.fatigueFactor, "number");
    assert.equal(typeof firstStudentData?.overconfidenceScore, "number");
    assert.deepEqual(
      Object.keys(firstStudentData?.topicStrengthMap ?? {}),
      ["kinematics", "calculus"],
    );
    assert.ok(firstStudentData?.generatedAt instanceof Timestamp);

    const secondResult =
      await simulationStudentGeneratorService.generateSyntheticStudents({
        nodeEnv: "development",
        simulationId: `sim_${simulationId}`,
      });

    assert.equal(secondResult.generatedCount, 0);
    assert.equal(secondResult.existingCount, 3);

    await deleteCollection(studentsPath);
    await deleteDocumentIfPresent(institutePath);
  },
);

test(
  "generateSyntheticStudents rejects missing simulation environments",
  async () => {
    await assert.rejects(
      simulationStudentGeneratorService.generateSyntheticStudents({
        nodeEnv: "development",
        simulationId: "build_77_missing_environment",
      }),
      (error: unknown) => {
        assert.match(
          String(error),
          /simulation environment must be initialized/i,
        );
        return true;
      },
    );
  },
);
