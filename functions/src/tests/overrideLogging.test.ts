import assert from "node:assert/strict";
import test from "node:test";
import {overrideLoggingService} from "../services/overrideLogging";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-9-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;

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
  "createOverrideLog stores an immutable institute override record",
  async () => {
    const instituteId = "inst_009";
    const overrideId = "build-9-force-submit";
    const overridePath = `institutes/${instituteId}/overrideLogs/${overrideId}`;

    await deleteDocumentIfPresent(overridePath);

    const result = await overrideLoggingService.createOverrideLog({
      instituteId,
      justification: "Network issue caused proctor-approved forced submission",
      overrideId,
      overrideType: "FORCE_SUBMIT",
      performedBy: "teacher_009",
      runId: "run_2026_09",
      sessionId: "session_009",
      studentId: "student_009",
    });

    assert.equal(result.instituteId, instituteId);
    assert.equal(result.overrideId, overrideId);
    assert.equal(result.path, overridePath);

    const snapshot = await firestore.doc(overridePath).get();
    const overrideLog = snapshot.data();

    assert.equal(snapshot.exists, true);
    assert.equal(overrideLog?.overrideId, overrideId);
    assert.equal(overrideLog?.instituteId, instituteId);
    assert.equal(overrideLog?.runId, "run_2026_09");
    assert.equal(overrideLog?.studentId, "student_009");
    assert.equal(overrideLog?.sessionId, "session_009");
    assert.equal(overrideLog?.overrideType, "FORCE_SUBMIT");
    assert.equal(
      overrideLog?.justification,
      "Network issue caused proctor-approved forced submission",
    );
    assert.equal(overrideLog?.performedBy, "teacher_009");
    assert.equal(typeof overrideLog?.timestamp?.toDate, "function");

    await assert.rejects(
      overrideLoggingService.createOverrideLog({
        instituteId,
        justification: "Duplicate immutable write",
        overrideId,
        overrideType: "FORCE_SUBMIT",
        performedBy: "teacher_009",
        runId: "run_2026_09",
        sessionId: "session_009",
        studentId: "student_009",
      }),
    );

    await deleteDocumentIfPresent(overridePath);
  },
);

test("createOverrideLog rejects unsupported override types", async () => {
  await assert.rejects(
    overrideLoggingService.createOverrideLog({
      instituteId: "inst_010",
      justification: "Invalid type test",
      overrideType: "TIME_EXTENSION" as never,
      performedBy: "admin_010",
      runId: "run_2026_10",
      sessionId: "session_010",
      studentId: "student_010",
    }),
    (error: unknown) => {
      assert.match(String(error), /overrideType/i);
      return true;
    },
  );
});

test("createOverrideLog rejects blank justification", async () => {
  await assert.rejects(
    overrideLoggingService.createOverrideLog({
      instituteId: "inst_011",
      justification: "   ",
      overrideType: "MODE_CHANGE",
      performedBy: "admin_011",
      runId: "run_2026_11",
      sessionId: "session_011",
      studentId: "student_011",
    }),
    (error: unknown) => {
      assert.match(String(error), /justification/i);
      return true;
    },
  );
});
