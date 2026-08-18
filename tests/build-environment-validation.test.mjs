import assert from "node:assert/strict";
import test from "node:test";
import {
  BuildEnvironmentValidationError,
  validateBuildEnvironment,
} from "../scripts/frontend-cicd/validate-build-environment.mjs";

const releaseMetadata = {
  VITE_RELEASE_ID: "gha-12345-1",
  VITE_RELEASE_COMMIT_SHA: "0123456789abcdef0123456789abcdef01234567",
  VITE_RELEASE_BUILT_AT: "2026-08-07T00:00:00Z",
  RELEASE_ID: "gha-12345-1",
  RELEASE_COMMIT_SHA: "0123456789abcdef0123456789abcdef01234567",
  RELEASE_BUILT_AT: "2026-08-07T00:00:00Z",
};

function createEnvironment(environmentName = "test") {
  const projectId =
    environmentName === "test"
      ? "demo-parabolic-test"
      : environmentName === "staging"
        ? "parabolic-dev"
        : environmentName === "production"
          ? "parabolic-live"
          : "parabolic-local";
  const domainSuffix = environmentName === "test" ? "test.invalid" : "example.com";

  return {
    PARABOLIC_BUILD_ENVIRONMENT: environmentName,
    FIREBASE_PROJECT_ID: projectId,
    VITE_FIREBASE_API_KEY:
      environmentName === "test" ? "demo-api-key" : "AIza12345678901234567890123456789012345",
    VITE_FIREBASE_AUTH_DOMAIN: `${projectId}.firebaseapp.com`,
    VITE_FIREBASE_PROJECT_ID: projectId,
    VITE_FIREBASE_APP_ID: "1:000000000000:web:ci",
    VITE_FIREBASE_STORAGE_BUCKET: `${projectId}.firebasestorage.app`,
    VITE_FIREBASE_MESSAGING_SENDER_ID: "000000000000",
    VITE_FIREBASE_MEASUREMENT_ID: "",
    VITE_FIREBASE_AUTH_EMULATOR_URL: "",
    VITE_API_BASE_URL: "",
    VITE_CDN_BASE_URL: `https://cdn.${projectId}.${domainSuffix}`,
    VITE_PORTAL_BASE_URL: `https://portal.${projectId}.${domainSuffix}`,
    VITE_EXAM_BASE_URL: `https://exam.${projectId}.${domainSuffix}`,
    VITE_VENDOR_BASE_URL: `https://vendor.${projectId}.${domainSuffix}`,
    VITE_DATA_MODE: "live",
    VITE_EXAM_DEV_MOCK_ENTRY: "false",
    PROJECT_ID: projectId,
    NODE_ENV: environmentName,
    APP_BASE_URL: `https://portal.${projectId}.${domainSuffix}`,
    EXAM_BASE_URL: `https://exam.${projectId}.${domainSuffix}`,
    VENDOR_BASE_URL: `https://vendor.${projectId}.${domainSuffix}`,
    CDN_BASE_URL: `https://cdn.${projectId}.${domainSuffix}`,
    QUESTION_ASSETS_BUCKET: `${projectId}-question-assets`,
    REPORTS_BUCKET: `${projectId}-reports`,
    ...releaseMetadata,
  };
}

function expectValidationError(environment, expectedMessage) {
  assert.throws(
    () => validateBuildEnvironment(environment),
    (error) => {
      assert.ok(
        error instanceof BuildEnvironmentValidationError,
        `Unexpected error: ${error instanceof Error ? error.stack : String(error)}`,
      );
      assert.ok(
        error.errors.some((message) => message.includes(expectedMessage)),
        `Expected an error containing: ${expectedMessage}\n${error.message}`,
      );
      return true;
    },
  );
}

test("valid test, staging, and production environments pass", () => {
  for (const environmentName of ["test", "staging", "production"]) {
    const result = validateBuildEnvironment(createEnvironment(environmentName));
    assert.equal(result.environment, environmentName);
  }
});

test("CDN base URLs may include an environment-owned bucket path", () => {
  const environment = createEnvironment("staging");
  const bucketBaseUrl = "https://storage.googleapis.com/parabolic-dev.firebasestorage.app";

  assert.equal(
    validateBuildEnvironment({
      ...environment,
      VITE_CDN_BASE_URL: bucketBaseUrl,
      CDN_BASE_URL: bucketBaseUrl,
    }).environment,
    "staging",
  );

  expectValidationError(
    {
      ...environment,
      VITE_CDN_BASE_URL: `${bucketBaseUrl}?credential=forbidden`,
      CDN_BASE_URL: `${bucketBaseUrl}?credential=forbidden`,
    },
    "without credentials, query, or fragment",
  );

  expectValidationError(
    {
      ...environment,
      VITE_PORTAL_BASE_URL: "https://portal.parabolic-dev.example.com/path",
      APP_BASE_URL: "https://portal.parabolic-dev.example.com/path",
    },
    "origin only",
  );
});

test("every required CI value fails closed when missing", () => {
  const validEnvironment = createEnvironment();
  const requiredKeys = [
    "PARABOLIC_BUILD_ENVIRONMENT",
    "FIREBASE_PROJECT_ID",
    "VITE_FIREBASE_API_KEY",
    "VITE_FIREBASE_AUTH_DOMAIN",
    "VITE_FIREBASE_PROJECT_ID",
    "VITE_FIREBASE_APP_ID",
    "VITE_FIREBASE_STORAGE_BUCKET",
    "VITE_CDN_BASE_URL",
    "VITE_PORTAL_BASE_URL",
    "VITE_EXAM_BASE_URL",
    "VITE_VENDOR_BASE_URL",
    "VITE_DATA_MODE",
    "VITE_EXAM_DEV_MOCK_ENTRY",
    "VITE_RELEASE_ID",
    "VITE_RELEASE_COMMIT_SHA",
    "VITE_RELEASE_BUILT_AT",
    "PROJECT_ID",
    "NODE_ENV",
    "APP_BASE_URL",
    "EXAM_BASE_URL",
    "VENDOR_BASE_URL",
    "CDN_BASE_URL",
    "QUESTION_ASSETS_BUCKET",
    "REPORTS_BUCKET",
    "RELEASE_ID",
    "RELEASE_COMMIT_SHA",
    "RELEASE_BUILT_AT",
  ];

  for (const key of requiredKeys) {
    const environment = { ...validEnvironment };
    delete environment[key];
    expectValidationError(environment, `${key} is required`);
  }
});

test("frontend and Functions values must describe one artifact", () => {
  const contradictions = [
    ["VITE_FIREBASE_PROJECT_ID", "other-project", "must equal PROJECT_ID"],
    ["FIREBASE_PROJECT_ID", "other-project", "must equal PROJECT_ID"],
    ["VITE_PORTAL_BASE_URL", "https://other.test.invalid", "must equal APP_BASE_URL"],
    ["VITE_EXAM_BASE_URL", "https://other.test.invalid", "must equal EXAM_BASE_URL"],
    ["VITE_VENDOR_BASE_URL", "https://other.test.invalid", "must equal VENDOR_BASE_URL"],
    ["VITE_CDN_BASE_URL", "https://other.test.invalid", "must equal CDN_BASE_URL"],
    ["VITE_RELEASE_ID", "gha-other-1", "must equal RELEASE_ID"],
    [
      "VITE_RELEASE_COMMIT_SHA",
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "must equal RELEASE_COMMIT_SHA",
    ],
    ["VITE_RELEASE_BUILT_AT", "2026-08-08T00:00:00Z", "must equal RELEASE_BUILT_AT"],
  ];

  for (const [key, value, expectedMessage] of contradictions) {
    expectValidationError({ ...createEnvironment(), [key]: value }, expectedMessage);
  }
});

test("malformed release values, origins, buckets, and release overrides fail", () => {
  const cases = [
    ["VITE_RELEASE_COMMIT_SHA", "short", "full 40-character commit SHA"],
    ["RELEASE_BUILT_AT", "not-a-date", "valid UTC ISO-8601 timestamp"],
    ["QUESTION_ASSETS_BUCKET", "gs://bucket/path", "bare bucket name"],
    ["VITE_PORTAL_BASE_URL", "portal.test.invalid", "absolute URL"],
    ["VITE_EXAM_DEV_MOCK_ENTRY", "true", "must be false"],
    ["VITE_DATA_MODE", "fixture", "must be live"],
  ];

  for (const [key, value, expectedMessage] of cases) {
    expectValidationError({ ...createEnvironment("staging"), [key]: value }, expectedMessage);
  }

  expectValidationError(
    {
      ...createEnvironment("staging"),
      VITE_API_BASE_URL: "https://api.parabolic-dev.example.com",
    },
    "must be empty",
  );
  expectValidationError(
    {
      ...createEnvironment("production"),
      VITE_ADMIN_SETTINGS_INSTITUTE_ID: "fixture-institute",
    },
    "is forbidden",
  );
  expectValidationError(
    {
      ...createEnvironment("production"),
      VITE_FIREBASE_AUTH_EMULATOR_URL: "http://127.0.0.1:9099",
    },
    "is forbidden",
  );
});

test("Auth emulator configuration is limited to an origin-only loopback URL", () => {
  const validEnvironment = createEnvironment("test");
  assert.equal(
    validateBuildEnvironment({
      ...validEnvironment,
      VITE_FIREBASE_AUTH_EMULATOR_URL: "http://127.0.0.1:9099",
    }).environment,
    "test",
  );

  for (const [value, expectedMessage] of [
    ["https://127.0.0.1:9099", "loopback HTTP origin"],
    ["http://auth.test.invalid:9099", "loopback HTTP origin"],
    ["http://127.0.0.1:9099/path", "origin only"],
  ]) {
    expectValidationError(
      { ...validEnvironment, VITE_FIREBASE_AUTH_EMULATOR_URL: value },
      expectedMessage,
    );
  }
});

test("test, staging, and production project boundaries cannot cross", () => {
  expectValidationError(
    { ...createEnvironment("test"), PROJECT_ID: "parabolic-local" },
    "must use a demo-* project",
  );
  expectValidationError(
    { ...createEnvironment("staging"), PROJECT_ID: "parabolic-live" },
    "must be parabolic-dev",
  );
  expectValidationError(
    { ...createEnvironment("production"), PROJECT_ID: "parabolic-dev" },
    "must not use a test or staging project",
  );
});

test("validation errors report key names without values", () => {
  const invalidEnvironment = createEnvironment("test");
  invalidEnvironment.VITE_FIREBASE_API_KEY = "do-not-print-this-value";
  delete invalidEnvironment.VITE_FIREBASE_APP_ID;
  assert.throws(
    () => validateBuildEnvironment(invalidEnvironment),
    (error) => {
      assert.ok(error instanceof BuildEnvironmentValidationError);
      assert.match(error.message, /VITE_FIREBASE_APP_ID is required/u);
      assert.doesNotMatch(error.message, /do-not-print-this-value/u);
      return true;
    },
  );
});
