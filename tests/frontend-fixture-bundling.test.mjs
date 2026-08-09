import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDirectory = fileURLToPath(new URL("../", import.meta.url));
const adminDirectory = join(rootDirectory, "apps/admin");
const fixtureSelectorPath = join(adminDirectory, "src/features/tests/testTemplateFixtures.ts");
const fixturePayloadPath = join(adminDirectory, "src/features/tests/testTemplateFixtureData.ts");
const fixturePayloadMarker = "PARABOLIC_FIXTURE_PAYLOAD:test-template-question-bank";
const scannableExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".map",
  ".mjs",
  ".ts",
  ".tsx",
]);

async function listScannableFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listScannableFiles(path)));
    } else if (entry.isFile() && scannableExtensions.has(extname(entry.name))) {
      files.push(path);
    }
  }

  return files;
}

async function readArtifact(directory) {
  const files = await listScannableFiles(directory);
  const sources = await Promise.all(files.map((path) => readFile(path, "utf8")));
  return {
    files: files.map((path) => relative(directory, path).replaceAll("\\", "/")),
    source: sources.join("\n"),
  };
}

function buildAdminArtifact(dataMode, outDir) {
  const vitePath = join(adminDirectory, "node_modules/.bin/vite");
  const childEnvironment = { ...process.env };
  delete childEnvironment.NODE_TEST_CONTEXT;
  const result = spawnSync(
    vitePath,
    ["build", "--mode", "production", "--outDir", outDir, "--emptyOutDir"],
    {
      cwd: adminDirectory,
      encoding: "utf8",
      env: {
        ...childEnvironment,
        VITE_API_BASE_URL: "",
        VITE_DATA_MODE: dataMode,
        VITE_EXAM_DEV_MOCK_ENTRY: "false",
      },
      timeout: 120_000,
    },
  );

  assert.equal(
    result.status,
    0,
    `Admin ${dataMode} Vite build failed:\n${result.stdout}\n${result.stderr}`,
  );
}

test("fixture payload is selected only by the compile-time data mode", async () => {
  const selectorSource = await readFile(fixtureSelectorPath, "utf8");
  const payloadSource = await readFile(fixturePayloadPath, "utf8");

  assert.match(
    selectorSource,
    /import\.meta\.env\.VITE_DATA_MODE === "fixture"\s*\?\s*QUESTION_BANK_FIXTURE_DATA\s*:\s*\[\]/u,
  );
  assert.match(payloadSource, new RegExp(fixturePayloadMarker, "u"));

  const portalSourceRoot = join(adminDirectory, "src");
  const portalFiles = await listScannableFiles(portalSourceRoot);
  const payloadImporters = [];
  for (const path of portalFiles) {
    const source = await readFile(path, "utf8");
    if (source.includes("testTemplateFixtureData")) {
      payloadImporters.push(relative(rootDirectory, path).replaceAll("\\", "/"));
    }
  }
  assert.deepEqual(payloadImporters, ["apps/admin/src/features/tests/testTemplateFixtures.ts"]);
});

test("live Admin artifacts omit the isolated fixture payload", async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "parabolic-fixture-bundle-"));
  const liveDirectory = join(temporaryDirectory, "live");
  const fixtureDirectory = join(temporaryDirectory, "fixture");

  try {
    buildAdminArtifact("live", liveDirectory);
    buildAdminArtifact("fixture", fixtureDirectory);

    const liveArtifact = await readArtifact(liveDirectory);
    const fixtureArtifact = await readArtifact(fixtureDirectory);

    assert.doesNotMatch(liveArtifact.source, new RegExp(fixturePayloadMarker, "u"));
    assert.doesNotMatch(
      liveArtifact.files.join("\n"),
      /testTemplateFixtureData/u,
      "live build must not emit a standalone fixture payload chunk",
    );
    assert.match(fixtureArtifact.source, new RegExp(fixturePayloadMarker, "u"));
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
