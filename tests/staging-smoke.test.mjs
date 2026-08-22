import assert from "node:assert/strict";
import test from "node:test";

import {
  readStagingSmokeConfiguration,
  runStagingSmoke,
  StagingSmokeError,
} from "../scripts/frontend-cicd/run-staging-smoke.mjs";

const configuration = Object.freeze({
  apiKey: "public-staging-api-key",
  examOrigin: "https://parabolic-dev-40ec9.web.app",
  portalOrigin: "https://parabolic-dev.web.app",
  projectId: "parabolic-dev",
  vendorOrigin: "https://parabolic-dev-vendor.web.app",
});

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function errorEnvelope(code, message) {
  return {
    success: false,
    error: { code, message },
    requestId: "staging-smoke-request",
    timestamp: "2026-08-22T00:00:00.000Z",
  };
}

function createSuccessfulFetch({ authenticatedStatus = 401 } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });

    if (url === "https://us-central1-parabolic-dev.cloudfunctions.net/helloWorld") {
      return new Response(
        "Parabolic Platform backend is running in staging mode for parabolic-dev.",
        { status: 200 },
      );
    }

    if (
      [
        "https://parabolic-dev.web.app/admin/",
        "https://parabolic-dev.web.app/student/",
        "https://parabolic-dev-40ec9.web.app/",
        "https://parabolic-dev-vendor.web.app/",
      ].includes(url)
    ) {
      return new Response("<!doctype html><title>Staging</title>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    if (url === "https://parabolic-dev.web.app/api/v1/bwm-010-staging-smoke") {
      return jsonResponse(404, errorEnvelope("NOT_FOUND", "API route not found."));
    }

    if (url === "https://parabolic-dev.web.app/api/v1/admin/overview") {
      if (init.headers?.Authorization === "Bearer staging-id-token") {
        return jsonResponse(
          authenticatedStatus,
          errorEnvelope(
            authenticatedStatus === 401 ? "UNAUTHORIZED" : "INTERNAL_ERROR",
            authenticatedStatus === 401
              ? "Authentication token is missing required claims."
              : "Unexpected failure.",
          ),
        );
      }
      return jsonResponse(401, errorEnvelope("UNAUTHORIZED", "Missing authorization header."));
    }

    if (url.startsWith("https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=")) {
      const body = JSON.parse(init.body);
      assert.match(body.email, /^bwm010-smoke-[a-f0-9]+@example\.com$/u);
      assert.ok(body.password.length >= 28);
      assert.equal(body.returnSecureToken, true);
      return jsonResponse(200, { idToken: "staging-id-token", localId: "disposable-user" });
    }

    if (url.startsWith("https://identitytoolkit.googleapis.com/v1/accounts:delete?key=")) {
      assert.deepEqual(JSON.parse(init.body), { idToken: "staging-id-token" });
      return jsonResponse(200, {});
    }

    throw new Error(`Unexpected fetch: ${init.method ?? "GET"} ${url}`);
  };

  return { calls, fetchImpl };
}

test("staging configuration is fixed to the recorded non-production project and origins", () => {
  const result = readStagingSmokeConfiguration({
    PARABOLIC_DEPLOY_BRANCH: "staging",
    PARABOLIC_BUILD_ENVIRONMENT: "staging",
    FIREBASE_PROJECT_ID: "parabolic-dev",
    VITE_FIREBASE_API_KEY: "public-staging-api-key",
    VITE_PORTAL_BASE_URL: "https://parabolic-dev.web.app",
    VITE_EXAM_BASE_URL: "https://parabolic-dev-40ec9.web.app",
    VITE_VENDOR_BASE_URL: "https://parabolic-dev-vendor.web.app",
  });
  assert.deepEqual(result, configuration);

  assert.throws(
    () =>
      readStagingSmokeConfiguration({
        PARABOLIC_DEPLOY_BRANCH: "main",
        PARABOLIC_BUILD_ENVIRONMENT: "production",
        FIREBASE_PROJECT_ID: "parabolic-prod",
        VITE_FIREBASE_API_KEY: "public-production-api-key",
        VITE_PORTAL_BASE_URL: "https://parabolic-prod.web.app",
        VITE_EXAM_BASE_URL: "https://parabolic-prod-exam.web.app",
        VITE_VENDOR_BASE_URL: "https://parabolic-prod-vendor.web.app",
      }),
    StagingSmokeError,
  );
});

test("post-deploy smoke proves health, Hosting, API routing, and verified-token handling", async () => {
  const { calls, fetchImpl } = createSuccessfulFetch();
  const result = await runStagingSmoke({
    configuration,
    fetchImpl,
    uuidFactory: () => "01234567-89ab-cdef-0123-456789abcdef",
  });

  assert.deepEqual(result, {
    authenticatedBoundary: "verified-id-token",
    projectId: "parabolic-dev",
    targets: ["portal", "exam", "vendor"],
  });
  assert.equal(calls.length, 10);
  assert.ok(calls.at(-1).url.includes("accounts:delete"));
  assert.equal(calls.at(-1).init.method, "POST");
});

test("a failed authenticated assertion still deletes the disposable Auth user", async () => {
  const { calls, fetchImpl } = createSuccessfulFetch({ authenticatedStatus: 500 });

  await assert.rejects(
    runStagingSmoke({
      configuration,
      fetchImpl,
      uuidFactory: () => "fedcba98-7654-3210-fedc-ba9876543210",
    }),
  );
  assert.ok(calls.at(-1).url.includes("accounts:delete"));
});
