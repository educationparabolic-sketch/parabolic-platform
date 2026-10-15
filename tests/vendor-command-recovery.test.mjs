import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import test from "node:test";
import {ts, root} from "./helpers/vendor-action-inventory.mjs";
const source = await readFile(`${root}/apps/vendor/src/features/shared/vendorCommandRecovery.ts`, "utf8");
const readSource = await readFile(`${root}/apps/vendor/src/features/shared/useVendorReadScope.ts`, "utf8");
class ApiClientError extends Error { constructor(status) { super(`Rejected ${status}`); this.status = status; } }
function environment(store = new Map()) {
  const actor = {uid: "vendor_a"};
  const storage = {getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key)};
  function load() {
    const module = {exports: {}};
    const code = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
    new Function("module", "exports", "require", "window", code)(module, module.exports, name => name.endsWith("firebaseClient") ? {getFirebaseAuth: () => ({currentUser: actor})} : {ApiClientError}, {sessionStorage: storage});
    return module.exports;
  }
  return {actor, store, storage, load};
}
const intent = (extra = {}) => ({action: "save", expectedRevision: 1, idempotencyKey: randomUUID(), profile: {name: "Original"}, ...extra});
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return {promise, resolve}; };

test("uncertain completion freezes complete tenant-qualified intent and survives reload without automatic replay", async () => {
  const env = environment(), requests = [], completed = new Map();
  let reloadFails = true;
  const transport = {save: async (target, body) => {
    requests.push([target, structuredClone(body)]);
    completed.set(body.idempotencyKey, target);
    return {instituteId: target};
  }};
  let recovery = env.load();
  let api = recovery.withVendorCommandRecovery("institutes", transport, ["save"], async () => { if (reloadFails) throw new Error("Reload unavailable"); });
  const original = intent();
  await assert.rejects(api.save("institute_a", original), /Reload unavailable/u);
  assert.equal(completed.size, 1);
  await assert.rejects(api.save("institute_b", intent()), /different intent/u);
  await assert.rejects(api.save("institute_a", intent({profile: {name: "Edited"}})), /different intent/u);
  assert.equal(requests.length, 1);
  recovery = env.load();
  reloadFails = false;
  api = recovery.withVendorCommandRecovery("institutes", transport, ["save"], async () => {});
  await assert.rejects(api.save("institute_a", intent()), /explicit review/u);
  assert.equal(requests.length, 1);
  const captured = recovery.vendorRecoveryState("vendor_a").call;
  await recovery.retryVendorRecovery("vendor_a", JSON.stringify(captured));
  assert.deepEqual(requests[1], requests[0]);
  assert.equal(completed.size, 1);
  assert.equal(recovery.vendorRecoveryState("vendor_a").call, null);
});

test("synchronous exclusion spans both dispatch and post-commit reload", async () => {
  const env = environment(), recovery = env.load(), dispatch = deferred(), reload = deferred();
  let calls = 0;
  const api = recovery.withVendorCommandRecovery("institutes", {save: async (_target, _body) => { calls++; await dispatch.promise; return {}; }}, ["save"], async () => reload.promise);
  const original = intent(), first = api.save("institute_a", original);
  await assert.rejects(api.save("institute_a", intent()), /in flight/u);
  dispatch.resolve(); await Promise.resolve(); await Promise.resolve();
  await assert.rejects(api.save("institute_a", intent()), /in flight/u);
  assert.equal(calls, 1);
  reload.resolve(); await first;
});

test("definitive rejection permits new intent; transport loss retains the original UUID", async () => {
  const env = environment(), recovery = env.load();
  let failure = new ApiClientError(409);
  const sent = [];
  const api = recovery.withVendorCommandRecovery("commercial", {save: async (target, body) => { sent.push([target, body]); throw failure; }}, ["save"], async () => {});
  await assert.rejects(api.save("institute_a", intent()));
  assert.equal(recovery.vendorRecoveryState("vendor_a").call, null);
  failure = new Error("Connection lost");
  const original = intent();
  await assert.rejects(api.save("institute_a", original));
  await assert.rejects(api.save("institute_a", intent({expectedRevision: 99})));
  assert.deepEqual(sent[2], sent[1]);
  assert.equal(sent[2][1].idempotencyKey, original.idempotencyKey);
});

test("hostile recovery, storage failure and actor changes cannot silently dispatch or replace reviewed intent", async () => {
  const env = environment(), recovery = env.load();
  let calls = 0;
  const api = recovery.withVendorCommandRecovery("commercial", {save: async (_target, _body) => { calls++; return {}; }}, ["save"], async () => {});
  const key = "vendor-command-recovery-v1:vendor_a";
  for (const value of ["not-json", "[]", JSON.stringify({version: 1, family: "commercial", method: "toString", args: ["a", intent()]}), JSON.stringify({version: 1, family: "commercial", method: "save", args: ["a", {idempotencyKey: "bad"}]})]) {
    env.store.set(key, value);
    await assert.rejects(api.save("a", intent()));
    assert.equal(recovery.vendorRecoveryState("vendor_a").invalid, true);
    recovery.removeInvalidVendorRecovery("vendor_a");
  }
  const call = {version: 1, family: "commercial", method: "save", args: ["institute_a", intent()]};
  env.store.set(key, JSON.stringify(call));
  await assert.rejects(api.save("institute_a", intent()), /explicit review/u);
  await assert.rejects(recovery.retryVendorRecovery("vendor_a", JSON.stringify({...call, args: ["institute_b", call.args[1]]})), /changed/u);
  env.actor.uid = "vendor_b";
  await assert.rejects(recovery.retryVendorRecovery("vendor_a", JSON.stringify(call)), /session changed/u);
  assert.equal(recovery.vendorRecoveryState("vendor_b").call, null);
  env.actor.uid = "vendor_a";
  assert.throws(() => recovery.removeInvalidVendorRecovery("vendor_a"), /cannot be discarded/u);
  env.store.delete(key);
  env.storage.setItem = () => { throw new Error("Storage unavailable"); };
  await assert.rejects(api.save("institute_a", intent()), /Storage unavailable/u);
  assert.equal(calls, 0);
});

test("selection epochs abort prior owners and suppress deferred completions after unmount", () => {
  let cleanup;
  const react = {useRef: value => ({current: value}), useCallback: fn => fn, useMemo: fn => fn(), useEffect: fn => { cleanup = fn(); }};
  const module = {exports: {}};
  const code = ts.transpileModule(readSource, {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText;
  new Function("module", "exports", "require", code)(module, module.exports, () => react);
  const scope = module.exports.useVendorReadScope();
  const a = scope.begin("detail"), b = scope.begin("detail"), independent = scope.begin("list");
  assert.equal(a.current(), false); assert.equal(a.signal.aborted, true);
  assert.equal(b.current(), true); assert.equal(independent.current(), true);
  cleanup();
  assert.equal(b.current(), false); assert.equal(independent.current(), false);
  assert.equal(scope.begin("detail").current(), false);
});

test("known provider failures retain exact retry but do not block unrelated targets", async () => {
  const env = environment(), recovery = env.load(), sent = [];
  let providerFailed = true;
  const api = recovery.withVendorCommandRecovery("commercial", {save: async (target, body) => {
    sent.push([target, structuredClone(body)]);
    return {providerOperation: {state: target === "institute_a" && providerFailed ? "failed_retryable" : "succeeded"}};
  }}, ["save"], async () => {});
  await api.save("institute_a", intent());
  assert.equal(recovery.vendorRecoveryState("vendor_a").uncertain, false);
  const captured = recovery.vendorRecoveryState("vendor_a").call;
  await api.save("institute_b", intent());
  await assert.rejects(api.save("institute_a", intent()), /captured retry/u);
  providerFailed = false;
  await recovery.retryVendorRecovery("vendor_a", JSON.stringify(captured));
  assert.deepEqual(sent[2], sent[0]);
  assert.equal(recovery.vendorRecoveryState("vendor_a").call, null);
});

test("actor change during an authorized dispatch preserves old-owner recovery and suppresses its reload", async () => {
  const env = environment(), recovery = env.load(), dispatch = deferred();
  let reloads = 0;
  const api = recovery.withVendorCommandRecovery("institutes", {save: async (_target, _body) => { await dispatch.promise; return {}; }}, ["save"], async () => { reloads++; });
  const first = api.save("institute_a", intent());
  env.actor.uid = "vendor_b"; dispatch.resolve();
  await assert.rejects(first, /session changed/u);
  assert.equal(reloads, 0);
  assert.equal(recovery.vendorRecoveryState("vendor_b").call, null);
  assert.equal(recovery.vendorRecoveryState("vendor_a").call.args[0], "institute_a");
});

test("denial of a later retry cannot prove that an earlier uncertain command never committed", async () => {
  const env = environment(), recovery = env.load();
  let failure = new Error("Response lost after commit");
  const api = recovery.withVendorCommandRecovery("institutes", {save: async (_target, _body) => { throw failure; }}, ["save"], async () => {});
  await assert.rejects(api.save("institute_a", intent()));
  const original = JSON.stringify(recovery.vendorRecoveryState("vendor_a").call);
  failure = new ApiClientError(403);
  await assert.rejects(recovery.retryVendorRecovery("vendor_a", original));
  assert.equal(JSON.stringify(recovery.vendorRecoveryState("vendor_a").call), original);
});

test("multiple captured provider intents can be reviewed and recovered independently", async () => {
  const env = environment(), recovery = env.load(), sent = [];
  let completedTarget = null;
  const api = recovery.withVendorCommandRecovery("commercial", {save: async (target, body) => {
    sent.push([target, structuredClone(body)]);
    return {providerOperation: {state: target === completedTarget ? "succeeded" : "failed_retryable"}};
  }}, ["save"], async () => {});
  await api.save("institute_a", intent());
  await api.save("institute_b", intent());
  const captures = recovery.vendorRecoveryState("vendor_a").calls;
  assert.equal(captures.length, 2);
  completedTarget = "institute_b";
  await recovery.retryVendorRecovery("vendor_a", JSON.stringify(captures.find(call => call.args[0] === "institute_b")));
  assert.deepEqual(sent[2], sent[1]);
  const remaining = recovery.vendorRecoveryState("vendor_a").calls;
  assert.equal(remaining.length, 1); assert.equal(remaining[0].args[0], "institute_a");
});

test("identical resource IDs in different institutes cannot collide in exact commercial recovery", async () => {
  const env = environment(), recovery = env.load(), sent = [];
  let offline = true;
  const api = recovery.withVendorCommandRecovery("commercial", {save: async (instituteId, invoiceId, body) => {
    sent.push([instituteId, invoiceId, structuredClone(body)]);
    if (offline) throw new Error("response lost");
    return {};
  }}, ["save"], async () => {});
  const original = intent({expectedInvoiceRevision: 7, occurredAt: "2026-10-15T00:00:00.000Z", amountMinor: 100});
  await assert.rejects(api.save("tenant_a", "shared_invoice", original));
  await assert.rejects(api.save("tenant_b", "shared_invoice", intent()), /different intent/u);
  assert.equal(sent.length, 1);
  const captured = recovery.vendorRecoveryState("vendor_a").call;
  offline = false;
  await recovery.retryVendorRecovery("vendor_a", JSON.stringify(captured));
  assert.deepEqual(sent[1], sent[0]);
  assert.equal(sent[1][2].occurredAt, original.occurredAt);
  assert.equal(sent[1][2].expectedInvoiceRevision, 7);
});
