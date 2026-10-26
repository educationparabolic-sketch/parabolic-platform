import assert from 'node:assert/strict';
import test from 'node:test';
import {loadProduction} from './helpers/frontend-production-modules.mjs';
import {answers, clock, entry} from './helpers/exam-behavior-modules.mjs';
const scopeHash = 'a'.repeat(64);
const write = (questionId, response, clientRevision = 1, clientTimestamp = 100) => ({questionId, response, clientRevision, clientTimestamp, timeSpentSeconds: 0});
const runtime = () => ({...entry().runtimeSnapshot, questions: [entry().runtimeSnapshot.questions[0],
  {...entry().runtimeSnapshot.questions[0], id: 'n', type: 'numeric', options: []},
  {...entry().runtimeSnapshot.questions[0], id: 'm', type: 'matrix', options: [], matrixRows: ['R'], matrixColumns: ['C']}]});
function snapshot(r) {
  return {schemaVersion: 3, sessionId: r.sessionId, scopeHash, runtimeGeneration: 1, batchSequence: 1, nextClientRevision: 4, lastIssuedClientTimestamp: 300,
    responseStateByQuestionId: Object.fromEntries(r.questions.map(q => [q.id, answers.emptyResponse()])),
    questionTimingById: Object.fromEntries(r.questions.map(q => [q.id, {timeSpentMs: 7000, minTimeSec: 30, maxTimeSec: 60, maxTimeLocked: false, minTimeViolationCount: 0}])),
    pendingAnswerMap: {}, rejectedAnswerMap: {}, unresolvedQuestionIds: [], visitedQuestionIds: ['q'], hardModeLockedQuestionIds: [], selectedQuestionId: 'q'};
}

test('typed server-first recovery preserves numeric and matrix truth, clear intent, review flags and immutable local counters', () => {
  const r = runtime(), local = snapshot(r);
  local.responseStateByQuestionId.n.markedForReview = true;
  local.pendingAnswerMap = {q: write('q', {kind: 'unanswered'}, 3, 300), n: write('n', {kind: 'numeric', value: '-1'}, 2, 200)};
  const server = {contractVersion: 1, maxAcceptedClientTimestamp: 250, questions: [
    {questionId: 'q', answer: {response: {kind: 'mcq', optionId: 'A'}, clientTimestamp: 100, timeSpentSeconds: 0}, cumulativeTimeSpentSeconds: 5, maxTimeLocked: false},
    {questionId: 'n', answer: {response: {kind: 'numeric', value: '0'}, clientTimestamp: 250, timeSpentSeconds: 0}, cumulativeTimeSpentSeconds: 10, maxTimeLocked: false},
    {questionId: 'm', answer: {response: {kind: 'matrix', selections: [{row: 'R', column: 'C'}]}, clientTimestamp: 200, timeSpentSeconds: 0}, cumulativeTimeSpentSeconds: 0, maxTimeLocked: true}]};
  const validated = answers.readLocalSnapshot(local, r, scopeHash, 2), original = structuredClone(local), projection = structuredClone(server);
  const result = answers.mergeAnswerRecovery(r, server, validated);
  assert.equal(result.responses.q.selectedOptionId, null); assert.equal(result.pending.q.response.kind, 'unanswered');
  assert.equal(result.responses.n.numericResponse, '0'); assert.equal(result.responses.n.markedForReview, true); assert.equal(result.rejected.n.reason, 'superseded');
  assert.deepEqual(result.responses.m.matrixSelections, ['R::C']); assert.ok(result.locked.has('m'));
  assert.equal(result.timings.n.timeSpentMs, 10000); assert.equal(result.timings.q.timeSpentMs, 7000); assert.equal(result.highWater, 300);
  assert.deepEqual(local, original); assert.deepEqual(server, projection);
  local.pendingAnswerMap.q.response = {kind: 'numeric', value: '0'};
  assert.throws(() => answers.readLocalSnapshot(local, r, scopeHash, 2));
});

test('mixed acknowledgement ordering is explicit and ignored or blocked writes cannot masquerade as persisted', () => {
  const sent = {batchId: 'batch-a', batchSequence: 3, answers: [write('q', {kind: 'mcq', optionId: 'A'}), write('n', {kind: 'numeric', value: '0'}, 2), write('m', {kind: 'matrix', selections: []}, 3)]};
  const receipt = {batchId: 'batch-a', batchSequence: 3, acknowledgements: [
    {questionId: 'm', clientRevision: 3, disposition: 'blocked'}, {questionId: 'q', clientRevision: 1, disposition: 'persisted'}, {questionId: 'n', clientRevision: 2, disposition: 'ignored'}],
    persistedQuestionIds: ['q'], ignoredQuestionIds: ['n', 'm'], lockedQuestionIds: ['m'], blockedQuestionIds: ['m']};
  assert.deepEqual(answers.readAnswerAcknowledgements(receipt, sent), receipt);
  for (const change of [r => {r.persistedQuestionIds.push('n');}, r => {r.ignoredQuestionIds = ['m'];}, r => {r.blockedQuestionIds = [];},
    r => {r.acknowledgements[0].clientRevision = 2;}, r => {r.acknowledgements[1] = r.acknowledgements[0];}, r => {r.batchSequence = 2;}]) {
    const bad = structuredClone(receipt); change(bad); assert.throws(() => answers.readAnswerAcknowledgements(bad, sent));
  }
});

test('storage captures enqueued snapshot bytes but waits for transaction completion and current authority before durable success', async () => {
  const {RecoveryStorage} = loadProduction('apps/exam/src/recoveryStorage.ts');
  const flush = async () => {for (let i = 0; i < 12; i++) await Promise.resolve();};
  for (const loseAuthority of [false, true]) {
    let current = true, transaction, stored;
    const factory = {open() {const request = {}; queueMicrotask(() => {request.result = {close() {}, transaction() {
      transaction = {objectStore: () => ({get() {const read = {}; queueMicrotask(() => {read.result = undefined; read.onsuccess();}); return read;}, put: value => {stored = value;}})};
      return transaction;
    }}; request.onsuccess();}); return request;}};
    const storage = new RecoveryStorage('session-a', scopeHash, 1, () => current, factory, 1000);
    const input = snapshot(runtime()), expected = structuredClone(input); let settled = false;
    const pending = storage.save(input).then(value => {settled = true; return value;});
    input.selectedQuestionId = 'mutated'; input.pendingAnswerMap.q = write('q', {kind: 'mcq', optionId: 'B'});
    await flush(); assert.deepEqual(stored, expected); assert.equal(settled, false);
    if (loseAuthority) current = false;
    transaction.oncomplete(); assert.equal((await pending).state, loseAuthority ? 'memory_only' : 'ok');
  }
});

test('clock rejects invalid anchors and detached ordering and reanchors only from a new server receipt', () => {
  for (const values of [['bad', null, 0, 1], ['2026-10-24T09:00:00Z', 'bad', 0, 1], ['2026-10-24T09:00:00Z', null, 2, 1], ['2026-10-24T09:00:00Z', null, NaN, 1]]) {
    assert.throws(() => new clock.RuntimeClock().accept(...values));
  }
  const c = new clock.RuntimeClock(), stamp = '2026-10-24T09:00:00.000Z', epoch = Date.parse(stamp);
  c.accept(stamp, null, 100, 500); assert.equal(c.remaining(500), 0); assert.equal(c.timestamp(0, 500), epoch);
  c.accept(stamp, '2026-10-24T09:01:00.000Z', 1000, 1500); assert.equal(c.remaining(1500), 59500);
  assert.equal(c.timestamp(epoch + 28999, 1500), epoch + 29000); assert.throws(() => c.timestamp(epoch + 29000, 1500));
  assert.throws(() => c.remaining(1499)); assert.throws(() => c.serverNow(Infinity));
  c.accept('2026-10-24T09:00:30.000Z', '2026-10-24T09:01:00.000Z', 2000, 3000);
  assert.equal(c.remaining(3000), 29000); assert.equal(c.serverNow(3000), epoch + 30000);
});
