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
    .replace("{testId}", encodeURIComponent(`test ${routeId} Ω`))
    .replace("{runId}", encodeURIComponent(`run ${routeId} Ω`))
    .replace("{studentId}", encodeURIComponent(`student ${routeId} Ω`))
    .replace("{questionId}", encodeURIComponent(`question ${routeId} Ω`))
    .replace("{packageId}", encodeURIComponent(`package ${routeId} Ω`))
    .replace("{uploadLogId}", encodeURIComponent(`upload ${routeId} Ω`))
    .replace("{reportId}", encodeURIComponent(`report ${routeId} Ω`))
    .replace(
      "{interventionId}",
      encodeURIComponent(`intervention ${routeId} Ω`),
    );
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
  assert.equal(implementedRoutes.length, 60);

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

test("Question Bank planned declarations are fully routed", () => {
  const plannedRoutes = API_ROUTE_MANIFEST.filter(
    (route) =>
      route.declaration === "planned" &&
      Number(route.id.replace("ADM-", "")) <= 40,
  );

  assert.equal(plannedRoutes.length, 11);
  plannedRoutes.forEach((route) => {
    assert.equal(route.status, "implemented");
    assert.equal(typeof API_GATEWAY_HANDLERS[route.functionExport], "function");
  });
});

test(
  "BWM-028 planned declarations reach the secured assignment handler",
  () => {
    const plannedRoutes = API_ROUTE_MANIFEST.filter(
      (route) =>
        Number(route.id.replace("ADM-", "")) >= 41 &&
        Number(route.id.replace("ADM-", "")) <= 48,
    );

    assert.equal(plannedRoutes.length, 8);
    plannedRoutes.forEach((route) => {
      assert.equal(route.status, "implemented");
      assert.equal(route.functionExport, "adminAssignmentOperations");
      assert.equal(
        typeof API_GATEWAY_HANDLERS[route.functionExport],
        "function",
      );
    });
  },
);

test(
  "BWM-029 governance and intervention routes reach secured handlers",
  () => {
    const plannedRoutes = API_ROUTE_MANIFEST.filter((route) =>
      Number(route.id.replace("ADM-", "")) >= 49 &&
      Number(route.id.replace("ADM-", "")) <= 55,
    );

    assert.equal(plannedRoutes.length, 7);
    plannedRoutes.forEach((route) => {
      assert.equal(route.declaration, "planned");
      assert.equal(route.status, "implemented");
      assert.equal(
        typeof API_GATEWAY_HANDLERS[route.functionExport],
        "function",
      );
      assert.equal(
        resolveApiRoute(
          route.method,
          materializePath(route.canonicalPath, route.id),
        )
          ?.route.id,
        route.id,
      );
    });
  },
);

test("router preserves encoded parameters and rejects path drift", () => {
  const examPath = "/api/v1/exam/session/session%20id%20%CE%A9/entry";
  const examMatch = resolveApiRoute("POST", examPath);
  assert.equal(examMatch?.route.id, "EXM-01");
  assert.equal(examMatch?.parameters.sessionId, "session id Ω");

  const studentPath = "/api/v1/student/tests/test%20id%20%CE%A9/solutions";
  const studentMatch = resolveApiRoute("GET", studentPath);
  assert.equal(studentMatch?.route.id, "STU-05");
  assert.equal(studentMatch?.parameters.testId, "test id Ω");

  const adminStudentPath =
    "/api/v1/admin/students/student%20id%20%CE%A9/profile";
  const adminStudentMatch = resolveApiRoute("PATCH", adminStudentPath);
  assert.equal(adminStudentMatch?.route.id, "ADM-24");
  assert.equal(adminStudentMatch?.parameters.studentId, "student id Ω");

  const adminQuestionPath =
    "/api/v1/admin/questions/question%20id%20%CE%A9/metadata";
  const adminQuestionMatch = resolveApiRoute("PATCH", adminQuestionPath);
  assert.equal(adminQuestionMatch?.route.id, "ADM-31");
  assert.equal(adminQuestionMatch?.parameters.questionId, "question id Ω");

  const packagePath =
    "/api/v1/admin/questions/packages/package%20id%20%CE%A9/commit";
  const packageMatch = resolveApiRoute("POST", packagePath);
  assert.equal(packageMatch?.route.id, "ADM-38");
  assert.equal(packageMatch?.parameters.packageId, "package id Ω");

  const uploadLogPath =
    "/api/v1/admin/questions/upload-logs/upload%20id%20%CE%A9";
  const uploadLogMatch = resolveApiRoute("GET", uploadLogPath);
  assert.equal(uploadLogMatch?.route.id, "ADM-40");
  assert.equal(uploadLogMatch?.parameters.uploadLogId, "upload id Ω");

  const assignmentOverridePath =
    "/api/v1/admin/runs/run%20id%20%CE%A9/sessions/" +
    "session%20id%20%CE%A9/overrides";
  const assignmentOverrideMatch = resolveApiRoute(
    "POST",
    assignmentOverridePath,
  );
  assert.equal(assignmentOverrideMatch?.route.id, "ADM-48");
  assert.equal(assignmentOverrideMatch?.parameters.runId, "run id Ω");
  assert.equal(
    assignmentOverrideMatch?.parameters.sessionId,
    "session id Ω",
  );

  const reportDownloadPath =
    "/api/v1/admin/governance/reports/report%20id%20%CE%A9/download";
  const reportDownloadMatch = resolveApiRoute("GET", reportDownloadPath);
  assert.equal(reportDownloadMatch?.route.id, "ADM-52");
  assert.equal(reportDownloadMatch?.parameters.reportId, "report id Ω");

  const interventionOutcomePath =
    "/api/v1/admin/interventions/intervention%20id%20%CE%A9/outcome";
  const interventionOutcomeMatch = resolveApiRoute(
    "PATCH",
    interventionOutcomePath,
  );
  assert.equal(interventionOutcomeMatch?.route.id, "ADM-55");
  assert.equal(
    interventionOutcomeMatch?.parameters.interventionId,
    "intervention id Ω",
  );

  assert.equal(resolveApiRoute("DELETE", "/api/v1/admin/students"), null);
  assert.equal(resolveApiRoute("GET", "/api/v1/admin/students/"), null);
  assert.equal(resolveApiRoute("GET", "/api/v1/Admin/students"), null);
  assert.equal(
    resolveApiRoute("POST", "/api/v1/exam/session/%E0%A4%A/entry"),
    null,
  );
});
