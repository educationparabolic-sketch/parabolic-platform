import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDirectory = fileURLToPath(new URL("../", import.meta.url));
const workflowPath = join(rootDirectory, ".github/workflows/frontend-ci-cd.yml");

function countOccurrences(source, value) {
  return source.split(value).length - 1;
}

test("CI builds receive the canonical public and release environment", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const frontendEnvironmentSource = await readFile(
    join(rootDirectory, "shared/services/frontendEnvironment.ts"),
    "utf8",
  );
  const functionsEnvironmentSource = await readFile(
    join(rootDirectory, "functions/src/utils/environment.ts"),
    "utf8",
  );

  const frontendBuildKeys = [
    "VITE_FIREBASE_API_KEY",
    "VITE_FIREBASE_AUTH_DOMAIN",
    "VITE_FIREBASE_PROJECT_ID",
    "VITE_FIREBASE_APP_ID",
    "VITE_FIREBASE_STORAGE_BUCKET",
    "VITE_FIREBASE_MESSAGING_SENDER_ID",
    "VITE_FIREBASE_MEASUREMENT_ID",
    "VITE_API_BASE_URL",
    "VITE_CDN_BASE_URL",
    "VITE_PORTAL_BASE_URL",
    "VITE_EXAM_BASE_URL",
    "VITE_VENDOR_BASE_URL",
    "VITE_DATA_MODE",
    "VITE_EXAM_DEV_MOCK_ENTRY",
    "VITE_RELEASE_ID",
    "VITE_RELEASE_COMMIT_SHA",
  ];

  const functionsBuildKeys = [
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
  ];

  for (const key of [...frontendBuildKeys, ...functionsBuildKeys]) {
    assert.ok(
      countOccurrences(workflow, `${key}:`) >= 2,
      `${key} must be present in validation and environment-scoped builds`,
    );
  }

  assert.equal(countOccurrences(workflow, 'VITE_API_BASE_URL: ""'), 2);
  assert.equal(countOccurrences(workflow, 'VITE_DATA_MODE: "live"'), 2);
  assert.equal(countOccurrences(workflow, 'VITE_EXAM_DEV_MOCK_ENTRY: "false"'), 2);
  assert.equal(countOccurrences(workflow, "Inject release build timestamp"), 2);
  assert.equal(countOccurrences(workflow, "VITE_RELEASE_BUILT_AT=${built_at}"), 2);
  assert.equal(countOccurrences(workflow, 'echo "RELEASE_BUILT_AT=${built_at}'), 2);
  assert.equal(countOccurrences(workflow, "npm --prefix functions run build"), 2);
  assert.equal(countOccurrences(workflow, "PARABOLIC_BUILD_ENVIRONMENT:"), 2);
  assert.equal(countOccurrences(workflow, "Validate build environment"), 2);
  assert.equal(
    countOccurrences(
      workflow,
      "node scripts/frontend-cicd/validate-build-environment.mjs --validate",
    ),
    2,
  );
  assert.equal(countOccurrences(workflow, "Scan release artifacts"), 2);
  assert.equal(
    countOccurrences(workflow, "node scripts/frontend-cicd/scan-release-artifacts.mjs --scan"),
    2,
  );
  assert.equal(countOccurrences(workflow, "--root .firebase/hosting/portal"), 1);
  assert.equal(countOccurrences(workflow, "--root apps/exam/dist"), 1);
  assert.equal(countOccurrences(workflow, "--root apps/vendor/dist"), 1);
  assert.equal(countOccurrences(workflow, "Validate deploy target mapping"), 1);
  assert.equal(
    countOccurrences(workflow, "node scripts/frontend-cicd/validate-deploy-target.mjs --validate"),
    1,
  );
  assert.equal(countOccurrences(workflow, "PARABOLIC_DEPLOY_BRANCH:"), 1);
  for (const key of ["FIREBASE_SITE_PORTAL", "FIREBASE_SITE_EXAM", "FIREBASE_SITE_VENDOR"]) {
    assert.match(workflow, new RegExp(`${key}: \\$\\{\\{ vars\\.${key} \\}\\}`, "u"));
    assert.doesNotMatch(
      workflow,
      new RegExp(`${key}: \\$\\{\\{ secrets\\.${key} \\}\\}`, "u"),
      `${key} is a public deployment identifier, not a secret`,
    );
  }

  const validationJobGate = workflow.indexOf("Validate build environment");
  const validationJobBuild = workflow.indexOf("Type check and build frontend portals");
  const deployJobGate = workflow.lastIndexOf("Validate build environment");
  const deployTargetGate = workflow.indexOf("Validate deploy target mapping");
  const deployJobBuild = workflow.indexOf("Build deployment artifacts");
  const validationJobScan = workflow.indexOf("Scan release artifacts");
  const validationJobTests = workflow.indexOf("Run frontend automated tests");
  const deployJobScan = workflow.lastIndexOf("Scan release artifacts");
  const firebaseCliInstall = workflow.indexOf("Install Firebase CLI");
  assert.ok(validationJobGate > 0 && validationJobGate < validationJobBuild);
  assert.ok(deployJobGate > validationJobGate && deployJobGate < deployJobBuild);
  assert.ok(deployTargetGate > deployJobGate && deployTargetGate < deployJobBuild);
  assert.ok(validationJobScan > validationJobBuild && validationJobScan < validationJobTests);
  assert.ok(deployJobScan > deployJobBuild && deployJobScan < firebaseCliInstall);

  assert.match(workflow, /VITE_BASE_PATH=\/admin\/ npm --prefix apps\/admin run build/u);
  assert.match(workflow, /VITE_BASE_PATH=\/student\/ npm --prefix apps\/student run build/u);
  assert.match(workflow, /FIREBASE_PROJECT_ID: \$\{\{ vars\.FIREBASE_PROJECT_ID \}\}/u);
  assert.match(workflow, /VITE_FIREBASE_API_KEY: \$\{\{ vars\.VITE_FIREBASE_API_KEY \}\}/u);
  assert.match(workflow, /VITE_CDN_BASE_URL: \$\{\{ vars\.CDN_BASE_URL \}\}/u);

  const viteAssignmentLines = workflow
    .split(/\r?\n/u)
    .filter((line) => /^\s+VITE_[A-Z0-9_]+:/u.test(line));
  assert.ok(viteAssignmentLines.length > 0);
  for (const line of viteAssignmentLines) {
    assert.doesNotMatch(line, /secrets\./u, "browser-public values must not use secret storage");
  }

  for (const key of ["VITE_RELEASE_ID", "VITE_RELEASE_COMMIT_SHA", "VITE_RELEASE_BUILT_AT"]) {
    assert.match(frontendEnvironmentSource, new RegExp(`readEnvValue\\(\"${key}\"\\)`, "u"));
  }

  for (const key of ["RELEASE_ID", "RELEASE_COMMIT_SHA", "RELEASE_BUILT_AT"]) {
    assert.match(functionsEnvironmentSource, new RegExp(`getOptionalEnv\\(\"${key}\"\\)`, "u"));
  }
});
