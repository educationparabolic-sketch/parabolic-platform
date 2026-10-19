import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const ts = require("../functions/node_modules/typescript");
function load(name, globals = {}) {
  const source = readFileSync(new URL(`../apps/exam/src/${name}.ts`, import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function("exports", ...Object.keys(globals), code)(exports, ...Object.values(globals));
  return exports;
}
function clock() {
  let now = Date.parse("2026-10-19T00:00:00.000Z"),
    id = 0;
  const timers = new Map();
  const set = (fn, delay, repeat = false) => {
    timers.set(++id, { fn, at: now + delay, delay, repeat });
    return id;
  };
  class FakeDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : [now]));
    }
    static now() {
      return now;
    }
  }
  return {
    globals: {
      Date: FakeDate,
      setTimeout: (fn, delay) => set(fn, delay),
      clearTimeout: (id) => timers.delete(id),
      setInterval: (fn, delay) => set(fn, delay, true),
      clearInterval: (id) => timers.delete(id),
    },
    async tick(ms) {
      const end = now + ms;
      for (;;) {
        const next = [...timers.entries()]
          .filter(([, t]) => t.at <= end)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        const [id, t] = next;
        now = t.at;
        if (t.repeat) t.at += t.delay;
        else timers.delete(id);
        t.fn();
        for (let i = 0; i < 10; i++) await Promise.resolve();
      }
      now = end;
    },
    now: () => now,
  };
}
const receipt = (batch, extra = {}) => ({
  contractVersion: 1,
  sessionId: "session",
  batchId: batch.batchId,
  generation: 2,
  disposition: "accepted",
  acceptedCount: batch.events.length,
  receivedAt: "2026-10-19T00:00:00.000Z",
  retainedUntil: "2026-11-18T00:00:00.000Z",
  source: "client_report",
  ...extra,
});
test("queue preserves uncertain batch and ordering through exact 1/2/5 second retries, then explicit retry", async () => {
  const c = clock();
  const { IntegrityQueue } = load("integrityQueue", c.globals);
  const sent = [];
  let state,
    fail = true;
  const q = new IntegrityQueue(
    "session",
    2,
    () => true,
    () => true,
    async (b) => {
      sent.push({ body: JSON.stringify(b), at: c.now() });
      if (fail) throw { status: 500 };
      return receipt(b, { disposition: "replayed" });
    },
    (s) => (state = s),
  );
  q.capture("WINDOW_BLUR", "exam");
  await c.tick(0);
  q.capture("WINDOW_FOCUS_RETURNED", "exam");
  await c.tick(8000);
  assert.deepEqual(
    sent.map((s) => s.at - sent[0].at),
    [0, 1000, 3000, 8000],
  );
  assert.equal(new Set(sent.map((s) => s.body)).size, 1);
  assert.equal(state.status, "unavailable");
  assert.equal(state.pending, 2);
  assert.equal(state.saved, 0);
  fail = false;
  q.retry();
  await c.tick(0);
  assert.equal(state.saved, 1);
  assert.equal(state.pending, 1);
  await c.tick(4999);
  assert.equal(sent.length, 5);
  await c.tick(1);
  assert.equal(state.saved, 2);
  q.stop();
});
test("queue has one flight, coalesces, caps including flight, drops new and never persists or misacknowledges", async () => {
  const c = clock();
  const { IntegrityQueue } = load("integrityQueue", c.globals);
  let state, resolve, sent;
  const q = new IntegrityQueue(
    "session",
    2,
    () => true,
    () => true,
    (b) => {
      sent = b;
      return new Promise((r) => (resolve = r));
    },
    (s) => (state = s),
  );
  q.capture("WINDOW_BLUR", "lobby");
  q.capture("WINDOW_BLUR", "lobby");
  await c.tick(0);
  for (let i = 0; i < 65; i++) q.capture(i % 2 ? "WINDOW_BLUR" : "WINDOW_FOCUS_RETURNED", "exam");
  assert.equal(state.pending, 60);
  assert.equal(state.lost, 6);
  assert.equal(sent.events.length, 1);
  resolve(receipt(sent, { generation: 3 }));
  await c.tick(0);
  assert.equal(state.saved, 0);
  assert.equal(state.pending, 60);
  assert.equal(state.status, "unavailable");
  q.stop();
  assert.equal(state.pending, 0);
  assert.equal(state.lost, 66);
  assert.equal(state.status, "stopped");
});
test("ack rejects foreign scope, count, source, timestamps, shape and unknown capabilities", () => {
  const { validateIntegrityAcknowledgement: validate } = load("integrityQueue");
  const b = {
    contractVersion: 1,
    batchId: crypto.randomUUID(),
    events: [{ eventType: "CAMERA_READY", phase: "lobby", observedAt: new Date().toISOString() }],
  };
  validate(receipt(b), "session", 2, b);
  for (const patch of [
    { sessionId: "other" },
    { contractVersion: 2 },
    { batchId: crypto.randomUUID() },
    { acceptedCount: 2 },
    { source: "server" },
    { disposition: "sent" },
    { receivedAt: "2026-02-30T00:00:00.000Z" },
    { retainedUntil: "2026-11-19T00:00:00.000Z" },
    { events: [] },
  ])
    assert.throws(() => validate(receipt(b, patch), "session", 2, b));
});
test("rate denial waits its bound, offline pauses, authority loss discards without successor send", async () => {
  const c = clock();
  const { IntegrityQueue } = load("integrityQueue", c.globals);
  let state,
    online = false,
    current = true,
    attempts = 0;
  const q = new IntegrityQueue(
    "session",
    2,
    () => current,
    () => online,
    async (b) => {
      attempts++;
      if (attempts === 1)
        throw { status: 409, details: { reason: "integrity_rate_limited", retryAfterSeconds: 9 } };
      return receipt(b);
    },
    (s) => (state = s),
  );
  q.capture("NETWORK_LOSS", "exam");
  await c.tick(10000);
  assert.equal(attempts, 0);
  online = true;
  q.wake();
  await c.tick(0);
  await c.tick(8999);
  assert.equal(attempts, 1);
  await c.tick(1);
  assert.equal(state.saved, 1);
  q.capture("WINDOW_BLUR", "exam");
  current = false;
  q.stop();
  await c.tick(20000);
  assert.equal(attempts, 2);
  assert.equal(state.lost, 1);
});
function cameraFixture() {
  const c = clock();
  let resolve,
    reject,
    state,
    stream,
    current = true;
  const observations = [];
  const calls = [];
  const video = {
    muted: false,
    playsInline: false,
    readyState: 0,
    videoWidth: 0,
    videoHeight: 0,
    srcObject: null,
    play: async () => {},
    pause() {},
  };
  const { CameraReadiness } = load("cameraReadiness", {
    ...c.globals,
    navigator: {
      mediaDevices: {
        getUserMedia: (opts) => {
          calls.push(opts);
          return new Promise((r, j) => {
            resolve = r;
            reject = j;
          });
        },
      },
    },
    document: { createElement: () => video },
  });
  const camera = new CameraReadiness(
    () => current,
    (s, v) => {
      state = s;
      stream = v;
    },
    (e) => observations.push(e),
  );
  class Track extends EventTarget {
    readyState = "live";
    enabled = true;
    muted = false;
    stop() {
      this.readyState = "ended";
    }
  }
  const track = new Track();
  const media = { getVideoTracks: () => [track], getTracks: () => [track] };
  return {
    c,
    camera,
    calls,
    video,
    track,
    media,
    observations,
    resolve: (value = media) => resolve(value),
    deny: () => reject(new Error("denied")),
    lose: () => (current = false),
    state: () => state,
    stream: () => stream,
  };
}
test("camera requires positive action, live track AND usable preview; mute/disabled invalidates and retry stops old", async () => {
  const f = cameraFixture();
  assert.equal(f.calls.length, 0);
  const pending = f.camera.start();
  assert.equal(f.calls[0].audio, false);
  f.resolve();
  await pending;
  await f.c.tick(100);
  assert.equal(f.camera.isReady(), false);
  f.video.readyState = 2;
  f.video.videoWidth = 640;
  f.video.videoHeight = 480;
  await f.c.tick(100);
  assert.equal(f.camera.isReady(), true);
  assert.deepEqual(f.observations, ["CAMERA_READY"]);
  f.track.muted = true;
  f.track.dispatchEvent(new Event("mute"));
  assert.equal(f.camera.isReady(), false);
  assert.equal(f.track.readyState, "ended");
  assert.equal(f.video.srcObject, null);
  f.track.muted = false;
  await f.c.tick(100);
  assert.equal(f.camera.isReady(), false);
  assert.deepEqual(f.observations, ["CAMERA_READY", "CAMERA_LOST"]);
});
test("camera denial is unavailable and late permission after stop/unmount/owner loss stops all tracks", async () => {
  for (const action of [(f) => f.camera.stop(), (f) => f.lose()]) {
    const f = cameraFixture();
    const p = f.camera.start();
    action(f);
    f.resolve();
    await p;
    assert.equal(f.track.readyState, "ended");
    assert.equal(f.camera.isReady(), false);
  }
  const f = cameraFixture();
  const p = f.camera.start();
  f.deny();
  await p;
  assert.equal(f.state(), "failed");
  assert.deepEqual(f.observations, ["CAMERA_DENIED"]);
});
test("mounted runtime removes false verification/query/viewport claims and keeps answer/submit independent", () => {
  const source = readFileSync(
    new URL("../apps/exam/src/ExamRuntimeApp.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /faceIdentityGazeGuardEnabled|faceGaze|DEVTOOLS_SUSPECTED|runFaceVerificationCheck|captureGazeCalibrationPoint|Face Verified|Verify Face/,
  );
  assert.match(source, /contractVersion: 1, preflight:/);
  assert.match(source, /localQuestionPaused/);
  assert.match(source, /Submission remains available/);
  for (const name of ["cameraReadiness", "integrityQueue"])
    assert.doesNotMatch(
      readFileSync(new URL(`../apps/exam/src/${name}.ts`, import.meta.url), "utf8"),
      /localStorage|sessionStorage|indexedDB|sendBeacon|canvas|toDataURL/,
    );
});

test("camera disabled/ended/owner replacement and readiness timeout require a fresh action", async () => {
  for (const interrupt of [
    (f) => {
      f.track.enabled = false;
    },
    (f) => {
      f.track.readyState = "ended";
    },
    (f) => f.lose(),
  ]) {
    const f = cameraFixture();
    const pending = f.camera.start();
    f.resolve();
    await pending;
    f.video.readyState = 2;
    f.video.videoWidth = 640;
    f.video.videoHeight = 480;
    await f.c.tick(100);
    assert.equal(f.camera.isReady(), true);
    interrupt(f);
    await f.c.tick(100);
    assert.equal(f.camera.isReady(), false);
    assert.equal(f.track.readyState, "ended");
  }
  const f = cameraFixture();
  const pending = f.camera.start();
  f.resolve();
  await pending;
  await f.c.tick(10000);
  assert.equal(f.state(), "failed");
  assert.equal(f.track.readyState, "ended");
  assert.equal(f.stream(), null);
});
test("terminal reporting denials stop and late acknowledgements after teardown never count as saved", async () => {
  for (const reason of [
    "integrity_capacity_reached",
    "integrity_disabled",
    "integrity_window_closed",
    "integrity_receipt_expired",
  ]) {
    const c = clock();
    const { IntegrityQueue } = load("integrityQueue", c.globals);
    let state;
    const q = new IntegrityQueue(
      "session",
      2,
      () => true,
      () => true,
      async () => {
        throw { status: 409, details: { reason } };
      },
      (s) => (state = s),
    );
    q.capture("CAMERA_READY", "lobby");
    await c.tick(0);
    assert.equal(state.status, "stopped");
    assert.equal(state.saved, 0);
    assert.equal(state.lost, 1);
  }
  const c = clock();
  const { IntegrityQueue } = load("integrityQueue", c.globals);
  let state, resolve, batch;
  const q = new IntegrityQueue(
    "session",
    2,
    () => true,
    () => true,
    (b) => {
      batch = b;
      return new Promise((r) => (resolve = r));
    },
    (s) => (state = s),
  );
  q.capture("CAMERA_READY", "lobby");
  await c.tick(0);
  q.stop();
  resolve(receipt(batch));
  await c.tick(0);
  assert.equal(state.saved, 0);
  assert.equal(state.lost, 1);
});
test("bootstrap rejects policy query overrides even in DEV and scrubs rejected values", () => {
  const { captureLaunch } = load("launchBootstrap");
  let path;
  for (const href of [
    "http://localhost/session/demo?token=dev&faceGaze=off",
    "http://localhost/session/demo?cameraReadiness=off#launch=credential",
    "http://localhost/session/demo?mode=Hard#launch=credential",
  ]) {
    const capture = captureLaunch(href, (p) => (path = p), true);
    assert.equal(capture.metadata.status, "invalid");
    assert.equal(capture.takeCredential(), null);
    assert.equal(path, "/session/demo");
  }
});

test("late ended/mute from a replaced stream cannot invalidate fresh readiness", async () => {
  const f = cameraFixture();
  let pending = f.camera.start();
  f.resolve();
  await pending;
  f.video.readyState = 2;
  f.video.videoWidth = 640;
  f.video.videoHeight = 480;
  await f.c.tick(100);
  assert.equal(f.camera.isReady(), true);
  const replacementTrack = new f.track.constructor();
  const replacement = {
    getTracks: () => [replacementTrack],
    getVideoTracks: () => [replacementTrack],
  };
  pending = f.camera.start();
  f.resolve(replacement);
  await pending;
  await f.c.tick(100);
  assert.equal(f.camera.isReady(), true);
  assert.equal(f.track.readyState, "ended");
  f.track.dispatchEvent(new Event("mute"));
  f.track.dispatchEvent(new Event("ended"));
  assert.equal(f.camera.isReady(), true);
  assert.equal(replacementTrack.readyState, "live");
  f.camera.stop();
});
