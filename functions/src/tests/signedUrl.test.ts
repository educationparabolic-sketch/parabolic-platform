import assert from "node:assert/strict";
import test from "node:test";
import {createHmac} from "crypto";
import {signedUrlService} from "../services/signedUrl";

const TEST_SIGNING_KEY = Buffer.from("0123456789abcdef").toString("base64url");

test("initializeService returns deterministic signed URL policies", () => {
  const result = signedUrlService.initializeService({
    signedUrlKeyName: "build_73_key",
    signedUrlKeyValue: TEST_SIGNING_KEY,
  });

  assert.equal(result.keyName, "build_73_key");
  assert.equal(result.contextPolicies.examSession.expiresInSeconds, 7200);
  assert.equal(result.contextPolicies.dashboardView.expiresInSeconds, 1800);
});

test(
  "generateQuestionAssetSignedUrl signs exam asset URLs on CDN domain",
  () => {
    const result = signedUrlService.generateQuestionAssetSignedUrl({
      assetKind: "questionImage",
      instituteId: "inst_build_73",
      questionId: "q_401",
      version: 2,
    }, {
      cdnBaseUrl: "https://cdn.example.com",
      signedUrlKeyName: "build_73_key",
      signedUrlKeyValue: TEST_SIGNING_KEY,
    });

    const signedUrl = new URL(result.signedUrl);

    assert.equal(signedUrl.origin, "https://cdn.example.com");
    assert.equal(
      signedUrl.pathname,
      "/inst_build_73/questions/q_401/v2/question.png",
    );
    assert.equal(result.accessContext, "examSession");
    assert.equal(result.expiresInSeconds, 7200);
    assert.equal(signedUrl.searchParams.get("KeyName"), "build_73_key");
    assert.ok(signedUrl.searchParams.get("Signature"));
  },
);

test("generateReportAssetSignedUrl signs dashboard report URLs", () => {
  const result = signedUrlService.generateReportAssetSignedUrl({
    extension: "pdf",
    instituteId: "inst_build_73",
    month: 3,
    reportKind: "studentMonthlyStatement",
    studentId: "stu_73",
    year: 2026,
  }, {
    cdnBaseUrl: "https://cdn.example.com",
    signedUrlKeyName: "reports_key",
    signedUrlKeyValue: TEST_SIGNING_KEY,
  });

  const signedUrl = new URL(result.signedUrl);

  assert.equal(result.accessContext, "dashboardView");
  assert.equal(result.expiresInSeconds, 1800);
  assert.equal(
    signedUrl.pathname,
    "/inst_build_73/reports/2026/03/stu_73.pdf",
  );
  assert.equal(signedUrl.searchParams.get("KeyName"), "reports_key");
});

test(
  "generateRestrictedMediaSignedUrl supports pre-resolved restricted paths",
  () => {
    const result = signedUrlService.generateRestrictedMediaSignedUrl({
      accessContext: "dashboardView",
      mediaPath: "/inst_build_73/media/tutorials/intro.mp4",
    }, {
      cdnBaseUrl: "https://cdn.example.com",
      signedUrlKeyName: "media_key",
      signedUrlKeyValue: TEST_SIGNING_KEY,
    });

    assert.equal(
      new URL(result.signedUrl).pathname,
      "/inst_build_73/media/tutorials/intro.mp4",
    );
  },
);

test("generateSignedUrlForCdnPath follows Cloud CDN signing algorithm", () => {
  const result = signedUrlService.generateSignedUrlForCdnPath({
    accessContext: "dashboardView",
    cdnPath: "inst_build_73/reports/2026/03/analytics-export.csv",
  }, {
    cdnBaseUrl: "https://cdn.example.com",
    signedUrlKeyName: "algorithm_key",
    signedUrlKeyValue: TEST_SIGNING_KEY,
  });

  const signedUrl = new URL(result.signedUrl);
  const unsignedUrl = new URL(result.signedUrl);
  const signature = signedUrl.searchParams.get("Signature");

  unsignedUrl.searchParams.delete("Signature");

  const expectedSignature = createHmac(
    "sha1",
    Buffer.from(TEST_SIGNING_KEY, "base64url"),
  )
    .update(unsignedUrl.toString())
    .digest("base64url");

  assert.equal(signature, expectedSignature);
});

test("initializeService rejects missing signing key configuration", () => {
  assert.throws(
    () =>
      signedUrlService.initializeService({
        signedUrlKeyName: "build_73_key",
      }),
    /CDN_SIGNED_URL_KEY_VALUE/i,
  );
});

test("generateSignedUrlForCdnPath rejects reserved signing parameters", () => {
  assert.throws(
    () =>
      signedUrlService.generateSignedUrlForCdnPath({
        accessContext: "dashboardView",
        cdnPath:
          "inst_build_73/reports/2026/03/governance.pdf?Expires=123456789",
      }, {
        cdnBaseUrl: "https://cdn.example.com",
        signedUrlKeyName: "reserved_key",
        signedUrlKeyValue: TEST_SIGNING_KEY,
      }),
    /already include "Expires"/i,
  );
});
