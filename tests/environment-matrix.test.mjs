import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDirectory = fileURLToPath(new URL("../", import.meta.url));
const matrixPath = join(rootDirectory, "docs/ENVIRONMENT_VARIABLE_MATRIX.md");

const portalExamples = {
  admin: join(rootDirectory, "apps/admin/.env.example"),
  exam: join(rootDirectory, "apps/exam/.env.example"),
  student: join(rootDirectory, "apps/student/.env.example"),
  vendor: join(rootDirectory, "apps/vendor/.env.example"),
};

const frontendSourceKeys = [
  "VITE_ADMIN_SETTINGS_INSTITUTE_ID",
  "VITE_API_BASE_URL",
  "VITE_BASE_PATH",
  "VITE_CDN_BASE_URL",
  "VITE_DATA_MODE",
  "VITE_EXAM_BASE_URL",
  "VITE_EXAM_DEV_MOCK_ENTRY",
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_APP_ID",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_MEASUREMENT_ID",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_PORTAL_BASE_URL",
  "VITE_RELEASE_BUILT_AT",
  "VITE_RELEASE_COMMIT_SHA",
  "VITE_RELEASE_ID",
  "VITE_VENDOR_BASE_URL",
];

const functionsApplicationKeys = [
  "AI_API_KEY",
  "AI_API_KEY_SECRET_NAME",
  "APP_BASE_URL",
  "BIGQUERY_ARCHIVE_LOCATION",
  "CDN_BASE_URL",
  "CDN_SIGNED_URL_KEY_NAME",
  "CDN_SIGNED_URL_KEY_VALUE",
  "EMAIL_PROVIDER_KEY",
  "EMAIL_PROVIDER_KEY_SECRET_NAME",
  "EXAM_BASE_URL",
  "FAILURE_RECOVERY_USE_CLOUD_TASKS",
  "NODE_ENV",
  "PROJECT_ID",
  "QUESTION_ASSETS_BUCKET",
  "REPORTS_BUCKET",
  "RELEASE_BUILT_AT",
  "RELEASE_COMMIT_SHA",
  "RELEASE_ID",
  "RETENTION_AUDIT_LOG_DAYS",
  "RETENTION_BILLING_RECORD_DAYS",
  "RETENTION_EMAIL_LOG_DAYS",
  "RETENTION_MAX_DOCUMENTS_PER_RUN",
  "RETENTION_SESSION_ARCHIVE_DAYS",
  "RETENTION_SESSION_ARCHIVE_GRACE_DAYS",
  "STRIPE_SECRET_KEY",
  "STRIPE_SECRET_KEY_SECRET_NAME",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_WEBHOOK_SECRET_NAME",
  "VENDOR_BASE_URL",
];

const functionsPlatformKeys = [
  "FIREBASE_CONFIG",
  "FUNCTIONS_VERSION",
  "FUNCTION_TARGET",
  "GCLOUD_PROJECT",
  "GOOGLE_CLOUD_PROJECT",
  "K_REVISION",
  "K_SERVICE",
];

const commonPortalExampleKeys = [
  "VITE_API_BASE_URL",
  "VITE_CDN_BASE_URL",
  "VITE_DATA_MODE",
  "VITE_EXAM_BASE_URL",
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_APP_ID",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_MEASUREMENT_ID",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_PORTAL_BASE_URL",
  "VITE_RELEASE_BUILT_AT",
  "VITE_RELEASE_COMMIT_SHA",
  "VITE_RELEASE_ID",
  "VITE_VENDOR_BASE_URL",
];

const portalSpecificExampleKeys = {
  admin: ["VITE_ADMIN_SETTINGS_INSTITUTE_ID", "VITE_BASE_PATH"],
  exam: ["VITE_EXAM_DEV_MOCK_ENTRY"],
  student: ["VITE_BASE_PATH"],
  vendor: [],
};

const sourceExtensions = new Set([".ts", ".tsx"]);

async function listSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    const repositoryPath = relative(rootDirectory, path).replaceAll("\\", "/");

    if (
      repositoryPath.includes("/artifacts/") ||
      repositoryPath.includes("/dist/") ||
      repositoryPath.includes("/lib/") ||
      repositoryPath.includes("/node_modules/") ||
      repositoryPath.includes("/tests/") ||
      /\.test\.[cm]?[jt]sx?$/.test(repositoryPath)
    ) {
      continue;
    }

    if (entry.isDirectory()) {
      files.push(...await listSourceFiles(path));
    } else if (sourceExtensions.has(extname(entry.name))) {
      files.push(path);
    }
  }

  return files;
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function parseExampleKeys(source) {
  return sorted(
    source
      .split(/\r?\n/u)
      .map((line) => line.match(/^([A-Z][A-Z0-9_]*)=/u)?.[1])
      .filter(Boolean),
  );
}

function extractFrontendKeys(source) {
  return source.match(/\bVITE_[A-Z][A-Z0-9_]*\b/gu) ?? [];
}

function extractFunctionsKeys(source) {
  const keys = [];
  const patterns = [
    /process\.env\.([A-Z][A-Z0-9_]*)/gu,
    /(?:getOptionalEnv|getRequiredEnv|parsePositiveIntegerEnv)\(\s*["']([A-Z][A-Z0-9_]*)["']/gu,
    /(?:envVar|secretNameEnvVar):\s*["']([A-Z][A-Z0-9_]*)["']/gu,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      keys.push(match[1]);
    }
  }

  return keys;
}

test("environment matrix covers portal and Functions configuration", async () => {
  const matrix = await readFile(matrixPath, "utf8");
  const frontendFiles = [
    ...await listSourceFiles(join(rootDirectory, "apps")),
    ...await listSourceFiles(join(rootDirectory, "shared")),
  ];
  const functionsFiles = await listSourceFiles(join(rootDirectory, "functions/src"));

  const discoveredFrontendKeys = new Set();
  for (const path of frontendFiles) {
    const source = await readFile(path, "utf8");
    extractFrontendKeys(source).forEach((key) => discoveredFrontendKeys.add(key));
  }

  assert.deepEqual(sorted(discoveredFrontendKeys), frontendSourceKeys);

  const discoveredFunctionsKeys = new Set();
  for (const path of functionsFiles) {
    const source = await readFile(path, "utf8");
    extractFunctionsKeys(source).forEach((key) => discoveredFunctionsKeys.add(key));
  }

  assert.deepEqual(
    sorted(discoveredFunctionsKeys),
    sorted([...functionsApplicationKeys, ...functionsPlatformKeys]),
  );

  const documentedKeys = [
    ...frontendSourceKeys,
    ...functionsApplicationKeys,
    ...functionsPlatformKeys,
  ];

  for (const key of new Set(documentedKeys)) {
    assert.match(matrix, new RegExp(`\\b${key}\\b`, "u"), `${key} must be documented`);
  }

  for (const heading of [
    "Development",
    "Test",
    "Staging",
    "Production",
    "Admin",
    "Student",
    "Exam",
    "Vendor",
  ]) {
    assert.match(matrix, new RegExp(`\\b${heading}\\b`, "u"));
  }

  assert.match(matrix, /Staging uses Firebase project `parabolic-dev`/u);
  assert.match(matrix, /same-origin/u);
  assert.match(matrix, /Secret Manager/u);
  assert.match(matrix, /never a server secret/u);
});

test("tracked environment examples match the documented variable surface", async () => {
  for (const [portal, path] of Object.entries(portalExamples)) {
    const source = await readFile(path, "utf8");
    const expectedKeys = sorted([
      ...commonPortalExampleKeys,
      ...portalSpecificExampleKeys[portal],
    ]);

    assert.deepEqual(parseExampleKeys(source), expectedKeys, `${portal} example drifted`);
    assert.doesNotMatch(source, /(PASSWORD|SECRET|PRIVATE_KEY|TOKEN)=/u);
  }

  const functionsExample = await readFile(
    join(rootDirectory, "functions/.env.example"),
    "utf8",
  );
  const expectedFunctionsKeys = sorted([
    ...functionsApplicationKeys,
  ]);

  assert.deepEqual(parseExampleKeys(functionsExample), expectedFunctionsKeys);
  assert.doesNotMatch(functionsExample, /parabolic-prod/u);
  assert.match(functionsExample, /^PROJECT_ID=demo-/mu);

  for (const secretKey of [
    "AI_API_KEY",
    "CDN_SIGNED_URL_KEY_VALUE",
    "EMAIL_PROVIDER_KEY",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
  ]) {
    assert.match(functionsExample, new RegExp(`^${secretKey}=$`, "mu"));
  }
});
