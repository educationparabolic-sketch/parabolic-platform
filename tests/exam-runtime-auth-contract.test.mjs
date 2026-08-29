import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";

const runtimePath = new URL(
  "../apps/exam/src/ExamRuntimeApp.tsx",
  import.meta.url,
);

test("Exam runtime exchanges and removes launch credentials before ID-token APIs", async () => {
  const source = await readFile(runtimePath, "utf8");

  assert.match(source, /payload\.claims/u);
  assert.match(source, /signInWithCustomToken\(getFirebaseAuth\(\), launchCredential\)/u);
  assert.match(source, /sanitizedUrl\.searchParams\.delete\("token"\)/u);
  assert.match(source, /window\.history\.replaceState/u);
  assert.doesNotMatch(source, /token\/refresh/u);
  assert.doesNotMatch(source, /Authorization: `Bearer \$\{launchCredential\}`/u);
  assert.doesNotMatch(source, /skipAuth: true/u);
});

test("Exam entry, answers, and submit handlers require session-bound Firebase identity", async () => {
  const handlerPaths = [
    "../functions/src/api/examSessionEntry.ts",
    "../functions/src/api/examSessionAnswers.ts",
    "../functions/src/api/examSessionSubmit.ts",
  ];
  const sources = await Promise.all(handlerPaths.map(async (handlerPath) =>
    readFile(new URL(handlerPath, import.meta.url), "utf8")));

  for (const source of sources) {
    assert.match(source, /createAuthenticationMiddleware/u);
    assert.match(source, /identity\?\.examSession|identity\.examSession/u);
    assert.match(source, /examSession\.sessionId !== sessionId/u);
  }
});
