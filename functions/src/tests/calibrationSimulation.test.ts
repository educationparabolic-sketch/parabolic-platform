import assert from "node:assert/strict";
import test from "node:test";
import * as gcpMetadata from "gcp-metadata";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {
  SimulateCalibrationImpactResult,
} from "../types/calibrationSimulation";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-98-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();

interface CalibrationSimulationServiceContract {
  simulateCalibrationImpact: (
    input: {
      institutes: string[];
      weights: {
        easyNeglectWeight: number;
        guessWeight: number;
        hardBiasWeight: number;
        phaseWeight: number;
        wrongStreakWeight: number;
      };
    },
  ) => Promise<SimulateCalibrationImpactResult>;
}

let calibrationSimulationService: CalibrationSimulationServiceContract;

test.before(async () => {
  const module = await import("../services/calibrationSimulation.js");
  calibrationSimulationService = module.calibrationSimulationService;
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
  "simulateCalibrationImpact projects risk distribution changes " +
    "from aggregated student metrics only",
  async () => {
    const versionId = "cal_v2026_04_build_98";
    const instituteA = "inst_build_98_a";
    const instituteB = "inst_build_98_b";
    const globalCalibrationPath = `globalCalibration/${versionId}`;
    const instituteARootPath = `institutes/${instituteA}`;
    const instituteBRootPath = `institutes/${instituteB}`;
    const instituteACalibrationPath =
      `${instituteARootPath}/calibration/${versionId}`;
    const instituteAStudentMetricPaths = [
      `${instituteARootPath}/academicYears/2026/studentYearMetrics/student_a1`,
      `${instituteARootPath}/academicYears/2026/studentYearMetrics/student_a2`,
    ];
    const instituteBStudentMetricPaths = [
      `${instituteBRootPath}/academicYears/2026/studentYearMetrics/student_b1`,
    ];
    const [instituteAStudentMetricPathOne, instituteAStudentMetricPathTwo] =
      instituteAStudentMetricPaths;
    const [instituteBStudentMetricPathOne] = instituteBStudentMetricPaths;

    await Promise.all([
      deleteDocumentIfPresent(globalCalibrationPath),
      deleteDocumentIfPresent(instituteARootPath),
      deleteDocumentIfPresent(instituteBRootPath),
      deleteDocumentIfPresent(instituteACalibrationPath),
      ...instituteAStudentMetricPaths.map((path) =>
        deleteDocumentIfPresent(path)),
      ...instituteBStudentMetricPaths.map((path) =>
        deleteDocumentIfPresent(path)),
    ]);

    await firestore.doc(globalCalibrationPath).set({
      activationDate: "2026-04-05T12:00:00.000Z",
      createdBy: "vendor_build_96",
      isActive: true,
      thresholds: {
        guessFactorEasy: 1.2,
        guessFactorHard: 1.8,
        guessFactorMedium: 1.5,
        phaseDeviationThreshold: 24,
      },
      versionId,
      weights: {
        easyNeglectWeight: 0.2,
        guessWeight: 0.25,
        hardBiasWeight: 0.15,
        phaseWeight: 0.3,
        wrongStreakWeight: 0.1,
      },
    });
    await firestore.doc(instituteARootPath).set({
      calibrationVersion: versionId,
      instituteId: instituteA,
      name: "Build 98 Institute A",
    });
    await firestore.doc(instituteBRootPath).set({
      instituteId: instituteB,
      name: "Build 98 Institute B",
    });
    await firestore.doc(instituteACalibrationPath).set({
      versionId,
      weights: {
        easyNeglectWeight: 0.2,
        guessWeight: 0.2,
        hardBiasWeight: 0.1,
        phaseWeight: 0.3,
        wrongStreakWeight: 0.2,
      },
    });
    await firestore.doc(instituteAStudentMetricPathOne as string).set({
      avgPhaseAdherence: 88,
      easyNeglectRate: 10,
      guessRate: 12,
      hardBiasRate: 8,
      wrongStreakActive: false,
    });
    await firestore.doc(instituteAStudentMetricPathTwo as string).set({
      avgPhaseAdherence: 42,
      easyNeglectRate: 55,
      guessRate: 72,
      hardBiasRate: 35,
      wrongStreakActive: true,
    });
    await firestore.doc(instituteBStudentMetricPathOne as string).set({
      avgPhaseAdherence: 76,
      easyNeglectRate: 18,
      guessRate: 26,
      hardBiasRate: 22,
      wrongStreakActive: false,
    });

    const result = await calibrationSimulationService
      .simulateCalibrationImpact({
        institutes: [instituteA, instituteB],
        weights: {
          easyNeglectWeight: 0.15,
          guessWeight: 0.45,
          hardBiasWeight: 0.1,
          phaseWeight: 0.15,
          wrongStreakWeight: 0.15,
        },
      });

    assert.equal(result.before.instituteCount, 2);
    assert.equal(result.before.studentCount, 3);
    assert.equal(result.institutes.length, 2);
    assert.equal(result.institutes[0]?.currentCalibrationVersion, versionId);
    assert.equal(
      result.institutes[0]?.currentCalibrationSourcePath,
      instituteACalibrationPath,
    );
    assert.equal(
      result.institutes[1]?.currentCalibrationSourcePath,
      globalCalibrationPath,
    );
    assert.equal(result.before.riskDistribution.Stable.count, 1);
    assert.equal(result.before.riskDistribution["Drift-Prone"].count, 1);
    assert.equal(result.before.riskDistribution.Overextended.count, 1);
    assert.equal(result.after.riskDistribution.Stable.count, 1);
    assert.equal(result.after.riskDistribution["Drift-Prone"].count, 1);
    assert.equal(result.after.riskDistribution.Overextended.count, 1);
    assert.equal(result.delta.riskDistribution.Stable.count, 0);
    assert.equal(result.delta.riskDistribution["Drift-Prone"].count, 0);
    assert.equal(result.delta.riskDistribution.Overextended.count, 0);
    assert.ok(
      Math.abs(result.before.averageProjectedRiskScore - 31.9) < 0.01,
    );
    assert.ok(
      Math.abs(result.after.averageProjectedRiskScore - 32.52) < 0.02,
    );
    assert.ok(
      Math.abs(result.delta.averageProjectedRiskScore - 0.61) < 0.01,
    );

    await Promise.all([
      deleteDocumentIfPresent(globalCalibrationPath),
      deleteDocumentIfPresent(instituteACalibrationPath),
      deleteDocumentIfPresent(instituteARootPath),
      deleteDocumentIfPresent(instituteBRootPath),
      ...instituteAStudentMetricPaths.map((path) =>
        deleteDocumentIfPresent(path)),
      ...instituteBStudentMetricPaths.map((path) =>
        deleteDocumentIfPresent(path)),
    ]);
  },
);

test(
  "simulateCalibrationImpact rejects institutes without aggregated metrics",
  async () => {
    const versionId = "cal_v2026_04_build_98_empty";
    const instituteId = "inst_build_98_empty";
    const globalCalibrationPath = `globalCalibration/${versionId}`;
    const institutePath = `institutes/${instituteId}`;

    await Promise.all([
      deleteDocumentIfPresent(globalCalibrationPath),
      deleteDocumentIfPresent(institutePath),
    ]);

    await firestore.doc(globalCalibrationPath).set({
      activationDate: "2026-04-05T12:00:00.000Z",
      createdBy: "vendor_build_96",
      isActive: true,
      thresholds: {
        guessFactorEasy: 1.2,
        guessFactorHard: 1.8,
        guessFactorMedium: 1.5,
        phaseDeviationThreshold: 24,
      },
      versionId,
      weights: {
        easyNeglectWeight: 0.2,
        guessWeight: 0.25,
        hardBiasWeight: 0.15,
        phaseWeight: 0.3,
        wrongStreakWeight: 0.1,
      },
    });
    await firestore.doc(institutePath).set({
      instituteId,
      name: "Build 98 Empty Institute",
    });

    await assert.rejects(
      calibrationSimulationService.simulateCalibrationImpact({
        institutes: [instituteId],
        weights: {
          easyNeglectWeight: 0.2,
          guessWeight: 0.25,
          hardBiasWeight: 0.15,
          phaseWeight: 0.3,
          wrongStreakWeight: 0.1,
        },
      }),
      (error: unknown) => {
        assert.match(String(error), /aggregated student metrics/i);
        return true;
      },
    );

    await Promise.all([
      deleteDocumentIfPresent(globalCalibrationPath),
      deleteDocumentIfPresent(institutePath),
    ]);
  },
);
