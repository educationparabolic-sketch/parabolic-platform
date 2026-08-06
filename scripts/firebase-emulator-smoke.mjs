import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";

const expectedProjectId = "demo-parabolic-test";
const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
const projectId = process.env.GCLOUD_PROJECT;
const functionsOrigin = "http://127.0.0.1:5001";
const hostingOrigin = process.env.PARABOLIC_E2E_BASE_URL ?? "http://127.0.0.1:5000";
const marker = "bwm-001-g-emulator-smoke";
const expectedPermissionsPolicy =
  "camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self)";

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
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("x-frame-options"), "DENY");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.equal(
      response.headers.get("permissions-policy"),
      expectedPermissionsPolicy,
    );
    const contentSecurityPolicy = response.headers.get("content-security-policy") ?? "";
    assert.match(contentSecurityPolicy, /(?:^|; )default-src 'self'(?:;|$)/);
    assert.match(contentSecurityPolicy, /(?:^|; )object-src 'none'(?:;|$)/);
    assert.match(contentSecurityPolicy, /(?:^|; )frame-ancestors 'none'(?:;|$)/);
    assert.match(contentSecurityPolicy, /(?:^|; )script-src 'self'(?:;|$)/);
    assert.match(contentSecurityPolicy, /(?:^|; )connect-src 'self' /);
    assert.match(responseBody, new RegExp(`/${portal}/assets/`));
  }

  const apiResponse = await fetch(`${hostingOrigin}/api/v1/hosting-rewrite-probe`, {
    signal: AbortSignal.timeout(30_000),
  });
  const apiResponseBody = await apiResponse.text();

  assert.equal(apiResponse.status, 404);
  assert.match(apiResponse.headers.get("content-type") ?? "", /^application\/json\b/);
  assert.doesNotMatch(apiResponseBody, /<!doctype html>/i);
  assert.equal(JSON.parse(apiResponseBody).error?.code, "NOT_FOUND");

  console.log(
    "[emulator-check] Hosting artifacts, baseline security headers, and API-first rewrite verified.",
  );
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
