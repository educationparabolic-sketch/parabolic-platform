import assert from 'node:assert/strict';
import test from 'node:test';
import {ok, denied, stamp, loadProduction} from './helpers/frontend-production-modules.mjs';
import {studentEnvironment, history, solutions, current, access, rawPolicy, profile, photo, photoId} from './helpers/student-behavior-modules.mjs';

test('summary API validates entitlement before suppressing unconfirmed reflective metrics and retains basic zero scores', async () => {
  const payload = {...current(), access: access('L2'), licenseLayer: 'L2',
    resultReadiness: {state: 'processing', sessionId: 'session-a', retryAfterSeconds: 2},
    avgRawScorePercent: 0, avgAccuracyPercent: 0, testsAttempted: 0, batchRank: null,
    disciplineIndex: 90, guessProbabilityPercent: 0, riskState: 'low', executionStabilityFlag: null,
    phaseAdherencePercent: 80, easyNeglectPercent: 0, hardBiasPercent: null, timeMisallocationPercent: null,
    behaviorSummaryTag: null, controlledModeImprovementDeltaPercent: null,
    phaseComplianceMiniTrend: [{label: 'Previous', value: 90}], recentResults: [], upcomingTests: []};
  const original = structuredClone(payload), env = studentEnvironment(() => ok(payload));
  const result = await env.summary.getStudentSummaryResource('/student/dashboard', 'dashboard');
  assert.equal(result.avgRawScorePercent, 0); assert.equal(result.avgAccuracyPercent, 0); assert.equal(result.batchRank, null);
  assert.equal(result.disciplineIndex, null); assert.equal(result.phaseAdherencePercent, null);
  assert.deepEqual(result.phaseComplianceMiniTrend, []); assert.equal(result.access.metrics.advanced, false);
  assert.deepEqual(payload, original);
  payload.resultReadiness.state = 'available'; payload.resultReadiness.retryAfterSeconds = 0;
  assert.deepEqual(await env.summary.getStudentSummaryResource('/student/dashboard', 'dashboard'), payload);
  payload.access.metrics.advanced = false;
  await assert.rejects(env.summary.getStudentSummaryResource('/student/dashboard', 'dashboard'), /validated/);
});

test('summary route-resource mismatches reject before dispatch and history keeps exact year and cursor authority', async () => {
  const env = studentEnvironment(() => ok(history()));
  await assert.rejects(env.summary.getStudentSummaryResource('/student/profile', 'tests'), /unsupported route/);
  await assert.rejects(env.summary.getStudentSummaryResource('/student/tests', 'dashboard'), /does not match/);
  assert.equal(env.calls.length, 0);
  const query = {scope: 'history', yearId: 'year-old', cursor: 'position+/%2F', pageSize: 5};
  assert.deepEqual(await env.tests.fetchStudentTestsPage(query), history());
  const url = new URL(env.calls[0].url, 'https://unit.test');
  assert.equal(url.pathname, '/api/v1/student/tests');
  assert.deepEqual(Object.fromEntries(url.searchParams), {...query, pageSize: '5'});
  await assert.rejects(env.tests.fetchStudentTestsPage({...query, yearId: 'other'}), /scope does not match/);
  await assert.rejects(env.tests.fetchStudentTestsPage({scope: 'current'}), /scope does not match/);
});

test('solution reads bind selected test and run and retain signed bytes, null answers and opaque cursors', async () => {
  const payload = solutions(), signed = 'https://cdn.example.test/a.png?Signature=a%2Fb%2Bz&Expires=1999999999&KeyName=one';
  payload.page.items = [{questionId: 'q', questionVersion: 1, questionRevision: 2, questionImageUrl: signed,
    solutionImageUrl: null, assetsExpireAt: '2030-01-01T00:00:00Z', correctAnswer: 'A', studentAnswer: null, tutorialVideoLink: null, simulationLink: null}];
  const env = studentEnvironment(() => ok(payload));
  assert.deepEqual(await env.tests.fetchStudentSolutions('test-a', 'run-a', 'next+/%2F'), payload);
  assert.equal(new URL(env.calls[0].url, 'https://unit.test').searchParams.get('cursor'), 'next+/%2F');
  await assert.rejects(env.tests.fetchStudentSolutions('different', 'run-a'), /scope does not match/);
  await assert.rejects(env.tests.fetchStudentSolutions('test-a', 'other'), /scope does not match/);
  await assert.rejects(env.tests.fetchStudentSolutions('test/a', 'run-a'), /scope does not match/);
  assert.ok(env.calls.at(-1).url.includes('test%2Fa/solutions'));
});

test('locked solution states and empty pages stay explicit while denials and entitlement leakage never become fixtures', async () => {
  const row = {academicYear: 'year-a', currentAcademicYear: true, runId: 'run-a', testId: 'test-a', testName: 'Unit', status: 'completed', mode: 'Operational',
    startWindow: stamp, endWindow: stamp, durationMinutes: 0, rawScorePercent: 0, accuracyPercent: 0, timeUsedMinutes: null, rankInBatch: null,
    completedAt: stamp, sessionId: null, sessionLink: null, summaryPdfUrl: null, archivedSummary: null, attemptStatusLabel: null,
    attemptedQuestions: null, totalQuestions: null, flaggedQuestions: null, solutionAccess: {state: 'locked', reason: 'not_released'}};
  let payload = {...current(), page: {items: [row], nextCursor: null, hasMore: false}};
  const env = studentEnvironment(() => ok(payload));
  for (const reason of ['not_completed', 'not_released', 'unavailable']) {
    row.solutionAccess.reason = reason;
    assert.deepEqual((await env.tests.fetchStudentTestsPage({scope: 'current'})).page.items[0], row);
  }
  payload.page.items = [];
  assert.deepEqual((await env.tests.fetchStudentTestsPage({scope: 'current'})).page.items, []);
  payload.access.metrics.advanced = true;
  await assert.rejects(env.tests.fetchStudentTestsPage({scope: 'current'}), /validated/);
  for (const status of [400, 403, 404, 409]) {
    const failure = studentEnvironment(() => denied(status, 'DENIED'));
    await assert.rejects(failure.tests.fetchStudentSolutions('test-a', 'run-a'), error => error.status === status);
    assert.equal(failure.calls.length, 1);
  }
});

test('summary-only policy rejects nested normalized raw-session aliases without rejecting nullable summary values', () => {
  for (const key of ['Session_Logs', 'raw-answer-arrays', 'RAW Answers', 'answer.map', 'per_question_timestamps', 'question-timings', 'event_logs']) {
    assert.throws(() => rawPolicy.assertStudentSummaryPayload({page: {items: [{nested: {[key]: []}}]}}, 'tests'), /summary-only/);
  }
  assert.doesNotThrow(() => rawPolicy.assertStudentSummaryPayload({rawScorePercent: 0, studentAnswer: null, page: {items: []}}, 'tests'));
});

test('profile preferences require exact versioned applied or replayed receipts and preserve command bytes', async () => {
  const body = {expectedVersion: 1, idempotencyKey: 'intent-a', preferences: {sidebarCollapsed: true}};
  let receipt = {auditId: 'audit-a', disposition: 'applied', version: 2, updatedAt: stamp, preferences: body.preferences};
  const env = studentEnvironment(() => ok(receipt));
  const signal = new AbortController().signal;
  for (const disposition of ['applied', 'replayed']) {receipt.disposition = disposition; assert.deepEqual(await env.profile.preferences(body, signal), receipt);}
  assert.equal(env.calls[0].options.method, 'PATCH');
  assert.equal(env.calls[0].url, '/api/v1/student/profile/preferences');
  assert.deepEqual(JSON.parse(env.calls[0].options.body), body);
  for (const change of [{version: 1}, {version: 3}, {auditId: ''}, {disposition: 'pending'}, {preferences: {sidebarCollapsed: false}}, {extra: true}]) {
    const bad = studentEnvironment(() => ok({...receipt, ...change}));
    await assert.rejects(bad.profile.preferences(body), /incompatible/);
  }
});

test('photo enrollment and withdrawal receipts bind the prior pointer and never assert physical deletion', async () => {
  const body = {expectedVersion: 1, expectedPhotoId: photoId, idempotencyKey: 'intent-a', mediaType: 'image/jpeg', contentBase64: '/9j/2Q==', consent: {accepted: true, policyVersion: 'student-identity-photo-v1'}};
  const base = {auditId: 'audit-a', disposition: 'replayed', version: 2};
  let receipt = {...base, committedPhoto: photo, replacedPhotoId: photoId};
  const env = studentEnvironment(() => ok(receipt));
  assert.deepEqual(await env.profile.enroll(body), receipt);
  assert.equal(env.calls[0].url, '/api/v1/student/profile/identity-photo');
  assert.deepEqual(JSON.parse(env.calls[0].options.body), body);
  receipt.replacedPhotoId = null;
  await assert.rejects(env.profile.enroll(body), /incompatible/);
  receipt = {...base, withdrawnAt: stamp, photoId, accessRevoked: true};
  assert.deepEqual(await env.profile.withdraw(body), receipt);
  assert.equal(env.calls.at(-1).options.method, 'POST');
  assert.ok(env.calls.at(-1).url.endsWith('/identity-photo/withdrawal'));
  for (const change of [{photoId: null}, {accessRevoked: false}, {deletedAt: stamp}]) {
    const bad = studentEnvironment(() => ok({...receipt, ...change}));
    await assert.rejects(bad.profile.withdraw(body), /incompatible/);
  }
});

test('profile reads validate ownership-shaped data and private media/lifecycle pointers with no implicit retry', async () => {
  const p = profile(); let payload = p;
  const env = studentEnvironment(() => ok(payload));
  assert.deepEqual(await env.profile.profile(), p);
  payload = {photoId, mediaType: 'image/jpeg', sizeBytes: 5, contentBase64: '/9j//9k='};
  assert.deepEqual(await env.profile.media(photoId), payload);
  await assert.rejects(env.profile.media('photo_' + 'b'.repeat(40)), /incompatible/);
  payload = {photoId, state: 'deletion_pending', deletionReason: 'consent_withdrawn', deletedAt: null};
  assert.deepEqual(await env.profile.lifecycle(photoId), payload);
  payload = {...payload, state: 'deleted'};
  await assert.rejects(env.profile.lifecycle(photoId), /incompatible/);
  const failure = studentEnvironment(() => denied(503, 'UNAVAILABLE'));
  await assert.rejects(failure.profile.profile(), error => error.status === 503);
  assert.equal(failure.calls.length, 1);
  const cancelled = new AbortController(); cancelled.abort();
  const aborting = studentEnvironment((_url, options) => {assert.equal(options.signal, cancelled.signal); options.signal.throwIfAborted();});
  await assert.rejects(aborting.profile.profile(cancelled.signal));
  assert.equal(aborting.calls.length, 1);
});

test('legacy storage purging removes only retired Student keys without reading images or accepting hostile storage', () => {
  const keys = ['student-live-photo:a', 'student-live-photo:b', 'student-sidebar-collapsed', 'exam-recovery:a', 'student-live-photo'];
  const removed = [];
  const storage = {get length() {return keys.length;}, key: i => keys[i], getItem() {assert.fail('Legacy image must never be read');}, removeItem: key => {removed.push(key); keys.splice(keys.indexOf(key), 1);}};
  const context = value => loadProduction('apps/student/src/services/studentProfileContext.ts', {
    react: {createContext: () => ({}), useContext: () => null}, '../../../../shared/services/studentProfileContract': {},
  }, {localStorage: value});
  context(storage).purgeLegacyStudentStorage();
  assert.deepEqual(removed, ['student-live-photo:a', 'student-live-photo:b', 'student-sidebar-collapsed']);
  assert.deepEqual(keys, ['exam-recovery:a', 'student-live-photo']);
  assert.doesNotThrow(() => context({get length() {throw new Error('Disabled');}}).purgeLegacyStudentStorage());
});
