import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDirectory = fileURLToPath(new URL("../", import.meta.url));
const sharedContractPath = join(rootDirectory, "shared/types/apiResponse.ts");
const functionsContractPath = join(
  rootDirectory,
  "functions/src/types/apiResponse.ts",
);
const sharedClientPath = join(rootDirectory, "shared/services/apiClient.ts");
const sharedClientTypesPath = join(rootDirectory, "shared/types/apiClient.ts");
const require = createRequire(import.meta.url);
const typescript = require(join(rootDirectory, "functions/node_modules/typescript"));

const expectedErrorCodes = [
  "FORBIDDEN",
  "INTERNAL_ERROR",
  "LICENSE_RESTRICTED",
  "METHOD_NOT_ALLOWED",
  "NOT_FOUND",
  "SESSION_LOCKED",
  "SESSION_NOT_ACTIVE",
  "SUBMISSION_LOCKED",
  "TENANT_MISMATCH",
  "UNAUTHORIZED",
  "VALIDATION_ERROR",
  "WINDOW_CLOSED",
];

function extractErrorCodes(source, sourcePath) {
  const match = source.match(
    /STANDARD_API_ERROR_CODES\s*=\s*\[([\s\S]*?)\]\s*as const/,
  );
  assert.ok(match, `${sourcePath} must declare STANDARD_API_ERROR_CODES`);

  return [...match[1].matchAll(/"([A-Z][A-Z0-9_]+)"/g)].map(
    (codeMatch) => codeMatch[1],
  );
}

function assertEnvelopeFields(source, sourcePath) {
  assert.match(source, /API_SUCCESS_CODE\s*=\s*"OK"\s*as const/);
  assert.match(source, /requestId:\s*string/);
  assert.match(source, /timestamp:\s*string/);
  assert.match(source, /code:\s*ApiSuccessCode/);
  assert.match(source, /data:\s*TData/);
  assert.match(source, /message:\s*string/);
  assert.match(source, /success:\s*true/);
  assert.match(source, /error:\s*(?:ApiErrorDetail|StandardApiError)<TDetails>/);
  assert.match(source, /details\?:\s*TDetails/);
  assert.match(source, /success:\s*false/);
  assert.doesNotMatch(
    source,
    /(?:interface|type)\s+\w*ApiMeta\b|meta:\s*\w*ApiMeta/,
    `${sourcePath} must not define legacy meta-nested envelopes`,
  );
}

function loadTypeScriptModule(source, sourcePath) {
  const transpiled = typescript.transpileModule(source, {
    compilerOptions: {
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  }).outputText;
  const loadedModule = { exports: {} };
  const evaluate = new Function("exports", "module", transpiled);
  evaluate(loadedModule.exports, loadedModule);
  return loadedModule.exports;
}

test("shared and Functions API envelope contracts stay synchronized", async () => {
  const [sharedSource, functionsSource] = await Promise.all([
    readFile(sharedContractPath, "utf8"),
    readFile(functionsContractPath, "utf8"),
  ]);

  assert.deepEqual(
    extractErrorCodes(sharedSource, sharedContractPath),
    expectedErrorCodes,
  );
  assert.deepEqual(
    extractErrorCodes(functionsSource, functionsContractPath),
    expectedErrorCodes,
  );
  assert.equal(new Set(expectedErrorCodes).size, expectedErrorCodes.length);
  assertEnvelopeFields(sharedSource, sharedContractPath);
  assertEnvelopeFields(functionsSource, functionsContractPath);
});

test("shared API boundary validates and unwraps canonical success envelopes", async () => {
  const source = await readFile(sharedContractPath, "utf8");
  const { unwrapApiSuccessData } = loadTypeScriptModule(source, sharedContractPath);
  const data = { instituteId: "inst-001", roles: ["admin"] };

  assert.deepEqual(
    unwrapApiSuccessData({
      code: "OK",
      data,
      message: "Institute loaded.",
      requestId: "req-success-001",
      success: true,
      timestamp: "2026-08-08T10:15:30.000Z",
    }),
    data,
  );

  for (const malformedPayload of [
    data,
    { code: "OK", data, message: "Loaded.", requestId: "req-1", success: false, timestamp: "2026-08-08T10:15:30.000Z" },
    { code: "CREATED", data, message: "Loaded.", requestId: "req-1", success: true, timestamp: "2026-08-08T10:15:30.000Z" },
    { code: "OK", message: "Loaded.", requestId: "req-1", success: true, timestamp: "2026-08-08T10:15:30.000Z" },
    { code: "OK", data, message: "Loaded.", requestId: "", success: true, timestamp: "2026-08-08T10:15:30.000Z" },
    { code: "OK", data, message: "Loaded.", requestId: "req-1", success: true, timestamp: "not-a-timestamp" },
  ]) {
    assert.throws(() => unwrapApiSuccessData(malformedPayload), {
      name: "ApiEnvelopeValidationError",
    });
  }
});

test("shared API boundary accepts only canonical error envelopes", async () => {
  const source = await readFile(sharedContractPath, "utf8");
  const { parseApiErrorEnvelope } = loadTypeScriptModule(source, sharedContractPath);
  const envelope = {
    error: {
      code: "VALIDATION_ERROR",
      details: { field: "instituteId" },
      message: "Institute is required.",
    },
    requestId: "req-error-001",
    success: false,
    timestamp: "2026-08-08T10:15:30.000Z",
  };

  assert.deepEqual(parseApiErrorEnvelope(envelope), envelope);
  assert.throws(
    () => parseApiErrorEnvelope({ ...envelope, success: true }),
    { name: "ApiEnvelopeValidationError" },
  );
  assert.throws(
    () => parseApiErrorEnvelope({ ...envelope, error: { ...envelope.error, code: "HTTP_400" } }),
    { name: "ApiEnvelopeValidationError" },
  );
});

test("shared API client consumes the validated envelope boundary", async () => {
  const source = await readFile(sharedClientPath, "utf8");

  assert.match(source, /unwrapApiSuccessData<TData>\(payload\)/);
  assert.match(source, /errorEnvelope\s*=\s*parseApiErrorEnvelope\(payload\)/);
  assert.match(source, /"INVALID_RESPONSE"/);
  assert.doesNotMatch(source, /return payload as T(?:Response|Data)/);
});

test("ApiClientError preserves canonical request IDs and typed details", async () => {
  const source = await readFile(sharedClientTypesPath, "utf8");
  const { ApiClientError } = loadTypeScriptModule(source, sharedClientTypesPath);
  const details = {
    fieldErrors: [{ field: "instituteId", reason: "required" }],
  };
  const payload = {
    error: {
      code: "VALIDATION_ERROR",
      details,
      message: "Institute is required.",
    },
    requestId: "req-validation-001",
    success: false,
    timestamp: "2026-08-08T10:15:30.000Z",
  };
  const error = new ApiClientError(
    payload.error.message,
    400,
    payload.error.code,
    payload,
    { details, requestId: payload.requestId },
  );

  assert.equal(error.name, "ApiClientError");
  assert.equal(error.message, "Institute is required.");
  assert.equal(error.status, 400);
  assert.equal(error.code, "VALIDATION_ERROR");
  assert.equal(error.payload, payload);
  assert.equal(error.requestId, "req-validation-001");
  assert.equal(error.details, details);

  const localError = new ApiClientError("Network failure.", 0, "NETWORK_ERROR", null);
  assert.equal(localError.requestId, null);
  assert.equal(localError.details, undefined);
});

test("shared API client copies validated error metadata onto ApiClientError", async () => {
  const source = await readFile(sharedClientPath, "utf8");

  assert.match(source, /details:\s*payload\.error\.details/);
  assert.match(source, /requestId:\s*payload\.requestId/);
  assert.match(source, /payload:\s*ApiErrorEnvelope<TDetails>/);
  assert.match(source, /ApiClientError<TDetails>/);
});
