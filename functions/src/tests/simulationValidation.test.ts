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
import {
  RunSimulationValidationResult,
} from "../types/simulationValidation";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-80-tests";
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

interface SimulationValidationServiceContract {
  runSimulationValidation: (input: {
    nodeEnv: "development" | "staging" | "production" | "test";
    simulationId: string;
    yearId: string;
  }) => Promise<RunSimulationValidationResult>;
}

let simulationEnvironmentService: SimulationEnvironmentServiceContract;
let simulationStudentGeneratorService:
SimulationStudentGeneratorServiceContract;
let simulationSessionGeneratorService:
SimulationSessionGeneratorServiceContract;
let loadSimulationEngineService: LoadSimulationEngineServiceContract;
let simulationValidationService: SimulationValidationServiceContract;

test.before(async () => {
  const [
    simulationEnvironmentModule,
    simulationStudentGeneratorModule,
    simulationSessionGeneratorModule,
    loadSimulationModule,
    simulationValidationModule,
  ] = await Promise.all([
    import("../services/simulationEnvironment.js"),
    import("../services/simulationStudentGenerator.js"),
    import("../services/simulationSessionGenerator.js"),
    import("../services/loadSimulation.js"),
    import("../services/simulationValidation.js"),
  ]);

  simulationEnvironmentService =
    simulationEnvironmentModule.simulationEnvironmentService;
  simulationStudentGeneratorService =
    simulationStudentGeneratorModule.simulationStudentGeneratorService;
  simulationSessionGeneratorService =
    simulationSessionGeneratorModule.simulationSessionGeneratorService;
  loadSimulationEngineService =
    loadSimulationModule.loadSimulationEngineService;
  simulationValidationService =
    simulationValidationModule.simulationValidationService;
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
  "runSimulationValidation compares expected and actual intelligence outputs",
  async () => {
    const simulationId = "build_80_validation";
    const yearId = "2026";
    const institutePath = `institutes/sim_${simulationId}`;
    const runsPath = `${institutePath}/academicYears/${yearId}/runs`;
    const runAnalyticsPath =
      `${institutePath}/academicYears/${yearId}/runAnalytics`;
    const studentMetricsPath =
      `${institutePath}/academicYears/${yearId}/studentYearMetrics`;
    const validationReportPath =
      `vendor/simulationReports/reports/validation_${simulationId}_${yearId}`;
    const loadReportPath =
      `vendor/simulationReports/reports/load_${simulationId}_${yearId}`;

    await deleteDocumentIfPresent(validationReportPath);
    await deleteDocumentIfPresent(loadReportPath);
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
        studentCountPerInstitute: 5,
        timingAggressiveness: "moderate",
      },
      riskModelVersion: "risk_v3",
      simulationId,
      simulationVersion: "sim_v1_preview",
    });
    await simulationStudentGeneratorService.generateSyntheticStudents({
      nodeEnv: "development",
      simulationId,
      topicIds: ["algebra", "mechanics"],
    });
    await simulationSessionGeneratorService.generateSyntheticSessions({
      nodeEnv: "development",
      simulationId,
      yearId,
    });
    await loadSimulationEngineService.runLoadSimulation({
      nodeEnv: "development",
      simulationId,
      yearId,
    });

    const firstResult =
      await simulationValidationService.runSimulationValidation({
        nodeEnv: "development",
        simulationId,
        yearId,
      });

    assert.equal(firstResult.reusedExistingReport, false);
    assert.equal(firstResult.reportPath, validationReportPath);
    assert.equal(firstResult.validationReport.status, "completed");
    assert.equal(firstResult.validationReport.reportId,
      `validation_${simulationId}_${yearId}`);
    assert.equal(
      firstResult.validationReport.sourceLoadReportPath,
      loadReportPath,
    );
    assert.ok(
      firstResult.validationReport.totalStudentsCompared > 0,
    );
    assert.ok(
      firstResult.validationReport.riskDistributionAlignmentPercent >= 0,
    );
    assert.ok(
      firstResult.validationReport.patternDetectionAccuracy
        .accuracyPercent >= 0,
    );
    assert.ok(
      typeof firstResult.validationReport.stabilityIndexBehavior
        .actualStabilityIndex === "number",
    );

    const reportSnapshot = await firestore.doc(validationReportPath).get();
    const reportData = reportSnapshot.data();

    assert.equal(reportData?.status, "completed");
    assert.equal(reportData?.simulationId, simulationId);
    assert.equal(reportData?.yearId, yearId);
    assert.equal(reportData?.validationVersion, "build_80_v1");

    const secondResult =
      await simulationValidationService.runSimulationValidation({
        nodeEnv: "development",
        simulationId: `sim_${simulationId}`,
        yearId,
      });

    assert.equal(secondResult.reusedExistingReport, true);
    assert.equal(secondResult.reportPath, validationReportPath);

    await deleteDocumentIfPresent(validationReportPath);
    await deleteDocumentIfPresent(loadReportPath);
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
