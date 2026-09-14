import assert from "node:assert/strict";
import test from "node:test";
import {createAdminQuestionMutationsHandler} from
  "../api/adminQuestionMutations";
import {createMockRequest, createMockResponse} from "./helpers/http";

const token = (overrides: Record<string, unknown> = {}) => ({
  instituteId: "inst_bwm_027_mutation_api",
  licenseLayer: "L1",
  role: "teacher",
  uid: "teacher_bwm_027_mutation_api",
  ...overrides,
});

const metadataBody = {
  additionalTag: "Mechanics",
  expectedRevision: 1,
  idempotencyKey: "metadata-api-command",
  internalNotes: "Reviewed",
  primaryTag: "Kinematics",
  secondaryTag: "Velocity",
  simulationLink: null,
  solutionImage: {action: "retain"},
  topic: "Motion",
  tutorialVideoLink: null,
};

function result(questionId: string) {
  return {
    auditId: "audit-question-mutation",
    disposition: "applied" as const,
    questionId,
    revision: 2,
    updatedAt: "2026-09-13T00:00:00.000Z",
    version: 1,
  };
}

function errorCode(body: unknown): string {
  return (body as {error: {code: string}}).error.code;
}

test("question mutation handler dispatches path-bound commands with identity authority", async () => {
  const calls: string[] = [];
  const handler = createAdminQuestionMutationsHandler({
    createVersion: async (request) => {
      calls.push(`version:${request.instituteId}:${request.questionId}`);
      return {
        auditId: "audit-version",
        disposition: "applied",
        sourceQuestionId: request.questionId,
        sourceRevision: 2,
        sourceStatus: "deprecated",
        sourceVersion: 1,
        successorQuestionId: "question-v2",
        successorRevision: 1,
        successorStatus: "active",
        successorVersion: 2,
        updatedAt: "2026-09-13T00:00:00.000Z",
      };
    },
    updateLifecycle: async (request) => {
      calls.push(`lifecycle:${request.instituteId}:${request.questionId}`);
      return {
        action: request.action,
        auditId: "audit-lifecycle",
        disposition: "applied",
        previousStatus: "active",
        questionId: request.questionId,
        revision: 2,
        status: request.action === "archive" ? "archived" : "deprecated",
        thermalState: "cold",
        updatedAt: "2026-09-13T00:00:00.000Z",
        version: 1,
      };
    },
    updateMetadata: async (request) => {
      assert.equal(request.actorId, "teacher_bwm_027_mutation_api");
      assert.equal(request.actorRole, "teacher");
      calls.push(`metadata:${request.instituteId}:${request.questionId}`);
      return result(request.questionId);
    },
    updateStructure: async (request) => {
      calls.push(`structure:${request.instituteId}:${request.questionId}`);
      return result(request.questionId);
    },
    verifyIdToken: async () => token() as never,
  });

  const requests = [
    {body: metadataBody, method: "PATCH", path: "/api/v1/admin/questions/question-v1/metadata"},
    {
      body: {
        academicYear: "2026-2027", chapter: "Motion", correctAnswer: "A",
        difficulty: "Medium", examType: "JEEMains", expectedRevision: 1,
        idempotencyKey: "structure-api-command", marks: 4, negativeMarks: 1,
        questionImage: {action: "retain"}, questionType: "MCQ",
        subject: "Physics", uniqueKey: "QUESTION-v1",
      },
      method: "PATCH",
      path: "/api/v1/admin/questions/question-v1/structure",
    },
    {
      body: {expectedRevision: 1, idempotencyKey: "version-api-command"},
      method: "POST",
      path: "/api/v1/admin/questions/question-v1/versions",
    },
    {
      body: {
        action: "archive", expectedRevision: 1,
        idempotencyKey: "lifecycle-api-command", reason: "Cold retention",
      },
      method: "POST",
      path: "/api/v1/admin/questions/question-v1/lifecycle",
    },
  ];
  for (const request of requests) {
    const response = createMockResponse();
    await handler(createMockRequest({
      ...request,
      headers: {authorization: "Bearer mutation-api"},
      params: {questionId: "question-v1"},
    }) as never, response as never);
    assert.equal(response.statusCode, 200);
    assert.equal((response.body as {success: boolean}).success, true);
  }
  assert.deepEqual(calls, [
    "metadata:inst_bwm_027_mutation_api:question-v1",
    "structure:inst_bwm_027_mutation_api:question-v1",
    "version:inst_bwm_027_mutation_api:question-v1",
    "lifecycle:inst_bwm_027_mutation_api:question-v1",
  ]);
});

test("question mutation handler rejects role, tenant, license, and suspension boundaries", async () => {
  let serviceCalled = false;
  const scenarios = [
    {expected: "FORBIDDEN", override: {role: "student"}},
    {expected: "TENANT_MISMATCH", override: {instituteId: undefined}},
    {expected: "UNAUTHORIZED", override: {licenseLayer: undefined}},
    {expected: "FORBIDDEN", override: {isSuspended: true}},
  ];
  for (const scenario of scenarios) {
    const handler = createAdminQuestionMutationsHandler({
      createVersion: async () => {
        serviceCalled = true;
        throw new Error("unexpected");
      },
      updateLifecycle: async () => {
        serviceCalled = true;
        throw new Error("unexpected");
      },
      updateMetadata: async () => {
        serviceCalled = true;
        throw new Error("unexpected");
      },
      updateStructure: async () => {
        serviceCalled = true;
        throw new Error("unexpected");
      },
      verifyIdToken: async () => token(scenario.override) as never,
    });
    const response = createMockResponse();
    await handler(createMockRequest({
      body: metadataBody,
      headers: {authorization: "Bearer rejected-mutation"},
      method: "PATCH",
      params: {questionId: "question-v1"},
      path: "/api/v1/admin/questions/question-v1/metadata",
    }) as never, response as never);
    assert.equal(errorCode(response.body), scenario.expected);
  }
  assert.equal(serviceCalled, false);
});
