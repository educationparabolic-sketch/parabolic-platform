import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import {root, ts} from "./helpers/vendor-action-inventory.mjs";
const read = path => readFile(`${root}/${path}`, "utf8");
const [source, errorSource, responseSource] = await Promise.all([read("shared/services/apiClient.ts"), read("shared/types/apiClient.ts"), read("shared/types/apiResponse.ts")]);
function compile(source, dependencies = {}, globals = {}) {
  const module = {exports: {}};
  const code = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
  new Function("exports", "module", "require", ...Object.keys(globals), code)(module.exports, module, name => {
    assert.ok(name in dependencies, name); return dependencies[name];
  }, ...Object.values(globals));
  return module.exports;
}
const errors = compile(errorSource), responses = compile(responseSource);
function client({getToken, fetch, attestation, retryPolicy}) {
  const current = {user: {uid: "actor_a"}}, signals = [];
  const sdk = compile(source, {
    "./applicationAttestation": {applicationAttestation: attestation ?? (async () => null)},
    "firebase/auth": {getIdToken: (user, force) => getToken?.(current, user, force) ?? Promise.resolve("test-token")},
    "./firebaseClient": {getFirebaseAuth: () => ({currentUser: current.user})},
    "./frontendEnvironment": {getFrontendEnvironment: () => ({apiBaseUrl: "/api/v1"})},
    "./authSessionConvergence": {buildFirebaseRefreshAuthoritySignal: () => null, classifyApiAuthorityFailure: input => input.status === 401 ? {issue: "session_revoked"} : null, publishAuthAuthoritySignal: signal => signals.push(signal)},
    "./frontendDataState": {beginFrontendDataRequest: () => "test", completeFrontendDataRequest: () => {}, failFrontendDataRequest: () => {}},
    "./frontendMonitoring": {captureFrontendApiFailure: () => {}, captureFrontendApiTiming: () => {}},
    "../types/apiClient": errors, "../types/apiResponse": responses,
  }, {window: {location: {origin: "http://unit.test"}, setTimeout}, fetch: (...args) => fetch(current, ...args)});
  return {current, signals, api: sdk.createApiClient({baseUrl: "http://unit.test/api/v1", retryPolicy: {maxAttempts: 1, ...retryPolicy}})};
}
const ok = () => new Response(JSON.stringify({success: true, code: "OK", data: {confirmed: true}, message: "OK", requestId: "test", timestamp: "2026-10-14T00:00:00.000Z"}), {status: 200, headers: {"content-type": "application/json"}});

test("401 cannot refresh another user's credentials and resend an earlier mutation", async () => {
  let requests = 0, refreshes = 0;
  const env = client({getToken: (_current, _user, force) => { if (force) refreshes++; return "test-token"; }, fetch: current => {
    requests++; current.user = {uid: "actor_b"};
    return new Response("{}", {status: 401, headers: {"content-type": "application/json"}});
  }});
  await assert.rejects(env.api.post("/vendor/institutes/a", {body: {name: "Original intent"}}), error => error.code === "AUTH_SCOPE_CHANGED" && error.status === 0);
  assert.equal(requests, 1); assert.equal(refreshes, 0); assert.deepEqual(env.signals, []);
});

test("identity changes while resolving a token stop dispatch, and late success cannot supply new-user authority", async () => {
  let requests = 0;
  const before = client({getToken: current => {current.user = {uid: "actor_b"}; return "test-token";}, fetch: () => {requests++; return ok();}});
  await assert.rejects(before.api.get("/vendor/institutes"), error => error.code === "AUTH_SCOPE_CHANGED");
  assert.equal(requests, 0);
  const after = client({fetch: current => {requests++; current.user = {uid: "actor_b"}; return ok();}});
  await assert.rejects(after.api.get("/vendor/institutes"), error => error.code === "AUTH_SCOPE_CHANGED");
  assert.equal(requests, 1);
});

test("same-UID refresh keeps the original request and intentional public requests remain unbound", async () => {
  const sent = [], tokens = [];
  const env = client({getToken: (_current, user, force) => {tokens.push([user.uid, force]); return force ? "refreshed-test-token" : "test-token";}, fetch: (_current, _url, options) => {
    sent.push({body: options.body, auth: options.headers.get("Authorization")});
    return sent.length === 1 ? new Response("{}", {status: 401, headers: {"content-type": "application/json"}}) : ok();
  }});
  assert.deepEqual(await env.api.post("/vendor/institutes/a", {body: {idempotencyKey: "original"}}), {confirmed: true});
  assert.equal(sent.length, 2); assert.equal(sent[0].body, sent[1].body);
  assert.equal(sent[1].auth, "Bearer refreshed-test-token");
  assert.deepEqual(tokens, [["actor_a", false], ["actor_a", true]]);
  const publicClient = client({fetch: current => {current.user = {uid: "actor_b"}; return ok();}});
  assert.deepEqual(await publicClient.api.post("/exam/entry", {skipAuth: true, body: {}}), {confirmed: true});
});

test("a caller can fence same-UID session replacement before dispatch and 401 refresh replay", async () => {
  let requests = 0;
  const env = client({getToken: (_current, _user, force) => force ? "other-session-token" : "owned-session-token",
    fetch: () => {requests++; return new Response("{}", {status: 401, headers: {"content-type": "application/json"}});}});
  const validateAuthToken = token => {if (token !== "owned-session-token") throw new Error("Session changed.");};
  await assert.rejects(env.api.post("/exam/session/id/answers", {body: {}, validateAuthToken}));
  assert.equal(requests, 1);
  const first = client({fetch: () => {requests++; return ok();}});
  await assert.rejects(first.api.post("/exam/session/id/answers", {body: {}, validateAuthToken}));
  assert.equal(requests, 1);
});


test("scoped retry owners can disable the shared 401 replay and observe headers without reading the body", async () => {
  let requests = 0, refreshes = 0, retry;
  const env = client({getToken: (_current, _user, force) => {if (force) refreshes++; return "same-scope-token";},
    fetch: () => {requests++; return new Response(JSON.stringify({success: false, error: {code: "UNAUTHORIZED", message: "refresh required"},
      requestId: "test", timestamp: "2026-10-14T00:00:00.000Z"}), {status: 401, headers: {"content-type": "application/json", "Retry-After": "2"}});}});
  await assert.rejects(env.api.post("/exam/session/s/answers", {body: {batchId: "retained"}, refreshAuthOn401: false,
    onResponseHeaders: headers => {retry = headers.get("Retry-After");}}), error => error.status === 401);
  assert.equal(requests, 1); assert.equal(refreshes, 0); assert.equal(retry, "2"); assert.deepEqual(env.signals, []);
});


test("attestation owner forwards acquired token and strips caller-supplied tokens; 403 does not publish logout", async () => {
  const seen = [];
  const env = client({attestation: async (method, url) => method === "GET" && url === "http://unit.test/api/v1/vendor/institutes" ? "approved-app-token" : null,
    fetch: (_current, _url, options) => {seen.push(options.headers.get("X-Firebase-AppCheck")); return ok();}});
  await env.api.get("/vendor/institutes", {headers: {"X-Firebase-AppCheck": "caller-token"}});
  await env.api.get("/unknown", {headers: {"X-Firebase-AppCheck": "caller-token"}});
  assert.deepEqual(seen, ["approved-app-token", null]);
  const denied = client({fetch: () => new Response(JSON.stringify({success:false,error:{code:"FORBIDDEN",message:"Application attestation is required.",details:{reason:"app_check_denied"}},requestId:"test",timestamp:"2026-10-22T00:00:00.000Z"}), {status:403,headers:{"content-type":"application/json"}})});
  await assert.rejects(denied.api.get("/vendor/institutes"),e=>e.status===403);assert.deepEqual(denied.signals,[]);
});

test("429 metadata preserves server wait and abort cancels a long wait without dispatching again", async () => {
  let requests=0;
  const limited=()=>{requests++;return new Response(JSON.stringify({success:false,error:{code:"RATE_LIMITED",message:"Request rate limit reached. Retry later."},requestId:"test",timestamp:"2026-10-22T00:00:00.000Z"}),{status:429,headers:{"content-type":"application/json","Retry-After":"60"}});};
  const one=client({fetch:limited});await assert.rejects(one.api.get("/vendor/institutes"),e=>e.status===429&&e.retryAfterMs===60000);
  const more=client({fetch:limited,retryPolicy:{maxAttempts:3}});const controller=new AbortController();
  setTimeout(()=>controller.abort(),30);await assert.rejects(more.api.get("/vendor/institutes",{signal:controller.signal}),e=>e.code==="ABORTED");assert.equal(requests,2);
});
