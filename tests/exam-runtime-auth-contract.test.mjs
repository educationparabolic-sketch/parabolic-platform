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
  const bootstrap = await readFile(new URL("../apps/exam/src/bootstrap.ts", import.meta.url), "utf8");
  const capture = await readFile(new URL("../apps/exam/src/launchBootstrap.ts", import.meta.url), "utf8");
  const transport = await readFile(new URL("../apps/exam/src/launchTransport.ts", import.meta.url), "utf8");
  assert.ok(bootstrap.indexOf("initializeLaunchBootstrap(import") < bootstrap.indexOf('import("./main")'));
  assert.match(capture, /window\.history\.replaceState/u);
  assert.match(transport, /signInWithCustomToken\(auth, token\)/u);
  assert.match(transport, /operation: "launch"/u);
  assert.match(transport, /finally/u);
  assert.match(transport, /command\.token = ""/u);
  assert.doesNotMatch(source, /launchCredential|tokenFromQuery|useLayoutEffect/u);
  assert.doesNotMatch(source, /token\/refresh/u);
  assert.doesNotMatch(source, /Authorization: `Bearer \$\{launchCredential\}`/u);
  assert.doesNotMatch(source, /skipAuth: true/u);
  assert.match(source, /runtimeOwnership\.start\(\)/u);
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
  assert.match(source, /mergeAnswerRecovery\(responseBody\.runtimeSnapshot, responseBody\.recovery, null\)/u);
  const recovery = await readFile(new URL("../apps/exam/src/answerRecovery.ts", import.meta.url), "utf8");
  assert.match(recovery, /runtime\.timingProfile\.minTimeByDifficultySec/u);
  assert.match(recovery, /runtime\.timingProfile\.maxTimeByDifficultySec/u);
  assert.match(source, /toExamSessionSchedule\(sessionSnapshot\)/u);
  assert.match(source, /sessionSnapshot\.proctoringPolicy/u);
  assert.match(entryHandler, /runtimeSnapshot: projectExamRuntimeAssets\(\s*result\.runtimeSnapshot, result\.instituteId/u);
  const assets = await readFile(new URL("../functions/src/services/examRuntimeAssets.ts", import.meta.url), "utf8");
  assert.match(assets, /accessContext: "examSession"/u);
  assert.match(assets, /question\.imageUrl\.startsWith\(prefix\)/u);
  assert.doesNotMatch(assets, /getFirestore|collection\(|solutionImageUrl/u);
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
  assert.match(source, /runtimeClockRef\.current\.accept/u);
  const clock = await readFile(new URL("../apps/exam/src/runtimeClock.ts", import.meta.url), "utf8");
  assert.match(clock, /end - server - \(receivedAt - sentAt\)/u);
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
  const shell = await readFile(new URL("../apps/exam/src/App.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(shell, /UiDataStateBoundary/u);
  assert.match(source, /serverEntryValidationStatus === "pending"/u);
  assert.match(source, /if \(authorityInterruption\)/u);
  assert.match(source, /flushInFlightRef/u);
  assert.match(source, /reason === "reconnect" \|\| reason === "submission"/u);
  assert.match(source, /next\[ack\.questionId\]\?\.clientRevision === ack\.clientRevision/u);
  assert.match(source, /readLocalSnapshot/u);
  const recovery = await readFile(new URL("../apps/exam/src/answerRecovery.ts", import.meta.url), "utf8");
  assert.match(recovery, /value\.scopeHash !== scopeHash/u);
  assert.match(recovery, /positive\(value\.runtimeGeneration\) > generation/u);
  // Schema-3 recovery preserves full identity scope and generation fencing.
  assert.doesNotMatch(source, /resume:\s*true/u);
  assert.match(answerHandler, /acknowledgements: result\.acknowledgements/u);
  assert.match(entryHandler, /resumeSessionEntry/u);
});

test("Exam submission uses the strict shared contract and renders server authority", async () => {
  const source = await readFile(runtimePath, "utf8");
  const submitHandler = await readFile(
    new URL("../functions/src/api/examSessionSubmit.ts", import.meta.url),
    "utf8",
  );
  const submissionService = await readFile(
    new URL("../functions/src/services/submission.ts", import.meta.url),
    "utf8",
  );
  const sharedDtos = await readFile(
    new URL("../shared/contracts/apiDtos.d.ts", import.meta.url),
    "utf8",
  );

  assert.match(sharedDtos, /export interface ExamSubmitRequestBody/u);
  assert.match(sharedDtos, /reason: ExamSubmissionReason/u);
  assert.match(sharedDtos, /export interface ExamSubmitResult/u);
  assert.match(sharedDtos, /alreadySubmitted: boolean/u);
  assert.match(source, /const requestBody: ExamSubmitRequestBody/u);
  assert.match(source, /setSubmittedAtIso\(responseBody\.submittedAt\)/u);
  assert.match(source, /Authoritative submission metrics/u);
  assert.match(source, /submissionResult\.rawScorePercent/u);
  assert.doesNotMatch(source, /setSubmittedAtIso\(new Date/u);
  assert.match(submitHandler, /Unexpected submission field/u);
  assert.match(submitHandler, /buildSubmissionResponseData/u);
  assert.match(submissionService, /alreadySubmitted: result\.idempotent/u);
  assert.match(submissionService, /waitForSubmittedResult/u);
  assert.match(submissionService, /Timestamp\.fromMillis\(serverSubmittedAtMillis\)/u);
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
