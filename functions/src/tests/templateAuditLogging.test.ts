import assert from "node:assert/strict";
import test from "node:test";
import {templateAuditLoggingService} from "../services/templateAuditLogging";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-20-tests";
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
  "logTemplateLifecycleEvent stores template creation lifecycle logs",
  async () => {
    const instituteId = "inst_build_20_create";
    const testId = "template_build_20_create";
    const auditId = "build-20-template-create";
    const auditPath = `institutes/${instituteId}/auditLogs/${auditId}`;

    await deleteDocumentIfPresent(auditPath);

    const result = await templateAuditLoggingService.logTemplateLifecycleEvent({
      auditId,
      actor: {
        actorId: "admin_build_20",
        actorRole: "admin",
      },
      afterState: {
        status: "draft",
        totalQuestions: 75,
      },
      context: {
        instituteId,
        testId,
      },
      eventType: "creation",
      metadata: {
        requestId: "req_build_20_create",
      },
      beforeState: {},
    });

    assert.equal(result.path, auditPath);
    assert.equal(result.scope, "institute");

    const snapshot = await firestore.doc(auditPath).get();
    const auditLog = snapshot.data();

    assert.equal(snapshot.exists, true);
    assert.equal(auditLog?.actionType, "CREATE_TEST_TEMPLATE");
    assert.equal(auditLog?.entityType, "test");
    assert.equal(auditLog?.entityId, testId);
    assert.equal(auditLog?.targetCollection, "tests");
    assert.equal(auditLog?.actorId, "admin_build_20");
    assert.deepEqual(auditLog?.after, {
      status: "draft",
      totalQuestions: 75,
    });

    await deleteDocumentIfPresent(auditPath);
  },
);

test(
  "logTemplateLifecycleEvent stores template update lifecycle logs",
  async () => {
    const instituteId = "inst_build_20_update";
    const testId = "template_build_20_update";
    const auditId = "build-20-template-update";
    const auditPath = `institutes/${instituteId}/auditLogs/${auditId}`;

    await deleteDocumentIfPresent(auditPath);

    await templateAuditLoggingService.logTemplateLifecycleEvent({
      auditId,
      actor: {
        actorId: "teacher_build_20",
        actorRole: "teacher",
      },
      afterState: {
        title: "Physics Mock A",
      },
      beforeState: {
        title: "Physics Mock",
      },
      context: {
        instituteId,
        testId,
      },
      eventType: "update",
    });

    const snapshot = await firestore.doc(auditPath).get();
    const auditLog = snapshot.data();

    assert.equal(snapshot.exists, true);
    assert.equal(auditLog?.actionType, "UPDATE_TEST_TEMPLATE");
    assert.deepEqual(auditLog?.before, {
      title: "Physics Mock",
    });
    assert.deepEqual(auditLog?.after, {
      title: "Physics Mock A",
    });

    await deleteDocumentIfPresent(auditPath);
  },
);

test(
  "logTemplateLifecycleEvent stores template activation lifecycle logs",
  async () => {
    const instituteId = "inst_build_20_activate";
    const testId = "template_build_20_activate";
    const auditId = "build-20-template-activate";
    const auditPath = `institutes/${instituteId}/auditLogs/${auditId}`;

    await deleteDocumentIfPresent(auditPath);

    await templateAuditLoggingService.logTemplateLifecycleEvent({
      auditId,
      afterState: {
        status: "ready",
      },
      beforeState: {
        status: "draft",
      },
      context: {
        instituteId,
        testId,
      },
      eventType: "activation",
    });

    const snapshot = await firestore.doc(auditPath).get();
    const auditLog = snapshot.data();

    assert.equal(snapshot.exists, true);
    assert.equal(auditLog?.actionType, "ACTIVATE_TEST_TEMPLATE");
    assert.equal(auditLog?.actorId, "system_template_audit");
    assert.equal(auditLog?.actorRole, "system");

    await deleteDocumentIfPresent(auditPath);
  },
);

test(
  "logTemplateLifecycleEvent stores template archival lifecycle logs",
  async () => {
    const instituteId = "inst_build_20_archive";
    const testId = "template_build_20_archive";
    const auditId = "build-20-template-archive";
    const auditPath = `institutes/${instituteId}/auditLogs/${auditId}`;

    await deleteDocumentIfPresent(auditPath);

    await templateAuditLoggingService.logTemplateLifecycleEvent({
      auditId,
      actor: {
        actorId: "admin_build_20_archive",
        actorRole: "admin",
      },
      afterState: {
        status: "archived",
      },
      beforeState: {
        status: "assigned",
      },
      context: {
        instituteId,
        testId,
      },
      eventType: "archival",
    });

    const snapshot = await firestore.doc(auditPath).get();
    const auditLog = snapshot.data();

    assert.equal(snapshot.exists, true);
    assert.equal(auditLog?.actionType, "ARCHIVE_TEST_TEMPLATE");
    assert.equal(auditLog?.actorId, "admin_build_20_archive");
    assert.equal(auditLog?.entityId, testId);

    await deleteDocumentIfPresent(auditPath);
  },
);
