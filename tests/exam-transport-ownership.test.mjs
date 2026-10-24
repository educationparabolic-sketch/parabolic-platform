import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {createHash, webcrypto} from "node:crypto";
import vm from "node:vm";
import test from "node:test";
const require = createRequire(import.meta.url), ts = require("../functions/node_modules/typescript");
function compile(file, imports = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
  }).outputText, {exports, require: name => {assert.ok(name in imports, name); return imports[name];},
    setTimeout, clearTimeout, AbortController, AbortSignal, TextEncoder, TextDecoder, URL, crypto: webcrypto, atob, btoa,
    queueMicrotask, ...globals});
  return exports;
}
const errors = compile("../shared/types/apiClient.ts");
const transport = compile("../apps/exam/src/resilientTransport.ts", {"../../../shared/types/apiClient": errors});
const ownership = compile("../apps/exam/src/ownershipState.ts");
const claims = {role: "student", instituteId: "i", yearId: "y", runId: "r", sessionId: "s", studentId: "student", launchNonce: "original"};
const jwt = value => `header.${Buffer.from(JSON.stringify({sub: "uid", ...value})).toString("base64url")}.signature`;
const receipt = generation => ({contractVersion: 2, generation, renewAfterSeconds: 30,
  serverTime: "2026-10-20T00:00:30.000Z", expiresAt: "2026-10-20T00:02:00.000Z"});
function harness(settings = {}) {
  let now = 100, failRenew = true, launchFailures = 0, refreshFailure = "", retryDelayHeader = null, activeClaims = {...claims}, authChanged;
  const timers = [], writes = [], storage = new Map(), auth = {currentUser: {uid: "uid"}};
  const client = {post: async (_path, options) => {
    options.validateAuthToken(jwt(activeClaims)); const body = options.body;
    writes.push(structuredClone(body));
    if (settings.request) { const value = await settings.request(_path, options); if (value !== undefined) return value; }
    if (_path.endsWith("/answers") && refreshFailure) throw new errors.ApiClientError("refresh required", 401, "UNAUTHORIZED", null);
    if (body.operation === "launch" && launchFailures > 0) {launchFailures--; now += 1000; throw new errors.ApiClientError("busy", 503, "INTERNAL_ERROR", null);}
    if (body.operation === "renew") {
      assert.equal(options.headers["X-Parabolic-Exam-Generation"], "1");
      assert.ok(options.headers["X-Parabolic-Exam-Owner"]);
      if (failRenew && retryDelayHeader !== null) options.onResponseHeaders(new Headers({"Retry-After": retryDelayHeader}));
      if (failRenew) throw new errors.ApiClientError("busy", 429, "INTERNAL_ERROR", null);
      return {operation: "renew", ownership: receipt(1)};
    }
    return {operation: "launch", ownership: receipt(1), entry: {sessionId: "s", studentId: "student", instituteId: "i", yearId: "y", runId: "r"}};
  }};
  if (settings.reload) {
    auth.authStateReady = async () => {};
    const scopeHash = createHash("sha256").update(JSON.stringify(["uid", "i", "y", "r", "s", "student", "original"])).digest("hex");
    storage.set(ownership.OWNER_STORAGE_KEY, JSON.stringify({scopeHash, current: {proof: "a".repeat(42) + "A", generation: 1}}));
  }
  const location = {origin: "http://unit.test"}, top = {};
  const {ExamRuntimeOwnership} = compile("../apps/exam/src/launchTransport.ts", {
    "firebase/auth": {getIdTokenResult: async (_user, force) => {
        if (force && refreshFailure) throw Object.assign(new Error("SDK refresh unavailable"), {code: refreshFailure});
        return {claims: activeClaims, token: jwt(activeClaims)};
      },
      signInWithCustomToken: async () => {}, signOut: async () => {}, onIdTokenChanged: (_auth, callback) => {authChanged = callback; return () => {}; }},
    "../../../shared/services/portalIntegration": {getPortalApiClient: () => client},
    "../../../shared/services/frontendEnvironment": {getFrontendEnvironment: () => ({apiBaseUrl: ""})},
    "../../../shared/services/firebaseClient": {getFirebaseAuth: () => auth},
    "../../../shared/services/apiClient": {...errors, SAME_ORIGIN_API_BASE_URL: "/api/v1"},
    "../../../shared/services/portalResponseAdapters": {adaptExamSessionEntryResult: value => value, adaptExamSubmitResult: value => value, adaptExamReconcileResult: value => value},
    "./launchBootstrap": {getLaunchMetadata: () => ({status: "valid", sessionId: "s", devMock: false}), takeLaunchCredential: () => settings.reload ? null : "custom"},
    "./resilientTransport": transport, "./ownershipState": ownership,
  }, {window: {location, self: top, top, clearTimeout: () => {}, setTimeout: (callback, delay) => {timers.push({callback, delay}); return timers.length;}},
    document: {visibilityState: "visible"}, navigator: {onLine: true}, performance: {now: () => now},
    sessionStorage: {getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key)}});
  return {owner: new ExamRuntimeOwnership("s"), timers, writes,
    time: value => {now = value;}, failLaunch: count => {launchFailures = count;}, failRefresh: code => {refreshFailure = code;}, retryHeader: value => {retryDelayHeader = value;}, allowRenew: () => {failRenew = false;},
    replaceNonceSilently: () => {activeClaims = {...claims, launchNonce: "replacement"};},
    replaceNonce: () => {activeClaims = {...claims, launchNonce: "replacement"}; authChanged(auth.currentUser);}};
}
test("429 renewal exhausts one coalesced budget without revocation or extending an uncertain receipt", async () => {
  const env = harness(); await env.owner.start(); assert.equal(env.owner.snapshot().phase, "active");
  env.time(30100); env.timers.find(timer => timer.delay === 30000).callback();
  const started = performance.now();
  while (env.owner.snapshot().reason !== "transport_paused" && performance.now() - started < 5000) await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(env.owner.snapshot().phase, "active"); assert.equal(env.owner.snapshot().reason, "transport_paused");
  assert.equal(env.owner.isCurrent(), true);
  assert.equal(env.writes.filter(body => body.operation === "renew").length, 3);
  assert.equal(env.timers.filter(timer => timer.delay === 30000).length, 1);
  env.allowRenew(); env.time(40100);
  await Promise.all([env.owner.retryTransport(), env.owner.retryTransport()]);
  const renewals = env.writes.filter(body => body.operation === "renew");
  assert.equal(renewals.length, 4); assert.equal(new Set(renewals.map(body => body.commandId)).size, 1);
  assert.equal(env.owner.snapshot().reason, "");
  env.time(120101); assert.equal(env.owner.isCurrent(), false);
  await assert.rejects(env.owner.retryTransport()); assert.equal(env.writes.length, 5); // Original 30-second send + 90 seconds, never manual retry time + 90.
});
test("same-UID new-nonce token notification is terminal for the original document", async () => {
  const env = harness(); await env.owner.start(); env.replaceNonce();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(env.owner.snapshot().phase, "lost"); assert.equal(env.owner.isCurrent(), false);
  assert.equal(env.writes.length, 1);
});

test("clock receipt anchors use the successful attempt while lease replay keeps its original send anchor", async () => {
  const env = harness(); env.failLaunch(2);
  const entry = await env.owner.start();
  assert.equal(entry.sentAt, 2100);
  assert.ok(env.timers.some(timer => timer.delay === 88000));
  assert.equal(env.writes.length, 3);
});

test("provisional 401 pauses immediately; reported SDK disabled identity is terminal while refresh network failure stays recoverable", async () => {
  for (const code of ["auth/user-disabled", "auth/network-request-failed"]) {
    const env = harness(), reasons = [];
    await env.owner.start(); env.owner.subscribe(() => reasons.push(env.owner.snapshot().reason)); env.failRefresh(code);
    await assert.rejects(env.owner.post("/exam/session/s/answers", {body: {}}));
    assert.ok(reasons.includes("refresh_pending"));
    if (code === "auth/user-disabled") {assert.equal(env.owner.snapshot().phase, "lost"); assert.equal(env.owner.isCurrent(), false);}
    else {assert.equal(env.owner.snapshot().phase, "active"); assert.equal(env.owner.snapshot().reason, "refresh_unavailable"); assert.equal(env.owner.isCurrent(), true);}
  }
});

test("long server retry minimum is visible, stops automatic dispatch and cannot be reset by duplicate manual clicks", async () => {
  const env = harness(); await env.owner.start(); env.retryHeader("31"); env.time(30100);
  env.timers.find(timer => timer.delay === 30000).callback();
  const started = performance.now();
  while (env.owner.snapshot().reason !== "transport_paused" && performance.now() - started < 1000) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(env.owner.retryWaitMs(), 31000); assert.equal(env.writes.length, 2);
  await assert.rejects(env.owner.retryTransport(), /31 seconds/u); assert.equal(env.writes.length, 2);
  env.time(31100); await assert.rejects(env.owner.retryTransport(), /30 seconds/u); assert.equal(env.owner.retryWaitMs(), 30000);
  env.time(61101); env.allowRenew(); await env.owner.retryTransport();
  assert.equal(env.owner.retryWaitMs(), 0); assert.equal(env.writes.length, 3);
  assert.equal(env.writes[1].commandId, env.writes[2].commandId);
});

test("lost committed submission is reconciled before any mutation replay", async () => {
  let committed = false, submits = 0, reads = 0;
  const canonical = {status: "submitted", alreadySubmitted: true, submittedAt: "immutable"};
  const env = harness({request: async (path, options) => {
    if (path.endsWith("/submit")) {submits++; committed = true; throw new errors.ApiClientError("lost", 0, "NETWORK_ERROR", null);}
    if (options.body.operation === "reconcile") {reads++; assert.equal(committed, true); return {status: "submitted", submission: canonical};}
  }});
  await env.owner.start();
  const actual = await env.owner.post("/exam/session/s/submit", {body: {instituteId: "i", yearId: "y", runId: "r", reason: "expiry"}});
  assert.equal(actual, canonical); assert.equal(submits, 1); assert.equal(reads, 1);
  assert.equal(env.owner.snapshot().phase, "closed");
});
test("new document reads a retained closing receipt without rotating ownership", async () => {
  const env = harness({reload: true, request: async (_path, options) => {
    assert.equal(options.body.operation, "reconcile");
    assert.equal(options.headers["X-Parabolic-Exam-Generation"], "1");
    return {status: "submitted", submission: {alreadySubmitted: true}};
  }});
  const result = await env.owner.start();
  assert.equal(result.terminal.status, "submitted"); assert.equal(result.responseBody, null);
  assert.equal(env.owner.snapshot().phase, "closed"); assert.equal(env.writes.length, 1);
});
test("new document never recovers after wrong-owner denial", async () => {
  const env = harness({reload: true, request: async () => {throw new errors.ApiClientError("denied", 409, "CONFLICT", null, {details: {reason: "ownership_lost"}});}});
  await assert.rejects(env.owner.start()); assert.equal(env.writes.length, 1); assert.equal(env.owner.snapshot().phase, "lost");
});

test("exact expired held denial permits rotating recovery, never active content from the probe", async () => {
  const env = harness({reload: true, request: async (_path, options) => {
    if (options.body.operation === "reconcile") throw new errors.ApiClientError("expired", 409, "CONFLICT", null, {details: {reason: "lease_expired"}});
    assert.equal(options.body.operation, "recover");
    return {operation: "recover", ownership: receipt(2), entry: {sessionId: "s", studentId: "student", instituteId: "i", yearId: "y", runId: "r"}};
  }});
  const value = await env.owner.start();
  assert.equal(value.terminal, null); assert.equal(env.owner.snapshot().phase, "active");
  assert.equal(env.owner.snapshot().generation, 2); assert.equal(env.writes.length, 2);
});
test("uncertain submit reconciled as terminated stops timers and never replays the mutation", async () => {
  let submits = 0;
  const env = harness({request: async (path, options) => {
    if (path.endsWith("/submit")) {submits++; throw new errors.ApiClientError("lost", 0, "NETWORK_ERROR", null);}
    if (options.body.operation === "reconcile") return {status: "terminated"};
  }});
  await env.owner.start();
  await assert.rejects(env.owner.post("/exam/session/s/submit", {body: {reason: "expiry"}}), error => error.details.reason === "session_terminated");
  assert.equal(submits, 1); assert.equal(env.owner.snapshot().phase, "closed");
});

test("canonical confirmation is fenced by the inbound identity tuple even before its observer delivers", async () => {
  let submits = 0;
  const env = harness({request: async (path, options) => {
    if (path.endsWith("/submit")) {submits++; throw new errors.ApiClientError("lost", 0, "NETWORK_ERROR", null);}
    if (options.body.operation === "reconcile") {env.replaceNonceSilently(); return {status: "submitted", submission: {alreadySubmitted: true}};}
  }});
  await env.owner.start();
  await assert.rejects(env.owner.post("/exam/session/s/submit", {body: {reason: "expiry"}}));
  assert.equal(submits, 1); assert.equal(env.owner.snapshot().phase, "lost");
});

test("a renewal queued behind canonical submit cannot revive or invalidate the closed runtime", async () => {
  let release, notify;
  const blocked = new Promise(resolve => {release = resolve;}), sent = new Promise(resolve => {notify = resolve;});
  const env = harness({request: async path => {
    if (path.endsWith("/submit")) {notify(); await blocked; return {status: "submitted", alreadySubmitted: false};}
  }});
  await env.owner.start();
  const submission = env.owner.post("/exam/session/s/submit", {body: {reason: "manual"}});
  await sent; env.time(30100); env.timers.find(timer => timer.delay === 30000).callback();
  release(); await submission; await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(env.owner.snapshot().phase, "closed");
});

test("App Check 403 retains owner intent/proof and lease while an ordinary authority 403 remains terminal",async()=>{
  for(const reason of ["app_check_denied","ownership_lost"]){
    const env=harness({request:async path=>{if(path.endsWith('/answers'))throw new errors.ApiClientError('denied',403,'FORBIDDEN',null,{details:{reason}});}});
    await env.owner.start();const generation=env.owner.snapshot().generation;
    await assert.rejects(env.owner.post('/exam/session/s/answers',{body:{batchId:'retained',answers:[]}}));
    assert.equal(env.owner.snapshot().phase,reason==='app_check_denied'?'active':'lost');
    if(reason==='app_check_denied'){assert.equal(env.owner.snapshot().generation,generation);assert.equal(env.owner.isCurrent(),true);assert.equal(env.writes.filter(b=>b.batchId==='retained').length,1);}
  }
});
