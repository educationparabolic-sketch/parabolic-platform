import assert from "node:assert/strict";
import test from "node:test";
import * as gcpMetadata from "gcp-metadata";
import {Timestamp} from "firebase-admin/firestore";
import {AdminQuestionLibraryService} from "../services/adminQuestionLibrary";
import {AdminQuestionUploadLogsService} from
  "../services/adminQuestionUploadLogs";
import {AdminQuestionDistributionService} from
  "../services/adminQuestionDistribution";
import {QuestionDistributionProjectionService} from
  "../services/questionDistributionProjection";
import {QuestionUsageProjectionService} from
  "../services/questionUsageProjection";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "demo-parabolic-test";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();
const NOW = Timestamp.fromDate(new Date("2026-09-12T12:00:00.000Z"));
const DAY = 24 * 60 * 60 * 1000;

test.after(async () => {
  await getFirebaseAdminApp().delete();
});

function question(input: Record<string, unknown>): Record<string, unknown> {
  const questionId = String(input.questionId);
  const createdAt = input.createdAt ?? Timestamp.fromMillis(NOW.toMillis() - DAY);
  return {
    academicYear: "2026-27",
    additionalTag: "Mechanics",
    chapter: "Motion",
    correctAnswer: "A",
    createdAt,
    difficulty: "Medium",
    examType: "JEE",
    internalNotes: null,
    lastUsedAcademicYear: null,
    lastUsedAt: null,
    marks: 4,
    negativeMarks: 1,
    parentQuestionId: null,
    primaryTag: "Kinematics",
    questionId,
    questionImageUrl: "",
    questionText: `Prompt for ${questionId}`,
    questionType: "MCQ",
    revision: 1,
    searchTokens: ["motion"],
    secondaryTag: "Velocity",
    simulationLink: null,
    solutionImageUrl: "",
    status: "active",
    subject: "Physics",
    tags: ["Kinematics", "Velocity"],
    topic: "Uniform motion",
    tutorialVideoLink: null,
    uniqueKey: `KEY-${questionId}`,
    updatedAt: createdAt,
    usedCount: 0,
    usedInTemplate: false,
    version: 1,
    ...input,
  };
}

function authority(instituteId: string): Record<string, unknown> {
  return {
    actorId: "teacher-read-model",
    actorRole: "teacher",
    instituteId,
  };
}

async function seedActiveYear(instituteId: string): Promise<void> {
  await firestore.doc(`institutes/${instituteId}/academicYears/2026-27`)
    .set({status: "Active"});
}

test("library uses stable cursors and current-year/two-year lifecycle authority", async () => {
  const instituteId = "inst_bwm027_reads_library";
  const institute = firestore.doc(`institutes/${instituteId}`);
  await seedActiveYear(instituteId);
  await Promise.all([
    institute.collection("questionBank").doc("q-hot").set(question({
      createdAt: Timestamp.fromMillis(NOW.toMillis() - DAY),
      lastUsedAcademicYear: "2026-27",
      lastUsedAt: Timestamp.fromMillis(NOW.toMillis() - DAY),
      questionId: "q-hot",
      status: "used",
      usedCount: 2,
      usedInTemplate: true,
    })),
    institute.collection("questionBank").doc("q-warm").set(question({
      createdAt: Timestamp.fromMillis(NOW.toMillis() - 20 * DAY),
      questionId: "q-warm",
    })),
    institute.collection("questionBank").doc("q-cold").set(question({
      createdAt: Timestamp.fromMillis(NOW.toMillis() - 800 * DAY),
      questionId: "q-cold",
    })),
  ]);
  const service = new AdminQuestionLibraryService(
    firestore,
    () => {
      throw new Error("blank assets must not be signed");
    },
    () => NOW,
  );
  const first = await service.getLibrary(service.normalizeRequest({
    ...authority(instituteId), limit: 2,
  }));
  assert.deepEqual(first.questions.map((entry) => entry.id), ["q-hot", "q-warm"]);
  assert.deepEqual(first.questions.map((entry) => entry.thermalState), ["hot", "warm"]);
  assert.ok(first.nextCursor);
  const second = await service.getLibrary(service.normalizeRequest({
    ...authority(instituteId), cursor: first.nextCursor, limit: 2,
  }));
  assert.deepEqual(second.questions.map((entry) => entry.id), ["q-cold"]);
  assert.equal(second.questions[0]?.thermalState, "cold");
  assert.equal(second.nextCursor, null);
  const cold = await service.getLibrary(service.normalizeRequest({
    ...authority(instituteId), limit: 10, thermalState: "cold",
  }));
  assert.deepEqual(cold.questions.map((entry) => entry.id), ["q-cold"]);
  await assert.rejects(
    service.getLibrary(service.normalizeRequest({
      ...authority(instituteId), cursor: first.nextCursor, limit: 2, subject: "Physics",
    })),
    /cursor.*active filters/iu,
  );
});

test("question detail follows explicit lineage and authoritative usage and analytics", async () => {
  const instituteId = "inst_bwm027_reads_detail";
  const institute = firestore.doc(`institutes/${instituteId}`);
  await seedActiveYear(instituteId);
  const v1 = question({
    createdAt: Timestamp.fromMillis(NOW.toMillis() - 100 * DAY),
    questionId: "q-v1",
    revision: 3,
    status: "deprecated",
    successorQuestionId: "q-v2",
    version: 1,
  });
  const v2 = question({
    createdAt: Timestamp.fromMillis(NOW.toMillis() - DAY),
    lastUsedAcademicYear: "2026-27",
    lastUsedAt: Timestamp.fromMillis(NOW.toMillis() - DAY),
    parentQuestionId: "q-v1",
    questionId: "q-v2",
    status: "used",
    usedCount: 2,
    usedInTemplate: true,
    version: 2,
  });
  await Promise.all([
    institute.collection("questionBank").doc("q-v1").set(v1),
    institute.collection("questionBank").doc("q-v2").set(v2),
    institute.collection("questionAnalytics").doc("q-v2").set({
      avgAccuracyWhenUsed: 64,
      avgRawPercentWhenUsed: 58,
      averageResponseTimeMs: 90000,
      correctAttemptCount: 4,
      disciplineStressIndex: 32,
      guessRate: 12,
      incorrectAttemptCount: 2,
      overstayRate: 25,
      processingMarkers: {questionAnalyticsEngine: {useCount: 2}},
      riskImpactScore: 40,
    }),
    institute.collection("tests").doc("template-1").set({
      lastUsedAcademicYear: "2026-27",
      lastUsedAt: Timestamp.fromMillis(NOW.toMillis() - DAY),
      questionIds: ["q-v2"],
      status: "assigned",
      templateName: "Motion Diagnostic",
      testId: "template-1",
      totalRuns: 2,
      version: 4,
    }),
  ]);
  const service = new AdminQuestionLibraryService(
    firestore,
    () => {
      throw new Error("blank assets must not be signed");
    },
    () => NOW,
  );
  const detail = await service.getQuestionDetail(service.normalizeDetailRequest({
    ...authority(instituteId), questionId: "q-v2",
  }));
  assert.deepEqual(detail.versions.map((entry) => entry.questionId), ["q-v1", "q-v2"]);
  assert.equal(detail.templateUsage[0]?.testName, "Motion Diagnostic");
  assert.equal(detail.templateUsage[0]?.runCount, 2);
  assert.equal(detail.analytics?.avgAccuracyWhenUsed, 64);
  assert.equal(detail.question.prompt, "Prompt for q-v2");
  assert.equal(detail.question.usedInTemplate, true);
});

test("validation-log detail verifies immutable rows and derives rollback eligibility", async () => {
  const instituteId = "inst_bwm027_reads_logs";
  const institute = firestore.doc(`institutes/${instituteId}`);
  const packageId = "package-1";
  const rows = [{
    action: "create",
    errors: [],
    questionId: "q-imported",
    rowNumber: 2,
    uniqueKey: "KEY-q-imported",
    version: 1,
    warnings: [],
  }];
  const summary = {
    assetCount: 2, created: 1, invalid: 0, received: 1,
    updated: 0, valid: 1, warnings: 0,
  };
  await Promise.all([
    institute.collection("questionBank").doc("q-imported").set(question({
      questionId: "q-imported",
    })),
    institute.collection("questionPackages").doc(packageId).set({
      commitResult: {
        questions: [{action: "create", questionId: "q-imported", revision: 1, version: 1}],
      },
      state: "committed",
      validationResult: {contentSha256: "a".repeat(64), rows, summary},
    }),
    institute.collection("questionUploadLogs").doc(packageId).set({
      committedAt: NOW,
      contentSha256: "a".repeat(64),
      packageId,
      packageRevision: 2,
      rows,
      state: "committed",
      summary,
      uploadedBy: "teacher-read-model",
      validatedAt: Timestamp.fromMillis(NOW.toMillis() - DAY),
    }),
  ]);
  const service = new AdminQuestionUploadLogsService(firestore);
  const eligible = await service.getLogDetail({instituteId, uploadLogId: packageId});
  assert.equal(eligible.rollbackEligible, true);
  assert.equal(eligible.rollbackReason, null);
  await institute.collection("tests").doc("assigned-template").set({
    questionIds: ["q-imported"], status: "assigned", totalRuns: 1,
  });
  const blocked = await service.getLogDetail({instituteId, uploadLogId: packageId});
  assert.equal(blocked.rollbackEligible, false);
  assert.match(blocked.rollbackReason ?? "", /assigned template/u);
  await institute.collection("questionUploadLogs").doc(packageId).update({
    rows: [{...rows[0], warnings: ["tampered"]}],
  });
  await assert.rejects(
    service.getLogDetail({instituteId, uploadLogId: packageId}),
    /immutable.*diverged/iu,
  );
});

test("distribution reads only reconciled summary and chapter projections", async () => {
  const instituteId = "inst_bwm027_reads_distribution";
  const institute = firestore.doc(`institutes/${instituteId}`);
  const projection = new QuestionDistributionProjectionService(firestore, () => NOW);
  await Promise.all([
    institute.collection("questionBank").doc("q-1").set(question({
      difficulty: "Easy", marks: 2, questionId: "q-1",
    })),
    institute.collection("questionBank").doc("q-2").set(question({
      chapter: "Forces", difficulty: "Hard", marks: 4, questionId: "q-2",
    })),
    institute.collection("questionAnalytics").doc("q-1").set({
      correctAttemptCount: 2,
      disciplineStressIndex: 20,
      guessRate: 10,
      incorrectAttemptCount: 1,
      overstayRate: 30,
      processingMarkers: {questionAnalyticsEngine: {useCount: 1}},
      riskImpactScore: 40,
    }),
  ]);
  assert.equal(await projection.reconcileQuestion({instituteId, questionId: "q-1"}), "applied");
  assert.equal(await projection.reconcileQuestion({instituteId, questionId: "q-1"}), "unchanged");
  await projection.reconcileQuestion({instituteId, questionId: "q-2"});
  await institute.collection("questionDistributionProjections").doc("all")
    .update({backfillComplete: true});
  await institute.collection("questionDistributionProjections")
    .doc(projection.getScopeId("JEE")).update({backfillComplete: true});
  const service = new AdminQuestionDistributionService(firestore);
  const summary = await service.getDistributionSummary({
    examType: null, instituteId, limit: 10,
  });
  assert.equal(summary.totalQuestions, 2);
  assert.equal(summary.analyticsQuestionCount, 1);
  assert.equal(summary.difficulties[0]?.questionCount, 1);
  assert.equal(summary.difficulties[0]?.guessRatePercent, 10);
  assert.equal(summary.chapters.length, 2);
  await institute.collection("questionBank").doc("q-2").update({
    chapter: "Motion", difficulty: "Medium",
  });
  await projection.reconcileQuestion({instituteId, questionId: "q-2"});
  const updated = await service.getDistributionSummary({
    examType: "JEE", instituteId, limit: 10,
  });
  assert.equal(updated.totalQuestions, 2);
  assert.equal(updated.chapters.length, 1);
  assert.equal(updated.chapters[0]?.chapter, "Motion");
});

test("template usage projection advances question usage exactly once", async () => {
  const instituteId = "inst_bwm027_reads_usage";
  const institute = firestore.doc(`institutes/${instituteId}`);
  await institute.collection("questionBank").doc("q-used").set(question({
    questionId: "q-used",
  }));
  await institute.collection("tests").doc("template-usage").set({
    lastUsedAcademicYear: "2026-27",
    lastUsedAt: NOW,
    questionIds: ["q-used"],
    status: "assigned",
    totalRuns: 2,
  });
  const projection = new QuestionUsageProjectionService(firestore, () => NOW);
  assert.equal(await projection.reconcileTemplate({
    instituteId, testId: "template-usage",
  }), "applied");
  assert.equal(await projection.reconcileTemplate({
    instituteId, testId: "template-usage",
  }), "unchanged");
  let saved = (await institute.collection("questionBank").doc("q-used").get()).data();
  assert.equal(saved?.usedCount, 2);
  assert.equal(saved?.activeTemplateCount, 1);
  assert.equal(saved?.lastUsedAcademicYear, "2026-27");
  assert.equal(saved?.status, "used");
  await institute.collection("tests").doc("template-usage").update({totalRuns: 3});
  await projection.reconcileTemplate({instituteId, testId: "template-usage"});
  saved = (await institute.collection("questionBank").doc("q-used").get()).data();
  assert.equal(saved?.usedCount, 3);
  await institute.collection("tests").doc("template-usage").delete();
  await projection.reconcileTemplate({instituteId, testId: "template-usage"});
  saved = (await institute.collection("questionBank").doc("q-used").get()).data();
  assert.equal(saved?.activeTemplateCount, 0);
  assert.equal(saved?.usedCount, 3);
});
