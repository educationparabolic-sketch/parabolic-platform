import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const EXPECTED_STAGING = Object.freeze({
  projectId: "parabolic-dev",
  origins: Object.freeze({
    portal: "https://parabolic-dev.web.app",
    exam: "https://parabolic-dev-40ec9.web.app",
    vendor: "https://parabolic-dev-vendor.web.app",
  }),
});

const REQUEST_TIMEOUT_MS = 30_000;

export class StagingSmokeError extends Error {
  constructor(message) {
    super(message);
    this.name = "StagingSmokeError";
  }
}

function normalizeRequiredValue(environment, key, errors) {
  const value = typeof environment[key] === "string" ? environment[key].trim() : "";
  if (!value) {
    errors.push(`${key} is required`);
  }
  return value;
}

function validateExactOrigin(value, expected, key, errors) {
  try {
    const url = new URL(value);
    if (url.origin !== value || value !== expected) {
      errors.push(`${key} must use the recorded staging origin`);
    }
  } catch {
    errors.push(`${key} must be an absolute URL`);
  }
}

export function readStagingSmokeConfiguration(environment = process.env) {
  const errors = [];
  const projectId = normalizeRequiredValue(environment, "FIREBASE_PROJECT_ID", errors);
  const apiKey = normalizeRequiredValue(environment, "VITE_FIREBASE_API_KEY", errors);
  const portalOrigin = normalizeRequiredValue(environment, "VITE_PORTAL_BASE_URL", errors);
  const examOrigin = normalizeRequiredValue(environment, "VITE_EXAM_BASE_URL", errors);
  const vendorOrigin = normalizeRequiredValue(environment, "VITE_VENDOR_BASE_URL", errors);

  if (environment.PARABOLIC_DEPLOY_BRANCH?.trim() !== "staging") {
    errors.push("PARABOLIC_DEPLOY_BRANCH must be staging");
  }
  if (environment.PARABOLIC_BUILD_ENVIRONMENT?.trim() !== "staging") {
    errors.push("PARABOLIC_BUILD_ENVIRONMENT must be staging");
  }
  if (projectId !== EXPECTED_STAGING.projectId) {
    errors.push("FIREBASE_PROJECT_ID must use the recorded staging project");
  }

  validateExactOrigin(
    portalOrigin,
    EXPECTED_STAGING.origins.portal,
    "VITE_PORTAL_BASE_URL",
    errors,
  );
  validateExactOrigin(examOrigin, EXPECTED_STAGING.origins.exam, "VITE_EXAM_BASE_URL", errors);
  validateExactOrigin(
    vendorOrigin,
    EXPECTED_STAGING.origins.vendor,
    "VITE_VENDOR_BASE_URL",
    errors,
  );

  if (errors.length > 0) {
    throw new StagingSmokeError(
      ["Staging smoke configuration failed:", ...errors.map((error) => `- ${error}`)].join("\n"),
    );
  }

  return Object.freeze({
    apiKey,
    examOrigin,
    portalOrigin,
    projectId,
    vendorOrigin,
  });
}

function requestUrl(origin, path) {
  return new URL(path, `${origin}/`).toString();
}

async function fetchWithTimeout(fetchImpl, url, init = {}) {
  return fetchImpl(url, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

async function readJsonResponse(response, label) {
  const body = await response.text();
  try {
    return JSON.parse(body);
  } catch {
    throw new StagingSmokeError(`${label} returned a non-JSON response.`);
  }
}

async function assertHtmlResponse(fetchImpl, url, label) {
  const response = await fetchWithTimeout(fetchImpl, url, {
    headers: { Accept: "text/html" },
  });
  if (!response.ok) {
    throw new StagingSmokeError(`${label} returned HTTP ${response.status}.`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("text/html")) {
    throw new StagingSmokeError(`${label} did not return HTML.`);
  }
}

async function assertApiError(fetchImpl, url, expected, authorization) {
  const response = await fetchWithTimeout(fetchImpl, url, {
    headers: {
      Accept: "application/json",
      ...(authorization ? { Authorization: `Bearer ${authorization}` } : {}),
    },
  });
  const body = await readJsonResponse(response, expected.label);

  assert.equal(response.status, expected.status, `${expected.label} HTTP status`);
  assert.equal(body.success, false, `${expected.label} success flag`);
  assert.equal(body.error?.code, expected.code, `${expected.label} error code`);
  assert.equal(body.error?.message, expected.message, `${expected.label} error message`);
  assert.equal(typeof body.requestId, "string", `${expected.label} request ID`);
  assert.ok(body.requestId.length > 0, `${expected.label} request ID must not be blank`);
  assert.equal(typeof body.timestamp, "string", `${expected.label} timestamp`);
}

async function deleteDisposableUser(fetchImpl, apiKey, idToken) {
  const response = await fetchWithTimeout(
    fetchImpl,
    `https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    },
  );

  if (!response.ok) {
    throw new StagingSmokeError(`Disposable Auth user cleanup returned HTTP ${response.status}.`);
  }
}

async function createDisposableUser(fetchImpl, apiKey, uuidFactory) {
  const identifier = uuidFactory().replaceAll("-", "");
  const email = `bwm010-smoke-${identifier}@example.com`;
  const password = `${randomBytes(24).toString("base64url")}Aa9!`;
  const response = await fetchWithTimeout(
    fetchImpl,
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const body = await readJsonResponse(response, "Firebase Auth disposable-user creation");

  if (!response.ok || typeof body.idToken !== "string" || !body.idToken) {
    throw new StagingSmokeError(
      `Firebase Auth disposable-user creation returned HTTP ${response.status}.`,
    );
  }

  return body.idToken;
}

export async function runStagingSmoke({
  configuration,
  fetchImpl = globalThis.fetch,
  uuidFactory = randomUUID,
} = {}) {
  if (!configuration) {
    throw new StagingSmokeError("Staging smoke configuration is required.");
  }
  if (typeof fetchImpl !== "function") {
    throw new StagingSmokeError("A fetch implementation is required.");
  }

  const healthOrigin = `https://us-central1-${configuration.projectId}.cloudfunctions.net`;
  const healthResponse = await fetchWithTimeout(fetchImpl, requestUrl(healthOrigin, "/helloWorld"));
  const healthBody = await healthResponse.text();
  const expectedHealth = `Parabolic Platform backend is running in staging mode for ${configuration.projectId}.`;
  if (!healthResponse.ok || healthBody !== expectedHealth) {
    throw new StagingSmokeError(
      `Functions health check returned an unexpected HTTP ${healthResponse.status} response.`,
    );
  }

  await assertHtmlResponse(
    fetchImpl,
    requestUrl(configuration.portalOrigin, "/admin/"),
    "Admin staging entry",
  );
  await assertHtmlResponse(
    fetchImpl,
    requestUrl(configuration.portalOrigin, "/student/"),
    "Student staging entry",
  );
  await assertHtmlResponse(
    fetchImpl,
    requestUrl(configuration.examOrigin, "/"),
    "Exam staging entry",
  );
  await assertHtmlResponse(
    fetchImpl,
    requestUrl(configuration.vendorOrigin, "/"),
    "Vendor staging entry",
  );

  await assertApiError(
    fetchImpl,
    requestUrl(configuration.portalOrigin, "/api/v1/bwm-010-staging-smoke"),
    {
      code: "NOT_FOUND",
      label: "Same-origin API rewrite probe",
      message: "API route not found.",
      status: 404,
    },
  );

  const overviewUrl = requestUrl(configuration.portalOrigin, "/api/v1/admin/overview");
  await assertApiError(fetchImpl, overviewUrl, {
    code: "UNAUTHORIZED",
    label: "Unauthenticated API probe",
    message: "Missing authorization header.",
    status: 401,
  });

  let idToken;
  let primaryError;
  try {
    idToken = await createDisposableUser(fetchImpl, configuration.apiKey, uuidFactory);
    await assertApiError(
      fetchImpl,
      overviewUrl,
      {
        code: "UNAUTHORIZED",
        label: "Verified-token API probe",
        message: "Authentication token is missing required claims.",
        status: 401,
      },
      idToken,
    );
  } catch (error) {
    primaryError = error;
  } finally {
    if (idToken) {
      try {
        await deleteDisposableUser(fetchImpl, configuration.apiKey, idToken);
      } catch (cleanupError) {
        if (primaryError) {
          throw new AggregateError(
            [primaryError, cleanupError],
            "Staging smoke failed and disposable Auth user cleanup also failed.",
          );
        }
        throw cleanupError;
      }
    }
  }

  if (primaryError) {
    throw primaryError;
  }

  return Object.freeze({
    authenticatedBoundary: "verified-id-token",
    projectId: configuration.projectId,
    targets: Object.freeze(["portal", "exam", "vendor"]),
  });
}

async function runCli() {
  const configuration = readStagingSmokeConfiguration();
  const result = await runStagingSmoke({ configuration });
  console.log(
    `Staging smoke passed for ${result.projectId}: health, three Hosting targets, ` +
      "same-origin API routing, unauthenticated rejection, verified ID-token handling, and Auth cleanup.",
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : "Staging smoke failed.");
    process.exitCode = 1;
  });
}
