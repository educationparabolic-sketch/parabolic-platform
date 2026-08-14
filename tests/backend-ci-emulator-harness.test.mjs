import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { firebaseEmulatorHarness } from "../scripts/firebase-emulator-harness-config.mjs";

const repositoryFile = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));

test("five-service emulator harness has stable loopback ports and demo isolation", async () => {
  const [firebaseSource, firebaseRcSource, storageRules, runner, smoke] =
    await Promise.all([
      readFile(repositoryFile("firebase.json"), "utf8"),
      readFile(repositoryFile(".firebaserc"), "utf8"),
      readFile(repositoryFile("storage.rules"), "utf8"),
      readFile(repositoryFile("scripts/run-emulator-smoke.mjs"), "utf8"),
      readFile(repositoryFile("scripts/firebase-emulator-smoke.mjs"), "utf8"),
    ]);
  const firebase = JSON.parse(firebaseSource);
  const firebaseRc = JSON.parse(firebaseRcSource);

  assert.equal(firebaseEmulatorHarness.projectId, "demo-parabolic-test");
  assert.deepEqual(firebaseEmulatorHarness.services, [
    "auth",
    "firestore",
    "functions",
    "hosting:portal",
    "storage",
  ]);
  assert.deepEqual(firebaseEmulatorHarness.ports, {
    auth: 9099,
    firestore: 8080,
    functions: 5001,
    hosting: 5000,
    storage: 9199,
  });

  for (const [service, port] of Object.entries(firebaseEmulatorHarness.ports)) {
    assert.deepEqual(firebase.emulators[service], {
      host: "127.0.0.1",
      port,
    });
  }
  assert.deepEqual(firebase.emulators.ui, { enabled: false });
  assert.equal(firebase.emulators.singleProjectMode, true);
  assert.equal(firebase.storage.rules, "storage.rules");
  assert.ok(firebaseRc.targets[firebaseEmulatorHarness.projectId]);
  assert.notEqual(firebaseRc.projects.default, firebaseEmulatorHarness.projectId);

  assert.match(storageRules, /allow read, write: if false;/u);
  assert.match(runner, /firebaseEmulatorHarness\.services\.join\(","\)/u);
  assert.match(runner, /PROJECT_ID: projectId/u);
  assert.match(runner, /GCLOUD_PROJECT: projectId/u);
  assert.match(runner, /GOOGLE_CLOUD_PROJECT: projectId/u);
  assert.match(smoke, /async function verifyAuth\(\)/u);
  assert.match(smoke, /async function verifyStorage\(\)/u);
});
