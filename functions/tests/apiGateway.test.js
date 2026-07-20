/* eslint-disable require-jsdoc, @typescript-eslint/no-var-requires */
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  assertGatewayHandlerRegistry,
  resolveApiRoute,
  resolveApiRoutePath,
} = require("../lib/api/apiGateway.js");
const {
  API_GATEWAY_HANDLERS,
} = require("../lib/api/apiGatewayHandlers.js");
const {API_ROUTE_MANIFEST} = require("../lib/apiRouteManifest.js");

function materializePath(canonicalPath, routeId) {
  return canonicalPath
    .replace("{sessionId}", encodeURIComponent(`session ${routeId} Ω`))
    .replace("{testId}", encodeURIComponent(`test ${routeId} Ω`));
}

test("each manifest method/path resolves exactly once", () => {
  for (const route of API_ROUTE_MANIFEST) {
    const requestPath = materializePath(route.canonicalPath, route.id);
    const matches = resolveApiRoutePath(requestPath)
      .filter((match) => match.route.method === route.method);

    assert.equal(matches.length, 1, `${route.id} must resolve exactly once`);
    assert.equal(matches[0].route.id, route.id);
    assert.equal(
      resolveApiRoute(route.method, requestPath)?.route.id,
      route.id,
    );
  }
});

test("implemented routes have one registered existing handler", () => {
  assert.doesNotThrow(assertGatewayHandlerRegistry);

  const implementedRoutes = API_ROUTE_MANIFEST.filter(
    (route) => route.status === "implemented",
  );
  assert.equal(implementedRoutes.length, 13);

  for (const route of implementedRoutes) {
    assert.equal(typeof API_GATEWAY_HANDLERS[route.functionExport], "function");
    assert.equal(
      Object.keys(API_GATEWAY_HANDLERS)
        .filter((functionExport) => functionExport === route.functionExport)
        .length,
      1,
      `${route.id} must map to exactly one handler registry entry`,
    );
  }
});

test("router preserves encoded parameters and rejects path drift", () => {
  const examPath = "/api/v1/exam/session/session%20id%20%CE%A9/entry";
  const examMatch = resolveApiRoute("POST", examPath);
  assert.equal(examMatch?.route.id, "EXM-01");
  assert.equal(examMatch?.parameters.sessionId, "session id Ω");

  const studentPath = "/api/v1/student/tests/test%20id%20%CE%A9/solutions";
  const studentMatch = resolveApiRoute("GET", studentPath);
  assert.equal(studentMatch?.route.id, "STU-05");
  assert.equal(studentMatch?.parameters.testId, "test id Ω");

  assert.equal(resolveApiRoute("DELETE", "/api/v1/admin/students"), null);
  assert.equal(resolveApiRoute("GET", "/api/v1/admin/students/"), null);
  assert.equal(resolveApiRoute("GET", "/api/v1/Admin/students"), null);
  assert.equal(
    resolveApiRoute("POST", "/api/v1/exam/session/%E0%A4%A/entry"),
    null,
  );
});
