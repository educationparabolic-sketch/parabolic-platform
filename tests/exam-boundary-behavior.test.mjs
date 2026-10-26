import assert from 'node:assert/strict';
import test from 'node:test';
import {ok, denied, adapters} from './helpers/frontend-production-modules.mjs';
import {deferred} from './helpers/vendor-component-harness.mjs';
import {examEnvironment, entry, lease, reconciliation, submission} from './helpers/exam-behavior-modules.mjs';

test('coalesced acquisition stores pending intent before the real HTTP dispatch and publishes only strict entry authority', async () => {
  let env, sent;
  env = examEnvironment({request: (_url, options, body) => {
    sent = body; const record = JSON.parse([...env.storage.values()][0]);
    assert.equal(record.pending.commandId, body.commandId); assert.equal(record.pending.proof, body.nextOwnerProof);
    assert.equal(new Headers(options.headers).get('Authorization').split(' ')[0], 'Bearer');
  }});
  const first = env.owner.start(), second = env.owner.start(); assert.strictEqual(first, second);
  const result = await first; assert.deepEqual(result.responseBody, adapters.adaptExamSessionEntryResult(entry()));
  assert.equal(sent.operation, 'launch'); assert.equal(sent.token, 'unit-custom-token');
  assert.equal(env.calls.length, 1); assert.equal(env.owner.snapshot().phase, 'active');
  const stored = JSON.parse([...env.storage.values()][0]); assert.equal(stored.current.generation, 1);
  assert.deepEqual(Object.keys(stored).sort(), ['current', 'scopeHash']);
  assert.doesNotMatch(JSON.stringify(stored), /unit-custom-token|header\./); assert.equal(env.owner.recoveryScope(), stored.scopeHash);
  assert.ok([...env.timers.values()].some(t => t.delay === 90000)); env.owner.invalidate();
});

test('invalid bootstrap or unavailable intent storage prevents any acquisition HTTP request', async () => {
  for (const settings of [{storageFailure: true}, {apiBaseUrl: 'https://other.example.test/api/v1'}, {metadata: {status: 'invalid'}}, {metadata: {devMock: true}}, {metadata: {sessionId: 'other'}}]) {
    const env = examEnvironment(settings); await assert.rejects(env.owner.start(), /ownership is unavailable/);
    assert.equal(env.calls.length, 0); assert.equal(env.owner.snapshot().phase, 'lost');
  }
});

test('strict acquisition rejects foreign entry scope, hidden answers and false camera capabilities before active state', async () => {
  for (const alter of [e => {e.runId = 'other';}, e => {e.studentId = 'other';}, e => {e.runtimeSnapshot.sessionId = 'other';},
    e => {e.runtimeSnapshot.questions[0].correctAnswer = 'A';}, e => {e.runtimeSnapshot.proctoringPolicy.capabilities.automatedFaceMatching = 'verified';},
    e => {e.recovery.questions[0].answer = {clientTimestamp: 100, response: {kind: 'mcq', optionId: 'unknown'}, timeSpentSeconds: 0}; e.recovery.maxAcceptedClientTimestamp = 100;}]) {
    const payload = entry(); alter(payload);
    const env = examEnvironment({request: () => ok({operation: 'launch', ownership: lease(), entry: payload})});
    await assert.rejects(env.owner.start()); assert.equal(env.owner.snapshot().phase, 'lost'); assert.equal(env.calls.length, 1);
    assert.equal(JSON.parse([...env.storage.values()][0]).current, undefined);
  }
});

test('answer dispatch freezes intent before queue waits and rejects foreign paths, queries and hidden dispatch', async () => {
  const env = examEnvironment({request: url => url.endsWith('/answers') ? ok({batchId: 'batch-a'}) : undefined});
  await env.owner.start(); const body = {batchId: 'batch-a', batchSequence: 1, answers: [{questionId: 'q', clientRevision: 1, clientTimestamp: 100, response: {kind: 'mcq', optionId: 'A'}, timeSpentSeconds: 0}]};
  const expected = structuredClone(body), pending = env.owner.post('/exam/session/session-a/answers', {body});
  body.answers[0].response.optionId = 'B'; body.batchId = 'mutated'; await pending;
  assert.deepEqual(JSON.parse(env.calls[1].options.body), expected);
  assert.equal(new Headers(env.calls[1].options.headers).get('X-Parabolic-Exam-Generation'), '1');
  for (const path of ['/exam/session/other/answers', '/exam/session/session-a/entry', '/exam/session/session-a/answers?scope=other']) await assert.rejects(env.owner.post(path, {body}));
  await assert.rejects(env.owner.post('/exam/session/session-a/answers', {body, query: {yearId: 'other'}}));
  env.document.visibilityState = 'hidden'; await assert.rejects(env.owner.post('/exam/session/session-a/answers', {body}));
  assert.equal(env.calls.length, 2); env.owner.invalidate();
});

test('lost submission uses strict canonical confirmation before replay and closes only on a real receipt', async () => {
  for (const status of ['submitted', 'terminated']) {
    let submits = 0, probes = 0;
    const env = examEnvironment({request: (url, _options, body) => {
      if (url.endsWith('/submit')) {submits++; throw new TypeError('Lost response');}
      if (body?.operation === 'reconcile') {probes++; return ok(reconciliation(status));}
    }});
    await env.owner.start(); const result = env.owner.post('/exam/session/session-a/submit', {body: {reason: 'expiry'}});
    if (status === 'submitted') assert.deepEqual(await result, submission());
    else await assert.rejects(result, error => error.details?.reason === 'session_terminated');
    assert.equal(submits, 1); assert.equal(probes, 1); assert.equal(env.owner.snapshot().phase, 'closed');
    assert.equal(env.timers.size, 0); await assert.rejects(env.owner.post('/exam/session/session-a/answers', {body: {}}));
    assert.equal(env.calls.length, 3); env.owner.invalidate();
  }
});

test('malformed or foreign canonical confirmation never becomes submission success or a second mutation', async () => {
  for (const alter of [r => {r.generation = 2;}, r => {r.sessionId = 'other';}, r => {r.submission.alreadySubmitted = false;},
    r => {r.submission.rawScorePercent = 101;}, r => {r.submission.solutionSnapshot = {correctAnswer: 'A'};}]) {
    let submits = 0; const result = reconciliation(); alter(result);
    const env = examEnvironment({request: (url, _options, body) => {
      if (url.endsWith('/submit')) {submits++; throw new TypeError('Lost response');}
      if (body?.operation === 'reconcile') return ok(result);
    }});
    await env.owner.start(); await assert.rejects(env.owner.post('/exam/session/session-a/submit', {body: {reason: 'expiry'}}));
    assert.equal(submits, 1); assert.equal(env.owner.snapshot().phase, 'active'); env.owner.invalidate();
  }
});

test('late canonical receipt after silent same-user scope replacement cannot close the original runtime', async () => {
  const pending = deferred(), dispatched = deferred();
  const env = examEnvironment({request: url => {if (url.endsWith('/submit')) {dispatched.resolve(); return pending.promise;}}});
  await env.owner.start(); const result = env.owner.post('/exam/session/session-a/submit', {body: {reason: 'manual'}});
  const rejected = assert.rejects(result); await dispatched.promise;
  env.replace({launchNonce: 'replacement'}); pending.resolve(ok(submission(false))); await rejected;
  assert.equal(env.owner.snapshot().phase, 'lost'); assert.equal(env.owner.isCurrent(), false); assert.equal(env.calls.length, 2);
});

test('strict transport keeps attestation denial recoverable while lease expiry prevents further answer dispatch', async () => {
  const env = examEnvironment({request: url => url.endsWith('/answers') ? denied(403, 'FORBIDDEN', {reason: 'app_check_denied'}) : undefined});
  await env.owner.start(); const original = [...env.storage.values()][0];
  await assert.rejects(env.owner.post('/exam/session/session-a/answers', {body: {batchId: 'retained'}}));
  assert.equal(env.owner.snapshot().phase, 'active'); assert.equal([...env.storage.values()][0], original);
  env.time(90100); assert.equal(env.owner.isCurrent(), false);
  await assert.rejects(env.owner.post('/exam/session/session-a/answers', {body: {batchId: 'retained'}}));
  assert.equal(env.calls.length, 2); env.owner.invalidate();
});
