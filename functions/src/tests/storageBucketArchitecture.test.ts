import assert from "node:assert/strict";
import test from "node:test";
import {
  storageBucketArchitectureService,
} from "../services/storageBucketArchitecture";

test(
  "initializeArchitecture returns deterministic storage bucket defaults",
  () => {
    const result = storageBucketArchitectureService.initializeArchitecture();

    assert.equal(
      result.buckets.questionAssets.bucketName,
      "parabolic-prod-question-assets",
    );
    assert.equal(
      result.buckets.questionAssets.directoryTemplate,
      "/{instituteId}/questions/{questionId}/v{version}/question.png|" +
        "solution.png|solution.pdf",
    );
    assert.equal(result.buckets.questionAssets.immutableObjects, true);
    assert.equal(result.buckets.reports.bucketName, "parabolic-prod-reports");
    assert.equal(
      result.buckets.reports.directoryTemplate,
      "/{instituteId}/reports/{year}/{month}/{fileName}",
    );
    assert.equal(result.security.publicBucketAccessEnabled, false);
    assert.equal(result.security.uniformBucketLevelAccess, true);
  },
);

test(
  "resolveQuestionAssetStorageTarget returns immutable question metadata",
  () => {
    const result = storageBucketArchitectureService
      .resolveQuestionAssetStorageTarget({
        assetKind: "solutionImage",
        extension: "webp",
        instituteId: "inst_build_72",
        questionId: "q_301",
        version: 4,
      });

    assert.equal(result.bucketKey, "questionAssets");
    assert.equal(
      result.objectPath,
      "inst_build_72/questions/q_301/v4/solution.webp",
    );
    assert.equal(result.directoryPath, "inst_build_72/questions/q_301/v4");
    assert.equal(
      result.gsUri,
      "gs://parabolic-prod-question-assets/" +
        "inst_build_72/questions/q_301/v4/solution.webp",
    );
    assert.equal(result.contentType, "image/webp");
  },
);

test("resolveReportAssetStorageTarget returns report metadata", () => {
  const result =
    storageBucketArchitectureService.resolveReportAssetStorageTarget({
      extension: "csv",
      instituteId: "inst_build_72",
      month: 9,
      reportKind: "analyticsExport",
      year: 2026,
    });

  assert.equal(result.bucketKey, "reports");
  assert.equal(
    result.objectPath,
    "inst_build_72/reports/2026/09/analytics-export.csv",
  );
  assert.equal(result.directoryPath, "inst_build_72/reports/2026/09");
  assert.equal(
    result.gsUri,
    "gs://parabolic-prod-reports/" +
      "inst_build_72/reports/2026/09/analytics-export.csv",
  );
  assert.equal(result.contentType, "text/csv");
});

test("getBucket returns the configured storage bucket handle", () => {
  const bucket = storageBucketArchitectureService.getBucket("reports");

  assert.equal(bucket.name, "parabolic-prod-reports");
});

test("assertStorageObjectPath rejects mismatched buckets", () => {
  assert.throws(
    () =>
      storageBucketArchitectureService.assertStorageObjectPath({
        bucketKey: "questionAssets",
        bucketName: "parabolic-prod-reports",
        objectPath: "inst_build_72/questions/q_301/v4/question.png",
      }),
    /does not match the configured questionAssets bucket/i,
  );
});

test("assertStorageObjectPath rejects invalid object paths", () => {
  assert.throws(
    () =>
      storageBucketArchitectureService.assertStorageObjectPath({
        bucketKey: "reports",
        bucketName: "parabolic-prod-reports",
        objectPath: "inst_build_72/reports/2026/13/governance.pdf",
      }),
    /does not match the reports storage structure/i,
  );
});
