import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {ok, denied} from './helpers/frontend-production-modules.mjs';
import {deferred} from './helpers/vendor-component-harness.mjs';
import {vendorEnvironment, list, institute, instituteReceipt, providerReceipt, intelligence, intelligenceKey, health, stamp} from './helpers/vendor-behavior-modules.mjs';

test('Vendor institute and commercial reads execute canonical HTTP adapters and preserve exact cursors, zero and null authority', async () => {
  const env = vendorEnvironment(url => ok(url.split('?')[0].endsWith('/tenant-a') ? institute() : url.includes('/license-catalog') ? {catalogRevision: 0, plans: []} : list()));
  assert.deepEqual(await env.institutes.vendorInstitutesApi.listInstitutes({limit: 5, cursor: 'opaque+/%2F'}), list());
  assert.deepEqual(Object.fromEntries(new URL(env.calls[0].url, 'https://unit.test').searchParams), {limit: '5', cursor: 'opaque+/%2F'});
  const detail = await env.institutes.vendorInstitutesApi.getInstitute('tenant-a');
  assert.equal(detail.aggregate.activeStudentCount, 0); assert.equal(detail.aggregate.monthlyTestRuns, null); assert.deepEqual(detail.calibrationPointer, {present: true, value: null});
  assert.deepEqual(await env.commercial.vendorCommercialApi.listInvoices({limit: 5}), list());
  assert.deepEqual(await env.commercial.vendorCommercialApi.getLicenseCatalog(), {catalogRevision: 0, plans: []});
  const malformed = vendorEnvironment(() => ok({...institute(), calibrationPointer: undefined}));
  await assert.rejects(malformed.institutes.vendorInstitutesApi.getInstitute('tenant-a'), /pointer authority/);
  const wrong = vendorEnvironment(() => ok({...list(), totalMatching: '0'}));
  await assert.rejects(wrong.commercial.vendorCommercialApi.listInvoices({}), error => error.code === 'INVALID_RESPONSE' && error.status === 200);
});

test('real Vendor recovery blocks storage-failed dispatch and retains old-owner uncertain intent after a late account change', async () => {
  const intent = {action: 'retry_reconciliation', reason: 'Review the retained provider outcome', expectedRevision: 1, idempotencyKey: randomUUID()};
  const broken = vendorEnvironment(() => assert.fail('Storage failure must stop HTTP dispatch'));
  broken.store.set = () => {throw new Error('Storage disabled');};
  await assert.rejects(broken.commercial.vendorCommercialApi.retryPaymentEvent('event-a', intent), /Storage disabled/);
  assert.equal(broken.calls.length, 0);
  const pending = deferred(), dispatched = deferred();
  const env = vendorEnvironment(() => {dispatched.resolve(); return pending.promise;});
  const command = env.commercial.vendorCommercialApi.retryPaymentEvent('event-a', intent), rejected = assert.rejects(command);
  await dispatched.promise; env.user.uid = 'actor-b'; pending.resolve(ok(providerReceipt())); await rejected;
  assert.equal(env.calls.length, 1); assert.equal(env.recovery.vendorRecoveryState('actor-a').uncertain, true);
  assert.equal(env.recovery.vendorRecoveryState('actor-b').call, null);
});

test('actual institute command retains exact HTTP intent after committed receipt and failed reload until explicit recovery succeeds', async () => {
  let reloadFails = true; const sent = [];
  const env = vendorEnvironment((_url, options) => {
    if (options.method === 'PATCH') {sent.push(options.body); return ok(instituteReceipt());}
    return reloadFails ? denied(403, 'FORBIDDEN') : ok(institute());
  });
  const intent = {expectedRevision: 1, idempotencyKey: randomUUID(), profile: {registeredName: 'Unit institute', vendorAccountReference: null}};
  await assert.rejects(env.institutes.vendorInstitutesApi.updateInstitute('tenant-a', intent));
  const state = env.recovery.vendorRecoveryState('actor-a'); assert.equal(state.uncertain, true); assert.equal(state.receipt.value.revision, 2);
  await assert.rejects(env.institutes.vendorInstitutesApi.updateInstitute('tenant-b', {...intent, idempotencyKey: randomUUID()}), /different intent/);
  assert.equal(sent.length, 1); reloadFails = false;
  await env.recovery.retryVendorRecovery('actor-a', JSON.stringify(state.call));
  assert.deepEqual(sent, [JSON.stringify(intent), JSON.stringify(intent)]); assert.equal(env.recovery.vendorRecoveryState('actor-a').call, null);
  assert.deepEqual(env.calls.map(c => c.options.method), ['PATCH', 'GET', 'PATCH', 'GET']);
});

test('actual commercial provider retry keeps the original event intent separate from unrelated work and honors reviewed recovery', async () => {
  let failed = true; const sent = [];
  const env = vendorEnvironment((_url, options) => {if (options.method === 'POST') {sent.push(options.body); return ok(providerReceipt(failed ? 'failed_retryable' : 'succeeded'));} return ok(list());});
  const body = {action: 'retry_reconciliation', reason: 'Review the retained provider outcome', expectedRevision: 1, idempotencyKey: randomUUID()};
  await env.commercial.vendorCommercialApi.retryPaymentEvent('event-a', body);
  const captured = env.recovery.vendorRecoveryState('actor-a'); assert.equal(captured.uncertain, false); assert.equal(captured.call.args[0], 'event-a');
  await assert.rejects(env.commercial.vendorCommercialApi.retryPaymentEvent('event-a', {...body, expectedRevision: 2, idempotencyKey: randomUUID()}), /captured retry/);
  await env.commercial.vendorCommercialApi.retryPaymentEvent('event-b', {...body, idempotencyKey: randomUUID()});
  assert.equal(env.recovery.vendorRecoveryState('actor-a').calls.length, 2); failed = false;
  await env.recovery.retryVendorRecovery('actor-a', JSON.stringify(captured.call));
  assert.equal(sent[2], sent[0]); assert.equal(env.recovery.vendorRecoveryState('actor-a').calls.length, 1);
  assert.equal(env.recovery.vendorRecoveryState('actor-a').call.args[0], 'event-b');
});

test('canonical validation denial clears first-attempt Vendor recovery while malformed success retains uncertain intent', async () => {
  const intent = {action: 'retry_reconciliation', reason: 'Review the retained provider outcome', expectedRevision: 1, idempotencyKey: randomUUID()};
  for (const status of [400, 403, 409, 422]) {
    const env = vendorEnvironment(() => denied(status, 'REJECTED'));
    await assert.rejects(env.commercial.vendorCommercialApi.retryPaymentEvent('event-a', intent));
    assert.equal(env.calls.length, 1); assert.equal(env.recovery.vendorRecoveryState('actor-a').call, null);
  }
  const env = vendorEnvironment(() => ok({...providerReceipt(), providerOperation: null}));
  await assert.rejects(env.commercial.vendorCommercialApi.retryPaymentEvent('event-a', intent), /Vendor commercial/);
  assert.equal(env.calls.length, 1); assert.equal(env.recovery.vendorRecoveryState('actor-a').uncertain, true);
});

test('all five intelligence HTTP adapters retain explicit empty and unsupported data and reject private or contradictory payloads', async () => {
  const query = {asOfMonth: '2026-09', windowMonths: 3}, fixtures = intelligence(query);
  const env = vendorEnvironment(url => ok(fixtures[intelligenceKey(url)]));
  const result = await Promise.all(Object.keys(fixtures).map(key => env.intelligence.vendorIntelligenceApi[key](query)));
  env.intelligenceResponse.assertIntelligenceSelection(result, query);
  assert.equal(result[1].current, null); assert.equal(result[2].totalInstitutes, 0); assert.equal(result[4].upgradeProbability.currentUpgradeableInstituteCount, null);
  for (const call of env.calls) assert.deepEqual(Object.fromEntries(new URL(call.url, 'https://unit.test').searchParams), {asOfMonth: '2026-09', windowMonths: '3'});
  fixtures.revenue.studentEmail = 'private@example.test'; await assert.rejects(env.intelligence.vendorIntelligenceApi.revenue(query), /No fallback/);
  delete fixtures.revenue.studentEmail; fixtures.revenue.current = {};
  await assert.rejects(env.intelligence.vendorIntelligenceApi.revenue(query), /No fallback/);
});

test('audit HTTP validates query before dispatch and preserves sparse advancement while rejecting filter and cursor drift', async () => {
  let payload = {generatedAt: stamp, items: [], hasMore: true, nextCursor: 'next_cursor'};
  const env = vendorEnvironment(() => ok(payload));
  for (const query of [{scope: 'global'}, {limit: '2'}, {cursor: 'bad/cursor'}]) assert.throws(() => env.audit.vendorAuditHealthApi.audit(query));
  assert.equal(env.calls.length, 0);
  assert.deepEqual(await env.audit.vendorAuditHealthApi.audit({limit: 2, cursor: 'old_cursor'}), payload);
  await assert.rejects(env.audit.vendorAuditHealthApi.audit({cursor: 'next_cursor'}), /authority/);
  payload = {...payload, items: [], hasMore: false, nextCursor: null};
  assert.deepEqual(await env.audit.vendorAuditHealthApi.audit(), payload);
  payload = {...payload, rawJobs: []}; await assert.rejects(env.audit.vendorAuditHealthApi.audit(), /authority/);
});

test('health HTTP retains zero queues and unavailable sources without fabricating operational posture', async () => {
  const payload = health(), env = vendorEnvironment(() => ok(payload));
  assert.deepEqual(await env.audit.vendorAuditHealthApi.health(), payload);
  assert.equal(payload.emailDelivery.data.totalCount, 0); assert.equal(payload.cloudMonitoring.availability, 'unavailable');
  payload.emailDelivery = {availability: 'unavailable', observedAt: stamp, reason: 'source_limit_exceeded'};
  assert.deepEqual(await env.audit.vendorAuditHealthApi.health(), payload);
  payload.cloudMonitoring = {availability: 'available', observedAt: stamp, data: {healthy: true}};
  await assert.rejects(env.audit.vendorAuditHealthApi.health(), /authority/);
});

test('calibration HTTP preserves version authority and rejects malformed pages, selected versions and unsafe simulation before dispatch', async () => {
  const weights = {guessWeight: 1, phaseWeight: 0, easyNeglectWeight: 0, hardBiasWeight: 0, wrongStreakWeight: 0};
  const version = {schemaVersion: 1, versionId: 'v1', weights, thresholds: {guessFactorEasy: 1, guessFactorMedium: 1, guessFactorHard: 1, phaseDeviationThreshold: 20},
    createdBy: 'vendor-a', createdAt: '2026-01-01T00:00:00.000Z', activationDate: null, isActive: false, sourcePath: 'globalCalibration/v1', deploymentAvailability: 'immediate_selected_targets'};
  let payload = {items: [], hasMore: false, nextCursor: null}; const env = vendorEnvironment(() => ok(payload));
  assert.deepEqual(await env.calibration.vendorCalibrationApi.versions('opaque_cursor'), payload);
  assert.equal(new URL(env.calls[0].url, 'https://unit.test').searchParams.get('limit'), '25');
  payload = {version}; assert.deepEqual(await env.calibration.vendorCalibrationApi.version('v1'), version);
  await assert.rejects(env.calibration.vendorCalibrationApi.version('v2'), /authority/);
  payload = {items: [version], hasMore: true, nextCursor: 'forged'};
  await assert.rejects(env.calibration.vendorCalibrationApi.versions(), /authority/);
  const before = env.calls.length;
  for (const intent of [{academicYearId: 'year-a', institutes: ['tenant-a', 'tenant-a'], weights}, {academicYearId: 'year-a', institutes: ['tenant-a'], weights: {...weights, phaseWeight: 1}}]) {
    assert.throws(() => env.calibration.vendorCalibrationApi.simulate(intent), /authority/);
  }
  assert.equal(env.calls.length, before);
});
