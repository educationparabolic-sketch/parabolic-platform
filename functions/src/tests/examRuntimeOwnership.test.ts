/* eslint-disable max-len */
import assert from "node:assert/strict";
import test from "node:test";
import {createHash, randomBytes, randomUUID} from "node:crypto";
import {Timestamp} from "firebase-admin/firestore";
import {projectExamRecovery, ExamRecoveryError} from "../services/examRecovery";
import type {ExamRuntimeSnapshot} from "../../../shared/contracts/apiDtos";
import {assertRuntimeReconciliationOwner, assertRuntimeOwner, assertUniqueCommandJson, closeRuntimeOwnership, entryBinding,
  parseRuntimeCommand, planRuntimeCommand, runtimeHeaders, RuntimeOwnershipError} from "../services/examRuntimeOwnership";

const identity = {instituteId: "i", yearId: "y", runId: "r", sessionId: "s", studentId: "student", studentUid: "uid", launchNonce: "nonce"};
const proof = () => randomBytes(32).toString("base64url");
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const rejects = (fn: () => unknown, reason: string) => assert.throws(fn, (error: unknown) => error instanceof RuntimeOwnershipError && error.reason === reason);
function fixture() {
  const token = "signed-launch";
  const command = {operation: "launch" as const, token, commandId: randomUUID(), nextOwnerProof: proof()};
  const data: Record<string, unknown> = {...identity, status: "created", runtimeOwnershipVersion: 2,
    launchCredentialHashes: [hash(token)], consumedLaunchCredentialHashes: []};
  const plan = planRuntimeCommand(data, identity, command, {}, 1_000);
  Object.assign(data, {status: "started", runtimeOwnership: plan.owner, identityStatusEntryBindings: [entryBinding(identity)],
    launchCredentialHashes: [], consumedLaunchCredentialHashes: [hash(token)]});
  const runtimeOwner = {...identity, proof: command.nextOwnerProof, generation: 1};
  return {data, command, runtimeOwner};
}
test("one-time acquisition permits only exact same-owner retry and never extends the lease", () => {
  const {data, command, runtimeOwner} = fixture();
  const replay = planRuntimeCommand(data, identity, command, {}, 2_000);
  assert.equal(replay.replayed, true); assert.equal(Date.parse(replay.receipt.expiresAt), 91_000);
  rejects(() => planRuntimeCommand(data, identity, {...command, nextOwnerProof: proof()}, {}, 2_000), "ownership_lost");
  rejects(() => planRuntimeCommand(data, identity, {...command, commandId: randomUUID()}, {}, 2_000), "entry_not_consumed");
  assertRuntimeOwner(data, {...identity, runtimeOwner}, 2_000);
  rejects(() => assertRuntimeOwner(data, {...identity, runtimeOwner}, 91_000), "ownership_lost");
  const persisted = JSON.stringify(data);
  assert.equal(persisted.includes(command.nextOwnerProof), false); assert.equal(persisted.includes(command.token), false);
});
test("recovery rotates ownership, fences clones and supports the exact lost-response command", () => {
  const {data, command, runtimeOwner} = fixture();
  const recovery = {operation: "recover" as const, commandId: randomUUID(), previous: {pendingCommandId: command.commandId}, nextOwnerProof: proof()};
  const supplied = {proof: runtimeOwner.proof};
  const plan = planRuntimeCommand(data, identity, recovery, supplied, 3_000);
  data.runtimeOwnership = plan.owner;
  assert.equal(plan.owner.generation, 2);
  const retry = planRuntimeCommand(data, identity, recovery, supplied, 4_000);
  assert.equal(retry.replayed, true); assert.equal(retry.receipt.expiresAt, plan.receipt.expiresAt);
  rejects(() => assertRuntimeOwner(data, {...identity, runtimeOwner}, 4_000), "ownership_lost");
  rejects(() => planRuntimeCommand(data, identity, {...recovery, commandId: randomUUID(), nextOwnerProof: proof()}, supplied, 4_000), "ownership_lost");
  rejects(() => planRuntimeCommand(data, {...identity, launchNonce: "unconsumed"}, recovery, supplied, 4_000), "entry_not_consumed");
});
test("renew/release/expiry/terminal replay remain fenced and generation overflow fails closed", () => {
  const {data, runtimeOwner} = fixture();
  const supplied = {proof: runtimeOwner.proof, generation: 1};
  const renewed = planRuntimeCommand(data, identity, {operation: "renew", commandId: randomUUID()}, supplied, 30_000);
  data.runtimeOwnership = renewed.owner;
  assert.equal(renewed.owner.expiresAt.toMillis(), 120_000);
  rejects(() => planRuntimeCommand(data, identity, {operation: "renew", commandId: randomUUID()}, supplied, 120_000), "ownership_lost");
  const lateRelease = planRuntimeCommand(data, identity, {operation: "release", commandId: randomUUID()}, supplied, 120_000);
  assert.equal(lateRelease.owner.state, "released");
  const released = planRuntimeCommand(data, identity, {operation: "release", commandId: randomUUID()}, supplied, 40_000);
  data.runtimeOwnership = released.owner;
  rejects(() => assertRuntimeOwner(data, {...identity, runtimeOwner}, 40_000), "ownership_lost");
  rejects(() => planRuntimeCommand(data, identity, {operation: "recover", commandId: randomUUID(), previous: {generation: 1}, nextOwnerProof: proof()}, supplied, 40_000), "ownership_lost");
  data.runtimeOwnership = {...renewed.owner, generation: Number.MAX_SAFE_INTEGER, lastCommand: {...renewed.owner.lastCommand, generation: Number.MAX_SAFE_INTEGER}};
  rejects(() => planRuntimeCommand(data, identity, {operation: "recover", commandId: randomUUID(), previous: {generation: Number.MAX_SAFE_INTEGER}, nextOwnerProof: proof()}, supplied, 40_000), "invalid_ownership_request");
  data.runtimeOwnership = renewed.owner;
  Object.assign(data, closeRuntimeOwnership(data, 40_000), {status: "submitted"});
  assertRuntimeOwner(data, {...identity, runtimeOwner}, 999_000, true);
  rejects(() => assertRuntimeOwner(data, {...identity, runtimeOwner}, 999_000), "session_closed");
  rejects(() => assertRuntimeOwner({...data, runtimeOwnershipVersion: undefined}, {...identity, runtimeOwner}, 40_000), "ownership_upgrade_required");
});
test("closed input validation rejects duplicate keys/headers, ambiguous recovery and client authority", () => {
  for (const invalid of [{resume: true}, {operation: "renew", commandId: randomUUID(), force: true},
    {operation: "recover", commandId: randomUUID(), nextOwnerProof: proof(), previous: {generation: 1, pendingCommandId: randomUUID()}}]) rejects(() => parseRuntimeCommand(invalid), "invalid_ownership_request");
  for (const json of ["{\"operation\":\"renew\",\"operation\":\"release\"}", "{\"previous\":{\"generation\":1,\"gener\\u0061tion\":2}}"]) rejects(() => assertUniqueCommandJson(Buffer.from(json)), "invalid_ownership_request");
  assertUniqueCommandJson(Buffer.from("{\"previous\":{\"generation\":1},\"commandId\":\"a\"}"));
  rejects(() => runtimeHeaders({headers: {"x-parabolic-exam-owner": proof(), "x-parabolic-exam-generation": "01"}}), "invalid_ownership_request");
  rejects(() => runtimeHeaders({headers: {}, rawHeaders: ["X-Parabolic-Exam-Owner", proof(), "x-parabolic-exam-owner", proof()]}), "invalid_ownership_request");
  const {data, runtimeOwner} = fixture();
  rejects(() => assertRuntimeOwner(data, {...identity, runtimeOwner: {...runtimeOwner, proof: proof()}}, 1_001), "invalid_owner");
  const owner = data.runtimeOwnership as {expiresAt: Timestamp};
  assert.ok(owner.expiresAt instanceof Timestamp);
});

test("candidate recovery reconstructs clears and canonical responses without private answer metadata", () => {
  const q = {id: "q", type: "mcq", options: [{id: "A"}], matrixRows: [], matrixColumns: []};
  const snapshot = {mode: "Hard", questions: [q]} as unknown as ExamRuntimeSnapshot;
  const data = {mode: "Hard", answerMap: {}, questionTimeMap: {q: {cumulativeTimeSpent: 10, maxTime: 10}}};
  assert.deepEqual(projectExamRecovery(data, snapshot), {contractVersion: 1,
    maxAcceptedClientTimestamp: null, questions: [{questionId: "q", answer: null,
      cumulativeTimeSpentSeconds: 10, maxTimeLocked: true}]});
  for (const response of [{kind: "unanswered"}, {kind: "mcq", optionId: "A"}]) {
    const accepted = {clientTimestamp: 123, response, timeSpentSeconds: 5};
    const source = {...data, answerMap: {q: {...accepted, selectedOption: "A", internalNotes: "HIDDEN"}}};
    const projected = projectExamRecovery(source, snapshot);
    assert.deepEqual(projected.questions[0].answer, accepted);
    assert.equal(projected.maxAcceptedClientTimestamp, 123);
    assert.doesNotMatch(JSON.stringify(projected), /HIDDEN|selectedOption|correctAnswer|proof/u);
  }
  for (const [question, response] of [
    [{...q, type: "numeric"}, {kind: "numeric", value: "12.5"}],
    [{...q, type: "matrix", matrixRows: ["r"], matrixColumns: ["c"]},
      {kind: "matrix", selections: [{row: "r", column: "c"}]}],
  ]) {
    const result = projectExamRecovery({...data, answerMap: {q: {clientTimestamp: 123,
      response, timeSpentSeconds: 5}}}, {...snapshot, questions: [question]} as unknown as ExamRuntimeSnapshot);
    assert.deepEqual(result.questions[0].answer?.response, response);
  }
});

test("recovery rejects corrupted, unknown, noncanonical and oversized state without truncation", () => {
  const q = {id: "q", type: "mcq", options: [{id: "A"}], matrixRows: [], matrixColumns: []};
  const snapshot = {mode: "Diagnostic", questions: [q]} as unknown as ExamRuntimeSnapshot;
  const answer = {clientTimestamp: 123, response: {kind: "mcq", optionId: "A"}, timeSpentSeconds: 5};
  const data = {mode: "Diagnostic", answerMap: {q: answer}, questionTimeMap: {q: {cumulativeTimeSpent: 5, maxTime: 60}}};
  for (const invalid of [{...data, answerMap: undefined}, {...data, answerMap: {other: answer}},
    {...data, questionTimeMap: {}}, {...data, answerMap: {q: {...answer, clientTimestamp: 0}}},
    {...data, answerMap: {q: {...answer, timeSpentSeconds: 6}}},
    {...data, answerMap: {q: {...answer, response: {kind: "mcq", optionId: "B"}}}},
    {...data, answerMap: {q: {...answer, response: {kind: "unanswered", correctAnswer: "A"}}}}]) {
    assert.throws(() => projectExamRecovery(invalid, snapshot), (e: unknown) =>
      e instanceof ExamRecoveryError && e.reason === "recovery_state_invalid");
  }
  const many = Array.from({length: 500}, (_, i) => ({...q, id: `q${i}`}));
  const full = {mode: "Diagnostic", answerMap: {}, questionTimeMap: Object.fromEntries(many.map((q) =>
    [q.id, {cumulativeTimeSpent: 0, maxTime: 60}]))};
  assert.equal(projectExamRecovery(full, {...snapshot, questions: many} as unknown as ExamRuntimeSnapshot).questions.length, 500);
  assert.throws(() => projectExamRecovery(full, {...snapshot, questions: [...many, q]} as unknown as ExamRuntimeSnapshot));
  const rows = Array.from({length: 3000}, (_, i) => `${String(i).padStart(4, "0")}${"x".repeat(90)}`);
  const matrix = {...q, type: "matrix", matrixRows: rows, matrixColumns: ["c"]};
  assert.throws(() => projectExamRecovery({...data, answerMap: {q: {...answer, response: {kind: "matrix",
    selections: rows.map((row) => ({row, column: "c"}))}}}}, {...snapshot, questions: [matrix]} as unknown as ExamRuntimeSnapshot),
  (e: unknown) => e instanceof ExamRecoveryError && e.reason === "recovery_unavailable");
  assert.deepEqual(parseRuntimeCommand({operation: "reconcile", contractVersion: 1}),
    {operation: "reconcile", contractVersion: 1});
  for (const body of [{operation: "reconcile", contractVersion: 2},
    {operation: "reconcile", contractVersion: 1, commandId: randomUUID()},
    {operation: "reconcile", contractVersion: 1, force: true}]) {
    rejects(() => parseRuntimeCommand(body), "invalid_ownership_request");
  }
});

test("only exact expired held reconciliation discloses recoverable lease expiry", () => {
  const {data, runtimeOwner} = fixture();
  rejects(() => assertRuntimeReconciliationOwner(data, {...identity, runtimeOwner}, 91_000), "lease_expired");
  rejects(() => assertRuntimeReconciliationOwner(data, {...identity, runtimeOwner: {...runtimeOwner, proof: proof()}}, 91_000), "invalid_owner");
  rejects(() => assertRuntimeReconciliationOwner(data, {...identity, runtimeOwner: {...runtimeOwner, generation: 2}}, 91_000), "ownership_lost");
  data.runtimeOwnership = {...data.runtimeOwnership as object, state: "released"};
  rejects(() => assertRuntimeReconciliationOwner(data, {...identity, runtimeOwner}, 91_000), "ownership_lost");
});
