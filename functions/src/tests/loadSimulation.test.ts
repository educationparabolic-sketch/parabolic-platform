import assert from "node:assert/strict";
import test from "node:test";
import * as gcpMetadata from "gcp-metadata";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {
  InitializeSimulationEnvironmentResult,
} from "../types/simulationEnvironment";
import {
  GenerateSyntheticStudentsResult,
} from "../types/simulationStudentGenerator";
import {
  GenerateSyntheticSessionsResult,
} from "../types/simulationSessionGenerator";
import {
  RunLoadSimulationResult,
} from "../types/loadSimulation";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-79-tests";
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

interface SimulationStudentGeneratorServiceContract {
  generateSyntheticStudents: (input: {
    nodeEnv: "development" | "staging" | "production" | "test";
    simulationId: string;
    topicIds?: string[];
  }) => Promise<GenerateSyntheticStudentsResult>;
}

interface SimulationSessionGeneratorServiceContract {
  generateSyntheticSessions: (input: {
    nodeEnv: "development" | "staging" | "production" | "test";
    simulationId: string;
    yearId: string;
  }) => Promise<GenerateSyntheticSessionsResult>;
}

interface LoadSimulationEngineServiceContract {
  runLoadSimulation: (input: {
    nodeEnv: "development" | "staging" | "production" | "test";
    simulationId: string;
    yearId: string;
  }) => Promise<RunLoadSimulationResult>;
}

let simulationEnvironmentService: SimulationEnvironmentServiceContract;
let simulationStudentGeneratorService:
SimulationStudentGeneratorServiceContract;
let simulationSessionGeneratorService:
SimulationSessionGeneratorServiceContract;
let loadSimulationEngineService: LoadSimulationEngineServiceContract;

test.before(async () => {
  const [
    simulationEnvironmentModule,
    simulationStudentGeneratorModule,
    simulationSessionGeneratorModule,
    loadSimulationModule,
  ] = await Promise.all([
    import("../services/simulationEnvironment.js"),
    import("../services/simulationStudentGenerator.js"),
    import("../services/simulationSessionGenerator.js"),
    import("../services/loadSimulation.js"),
  ]);

  simulationEnvironmentService =
    simulationEnvironmentModule.simulationEnvironmentService;
  simulationStudentGeneratorService =
    simulationStudentGeneratorModule.simulationStudentGeneratorService;
  simulationSessionGeneratorService =
    simulationSessionGeneratorModule.simulationSessionGeneratorService;
  loadSimulationEngineService =
    loadSimulationModule.loadSimulationEngineService;
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

test(
  "runLoadSimulation generates analytics outputs and a reusable load report",
  async () => {
    const simulationId = "build_79_load";
    const yearId = "2026";
    const institutePath = `institutes/sim_${simulationId}`;
    const runsPath = `${institutePath}/academicYears/${yearId}/runs`;
    const runAnalyticsPath =
      `${institutePath}/academicYears/${yearId}/runAnalytics`;
    const studentMetricsPath =
      `${institutePath}/academicYears/${yearId}/studentYearMetrics`;
    const insightSnapshotsPath =
      `${institutePath}/academicYears/${yearId}/insightSnapshots`;
    const reportPath =
      `vendor/simulationReports/reports/load_${simulationId}_${yearId}`;
    const writeBurstProbesPath = `${reportPath}/writeBurstProbes`;

    await deleteCollection(writeBurstProbesPath);
    await deleteDocumentIfPresent(reportPath);
    await deleteCollection(insightSnapshotsPath);
    await deleteCollection(studentMetricsPath);
    await deleteCollection(runAnalyticsPath);
    await deleteCollection(`${runsPath}/sim_run_001/sessions`);
    await deleteCollection(`${runsPath}/sim_run_002/sessions`);
    await deleteDocumentIfPresent(`${runsPath}/sim_run_001`);
    await deleteDocumentIfPresent(`${runsPath}/sim_run_002`);
    await deleteCollection(`${institutePath}/students`);
    await deleteDocumentIfPresent(institutePath);

    await simulationEnvironmentService.initializeSimulationEnvironment({
      calibrationVersion: "cal_v2026_01",
      nodeEnv: "development",
      parameterSnapshot: {
        archiveSimulationEnabled: true,
        difficultyDistribution: "realistic",
        instituteCount: 1,
        loadIntensity: "low",
        riskDistributionBias: "balanced",
        runCount: 2,
        studentCountPerInstitute: 3,
        timingAggressiveness: "moderate",
      },
      riskModelVersion: "risk_v3",
      simulationId,
      simulationVersion: "sim_v1_preview",
    });
    await simulationStudentGeneratorService.generateSyntheticStudents({
      nodeEnv: "development",
      simulationId,
      topicIds: ["kinematics", "calculus"],
    });
    await simulationSessionGeneratorService.generateSyntheticSessions({
      nodeEnv: "development",
      simulationId,
      yearId,
    });

    const firstResult = await loadSimulationEngineService.runLoadSimulation({
      nodeEnv: "development",
      simulationId,
      yearId,
    });

    assert.equal(firstResult.reusedExistingReport, false);
    assert.equal(firstResult.reportPath, reportPath);
    assert.equal(firstResult.generatedReport.status, "completed");
    assert.equal(firstResult.generatedReport.simulationId, simulationId);
    assert.equal(firstResult.generatedReport.yearId, yearId);
    assert.equal(firstResult.generatedReport.scenarioSummaries.length, 5);
    assert.ok(firstResult.generatedReport.totalSyntheticSessions > 0);
    assert.ok(
      firstResult.analyticsDocumentsCreated.runAnalyticsCount >= 1,
    );
    assert.ok(
      firstResult.analyticsDocumentsCreated.studentYearMetricsCount >= 1,
    );
    assert.ok(
      firstResult.analyticsDocumentsCreated.insightSnapshotCount >= 1,
    );

    const reportSnapshot = await firestore.doc(reportPath).get();
    const reportData = reportSnapshot.data();

    assert.equal(reportData?.status, "completed");
    assert.equal(reportData?.simulationId, simulationId);
    assert.equal(reportData?.yearId, yearId);
    assert.equal(reportData?.scenarioSummaries.length, 5);

    const secondResult = await loadSimulationEngineService.runLoadSimulation({
      nodeEnv: "development",
      simulationId: `sim_${simulationId}`,
      yearId,
    });

    assert.equal(secondResult.reusedExistingReport, true);
    assert.equal(secondResult.reportPath, reportPath);

    await deleteCollection(writeBurstProbesPath);
    await deleteDocumentIfPresent(reportPath);
    await deleteCollection(insightSnapshotsPath);
    await deleteCollection(studentMetricsPath);
    await deleteCollection(runAnalyticsPath);
    await deleteCollection(`${runsPath}/sim_run_001/sessions`);
    await deleteCollection(`${runsPath}/sim_run_002/sessions`);
    await deleteDocumentIfPresent(`${runsPath}/sim_run_001`);
    await deleteDocumentIfPresent(`${runsPath}/sim_run_002`);
    await deleteCollection(`${institutePath}/students`);
    await deleteDocumentIfPresent(institutePath);
  },
);
