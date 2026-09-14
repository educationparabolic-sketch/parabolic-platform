import assert from "node:assert/strict";
import test from "node:test";
import * as gcpMetadata from "gcp-metadata";
import {Timestamp} from "firebase-admin/firestore";
import {
  AdminQuestionMutationsService,
} from "../services/adminQuestionMutations";
import {AdminQuestionBankValidationError} from "../types/adminQuestionBank";
import {StorageObjectTarget} from "../types/storageBucketArchitecture";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "demo-parabolic-test";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();
const NOW = Timestamp.fromDate(new Date("2026-09-10T12:00:00.000Z"));
const OLD = Timestamp.fromDate(new Date("2023-01-01T00:00:00.000Z"));

function createService(): AdminQuestionMutationsService {
  return new AdminQuestionMutationsService({firestore, now: () => NOW});
}

async function deleteCollection(path: string): Promise<void> {
  const snapshot = await firestore.collection(path).get();
  await Promise.all(snapshot.docs.map((document) => document.ref.delete()));
}

async function prepareInstitute(instituteId: string): Promise<void> {
  const institutePath = `institutes/${instituteId}`;
  await Promise.all([
    deleteCollection(`${institutePath}/auditLogs`),
    deleteCollection(`${institutePath}/questionAssetRecoveries`),
    deleteCollection(`${institutePath}/questionBank`),
    deleteCollection(`${institutePath}/tests`),
  ]);
  await firestore.doc(institutePath).set({instituteId, status: "active"});
}

async function cleanupInstitute(instituteId: string): Promise<void> {
  await prepareInstitute(instituteId);
  await firestore.doc(`institutes/${instituteId}`).delete();
}

function questionData(input?: Record<string, unknown>): Record<string, unknown> {
  return {
    academicYear: "2025-2026",
    additionalTag: "Mechanics",
    chapter: "Motion",
    correctAnswer: "A",
    createdAt: OLD,
    difficulty: "Medium",
    examType: "JEEMains",
    internalNotes: "Initial note",
    lastUsedAt: null,
    marks: 4,
    negativeMarks: 1,
    parentQuestionId: null,
    primaryTag: "Kinematics",
    questionId: "question",
    questionImageUrl: "inst/questions/question/v1/question.png",
    questionTextKeywords: ["velocity"],
    questionType: "MCQ",
    revision: 1,
    secondaryTag: "Velocity",
    simulationLink: null,
    solutionImageUrl: "inst/questions/question/v1/solution.png",
    status: "active",
    subject: "Physics",
    tags: ["Kinematics", "Velocity"],
    topic: "Uniform motion",
    tutorialVideoLink: null,
    uniqueKey: "PHY-MOTION-v1",
    updatedAt: OLD,
    usedCount: 0,
    version: 1,
    ...input,
  };
}

function authority(instituteId: string) {
  return {
    actorId: "teacher-bwm-027",
    actorRole: "teacher",
    instituteId,
    ipAddress: "127.0.0.1",
    userAgent: "BWM-027-test",
  };
}

function metadataBody(idempotencyKey: string) {
  return {
    additionalTag: "Dynamics",
    expectedRevision: 1,
    idempotencyKey,
    internalNotes: "Future solution note",
    primaryTag: "Mechanics",
    secondaryTag: "Forces",
    simulationLink: "https://example.test/simulation",
    solutionImage: {action: "remove"},
    topic: "Newton laws",
    tutorialVideoLink: "https://example.test/tutorial",
  };
}

function structureBody(idempotencyKey: string) {
  return {
    academicYear: "2026-2027",
    chapter: "Laws of Motion",
    correctAnswer: "B",
    difficulty: "Hard",
    examType: "JEEMains",
    expectedRevision: 1,
    idempotencyKey,
    marks: 4,
    negativeMarks: 1,
    questionImage: {action: "retain"},
    questionType: "MCQ",
    subject: "Physics",
    uniqueKey: "PHY-LAWS-v1",
  };
}

function assertConflict(error: unknown): boolean {
  assert.ok(error instanceof AdminQuestionBankValidationError);
  assert.equal(error.code, "CONFLICT");
  return true;
}

test.after(async () => {
  await getFirebaseAdminApp().delete();
});

test("normalization enforces role, revisions, links, and asset boundaries", async () => {
  const service = createService();
  assert.throws(
    () => service.normalizeMetadataUpdateRequest({
      ...authority("inst-bwm-027-normalize"),
      actorRole: "student",
      body: metadataBody("normalize-role"),
      questionId: "question-normalize",
    }),
    (error: unknown) => {
      assert.ok(error instanceof AdminQuestionBankValidationError);
      assert.equal(error.code, "FORBIDDEN");
      return true;
    },
  );
  assert.throws(
    () => service.normalizeMetadataUpdateRequest({
      ...authority("inst-bwm-027-normalize"),
      body: {...metadataBody("normalize-link"), tutorialVideoLink: "file:test"},
      questionId: "question-normalize",
    }),
    /absolute HTTP\(S\) URL/,
  );

  const replacement = service.normalizeMetadataUpdateRequest({
    ...authority("inst-bwm-027-normalize"),
    body: {
      ...metadataBody("normalize-replacement"),
      solutionImage: {
        action: "replace",
        contentBase64: "iVBORw0KGgo=",
        extension: "png",
      },
    },
    questionId: "question-normalize",
  });
  await assert.rejects(service.updateMetadata(replacement), (error: unknown) => {
    assert.ok(error instanceof AdminQuestionBankValidationError);
    assert.equal(error.code, "NOT_FOUND");
    assert.match(error.message, /not found/);
    return true;
  });
});

test("metadata updates used questions atomically and replays exact commands", async () => {
  const instituteId = "inst-bwm-027-metadata";
  const questionId = "question-metadata-v1";
  await prepareInstitute(instituteId);
  const institute = firestore.collection("institutes").doc(instituteId);
  const question = institute.collection("questionBank").doc(questionId);
  await Promise.all([
    question.set(questionData({questionId, uniqueKey: "META-v1"})),
    institute.collection("tests").doc("assigned-template").set({
      questionIds: [questionId],
      status: "assigned",
      totalRuns: 3,
    }),
  ]);

  try {
    const service = createService();
    const request = service.normalizeMetadataUpdateRequest({
      ...authority(instituteId),
      body: metadataBody("metadata-exact-key"),
      questionId,
    });
    const applied = await service.updateMetadata(request);
    assert.equal(applied.disposition, "applied");
    assert.equal(applied.revision, 2);
    assert.equal(applied.version, 1);

    const [saved, audit] = await Promise.all([
      question.get(),
      institute.collection("auditLogs").doc(applied.auditId).get(),
    ]);
    assert.equal(saved.get("primaryTag"), "Mechanics");
    assert.equal(saved.get("secondaryTag"), "Forces");
    assert.equal(saved.get("solutionImageUrl"), "");
    assert.equal(saved.get("correctAnswer"), "A");
    assert.equal(saved.get("revision"), 2);
    assert.equal(audit.get("actionType"), "UPDATE_QUESTION_METADATA");
    assert.equal(audit.get("metadata.idempotencyKeyHash").length, 64);
    assert.equal(audit.get("metadata.result.revision"), 2);

    const replay = await service.updateMetadata(request);
    assert.equal(replay.disposition, "replayed");
    assert.equal(replay.auditId, applied.auditId);
    assert.equal((await institute.collection("auditLogs").get()).size, 1);
    assert.equal((await question.get()).get("revision"), 2);

    await assert.rejects(
      service.updateMetadata({...request, topic: "Changed semantics"}),
      assertConflict,
    );
  } finally {
    await cleanupInstitute(instituteId);
  }
});

test("metadata replacement persists a revisioned managed solution asset", async () => {
  const instituteId = "inst-bwm-027-metadata-asset";
  const questionId = "question-metadata-asset-v1";
  const objects = new Map<string, Buffer>();
  await prepareInstitute(instituteId);
  const question = firestore.doc(
    `institutes/${instituteId}/questionBank/${questionId}`,
  );
  await question.set(questionData({questionId, uniqueKey: "META-ASSET-v1"}));

  try {
    const service = new AdminQuestionMutationsService({
      firestore,
      now: () => NOW,
      resolveStorageTarget(input): StorageObjectTarget {
        const objectPath = `${input.instituteId}/questions/${input.questionId}/` +
          `v${input.version}/solution-r${input.revision}.png`;
        return {
          bucketKey: "questionAssets",
          bucketName: "memory",
          cdnBaseUrl: "https://cdn.example.test",
          cdnPath: objectPath,
          contentType: "image/png",
          directoryPath: objectPath.split("/").slice(0, -1).join("/"),
          gsUri: `gs://memory/${objectPath}`,
          objectPath,
          requiresSignedUrl: true,
        };
      },
      storage: {
        async deleteObject(objectPath) {
          objects.delete(objectPath);
        },
        async putObject(input) {
          objects.set(input.objectPath, Buffer.from(input.bytes));
          return "created";
        },
      },
    });
    const request = service.normalizeMetadataUpdateRequest({
      ...authority(instituteId),
      body: {
        ...metadataBody("metadata-managed-asset"),
        solutionImage: {
          action: "replace",
          contentBase64: Buffer.from([
            0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
          ]).toString("base64"),
          extension: "png",
        },
      },
      questionId,
    });
    const result = await service.updateMetadata(request);
    const snapshot = await question.get();
    const expectedPath = `${instituteId}/questions/${questionId}/` +
      "v1/solution-r2.png";
    assert.equal(result.revision, 2);
    assert.equal(snapshot.get("solutionImageUrl"), expectedPath);
    assert.equal(snapshot.get("solutionImageRevision"), 2);
    assert.equal(snapshot.get("solutionImageSha256").length, 64);
    assert.equal(objects.has(expectedPath), true);
  } finally {
    await cleanupInstitute(instituteId);
  }
});

test("a locked structure replacement cleans its newly created managed asset", async () => {
  const instituteId = "inst-bwm-027-structure-asset-cleanup";
  const questionId = "question-structure-asset-v1";
  const objects = new Map<string, Buffer>();
  await prepareInstitute(instituteId);
  const institute = firestore.doc(`institutes/${instituteId}`);
  await Promise.all([
    institute.collection("questionBank").doc(questionId).set(questionData({
      questionId,
      uniqueKey: "STRUCTURE-ASSET-v1",
    })),
    institute.collection("tests").doc("assigned-template").set({
      questionIds: [questionId], status: "assigned", totalRuns: 1,
    }),
  ]);

  try {
    const service = new AdminQuestionMutationsService({
      firestore,
      now: () => NOW,
      resolveStorageTarget(input): StorageObjectTarget {
        const objectPath = `${input.instituteId}/questions/${input.questionId}/` +
          `v${input.version}/question-r${input.revision}.png`;
        return {
          bucketKey: "questionAssets", bucketName: "memory",
          cdnBaseUrl: "https://cdn.example.test", cdnPath: objectPath,
          contentType: "image/png",
          directoryPath: objectPath.split("/").slice(0, -1).join("/"),
          gsUri: `gs://memory/${objectPath}`, objectPath,
          requiresSignedUrl: true,
        };
      },
      storage: {
        async deleteObject(objectPath) {
          objects.delete(objectPath);
        },
        async putObject(input) {
          objects.set(input.objectPath, Buffer.from(input.bytes));
          return "created";
        },
      },
    });
    const request = service.normalizeStructureUpdateRequest({
      ...authority(instituteId),
      body: {
        ...structureBody("structure-asset-cleanup"),
        questionImage: {
          action: "replace",
          contentBase64: Buffer.from([
            0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
          ]).toString("base64"),
          extension: "png",
        },
        uniqueKey: "STRUCTURE-ASSET-v1",
      },
      questionId,
    });
    await assert.rejects(service.updateStructure(request), assertConflict);
    assert.equal(objects.size, 0);
    assert.equal((await institute.collection("auditLogs").get()).size, 0);
    assert.equal((await institute.collection("questionBank").doc(questionId)
      .get()).get("revision"), 1);
    assert.equal((await institute.collection("questionAssetRecoveries").get())
      .size, 0);
  } finally {
    await cleanupInstitute(instituteId);
  }
});

test("structure edits use bounded authoritative assignment locks", async () => {
  const instituteId = "inst-bwm-027-structure";
  const openId = "question-open-v1";
  const lockedId = "question-locked-v1";
  await prepareInstitute(instituteId);
  const institute = firestore.collection("institutes").doc(instituteId);
  const questions = institute.collection("questionBank");
  await Promise.all([
    questions.doc(openId).set(questionData({
      questionId: openId,
      uniqueKey: "OPEN-v1",
    })),
    questions.doc(lockedId).set(questionData({
      questionId: lockedId,
      uniqueKey: "LOCKED-v1",
      usedCount: 0,
    })),
    institute.collection("tests").doc("ready-template").set({
      questionIds: [openId],
      status: "ready",
      totalRuns: 0,
    }),
    institute.collection("tests").doc("assigned-template").set({
      questionIds: [lockedId],
      status: "assigned",
      totalRuns: 1,
    }),
  ]);

  try {
    const service = createService();
    const openRequest = service.normalizeStructureUpdateRequest({
      ...authority(instituteId),
      body: structureBody("structure-open-key"),
      questionId: openId,
    });
    const result = await service.updateStructure(openRequest);
    assert.equal(result.disposition, "applied");
    assert.equal(result.revision, 2);
    const savedOpen = await questions.doc(openId).get();
    assert.equal(savedOpen.get("chapter"), "Laws of Motion");
    assert.equal(savedOpen.get("correctAnswer"), "B");
    assert.equal(savedOpen.get("version"), 1);

    const staleRequest = service.normalizeStructureUpdateRequest({
      ...authority(instituteId),
      body: {
        ...structureBody("structure-stale-key"),
        expectedRevision: 1,
      },
      questionId: openId,
    });
    await assert.rejects(service.updateStructure(staleRequest), (error: unknown) => {
      assertConflict(error);
      assert.match((error as Error).message, /revision conflict/);
      return true;
    });

    const duplicateKeyRequest = service.normalizeStructureUpdateRequest({
      ...authority(instituteId),
      body: {
        ...structureBody("structure-duplicate-key"),
        expectedRevision: 2,
        uniqueKey: "LOCKED-v1",
      },
      questionId: openId,
    });
    await assert.rejects(
      service.updateStructure(duplicateKeyRequest),
      assertConflict,
    );

    const lockedRequest = service.normalizeStructureUpdateRequest({
      ...authority(instituteId),
      body: {...structureBody("structure-locked-key"), uniqueKey: "LOCKED-v1"},
      questionId: lockedId,
    });
    await assert.rejects(service.updateStructure(lockedRequest), (error: unknown) => {
      assertConflict(error);
      assert.match((error as Error).message, /authoritative assignment usage/);
      return true;
    });
    assert.equal((await questions.doc(lockedId).get()).get("revision"), 1);
    assert.equal((await questions.doc(openId).get()).get("revision"), 2);
    assert.equal((await institute.collection("auditLogs").get()).size, 1);
  } finally {
    await cleanupInstitute(instituteId);
  }
});

test("successor creation preserves lineage and deprecates the used source", async () => {
  const instituteId = "inst-bwm-027-version";
  const questionId = "question-version-v1";
  await prepareInstitute(instituteId);
  const institute = firestore.collection("institutes").doc(instituteId);
  const questions = institute.collection("questionBank");
  await Promise.all([
    questions.doc(questionId).set(questionData({
      questionId,
      uniqueKey: "PHY-FORCE-v1",
    })),
    institute.collection("tests").doc("assigned-template").set({
      questionIds: [questionId],
      status: "assigned",
      totalRuns: 2,
    }),
  ]);

  try {
    const service = createService();
    const request = service.normalizeVersionCreateRequest({
      ...authority(instituteId),
      body: {expectedRevision: 1, idempotencyKey: "version-exact-key"},
      questionId,
    });
    const applied = await service.createSuccessorVersion(request);
    assert.equal(applied.disposition, "applied");
    assert.equal(applied.sourceQuestionId, questionId);
    assert.equal(applied.sourceRevision, 2);
    assert.equal(applied.sourceStatus, "deprecated");
    assert.equal(applied.successorQuestionId, "question-version-v2");
    assert.equal(applied.successorRevision, 1);
    assert.equal(applied.successorVersion, 2);

    const [source, successor, audit] = await Promise.all([
      questions.doc(questionId).get(),
      questions.doc(applied.successorQuestionId).get(),
      institute.collection("auditLogs").doc(applied.auditId).get(),
    ]);
    assert.equal(source.get("status"), "deprecated");
    assert.equal(source.get("successorQuestionId"), applied.successorQuestionId);
    assert.equal(successor.get("parentQuestionId"), questionId);
    assert.equal(successor.get("uniqueKey"), "PHY-FORCE-v2");
    assert.equal(successor.get("status"), "active");
    assert.equal(successor.get("usedCount"), 0);
    assert.equal(successor.get("questionImageUrl"), "");
    assert.equal(successor.get("solutionImageUrl"), "");
    assert.equal(source.get("questionImageUrl"), questionData().questionImageUrl);
    assert.equal(audit.get("metadata.usage.runCount"), 2);
    assert.deepEqual(
      audit.get("metadata.usage.assignedTemplateIds"),
      ["assigned-template"],
    );

    const replay = await service.createSuccessorVersion(request);
    assert.equal(replay.disposition, "replayed");
    assert.equal(replay.successorQuestionId, applied.successorQuestionId);
    assert.equal((await questions.get()).size, 2);
    assert.equal((await institute.collection("auditLogs").get()).size, 1);
  } finally {
    await cleanupInstitute(instituteId);
  }
});

test("lifecycle rejects used/recent questions and converges concurrent commands", async () => {
  const instituteId = "inst-bwm-027-lifecycle";
  await prepareInstitute(instituteId);
  const institute = firestore.collection("institutes").doc(instituteId);
  const questions = institute.collection("questionBank");
  await Promise.all([
    questions.doc("unused-deprecate").set(questionData({
      questionId: "unused-deprecate",
      uniqueKey: "UNUSED-DEPRECATE-v1",
    })),
    questions.doc("unused-archive").set(questionData({
      questionId: "unused-archive",
      uniqueKey: "UNUSED-ARCHIVE-v1",
    })),
    questions.doc("recent-archive").set(questionData({
      createdAt: Timestamp.fromDate(new Date("2026-01-01T00:00:00.000Z")),
      questionId: "recent-archive",
      uniqueKey: "RECENT-ARCHIVE-v1",
    })),
    questions.doc("used-question").set(questionData({
      questionId: "used-question",
      uniqueKey: "USED-v1",
    })),
    questions.doc("race-question").set(questionData({
      questionId: "race-question",
      uniqueKey: "RACE-v1",
    })),
    institute.collection("tests").doc("used-template").set({
      questionIds: ["used-question"],
      status: "assigned",
      totalRuns: 1,
    }),
  ]);

  try {
    const service = createService();
    const deprecate = service.normalizeLifecycleRequest({
      ...authority(instituteId),
      body: {
        action: "deprecate",
        expectedRevision: 1,
        idempotencyKey: "deprecate-key",
        reason: "Content retired",
      },
      questionId: "unused-deprecate",
    });
    const deprecated = await service.updateLifecycle(deprecate);
    assert.equal(deprecated.status, "deprecated");
    assert.equal(deprecated.revision, 2);
    assert.equal((await service.updateLifecycle(deprecate)).disposition, "replayed");

    const archive = service.normalizeLifecycleRequest({
      ...authority(instituteId),
      body: {
        action: "archive",
        expectedRevision: 1,
        idempotencyKey: "archive-key",
        reason: "Cold retention",
      },
      questionId: "unused-archive",
    });
    const archived = await service.updateLifecycle(archive);
    assert.equal(archived.status, "archived");
    assert.equal(archived.thermalState, "cold");

    const recentArchive = service.normalizeLifecycleRequest({
      ...authority(instituteId),
      body: {...archive, idempotencyKey: "recent-key"},
      questionId: "recent-archive",
    });
    await assert.rejects(service.updateLifecycle(recentArchive), assertConflict);

    const usedDeprecate = service.normalizeLifecycleRequest({
      ...authority(instituteId),
      body: {...deprecate, idempotencyKey: "used-key"},
      questionId: "used-question",
    });
    await assert.rejects(service.updateLifecycle(usedDeprecate), assertConflict);

    const raceInputs = ["race-a", "race-b"].map((idempotencyKey) =>
      service.normalizeLifecycleRequest({
        ...authority(instituteId),
        body: {
          action: "deprecate",
          expectedRevision: 1,
          idempotencyKey,
          reason: "Concurrent retirement",
        },
        questionId: "race-question",
      }));
    const race = await Promise.allSettled(
      raceInputs.map((request) => service.updateLifecycle(request)),
    );
    assert.equal(race.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(race.filter((result) => result.status === "rejected").length, 1);
    assert.equal((await questions.doc("race-question").get()).get("revision"), 2);
  } finally {
    await cleanupInstitute(instituteId);
  }
});
