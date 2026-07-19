import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";

const expectedProjectId = "demo-parabolic-test";
const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
const projectId = process.env.GCLOUD_PROJECT;
const functionsOrigin = "http://127.0.0.1:5001";
const hostingOrigin = process.env.PARABOLIC_E2E_BASE_URL ?? "http://127.0.0.1:5000";
const marker = "bwm-001-g-emulator-smoke";

assert.equal(projectId, expectedProjectId, "Unexpected Firebase emulator project ID");
assert.ok(firestoreHost, "FIRESTORE_EMULATOR_HOST is required");
assert.ok(process.env.FIREBASE_EMULATOR_HUB, "FIREBASE_EMULATOR_HUB is required");

const firestoreDocumentUrl = new URL(
  `/v1/projects/${expectedProjectId}/databases/(default)/documents/emulatorSmoke/bwm-001-g`,
  `http://${firestoreHost}`,
);
const firestoreHeaders = {
  Authorization: "Bearer owner",
  "Content-Type": "application/json",
};

async function assertSuccessfulResponse(response, label) {
  const responseBody = await response.text();
  assert.ok(
    response.ok,
    `${label} failed with HTTP ${response.status}: ${responseBody}`,
  );
  return responseBody;
}

async function deleteSmokeDocument() {
  const response = await fetch(firestoreDocumentUrl, {
    method: "DELETE",
    headers: firestoreHeaders,
    signal: AbortSignal.timeout(15_000),
  });

  assert.ok(
    response.ok || response.status === 404,
    `Firestore cleanup failed with HTTP ${response.status}: ${await response.text()}`,
  );
}

async function verifyFirestore() {
  await deleteSmokeDocument();

  const writeResponse = await fetch(firestoreDocumentUrl, {
    method: "PATCH",
    headers: firestoreHeaders,
    body: JSON.stringify({
      fields: {
        marker: {stringValue: marker},
        projectId: {stringValue: expectedProjectId},
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const writeBody = JSON.parse(
    await assertSuccessfulResponse(writeResponse, "Firestore write"),
  );
  assert.equal(writeBody.fields?.marker?.stringValue, marker);

  const readResponse = await fetch(firestoreDocumentUrl, {
    headers: firestoreHeaders,
    signal: AbortSignal.timeout(15_000),
  });
  const readBody = JSON.parse(
    await assertSuccessfulResponse(readResponse, "Firestore read"),
  );
  assert.equal(readBody.fields?.marker?.stringValue, marker);

  console.log("[emulator-check] Firestore write/read verified.");
}

async function verifyFunctions() {
  const response = await fetch(
    `${functionsOrigin}/${expectedProjectId}/us-central1/helloWorld`,
    {signal: AbortSignal.timeout(15_000)},
  );
  const responseBody = await assertSuccessfulResponse(response, "Functions health check");

  assert.equal(
    responseBody,
    `Parabolic Platform backend is running in test mode for ${expectedProjectId}.`,
  );
  console.log("[emulator-check] Functions health endpoint verified.");
}

async function verifyHosting() {
  for (const portal of ["admin", "student"]) {
    const response = await fetch(`${hostingOrigin}/${portal}`, {
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    const responseBody = await assertSuccessfulResponse(
      response,
      `Hosting ${portal} entry`,
    );

    assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/);
    assert.match(responseBody, new RegExp(`/${portal}/assets/`));
  }

  console.log("[emulator-check] Hosting Admin and Student artifacts verified.");
}

try {
  await verifyFirestore();
  await verifyFunctions();
  await verifyHosting();

  const browserResult = spawnSync(
    npmExecutable,
    ["run", "test:e2e:hosting"],
    {env: process.env, stdio: "inherit"},
  );

  if (browserResult.error) {
    throw browserResult.error;
  }
  assert.equal(browserResult.status, 0, "Playwright Hosting smoke failed");
} finally {
  await deleteSmokeDocument();
}

console.log("[emulator-check] PASS: real emulator and browser checks completed.");
