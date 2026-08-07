import assert from "node:assert/strict";
import test from "node:test";

import {
  DeployTargetValidationError,
  NON_PRODUCTION_FIREBASE_MAPPING,
  validateDeployTarget,
} from "../scripts/frontend-cicd/validate-deploy-target.mjs";

function createMapping(branch) {
  const environmentByBranch = {
    dev: "development",
    staging: "staging",
    main: "production",
  };
  const production = branch === "main";
  return {
    PARABOLIC_DEPLOY_BRANCH: branch,
    PARABOLIC_BUILD_ENVIRONMENT: environmentByBranch[branch],
    FIREBASE_PROJECT_ID: production ? "parabolic-live" : "parabolic-dev",
    FIREBASE_SITE_PORTAL: production ? "parabolic-live-portal" : "parabolic-dev",
    FIREBASE_SITE_EXAM: production ? "parabolic-live-exam" : "parabolic-dev-40ec9",
    FIREBASE_SITE_VENDOR: production ? "parabolic-live-vendor" : "parabolic-dev-vendor",
  };
}

test("accepts the exact branch-specific development, staging, and production mappings", () => {
  assert.equal(validateDeployTarget(createMapping("dev")).environment, "development");
  assert.equal(validateDeployTarget(createMapping("staging")).environment, "staging");
  assert.equal(validateDeployTarget(createMapping("main")).environment, "production");
});

test("requires every deploy-target input without reporting values", () => {
  const complete = createMapping("staging");
  for (const key of Object.keys(complete)) {
    const input = { ...complete };
    delete input[key];
    assert.throws(
      () => validateDeployTarget(input),
      (error) => {
        assert.ok(error instanceof DeployTargetValidationError);
        assert.match(error.message, new RegExp(`${key} is required`, "u"));
        assert.doesNotMatch(error.message, /parabolic-dev-40ec9|parabolic-dev-vendor/u);
        return true;
      },
    );
  }
});

test("rejects unsupported branches and branch/environment disagreement", () => {
  assert.throws(
    () => validateDeployTarget({ ...createMapping("staging"), PARABOLIC_DEPLOY_BRANCH: "feature" }),
    /PARABOLIC_DEPLOY_BRANCH is not deployable/u,
  );
  assert.throws(
    () =>
      validateDeployTarget({
        ...createMapping("staging"),
        PARABOLIC_BUILD_ENVIRONMENT: "production",
      }),
    /does not match PARABOLIC_DEPLOY_BRANCH/u,
  );
});

test("development and staging require the recorded non-production project and sites", () => {
  const expectedFailures = [
    ["FIREBASE_PROJECT_ID", "other-project"],
    ["FIREBASE_SITE_PORTAL", "other-portal"],
    ["FIREBASE_SITE_EXAM", "other-exam"],
    ["FIREBASE_SITE_VENDOR", "other-vendor"],
  ];

  for (const branch of ["dev", "staging"]) {
    for (const [key, value] of expectedFailures) {
      assert.throws(
        () => validateDeployTarget({ ...createMapping(branch), [key]: value }),
        new RegExp(`${key} must use the recorded non-production`, "u"),
      );
    }
  }
});

test("production rejects every recorded non-production project and site", () => {
  assert.throws(
    () =>
      validateDeployTarget({
        ...createMapping("main"),
        FIREBASE_PROJECT_ID: NON_PRODUCTION_FIREBASE_MAPPING.projectId,
      }),
    /must not use a demo or non-production project/u,
  );

  for (const [target, site] of Object.entries(NON_PRODUCTION_FIREBASE_MAPPING.sites)) {
    assert.throws(
      () =>
        validateDeployTarget({
          ...createMapping("main"),
          [`FIREBASE_SITE_${target.toUpperCase()}`]: site,
        }),
      new RegExp(`FIREBASE_SITE_${target.toUpperCase()} must not use`, "u"),
    );
  }
});

test("production rejects demo projects and sites", () => {
  assert.throws(
    () =>
      validateDeployTarget({
        ...createMapping("main"),
        FIREBASE_PROJECT_ID: "demo-parabolic-test",
      }),
    /must not use a demo or non-production project/u,
  );
  assert.throws(
    () =>
      validateDeployTarget({
        ...createMapping("main"),
        FIREBASE_SITE_EXAM: "demo-parabolic-exam",
      }),
    /FIREBASE_SITE_EXAM must not use a demo or non-production site/u,
  );
});

test("all three Hosting targets must map to distinct sites", () => {
  assert.throws(
    () =>
      validateDeployTarget({
        ...createMapping("main"),
        FIREBASE_SITE_EXAM: "parabolic-live-portal",
      }),
    /Firebase Hosting sites must be distinct/u,
  );
});

test("project and site identifiers must use a safe Firebase identifier format", () => {
  for (const key of [
    "FIREBASE_PROJECT_ID",
    "FIREBASE_SITE_PORTAL",
    "FIREBASE_SITE_EXAM",
    "FIREBASE_SITE_VENDOR",
  ]) {
    assert.throws(
      () => validateDeployTarget({ ...createMapping("main"), [key]: "Invalid/value" }),
      new RegExp(`${key} has an invalid Firebase identifier format`, "u"),
    );
  }
});

test("diagnostics never echo supplied project or site identifiers", () => {
  const secretMarker = "do-not-echo-target-value";
  assert.throws(
    () =>
      validateDeployTarget({
        ...createMapping("staging"),
        FIREBASE_PROJECT_ID: secretMarker,
        FIREBASE_SITE_PORTAL: secretMarker,
      }),
    (error) => {
      assert.ok(error instanceof DeployTargetValidationError);
      assert.doesNotMatch(error.message, new RegExp(secretMarker, "u"));
      return true;
    },
  );
});
