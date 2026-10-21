import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import vm from "node:vm";
import test from "node:test";
const require = createRequire(import.meta.url), ts = require("../functions/node_modules/typescript");
const compile = (file, imports = {}) => {
  const source = readFileSync(new URL(file, import.meta.url), "utf8"), exports = {};
  vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText,
    {exports, require: name => {assert.ok(name in imports, name); return imports[name];}, TextEncoder, structuredClone, setTimeout, clearTimeout});
  return exports;
};
const validation = compile("../shared/services/examRecoveryValidation.ts");
const {readLocalSnapshot, mergeAnswerRecovery, readAnswerAcknowledgements, validatePendingAnswers} = compile("../apps/exam/src/answerRecovery.ts", {
  "../../../shared/services/examRecoveryValidation": validation,
});
const {RecoveryStorage} = compile("../apps/exam/src/recoveryStorage.ts");
const scopeHash = "a".repeat(64);
const runtime = {sessionId: "s", mode: "Hard", timingProfile: {minTimeByDifficultySec: {easy: 2}, maxTimeByDifficultySec: {easy: 60}},
  questions: [{id: "q", type: "mcq", difficulty: "easy", options: [{id: "A"}, {id: "B"}], matrixRows: [], matrixColumns: []},
    {id: "n", type: "numeric", difficulty: "easy", options: [], matrixRows: [], matrixColumns: []},
    {id: "m", type: "matrix", difficulty: "easy", options: [], matrixRows: ["R"], matrixColumns: ["C"]}]};
const write = (revision = 1, timestamp = 100, response = {kind: "mcq", optionId: "A"}, questionId = "q") =>
  ({questionId, clientRevision: revision, clientTimestamp: timestamp, response, timeSpentSeconds: 3});
const snapshot = () => ({schemaVersion: 3, scopeHash, sessionId: "s", runtimeGeneration: 1, batchSequence: 2,
  nextClientRevision: 3, lastIssuedClientTimestamp: 200,
  responseStateByQuestionId: Object.fromEntries(runtime.questions.map(q => [q.id, {selectedOptionId: null, numericResponse: "", matrixSelections: [], markedForReview: false}])),
  questionTimingById: Object.fromEntries(runtime.questions.map(q => [q.id, {timeSpentMs: 1000, minTimeSec: 2, maxTimeSec: 60, maxTimeLocked: false, minTimeViolationCount: 0}])),
  pendingAnswerMap: {q: write()}, rejectedAnswerMap: {}, unresolvedQuestionIds: [], selectedQuestionId: "q", visitedQuestionIds: ["q"], hardModeLockedQuestionIds: []});
const projection = (answer = null, locked = false) => ({contractVersion: 1, maxAcceptedClientTimestamp: answer?.clientTimestamp ?? null,
  questions: runtime.questions.map(q => ({questionId: q.id, answer: q.id === "q" ? answer : null, cumulativeTimeSpentSeconds: 5, maxTimeLocked: q.id === "q" && locked}))});
const accepted = w => {const {clientRevision, questionId, ...a} = w; return a;};
const plain = value => JSON.parse(JSON.stringify(value));

test("schema 3 validates complete scope, every nested value, canonical response, counters and bounded bytes", () => {
  assert.deepEqual(plain(readLocalSnapshot(snapshot(), runtime, scopeHash, 2)), snapshot());
  const bad = [s => s.schemaVersion = 2, s => s.runtimeGeneration = 3, s => s.scopeHash = "b".repeat(64), s => s.token = "secret",
    s => s.nextClientRevision = 1, s => s.batchSequence = Infinity, s => s.lastIssuedClientTimestamp = 0,
    s => s.pendingAnswerMap.q.response.optionId = "unknown", s => s.pendingAnswerMap.q.clientTimestamp = NaN,
    s => s.pendingAnswerMap.q.questionId = "n", s => s.pendingAnswerMap.peer = write(),
    s => s.questionTimingById.q.minTimeSec = 0, s => s.questionTimingById.q.timeSpentMs = Infinity,
    s => s.questionTimingById.q.timeSpentMs = 1e100, s => delete s.questionTimingById.m,
    s => s.responseStateByQuestionId.m.matrixSelections = ["other::C"], s => s.responseStateByQuestionId.q.markedForReview = "yes",
    s => s.responseStateByQuestionId.n.numericResponse = "x".repeat(600000), s => s.selectedQuestionId = "peer",
    s => s.visitedQuestionIds = ["q", "q"], s => s.hardModeLockedQuestionIds = ["peer"], s => s.unresolvedQuestionIds = ["n"],
    s => s.rejectedAnswerMap.q = {write: write(), reason: "accepted"}];
  for (const change of bad) {const s = snapshot(); change(s); assert.throws(() => readLocalSnapshot(s, runtime, scopeHash, 2));}
  const types = snapshot(); types.pendingAnswerMap = {n: write(1, 100, {kind: "numeric", value: "1"}, "n"), m: write(2, 200, {kind: "matrix", selections: [{row: "R", column: "C"}]}, "m")};
  assert.doesNotThrow(() => readLocalSnapshot(types, runtime, scopeHash, 2));
  assert.throws(() => validatePendingAnswers([write(1, 100, {kind: "numeric", value: "-"}, "n")], runtime));
  assert.doesNotThrow(() => validatePendingAnswers([write(1, 100, {kind: "numeric", value: "-1"}, "n")], runtime));
  types.pendingAnswerMap.n.response.value = "01"; assert.throws(() => readLocalSnapshot(types, runtime, scopeHash, 2));
});

test("server-first merge reconstructs accepted/cleared answers, preserves only newer pending writes and reports conflicts/locks", () => {
  const local = snapshot(), serverWrite = write(1, 150, {kind: "mcq", optionId: "B"});
  let merged = mergeAnswerRecovery(runtime, projection(accepted(serverWrite)), local);
  assert.equal(merged.responses.q.selectedOptionId, "B"); assert.equal(merged.timings.q.timeSpentMs, 5000);
  assert.equal(merged.rejected.q.reason, "superseded"); assert.equal(Object.keys(merged.pending).length, 0);
  local.pendingAnswerMap.q = write(2, 200); merged = mergeAnswerRecovery(runtime, projection(accepted(serverWrite)), local);
  assert.equal(merged.responses.q.selectedOptionId, "A"); assert.equal(merged.pending.q.clientTimestamp, 200);
  local.pendingAnswerMap.q = write(2, 150); merged = mergeAnswerRecovery(runtime, projection(accepted(serverWrite)), local);
  assert.equal(merged.rejected.q.reason, "conflict"); assert.equal(merged.responses.q.selectedOptionId, "B");
  local.pendingAnswerMap.q = serverWrite; merged = mergeAnswerRecovery(runtime, projection(accepted(serverWrite)), local);
  assert.equal(Object.keys(merged.pending).length, 0); assert.equal(Object.keys(merged.rejected).length, 0);
  local.pendingAnswerMap.q = write(2, 200); merged = mergeAnswerRecovery(runtime, projection(accepted(serverWrite), true), local);
  assert.equal(merged.rejected.q.reason, "locked"); assert.ok(merged.locked.has("q"));
  const clear = accepted(write(2, 210, {kind: "unanswered"}));
  merged = mergeAnswerRecovery(runtime, projection(clear), null);
  assert.equal(merged.responses.q.selectedOptionId, null); assert.equal(merged.highWater, 210);
  assert.equal(mergeAnswerRecovery(runtime, projection(null), null).highWater, 0);
});

const sent = {batchId: "s:2:uuid", batchSequence: 1, answers: [write()]};
const receipt = disposition => ({batchId: sent.batchId, batchSequence: 1,
  acknowledgements: [{questionId: "q", clientRevision: 1, disposition}], persistedQuestionIds: disposition === "persisted" ? ["q"] : [],
  ignoredQuestionIds: disposition === "persisted" ? [] : ["q"], lockedQuestionIds: disposition === "blocked" ? ["q"] : []});
test("acknowledgements require exact unique sent identities and consistent closed dispositions/sets", () => {
  for (const disposition of ["persisted", "ignored", "blocked"]) assert.doesNotThrow(() => readAnswerAcknowledgements(receipt(disposition), sent));
  for (const alter of [r => r.batchId = "old", r => r.batchSequence++, r => r.acknowledgements.push(r.acknowledgements[0]),
    r => r.acknowledgements = [], r => r.acknowledgements[0].clientRevision++, r => r.acknowledgements[0].extra = true,
    r => r.acknowledgements[0].questionId = "peer", r => r.acknowledgements[0].disposition = "synced", r => r.persistedQuestionIds = [],
    r => r.persistedQuestionIds = ["q", "q"], r => r.ignoredQuestionIds = ["q"], r => r.lockedQuestionIds = ["peer"], r => r.blockedQuestionIds = ["q"]]) {
    const r = receipt("persisted"); alter(r); assert.throws(() => readAnswerAcknowledgements(r, sent));
  }
  const blocked = receipt("blocked"); blocked.lockedQuestionIds = []; assert.throws(() => readAnswerAcknowledgements(blocked, sent));
});

// Controllable IDB events prove transaction completion (not request success),
// deadline fencing and cleanup. Mounted browser cases additionally use real IDB.
function database(mode = "complete", initial) {
  let row = initial, puts = 0, removes = 0, aborted = 0;
  const factory = {open() {
    const request = {};
    setTimeout(() => {
      if (mode === "open_hung") return;
      if (mode === "blocked") {request.onblocked(); return;}
      if (mode === "open_error") {request.onerror(); return;}
      const db = {close() {}, transaction() {
        if (mode === "throw") throw new Error("unavailable");
        const tx = {abort() {aborted++; tx.onabort?.();}, objectStore() {return {
          get() {const read = {}; setTimeout(() => {read.result = row; read.onsuccess();
            if (mode === "request_only") return;
            if (mode === "versionchange") {db.onversionchange(); return;}
            setTimeout(() => mode === "abort" ? tx.onabort() : mode === "error" ? tx.onerror() : tx.oncomplete(), 1);
          }, 0); return read;},
          put(v) {puts++; row = v;}, delete() {removes++; row = undefined;},
        };}}; return tx;
      }};
      request.result = db; request.onsuccess();
    }, 0); return request;
  }};
  return {factory, stats: () => ({row, puts, removes, aborted})};
}
test("storage settles blocked/error/abort/versionchange/hung paths, never calls a request-only success durable", async () => {
  for (const mode of ["blocked", "open_error", "open_hung", "throw", "abort", "error", "versionchange", "request_only"]) {
    const db = database(mode), storage = new RecoveryStorage("s", scopeHash, 1, () => true, db.factory, 25);
    assert.equal((await storage.save(snapshot())).state, "memory_only", mode);
  }
  const db = database(), storage = new RecoveryStorage("s", scopeHash, 1, () => true, db.factory, 100);
  assert.equal((await storage.save(snapshot())).state, "ok");
  assert.equal(db.stats().puts, 1);
});
test("storage coalesces obsolete saves, fences clear/late writes, and preserves other/future/unsupported scopes", async () => {
  const db = database(), storage = new RecoveryStorage("s", scopeHash, 2, () => true, db.factory, 100);
  const old = storage.save(snapshot()), newer = snapshot(); newer.batchSequence = 3;
  const [coalesced, committed] = await Promise.all([old, storage.save(newer)]);
  assert.equal(coalesced.state, "memory_only"); assert.equal(coalesced.superseded, true);
  assert.equal(committed.state, "ok");
  assert.equal(db.stats().row.batchSequence, 3); assert.equal(db.stats().puts, 1);
  await storage.clear(); await storage.save(snapshot()); assert.equal(db.stats().row.closed, true); assert.equal(db.stats().removes, 0);
  assert.equal("pendingAnswerMap" in db.stats().row, false); assert.equal((await storage.read()).value, undefined);
  for (const row of [{...snapshot(), scopeHash: "b".repeat(64)}, {...snapshot(), runtimeGeneration: 4}, {schemaVersion: 2, ownerId: "other"}, {schemaVersion: 2, ownerId: "own", runtimeGeneration: 9}]) {
    const other = database("complete", row), store = new RecoveryStorage("s", scopeHash, 2, () => true, other.factory, 100);
    assert.equal((await store.save(snapshot())).state, "memory_only");
    assert.equal((await store.discard("own")).state, "memory_only");
    await store.clear(); assert.equal(other.stats().removes, 0); assert.equal(other.stats().puts, 0);
  }
  const legacy = database("complete", {schemaVersion: 2, ownerId: "own"});
  const store = new RecoveryStorage("s", scopeHash, 2, () => true, legacy.factory, 100);
  assert.equal((await store.discard("own")).state, "ok"); assert.equal(legacy.stats().removes, 1);
  let current = true; const late = database(), fenced = new RecoveryStorage("s", scopeHash, 2, () => current, late.factory, 100);
  const pending = fenced.save(snapshot()); current = false; assert.equal((await pending).state, "memory_only"); assert.equal(late.stats().puts, 0);
});

test("canonical clear persistently fences a separate stale writer and discard for the same scope", async () => {
  const db = database("complete", snapshot());
  const closer = new RecoveryStorage("s", scopeHash, 2, () => true, db.factory, 100);
  const stale = new RecoveryStorage("s", scopeHash, 1, () => true, db.factory, 100);
  await closer.clear();
  assert.equal((await stale.save(snapshot())).state, "memory_only");
  assert.equal((await stale.discard("own")).state, "memory_only");
  const sameGeneration = new RecoveryStorage("s", scopeHash, 2, () => true, db.factory, 100);
  assert.equal((await sameGeneration.save(snapshot())).state, "memory_only");
  assert.equal((await sameGeneration.discard("own")).state, "memory_only");
  assert.equal(db.stats().row.closed, true);
  assert.equal("pendingAnswerMap" in db.stats().row, false);
  assert.equal((await closer.read()).value, undefined);
});
