import assert from "node:assert/strict";
import test from "node:test";
import {
  createAdminQuestionAssetsHandler,
} from "../api/adminQuestionAssets";
import {
  QuestionAssetUploadValidationError,
} from "../types/questionAssetUpload";
import {
  createMockRequest,
  createMockResponse,
} from "./helpers/http";

const createAdminToken = (overrides: Record<string, unknown> = {}) => ({
  instituteId: "inst_build_m4_api",
  licenseLayer: "L2",
  role: "admin",
  uid: "admin_build_m4",
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

test("admin question assets handler accepts upload requests", async () => {
  const handler = createAdminQuestionAssetsHandler({
    uploadAsset: async () => ({
      assetKind: "questionImage",
      bucketName: "parabolic-prod-question-assets",
      cdnPath: "inst_build_m4_api/questions/q-001/v1/question.png",
      contentType: "image/png",
      objectPath: "inst_build_m4_api/questions/q-001/v1/question.png",
      previewSignedUrl: "https://cdn.yourdomain.com/inst_build_m4_api/questions/q-001/v1/question.png?Expires=1",
      questionId: "q-001",
      uploaded: true,
      version: 1,
    }),
    verifyIdToken: async () => createAdminToken() as never,
  });

  const request = createMockRequest({
    body: {
      assetKind: "questionImage",
      contentBase64: Buffer.from("png").toString("base64"),
      instituteId: "inst_build_m4_api",
      questionId: "q-001",
      version: 1,
    },
    headers: {
      authorization: "Bearer build_m4_asset",
    },
    path: "/admin/questions/assets",
  });
  const response = createMockResponse();

  await handler(request as never, response as never);

  assert.equal(response.statusCode, 200);
  assert.equal((response.body as {code: string}).code, "OK");
  assert.equal((response.body as {success: boolean}).success, true);
});

test("admin question assets handler rejects non-admin role", async () => {
  const handler = createAdminQuestionAssetsHandler({
    uploadAsset: async () => {
      throw new Error("uploadAsset should not be called");
    },
    verifyIdToken: async () => createAdminToken({role: "teacher"}) as never,
  });
  const response = createMockResponse();

  await handler(
    createMockRequest({
      body: {
        assetKind: "questionImage",
        contentBase64: Buffer.from("png").toString("base64"),
        instituteId: "inst_build_m4_api",
        questionId: "q-001",
        version: 1,
      },
      headers: {
        authorization: "Bearer build_m4_teacher",
      },
      path: "/admin/questions/assets",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 403);
  assertStructuredError(
    response.body,
    "FORBIDDEN",
    "Only admin roles can upload question assets.",
  );
});

test("admin question assets handler maps validation errors", async () => {
  const handler = createAdminQuestionAssetsHandler({
    uploadAsset: async () => {
      throw new QuestionAssetUploadValidationError(
        "VALIDATION_ERROR",
        "Uploaded file content does not match the \".png\" extension.",
      );
    },
    verifyIdToken: async () => createAdminToken() as never,
  });
  const response = createMockResponse();

  await handler(
    createMockRequest({
      body: {
        assetKind: "questionImage",
        contentBase64: Buffer.from("not-png").toString("base64"),
        instituteId: "inst_build_m4_api",
        questionId: "q-001",
        version: 1,
      },
      headers: {
        authorization: "Bearer build_m4_invalid",
      },
      path: "/admin/questions/assets",
    }) as never,
    response as never,
  );

  assert.equal(response.statusCode, 400);
  assertStructuredError(
    response.body,
    "VALIDATION_ERROR",
    "Uploaded file content does not match the \".png\" extension.",
  );
});
