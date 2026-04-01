import assert from "node:assert/strict";
import test from "node:test";
import {cdnArchitectureService} from "../services/cdnArchitecture";

test("initializeArchitecture returns deterministic CDN defaults", () => {
  const result = cdnArchitectureService.initializeArchitecture();

  assert.equal(result.cdnBaseUrl, "https://cdn.yourdomain.com");
  assert.equal(
    result.buckets.questionAssets.bucketName,
    "parabolic-prod-question-assets",
  );
  assert.equal(result.buckets.questionAssets.versionedAssetsOnly, true);
  assert.equal(result.buckets.reports.bucketName, "parabolic-prod-reports");
  assert.equal(result.security.directBucketUrlsExposed, false);
  assert.equal(result.examOptimization.preloadNextQuestionImage, true);
  assert.equal(
    result.cachePolicies.hot.cacheControl,
    "public, max-age=86400",
  );
});

test(
  "resolveQuestionAssetLocation creates immutable versioned question paths",
  () => {
    const result = cdnArchitectureService.resolveQuestionAssetLocation({
      assetKind: "questionImage",
      instituteId: "inst_build_71",
      questionId: "q_101",
      version: 3,
    });

    assert.equal(result.bucketKey, "questionAssets");
    assert.equal(
      result.objectPath,
      "inst_build_71/questions/q_101/v3/question.png",
    );
    assert.equal(result.cdnPath, result.objectPath);
    assert.equal(result.requiresSignedUrl, true);
  },
);

test("resolveQuestionAssetLocation supports solution PDF storage", () => {
  const result = cdnArchitectureService.resolveQuestionAssetLocation({
    assetKind: "solutionPdf",
    instituteId: "inst_build_71",
    questionId: "q_202",
    version: 8,
  });

  assert.equal(
    result.objectPath,
    "inst_build_71/questions/q_202/v8/solution.pdf",
  );
});

test(
  "resolveReportAssetLocation creates month-partitioned report paths",
  () => {
    const result = cdnArchitectureService.resolveReportAssetLocation({
      instituteId: "inst_build_71",
      month: 4,
      reportKind: "studentMonthlyStatement",
      studentId: "stu_11",
      year: 2026,
    });

    assert.equal(result.bucketKey, "reports");
    assert.equal(
      result.objectPath,
      "inst_build_71/reports/2026/04/stu_11.pdf",
    );
  },
);

test("assertNoDirectBucketUrlExposure rejects direct storage links", () => {
  assert.throws(
    () =>
      cdnArchitectureService.assertNoDirectBucketUrlExposure(
        "https://storage.googleapis.com/parabolic-prod-question-assets/" +
        "inst/questions/q/v1/question.png",
      ),
    /direct bucket urls must never be exposed/i,
  );

  assert.doesNotThrow(() =>
    cdnArchitectureService.assertNoDirectBucketUrlExposure(
      "https://cdn.yourdomain.com/inst/questions/q/v1/question.png",
    ),
  );
});

test("cdn architecture validation rejects invalid path input", () => {
  assert.throws(
    () =>
      cdnArchitectureService.resolveQuestionAssetLocation({
        assetKind: "questionImage",
        instituteId: "inst_build_71",
        questionId: "bad/id",
        version: 1,
      }),
    /must not contain/i,
  );

  assert.throws(
    () =>
      cdnArchitectureService.resolveReportAssetLocation({
        instituteId: "inst_build_71",
        month: 13,
        reportKind: "analyticsExport",
        year: 2026,
      }),
    /month/i,
  );
});
