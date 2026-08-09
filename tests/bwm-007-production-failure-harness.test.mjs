import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDirectory = fileURLToPath(new URL("../", import.meta.url));

test("BWM-007 browser harness uses live builds and real emulator/browser failures", async () => {
  const runnerSource = await readFile(
    join(rootDirectory, "scripts/run-bwm-007-failure-e2e.mjs"),
    "utf8",
  );
  const generatorSource = await readFile(
    join(rootDirectory, "scripts/prepare-bwm-007-failure-verification.mjs"),
    "utf8",
  );
  const functionSource = await readFile(
    join(rootDirectory, "verification/bwm-007/functions/index.js"),
    "utf8",
  );
  const browserSource = await readFile(
    join(rootDirectory, "tests/e2e/bwm-007-production-failures.spec.mjs"),
    "utf8",
  );

  assert.match(runnerSource, /VITE_DATA_MODE: "live"/u);
  assert.match(runnerSource, /functions,hosting:portal/u);
  assert.match(runnerSource, /demo-parabolic-test/u);
  assert.match(generatorSource, /\.firebase\/hosting\/portal/u);
  assert.match(generatorSource, /functions\/node_modules/u);
  assert.match(runnerSource, /bwm-007-failure-verification/u);
  assert.match(functionSource, /require\("firebase-functions"\)/u);
  assert.match(functionSource, /status\(500\)/u);
  assert.match(functionSource, /code: "INTERNAL_ERROR"/u);
  assert.match(browserSource, /context\.setOffline\(true\)/u);
  assert.match(browserSource, /Fixture data has not been substituted/u);
  assert.match(browserSource, /JEE Mock A - Physics Focus/u);
  assert.doesNotMatch(browserSource, /page\.route|route\.fulfill|route\.abort/u);
});
