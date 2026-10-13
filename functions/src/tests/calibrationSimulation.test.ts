import assert from "node:assert/strict";
import test from "node:test";
import * as gcpMetadata from "gcp-metadata";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {
  calibrationSimulationService,
} from "../services/calibrationSimulation";
import {
  SimulateCalibrationImpactInput,
} from "../types/calibrationSimulation";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-98-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();
const ACADEMIC_YEAR_ID = "2026";
const DEFAULT_WEIGHTS = {
  easyNeglectWeight: 0.2,
  guessWeight: 0.25,
  hardBiasWeight: 0.15,
  phaseWeight: 0.3,
  wrongStreakWeight: 0.1,
};
const DEFAULT_THRESHOLDS = {
  guessFactorEasy: 1.2,
  guessFactorHard: 1.8,
  guessFactorMedium: 1.5,
  phaseDeviationThreshold: 24,
};

const resetFirestore = async (): Promise<void> => {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  const projectId = process.env.GCLOUD_PROJECT;
  assert.equal(emulatorHost, "127.0.0.1:8080");
  assert.equal(projectId, "demo-parabolic-test");
  assert.equal(process.env.GOOGLE_CLOUD_PROJECT, "demo-parabolic-test");
  assert.ok(process.env.FIREBASE_EMULATOR_HUB);
  const response = await fetch(
    `http://${emulatorHost}/emulator/v1/projects/${projectId}/` +
      "databases/(default)/documents",
    {method: "DELETE"},
  );
  assert.equal(response.ok, true, await response.text());
};

test.beforeEach(resetFirestore);
test.afterEach(resetFirestore);

test.after(async () => {
  await getFirebaseAdminApp().delete();
});

const deletePaths = async (paths: string[]): Promise<void> => {
  for (let offset = 0; offset < paths.length; offset += 400) {
    const batch = firestore.batch();

    for (const path of paths.slice(offset, offset + 400)) {
      batch.delete(firestore.doc(path));
    }

    await batch.commit();
  }
};

const writeDocuments = async (
  entries: Array<{data: Record<string, unknown>; path: string}>,
): Promise<void> => {
  for (let offset = 0; offset < entries.length; offset += 400) {
    const batch = firestore.batch();

    for (const entry of entries.slice(offset, offset + 400)) {
      batch.set(firestore.doc(entry.path), entry.data);
    }

    await batch.commit();
  }
};

const buildVersion = (
  versionId: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  activationDate: "2026-04-05T12:00:00.000Z",
  createdAt: new Date("2026-04-05T11:00:00.000Z"),
  createdBy: "vendor_build_98",
  isActive: true,
  schemaVersion: 1,
  thresholds: DEFAULT_THRESHOLDS,
  versionId,
  weights: DEFAULT_WEIGHTS,
  ...overrides,
});

const buildInput = (
  institutes: string[],
): SimulateCalibrationImpactInput => ({
  academicYearId: ACADEMIC_YEAR_ID,
  institutes,
  weights: {
    easyNeglectWeight: 0.15,
    guessWeight: 0.45,
    hardBiasWeight: 0.1,
    phaseWeight: 0.15,
    wrongStreakWeight: 0.15,
  },
});

test(
  "simulateCalibrationImpact projects exact canonical and legacy summaries " +
    "without mutating stored authority",
  async () => {
    const versionId = "cal_v2026_04_strict_math";
    const instituteA = "inst_cal_math_a";
    const instituteB = "inst_cal_math_b";
    const globalPath = `globalCalibration/${versionId}`;
    const instituteAPath = `institutes/${instituteA}`;
    const instituteBPath = `institutes/${instituteB}`;
    const instituteACalibrationPath =
      `${instituteAPath}/calibration/${versionId}`;
    const yearAPath = `${instituteAPath}/academicYears/${ACADEMIC_YEAR_ID}`;
    const yearBPath = `${instituteBPath}/academicYears/${ACADEMIC_YEAR_ID}`;
    const metricPaths = [
      `${yearAPath}/studentYearMetrics/student_a1`,
      `${yearAPath}/studentYearMetrics/student_a2`,
      `${yearBPath}/studentYearMetrics/student_b1`,
    ];
    const paths = [
      globalPath,
      instituteAPath,
      instituteBPath,
      instituteACalibrationPath,
      yearAPath,
      yearBPath,
      ...metricPaths,
    ];

    await deletePaths(paths);
    await writeDocuments([
      {data: buildVersion(versionId), path: globalPath},
      {
        data: {calibrationVersion: versionId, instituteId: instituteA},
        path: instituteAPath,
      },
      {data: {instituteId: instituteB}, path: instituteBPath},
      {
        data: buildVersion(versionId, {
          deployedAt: new Date("2026-04-06T00:00:00.000Z"),
          instituteId: instituteA,
          sourceCalibrationPath: globalPath,
          weights: {
            easyNeglectWeight: 0.2,
            guessWeight: 0.2,
            hardBiasWeight: 0.1,
            phaseWeight: 0.3,
            wrongStreakWeight: 0.2,
          },
        }),
        path: instituteACalibrationPath,
      },
      {data: {academicYearId: ACADEMIC_YEAR_ID}, path: yearAPath},
      {data: {academicYearId: ACADEMIC_YEAR_ID}, path: yearBPath},
      {
        data: {
          avgGuessRatePercent: 12,
          avgPhaseAdherencePercent: 88,
          easyNeglectRatePercent: 10,
          hardBiasRatePercent: 8,
          historicalMarker: "unchanged",
          wrongStreakActive: false,
        },
        path: metricPaths[0] as string,
      },
      {
        data: {
          avgGuessRatePercent: 72,
          avgPhaseAdherence: 42,
          avgPhaseAdherencePercent: 42,
          easyNeglectRate: 55,
          easyNeglectRatePercent: 55,
          guessRate: 72,
          hardBiasRate: 35,
          hardBiasRatePercent: 35,
          wrongStreakActive: true,
        },
        path: metricPaths[1] as string,
      },
      {
        data: {
          avgPhaseAdherence: 76,
          easyNeglectRate: 18,
          guessRate: 26,
          hardBiasRate: 22,
          wrongStreakActive: false,
        },
        path: metricPaths[2] as string,
      },
    ]);
    const beforeDocument = await firestore.doc(metricPaths[0] as string).get();

    const result = await calibrationSimulationService
      .simulateCalibrationImpact(buildInput([instituteA, instituteB]));

    assert.equal(result.availability, "available");
    if (result.availability !== "available") return;
    assert.equal(result.metadata.model, "risk_projection_v1");
    assert.equal(result.metadata.academicYearId, ACADEMIC_YEAR_ID);
    assert.equal(result.metadata.sources.length, 2);
    assert.deepEqual(
      result.metadata.sources.map((source) => source.summaryDocumentCount),
      [2, 1],
    );
    assert.equal(result.metadata.unsupportedOutputs.productionRiskOutcome,
      "unavailable");
    assert.equal(result.before.instituteCount, 2);
    assert.equal(result.before.studentCount, 3);
    assert.equal(result.before.averageProjectedRiskScore, 31.9);
    assert.equal(result.after.averageProjectedRiskScore, 32.52);
    assert.equal(result.delta.averageProjectedRiskScore, 0.62);
    assert.equal(result.delta.studentCount, 0);
    assert.equal(result.before.riskDistribution.Stable.count, 1);
    assert.equal(result.before.riskDistribution["Drift-Prone"].count, 1);
    assert.equal(result.before.riskDistribution.Overextended.count, 1);
    assert.equal(
      result.institutes[0]?.currentCalibrationSourcePath,
      instituteACalibrationPath,
    );
    assert.equal(result.institutes[1]?.currentCalibrationSourcePath, globalPath);
    const firstSource = result.metadata.sources[0];
    assert.ok(firstSource);
    assert.ok(!("studentId" in firstSource));

    const afterDocument = await firestore.doc(metricPaths[0] as string).get();
    assert.deepEqual(afterDocument.data(), beforeDocument.data());
    await deletePaths(paths);
  },
);

test(
  "simulateCalibrationImpact returns an authoritative all-empty result",
  async () => {
    const versionId = "cal_v2026_04_all_empty";
    const institutes = ["inst_cal_empty_a", "inst_cal_empty_b"];
    const globalPath = `globalCalibration/${versionId}`;
    const paths = [globalPath];
    const entries = [{data: buildVersion(versionId), path: globalPath}];

    for (const instituteId of institutes) {
      const institutePath = `institutes/${instituteId}`;
      const yearPath = `${institutePath}/academicYears/${ACADEMIC_YEAR_ID}`;
      paths.push(institutePath, yearPath);
      entries.push({data: {instituteId}, path: institutePath});
      entries.push({data: {academicYearId: ACADEMIC_YEAR_ID}, path: yearPath});
    }

    await deletePaths(paths);
    await writeDocuments(entries);
    const result = await calibrationSimulationService
      .simulateCalibrationImpact(buildInput(institutes));

    assert.equal(result.availability, "empty");
    assert.equal(result.before, null);
    assert.equal(result.after, null);
    assert.equal(result.delta, null);
    assert.deepEqual(result.institutes, []);
    assert.deepEqual(
      result.metadata.sources.map((source) => source.summaryDocumentCount),
      [0, 0],
    );
    await deletePaths(paths);
  },
);

test(
  "simulateCalibrationImpact rejects mixed empty and populated sources",
  async () => {
    const versionId = "cal_v2026_04_mixed_empty";
    const institutes = ["inst_cal_mixed_a", "inst_cal_mixed_b"];
    const globalPath = `globalCalibration/${versionId}`;
    const metricPath =
      `institutes/${institutes[0]}/academicYears/${ACADEMIC_YEAR_ID}/` +
      "studentYearMetrics/student_one";
    const paths = [globalPath, metricPath];
    const entries = [
      {data: buildVersion(versionId), path: globalPath},
      {
        data: {
          avgGuessRatePercent: 20,
          avgPhaseAdherencePercent: 80,
          easyNeglectRatePercent: 20,
          hardBiasRatePercent: 20,
          wrongStreakActive: false,
        },
        path: metricPath,
      },
    ];

    for (const instituteId of institutes) {
      const institutePath = `institutes/${instituteId}`;
      const yearPath = `${institutePath}/academicYears/${ACADEMIC_YEAR_ID}`;
      paths.push(institutePath, yearPath);
      entries.push({data: {instituteId}, path: institutePath});
      entries.push({data: {academicYearId: ACADEMIC_YEAR_ID}, path: yearPath});
    }

    await deletePaths(paths);
    await writeDocuments(entries);
    await assert.rejects(
      calibrationSimulationService.simulateCalibrationImpact(
        buildInput(institutes),
      ),
      /mixes empty and non-empty/i,
    );
    await deletePaths(paths);
  },
);

test(
  "simulateCalibrationImpact rejects malformed aliases and dangling overrides",
  async () => {
    const versionId = "cal_v2026_04_strict_sources";
    const instituteId = "inst_cal_strict_sources";
    const globalPath = `globalCalibration/${versionId}`;
    const institutePath = `institutes/${instituteId}`;
    const yearPath = `${institutePath}/academicYears/${ACADEMIC_YEAR_ID}`;
    const metricPath = `${yearPath}/studentYearMetrics/student_one`;
    const paths = [globalPath, institutePath, yearPath, metricPath];

    await deletePaths(paths);
    await writeDocuments([
      {data: buildVersion(versionId), path: globalPath},
      {data: {instituteId}, path: institutePath},
      {data: {academicYearId: ACADEMIC_YEAR_ID}, path: yearPath},
      {
        data: {
          avgGuessRatePercent: 20,
          avgPhaseAdherence: 70,
          avgPhaseAdherencePercent: 80,
          easyNeglectRatePercent: 20,
          hardBiasRatePercent: 20,
          wrongStreakActive: false,
        },
        path: metricPath,
      },
    ]);

    await assert.rejects(
      calibrationSimulationService.simulateCalibrationImpact(
        buildInput([instituteId]),
      ),
      /conflicting avgPhaseAdherencePercent\/avgPhaseAdherence/i,
    );

    await firestore.doc(metricPath).set({
      avgGuessRatePercent: 20,
      avgPhaseAdherencePercent: 80,
      easyNeglectRatePercent: 20,
      hardBiasRatePercent: 20,
      wrongStreakActive: false,
    });
    await firestore.doc(institutePath).set({
      calibrationVersion: "cal_missing_override",
      instituteId,
    });
    await assert.rejects(
      calibrationSimulationService.simulateCalibrationImpact(
        buildInput([instituteId]),
      ),
      /dangling calibration reference/i,
    );
    await deletePaths(paths);
  },
);

test(
  "simulateCalibrationImpact rejects ambiguous and future active authority",
  async () => {
    const versions = ["cal_ambiguous_a", "cal_ambiguous_b"];
    const instituteId = "inst_cal_ambiguous";
    const institutePath = `institutes/${instituteId}`;
    const yearPath = `${institutePath}/academicYears/${ACADEMIC_YEAR_ID}`;
    const globalPaths = versions.map((versionId) =>
      `globalCalibration/${versionId}`);
    const paths = [...globalPaths, institutePath, yearPath];

    await deletePaths(paths);
    await writeDocuments([
      ...versions.map((versionId, index) => ({
        data: buildVersion(versionId, {
          activationDate: `2026-04-0${index + 5}T12:00:00.000Z`,
        }),
        path: globalPaths[index] as string,
      })),
      {data: {instituteId}, path: institutePath},
      {data: {academicYearId: ACADEMIC_YEAR_ID}, path: yearPath},
    ]);
    await assert.rejects(
      calibrationSimulationService.simulateCalibrationImpact(
        buildInput([instituteId]),
      ),
      /authority is ambiguous/i,
    );

    await firestore.doc(globalPaths[1] as string).delete();
    await firestore.doc(globalPaths[0] as string).set(buildVersion(
      versions[0] as string,
      {activationDate: "2999-01-01T00:00:00.000Z"},
    ));
    await assert.rejects(
      calibrationSimulationService.simulateCalibrationImpact(
        buildInput([instituteId]),
      ),
      /cannot be future-dated/i,
    );
    await deletePaths(paths);
  },
);

test(
  "simulateCalibrationImpact rejects invalid selection and weight schemas",
  async () => {
    await assert.rejects(
      calibrationSimulationService.simulateCalibrationImpact({
        ...buildInput(["inst_duplicate", "inst_duplicate"]),
      }),
      /unique IDs/i,
    );
    await assert.rejects(
      calibrationSimulationService.simulateCalibrationImpact({
        ...buildInput(["inst_invalid_weights"]),
        weights: {...DEFAULT_WEIGHTS, guessWeight: 0.26},
      }),
      /weights must sum to 1/i,
    );
    await assert.rejects(
      calibrationSimulationService.simulateCalibrationImpact({
        ...buildInput(Array.from({length: 21}, (_, index) => `inst_${index}`)),
      }),
      /1-20 entries/i,
    );
    await assert.rejects(
      calibrationSimulationService.simulateCalibrationImpact({
        ...buildInput(["inst_unknown_field"]),
        unsupportedMode: "draft",
      } as SimulateCalibrationImpactInput),
      /unsupported field/i,
    );
  },
);

test(
  "simulateCalibrationImpact rejects a per-institute summary overflow probe",
  async () => {
    const versionId = "cal_v2026_04_overflow";
    const instituteId = "inst_cal_overflow";
    const globalPath = `globalCalibration/${versionId}`;
    const institutePath = `institutes/${instituteId}`;
    const yearPath = `${institutePath}/academicYears/${ACADEMIC_YEAR_ID}`;
    const metricEntries = Array.from({length: 1001}, (_, index) => ({
      data: {
        avgGuessRatePercent: 20,
        avgPhaseAdherencePercent: 80,
        easyNeglectRatePercent: 20,
        hardBiasRatePercent: 20,
        wrongStreakActive: false,
      },
      path: `${yearPath}/studentYearMetrics/student_${String(index).padStart(4, "0")}`,
    }));
    const paths = [
      globalPath,
      institutePath,
      yearPath,
      ...metricEntries.map((entry) => entry.path),
    ];

    await deletePaths(paths);
    await writeDocuments([
      {data: buildVersion(versionId), path: globalPath},
      {data: {instituteId}, path: institutePath},
      {data: {academicYearId: ACADEMIC_YEAR_ID}, path: yearPath},
      ...metricEntries,
    ]);
    await assert.rejects(
      calibrationSimulationService.simulateCalibrationImpact(
        buildInput([instituteId]),
      ),
      /1000-summary limit/i,
    );
    await deletePaths(paths);
  },
);
