import assert from "node:assert/strict";
import test from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import * as gcpMetadata from "gcp-metadata";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {
  InitializeSimulationEnvironmentResult,
} from "../types/simulationEnvironment";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-76-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();

interface SimulationEnvironmentServiceContract {
  initializeSimulationEnvironment: (input: {
    calibrationVersion: string;
    nodeEnv: "development" | "staging" | "production" | "test";
    parameterSnapshot: {
      archiveSimulationEnabled: boolean;
      difficultyDistribution: string;
      instituteCount: number;
      loadIntensity: string;
      riskDistributionBias: string;
      runCount: number;
      studentCountPerInstitute: number;
      timingAggressiveness: string;
    };
    riskModelVersion: string;
    simulationId: string;
    simulationVersion: string;
  }) => Promise<InitializeSimulationEnvironmentResult>;
}

let simulationEnvironmentService: SimulationEnvironmentServiceContract;

test.before(async () => {
  const module = await import("../services/simulationEnvironment.js");
  simulationEnvironmentService = module.simulationEnvironmentService;
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

const createParameterSnapshot = () => ({
  archiveSimulationEnabled: true,
  difficultyDistribution: "realistic",
  instituteCount: 5,
  loadIntensity: "medium",
  riskDistributionBias: "balanced",
  runCount: 20,
  studentCountPerInstitute: 200,
  timingAggressiveness: "moderate",
});

test(
  "initializeSimulationEnvironment creates an isolated simulation namespace " +
    "and remains idempotent",
  async () => {
    const simulationId = "build_76_environment";
    const institutePath = `institutes/sim_${simulationId}`;

    await deleteDocumentIfPresent(institutePath);

    const firstResult =
      await simulationEnvironmentService.initializeSimulationEnvironment({
        calibrationVersion: "cal_v2026_01",
        nodeEnv: "development",
        parameterSnapshot: createParameterSnapshot(),
        riskModelVersion: "risk_v3",
        simulationId,
        simulationVersion: "sim_v1_preview",
      });

    assert.equal(firstResult.wasCreated, true);
    assert.equal(firstResult.environmentPath, institutePath);
    assert.equal(firstResult.metadata.instituteId, `sim_${simulationId}`);
    assert.equal(firstResult.metadata.simulationId, simulationId);
    assert.equal(firstResult.metadata.runCount, 20);
    assert.equal(firstResult.metadata.studentCount, 200);

    const firstSnapshot = await firestore.doc(institutePath).get();
    const firstData = firstSnapshot.data();

    assert.equal(firstData?.simulationVersion, "sim_v1_preview");
    assert.equal(firstData?.calibrationVersion, "cal_v2026_01");
    assert.equal(firstData?.riskModelVersion, "risk_v3");
    assert.equal(firstData?.runCount, 20);
    assert.equal(firstData?.studentCount, 200);
    assert.deepEqual(firstData?.parameterSnapshot, createParameterSnapshot());
    assert.ok(firstData?.createdAt instanceof Timestamp);

    await firestore.doc(institutePath).set({
      riskModelVersion: "risk_v4",
    }, {merge: true});

    const secondResult =
      await simulationEnvironmentService.initializeSimulationEnvironment({
        calibrationVersion: "cal_v2026_01",
        nodeEnv: "development",
        parameterSnapshot: createParameterSnapshot(),
        riskModelVersion: "risk_v3",
        simulationId: `sim_${simulationId}`,
        simulationVersion: "sim_v1_preview",
      });

    assert.equal(secondResult.wasCreated, false);

    const secondSnapshot = await firestore.doc(institutePath).get();
    const secondData = secondSnapshot.data();
    assert.equal(secondData?.riskModelVersion, "risk_v4");

    await deleteDocumentIfPresent(institutePath);
  },
);

test(
  "initializeSimulationEnvironment rejects production environments",
  async () => {
    await assert.rejects(
      simulationEnvironmentService.initializeSimulationEnvironment({
        calibrationVersion: "cal_v2026_01",
        nodeEnv: "production",
        parameterSnapshot: createParameterSnapshot(),
        riskModelVersion: "risk_v3",
        simulationId: "build_76_prod_forbidden",
        simulationVersion: "sim_v1_preview",
      }),
      (error: unknown) => {
        assert.match(String(error), /development, staging, or test/i);
        return true;
      },
    );
  },
);
