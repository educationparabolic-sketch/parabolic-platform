import assert from "node:assert/strict";
import test from "node:test";
import {
  QuestionAssetUploadService,
} from "../services/questionAssetUpload";

const TEST_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAA" +
  "AAC0lEQVR42mP8/x8AAwMCAO+jmV0AAAAASUVORK5CYII=";
const TEST_PDF_BASE64 = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n")
  .toString("base64");

test("uploadAsset stores managed question image metadata", async () => {
  const uploads: Array<{
    content: Buffer;
    metadata: Record<string, string>;
    target: {
      bucketName: string;
      cdnPath: string;
      contentType: string;
      objectPath: string;
    };
  }> = [];
  const service = new QuestionAssetUploadService({
    generatePreviewUrl: () => ({
      accessContext: "dashboardView",
      cdnPath: "inst_build_m4/questions/q-asset-1/v2/question.png",
      expiresAt: "2026-05-03T00:00:00.000Z",
      expiresInSeconds: 1800,
      signedUrl:
        "https://cdn.yourdomain.com/inst_build_m4/questions/" +
        "q-asset-1/v2/question.png?Expires=1",
    }),
    resolveStorageTarget: () => ({
      bucketKey: "questionAssets",
      bucketName: "parabolic-prod-question-assets",
      cdnBaseUrl: "https://cdn.yourdomain.com",
      cdnPath: "inst_build_m4/questions/q-asset-1/v2/question.png",
      contentType: "image/png",
      directoryPath: "inst_build_m4/questions/q-asset-1/v2",
      gsUri:
        "gs://parabolic-prod-question-assets/" +
        "inst_build_m4/questions/q-asset-1/v2/question.png",
      objectPath: "inst_build_m4/questions/q-asset-1/v2/question.png",
      requiresSignedUrl: true,
    }),
    uploadAssetFile: async (target, content, metadata): Promise<void> => {
      uploads.push({content, metadata, target});
    },
  });

  const result = await service.uploadAsset({
    actorId: "admin_build_m4",
    actorLicenseLayer: "L2",
    actorRole: "admin",
    assetKind: "questionImage",
    contentBase64: TEST_PNG_BASE64,
    extension: "png",
    instituteId: "inst_build_m4",
    questionId: "q-asset-1",
    version: 2,
  });

  assert.equal(result.uploaded, true);
  assert.equal(result.bucketName, "parabolic-prod-question-assets");
  assert.equal(
    result.objectPath,
    "inst_build_m4/questions/q-asset-1/v2/question.png",
  );
  assert.equal(uploads.length, 1);
  assert.equal(
    uploads[0]?.target.objectPath,
    "inst_build_m4/questions/q-asset-1/v2/question.png",
  );
  assert.equal(uploads[0]?.target.contentType, "image/png");
  assert.equal(uploads[0]?.metadata.assetKind, "questionImage");
  assert.equal(uploads[0]?.metadata.questionId, "q-asset-1");
  assert.ok((uploads[0]?.content.length ?? 0) > 0);
});

test("uploadAsset accepts solution pdf uploads", async () => {
  const service = new QuestionAssetUploadService({
    generatePreviewUrl: () => ({
      accessContext: "dashboardView",
      cdnPath: "inst_build_m4/questions/q-asset-2/v1/solution.pdf",
      expiresAt: "2026-05-03T00:00:00.000Z",
      expiresInSeconds: 1800,
      signedUrl:
        "https://cdn.yourdomain.com/inst_build_m4/questions/" +
        "q-asset-2/v1/solution.pdf?Expires=1",
    }),
    resolveStorageTarget: () => ({
      bucketKey: "questionAssets",
      bucketName: "parabolic-prod-question-assets",
      cdnBaseUrl: "https://cdn.yourdomain.com",
      cdnPath: "inst_build_m4/questions/q-asset-2/v1/solution.pdf",
      contentType: "application/pdf",
      directoryPath: "inst_build_m4/questions/q-asset-2/v1",
      gsUri:
        "gs://parabolic-prod-question-assets/" +
        "inst_build_m4/questions/q-asset-2/v1/solution.pdf",
      objectPath: "inst_build_m4/questions/q-asset-2/v1/solution.pdf",
      requiresSignedUrl: true,
    }),
    uploadAssetFile: async (): Promise<void> => undefined,
  });

  const result = await service.uploadAsset({
    actorId: "admin_build_m4",
    actorLicenseLayer: "L2",
    actorRole: "admin",
    assetKind: "solutionPdf",
    contentBase64: TEST_PDF_BASE64,
    extension: "pdf",
    instituteId: "inst_build_m4",
    questionId: "q-asset-2",
    version: 1,
  });

  assert.equal(result.assetKind, "solutionPdf");
  assert.equal(
    result.cdnPath,
    "inst_build_m4/questions/q-asset-2/v1/solution.pdf",
  );
});

test("uploadAsset rejects mismatched binary content", async () => {
  const service = new QuestionAssetUploadService({
    generatePreviewUrl: () => {
      throw new Error("generatePreviewUrl should not be called");
    },
    resolveStorageTarget: () => {
      throw new Error("resolveStorageTarget should not be called");
    },
    uploadAssetFile: async (): Promise<void> => {
      throw new Error("uploadAssetFile should not be called");
    },
  });

  await assert.rejects(
    service.uploadAsset({
      actorId: "admin_build_m4",
      actorLicenseLayer: "L2",
      actorRole: "admin",
      assetKind: "questionImage",
      contentBase64: TEST_PDF_BASE64,
      extension: "png",
      instituteId: "inst_build_m4",
      questionId: "q-asset-3",
      version: 1,
    }),
    /does not match the ".png" extension/i,
  );
});
