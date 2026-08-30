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
  assert.match(source, /adaptExamSessionEntryResult/u);
  assert.match(source, /setSessionSnapshot\(responseBody\.runtimeSnapshot\)/u);
  assert.doesNotMatch(source, /function buildSessionSnapshot/u);
  assert.doesNotMatch(source, /inst-build-135|year-build-135|run-build-135/u);
});

test("Exam production runtime consumes the authoritative sanitized entry snapshot", async () => {
  const source = await readFile(runtimePath, "utf8");
  const entryHandler = await readFile(
    new URL("../functions/src/api/examSessionEntry.ts", import.meta.url),
    "utf8",
  );
  const sessionService = await readFile(
    new URL("../functions/src/services/session.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /responseBody\.runtimeSnapshot\.questions/u);
  assert.match(source, /responseBody\.runtimeSnapshot\.timingProfile/u);
  assert.match(source, /toExamSessionSchedule\(sessionSnapshot\)/u);
  assert.match(source, /sessionSnapshot\.proctoringPolicy/u);
  assert.match(entryHandler, /runtimeSnapshot: result\.runtimeSnapshot/u);
  assert.doesNotMatch(entryHandler, /licenseSnapshot: result\.licenseSnapshot/u);
  assert.doesNotMatch(entryHandler, /templateSnapshot: result\.templateSnapshot/u);
  assert.match(sessionService, /buildCandidateSafeRuntimeQuestion/u);
  assert.match(sessionService, /runtime snapshot question ids must exactly match questionTimeMap ids/i);
  assert.match(sessionService, /CANDIDATE_FORBIDDEN_RUNTIME_FIELDS/u);
});

test("Exam runtime lifecycle is server-activated and deadline-authoritative", async () => {
  const source = await readFile(runtimePath, "utf8");
  const answerService = await readFile(
    new URL("../functions/src/services/answerBatch.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /adaptExamSessionActivationResult/u);
  assert.match(source, /\/activate/u);
  assert.match(source, /serverDeadlineMs - serverNowMs/u);
  assert.doesNotMatch(source, /setSessionLifecycleState\("active"\)/u);
  assert.doesNotMatch(source, /setSessionLifecycleState\("expired"\)/u);
  assert.match(answerService, /ACTIVE_WRITE_STATUSES = new Set\(\["active"\]\)/u);
  assert.match(answerService, /session\.deadlineAt/u);
});

test("Exam answers use explicit response shapes and absolute cumulative timing", async () => {
  const source = await readFile(runtimePath, "utf8");
  const answerService = await readFile(
    new URL("../functions/src/services/answerBatch.ts", import.meta.url),
    "utf8",
  );
  const sharedDtos = await readFile(
    new URL("../shared/contracts/apiDtos.d.ts", import.meta.url),
    "utf8",
  );

  assert.match(sharedDtos, /export type ExamQuestionResponse/u);
  assert.match(sharedDtos, /kind: "unanswered"/u);
  assert.match(sharedDtos, /kind: "mcq"; optionId: string/u);
  assert.match(sharedDtos, /kind: "numeric"; value: string/u);
  assert.match(sharedDtos, /kind: "matrix"/u);
  assert.match(source, /timeSpentSeconds/u);
  assert.doesNotMatch(source, /"UNANSWERED"/u);
  assert.match(answerService, /Absolute question time cannot decrease/u);
  assert.match(answerService, /runtime snapshot/u);
});

test("Exam answer recovery serializes revision acknowledgements and drains before submit", async () => {
  const source = await readFile(runtimePath, "utf8");
  const answerHandler = await readFile(
    new URL("../functions/src/api/examSessionAnswers.ts", import.meta.url),
    "utf8",
  );
  const entryHandler = await readFile(
    new URL("../functions/src/api/examSessionEntry.ts", import.meta.url),
    "utf8",
  );
  const sharedDtos = await readFile(
    new URL("../shared/contracts/apiDtos.d.ts", import.meta.url),
    "utf8",
  );

  assert.match(sharedDtos, /clientRevision: number/u);
  assert.match(sharedDtos, /batchSequence: number/u);
  assert.match(sharedDtos, /acknowledgements: ExamAnswerAcknowledgement\[\]/u);
  assert.match(source, /flushInFlightRef/u);
  assert.match(source, /shouldDrainCompletely/u);
  assert.match(source, /currentWrite\?\.clientRevision === acknowledgement\.clientRevision/u);
  assert.match(source, /snapshot\.ownerId !== ownerId/u);
  assert.match(source, /auth\.authStateReady\(\)/u);
  assert.match(answerHandler, /acknowledgements: result\.acknowledgements/u);
  assert.match(entryHandler, /resumeSessionEntry/u);
});

test("Exam entry, activation, answers, and submit require session-bound Firebase identity", async () => {
  const handlerPaths = [
    "../functions/src/api/examSessionEntry.ts",
    "../functions/src/api/examSessionActivate.ts",
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
