import assert from "node:assert/strict";
import test from "node:test";
import {
  calibrationDeploymentService,
} from "../services/calibrationDeployment";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-97-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";

const firestore = getFirestore();

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
  "deployCalibrationVersion writes institute calibration references " +
    "and license metadata",
  async () => {
    const versionId = "cal_v2026_04_build_97";
    const instituteId = "inst_build_97_a";
    const calibrationSourcePath = `globalCalibration/${versionId}`;
    const institutePath = `institutes/${instituteId}`;
    const instituteCalibrationPath =
      `${institutePath}/calibration/${versionId}`;
    const calibrationHistoryPath =
      `${institutePath}/calibrationHistory/build_99_integration_log`;
    const currentLicensePath = `${institutePath}/license/current`;
    const mainLicensePath = `${institutePath}/license/main`;
    const vendorCalibrationLogPath =
      "vendorCalibrationLogs/build_99_integration_log";

    await Promise.all([
      deleteDocumentIfPresent(calibrationSourcePath),
      deleteDocumentIfPresent(instituteCalibrationPath),
      deleteDocumentIfPresent(calibrationHistoryPath),
      deleteDocumentIfPresent(currentLicensePath),
      deleteDocumentIfPresent(mainLicensePath),
      deleteDocumentIfPresent(vendorCalibrationLogPath),
      deleteDocumentIfPresent(institutePath),
    ]);

    await firestore.doc(calibrationSourcePath).set({
      activationDate: "2026-04-05T12:00:00.000Z",
      createdAt: new Date("2026-04-05T12:00:00.000Z"),
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
      calibrationVersion: "cal_v2026_03",
      instituteId,
      name: "Build 97 Institute",
    });
    await firestore.doc(currentLicensePath).set({
      currentLayer: "L2",
      featureFlags: {
        adaptivePhase: true,
      },
      planId: "L2",
    });
    await firestore.doc(mainLicensePath).set({
      currentLayer: "L2",
      featureFlags: {
        adaptivePhase: true,
      },
      planId: "L2",
    });

    const result = await calibrationDeploymentService.deployCalibrationVersion({
      changedBy: "vendor_build_97",
      deploymentLogId: "build_99_integration_log",
      targetInstitutes: [instituteId],
      versionId,
    });

    assert.equal(result.versionId, versionId);
    assert.equal(result.calibrationSourcePath, calibrationSourcePath);
    assert.equal(result.deployedInstituteCount, 1);
    assert.equal(result.deploymentLogId, "build_99_integration_log");
    assert.equal(result.vendorCalibrationLogPath, vendorCalibrationLogPath);
    assert.equal(result.deployedInstitutes[0]?.instituteId, instituteId);
    assert.equal(
      result.deployedInstitutes[0]?.calibrationPath,
      instituteCalibrationPath,
    );
    assert.equal(
      result.deployedInstitutes[0]?.calibrationHistoryPath,
      calibrationHistoryPath,
    );

    const [
      deployedCalibrationSnapshot,
      calibrationHistorySnapshot,
      instituteSnapshot,
      currentLicenseSnapshot,
      mainLicenseSnapshot,
      vendorCalibrationLogSnapshot,
    ] = await Promise.all([
      firestore.doc(instituteCalibrationPath).get(),
      firestore.doc(calibrationHistoryPath).get(),
      firestore.doc(institutePath).get(),
      firestore.doc(currentLicensePath).get(),
      firestore.doc(mainLicensePath).get(),
      firestore.doc(vendorCalibrationLogPath).get(),
    ]);

    assert.equal(deployedCalibrationSnapshot.exists, true);
    assert.equal(deployedCalibrationSnapshot.get("versionId"), versionId);
    assert.equal(
      deployedCalibrationSnapshot.get("sourceCalibrationPath"),
      calibrationSourcePath,
    );
    assert.equal(
      deployedCalibrationSnapshot.get("deployedBy"),
      "vendor_build_97",
    );
    assert.equal(deployedCalibrationSnapshot.get("instituteId"), instituteId);
    assert.equal(
      typeof deployedCalibrationSnapshot.get("deployedAt")?.toDate,
      "function",
    );
    assert.equal(calibrationHistorySnapshot.exists, true);
    assert.equal(
      calibrationHistorySnapshot.get("calibrationVersion"),
      versionId,
    );
    assert.deepEqual(
      calibrationHistorySnapshot.get("affectedInstitutes"),
      [instituteId],
    );
    assert.equal(
      calibrationHistorySnapshot.get("activatedBy"),
      "vendor_build_97",
    );
    assert.equal(instituteSnapshot.get("calibrationVersion"), versionId);
    assert.equal(currentLicenseSnapshot.get("calibrationVersion"), versionId);
    assert.equal(mainLicenseSnapshot.get("calibrationVersion"), versionId);
    assert.equal(currentLicenseSnapshot.get("planId"), "L2");
    assert.equal(mainLicenseSnapshot.get("planId"), "L2");
    assert.equal(vendorCalibrationLogSnapshot.exists, true);
    assert.equal(
      vendorCalibrationLogSnapshot.get("calibrationVersion"),
      versionId,
    );

    await Promise.all([
      deleteDocumentIfPresent(calibrationSourcePath),
      deleteDocumentIfPresent(instituteCalibrationPath),
      deleteDocumentIfPresent(calibrationHistoryPath),
      deleteDocumentIfPresent(currentLicensePath),
      deleteDocumentIfPresent(mainLicensePath),
      deleteDocumentIfPresent(vendorCalibrationLogPath),
      deleteDocumentIfPresent(institutePath),
    ]);
  },
);

test(
  "deployCalibrationVersion rejects unknown calibration versions",
  async () => {
    await assert.rejects(
      calibrationDeploymentService.deployCalibrationVersion({
        changedBy: "vendor_build_97",
        targetInstitutes: ["inst_build_97_missing_version"],
        versionId: "cal_v2026_04_missing",
      }),
      (error: unknown) => {
        assert.match(String(error), /does not exist/i);
        return true;
      },
    );
  },
);

test(
  "deployCalibrationVersion rejects missing institutes before writing " +
    "license metadata",
  async () => {
    const versionId = "cal_v2026_04_missing_institute";
    const validInstituteId = "inst_build_97_valid";
    const missingInstituteId = "inst_build_97_missing";
    const calibrationSourcePath = `globalCalibration/${versionId}`;
    const validInstitutePath = `institutes/${validInstituteId}`;
    const currentLicensePath = `${validInstitutePath}/license/current`;
    const mainLicensePath = `${validInstitutePath}/license/main`;
    const deployedCalibrationPath =
      `${validInstitutePath}/calibration/${versionId}`;

    await Promise.all([
      deleteDocumentIfPresent(calibrationSourcePath),
      deleteDocumentIfPresent(deployedCalibrationPath),
      deleteDocumentIfPresent(currentLicensePath),
      deleteDocumentIfPresent(mainLicensePath),
      deleteDocumentIfPresent(validInstitutePath),
    ]);

    await firestore.doc(calibrationSourcePath).set({
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
    await firestore.doc(validInstitutePath).set({
      instituteId: validInstituteId,
      name: "Valid Institute",
    });
    await firestore.doc(currentLicensePath).set({currentLayer: "L1"});
    await firestore.doc(mainLicensePath).set({currentLayer: "L1"});

    await assert.rejects(
      calibrationDeploymentService.deployCalibrationVersion({
        changedBy: "vendor_build_97",
        targetInstitutes: [missingInstituteId, validInstituteId],
        versionId,
      }),
      (error: unknown) => {
        assert.match(String(error), /does not exist/i);
        return true;
      },
    );

    const deployedCalibrationSnapshot =
      await firestore.doc(deployedCalibrationPath).get();
    const currentLicenseSnapshot =
      await firestore.doc(currentLicensePath).get();

    assert.equal(deployedCalibrationSnapshot.exists, false);
    assert.equal(
      currentLicenseSnapshot.get("calibrationVersion"),
      undefined,
    );

    await Promise.all([
      deleteDocumentIfPresent(calibrationSourcePath),
      deleteDocumentIfPresent(currentLicensePath),
      deleteDocumentIfPresent(mainLicensePath),
      deleteDocumentIfPresent(validInstitutePath),
    ]);
  },
);
