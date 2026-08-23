import assert from "node:assert/strict";
import test from "node:test";
import * as gcpMetadata from "gcp-metadata";
import {AdminTestsService} from "../services/adminTests";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "demo-parabolic-test";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();
const service = new AdminTestsService(firestore);

test.after(async () => {
  await getFirebaseAdminApp().delete();
});

test("update increments version and preserves immutable prior snapshots", async () => {
  const instituteId = "inst-bwm-013-a";
  const collection = firestore
    .collection("institutes")
    .doc(instituteId)
    .collection("tests");
  const auditCollection = firestore
    .collection("institutes")
    .doc(instituteId)
    .collection("auditLogs");
  const existing = await collection.get();
  const existingAudits = await auditCollection.get();
  await Promise.all([
    ...existing.docs.map((document) => document.ref.delete()),
    ...existingAudits.docs.map((document) => document.ref.delete()),
  ]);

  const request = service.normalizeCreateRequest({
    actorId: "admin-bwm-013-a",
    actorRole: "admin",
    body: {
      canonicalId: "canonical-bwm-013-a",
      difficultyDistribution: {easy: 1, hard: 1, medium: 1},
      examSnapshot: {
        defaultDurationMinutes: 180,
        difficultyTimingMapping: {
          easy: {maxSeconds: 60, minSeconds: 30, recommendedSeconds: 45},
          hard: {maxSeconds: 210, minSeconds: 150, recommendedSeconds: 180},
          medium: {maxSeconds: 150, minSeconds: 60, recommendedSeconds: 105},
        },
        markingScheme: "+4/-1",
        sectionStructure: ["Physics", "Chemistry", "Mathematics"],
      },
      examType: "JEEMains",
      phaseConfigSnapshot: {
        difficultyWeights: {easy: 1, hard: 4, medium: 2.3},
        phaseSplit: [{
          difficulty: "easy",
          focus: "Foundation",
          load: 1,
          minutes: 25,
          percent: 14,
          phase: "Foundation",
          questionCount: 1,
          weight: 1,
        }],
        totalLoad: 7.3,
      },
      questionIds: ["q-easy", "q-medium", "q-hard"],
      selectionMethod: "upload_set",
      templateName: "BWM-013-A template",
      timingProfile: {
        easy: {maxSeconds: 60, minSeconds: 30, recommendedSeconds: 45},
        hard: {maxSeconds: 210, minSeconds: 150, recommendedSeconds: 180},
        medium: {maxSeconds: 150, minSeconds: 60, recommendedSeconds: 105},
      },
      totalDurationMinutes: 180,
    },
    instituteId,
  });

  const created = await service.createTemplate(request);
  const authoritativeId = created.template.id;
  assert.ok(authoritativeId.length > 0);
  assert.equal(created.template.version, 1);
  assert.equal(created.template.selectionMethod, "upload_set");
  assert.equal(created.template.timingProfile.easy.recommendedSeconds, 45);

  const persisted = await collection.doc(authoritativeId).get();
  assert.equal(persisted.exists, true);
  assert.equal(persisted.id, authoritativeId);
  assert.equal(persisted.get("testId"), authoritativeId);
  assert.equal(persisted.get("version"), 1);
  assert.equal(persisted.get("timingProfile.easy.recommended"), 45);

  const reloaded = await service.listTemplates({instituteId, limit: 10});
  assert.equal(reloaded.length, 1);
  assert.equal(reloaded[0]?.id, authoritativeId);
  assert.equal(reloaded[0]?.version, 1);
  assert.equal(reloaded[0]?.timingProfile.easy.recommendedSeconds, 45);

  const firstUpdateRequest = service.normalizeUpdateRequest({
    actorId: "admin-bwm-013-c",
    actorRole: "admin",
    body: {
      canonicalId: "canonical-bwm-013-c-v2",
      difficultyDistribution: request.difficultyDistribution,
      examSnapshot: request.examSnapshot,
      examType: request.examType,
      expectedVersion: 1,
      phaseConfigSnapshot: request.phaseConfigSnapshot,
      questionIds: request.questionIds,
      selectionMethod: request.selectionMethod,
      templateName: "BWM-013-C template v2",
      timingProfile: {
        ...request.timingProfile,
        easy: {maxSeconds: 65, minSeconds: 30, recommendedSeconds: 50},
      },
      totalDurationMinutes: 185,
    },
    instituteId,
    testId: authoritativeId,
  });
  const firstUpdate = await service.updateTemplate(firstUpdateRequest);
  assert.equal(firstUpdate.template.id, authoritativeId);
  assert.equal(firstUpdate.template.version, 2);
  assert.equal(firstUpdate.template.templateName, "BWM-013-C template v2");
  assert.equal(firstUpdate.template.timingProfile.easy.recommendedSeconds, 50);

  const versionOneReference = collection
    .doc(authoritativeId)
    .collection("versionSnapshots")
    .doc("1");
  const versionOneSnapshot = await versionOneReference.get();
  assert.equal(versionOneSnapshot.exists, true);
  assert.equal(versionOneSnapshot.get("testId"), authoritativeId);
  assert.equal(versionOneSnapshot.get("version"), 1);
  assert.equal(versionOneSnapshot.get("supersededByVersion"), 2);
  assert.equal(versionOneSnapshot.get("templateName"), "BWM-013-A template");
  assert.equal(versionOneSnapshot.get("timingProfile.easy.recommended"), 45);

  await assert.rejects(
    service.updateTemplate({
      ...firstUpdateRequest,
      templateName: "Stale overwrite must fail",
    }),
    (error: unknown) => {
      assert.equal(
        (error as {code?: string}).code,
        "CONFLICT",
      );
      assert.match(
        (error as Error).message,
        /expected 1, current version is 2/,
      );
      return true;
    },
  );

  const afterConflict = await collection.doc(authoritativeId).get();
  assert.equal(afterConflict.get("version"), 2);
  assert.equal(afterConflict.get("templateName"), "BWM-013-C template v2");

  const secondUpdate = await service.updateTemplate({
    ...firstUpdateRequest,
    canonicalId: "canonical-bwm-013-c-v3",
    expectedVersion: 2,
    templateName: "BWM-013-C template v3",
  });
  assert.equal(secondUpdate.template.version, 3);
  assert.equal(secondUpdate.template.templateName, "BWM-013-C template v3");

  const versionTwoReference = collection
    .doc(authoritativeId)
    .collection("versionSnapshots")
    .doc("2");
  const [versionOneAfterSecondUpdate, versionTwoSnapshot] = await Promise.all([
    versionOneReference.get(),
    versionTwoReference.get(),
  ]);
  assert.equal(versionOneAfterSecondUpdate.get("templateName"), "BWM-013-A template");
  assert.equal(versionOneAfterSecondUpdate.get("version"), 1);
  assert.equal(versionTwoSnapshot.get("templateName"), "BWM-013-C template v2");
  assert.equal(versionTwoSnapshot.get("version"), 2);
  assert.equal(versionTwoSnapshot.get("supersededByVersion"), 3);

  const lifecycleRequest = service.normalizeLifecycleRequest({
    actorId: "admin-bwm-013-d",
    actorRole: "admin",
    body: {expectedVersion: 3},
    instituteId,
    ipAddress: "127.0.0.1",
    testId: authoritativeId,
    userAgent: "bwm-013-d-emulator",
  });

  await assert.rejects(
    service.archiveTemplate(lifecycleRequest),
    (error: unknown) => {
      assert.equal((error as {code?: string}).code, "CONFLICT");
      assert.match((error as Error).message, /from status "draft"/);
      return true;
    },
  );

  assert.equal((await auditCollection.get()).empty, true);

  const published = await service.publishTemplate(lifecycleRequest);
  assert.equal(published.template.status, "ready");
  assert.equal(published.template.version, 3);
  assert.equal(
    published.auditPath,
    `institutes/${instituteId}/auditLogs/${published.auditId}`,
  );
  const publishAudit = await auditCollection.doc(published.auditId).get();
  assert.equal(publishAudit.get("actionType"), "ACTIVATE_TEST_TEMPLATE");
  assert.equal(publishAudit.get("actorUid"), "admin-bwm-013-d");
  assert.equal(publishAudit.get("before.status"), "draft");
  assert.equal(publishAudit.get("after.status"), "ready");
  assert.equal(publishAudit.get("metadata.command"), "publish");
  assert.equal(publishAudit.get("metadata.expectedVersion"), 3);

  const publishReplay = await service.publishTemplate(lifecycleRequest);
  assert.equal(publishReplay.auditId, published.auditId);
  assert.equal(publishReplay.template.status, "ready");
  assert.equal((await auditCollection.get()).size, 1);

  const archived = await service.archiveTemplate(lifecycleRequest);
  assert.equal(archived.template.status, "archived");
  assert.equal(archived.template.version, 3);
  const archiveAudit = await auditCollection.doc(archived.auditId).get();
  assert.equal(archiveAudit.get("actionType"), "ARCHIVE_TEST_TEMPLATE");
  assert.equal(archiveAudit.get("before.status"), "ready");
  assert.equal(archiveAudit.get("after.status"), "archived");
  assert.equal(archiveAudit.get("metadata.command"), "archive");

  const archiveReplay = await service.archiveTemplate(lifecycleRequest);
  assert.equal(archiveReplay.auditId, archived.auditId);
  assert.equal(archiveReplay.template.status, "archived");
  assert.equal((await auditCollection.get()).size, 2);

  await auditCollection.doc(published.auditId).delete();
  await auditCollection.doc(archived.auditId).delete();
  await versionOneReference.delete();
  await versionTwoReference.delete();
  await collection.doc(authoritativeId).delete();
});
