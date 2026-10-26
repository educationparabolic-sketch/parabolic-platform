import assert from 'node:assert/strict';
import test from 'node:test';
import {clientEnvironment, ok, denied, errors} from './helpers/frontend-production-modules.mjs';
import {deferred} from './helpers/vendor-component-harness.mjs';

function clock() {
  let next = 0;
  const active = new Set(), waits = [];
  return {waits, timers: {setTimeout: (fn, ms) => {const id = ++next; active.add(id); waits.push(ms);
    queueMicrotask(() => {if (active.delete(id)) fn();}); return id;}, clearTimeout: id => active.delete(id)}};
}

test('client serializes exact paths, zero/false queries, methods, bodies and verified headers', async () => {
  const env = clientEnvironment(() => ok({confirmed: true}), {config: {baseUrl: ' /api/v1/ ', defaultHeaders: {'X-Default': 'default'}}});
  await env.api.get('admin/students', {query: {search: 'A&B /?', limit: 0, active: false, skip: null, absent: undefined}, headers: {'X-Default': 'caller'}});
  assert.equal(env.calls[0].url, '/api/v1/admin/students?search=A%26B+%2F%3F&limit=0&active=false');
  assert.equal(env.calls[0].options.body, undefined);
  assert.equal(env.calls[0].options.headers.get('Authorization'), 'Bearer unit-token');
  assert.equal(env.calls[0].options.headers.get('X-Default'), 'caller');
  for (const method of ['post', 'put', 'patch']) await env.api[method]('/admin/resource', {body: {zero: 0, nullable: null}});
  await env.api.delete('/admin/resource');
  assert.deepEqual(env.calls.map(call => call.options.method), ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
  for (const call of env.calls.slice(1, 4)) assert.equal(call.options.body, '{"zero":0,"nullable":null}');
  assert.equal(env.calls[4].options.body, undefined);
});

test('validated data becomes ready only after decoding and the production response adapter completes', async () => {
  const pending = deferred(), order = [];
  const env = clientEnvironment(() => pending.promise);
  const result = env.api.get('/admin/overview', {emptyResultIsReady: true, onResponseHeaders: () => order.push('headers'),
    responseAdapter: value => {order.push('adapter'); assert.equal(env.data.getFrontendDataStateSnapshot().kind, 'loading'); return {value: value.zero, nullable: value.nullable};}});
  assert.equal(env.data.getFrontendDataStateSnapshot().kind, 'loading');
  pending.resolve(ok({zero: 0, nullable: null}));
  assert.deepEqual(await result, {value: 0, nullable: null});
  assert.deepEqual(order, ['headers', 'adapter']); assert.equal(env.data.getFrontendDataStateSnapshot().kind, 'ready');
  assert.equal(env.timings.length, 1); assert.equal(env.failures.length, 0);
});

test('HTML, malformed JSON, legacy envelopes, empty 204 and adapter drift fail without retry or ready data', async () => {
  for (const response of [new Response('<html>SPA</html>'), new Response('{', {headers: {'content-type': 'application/json'}}),
    ok({value: 1}), new Response(null, {status: 204}), new Response(JSON.stringify({data: {value: 1}}), {headers: {'content-type': 'application/json'}})]) {
    const env = clientEnvironment(() => response);
    await assert.rejects(env.api.get('/admin/overview', {responseAdapter: () => {throw Error('Domain shape changed');}}),
      error => error instanceof errors.ApiClientError && error.code === 'INVALID_RESPONSE');
    assert.equal(env.calls.length, 1); assert.equal(env.data.getFrontendDataStateSnapshot().kind, 'validation');
    assert.equal(env.timings.length, 0); assert.equal(env.failures.at(-1).code, 'INVALID_RESPONSE');
  }
});

test('canonical errors preserve request identity and typed details and classify permission versus validation', async () => {
  for (const [status, code, kind] of [[400, 'VALIDATION_ERROR', 'validation'], [403, 'FORBIDDEN', 'permission'], [409, 'CONFLICT', 'validation']]) {
    const env = clientEnvironment(() => denied(status, code, {field: 'expectedRevision'}));
    await assert.rejects(env.api.patch('/admin/settings', {body: {revision: 1}}), error => error.status === status &&
      error.code === code && error.requestId === 'unit-denied' && error.details.field === 'expectedRevision');
    assert.equal(env.calls.length, 1); assert.equal(env.data.getFrontendDataStateSnapshot().kind, kind);
  }
});

test('GET retry honors server minimum, caps exponential delay and never changes the original query', async () => {
  const time = clock();
  const env = clientEnvironment((_url, _options, attempt) => attempt < 3 ? denied(503, 'INTERNAL_ERROR', undefined, {'Retry-After': '2'}) : ok({confirmed: true}),
    {timers: time.timers, config: {retryPolicy: {baseDelayMs: 500, maxDelayMs: 600}}});
  await env.api.get('/admin/overview', {query: {page: 0}});
  assert.deepEqual(time.waits, [2000, 2000]);
  assert.deepEqual(env.calls.map(call => call.url), Array(3).fill('/api/v1/admin/overview?page=0'));
  assert.equal(env.timings[0].attempt, 3); assert.equal(env.failures.length, 0);
  const capped = clock();
  const cap = clientEnvironment((_url, _options, attempt) => attempt < 3 ? denied(503, 'INTERNAL_ERROR', undefined, {'Retry-After': '61'}) : ok({confirmed: true}),
    {timers: capped.timers, config: {retryPolicy: {baseDelayMs: 500, maxDelayMs: 600}}});
  await cap.api.get('/admin/overview'); assert.deepEqual(capped.waits, [500, 600]);
  for (const status of [408, 425, 429, 500, 502, 503, 504]) {
    const retry = clientEnvironment((_url, _options, attempt) => attempt === 1 ? denied(status, 'INTERNAL_ERROR') : ok({confirmed: true}), {timers: clock().timers});
    await retry.api.get('/admin/overview'); assert.equal(retry.calls.length, 2, `retryable status ${status}`);
  }
});

test('unsafe mutations do not retry transport or service failure; explicit retry retains exact intent', async () => {
  for (const method of ['post', 'put', 'patch']) for (const network of [false, true]) {
    const env = clientEnvironment(() => {if (network) throw Error('offline'); return denied(503, 'INTERNAL_ERROR');});
    await assert.rejects(env.api[method]('/admin/settings', {body: {idempotencyKey: 'same-intent'}}));
    assert.equal(env.calls.length, 1);
  }
  const time = clock();
  const env = clientEnvironment((_url, _options, count) => count === 1 ? denied(503, 'INTERNAL_ERROR') : ok({confirmed: true}), {timers: time.timers});
  await env.api.post('/admin/settings', {body: {idempotencyKey: 'same-intent'}, retry: {retryUnsafeMethods: true}});
  assert.equal(env.calls.length, 2); assert.equal(env.calls[0].options.body, env.calls[1].options.body);
});

test('network exhaustion is bounded and never records success or replaces failure with a fixture', async () => {
  const time = clock(), env = clientEnvironment(() => {throw Error('offline');}, {timers: time.timers});
  await assert.rejects(env.api.get('/admin/students'), error => error.code === 'NETWORK_ERROR' && error.status === 0);
  assert.equal(env.calls.length, 3); assert.deepEqual(time.waits, [250, 500]);
  assert.equal(env.failures.length, 1); assert.equal(env.timings.length, 0); assert.equal(env.data.getFrontendDataStateSnapshot().kind, 'unavailable');
});

test('empty and locally handled failures retain explicit ownership through the real request lifecycle', async () => {
  const empty = clientEnvironment(() => ok([])); await empty.api.get('/admin/students');
  assert.equal(empty.data.getFrontendDataStateSnapshot().kind, 'empty');
  await empty.api.get('/admin/students', {emptyResultIsReady: true}); assert.equal(empty.data.getFrontendDataStateSnapshot().kind, 'ready');
  const handled = clientEnvironment(() => denied(409, 'CONFLICT'));
  await assert.rejects(handled.api.post('/admin/settings', {handledFailureIsReady: true}));
  assert.equal(handled.data.getFrontendDataStateSnapshot().kind, 'ready'); assert.equal(handled.timings.length, 0);
});
