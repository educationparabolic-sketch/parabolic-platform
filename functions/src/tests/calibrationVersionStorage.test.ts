import assert from "node:assert/strict";
import test from "node:test";
import {
  calibrationVersionStorageService,
} from "../services/calibrationVersionStorage";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-96-tests";
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
  "createCalibrationVersion stores documents in both documented root paths",
  async () => {
    const versionId = "cal_v2026_04";
    const globalPath = `globalCalibration/${versionId}`;
    const compatibilityPath = `calibrationVersions/${versionId}`;

    await Promise.all([
      deleteDocumentIfPresent(globalPath),
      deleteDocumentIfPresent(compatibilityPath),
    ]);

    const result =
      await calibrationVersionStorageService.createCalibrationVersion({
        activationDate: "2026-04-05T10:00:00.000Z",
        createdBy: "vendor_build_96",
        isActive: true,
        thresholds: {
          guessFactorEasy: 1.2,
          guessFactorHard: 1.8,
          guessFactorMedium: 1.5,
          phaseDeviationThreshold: 22,
        },
        versionId,
        weights: {
          easyNeglectWeight: 0.2,
          guessWeight: 0.25,
          hardBiasWeight: 0.2,
          phaseWeight: 0.25,
          wrongStreakWeight: 0.1,
        },
      });

    assert.equal(result.versionId, versionId);
    assert.equal(result.path, globalPath);
    assert.equal(result.compatibilityPath, compatibilityPath);

    const [globalSnapshot, mirrorSnapshot] = await Promise.all([
      firestore.doc(globalPath).get(),
      firestore.doc(compatibilityPath).get(),
    ]);

    assert.equal(globalSnapshot.exists, true);
    assert.equal(mirrorSnapshot.exists, true);
    assert.deepEqual(mirrorSnapshot.data(), globalSnapshot.data());
    assert.equal(globalSnapshot.get("versionId"), versionId);
    assert.equal(globalSnapshot.get("createdBy"), "vendor_build_96");
    assert.equal(globalSnapshot.get("isActive"), true);
    assert.equal(
      globalSnapshot.get("activationDate"),
      "2026-04-05T10:00:00.000Z",
    );
    assert.deepEqual(globalSnapshot.get("weights"), {
      easyNeglectWeight: 0.2,
      guessWeight: 0.25,
      hardBiasWeight: 0.2,
      phaseWeight: 0.25,
      wrongStreakWeight: 0.1,
    });
    assert.deepEqual(globalSnapshot.get("thresholds"), {
      guessFactorEasy: 1.2,
      guessFactorHard: 1.8,
      guessFactorMedium: 1.5,
      phaseDeviationThreshold: 22,
    });
    assert.equal(typeof globalSnapshot.get("createdAt")?.toDate, "function");

    await Promise.all([
      deleteDocumentIfPresent(globalPath),
      deleteDocumentIfPresent(compatibilityPath),
    ]);
  },
);

test(
  "createCalibrationVersion allows inactive drafts without activationDate",
  async () => {
    const versionId = "cal_v2026_04_draft";
    const globalPath = `globalCalibration/${versionId}`;
    const compatibilityPath = `calibrationVersions/${versionId}`;

    await Promise.all([
      deleteDocumentIfPresent(globalPath),
      deleteDocumentIfPresent(compatibilityPath),
    ]);

    await calibrationVersionStorageService.createCalibrationVersion({
      createdBy: "vendor_build_96",
      isActive: false,
      thresholds: {
        guessFactorEasy: 1,
        guessFactorHard: 2,
        guessFactorMedium: 1.5,
        phaseDeviationThreshold: 18,
      },
      versionId,
      weights: {
        easyNeglectWeight: 0.22,
        guessWeight: 0.24,
        hardBiasWeight: 0.18,
        phaseWeight: 0.26,
        wrongStreakWeight: 0.1,
      },
    });

    const snapshot = await firestore.doc(globalPath).get();

    assert.equal(snapshot.exists, true);
    assert.equal(snapshot.get("isActive"), false);
    assert.equal(snapshot.get("activationDate"), null);

    await Promise.all([
      deleteDocumentIfPresent(globalPath),
      deleteDocumentIfPresent(compatibilityPath),
    ]);
  },
);

test(
  "createCalibrationVersion rejects active versions without activationDate",
  async () => {
    await assert.rejects(
      calibrationVersionStorageService.createCalibrationVersion({
        createdBy: "vendor_build_96",
        isActive: true,
        thresholds: {
          guessFactorEasy: 1.1,
          guessFactorHard: 1.9,
          guessFactorMedium: 1.4,
          phaseDeviationThreshold: 20,
        },
        versionId: "cal_v2026_04_invalid_active",
        weights: {
          easyNeglectWeight: 0.2,
          guessWeight: 0.25,
          hardBiasWeight: 0.2,
          phaseWeight: 0.25,
          wrongStreakWeight: 0.1,
        },
      }),
      (error: unknown) => {
        assert.match(String(error), /require an activationDate/i);
        return true;
      },
    );
  },
);

test("createCalibrationVersion rejects duplicate version ids", async () => {
  const versionId = "cal_v2026_04_duplicate";
  const globalPath = `globalCalibration/${versionId}`;
  const compatibilityPath = `calibrationVersions/${versionId}`;

  await Promise.all([
    deleteDocumentIfPresent(globalPath),
    deleteDocumentIfPresent(compatibilityPath),
  ]);

  await calibrationVersionStorageService.createCalibrationVersion({
    createdBy: "vendor_build_96",
    isActive: false,
    thresholds: {
      guessFactorEasy: 1,
      guessFactorHard: 1.8,
      guessFactorMedium: 1.4,
      phaseDeviationThreshold: 19,
    },
    versionId,
    weights: {
      easyNeglectWeight: 0.2,
      guessWeight: 0.25,
      hardBiasWeight: 0.2,
      phaseWeight: 0.25,
      wrongStreakWeight: 0.1,
    },
  });

  await assert.rejects(
    calibrationVersionStorageService.createCalibrationVersion({
      createdBy: "vendor_build_96",
      isActive: false,
      thresholds: {
        guessFactorEasy: 1,
        guessFactorHard: 1.8,
        guessFactorMedium: 1.4,
        phaseDeviationThreshold: 19,
      },
      versionId,
      weights: {
        easyNeglectWeight: 0.2,
        guessWeight: 0.25,
        hardBiasWeight: 0.2,
        phaseWeight: 0.25,
        wrongStreakWeight: 0.1,
      },
    }),
    (error: unknown) => {
      assert.match(String(error), /already exists/i);
      return true;
    },
  );

  await Promise.all([
    deleteDocumentIfPresent(globalPath),
    deleteDocumentIfPresent(compatibilityPath),
  ]);
});
