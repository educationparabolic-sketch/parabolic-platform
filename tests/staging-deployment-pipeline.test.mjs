import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  FUNCTIONS_RUNTIME_KEYS,
  FunctionsRuntimeEnvironmentError,
  renderFunctionsRuntimeEnvironment,
} from "../scripts/frontend-cicd/materialize-functions-runtime-env.mjs";

const workflowPath = fileURLToPath(
  new URL("../.github/workflows/frontend-ci-cd.yml", import.meta.url),
);

function createStagingEnvironment() {
  return {
    PARABOLIC_DEPLOY_BRANCH: "staging",
    PARABOLIC_BUILD_ENVIRONMENT: "staging",
    FIREBASE_PROJECT_ID: "parabolic-dev",
    FIREBASE_SITE_PORTAL: "parabolic-dev",
    FIREBASE_SITE_EXAM: "parabolic-dev-40ec9",
    FIREBASE_SITE_VENDOR: "parabolic-dev-vendor",
    VITE_FIREBASE_API_KEY: `AIza${"a".repeat(24)}`,
    VITE_FIREBASE_AUTH_DOMAIN: "parabolic-dev.firebaseapp.com",
    VITE_FIREBASE_PROJECT_ID: "parabolic-dev",
    VITE_FIREBASE_APP_ID: "1:123456789012:web:staging",
    VITE_FIREBASE_AUTH_EMULATOR_URL: "",
    VITE_FIREBASE_STORAGE_BUCKET: "parabolic-dev.firebasestorage.app",
    VITE_FIREBASE_MESSAGING_SENDER_ID: "123456789012",
    VITE_FIREBASE_MEASUREMENT_ID: "",
    VITE_API_BASE_URL: "",
    VITE_CDN_BASE_URL: "https://storage.googleapis.com/parabolic-dev.firebasestorage.app",
    VITE_PORTAL_BASE_URL: "https://portal.staging.invalid",
    VITE_EXAM_BASE_URL: "https://exam.staging.invalid",
    VITE_VENDOR_BASE_URL: "https://vendor.staging.invalid",
    VITE_DATA_MODE: "live",
    VITE_EXAM_DEV_MOCK_ENTRY: "false",
    VITE_RELEASE_ID: "gha-123-1",
    VITE_RELEASE_COMMIT_SHA: "a".repeat(40),
    VITE_RELEASE_BUILT_AT: "2026-08-18T12:00:00Z",
    PROJECT_ID: "parabolic-dev",
    NODE_ENV: "staging",
    APP_BASE_URL: "https://portal.staging.invalid",
    EXAM_BASE_URL: "https://exam.staging.invalid",
    VENDOR_BASE_URL: "https://vendor.staging.invalid",
    CDN_BASE_URL: "https://storage.googleapis.com/parabolic-dev.firebasestorage.app",
    QUESTION_ASSETS_BUCKET: "parabolic-dev-question-assets",
    REPORTS_BUCKET: "parabolic-dev-reports",
    RELEASE_ID: "gha-123-1",
    RELEASE_COMMIT_SHA: "a".repeat(40),
    RELEASE_BUILT_AT: "2026-08-18T12:00:00Z",
  };
}

test("staging deployment is manual, project-confirmed, protected, and ordered", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const jobStart = workflow.indexOf("  staging-deploy:");
  assert.ok(jobStart > 0, "staging deploy job must exist");
  const job = workflow.slice(jobStart);

  assert.match(job, /needs: \[frontend-ci, backend-ci\]/u);
  assert.match(job, /github\.event_name == 'workflow_dispatch'/u);
  assert.match(job, /github\.ref_name == 'staging'/u);
  assert.match(job, /inputs\.deploy_staging == true/u);
  assert.match(job, /inputs\.staging_project_id == 'parabolic-dev'/u);
  assert.match(job, /environment:\n      name: staging/u);
  assert.match(job, /FIREBASE_CLI_VERSION: "15\.9\.0"/u);
  assert.doesNotMatch(job, /github\.ref_name == 'dev'|github\.ref_name == 'main'/u);

  const functionsDeploy = job.indexOf("name: Deploy staging Functions");
  const firestoreDeploy = job.indexOf("name: Deploy staging Firestore rules and indexes");
  const hostingDeploy = job.indexOf("name: Deploy staging Hosting bundles");
  assert.ok(functionsDeploy > 0 && functionsDeploy < firestoreDeploy);
  assert.ok(firestoreDeploy < hostingDeploy);

  assert.match(job, /--project "\$\{FIREBASE_PROJECT_ID\}" --only functions/u);
  assert.match(job, /--project "\$\{FIREBASE_PROJECT_ID\}" --only firestore/u);
  assert.match(
    job,
    /--project "\$\{FIREBASE_PROJECT_ID\}" --only hosting:portal,hosting:exam,hosting:vendor/u,
  );
  assert.equal((job.match(/--non-interactive/gu) ?? []).length, 3);
  assert.equal((job.match(/--token "\$\{FIREBASE_TOKEN\}"/gu) ?? []).length, 4);
  assert.match(job, /materialize-functions-runtime-env\.mjs --write/u);
  assert.match(job, /materialize-functions-runtime-env\.mjs --remove/u);
});

test("Functions runtime dotenv contains only validated non-secret staging values", () => {
  const environment = createStagingEnvironment();
  environment.FIREBASE_TOKEN = "must-not-be-written";
  environment.STRIPE_SECRET_KEY = "must-not-be-written";

  const rendered = renderFunctionsRuntimeEnvironment(environment);
  const keys = rendered
    .trimEnd()
    .split("\n")
    .map((line) => line.slice(0, line.indexOf("=")));

  assert.deepEqual(keys, [...FUNCTIONS_RUNTIME_KEYS]);
  assert.doesNotMatch(rendered, /FIREBASE_TOKEN|STRIPE_SECRET_KEY|must-not-be-written/u);
  assert.match(rendered, /^PROJECT_ID=parabolic-dev$/mu);
  assert.match(rendered, /^NODE_ENV=staging$/mu);
  assert.match(rendered, /^RELEASE_ID=gha-123-1$/mu);
});

test("Functions runtime dotenv rejects non-staging targets and line injection", () => {
  const production = createStagingEnvironment();
  production.PARABOLIC_DEPLOY_BRANCH = "main";
  production.PARABOLIC_BUILD_ENVIRONMENT = "production";
  production.NODE_ENV = "production";
  assert.throws(() => renderFunctionsRuntimeEnvironment(production));

  const injected = createStagingEnvironment();
  injected.RELEASE_ID = "gha-123-1\nLEAK=value";
  injected.VITE_RELEASE_ID = injected.RELEASE_ID;
  assert.throws(
    () => renderFunctionsRuntimeEnvironment(injected),
    (error) =>
      error instanceof FunctionsRuntimeEnvironmentError ||
      /invalid release ID|invalid control character/u.test(error.message),
  );
});
