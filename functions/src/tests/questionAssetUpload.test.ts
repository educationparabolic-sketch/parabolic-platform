import assert from "node:assert/strict";
import test from "node:test";
import {
  assertQuestionAssetReplayMatches,
  QuestionAssetUploadService,
} from "../services/questionAssetUpload";

const TEST_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAA" +
  "AAC0lEQVR42mP8/x8AAwMCAO+jmV0AAAAASUVORK5CYII=";
const TEST_PDF_BASE64 = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n")
  .toString("base64");

test("uploadAsset stores managed question image metadata", async () => {
  const audits: Array<{auditId?: string; targetId: string}> = [];
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
    createInstituteAuditLog: async (_instituteId, entry) => {
      audits.push({auditId: entry.auditId, targetId: entry.targetId});
      if (audits.length > 1) {
        throw Object.assign(new Error("already exists"), {code: 6});
      }
      return {
        auditId: entry.auditId ?? "missing",
        path: `institutes/inst_build_m4/auditLogs/${entry.auditId}`,
        scope: "institute",
      };
    },
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
    uploadAssetFile: async (target, content, metadata) => {
      uploads.push({content, metadata, target});
      return uploads.length === 1 ? "created" : "replayed";
    },
  });

  const request = {
    actorId: "admin_build_m4",
    actorLicenseLayer: "L2" as const,
    actorRole: "admin",
    assetKind: "questionImage" as const,
    contentBase64: TEST_PNG_BASE64,
    extension: "png" as const,
    instituteId: "inst_build_m4",
    questionId: "q-asset-1",
    version: 2,
  };
  const result = await service.uploadAsset(request);

  assert.equal(result.uploaded, true);
  assert.equal(result.disposition, "created");
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
  assert.match(uploads[0]?.metadata.contentSha256 ?? "", /^[a-f0-9]{64}$/);
  assert.ok((uploads[0]?.content.length ?? 0) > 0);
  assert.equal(audits.length, 1);
  assert.match(audits[0]?.auditId ?? "", /^question_asset_[a-f0-9]{40}$/);
  assert.equal(
    audits[0]?.targetId,
    "inst_build_m4/questions/q-asset-1/v2/question.png",
  );

  const replayResult = await service.uploadAsset(request);
  assert.equal(replayResult.disposition, "replayed");
  assert.equal(uploads.length, 2);
  assert.equal(audits.length, 2);
  assert.equal(audits[1]?.auditId, audits[0]?.auditId);
});

test("uploadAsset accepts solution pdf uploads", async () => {
  const service = new QuestionAssetUploadService({
    createInstituteAuditLog: async (_instituteId, entry) => ({
      auditId: entry.auditId ?? "missing",
      path: `institutes/inst_build_m4/auditLogs/${entry.auditId}`,
      scope: "institute",
    }),
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
    uploadAssetFile: async () => "replayed",
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
  assert.equal(result.disposition, "replayed");
  assert.equal(
    result.cdnPath,
    "inst_build_m4/questions/q-asset-2/v1/solution.pdf",
  );
});

test("uploadAsset rejects mismatched binary content", async () => {
  const service = new QuestionAssetUploadService({
    createInstituteAuditLog: async () => {
      throw new Error("createInstituteAuditLog should not be called");
    },
    generatePreviewUrl: () => {
      throw new Error("generatePreviewUrl should not be called");
    },
    resolveStorageTarget: () => {
      throw new Error("resolveStorageTarget should not be called");
    },
    uploadAssetFile: async () => {
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

test("versioned question assets reject different bytes at an existing path", () => {
  assert.doesNotThrow(() => assertQuestionAssetReplayMatches(
    "same-sha256",
    "same-sha256",
    "inst/questions/q-1/v1/question.png",
  ));
  assert.throws(
    () => assertQuestionAssetReplayMatches(
      "stored-sha256",
      "different-sha256",
      "inst/questions/q-1/v1/question.png",
    ),
    /immutable; create a new question version/i,
  );
});
