import assert from "node:assert/strict";
import test from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import * as gcpMetadata from "gcp-metadata";
import {
  InterventionRecommendationService,
} from "../services/interventionRecommendations";
import {
  AdminInterventionRecommendationValidationError,
} from "../types/adminGovernanceInterventions";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "demo-parabolic-test";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();

const deleteCollection = async (path: string): Promise<void> => {
  const snapshot = await firestore.collection(path).get();
  await Promise.all(snapshot.docs.map((document) => document.ref.delete()));
};

const assertCode = (
  error: unknown,
  code: string,
): boolean => {
  assert.equal(
    error instanceof AdminInterventionRecommendationValidationError,
    true,
  );
  assert.equal(
    (error as AdminInterventionRecommendationValidationError).code,
    code,
  );
  return true;
};

test.after(async () => {
  await getFirebaseAdminApp().delete();
});

test(
  "recommendations are advisory, atomic, replayable, and cursor bounded",
  async () => {
    const instituteId = "inst_intervention_recommendations";
    const yearId = "2026";
    const firstStudentId = "student_intervention_first";
    const secondStudentId = "student_intervention_second";
    const authorityPath =
      `interventionRecommendations/${yearId}/institutes/${instituteId}`;
    const actionsPath = `${authorityPath}/actions`;
    const commandsPath = `${authorityPath}/commands`;
    const auditsPath = `institutes/${instituteId}/auditLogs`;
    const sourceUpdatedAt = Timestamp.fromDate(
      new Date("2026-09-18T06:00:00.000Z"),
    );
    let nowMillis = Date.parse("2026-09-18T07:00:00.000Z");
    const service = new InterventionRecommendationService({
      firestore,
      now: () => Timestamp.fromMillis(nowMillis += 1_000),
    });

    await Promise.all([
      deleteCollection(actionsPath),
      deleteCollection(commandsPath),
      deleteCollection(auditsPath),
    ]);
    await firestore.doc(`institutes/${instituteId}`).set({instituteId});
    await firestore.doc(
      `institutes/${instituteId}/academicYears/${yearId}`,
    ).set({status: "active", yearId});
    for (const [studentId, name, riskCluster] of [
      [firstStudentId, "First Student", "critical"],
      [secondStudentId, "Second Student", "high"],
    ]) {
      await firestore.doc(
        `institutes/${instituteId}/students/${studentId}`,
      ).set({name, studentId});
      await firestore.doc(
        `institutes/${instituteId}/academicYears/${yearId}/` +
        `studentYearMetrics/${studentId}`,
      ).set({
        lastUpdated: sourceUpdatedAt,
        rollingRiskCluster: riskCluster,
        studentId,
      });
    }

    const createRequest = {
      actorId: "teacher_intervention",
      actorRole: "teacher",
      idempotencyKey: "recommendation-create-first",
      instituteId,
      recommendationType: "remedial_test" as const,
      recommendedTestId: "test_remedial_discipline",
      sourceMetricsUpdatedAt: sourceUpdatedAt.toDate().toISOString(),
      studentId: firstStudentId,
      yearId,
    };
    const concurrentCreates = await Promise.all([
      service.createRecommendation(createRequest),
      service.createRecommendation(createRequest),
    ]);
    assert.deepEqual(
      new Set(concurrentCreates.map((result) => result.disposition)),
      new Set(["applied", "replayed"]),
    );
    const created = concurrentCreates[0].recommendation;
    assert.equal(created.advisoryOnly, true);
    assert.equal(created.status, "pending");
    assert.equal(created.revision, 1);
    assert.equal(created.recommendedTestId, "test_remedial_discipline");
    assert.equal(created.messageDraft, null);
    assert.equal(created.sourceMetricsUpdatedAt, sourceUpdatedAt.toDate()
      .toISOString());
    assert.deepEqual(
      concurrentCreates[0].recommendation,
      concurrentCreates[1].recommendation,
    );

    const replay = await service.createRecommendation(createRequest);
    assert.equal(replay.disposition, "replayed");
    assert.deepEqual(replay.recommendation, created);
    await assert.rejects(
      service.createRecommendation({
        ...createRequest,
        recommendedTestId: "test_conflicting_semantics",
      }),
      (error: unknown) => assertCode(error, "CONFLICT"),
    );
    await assert.rejects(
      service.createRecommendation({
        ...createRequest,
        idempotencyKey: "stale-source-create",
        sourceMetricsUpdatedAt: "2026-09-18T05:59:59.000Z",
      }),
      (error: unknown) => assertCode(error, "CONFLICT"),
    );

    const outcomeRequest = {
      actorId: "admin_intervention",
      actorRole: "admin",
      expectedRevision: 1,
      idempotencyKey: "recommendation-outcome-first",
      instituteId,
      interventionId: created.interventionId,
      outcomeNotes: "Student performance is improving after review.",
      status: "improving" as const,
    };
    const concurrentOutcomes = await Promise.all([
      service.updateOutcome(outcomeRequest),
      service.updateOutcome(outcomeRequest),
    ]);
    assert.deepEqual(
      new Set(concurrentOutcomes.map((result) => result.disposition)),
      new Set(["applied", "replayed"]),
    );
    assert.equal(concurrentOutcomes[0].recommendation.revision, 2);
    assert.equal(concurrentOutcomes[0].recommendation.status, "improving");
    assert.deepEqual(
      concurrentOutcomes[0].recommendation,
      concurrentOutcomes[1].recommendation,
    );
    await assert.rejects(
      service.updateOutcome({...outcomeRequest, status: "resolved"}),
      (error: unknown) => assertCode(error, "CONFLICT"),
    );
    await assert.rejects(
      service.updateOutcome({
        ...outcomeRequest,
        idempotencyKey: "stale-revision-outcome",
      }),
      (error: unknown) => assertCode(error, "CONFLICT"),
    );

    const laterOutcome = await service.updateOutcome({
      ...outcomeRequest,
      expectedRevision: 2,
      idempotencyKey: "recommendation-outcome-second",
      outcomeNotes: "Advisory review is complete.",
      status: "resolved",
    });
    assert.equal(laterOutcome.disposition, "applied");
    assert.equal(laterOutcome.recommendation.revision, 3);
    const historicalReplay = await service.updateOutcome(outcomeRequest);
    assert.equal(historicalReplay.disposition, "replayed");
    assert.equal(historicalReplay.recommendation.revision, 2);
    assert.equal(historicalReplay.recommendation.status, "improving");

    const secondFirstStudent = await service.createRecommendation({
      ...createRequest,
      idempotencyKey: "recommendation-create-first-message",
      messageDraft: "Please review the recommended study plan.",
      recommendationType: "student_message",
      recommendedTestId: undefined,
    });
    await service.createRecommendation({
      ...createRequest,
      idempotencyKey: "recommendation-create-second-student",
      studentId: secondStudentId,
    });
    await service.createRecommendation({
      ...createRequest,
      idempotencyKey: "recommendation-create-second-student-message",
      messageDraft: "Please schedule a teacher review.",
      recommendationType: "student_message",
      recommendedTestId: undefined,
      studentId: secondStudentId,
    });

    const firstPage = await service.listTimeline({
      actorId: "director_intervention",
      actorRole: "director",
      instituteId,
      limit: 1,
      studentId: firstStudentId,
      yearId,
    });
    assert.equal(firstPage.recommendations.length, 1);
    assert.equal(firstPage.recommendations[0].studentId, firstStudentId);
    assert.equal(
      firstPage.recommendations[0].interventionId,
      secondFirstStudent.recommendation.interventionId,
    );
    assert.equal(typeof firstPage.nextCursor, "string");
    const secondPage = await service.listTimeline({
      actorId: "director_intervention",
      actorRole: "director",
      cursor: firstPage.nextCursor ?? undefined,
      instituteId,
      limit: 1,
      studentId: firstStudentId,
      yearId,
    });
    assert.equal(secondPage.recommendations.length, 1);
    assert.equal(secondPage.recommendations[0].interventionId, created.interventionId);
    assert.equal(secondPage.nextCursor, null);
    await assert.rejects(
      service.listTimeline({
        actorId: "director_intervention",
        actorRole: "director",
        cursor: firstPage.nextCursor ?? undefined,
        instituteId,
        limit: 1,
        studentId: secondStudentId,
        yearId,
      }),
      (error: unknown) => assertCode(error, "VALIDATION_ERROR"),
    );
    await assert.rejects(
      service.listTimeline({
        actorId: "vendor_intervention",
        actorRole: "vendor",
        instituteId,
        yearId,
      }),
      (error: unknown) => assertCode(error, "FORBIDDEN"),
    );

    const [actions, commands, audits] = await Promise.all([
      firestore.collection(actionsPath).get(),
      firestore.collection(commandsPath).get(),
      firestore.collection(auditsPath).get(),
    ]);
    assert.equal(actions.size, 4);
    assert.equal(commands.size, 6);
    assert.equal(audits.size, 6);
    assert.equal(
      actions.docs.every((document) => {
        const data = document.data();
        return data.advisoryOnly === true && data.schemaVersion === 2 &&
          !("assignedRunId" in data) && !("delivered" in data);
      }),
      true,
    );
    assert.deepEqual(
      new Set(audits.docs.map((document) => document.data().actionType)),
      new Set([
        "CREATE_INTERVENTION_RECOMMENDATION",
        "UPDATE_INTERVENTION_OUTCOME",
      ]),
    );
    assert.equal(
      audits.docs.every((document) =>
        document.data().entityType === "interventionRecommendation" &&
        document.data().metadata?.advisoryOnly === true),
      true,
    );

    await Promise.all([
      deleteCollection(actionsPath),
      deleteCollection(commandsPath),
      deleteCollection(auditsPath),
    ]);
    await Promise.all([firstStudentId, secondStudentId].flatMap((studentId) => [
      firestore.doc(`institutes/${instituteId}/students/${studentId}`).delete(),
      firestore.doc(
        `institutes/${instituteId}/academicYears/${yearId}/` +
        `studentYearMetrics/${studentId}`,
      ).delete(),
    ]));
    await firestore.doc(
      `institutes/${instituteId}/academicYears/${yearId}`,
    ).delete();
    await firestore.doc(`institutes/${instituteId}`).delete();
  },
);
