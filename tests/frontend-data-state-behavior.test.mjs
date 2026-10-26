import assert from 'node:assert/strict';
import test from 'node:test';
import {loadProduction} from './helpers/frontend-production-modules.mjs';
import {nodes, text, control} from './helpers/vendor-component-harness.mjs';

const state = () => loadProduction('shared/services/frontendDataState.ts');
test('a reset fences late success and failure from an earlier view without consuming current requests', () => {
  const s = state(), old = s.beginFrontendDataRequest('GET', '/admin/old'); s.resetFrontendDataState();
  const current = s.beginFrontendDataRequest('GET', '/admin/current'), before = s.getFrontendDataStateSnapshot();
  s.completeFrontendDataRequest(old, [{stale: true}]); s.failFrontendDataRequest(old, {status: 403});
  assert.equal(s.getFrontendDataStateSnapshot(), before);
  s.completeFrontendDataRequest(current, []); assert.equal(s.getFrontendDataStateSnapshot().kind, 'empty');
});
test('parallel completion cannot clear an authoritative failure and a fresh request can recover', () => {
  const s = state(), a = s.beginFrontendDataRequest('GET', '/a'), b = s.beginFrontendDataRequest('GET', '/b');
  s.failFrontendDataRequest(a, {status: 403, message: 'Denied current account'});
  s.completeFrontendDataRequest(b, [{valid: true}]); s.releaseFrontendDataStateIfIdle();
  assert.equal(s.getFrontendDataStateSnapshot().kind, 'permission');
  const fresh = s.beginFrontendDataRequest('GET', '/a'); assert.equal(s.getFrontendDataStateSnapshot().kind, 'loading');
  s.completeFrontendDataRequest(fresh, [{valid: true}]); assert.equal(s.getFrontendDataStateSnapshot().kind, 'ready');
});
test('mixed empty and nonempty requests publish only after all settle, with subscription cleanup', () => {
  const s = state(); let updates = 0; const unsubscribe = s.subscribeToFrontendDataState(() => updates++);
  const a = s.beginFrontendDataRequest('GET', '/a'), b = s.beginFrontendDataRequest('GET', '/b');
  s.completeFrontendDataRequest(a, []); assert.equal(s.getFrontendDataStateSnapshot().kind, 'loading');
  s.completeFrontendDataRequest(b, [{count: 0}]); assert.equal(s.getFrontendDataStateSnapshot().kind, 'ready');
  const prior = updates; unsubscribe(); s.resetFrontendDataState(); assert.equal(updates, prior);
});
test('the mounted boundary hides non-ready children, distinguishes errors and retries by a full reload', () => {
  const s = state(), effects = []; let reloads = 0;
  const jsx = (type, props) => ({type, props});
  const {default: Boundary} = loadProduction('shared/ui/components/UiDataStateBoundary.tsx', {
    react: {useSyncExternalStore: (_subscribe, read) => read(), useLayoutEffect: fn => effects.push(fn), useEffect: fn => effects.push(fn)},
    'react/jsx-runtime': {jsx, jsxs: jsx, Fragment: 'fragment'},
    '../../services/frontendEnvironment': {shouldUseLiveApi: () => true}, '../../services/frontendDataState': s,
  }, {window: {setTimeout: () => 1, clearTimeout() {}, location: {reload: () => reloads++}}});
  const render = () => Boundary({label: 'Admin', children: 'Private child data'});
  render(); effects.splice(0).forEach(fn => fn());
  let tree = render(), content = nodes(tree).find(node => node?.props?.['data-ui-data-state-content'] !== undefined);
  assert.equal(content.props.style.display, 'none'); assert.equal(content.props['aria-hidden'], 'true');
  assert.ok(nodes(tree).some(node => node?.props?.role === 'status')); assert.doesNotMatch(text(tree), /Retry/);
  for (const [error, title] of [[{status: 403}, 'You cannot access this data'], [{code: 'INVALID_RESPONSE'}, 'The response could not be validated'], [Error('offline'), 'Authoritative data is unavailable']]) {
    const request = s.beginFrontendDataRequest('GET', '/admin'); s.failFrontendDataRequest(request, error);
    tree = render(); assert.ok(text(tree).includes(title)); control(tree, 'button', 'Retry').props.onClick();
  }
  assert.equal(reloads, 3);
  const request = s.beginFrontendDataRequest('GET', '/admin'); s.completeFrontendDataRequest(request, [{confirmed: true}]);
  tree = render(); assert.equal(tree.props.style.display, 'contents'); assert.equal(tree.props['aria-hidden'], undefined);
});
