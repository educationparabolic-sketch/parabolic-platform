import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [packageSource, runnerSource, configSource, specSource] = await Promise.all([
  readFile(new URL("../package.json", import.meta.url), "utf8"),
  readFile(new URL("../scripts/run-golden-path-e2e.mjs", import.meta.url), "utf8"),
  readFile(new URL("../firebase.golden-path.json", import.meta.url), "utf8"),
  readFile(new URL("e2e/golden-path.spec.mjs", import.meta.url), "utf8"),
]);

const packageManifest = JSON.parse(packageSource);
const firebaseConfig = JSON.parse(configSource);

test("golden-path command owns one exact local Firebase boundary", () => {
  assert.equal(
    packageManifest.scripts["test:golden-path:e2e"],
    "node scripts/run-golden-path-e2e.mjs",
  );
  assert.equal(
    packageManifest.scripts["test:e2e:golden-path"],
    "playwright test tests/e2e/golden-path.spec.mjs",
  );
  assert.match(runnerSource, /firebase\.golden-path\.json/u);
  assert.match(runnerSource, /demo-parabolic-test/u);
  assert.match(runnerSource, /auth,firestore,functions,hosting/u);
  assert.match(runnerSource, /npm run test:e2e:golden-path/u);
  assert.deepEqual(firebaseConfig.emulators, {
    auth: { host: "127.0.0.1", port: 9099 },
    firestore: { host: "127.0.0.1", port: 8080 },
    functions: { host: "127.0.0.1", port: 5001 },
    hosting: { host: "127.0.0.1", port: 5000 },
    singleProjectMode: true,
    ui: { enabled: false },
  });
});

test("golden-path spec is no-mock and accounts for scope and cleanup", () => {
  assert.doesNotMatch(specSource, /\.route\s*\(/u);
  for (const marker of [
    "unauthenticated",
    "wrongRole",
    "wrongTenant",
    "suspended",
    "insufficientLicense",
    "draftRunResponse",
    "duplicateStart",
    "replayEntryPromise",
    "staleBatch",
    "duplicateSubmit",
    "uploadLogPath",
    "publishResult.auditPath",
    "cleanupNamespace",
    "externalRequests",
  ]) {
    assert.match(specSource, new RegExp(marker, "u"), marker);
  }
});
