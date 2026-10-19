import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createRequire} from "node:module";
import test from "node:test";
const require = createRequire(import.meta.url);
const ts = require("../functions/node_modules/typescript");
async function load(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const result = ts.transpileModule(source, {compilerOptions: {
    module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022,
  }});
  return import(`data:text/javascript;base64,${Buffer.from(result.outputText).toString("base64")}`);
}
const {captureLaunch, initializeLaunchBootstrap, takeLaunchCredential} = await load("../apps/exam/src/launchBootstrap.ts");
const {redactTelemetry} = await load("../shared/services/credentialRedaction.ts");

test("fragment capture cleans history synchronously and exposes only a one-shot secret", () => {
  let clean;
  const token = "signed.launch.credential";
  const launch = captureLaunch(`https://exam.test/session/session_1#launch=${token}`, (path) => {clean = path;});
  assert.equal(clean, "/session/session_1");
  assert.deepEqual(launch.metadata, {status: "launch", sessionId: "session_1", devMock: false});
  assert.equal(JSON.stringify(launch).includes(token), false);
  assert.equal(launch.takeCredential(), token);
  assert.equal(launch.takeCredential(), null);
});
test("invalid, ambiguous and legacy material is scrubbed without exposing a credential", () => {
  for (const suffix of ["?token=secret", "?launch=secret", "#launch=a&launch=b", "#other=a", "#launch=%ZZ",
    "#launch=%20secret", "?token=a#launch=b", "#launch=", "#launch=a%0Ab"]) {
    let clean;
    const launch = captureLaunch(`https://exam.test/session/id${suffix}`, (path) => {clean = path;});
    assert.equal(clean, "/session/id");
    assert.equal(launch.metadata.status, "invalid");
    assert.equal(launch.takeCredential(), null);
  }
  for (const path of ["/session/id/", "/session/a%2Fb", "/session/%69d", "/unknown"]) {
    let clean;
    const launch = captureLaunch(`https://exam.test${path}#launch=secret`, (path) => {clean = path;});
    assert.equal(clean, "/");
    assert.equal(launch.metadata.status, "invalid");
  }
  assert.throws(() => captureLaunch("https://exam.test/session/id#launch=secret", () => {throw new Error("history blocked");}));
});
test("the mock query remains isolated to explicit development mode", () => {
  const href = "https://exam.test/session/id?token=dev&mode=Hard";
  assert.equal(captureLaunch(href, () => {}).metadata.status, "invalid");
  let clean;
  const mock = captureLaunch(href, (path) => {clean = path;}, true);
  assert.equal(mock.metadata.devMock, true);
  assert.equal(mock.takeCredential(), null);
  assert.equal(clean, "/session/id?mode=Hard");
  assert.equal(captureLaunch(href.replace("token=dev", "token=real"), () => {}, true).metadata.status, "invalid");
  for (const policy of ["faceGaze=off", "faceGaze=on", "cameraReadiness=off"]) {
    for (const allowDevMock of [false, true]) {
      const rejected = captureLaunch(`${href}&${policy}`, path => {clean = path;}, allowDevMock);
      assert.deepEqual(rejected.metadata, {status: "invalid", sessionId: "id", devMock: false});
      assert.equal(rejected.takeCredential(), null);
      assert.equal(clean, "/session/id");
    }
  }
});
test("telemetry redacts nested credentials, hashes, raw URLs and arbitrary crash text", () => {
  const proof = "a".repeat(43);
  const token = "eyJhbGciOiJub25lIn0.eyJjbGFpbXMiOnsidG9rZW4iOiJwcml2YXRlIn19.signature";
  const value = {message: `Firebase failed https://firebase.test/path?token=${token} proof ${proof}`,
    request: {body: {token}, headers: {"X-Parabolic-Exam-Owner": proof}},
    error: {stack: `nextOwnerProof="short-secret"\n${"b".repeat(64)}`}, status: 409};
  const safe = redactTelemetry(value);
  const text = JSON.stringify(safe);
  for (const secret of [token, proof, "short-secret", "b".repeat(64), "https://firebase.test"]) assert.equal(text.includes(secret), false);
  assert.equal(safe.status, 409);
  assert.ok(text.includes("redacted"));
});

test("same-document fragment/popstate scrubbing never adopts a second launch", () => {
  const previous = globalThis.window;
  const handlers = new Map();
  const fake = {location: new URL("https://exam.test/session/id#launch=first.token.secret"),
    history: {replaceState(state, unused, path) {fake.location = new URL(path, fake.location);}},
    addEventListener(name, callback) {handlers.set(name, callback);}};
  globalThis.window = fake;
  try {
    initializeLaunchBootstrap(false);
    assert.equal(fake.location.hash, "");
    assert.equal(takeLaunchCredential(), "first.token.secret");
    fake.location.hash = "launch=second.token.secret";
    handlers.get("hashchange")();
    assert.equal(fake.location.hash, "");
    assert.equal(takeLaunchCredential(), null);
    fake.location.search = "?token=legacy";
    handlers.get("popstate")();
    assert.equal(fake.location.search, "");
    assert.equal(takeLaunchCredential(), null);
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
});
