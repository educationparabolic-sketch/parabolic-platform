import assert from "node:assert/strict";
import test from "node:test";
import {
  administrativeActionLoggingService,
} from "../services/administrativeActionLogging";
import {getFirestore} from "../utils/firebaseAdmin";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-7-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;

const firestore = getFirestore();

const deleteDocumentIfPresent = async (path: string): Promise<void> => {
  const documentReference = firestore.doc(path);
  const snapshot = await documentReference.get();

  if (snapshot.exists) {
    await documentReference.delete();
  }
};

test(
  "logTestTemplateCreation stores architecture-aligned institute action logs",
  async () => {
    const auditId = "build-7-test-template-create";
    const instituteId = "inst_002";
    const auditPath = `institutes/${instituteId}/auditLogs/${auditId}`;

    await deleteDocumentIfPresent(auditPath);

    const result =
      await administrativeActionLoggingService.logTestTemplateCreation({
        actorId: "admin_002",
        actorRole: "admin",
        afterState: {
          durationMinutes: 90,
          subject: "Physics",
          title: "Physics Midterm Revised",
          unchanged: "keep",
        },
        auditId,
        beforeState: {
          durationMinutes: 90,
          subject: "Physics",
          title: "Physics Midterm",
          unchanged: "keep",
        },
        entityId: "test_123",
        instituteId,
        ipAddress: "10.0.0.2",
        layer: "L2",
        metadata: {
          requestId: "req_build_7_1",
        },
        userAgent: "node-test",
      });

    assert.equal(result.path, auditPath);
    assert.equal(result.scope, "institute");

    const snapshot = await firestore.doc(auditPath).get();
    const auditLog = snapshot.data();

    assert.equal(snapshot.exists, true);
    assert.equal(auditLog?.auditId, auditId);
    assert.equal(auditLog?.actorId, "admin_002");
    assert.equal(auditLog?.actorUid, "admin_002");
    assert.equal(auditLog?.actorRole, "admin");
    assert.equal(auditLog?.tenantId, instituteId);
    assert.equal(auditLog?.instituteId, instituteId);
    assert.equal(auditLog?.actionType, "CREATE_TEST_TEMPLATE");
    assert.equal(auditLog?.entityType, "test");
    assert.equal(auditLog?.entityId, "test_123");
    assert.equal(auditLog?.targetCollection, "tests");
    assert.equal(auditLog?.targetId, "test_123");
    assert.equal(auditLog?.ipAddress, "10.0.0.2");
    assert.equal(auditLog?.userAgent, "node-test");
    assert.equal(auditLog?.layer, "L2");
    assert.deepEqual(auditLog?.before, {
      title: "Physics Midterm",
    });
    assert.deepEqual(auditLog?.after, {
      title: "Physics Midterm Revised",
    });
    assert.deepEqual(auditLog?.metadata, {
      requestId: "req_build_7_1",
    });
    assert.equal(typeof auditLog?.timestamp?.toDate, "function");

    await deleteDocumentIfPresent(auditPath);
  },
);

test("logCalibrationUpdate stores vendor action logs", async () => {
  const auditId = "build-7-calibration-update";
  const auditPath = `vendorAuditLogs/${auditId}`;

  await deleteDocumentIfPresent(auditPath);

  const result = await administrativeActionLoggingService.logCalibrationUpdate({
    actorId: "vendor_003",
    actorRole: "vendor",
    afterState: {
      calibrationVersion: "v2.3.0",
      rollbackAvailable: true,
    },
    auditId,
    beforeState: {
      calibrationVersion: "v2.2.0",
      rollbackAvailable: true,
    },
    calibrationVersion: "v2.3.0",
    entityId: "global_v2_3_0",
    riskModelVersion: "risk_7",
  });

  assert.equal(result.path, auditPath);
  assert.equal(result.scope, "vendor");

  const snapshot = await firestore.doc(auditPath).get();
  const auditLog = snapshot.data();

  assert.equal(snapshot.exists, true);
  assert.equal(auditLog?.actorId, "vendor_003");
  assert.equal(auditLog?.actionType, "UPDATE_CALIBRATION");
  assert.equal(auditLog?.entityType, "calibration");
  assert.equal(auditLog?.targetCollection, "globalCalibration");
  assert.equal(auditLog?.calibrationVersion, "v2.3.0");
  assert.equal(auditLog?.riskModelVersion, "risk_7");
  assert.equal(auditLog?.layer, "L2");
  assert.deepEqual(auditLog?.before, {
    calibrationVersion: "v2.2.0",
  });
  assert.deepEqual(auditLog?.after, {
    calibrationVersion: "v2.3.0",
  });

  await deleteDocumentIfPresent(auditPath);
});

test("session-level administrative action data is rejected", async () => {
  await assert.rejects(
    administrativeActionLoggingService.logAdministrativeAction({
      actionType: "IMPORT_STUDENTS",
      actorId: "admin_003",
      actorRole: "admin",
      afterState: {
        answerMap: {
          q1: "A",
        },
      },
      entityId: "batch_001",
      entityType: "student",
      scope: "institute",
      targetCollection: "students",
      tenantId: "inst_003",
    }),
    (error: unknown) => {
      assert.match(String(error), /must not include "answerMap"/i);
      return true;
    },
  );
});
