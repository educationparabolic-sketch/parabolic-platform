import assert from "node:assert/strict";
import test from "node:test";
import {getFirestore} from "../utils/firebaseAdmin";
import {auditLogStorageService} from "../services/auditLogStorage";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-6-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;

const firestore = getFirestore();

const deleteDocumentIfPresent = async (path: string): Promise<void> => {
  const documentReference = firestore.doc(path);
  const snapshot = await documentReference.get();

  if (snapshot.exists) {
    await documentReference.delete();
  }
};

test("createGlobalAuditLog stores an immutable audit record", async () => {
  const auditId = "build-6-global-audit-test";
  const auditPath = `auditLogs/${auditId}`;

  await deleteDocumentIfPresent(auditPath);

  const result = await auditLogStorageService.createGlobalAuditLog({
    auditId,
    actionType: "TEST_GLOBAL_AUDIT",
    actorRole: "vendor",
    actorUid: "vendor_001",
    metadata: {
      reason: "integration-test",
      schemaVersion: 1,
    },
    targetCollection: "systemFlags",
    targetId: "flag_001",
  });

  assert.equal(result.auditId, auditId);
  assert.equal(result.path, auditPath);
  assert.equal(result.scope, "global");

  const snapshot = await firestore.doc(auditPath).get();
  const auditLog = snapshot.data();

  assert.equal(snapshot.exists, true);
  assert.equal(auditLog?.auditId, auditId);
  assert.equal(auditLog?.actorUid, "vendor_001");
  assert.equal(auditLog?.actorRole, "vendor");
  assert.equal(auditLog?.actionType, "TEST_GLOBAL_AUDIT");
  assert.equal(auditLog?.targetCollection, "systemFlags");
  assert.equal(auditLog?.targetId, "flag_001");
  assert.deepEqual(auditLog?.metadata, {
    reason: "integration-test",
    schemaVersion: 1,
  });
  assert.equal(auditLog?.instituteId, null);
  assert.equal(typeof auditLog?.timestamp?.toDate, "function");

  await assert.rejects(
    auditLogStorageService.createGlobalAuditLog({
      auditId,
      actionType: "TEST_GLOBAL_AUDIT_DUPLICATE",
      actorRole: "vendor",
      actorUid: "vendor_001",
      targetCollection: "systemFlags",
      targetId: "flag_002",
    }),
  );

  await deleteDocumentIfPresent(auditPath);
});

test("createVendorAuditLog stores a vendor audit record", async () => {
  const auditId = "build-6-vendor-audit-test";
  const auditPath = `vendorAuditLogs/${auditId}`;

  await deleteDocumentIfPresent(auditPath);

  const result = await auditLogStorageService.createVendorAuditLog({
    auditId,
    actionType: "TEST_VENDOR_AUDIT",
    actorRole: "vendor",
    actorUid: "vendor_002",
    metadata: {
      reason: "integration-test",
    },
    targetCollection: "vendorConfig",
    targetId: "config_001",
  });

  assert.equal(result.path, auditPath);
  assert.equal(result.scope, "vendor");

  const snapshot = await firestore.doc(auditPath).get();
  const auditLog = snapshot.data();

  assert.equal(snapshot.exists, true);
  assert.equal(auditLog?.auditId, auditId);
  assert.equal(auditLog?.actorUid, "vendor_002");
  assert.equal(auditLog?.targetCollection, "vendorConfig");
  assert.equal(auditLog?.instituteId, null);

  await deleteDocumentIfPresent(auditPath);
});

test("createInstituteAuditLog stores an institute audit record", async () => {
  const auditId = "build-6-institute-audit-test";
  const instituteId = "inst_001";
  const auditPath = `institutes/${instituteId}/auditLogs/${auditId}`;

  await deleteDocumentIfPresent(auditPath);

  const result = await auditLogStorageService.createInstituteAuditLog(
    instituteId,
    {
      auditId,
      actionType: "TEST_INSTITUTE_AUDIT",
      actorRole: "admin",
      actorUid: "admin_001",
      metadata: {
        changedField: "name",
      },
      targetCollection: "students",
      targetId: "student_001",
    },
  );

  assert.equal(result.path, auditPath);
  assert.equal(result.scope, "institute");

  const snapshot = await firestore.doc(auditPath).get();
  const auditLog = snapshot.data();

  assert.equal(snapshot.exists, true);
  assert.equal(auditLog?.auditId, auditId);
  assert.equal(auditLog?.actorUid, "admin_001");
  assert.equal(auditLog?.actorRole, "admin");
  assert.equal(auditLog?.instituteId, instituteId);
  assert.equal(auditLog?.targetCollection, "students");
  assert.equal(auditLog?.targetId, "student_001");

  await deleteDocumentIfPresent(auditPath);
});

test("session-level target collections are rejected", async () => {
  await assert.rejects(
    auditLogStorageService.createInstituteAuditLog("inst_001", {
      actionType: "TEST_SESSION_REJECTION",
      actorRole: "admin",
      actorUid: "admin_001",
      targetCollection:
        "institutes/inst_001/academicYears/2026/runs/run_001/sessions",
      targetId: "session_001",
    }),
    (error: unknown) => {
      assert.match(String(error), /session-level collections/i);
      return true;
    },
  );
});

test("session payload metadata is rejected", async () => {
  await assert.rejects(
    auditLogStorageService.createInstituteAuditLog("inst_001", {
      actionType: "TEST_METADATA_REJECTION",
      actorRole: "admin",
      actorUid: "admin_001",
      metadata: {
        answerMap: {
          q1: "A",
        },
      },
      targetCollection: "students",
      targetId: "student_001",
    }),
    (error: unknown) => {
      assert.match(String(error), /must not include "answerMap"/i);
      return true;
    },
  );
});
