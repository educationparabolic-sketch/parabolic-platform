import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {ok, denied, loadProduction} from './helpers/frontend-production-modules.mjs';
import {componentHarness, deferred, control, nodes, text} from './helpers/vendor-component-harness.mjs';
import {vendorEnvironment, intelligence, intelligenceKey, health, list, providerReceipt, settle} from './helpers/vendor-behavior-modules.mjs';

async function intelligenceView(env, query = {}) {
  const h = componentHarness();
  const module = await h.load('apps/vendor/src/features/intelligence/useVendorIntelligence.ts', {
    './vendorIntelligenceApi': env.intelligence, './vendorIntelligenceResponse': env.intelligenceResponse,
  });
  h.mount(props => module.useVendorIntelligence(props.query, props.enabled), {query, enabled: true});
  return h;
}

test('mounted intelligence cannot publish a partial five-source snapshot and explicit retry requires a fresh consistent selection', async () => {
  const requests = [];
  const fixtures = intelligence({windowMonths: 3});
  const env = vendorEnvironment(url => {const next = deferred(); requests.push({url, ...next}); return next.promise;});
  const h = await intelligenceView(env, {windowMonths: 3}); await settle(h);
  assert.equal(h.tree.loading, true); assert.equal(h.tree.data, null); assert.equal(requests.length, 5);
  requests.find(r => intelligenceKey(r.url) === 'revenue').resolve(denied(403, 'FORBIDDEN'));
  await settle(h); assert.equal(h.tree.loading, false); assert.equal(h.tree.data, null); assert.equal(h.tree.failure.kind, 'permission');
  for (const r of requests.filter(r => intelligenceKey(r.url) !== 'revenue')) r.resolve(ok(fixtures[intelligenceKey(r.url)]));
  await settle(h); assert.equal(h.tree.data, null);
  h.tree.retry(); await settle(h); assert.equal(requests.length, 10); assert.equal(h.tree.loading, true);
  for (const r of requests.slice(5)) r.resolve(ok(fixtures[intelligenceKey(r.url)]));
  await settle(h); assert.equal(h.tree.failure, null); assert.equal(h.tree.data.revenue.current, null);
  assert.equal(h.tree.data.forecast.observedMonthCount, 0); assert.equal(h.tree.data.readiness.unavailablePanels.calibrationImpact.status, 'unavailable');
  h.unmount();
});

test('mounted intelligence hides superseded query results immediately and rejects mismatched snapshot metadata without fixtures', async () => {
  const requests = [], env = vendorEnvironment((url, options) => {const next = deferred(); requests.push({url, options, ...next}); return next.promise;});
  const h = await intelligenceView(env, {asOfMonth: '2026-08', windowMonths: 3}); await settle(h);
  h.render({query: {asOfMonth: '2026-09', windowMonths: 6}, enabled: true}); assert.equal(h.tree.data, null); await settle(h);
  assert.equal(requests.length, 10); assert.ok(requests.slice(0, 5).every(r => r.options.signal.aborted));
  const fresh = intelligence({asOfMonth: '2026-09', windowMonths: 6});
  fresh.forecast.metadata = {...fresh.forecast.metadata, windowMonths: 3};
  for (const r of requests.slice(5)) r.resolve(ok(fresh[intelligenceKey(r.url)]));
  await settle(h); assert.equal(h.tree.data, null); assert.equal(h.tree.failure.kind, 'unavailable');
  const old = intelligence({asOfMonth: '2026-08', windowMonths: 3});
  for (const r of requests.slice(0, 5)) r.resolve(ok(old[intelligenceKey(r.url)]));
  await settle(h); assert.equal(h.tree.data, null); assert.equal(h.tree.failure.kind, 'unavailable');
  h.render({query: {}, enabled: false}); assert.equal(h.tree.data, null); assert.equal(h.tree.loading, false); await settle(h);
  assert.equal(requests.length, 10); h.unmount();
});

test('mounted health fences old UID and token reads, sanitizes failure and retries only current server authority', async () => {
  const requests = [], env = vendorEnvironment((_url, options) => {const next = deferred(); requests.push({options, ...next}); return next.promise;});
  const session = {status: 'authenticated', idToken: 'token-a', user: {uid: 'actor-a'}};
  const h = componentHarness(), hooks = await h.load('apps/vendor/src/features/audit/useVendorAuditHealth.ts', {
    '../../../../../shared/services/authProvider': {useAuthProvider: () => ({session})}, './vendorAuditHealthApi': env.audit,
  });
  h.mount(() => hooks.useVendorSystemHealth()); await settle(h);
  requests[0].resolve(ok(health())); await settle(h); assert.equal(h.tree.data.emailDelivery.data.totalCount, 0);
  session.user = {uid: 'actor-b'}; session.idToken = 'token-b'; env.user.uid = 'actor-b'; h.render(); assert.equal(h.tree.data, null); await settle(h);
  assert.equal(requests[0].options.signal.aborted, true);
  session.idToken = 'token-b-refreshed'; h.render(); await settle(h); assert.equal(requests[1].options.signal.aborted, true);
  requests[2].resolve(denied(403, 'FORBIDDEN', {secret: 'private provider diagnostic'})); await settle(h);
  assert.equal(h.tree.failure.kind, 'permission'); assert.doesNotMatch(h.tree.failure.message, /private provider/); assert.equal(h.tree.data, null);
  requests[1].resolve(ok(health())); await settle(h); assert.equal(h.tree.failure.kind, 'permission'); assert.equal(h.tree.data, null);
  h.tree.retry(); await settle(h); requests[3].resolve(ok(health())); await settle(h);
  assert.equal(h.tree.failure, null); assert.equal(h.tree.data.cloudMonitoring.availability, 'unavailable');
  h.unmount(); assert.equal(requests[3].options.signal.aborted, true);
});

test('mounted recovery review retains incomplete provider work and reloads only after exact captured retry is resolved', async () => {
  let failed = true, reloads = 0; const sent = [];
  const env = vendorEnvironment((_url, options) => {if (options.method === 'POST') {sent.push(options.body); return ok(providerReceipt(failed ? 'failed_retryable' : 'succeeded'));} return ok(list());});
  await env.commercial.vendorCommercialApi.retryPaymentEvent('event-a', {action: 'retry_reconciliation', reason: 'Review the retained provider outcome', expectedRevision: 1, idempotencyKey: randomUUID()});
  const h = componentHarness(), session = {user: {uid: 'actor-a'}, status: 'authenticated'}, jsx = (type, props) => ({type, props});
  const Component = loadProduction('apps/vendor/src/features/shared/VendorCommandRecoveryPanel.tsx', {
    react: h.react, 'react/jsx-runtime': {jsx, jsxs: jsx, Fragment: 'fragment'},
    '../../portals/vendorAccess': {resolveVendorAccessContext: () => ({canUseCapability: () => true})},
    '../../../../../shared/services/authProvider': {useAuthProvider: () => ({session})}, './vendorCommandRecovery': env.recovery,
    '../institutes/vendorInstitutesApi': {}, '../licensing/vendorCommercialApi': {},
  }, {window: {location: {reload: () => {reloads++;}}}}).default;
  h.mount(Component); await h.flush(); assert.match(text(h.tree), /provider or delivery retry intent is stored/);
  assert.equal(control(h.tree, 'button', 'Retry captured commercial').props.disabled, true);
  nodes(h.tree).find(n => n?.type === 'input' && n.props.type === 'checkbox').props.onChange({target: {checked: true}}); await h.flush();
  assert.equal(control(h.tree, 'button', 'Retry captured commercial').props.disabled, false);
  control(h.tree, 'button', 'Retry captured commercial').props.onClick(); await settle(h);
  assert.equal(reloads, 0); assert.match(text(h.tree), /still reports incomplete provider or delivery work/); assert.equal(sent[1], sent[0]);
  assert.match(text(h.tree), /does not guarantee downstream completion/);
  failed = false; control(h.tree, 'button', 'Retry captured commercial').props.onClick(); await settle(h);
  assert.equal(sent[2], sent[0]); assert.equal(reloads, 1); assert.equal(env.recovery.vendorRecoveryState('actor-a').call, null);
  h.unmount();
});
