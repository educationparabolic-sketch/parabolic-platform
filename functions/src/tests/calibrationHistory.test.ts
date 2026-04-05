import assert from "node:assert/strict";
import test from "node:test";
import {calibrationHistoryService} from "../services/calibrationHistory";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-99-tests";
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
  "createCalibrationHistoryEntry stores immutable vendor and institute logs",
  async () => {
    const logId = "build-99-calibration-log";
    const vendorLogPath = `vendorCalibrationLogs/${logId}`;
    const instituteHistoryPaths = [
      "institutes/inst_build_99_a/calibrationHistory/build-99-calibration-log",
      "institutes/inst_build_99_b/calibrationHistory/build-99-calibration-log",
    ];

    await Promise.all([
      deleteDocumentIfPresent(vendorLogPath),
      ...instituteHistoryPaths.map((path) => deleteDocumentIfPresent(path)),
    ]);

    const result =
      await calibrationHistoryService.createCalibrationHistoryEntry({
        activatedBy: "vendor_build_99",
        affectedInstitutes: ["inst_build_99_a", "inst_build_99_b"],
        calibrationVersion: "cal_v2026_04",
        logId,
        rollbackAvailable: true,
        simulationVersion: "sim_v2_preview",
      });

    assert.equal(result.logId, logId);
    assert.equal(result.vendorLogPath, vendorLogPath);
    assert.deepEqual(
      result.instituteHistoryPaths.sort(),
      instituteHistoryPaths.sort(),
    );

    const [vendorLogSnapshot, instituteLogSnapshotA, instituteLogSnapshotB] =
      await Promise.all([
        firestore.doc(vendorLogPath).get(),
        firestore.doc(instituteHistoryPaths[0] ?? "").get(),
        firestore.doc(instituteHistoryPaths[1] ?? "").get(),
      ]);

    assert.equal(vendorLogSnapshot.exists, true);
    assert.deepEqual(
      vendorLogSnapshot.get("affectedInstitutes"),
      ["inst_build_99_a", "inst_build_99_b"],
    );
    assert.equal(vendorLogSnapshot.get("activatedBy"), "vendor_build_99");
    assert.equal(vendorLogSnapshot.get("calibrationVersion"), "cal_v2026_04");
    assert.equal(vendorLogSnapshot.get("rollbackAvailable"), true);
    assert.equal(vendorLogSnapshot.get("simulationVersion"), "sim_v2_preview");
    assert.equal(typeof vendorLogSnapshot.get("timestamp")?.toDate, "function");
    assert.equal(instituteLogSnapshotA.exists, true);
    assert.equal(instituteLogSnapshotB.exists, true);

    await assert.rejects(
      calibrationHistoryService.createCalibrationHistoryEntry({
        activatedBy: "vendor_build_99",
        affectedInstitutes: ["inst_build_99_a"],
        calibrationVersion: "cal_v2026_04",
        logId,
        rollbackAvailable: false,
      }),
    );

    await Promise.all([
      deleteDocumentIfPresent(vendorLogPath),
      ...instituteHistoryPaths.map((path) => deleteDocumentIfPresent(path)),
    ]);
  },
);

test(
  "createCalibrationHistoryEntry rejects empty institute lists",
  async () => {
    await assert.rejects(
      calibrationHistoryService.createCalibrationHistoryEntry({
        activatedBy: "vendor_build_99",
        affectedInstitutes: [],
        calibrationVersion: "cal_v2026_04",
        rollbackAvailable: true,
      }),
      (error: unknown) => {
        assert.match(String(error), /affectedInstitutes/i);
        return true;
      },
    );
  },
);
