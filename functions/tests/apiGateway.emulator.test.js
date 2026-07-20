/* eslint-disable require-jsdoc, @typescript-eslint/no-var-requires */
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {API_ROUTE_MANIFEST} = require("../lib/apiRouteManifest.js");

const expectedProjectId = "demo-parabolic-test";
const projectId = process.env.GCLOUD_PROJECT;
const functionsHost = process.env.FUNCTIONS_EMULATOR_HOST ??
  "127.0.0.1:5001";
const gatewayOrigin =
  `http://${functionsHost}/${expectedProjectId}/us-central1/apiV1`;

assert.equal(
  projectId,
  expectedProjectId,
  "Unexpected Firebase emulator project ID",
);
assert.ok(
  process.env.FIREBASE_EMULATOR_HUB,
  "FIREBASE_EMULATOR_HUB is required",
);

function materializePath(canonicalPath, routeId) {
  return canonicalPath
    .replace("{sessionId}", encodeURIComponent(`session ${routeId} Ω`))
    .replace("{testId}", encodeURIComponent(`test ${routeId} Ω`));
}

async function requestGateway(requestPath, method, body) {
  const response = await fetch(`${gatewayOrigin}${requestPath}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ?
      undefined :
      {"Content-Type": "application/json"},
    method,
    signal: AbortSignal.timeout(15_000),
  });
  const responseText = await response.text();
  const contentType = response.headers.get("content-type") ?? "";

  assert.match(contentType, /^application\/json\b/i);
  assert.doesNotMatch(responseText.trimStart(), /^</);

  return {
    body: JSON.parse(responseText),
    headers: response.headers,
    status: response.status,
  };
}

test(
  "every implemented manifest route reaches a business handler",
  async () => {
    const implementedRoutes = API_ROUTE_MANIFEST.filter(
      (route) => route.status === "implemented",
    );
    assert.equal(implementedRoutes.length, 13);

    for (const route of implementedRoutes) {
      const requestPath = materializePath(route.canonicalPath, route.id);
      const result = await requestGateway(
        requestPath,
        route.method,
        route.method === "POST" ? {} : undefined,
      );

      assert.notEqual(result.status, 405, `${route.id} hit the method guard`);
      assert.notEqual(
        result.body.error?.message,
        "API route not found.",
        `${route.id} missed the router`,
      );
      assert.notEqual(
        result.body.error?.message,
        "API route is not implemented.",
        `${route.id} did not reach its business handler`,
      );
    }
  },
);

test(
  "Admin, Student, encoded Exam, and Vendor routes keep their contracts",
  async () => {
    const admin = await requestGateway(
      "/api/v1/admin/students",
      "GET",
    );
    assert.equal(admin.status, 401);
    assert.equal(admin.body.error?.code, "UNAUTHORIZED");

    const student = await requestGateway(
      "/api/v1/student/dashboard",
      "GET",
    );
    assert.equal(student.status, 404);
    assert.equal(student.body.error?.code, "NOT_FOUND");
    assert.equal(
      student.body.error?.message,
      "API route is not implemented.",
    );

    const exam = await requestGateway(
      "/api/v1/exam/session/session%20id%20%CE%A9/entry",
      "POST",
      {},
    );
    assert.equal(exam.status, 400);
    assert.equal(exam.body.error?.code, "VALIDATION_ERROR");
    assert.match(exam.body.error?.message ?? "", /token/);

    const vendor = await requestGateway(
      "/api/v1/vendor/calibration/push",
      "POST",
      {},
    );
    assert.equal(vendor.status, 401);
    assert.equal(vendor.body.error?.code, "UNAUTHORIZED");
  },
);

test(
  "method errors expose Allow and unknown paths never return SPA HTML",
  async () => {
    const methodError = await requestGateway(
      "/api/v1/admin/tests",
      "PUT",
    );
    assert.equal(methodError.status, 405);
    assert.equal(methodError.body.error?.code, "METHOD_NOT_ALLOWED");
    assert.equal(methodError.headers.get("allow"), "GET, POST");

    const unknown = await requestGateway(
      "/api/v1/not-a-portal-route",
      "GET",
    );
    assert.equal(unknown.status, 404);
    assert.equal(unknown.body.error?.code, "NOT_FOUND");
    assert.equal(unknown.body.error?.message, "API route not found.");
  },
);
