import assert from "node:assert/strict";
import test from "node:test";
import {createAdminTestsHandler} from "../api/adminTests";
import {
  AdminTestsValidationError,
  AdminTestTemplateRecord,
} from "../types/adminTests";
import {createMockRequest, createMockResponse} from "./helpers/http";

const template: AdminTestTemplateRecord = {
  canonicalId: "canonical-admin-tests-api",
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
  id: "server-template-id",
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
  selectedQuestionIds: ["q-easy", "q-medium", "q-hard"],
  selectionMethod: "upload_set",
  status: "draft",
  templateName: "API template",
  timingProfile: {
    easy: {maxSeconds: 60, minSeconds: 30, recommendedSeconds: 45},
    hard: {maxSeconds: 210, minSeconds: 150, recommendedSeconds: 180},
    medium: {maxSeconds: 150, minSeconds: 60, recommendedSeconds: 105},
  },
  totalDurationMinutes: 180,
  totalRuns: 0,
  updatedAt: "2026-08-23T00:00:00.000Z",
  version: 1,
};

const createAdminToken = () => ({
  instituteId: "inst-admin-tests-api",
  licenseLayer: "L2",
  role: "admin",
  uid: "admin-tests-api",
});

test("admin tests handler wraps authoritative list results", async () => {
  const handler = createAdminTestsHandler({
    archiveTemplate: async () => {
      throw new Error("archiveTemplate should not be called");
    },
    createTemplate: async () => {
      throw new Error("createTemplate should not be called");
    },
    listTemplates: async (request) => {
      assert.equal(request.instituteId, "inst-admin-tests-api");
      assert.equal(request.limit, 12);
      return [template];
    },
    publishTemplate: async () => {
      throw new Error("publishTemplate should not be called");
    },
    updateTemplate: async () => {
      throw new Error("updateTemplate should not be called");
    },
    verifyIdToken: async () => createAdminToken() as never,
  });
  const response = createMockResponse();

  await handler(createMockRequest({
    headers: {authorization: "Bearer admin-tests-list"},
    method: "GET",
    path: "/admin/tests",
    query: {limit: "12"},
  }) as never, response as never);

  assert.equal(response.statusCode, 200);
  assert.deepEqual((response.body as {data: unknown}).data, [template]);
  assert.equal((response.body as {code: string}).code, "OK");
  assert.equal((response.body as {success: boolean}).success, true);
});

test("admin tests handler accepts upload-set create and returns authority", async () => {
  const handler = createAdminTestsHandler({
    archiveTemplate: async () => {
      throw new Error("archiveTemplate should not be called");
    },
    createTemplate: async (request) => {
      assert.equal(request.actorId, "admin-tests-api");
      assert.equal(request.instituteId, "inst-admin-tests-api");
      assert.equal(request.selectionMethod, "upload_set");
      assert.equal(request.timingProfile.easy.recommendedSeconds, 45);
      return {template};
    },
    listTemplates: async () => {
      throw new Error("listTemplates should not be called");
    },
    publishTemplate: async () => {
      throw new Error("publishTemplate should not be called");
    },
    updateTemplate: async () => {
      throw new Error("updateTemplate should not be called");
    },
    verifyIdToken: async () => createAdminToken() as never,
  });
  const response = createMockResponse();

  await handler(createMockRequest({
    body: {
      canonicalId: template.canonicalId,
      difficultyDistribution: template.difficultyDistribution,
      examSnapshot: template.examSnapshot,
      examType: template.examType,
      phaseConfigSnapshot: template.phaseConfigSnapshot,
      questionIds: template.selectedQuestionIds,
      selectionMethod: template.selectionMethod,
      templateName: template.templateName,
      timingProfile: template.timingProfile,
      totalDurationMinutes: template.totalDurationMinutes,
    },
    headers: {authorization: "Bearer admin-tests-create"},
    method: "POST",
    path: "/admin/tests",
  }) as never, response as never);

  assert.equal(response.statusCode, 201);
  assert.deepEqual(
    (response.body as {data: {template: AdminTestTemplateRecord}}).data,
    {template},
  );
  assert.equal((response.body as {code: string}).code, "OK");
  assert.equal((response.body as {success: boolean}).success, true);
});

test("admin tests handler updates with optimistic version authority", async () => {
  const updatedTemplate = {
    ...template,
    templateName: "Updated API template",
    version: 2,
  };
  const handler = createAdminTestsHandler({
    archiveTemplate: async () => {
      throw new Error("archiveTemplate should not be called");
    },
    createTemplate: async () => {
      throw new Error("createTemplate should not be called");
    },
    listTemplates: async () => {
      throw new Error("listTemplates should not be called");
    },
    publishTemplate: async () => {
      throw new Error("publishTemplate should not be called");
    },
    updateTemplate: async (request) => {
      assert.equal(request.actorId, "admin-tests-api");
      assert.equal(request.instituteId, "inst-admin-tests-api");
      assert.equal(request.testId, template.id);
      assert.equal(request.expectedVersion, 1);
      assert.equal(request.templateName, "Updated API template");
      return {template: updatedTemplate};
    },
    verifyIdToken: async () => createAdminToken() as never,
  });
  const response = createMockResponse();

  await handler(createMockRequest({
    body: {
      canonicalId: template.canonicalId,
      difficultyDistribution: template.difficultyDistribution,
      examSnapshot: template.examSnapshot,
      examType: template.examType,
      expectedVersion: 1,
      phaseConfigSnapshot: template.phaseConfigSnapshot,
      questionIds: template.selectedQuestionIds,
      selectionMethod: template.selectionMethod,
      templateName: "Updated API template",
      timingProfile: template.timingProfile,
      totalDurationMinutes: template.totalDurationMinutes,
    },
    headers: {authorization: "Bearer admin-tests-update"},
    method: "PATCH",
    params: {testId: template.id},
    path: `/admin/tests/${template.id}`,
  }) as never, response as never);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(
    (response.body as {data: {template: AdminTestTemplateRecord}}).data,
    {template: updatedTemplate},
  );
});

test("admin tests handler returns HTTP 409 for stale update authority", async () => {
  const handler = createAdminTestsHandler({
    archiveTemplate: async () => {
      throw new Error("archiveTemplate should not be called");
    },
    createTemplate: async () => {
      throw new Error("createTemplate should not be called");
    },
    listTemplates: async () => {
      throw new Error("listTemplates should not be called");
    },
    publishTemplate: async () => {
      throw new Error("publishTemplate should not be called");
    },
    updateTemplate: async () => {
      throw new AdminTestsValidationError(
        "CONFLICT",
        "Template version conflict: expected 1, current version is 2.",
      );
    },
    verifyIdToken: async () => createAdminToken() as never,
  });
  const response = createMockResponse();

  await handler(createMockRequest({
    body: {
      canonicalId: template.canonicalId,
      difficultyDistribution: template.difficultyDistribution,
      examSnapshot: template.examSnapshot,
      examType: template.examType,
      expectedVersion: 1,
      phaseConfigSnapshot: template.phaseConfigSnapshot,
      questionIds: template.selectedQuestionIds,
      selectionMethod: template.selectionMethod,
      templateName: template.templateName,
      timingProfile: template.timingProfile,
      totalDurationMinutes: template.totalDurationMinutes,
    },
    headers: {authorization: "Bearer admin-tests-stale"},
    method: "PATCH",
    params: {testId: template.id},
    path: `/admin/tests/${template.id}`,
  }) as never, response as never);

  assert.equal(response.statusCode, 409);
  assert.equal(
    (response.body as {error: {code: string}}).error.code,
    "CONFLICT",
  );
});

test("admin tests handler publishes with lifecycle audit authority", async () => {
  const publishedTemplate = {...template, status: "ready" as const};
  const handler = createAdminTestsHandler({
    archiveTemplate: async () => {
      throw new Error("archiveTemplate should not be called");
    },
    createTemplate: async () => {
      throw new Error("createTemplate should not be called");
    },
    listTemplates: async () => {
      throw new Error("listTemplates should not be called");
    },
    publishTemplate: async (request) => {
      assert.equal(request.actorId, "admin-tests-api");
      assert.equal(request.instituteId, "inst-admin-tests-api");
      assert.equal(request.testId, template.id);
      assert.equal(request.expectedVersion, 1);
      return {
        auditId: "publish-audit",
        auditPath: "institutes/inst-admin-tests-api/auditLogs/publish-audit",
        template: publishedTemplate,
      };
    },
    updateTemplate: async () => {
      throw new Error("updateTemplate should not be called");
    },
    verifyIdToken: async () => createAdminToken() as never,
  });
  const response = createMockResponse();

  await handler(createMockRequest({
    body: {expectedVersion: 1},
    headers: {authorization: "Bearer admin-tests-publish"},
    method: "POST",
    params: {testId: template.id},
    path: `/admin/tests/${template.id}/publish`,
  }) as never, response as never);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(
    (response.body as {data: unknown}).data,
    {
      auditId: "publish-audit",
      auditPath: "institutes/inst-admin-tests-api/auditLogs/publish-audit",
      template: publishedTemplate,
    },
  );
});

test("admin tests handler archives with lifecycle audit authority", async () => {
  const archivedTemplate = {
    ...template,
    status: "archived" as const,
  };
  const handler = createAdminTestsHandler({
    archiveTemplate: async (request) => {
      assert.equal(request.testId, template.id);
      assert.equal(request.expectedVersion, 1);
      return {
        auditId: "archive-audit",
        auditPath: "institutes/inst-admin-tests-api/auditLogs/archive-audit",
        template: archivedTemplate,
      };
    },
    createTemplate: async () => {
      throw new Error("createTemplate should not be called");
    },
    listTemplates: async () => {
      throw new Error("listTemplates should not be called");
    },
    publishTemplate: async () => {
      throw new Error("publishTemplate should not be called");
    },
    updateTemplate: async () => {
      throw new Error("updateTemplate should not be called");
    },
    verifyIdToken: async () => createAdminToken() as never,
  });
  const response = createMockResponse();

  await handler(createMockRequest({
    body: {expectedVersion: 1},
    headers: {authorization: "Bearer admin-tests-archive"},
    method: "POST",
    params: {testId: template.id},
    path: `/admin/tests/${template.id}/archive`,
  }) as never, response as never);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(
    (response.body as {data: unknown}).data,
    {
      auditId: "archive-audit",
      auditPath: "institutes/inst-admin-tests-api/auditLogs/archive-audit",
      template: archivedTemplate,
    },
  );
});

test("admin tests handler maps illegal lifecycle transitions to HTTP 409", async () => {
  const handler = createAdminTestsHandler({
    archiveTemplate: async () => {
      throw new AdminTestsValidationError(
        "CONFLICT",
        "Cannot archive template from status \"draft\".",
      );
    },
    createTemplate: async () => {
      throw new Error("createTemplate should not be called");
    },
    listTemplates: async () => {
      throw new Error("listTemplates should not be called");
    },
    publishTemplate: async () => {
      throw new Error("publishTemplate should not be called");
    },
    updateTemplate: async () => {
      throw new Error("updateTemplate should not be called");
    },
    verifyIdToken: async () => createAdminToken() as never,
  });
  const response = createMockResponse();

  await handler(createMockRequest({
    body: {expectedVersion: 1},
    headers: {authorization: "Bearer admin-tests-illegal-archive"},
    method: "POST",
    params: {testId: template.id},
    path: `/admin/tests/${template.id}/archive`,
  }) as never, response as never);

  assert.equal(response.statusCode, 409);
  assert.equal(
    (response.body as {error: {code: string}}).error.code,
    "CONFLICT",
  );
});

test("admin tests handler rejects create-as-publish", async () => {
  const handler = createAdminTestsHandler({
    archiveTemplate: async () => {
      throw new Error("archiveTemplate should not be called");
    },
    createTemplate: async () => {
      throw new Error("createTemplate should not be called");
    },
    listTemplates: async () => {
      throw new Error("listTemplates should not be called");
    },
    publishTemplate: async () => {
      throw new Error("publishTemplate should not be called");
    },
    updateTemplate: async () => {
      throw new Error("updateTemplate should not be called");
    },
    verifyIdToken: async () => createAdminToken() as never,
  });
  const response = createMockResponse();

  await handler(createMockRequest({
    body: {publish: true},
    headers: {authorization: "Bearer admin-tests-create-publish"},
    method: "POST",
    path: "/admin/tests",
  }) as never, response as never);

  assert.equal(response.statusCode, 400);
  assert.equal(
    (response.body as {error: {code: string}}).error.code,
    "VALIDATION_ERROR",
  );
  assert.match(
    (response.body as {error: {message: string}}).error.message,
    /distinct publish command/,
  );
});
