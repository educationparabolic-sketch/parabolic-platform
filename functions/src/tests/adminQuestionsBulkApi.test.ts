import assert from "node:assert/strict";
import test from "node:test";
import {
  createAdminQuestionsBulkHandler,
} from "../api/adminQuestionsBulk";
import {
  QuestionBulkUploadValidationError,
} from "../types/questionBulkUpload";
import {
  createMockRequest,
  createMockResponse,
} from "./helpers/http";

const createAdminToken = (overrides: Record<string, unknown> = {}) => ({
  instituteId: "inst_build_m3_api",
  licenseLayer: "L2",
  role: "admin",
  uid: "admin_build_m3",
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

test("admin questions bulk handler accepts a validate-only request", async () => {
  const handler = createAdminQuestionsBulkHandler({
    ingestQuestions: async () => ({
      commitRequested: false,
      committed: false,
      rows: [
        {
          action: "create",
          errors: [],
          questionId: "phy-motion-001-v1",
          rowNumber: 1,
          uniqueKey: "PHY-MOTION-001",
          warnings: [
            "questionId was derived from uniqueKey and version.",
          ],
        },
      ],
      summary: {
        created: 0,
        invalid: 0,
        received: 1,
        updated: 0,
        valid: 1,
        warnings: 1,
      },
      uploadLogId: null,
      uploadLogPath: null,
    }),
    verifyIdToken: async () => createAdminToken() as never,
  });

  const request = createMockRequest({
    body: {
      instituteId: "inst_build_m3_api",
      questions: [
        {
          chapter: "Motion Laws",
          correctAnswer: "B",
          difficulty: "Medium",
          examType: "JEE",
          marks: 4,
          negativeMarks: 1,
          questionType: "MCQ",
          subject: "Physics",
          uniqueKey: "PHY-MOTION-001",
        },
      ],
    },
    headers: {
      authorization: "Bearer build_m3_token",
    },
    path: "/admin/questions/bulk",
  });
  const response = createMockResponse();

  await handler(request as never, response as never);

  assert.equal(response.statusCode, 200);
  assert.equal((response.body as {code: string}).code, "OK");
  assert.equal((response.body as {success: boolean}).success, true);
});

test("admin questions bulk handler rejects non-admin role", async () => {
  const handler = createAdminQuestionsBulkHandler({
    ingestQuestions: async () => {
      throw new Error("ingestQuestions should not be called");
    },
    verifyIdToken: async () =>
      createAdminToken({role: "teacher"}) as never,
  });
  const response = createMockResponse();

  await handler(
    createMockRequest({
      body: {
        instituteId: "inst_build_m3_api",
        questions: [
          {
            chapter: "Motion Laws",
            correctAnswer: "B",
            difficulty: "Medium",
            examType: "JEE",
            marks: 4,
            negativeMarks: 1,
            questionType: "MCQ",
            subject: "Physics",
            uniqueKey: "PHY-MOTION-001",
          },
        ],
      },
      headers: {
        authorization: "Bearer build_m3_teacher",
      },
      path: "/admin/questions/bulk",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 403);
  assertStructuredError(
    response.body,
    "FORBIDDEN",
    "Only admin roles can run question bulk upload.",
  );
});

test("admin questions bulk handler maps validation errors", async () => {
  const handler = createAdminQuestionsBulkHandler({
    ingestQuestions: async () => {
      throw new QuestionBulkUploadValidationError(
        "VALIDATION_ERROR",
        "Duplicate uniqueKey within upload.",
      );
    },
    verifyIdToken: async () => createAdminToken() as never,
  });
  const request = createMockRequest({
    body: {
      instituteId: "inst_build_m3_api",
      questions: [
        {
          chapter: "Motion Laws",
          correctAnswer: "B",
          difficulty: "Medium",
          examType: "JEE",
          marks: 4,
          negativeMarks: 1,
          questionType: "MCQ",
          subject: "Physics",
          uniqueKey: "PHY-MOTION-001",
        },
      ],
    },
    headers: {
      authorization: "Bearer build_m3_duplicate",
    },
    path: "/admin/questions/bulk",
  });
  const response = createMockResponse();

  await handler(request as never, response as never);

  assert.equal(response.statusCode, 400);
  assertStructuredError(
    response.body,
    "VALIDATION_ERROR",
    "Duplicate uniqueKey within upload.",
  );
});
