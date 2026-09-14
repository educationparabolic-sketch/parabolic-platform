import assert from "node:assert/strict";
import test from "node:test";
import * as gcpMetadata from "gcp-metadata";
import {Timestamp} from "firebase-admin/firestore";
import {AdminQuestionTagsService} from "../services/adminQuestionTags";
import {QuestionTagProjectionService} from "../services/questionTagProjection";
import {QuestionUsageProjectionService} from "../services/questionUsageProjection";
import {AdminQuestionBankValidationError} from "../types/adminQuestionBank";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "demo-parabolic-test";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();
const NOW = Timestamp.fromDate(new Date("2026-09-12T10:00:00.000Z"));

function service(): AdminQuestionTagsService {
  return new AdminQuestionTagsService({firestore, now: () => NOW});
}

function authority(instituteId: string) {
  return {
    actorId: "teacher-bwm-027-tags",
    actorRole: "teacher",
    instituteId,
    ipAddress: "127.0.0.1",
    userAgent: "BWM-027-tag-test",
  };
}

function question(input: Record<string, unknown> = {}) {
  return {
    additionalTag: "Vectors",
    primaryTag: "Motion",
    revision: 1,
    secondaryTag: "Velocity",
    status: "active",
    tags: ["Motion", "Velocity", "Vectors"],
    topic: "Uniform Motion",
    ...input,
  };
}

async function deleteCollection(path: string): Promise<void> {
  const snapshot = await firestore.collection(path).get();
  await Promise.all(snapshot.docs.map((document) => document.ref.delete()));
}

async function prepareInstitute(instituteId: string): Promise<void> {
  const path = `institutes/${instituteId}`;
  await Promise.all([
    deleteCollection(`${path}/auditLogs`),
    deleteCollection(`${path}/questionBank`),
    deleteCollection(`${path}/questionTagProjectionItems`),
    deleteCollection(`${path}/questionTagProjections`),
    deleteCollection(`${path}/questionUsageProjectionItems`),
    deleteCollection(`${path}/tagDictionary`),
    deleteCollection(`${path}/tests`),
  ]);
  await firestore.doc(path).set({instituteId, status: "active"});
}

async function cleanupInstitute(instituteId: string): Promise<void> {
  await prepareInstitute(instituteId);
  await firestore.doc(`institutes/${instituteId}`).delete();
}

function assertDomainError(code: string, pattern?: RegExp) {
  return (error: unknown): boolean => {
    assert.ok(error instanceof AdminQuestionBankValidationError);
    assert.equal(error.code, code);
    if (pattern) assert.match(error.message, pattern);
    return true;
  };
}

test.after(async () => {
  await getFirebaseAdminApp().delete();
});

test("normalization supports all fields and bounded multi-source input", () => {
  const instance = service();
  for (const field of [
    "primaryTag",
    "secondaryTag",
    "additionalTag",
    "topic",
  ] as const) {
    assert.equal(instance.normalizeReadRequest({...authority("normalize"), field})
      .field, field);
  }
  const normalized = instance.normalizeMutationRequest({
    ...authority("normalize"),
    body: {
      action: "merge",
      destinationName: "Mechanics",
      expectedDictionaryRevision: 1,
      field: "primaryTag",
      idempotencyKey: "normalize-key",
      sourceNames: [" Motion ", "Velocity"],
    },
  });
  assert.deepEqual(normalized.mutation, {
    action: "merge",
    destinationName: "Mechanics",
    expectedDictionaryRevision: 1,
    field: "primaryTag",
    idempotencyKey: "normalize-key",
    sourceNames: ["Motion", "Velocity"],
  });
  assert.throws(() => instance.normalizeMutationRequest({
    ...authority("normalize"),
    body: {
      action: "merge",
      destinationName: "Mechanics",
      expectedDictionaryRevision: 1,
      field: "primaryTag",
      idempotencyKey: "duplicate-key",
      sourceNames: ["Motion", "Motion"],
    },
  }), /2-20 unique names/);
});

test("read inventory separates fields and derives active use from templates", async () => {
  const instituteId = "inst-bwm-027-tag-read";
  await prepareInstitute(instituteId);
  const institute = firestore.collection("institutes").doc(instituteId);
  await Promise.all([
    institute.collection("questionBank").doc("q1").set(question()),
    institute.collection("questionBank").doc("q2").set(question({
      primaryTag: "Algebra",
      secondaryTag: "Motion",
      tags: ["Algebra", "Motion", "Vectors"],
    })),
    institute.collection("tests").doc("ready-template").set({
      questionIds: ["q1"],
      status: "ready",
    }),
    institute.collection("tagDictionary")
      .doc("question_tag_governance_state").set({dictionaryRevision: 7}),
    institute.collection("tagDictionary")
      .doc("question_tag_projection_state").set({backfillComplete: true}),
  ]);
  const usageProjection = new QuestionUsageProjectionService(firestore, () => NOW);
  await usageProjection.reconcileTemplate({instituteId, testId: "ready-template"});
  const tagProjection = new QuestionTagProjectionService(firestore, () => NOW);
  await Promise.all(["q1", "q2"].map((questionId) =>
    tagProjection.reconcileQuestion({instituteId, questionId})));

  try {
    const result = await service().getTags({
      ...authority(instituteId),
      field: "primaryTag",
    });
    assert.equal(result.dictionaryRevision, 7);
    assert.deepEqual(result.tags, [
      {
        field: "primaryTag",
        name: "Algebra",
        questionCount: 1,
        status: "active",
        usedInActiveTemplate: false,
      },
      {
        field: "primaryTag",
        name: "Motion",
        questionCount: 1,
        status: "active",
        usedInActiveTemplate: true,
      },
    ]);
  } finally {
    await cleanupInstitute(instituteId);
  }
});

test("rename commits question, dictionary revision, and one immutable replay audit", async () => {
  const instituteId = "inst-bwm-027-tag-rename";
  await prepareInstitute(instituteId);
  const institute = firestore.collection("institutes").doc(instituteId);
  const questionReference = institute.collection("questionBank").doc("q1");
  await questionReference.set(question());

  try {
    const instance = service();
    const request = instance.normalizeMutationRequest({
      ...authority(instituteId),
      body: {
        action: "rename",
        destinationName: "Mechanics",
        expectedDictionaryRevision: 1,
        field: "primaryTag",
        idempotencyKey: "rename-exact-key",
        sourceName: "Motion",
      },
    });
    const applied = await instance.mutateTags(request);
    assert.equal(applied.disposition, "applied");
    assert.equal(applied.affectedQuestionCount, 1);
    assert.equal(applied.dictionaryRevision, 2);
    const saved = await questionReference.get();
    assert.equal(saved.get("primaryTag"), "Mechanics");
    assert.deepEqual(saved.get("tags"), ["Mechanics", "Velocity", "Vectors"]);
    assert.equal(saved.get("revision"), 2);

    const audit = await institute.collection("auditLogs").doc(applied.auditId).get();
    assert.equal(audit.get("actionType"), "MUTATE_QUESTION_TAGS");
    assert.equal(audit.get("metadata.idempotencyKeyHash").length, 64);
    assert.equal(audit.get("metadata.mutation.idempotencyKey"), undefined);

    const replay = await instance.mutateTags(request);
    assert.equal(replay.disposition, "replayed");
    assert.equal(replay.auditId, applied.auditId);
    assert.equal((await institute.collection("auditLogs").get()).size, 1);
    assert.equal((await questionReference.get()).get("revision"), 2);
    const conflictingRequest = instance.normalizeMutationRequest({
      ...authority(instituteId),
      body: {
        action: "rename",
        destinationName: "Dynamics",
        expectedDictionaryRevision: 1,
        field: "primaryTag",
        idempotencyKey: "rename-exact-key",
        sourceName: "Motion",
      },
    });
    await assert.rejects(
      instance.mutateTags(conflictingRequest),
      assertDomainError("CONFLICT", /different tag mutation semantics/),
    );
  } finally {
    await cleanupInstitute(instituteId);
  }
});

test("multi-source merge is blocked by active template authority", async () => {
  const instituteId = "inst-bwm-027-tag-merge-lock";
  await prepareInstitute(instituteId);
  const institute = firestore.collection("institutes").doc(instituteId);
  await Promise.all([
    institute.collection("questionBank").doc("q1").set(question()),
    institute.collection("questionBank").doc("q2").set(question({
      primaryTag: "Velocity",
      tags: ["Velocity", "Vectors"],
    })),
    institute.collection("tests").doc("active-template").set({
      questionIds: ["q2"],
      status: "assigned",
    }),
  ]);
  const instance = service();
  const request = instance.normalizeMutationRequest({
    ...authority(instituteId),
    body: {
      action: "merge",
      destinationName: "Mechanics",
      expectedDictionaryRevision: 1,
      field: "primaryTag",
      idempotencyKey: "merge-lock-key",
      sourceNames: ["Motion", "Velocity"],
    },
  });

  try {
    await assert.rejects(
      instance.mutateTags(request),
      assertDomainError("CONFLICT", /active templates \(active-template\)/),
    );
    assert.equal((await institute.collection("auditLogs").get()).size, 0);
    assert.equal((await institute.collection("questionBank").doc("q1").get())
      .get("primaryTag"), "Motion");

    await institute.collection("tests").doc("active-template").delete();
    const applied = await instance.mutateTags(request);
    assert.equal(applied.affectedQuestionCount, 2);
    assert.equal(applied.tags.find((tag) => tag.name === "Mechanics")
      ?.questionCount, 2);
    assert.deepEqual((await institute.collection("questionBank").get())
      .docs.map((document) => document.get("primaryTag")).sort(),
    ["Mechanics", "Mechanics"]);
  } finally {
    await cleanupInstitute(instituteId);
  }
});

test("create/deprecate respects dictionary revisions and preserves question fields", async () => {
  const instituteId = "inst-bwm-027-tag-deprecate";
  await prepareInstitute(instituteId);
  const instance = service();
  try {
    const created = await instance.mutateTags(
      instance.normalizeMutationRequest({
        ...authority(instituteId),
        body: {
          action: "create",
          expectedDictionaryRevision: 1,
          field: "topic",
          idempotencyKey: "create-topic-key",
          name: "Projectile Motion",
        },
      }),
    );
    assert.equal(created.dictionaryRevision, 2);
    await assert.rejects(instance.mutateTags(
      instance.normalizeMutationRequest({
        ...authority(instituteId),
        body: {
          action: "deprecate",
          expectedDictionaryRevision: 1,
          field: "topic",
          idempotencyKey: "stale-deprecate-key",
          name: "Projectile Motion",
        },
      }),
    ), assertDomainError("CONFLICT", /revision conflict/));

    const deprecated = await instance.mutateTags(
      instance.normalizeMutationRequest({
        ...authority(instituteId),
        body: {
          action: "deprecate",
          expectedDictionaryRevision: 2,
          field: "topic",
          idempotencyKey: "deprecate-topic-key",
          name: "Projectile Motion",
        },
      }),
    );
    assert.equal(deprecated.dictionaryRevision, 3);
    assert.equal(deprecated.tags[0].status, "deprecated");
  } finally {
    await cleanupInstitute(instituteId);
  }
});

test("concurrent expected-revision mutations allow exactly one winner", async () => {
  const instituteId = "inst-bwm-027-tag-concurrency";
  await prepareInstitute(instituteId);
  const instance = service();
  const makeRequest = (name: string) => instance.normalizeMutationRequest({
    ...authority(instituteId),
    body: {
      action: "create",
      expectedDictionaryRevision: 1,
      field: "additionalTag",
      idempotencyKey: `concurrent-${name}`,
      name,
    },
  });

  try {
    const outcomes = await Promise.allSettled([
      instance.mutateTags(makeRequest("Dynamics")),
      instance.mutateTags(makeRequest("Kinematics")),
    ]);
    assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
    assert.equal(outcomes.filter((outcome) => outcome.status === "rejected").length, 1);
    const rejected = outcomes.find((outcome) => outcome.status === "rejected");
    assert.ok(rejected?.status === "rejected");
    assertDomainError("CONFLICT", /revision conflict/)(rejected.reason);
    assert.equal((await firestore.doc(
      `institutes/${instituteId}/tagDictionary/question_tag_governance_state`,
    ).get()).get("dictionaryRevision"), 2);
    assert.equal((await firestore.collection(
      `institutes/${instituteId}/auditLogs`,
    ).get()).size, 1);
  } finally {
    await cleanupInstitute(instituteId);
  }
});

test("more than 100 affected questions fails without partial writes", async () => {
  const instituteId = "inst-bwm-027-tag-bound";
  await prepareInstitute(instituteId);
  const institute = firestore.collection("institutes").doc(instituteId);
  const batch = firestore.batch();
  for (let index = 0; index < 101; index += 1) {
    batch.set(institute.collection("questionBank").doc(`q-${index}`), question());
  }
  await batch.commit();

  try {
    const instance = service();
    await assert.rejects(instance.mutateTags(
      instance.normalizeMutationRequest({
        ...authority(instituteId),
        body: {
          action: "rename",
          destinationName: "Mechanics",
          expectedDictionaryRevision: 1,
          field: "primaryTag",
          idempotencyKey: "over-bound-key",
          sourceName: "Motion",
        },
      }),
    ), assertDomainError("CONFLICT", /bounded 100-record/));
    assert.equal((await institute.collection("auditLogs").get()).size, 0);
    assert.equal((await institute.collection("questionBank").doc("q-0").get())
      .get("primaryTag"), "Motion");
  } finally {
    await cleanupInstitute(instituteId);
  }
});
