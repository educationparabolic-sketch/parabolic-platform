import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFileSync, readdirSync} from "node:fs";
import {fileURLToPath} from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("../functions/node_modules/typescript");
const root = fileURLToPath(new URL("../", import.meta.url));

test("reserved reconciliation discriminants and privacy compile in both toolchains", () => {
  const source = `
    import type {ExamReconcileRequestV1 as Request, ExamReconcileResultV1 as Result,
      ExamAnswerRecoveryV1, StudentResultReadinessV1 as Readiness,
      ExamRecoveryDurabilityV1, ExamResilienceFailureV1}
      from "../shared/contracts/examResilience.js";
    const request: Request = {operation: "reconcile", contractVersion: 1};
    // @ts-expect-error no guessed UID-only recovery
    const uid: Request = {...request, studentUid: "other"};
    // @ts-expect-error cannot grant a lease or force a takeover
    const force: Request = {...request, nextOwnerProof: "new", force: true};
    // @ts-expect-error no future version silently accepted
    const version: Request = {operation: "reconcile", contractVersion: 2};
    const recovery: ExamAnswerRecoveryV1 = {contractVersion: 1,
      maxAcceptedClientTimestamp: null, questions: [{questionId: "q", answer: null,
        cumulativeTimeSpentSeconds: 0, maxTimeLocked: false}]};
    const clear: ExamAnswerRecoveryV1["questions"][number] = {questionId: "q",
      answer: {clientTimestamp: 123, response: {kind: "unanswered"}, timeSpentSeconds: 4},
      cumulativeTimeSpentSeconds: 4, maxTimeLocked: false};
    // @ts-expect-error no scoring keys in recovered candidate answers
    const secret: typeof clear = {...clear, correctAnswer: "A"};
    // @ts-expect-error no proof/hash or token in projection
    const proof: ExamAnswerRecoveryV1 = {...recovery, ownerProofHash: "secret"};
    declare const result: Result;
    if (result.status === "submitted") {
      const replay: true = result.submission.alreadySubmitted;
      const status: "submitted" = result.submission.status;
      // @ts-expect-error terminal receipt cannot grant recovery answers
      result.recovery.questions;
    }
    if (result.status === "terminated") {
      // @ts-expect-error termination is not submission success
      result.submission.submittedAt;
    }
    if (result.status === "started") {
      const deadline: null = result.deadlineAt;
      const pending: ExamAnswerRecoveryV1 = result.recovery;
    }
    // @ts-expect-error an active session must have persisted start authority
    const missingStart: Extract<Result, {status: "active"}>["startedAt"] = null;
    // @ts-expect-error no returned owner proof or lease authority
    result.ownership;
    const unknown: Readiness = {state: "unknown", sessionId: null, retryAfterSeconds: 0};
    const processing: Readiness = {state: "processing", sessionId: "s", retryAfterSeconds: 2};
    const ready: Readiness = {state: "available", sessionId: "s", retryAfterSeconds: 0};
    // @ts-expect-error absent marker cannot imply a session
    const invented: Readiness = {state: "unknown", sessionId: "s", retryAfterSeconds: 0};
    // @ts-expect-error no failed verdict without persisted evidence
    const failed: Readiness = {state: "failed", sessionId: "s", retryAfterSeconds: 0};
    // @ts-expect-error server processing hint is the existing two seconds
    const hint: Readiness = {...processing, retryAfterSeconds: 5};
    const disk: ExamRecoveryDurabilityV1 = "durable";
    const memory: ExamRecoveryDurabilityV1 = "memory_only";
    // @ts-expect-error disk completion is never a server acknowledgement
    const accepted: ExamRecoveryDurabilityV1 = "server_accepted";
    const unavailable: ExamResilienceFailureV1 = {code: "SESSION_LOCKED", reason: "recovery_unavailable"};
    // @ts-expect-error invalid recovery is not terminal Firebase revocation
    const revoked: ExamResilienceFailureV1 = {code: "UNAUTHORIZED", reason: "recovery_state_invalid"};
  `;
  for (const [moduleResolution, module] of [
    [ts.ModuleResolutionKind.Bundler, ts.ModuleKind.ESNext],
    [ts.ModuleResolutionKind.NodeNext, ts.ModuleKind.NodeNext],
  ]) {
    const file = `${root}tests/__exam_resilience_probe.ts`;
    const options = {strict: true, noEmit: true, types: [], target: ts.ScriptTarget.ES2022,
      moduleResolution, module};
    const host = ts.createCompilerHost(options);
    const original = host.getSourceFile.bind(host);
    host.getSourceFile = (name, version, onError, fresh) => name === file ?
      ts.createSourceFile(file, source, version, true) : original(name, version, onError, fresh);
    const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([file], options, host));
    assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCurrentDirectory: () => root, getCanonicalFileName: (name) => name, getNewLine: () => "\n",
    }));
  }
});

test("contract remains declaration-only, deployment mirror agrees and mounted adoption stays bounded", () => {
  const declaration = readFileSync(`${root}shared/contracts/examResilience.d.ts`, "utf8");
  const ast = ts.createSourceFile("resilience.d.ts", declaration, ts.ScriptTarget.Latest, true);
  assert.ok(ast.statements.every(node => ts.isImportDeclaration(node) ||
    ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)));
  for (const folder of ["apps/admin/src", "apps/vendor/src",
    ]) {
    for (const file of readdirSync(`${root}${folder}`, {recursive: true})) {
      if (/\.[cm]?[jt]sx?$/u.test(file)) {
        assert.doesNotMatch(readFileSync(`${root}${folder}/${file}`, "utf8"), /["'][^"']*examResilience(?:\.js)?["']/u);
      }
    }
  }
  const studentSource = readFileSync(`${root}apps/student/src/services/studentResultRecovery.ts`, "utf8");
  const studentAst = ts.createSourceFile("student.ts", studentSource, ts.ScriptTarget.Latest, true);
  for (const node of studentAst.statements) {
    if (ts.isImportDeclaration(node) && node.moduleSpecifier.text.endsWith("examResilience")) assert.equal(node.importClause.isTypeOnly, true);
  }
  assert.match(readFileSync(`${root}apps/exam/src/answerRecovery.ts`, "utf8"), /readExamAnswerRecovery/u);
  assert.match(readFileSync(`${root}apps/exam/src/ExamRuntimeApp.tsx`, "utf8"), /readLocalSnapshot/u);
  const mirror = readFileSync(`${root}functions/src/services/examRecoveryValidation.ts`, "utf8").split("\n").slice(1).join("\n").replaceAll("../../../shared/contracts/", "../contracts/");
  assert.equal(mirror, readFileSync(`${root}shared/services/examRecoveryValidation.ts`, "utf8"));
  assert.match(readFileSync(`${root}functions/src/services/submissionAnalyticsTrigger.ts`, "utf8"),
    /RESULT_PROPAGATION_RETRY_AFTER_SECONDS = 2/u);
});
