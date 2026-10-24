import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import {componentHarness, deferred} from "./helpers/vendor-component-harness.mjs";
import {root, ts} from "./helpers/vendor-action-inventory.mjs";

async function setup() {
  const h = componentHarness(), persistence = deferred(), tokens = new Map();
  const auth = {currentUser: null}, observed = [], calls = [], timers = [], signals = [];
  let authorityListener;
  h.react.createContext = () => ({Provider: "auth-context"});
  const deps = {
    react: h.react, "react/jsx-runtime": {jsx: (type, props) => ({type, props})},
    "firebase/auth": {browserLocalPersistence: {}, setPersistence: () => persistence.promise,
      onIdTokenChanged: (_auth, callback) => {observed.push(callback); return () => calls.push("unsubscribe");},
      getIdToken: user => tokens.get(user.uid).promise,
      signInWithEmailAndPassword: async () => {calls.push("signin"); throw new Error("unexpected sign-in");},
      signOut: async () => {},
    },
    "./browserRuntimeEnvironment": {isLoopbackHostname: () => false},
    "./firebaseClient": {getFirebaseAuth: () => auth},
    "./browserAuthPersistence": {assertBrowserAuthPersistenceAvailable() {}},
    "./legacyBrowserTokenStorage": {clearLegacyBrowserTokenCopies: () => calls.push("cleanup")},
    "./authSessionConvergence": {hasAuthorizationAdvanced: () => false, subscribeToAuthAuthoritySignals: listener => {authorityListener = listener; return () => {};},
      buildFirebaseRefreshAuthoritySignal: () => ({issue: "session_revoked"}), publishAuthAuthoritySignal: signal => signals.push(signal)},
  };
  const source = (await readFile(`${root}/shared/services/authProvider.tsx`, "utf8"))
    .replaceAll("import.meta.env.MODE", '"production"');
  const output = ts.transpileModule(source, {fileName: "authProvider.tsx", compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  }}).outputText;
  const module = {exports: {}};
  new Function("module", "exports", "require", "window", output)(module, module.exports, name => {
    assert.ok(name in deps, name); return deps[name];
  }, {setInterval: callback => {timers.push(callback); return timers.length;}, clearInterval() {}});
  h.mount(module.exports.AuthProvider, {portalKey: "student", children: null});
  await h.flush();
  return {h, persistence, tokens, auth, observed, calls, deps, timers, signals, authority: signal => authorityListener(signal), value: () => h.tree.props.value};
}

test("no observer or usable sign-in is installed before persistence settles; rejection stays unauthenticated", async () => {
  const env = await setup();
  assert.equal(env.observed.length, 0); assert.equal(env.value().session.status, "loading");
  env.persistence.reject(new Error("persistence-unavailable")); await env.h.flush();
  assert.equal(env.observed.length, 0); assert.equal(env.value().session.status, "unauthenticated");
  assert.equal(env.value().session.error, "persistence-unavailable");
  assert.equal(await env.value().signIn({email: "test@example.invalid", password: "synthetic"}), false);
  assert.ok(!env.calls.includes("signin")); env.h.unmount();
});
test("unmounted pending persistence cannot install a late observer", async () => {
  const env = await setup(); env.h.unmount(); env.persistence.resolve(); await env.h.flush();
  assert.equal(env.observed.length, 0);
});
for (const result of ["resolve", "reject"]) test(`late old-user ${result} cannot replace or clear the newer session`, async () => {
  const env = await setup(); env.persistence.resolve(); await env.h.flush();
  assert.equal(env.observed.length, 1);
  for (const uid of ["a", "b"]) {
    env.tokens.set(uid, deferred()); env.auth.currentUser = {uid}; env.observed[0](env.auth.currentUser);
  }
  env.tokens.get("b").resolve("synthetic-b-token"); await env.h.flush();
  assert.equal(env.value().session.user.uid, "b");
  if (result === "resolve") env.tokens.get("a").resolve("synthetic-a-token");
  else env.tokens.get("a").reject(new Error("late-old-user-failure"));
  await env.h.flush(); assert.equal(env.value().session.user.uid, "b");
  assert.equal(env.value().session.idToken, "synthetic-b-token"); env.h.unmount();
});
test("logout fences a pending earlier observer token read", async () => {
  const env = await setup(); env.persistence.resolve(); await env.h.flush();
  env.tokens.set("a", deferred()); env.auth.currentUser = {uid: "a"}; env.observed[0](env.auth.currentUser);
  env.auth.currentUser = null; env.observed[0](null);
  env.tokens.get("a").resolve("synthetic-old-token"); await env.h.flush();
  assert.equal(env.value().session.status, "unauthenticated"); assert.equal(env.value().session.idToken, null);
  env.h.unmount();
});

test("late failed sign-in cannot clear a newer native SDK identity", async () => {
  const env = await setup(); env.persistence.resolve(); await env.h.flush();
  const signIn = deferred();
  env.deps["firebase/auth"].signInWithEmailAndPassword = () => signIn.promise;
  const pending = env.value().signIn({email: "a@example.invalid", password: "synthetic"});
  env.tokens.set("b", deferred()); env.auth.currentUser = {uid: "b"}; env.observed[0](env.auth.currentUser);
  env.tokens.get("b").resolve("synthetic-b-token"); await env.h.flush();
  signIn.reject(new Error("late old login failure"));
  assert.equal(await pending, false); await env.h.flush();
  assert.equal(env.value().session.user.uid, "b"); env.h.unmount();
});

test("the token-free storage probe checks write/read/delete and fails closed without retaining session authority", async () => {
  const source = await readFile(`${root}/shared/services/browserAuthPersistence.ts`, "utf8");
  const module = {exports: {}};
  new Function("exports", "module", ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText)(module.exports, module);
  const probe = module.exports.assertBrowserAuthPersistenceAvailable;
  const saved = new Map(), writes = [];
  const good = {getItem: key => saved.get(key), setItem: (key, value) => {saved.set(key, value); writes.push([key, value]);}, removeItem: key => saved.delete(key)};
  probe(good); assert.equal(saved.size, 0); assert.equal(writes.length, 1);
  assert.match(writes[0][0], /^parabolic\.authPersistenceProbe\./u); assert.equal(writes[0][1], "available");
  for (const broken of ["setItem", "getItem", "removeItem"]) {
    const storage = {...good, [broken]: () => {throw new Error("private browser failure details");}};
    assert.throws(() => probe(storage), /Browser session persistence is unavailable/u);
  }
  assert.throws(() => probe({...good, getItem: () => "different"}), /Browser session persistence is unavailable/u);
});

for (const mode of ["timer", "authority", "explicit"]) for (const result of ["resolve", "reject"]) for (const replacementUid of ["a", "b"]) {
  test(`late ${mode} refresh ${result} cannot affect a replacement session (${replacementUid})`, async () => {
    const env = await setup(); env.persistence.resolve(); await env.h.flush();
    env.tokens.set("a", deferred()); env.auth.currentUser = {uid: "a"}; env.observed[0](env.auth.currentUser);
    env.tokens.get("a").resolve("synthetic-a-token"); await env.h.flush();
    const oldRefresh = deferred(); env.tokens.set("a", oldRefresh);
    let pending;
    if (mode === "timer") env.timers.at(-1)();
    else if (mode === "explicit") pending = env.value().refreshIdToken();
    else env.authority({issue: "institute_suspended"});
    env.tokens.set(replacementUid, deferred()); env.auth.currentUser = {uid: replacementUid}; env.observed[0](env.auth.currentUser);
    env.tokens.get(replacementUid).resolve("synthetic-b-token"); await env.h.flush();
    if (result === "resolve") oldRefresh.resolve("synthetic-old-refreshed-token");
    else oldRefresh.reject(new Error("late revoked old user"));
    await env.h.flush();
    assert.equal(env.value().session.user.uid, replacementUid);
    assert.equal(env.value().session.idToken, "synthetic-b-token");
    assert.equal(env.value().session.error, null);
    assert.deepEqual(env.signals, []);
    if (pending) assert.equal(await pending, null);
    env.h.unmount();
  });
}
