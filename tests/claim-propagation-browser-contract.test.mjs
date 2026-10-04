import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("BWM-036 browser proof is multi-origin, live, and free of fulfilled API mocks", async () => {
  const [proof, runner, packageSource] = await Promise.all([
    read("tests/e2e/claim-propagation-browser.spec.mjs"),
    read("scripts/run-claim-propagation-browser-e2e.mjs"),
    read("package.json"),
  ]);

  for (const boundary of [
    "Institute access suspended",
    "Exam paused after a license change",
    "Exam session authorization ended",
    "authorizationVersion",
    "browserConvergenceMs",
    "serverConvergenceMs",
    "pendingAnswerCount",
    "activeStudentLimit",
    "concurrentSessionLimit",
    "noBrowserAuthorityKeys",
  ]) {
    assert.ok(proof.includes(boundary), boundary);
  }
  assert.match(proof, /portalOrigin = "http:\/\/127\.0\.0\.1:5000"/u);
  assert.match(proof, /examOrigin = process\.env\.PARABOLIC_EXAM_E2E_ORIGIN/u);
  assert.match(runner, /hosting:portal,hosting:exam/u);
  assert.match(runner, /VITE_DATA_MODE: "live"/u);
  assert.match(runner, /VITE_EXAM_DEV_MOCK_ENTRY: "false"/u);
  assert.match(packageSource, /test:claim-propagation-browser:e2e/u);
  assert.doesNotMatch(proof, /route\.fulfill|page\.route|context\.route/u);
});
