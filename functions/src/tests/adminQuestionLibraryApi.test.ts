import assert from "node:assert/strict";
import test from "node:test";
import {
  createAdminQuestionLibraryHandler,
} from "../api/adminQuestionLibrary";
import {
  AdminQuestionLibraryValidationError,
} from "../types/adminQuestionLibrary";
import {
  createMockRequest,
  createMockResponse,
} from "./helpers/http";

const createAdminToken = (overrides: Record<string, unknown> = {}) => ({
  instituteId: "inst_build_m5_api",
  licenseLayer: "L2",
  role: "admin",
  uid: "admin_build_m5",
  ...overrides,
});

const assertStructuredError = (
  responseBody: unknown,
  expectedCode: string,
  expectedMessage: string,
): void => {
  const errorResponse = responseBody as {
    error: {
      code: string;
      message: string;
    };
    success: boolean;
  };

  assert.equal(errorResponse.error.code, expectedCode);
  assert.equal(errorResponse.error.message, expectedMessage);
  assert.equal(errorResponse.success, false);
};

test("admin question library handler accepts read requests", async () => {
  const handler = createAdminQuestionLibraryHandler({
    getLibrary: async (request) => {
      assert.equal(request.instituteId, "inst_build_m5_api");
      assert.equal(request.limit, 12);

      return {
        currentAcademicYear: "2026-27",
        nextCursor: null,
        questions: [
          {
            academicYear: "2026-27",
            additionalTag: "jee-main",
            chapter: "Kinematics",
            correctAnswer: "B",
            difficulty: "easy",
            examType: "JEEMains",
            id: "q-101",
            internalNotes: "Review after next mock test.",
            createdAt: "2026-05-10T00:00:00.000Z",
            lastUsedAcademicYear: "2026-27",
            lastUsedDate: "2026-05-10",
            marks: 4,
            negativeMarks: 1,
            primaryTag: "motion",
            parentQuestionId: null,
            prompt: "Physics Kinematics MCQ",
            questionImageFile:
              "inst_build_m5_api/questions/q-101/v2/question.png",
            questionImagePreviewUrl:
              "https://cdn.example.test/inst_build_m5_api/questions/" +
              "q-101/v2/question.png" +
              "?Expires=1&KeyName=test-key&Signature=test-signature",
            questionType: "MCQ",
            revision: 2,
            secondaryTag: "basics",
            simulationLink: "https://sim.example.com/motion",
            solutionImageFile:
              "inst_build_m5_api/questions/q-101/v2/solution.png",
            solutionImagePreviewUrl:
              "https://cdn.example.test/inst_build_m5_api/questions/" +
              "q-101/v2/solution.png" +
              "?Expires=1&KeyName=test-key&Signature=test-signature",
            status: "active",
            subject: "Physics",
            thermalState: "hot",
            topic: "Uniform acceleration",
            uniqueKey: "PH-KIN-001",
            updatedAt: "2026-05-10T00:00:00.000Z",
            tutorialVideoLink: "https://learning.example.com/motion",
            usedCount: 3,
            usedInTemplate: true,
            version: 2,
          },
        ],
      };
    },
    getQuestionDetail: async () => {
      throw new Error("getQuestionDetail should not be called");
    },
    verifyIdToken: async () => createAdminToken() as never,
  });

  const response = createMockResponse();

  await handler(
    createMockRequest({
      headers: {
        authorization: "Bearer build_m5_library",
      },
      method: "GET",
      path: "/admin/questions/library",
      query: {
        limit: "12",
      },
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 200);
  assert.equal((response.body as {code: string}).code, "OK");
  assert.equal((response.body as {success: boolean}).success, true);
});

test("admin question library handler rejects disallowed roles", async () => {
  const handler = createAdminQuestionLibraryHandler({
    getQuestionDetail: async () => {
      throw new Error("getQuestionDetail should not be called");
    },
    getLibrary: async () => {
      throw new Error("getLibrary should not be called");
    },
    verifyIdToken: async () => createAdminToken({role: "student"}) as never,
  });
  const response = createMockResponse();

  await handler(
    createMockRequest({
      headers: {
        authorization: "Bearer build_m5_teacher",
      },
      method: "GET",
      path: "/admin/questions/library",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 403);
  assertStructuredError(
    response.body,
    "FORBIDDEN",
    "Only teacher and admin roles can access question library records.",
  );
});

test("admin question library handler maps validation errors", async () => {
  const handler = createAdminQuestionLibraryHandler({
    getQuestionDetail: async () => {
      throw new Error("getQuestionDetail should not be called");
    },
    getLibrary: async () => {
      throw new AdminQuestionLibraryValidationError(
        "VALIDATION_ERROR",
        "Field \"limit\" must be a positive integer.",
      );
    },
    verifyIdToken: async () => createAdminToken() as never,
  });
  const response = createMockResponse();

  await handler(
    createMockRequest({
      headers: {
        authorization: "Bearer build_m5_invalid",
      },
      method: "GET",
      path: "/admin/questions/library",
      query: {
        limit: "nope",
      },
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 400);
  assertStructuredError(
    response.body,
    "VALIDATION_ERROR",
    "Field \"limit\" must be an integer between 1 and 100.",
  );
});

test("admin question library handler dispatches authoritative detail", async () => {
  const handler = createAdminQuestionLibraryHandler({
    getLibrary: async () => {
      throw new Error("getLibrary should not be called");
    },
    getQuestionDetail: async (request) => {
      assert.equal(request.instituteId, "inst_build_m5_api");
      assert.equal(request.questionId, "q-101");
      return {
        analytics: null,
        question: {} as never,
        templateUsage: [],
        versions: [],
      };
    },
    verifyIdToken: async () => createAdminToken() as never,
  });
  const response = createMockResponse();
  await handler(createMockRequest({
    headers: {authorization: "Bearer build_m5_detail"},
    method: "GET",
    params: {questionId: "q-101"},
    path: "/admin/questions/library/q-101",
  }) as never, response as never);
  assert.equal(response.statusCode, 200);
  assert.equal((response.body as {data: {analytics: null}}).data.analytics, null);
});
