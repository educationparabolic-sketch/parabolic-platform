import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import test from 'node:test';
import {loadProduction} from './helpers/frontend-production-modules.mjs';
import {deferred} from './helpers/vendor-component-harness.mjs';
import {logicalClock, stamp} from './helpers/exam-behavior-modules.mjs';

function cameraFixture() {
  const c = logicalClock(), requests = [], observations = [], changes = [], videos = []; let current = true;
  const {CameraReadiness} = loadProduction('apps/exam/src/cameraReadiness.ts', {}, {...c.globals,
    navigator: {mediaDevices: {getUserMedia: options => {assert.deepEqual(options, {video: {facingMode: 'user'}, audio: false}); const next = deferred(); requests.push(next); return next.promise;}}},
    document: {createElement: tag => {assert.equal(tag, 'video'); const v = {readyState: 2, videoWidth: 640, videoHeight: 480,
      srcObject: null, play: () => new Promise(() => {}), pause() {this.paused = true;}}; videos.push(v); return v;}}});
  const camera = new CameraReadiness(() => current, (state, stream) => changes.push({state, stream}), event => observations.push(event));
  const media = () => {const t = new EventTarget(); Object.assign(t, {readyState: 'live', enabled: true, muted: false, stop() {this.readyState = 'ended';}});
    return {track: t, getTracks: () => [t], getVideoTracks: () => [t]};};
  return {c, camera, media, requests, observations, changes, videos, lose: () => {current = false;}};
}

test('overlapping camera permission completions and rejections cannot replace a newer consent cycle', async () => {
  for (const outcome of ['resolve', 'reject']) {
    const f = cameraFixture(), first = f.camera.start(), second = f.camera.start(), fresh = f.media(), stale = f.media();
    f.requests[1].resolve(fresh); await second; await f.c.tick(100); assert.equal(f.camera.isReady(), true);
    f.requests[0][outcome](outcome === 'resolve' ? stale : new Error('Old permission denied')); await first;
    assert.equal(f.camera.isReady(), true); assert.deepEqual(f.observations, ['CAMERA_READY']);
    if (outcome === 'resolve') assert.equal(stale.track.readyState, 'ended');
    assert.equal(fresh.track.readyState, 'live'); assert.equal(f.videos.length, 1);
    f.camera.stop(); assert.equal(fresh.track.readyState, 'ended'); assert.equal(f.videos[0].srcObject, null); assert.equal(f.c.timers.size, 0);
  }
});

test('stalled preview play cannot block owner-loss cleanup or turn a zero-dimension preview into readiness', async () => {
  const f = cameraFixture(), pending = f.camera.start(), stream = f.media(); f.requests[0].resolve(stream); await pending;
  f.videos[0].videoWidth = 0; await f.c.tick(100); assert.equal(f.camera.isReady(), false); assert.deepEqual(f.observations, []);
  f.lose(); await f.c.tick(100); assert.equal(stream.track.readyState, 'ended'); assert.equal(f.videos[0].srcObject, null);
  assert.equal(f.camera.isReady(), false); assert.equal(f.c.timers.size, 0); assert.deepEqual(f.observations, []);
});

const receipt = batch => ({contractVersion: 1, sessionId: 'session-a', generation: 1, batchId: batch.batchId, disposition: 'accepted', acceptedCount: batch.events.length,
  receivedAt: stamp, retainedUntil: '2026-11-23T09:00:00.000Z', source: 'client_report'});
function queueFixture(send) {
  const c = logicalClock(), states = []; let current = true, online = false;
  const {IntegrityQueue} = loadProduction('apps/exam/src/integrityQueue.ts', {}, {...c.globals, crypto: webcrypto});
  const queue = new IntegrityQueue('session-a', 1, () => current, () => online, send, state => states.push(state));
  return {c, queue, get state() {return states.at(-1);}, online() {online = true; queue.wake();}, lose() {current = false;}};
}

test('reporting bursts batch at ten in order and only matching acknowledged events count as saved before the next five-second dispatch', async () => {
  const first = deferred(), sent = [];
  const f = queueFixture(batch => {sent.push(structuredClone(batch)); return sent.length === 1 ? first.promise : Promise.resolve(receipt(batch));});
  for (let i = 0; i < 12; i++) f.queue.capture(i % 2 ? 'WINDOW_BLUR' : 'WINDOW_FOCUS_RETURNED', 'exam');
  f.online(); await f.c.tick(0); assert.equal(sent[0].events.length, 10); assert.equal(f.state.pending, 12); assert.equal(f.state.saved, 0);
  f.queue.capture('NETWORK_LOSS', 'exam'); first.resolve(receipt(sent[0])); await f.c.tick(0);
  assert.equal(f.state.saved, 10); assert.equal(f.state.pending, 3);
  await f.c.tick(4999); assert.equal(sent.length, 1); await f.c.tick(1);
  assert.equal(sent[1].events.length, 3); assert.equal(sent[1].events[2].eventType, 'NETWORK_LOSS'); assert.notEqual(sent[0].batchId, sent[1].batchId);
  assert.equal(f.state.saved, 13); assert.equal(f.state.pending, 0); f.queue.stop();
});

test('reporting deduplicates only same type and phase inside one second and stops a late failed flight after authority loss', async () => {
  const pending = deferred(); let batch, signal, calls = 0;
  const f = queueFixture((body, abort) => {calls++; batch = body; signal = abort; return pending.promise;});
  f.queue.capture('WINDOW_BLUR', 'lobby'); await f.c.tick(999); f.queue.capture('WINDOW_BLUR', 'lobby'); assert.equal(f.state.pending, 1);
  await f.c.tick(1); f.queue.capture('WINDOW_BLUR', 'lobby'); f.queue.capture('WINDOW_BLUR', 'exam'); assert.equal(f.state.pending, 3);
  f.online(); await f.c.tick(0); assert.equal(batch.events.length, 3); f.lose(); pending.reject({status: 500}); await f.c.tick(0);
  assert.equal(f.state.status, 'stopped'); assert.equal(f.state.saved, 0); assert.equal(f.state.lost, 3); assert.equal(signal.aborted, true);
  f.queue.retry(); f.queue.capture('CAMERA_READY', 'exam'); await f.c.tick(60000); assert.equal(calls, 1); assert.equal(f.state.pending, 0);
});
