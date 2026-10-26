import assert from 'node:assert/strict';
import test from 'node:test';
import {loadProduction} from './helpers/frontend-production-modules.mjs';
import {componentHarness, control, deferred, text} from './helpers/vendor-component-harness.mjs';
import {recovery} from './helpers/student-behavior-modules.mjs';

const readiness = state => ({resultReadiness: {state, sessionId: 'session-a', retryAfterSeconds: state === 'processing' ? 2 : 0}});
function mounted(load) {
  const h = componentHarness(), timers = new Map(), listeners = new Map();
  let now = 0, id = 0;
  const session = {status: 'authenticated', idToken: 'token-a', user: {uid: 'student-a'}};
  const document = {visibilityState: 'visible', addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name)};
  const jsx = (type, props) => ({type, props});
  const Component = loadProduction('apps/student/src/services/StudentSummaryRead.tsx', {
    react: h.react, 'react/jsx-runtime': {jsx, jsxs: jsx, Fragment: 'fragment'}, './studentResultRecovery': recovery,
    '../../../../shared/services/authProvider': {useAuthProvider: () => ({session})},
  }, {document, window: {addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name)},
    performance: {now: () => now}, setTimeout: (fn, delay) => {timers.set(++id, {at: now + delay, fn}); return id;}, clearTimeout: key => timers.delete(key)}).default;
  h.mount(Component, {load, label: 'results', children: value => jsx('output', {children: value.label ?? 'confirmed empty'})});
  return {h, session, timers, document, listeners,
    async advance(ms) {now += ms; const due = [...timers].filter(([, timer]) => timer.at <= now); for (const [key, timer] of due) {timers.delete(key); timer.fn();} await h.flush();},
    async event(name) {listeners.get(name)?.(); await h.flush();},
    async click(label) {control(h.tree, 'button', label).props.onClick(); await h.flush();},
  };
}

test('mounted summary renders pending, failure and explicit retry without showing stale results', async () => {
  const first = deferred(), second = deferred(); let calls = 0;
  const view = mounted(() => ++calls === 1 ? first.promise : second.promise);
  assert.match(text(view.h.tree), /Loading results/); await view.h.flush();
  first.reject(new Error('Authoritative read unavailable')); await view.h.flush();
  assert.match(text(view.h.tree), /could not be loaded.*Authoritative read unavailable/);
  await view.event('focus'); assert.equal(calls, 1);
  await view.click('Try again'); assert.equal(calls, 2); assert.match(text(view.h.tree), /Loading results/);
  second.resolve({page: {items: []}, label: 'confirmed empty'}); await view.h.flush();
  assert.match(text(view.h.tree), /confirmed empty/); assert.doesNotMatch(text(view.h.tree), /unavailable/);
  view.h.unmount(); assert.equal(view.listeners.size, 0);
});

test('mounted polling preserves token-refresh budget and minimum wait while manual refresh starts a visible fresh cycle', async () => {
  let calls = 0;
  const view = mounted(async () => {calls++; return {...readiness('processing'), label: 'basic score 0'};});
  await view.h.flush(); assert.match(text(view.h.tree), /Reflective metrics are unavailable.*basic score 0/);
  view.session.idToken = 'refreshed'; view.h.render(); await view.h.flush();
  await view.advance(1999); await view.event('focus'); assert.equal(calls, 1);
  await view.advance(1); assert.equal(calls, 2);
  for (let i = 0; i < 4; i++) await view.advance(2000);
  assert.equal(calls, 6); assert.equal(view.timers.size, 0);
  view.session.idToken = 'refreshed-again'; view.h.render(); await view.h.flush();
  assert.equal(calls, 6); assert.match(text(view.h.tree), /Results not confirmed yet/); assert.doesNotMatch(text(view.h.tree), /basic score/);
  await view.click('Refresh results'); assert.equal(calls, 7); assert.match(text(view.h.tree), /basic score 0/);
  view.h.unmount(); assert.equal(view.timers.size, 0);
});

test('mounted account changes fence old success and rejection and unauthenticated state hides settled content', async () => {
  for (const outcome of ['resolve', 'reject']) {
    const old = deferred(), fresh = deferred(); let calls = 0;
    const view = mounted(() => ++calls === 1 ? old.promise : fresh.promise); await view.h.flush();
    view.session.user = {uid: 'student-b'}; view.session.idToken = 'token-b'; view.h.render(); await view.h.flush();
    fresh.resolve({label: 'Student B only'}); await view.h.flush();
    old[outcome](outcome === 'resolve' ? {label: 'Student A private result'} : new Error('Student A old failure')); await view.h.flush();
    assert.match(text(view.h.tree), /Student B only/); assert.doesNotMatch(text(view.h.tree), /Student A|could not be loaded/);
    view.session.status = 'anonymous'; view.h.render(); await view.h.flush();
    assert.doesNotMatch(text(view.h.tree), /Student B only/); view.h.unmount();
  }
});

test('hidden mounted readers defer dispatch and available results stop pending polls and clear listeners', async () => {
  let calls = 0;
  const view = mounted(async () => {calls++; return {...readiness(calls === 1 ? 'processing' : 'available'), label: 'server result'};});
  view.document.visibilityState = 'hidden'; await view.h.flush(); assert.equal(calls, 0);
  view.document.visibilityState = 'visible'; await view.event('visibilitychange'); assert.equal(calls, 1);
  view.document.visibilityState = 'hidden'; await view.advance(2000); assert.equal(calls, 1);
  view.document.visibilityState = 'visible'; await view.event('focus'); assert.equal(calls, 2);
  assert.equal(view.timers.size, 0); assert.doesNotMatch(text(view.h.tree), /Reflective metrics are unavailable/);
  view.h.unmount(); assert.equal(view.listeners.size, 0);
});
