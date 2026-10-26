import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import test from 'node:test';
import {loadProduction, errors} from './helpers/frontend-production-modules.mjs';
import {componentHarness, deferred} from './helpers/vendor-component-harness.mjs';
import {profile, photoId} from './helpers/student-behavior-modules.mjs';

function mounted(api, restricted = false) {
  const h = componentHarness();
  // Layout effects run at the harness's explicit effect flush. This is unit
  // scheduling evidence, not native React layout/paint or browser persistence.
  h.react.useLayoutEffect = h.react.useEffect;
  const jsx = (type, props) => ({type, props});
  const Component = loadProduction('apps/student/src/services/StudentProfileProvider.tsx', {
    react: h.react, 'react/jsx-runtime': {jsx, jsxs: jsx}, '../../../../shared/services/apiClient': errors,
    './studentProfileContext': {StudentProfileContext: {Provider: 'provider'}, purgeLegacyStudentStorage() {}},
    './studentProfileApi': {studentProfileApi: api},
  }, {crypto: {randomUUID}}).default;
  h.mount(Component, {uid: 'student-a', restricted, children: null});
  return {h, get value() {return h.tree.props.value;}, restrict() {h.render({uid: 'student-a', restricted: true, children: null});}};
}

test('profile provider rejects wrong-owner reads and aborts stale requests when restriction hides the profile', async () => {
  const wrong = mounted({profile: async () => ({...profile(), studentId: 'student-b'})});
  await wrong.h.flush(); assert.equal(wrong.value.profile, null); assert.match(wrong.value.error, /Unable to confirm/); wrong.h.unmount();
  const pending = deferred(); let signal;
  const view = mounted({profile: value => {signal = value; return pending.promise;}});
  await view.h.flush(); assert.equal(view.value.loading, true);
  view.restrict(); await view.h.flush(); assert.equal(signal.aborted, true);
  pending.resolve(profile()); await view.h.flush(); assert.equal(view.value.profile, null); assert.equal(view.value.loading, false); view.h.unmount();
});

test('uncertain profile commands suppress duplicates and replay the identical intent before authoritative reload', async () => {
  const pending = deferred(), commands = []; let reads = 0;
  const view = mounted({profile: async () => profile(++reads), preferences: (body, signal) => {commands.push({body, signal}); return commands.length === 1 ? pending.promise : Promise.resolve();}});
  await view.h.flush(); const originalAction = view.value.preferences;
  const first = originalAction(true); await view.h.flush();
  assert.equal(view.value.profile, null); assert.equal(view.value.busy, true);
  await originalAction(false); await view.value.reload(); assert.equal(commands.length, 1); assert.equal(reads, 1);
  pending.reject(new Error('Lost response')); await first; await view.h.flush();
  assert.equal(view.value.pending, 'preferences'); assert.equal(view.value.busy, false); assert.equal(view.value.notice, null);
  await view.value.preferences(false); assert.equal(commands.length, 1);
  await view.value.retry(); await view.h.flush();
  assert.equal(commands.length, 2); assert.strictEqual(commands[1].body, commands[0].body);
  assert.deepEqual(Object.keys(commands[0].body).sort(), ['expectedVersion', 'idempotencyKey', 'preferences']);
  assert.equal(commands[0].body.expectedVersion, 1); assert.equal(commands[0].body.preferences.sidebarCollapsed, true);
  assert.equal(reads, 2); assert.equal(view.value.profile.version, 2); assert.equal(view.value.pending, null); view.h.unmount();
});

test('rejected profile commands clear pending intent and failed authoritative reload cannot restore prior media', async () => {
  let reads = 0, commands = 0;
  const view = mounted({profile: async () => {if (++reads > 1) throw new Error('Reload unavailable'); return profile();},
    preferences: async () => {commands++; throw new errors.ApiClientError('Changed', 409, 'CONFLICT', null);}});
  await view.h.flush(); await view.value.preferences(true); await view.h.flush();
  assert.equal(reads, 2); assert.equal(view.value.profile, null); assert.equal(view.value.pending, null);
  assert.equal(view.value.busy, false); assert.match(view.value.error, /CONFLICT/);
  await view.value.retry(); assert.equal(commands, 1); view.h.unmount();
});

test('restricted privacy withdrawal retains only known pointer and distinguishes revoked access from confirmed deletion', async () => {
  const calls = [], lifecycle = deferred(); let reads = 0;
  const view = mounted({profile: async () => {reads++; return profile(4);},
    withdraw: async body => {calls.push(body); return {photoId, version: 5, accessRevoked: true};},
    lifecycle: (id, signal) => {calls.push({id, signal}); return lifecycle.promise;},
    preferences: () => assert.fail('Restricted preference dispatched'), enroll: () => assert.fail('Restricted enrollment dispatched')});
  await view.h.flush(); view.restrict(); await view.h.flush();
  assert.equal(view.value.profile, null); assert.equal(view.value.privacyAvailable, true);
  await view.value.preferences(true); await view.value.enroll('bytes'); await view.value.reload(); assert.equal(reads, 1);
  await view.value.withdraw(); await view.h.flush();
  assert.equal(calls[0].expectedVersion, 4); assert.equal(calls[0].expectedPhotoId, photoId); assert.equal(reads, 1);
  assert.match(view.value.notice, /Physical deletion is not yet confirmed/); assert.equal(view.value.lifecycle, null); assert.equal(view.value.canCheckDeletion, true);
  const check = view.value.checkDeletion(); await view.h.flush(); assert.equal(calls[1].id, photoId);
  view.h.unmount(); assert.equal(calls[1].signal.aborted, true);
  lifecycle.resolve({photoId, state: 'deleted', deletionReason: 'consent_withdrawn', deletedAt: '2026-10-24T09:00:00.000Z'}); await check;
  assert.equal(view.value.lifecycle, null);
});
