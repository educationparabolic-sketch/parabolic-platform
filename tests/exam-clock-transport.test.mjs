import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import vm from "node:vm";
import test from "node:test";
const require = createRequire(import.meta.url), ts = require("../functions/node_modules/typescript");
function compile(file, imports = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
  }).outputText, {exports, require: name => {assert.ok(name in imports, name); return imports[name];},
    setTimeout, clearTimeout, AbortController, ...globals});
  return exports;
}
const clock = compile("../apps/exam/src/runtimeClock.ts");
const errors = compile("../shared/types/apiClient.ts"), envelopes = compile("../shared/types/apiResponse.ts");
const transport = compile("../apps/exam/src/resilientTransport.ts", {
  "../../../shared/types/apiClient": errors, "../../../shared/types/apiResponse": envelopes,
});
const {RuntimeTransportError: Failure, runRuntimeOperation, retryAfterMs, dispatchRuntimeRequest} = transport;
const anchor = "2026-10-20T00:00:00.000Z", deadline = "2026-10-20T00:01:00.000Z";

test("clock deducts full request time, recomputes elapsed, ignores both wall jumps and preserves ordering bounds", () => {
  const c = new clock.RuntimeClock();
  assert.throws(() => c.timestamp(0, 1));
  c.accept(anchor, deadline, 100, 1100);
  assert.equal(c.remaining(1100), 59000); assert.equal(c.remaining(6100), 54000);
  const original = Date.now;
  try {
    for (const jump of [-86400000, 86400000]) {
      Date.now = () => original() + jump;
      assert.equal(c.remaining(6100), 54000);
      assert.equal(c.timestamp(0, 6100), Date.parse(anchor) + 5000);
    }
  } finally {Date.now = original;}
  assert.equal(c.timestamp(Date.parse(anchor) + 5000, 6100), Date.parse(anchor) + 5001);
  assert.throws(() => c.timestamp(Date.parse(anchor) + 35000, 6100));
  assert.throws(() => c.timestamp(Number.MAX_SAFE_INTEGER, 6100));
  assert.equal(c.remaining(120000), 0); assert.throws(() => c.serverNow(1));
  c.accept(anchor, deadline, 0, 70000); assert.equal(c.remaining(70000), 0);
});
test("question dwell excludes hidden/paused intervals and rejects throttled/sleep or backwards gaps", () => {
  assert.equal(clock.interactionElapsed(100, 1750, true).elapsed, 1650);
  assert.equal(clock.interactionElapsed(100, 1750, false).elapsed, 0);
  for (const jump of [-86400000, 86400000]) {
    const result = clock.interactionElapsed(100, 1100, true, 10000, 11000 + jump);
    assert.equal(result.uncertain, true); assert.equal(result.elapsed, 0);
  }
  for (const now of [50, 5101, Infinity]) {
    const result = clock.interactionElapsed(100, now, true);
    assert.equal(result.elapsed, 0); assert.equal(result.uncertain, true);
  }
});
test("Retry-After uses integer/server-date bounds without local wall time", () => {
  assert.equal(retryAfterMs("2", null), 2000);
  assert.equal(retryAfterMs("Tue, 20 Oct 2026 00:00:05 GMT", "Tue, 20 Oct 2026 00:00:00 GMT"), 5000);
  for (const value of ["bad", "1.5", "-1", "Tue, 20 Oct 2026 00:00:05 GMT"]) assert.equal(retryAfterMs(value, null), null);
  assert.equal(retryAfterMs("31", null), 31000);
});
const operation = overrides => ({signal: new AbortController().signal, current: () => true, available: () => true,
  token: async () => "verified-token", dispatch: async () => ({}), wait: async () => {}, ...overrides});
test("one retained operation dispatches at most three times with minimum delays and no invalid/403 retries", async () => {
  let attempts = 0; const waits = [];
  await assert.rejects(runRuntimeOperation(operation({dispatch: async () => {attempts++; throw new Failure("busy", 429, "HTTP_ERROR", 3000);},
    wait: async ms => waits.push(ms)})));
  assert.equal(attempts, 3); assert.deepEqual(waits, [3000, 3000]);
  for (const [status, code] of [[403, "FORBIDDEN"], [409, "CONFLICT"], [200, "INVALID_RESPONSE"]]) {
    attempts = 0;
    await assert.rejects(runRuntimeOperation(operation({dispatch: async () => {attempts++; throw new Failure("denied", status, code);}})));
    assert.equal(attempts, 1);
  }
  attempts = 0;
  await assert.rejects(runRuntimeOperation(operation({dispatch: async () => {attempts++; throw new Failure("later", 503, "HTTP_ERROR", 31000);}})), /at least 31 seconds/u);
  assert.equal(attempts, 1);
});
test("401 refresh keeps the operation budget and treats refresh network failure as transient", async () => {
  let dispatches = 0, pauses = 0; const forced = [];
  const result = await runRuntimeOperation(operation({onUnauthorized: () => {pauses++;}, token: async force => {
    forced.push(force); if (forced.length === 2) throw new Failure("offline refresh", 0, "NETWORK_ERROR"); return "same-tuple";
  }, dispatch: async () => {if (++dispatches === 1) throw new Failure("expired", 401, "UNAUTHORIZED"); return "accepted";}}));
  assert.equal(result, "accepted"); assert.deepEqual(forced, [false, true, true]); assert.equal(dispatches, 2); assert.equal(pauses, 1);
  dispatches = 0;
  await assert.rejects(runRuntimeOperation(operation({dispatch: async () => {dispatches++; throw new Failure("denied", 401, "UNAUTHORIZED");}})));
  assert.equal(dispatches, 2);
});
test("timeout covers stalled SDK work, decoding and late completions; abort/offline win before dispatch", async () => {
  let calls = 0, release;
  const token = new Promise(resolve => {release = resolve;});
  await assert.rejects(runRuntimeOperation(operation({timeoutMs: 5, token: () => token,
    dispatch: async () => {calls++;}})), /timed out/u);
  release("late-token"); await new Promise(resolve => setTimeout(resolve, 10)); assert.equal(calls, 0);
  let decode;
  const decoding = new Promise(resolve => {decode = resolve;});
  await assert.rejects(runRuntimeOperation(operation({timeoutMs: 5,
    dispatch: async () => {calls++; return decoding;}})), /timed out/u);
  assert.equal(calls, 3); decode({late: "receipt"}); calls = 0;
  let current = true;
  await assert.rejects(runRuntimeOperation(operation({current: () => current,
    dispatch: async () => {calls++; throw new Failure("busy", 503, "HTTP_ERROR");},
    wait: async () => {current = false;}})), /authority/u);
  assert.equal(calls, 1); calls = 0;
  await assert.rejects(runRuntimeOperation(operation({available: () => false, dispatch: async () => {calls++;}})));
  assert.equal(calls, 0);
  const during = new AbortController();
  await assert.rejects(runRuntimeOperation(operation({signal: during.signal, timeoutMs: 1000,
    token: () => {during.abort(new Error("identity changed during SDK call")); return new Promise(() => {});}})), /identity changed/u);
  const controller = new AbortController(); controller.abort(new Error("lifetime ended"));
  await assert.rejects(runRuntimeOperation(operation({signal: controller.signal})), /authority/u);
});
test("scoped shared-client dispatch disables hidden refresh, preserves body and exposes only retry headers", async () => {
  const body = '{"batchId":"immutable","answers":[{"clientTimestamp":123}]}';
  let options;
  const client = {post: async (_path, value) => {options = value;
    value.onResponseHeaders(new Headers({"Retry-After": "2"}));
    throw new errors.ApiClientError("busy", 503, "HTTP_ERROR", null);
  }};
  await assert.rejects(dispatchRuntimeRequest(client, "/exam/session/s/answers", body, {}, () => {}, new AbortController().signal), error => error.status === 503 && error.retryAfterMs === 2000);
  assert.equal(JSON.stringify(options.body), body); assert.equal(options.refreshAuthOn401, false);
  assert.equal(options.retry.maxAttempts, 1);
  const controller = new AbortController(); controller.abort();
  const canceled = {post: async (_path, value) => value.validateAuthToken("late-token")};
  await assert.rejects(dispatchRuntimeRequest(canceled, "/x", body, {}, () => assert.fail("late SDK result dispatched"), controller.signal));
});
