import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFileSync, readdirSync} from "node:fs";
import {execFileSync} from "node:child_process";
import test from "node:test";
const require = createRequire(import.meta.url);
const {logger: sink} = require("../functions/node_modules/firebase-functions");
const {createLogger, createRequestLogger} = require("../functions/lib/services/logging");
const {reportRuntimeError} = require("../functions/lib/services/errorReporting");
const policy = require("../functions/lib/services/diagnosticDisclosure");
const {buildErrorResponse, buildSuccessResponse, STANDARD_API_ERROR_STATUS} = require("../functions/lib/services/apiResponse");
const {createMiddlewareHandler} = require("../functions/lib/middleware/framework");
const {createMockRequest, createMockResponse} = require("../functions/lib/tests/helpers/http");
const sentinel = "synthetic_PRIVATE_9b51d3d705f14cfc";
const denyLeak = value => assert.equal(JSON.stringify(value).includes(sentinel), false);
function capture(t) {
  const entries = [];
  t.mock.method(sink, "write", entry => entries.push(entry));
  return entries;
}
const error = () => Object.assign(new Error(`Bearer ${sentinel} https://private.invalid/${sentinel}?signature=${sentinel}`), {
  name: sentinel, cause: new Error(sentinel), stack: `${sentinel}\n at ${sentinel} (/private/${sentinel}/logging.js:12:34)\n at x (https://private.invalid/${sentinel}/logging.js:1:2)`,
});

test("both sinks suppress raw messages, errors/causes, innocent/sensitive metadata, bytes and credential-bearing keys", t => {
  const entries = capture(t);
  const payload = {error: error(), message: sentinel, note: sentinel, proof: sentinel, headers: {authorization: sentinel},
    body: {answers: sentinel}, metadata: {note: sentinel, [sentinel]: sentinel, cause: error(), result: [sentinel, Buffer.from(sentinel)]},
    request: {path: `/private/${sentinel}`, userAgent: sentinel, ip: sentinel}, instituteId: sentinel,
    requestId: `proof-${sentinel}`, service: sentinel, version: sentinel, environment: sentinel};
  const logger = createLogger("ApiV1Gateway", payload);
  for (const method of ["debug", "info", "warn", "error", "critical"]) logger[method](sentinel, payload);
  const report = reportRuntimeError(error(), payload);
  assert.ok(entries.length >= 7); denyLeak(entries); denyLeak(report);
  assert.ok(entries.some(entry => entry["@type"]?.endsWith("ReportedErrorEvent")));
  assert.ok(entries.some(entry => entry.level === "ERROR"));
  assert.ok(entries.some(entry => entry.error?.stack.includes("at logging.js:12:34")));
  assert.ok(!JSON.stringify(entries).includes("private.invalid"));
});

test("static event/message/category, status, timing and safe correlation survive consistently when reporter emits first", t => {
  const entries = capture(t);
  const request = createMockRequest({headers: {"x-request-id": "req-redaction-42"}});
  const logger = createRequestLogger("ApiV1Gateway", request);
  logger.error("Unhandled middleware pipeline failure.", {error: new TypeError(sentinel), durationMs: 42, code: "INTERNAL_ERROR"});
  assert.equal(entries.length, 2);
  assert.ok(entries[0].message.startsWith("Unhandled middleware pipeline failure."));
  for (const entry of entries) assert.equal(entry.requestId, "req-redaction-42");
  assert.equal(entries[1].message, "Unhandled middleware pipeline failure.");
  assert.equal(entries[1].durationMs, 42); assert.equal(entries[1].code, "INTERNAL_ERROR");
  denyLeak(entries);
  logger.error("Unhandled middleware pipeline failure.", {error: error(), requestId: `proof-${sentinel}`});
  assert.equal(entries[2].requestId, entries[3].requestId);
});

for (const incoming of ["Bearer secret", "a.b.c", `proof-${sentinel}`, "eyJ" + "a".repeat(70), "a".repeat(129), "x\r\ny", "a,b", ["a", "b"]]) {
  test(`untrusted correlation input is replaced (${JSON.stringify(incoming).slice(0, 22)})`, t => {
    capture(t);
    const req = createMockRequest(); req.header = name => name === "x-request-id" ? incoming : undefined;
    const first = createRequestLogger("ApiV1Gateway", req), second = createRequestLogger("AdminStudentsApi", req);
    assert.match(first.getRequestId(), /^[0-9a-f-]{36}$/u); assert.equal(first.getRequestId(), second.getRequestId());
    assert.equal(buildErrorResponse("VALIDATION_ERROR", sentinel, first.getRequestId(), new Date().toISOString()).requestId, first.getRequestId());
  });
}

test("duplicate raw headers and simultaneous correlation/request IDs never select an attacker value", () => {
  for (const rawHeaders of [["X-Request-ID", "one", "x-request-id", "two"], ["x-request-id", "one", "X-Correlation-ID", "two"]]) {
    const req = createMockRequest(); req.rawHeaders = rawHeaders;
    assert.match(policy.requestCorrelationId(req), /^[0-9a-f-]{36}$/u);
  }
});

test("cycles, breadth/depth/long fields, hostile getters/toJSON/proxies and arrays cannot leak, execute accessors or throw", t => {
  const entries = capture(t); let invoked = 0;
  const cycle = {context: null}; cycle.context = cycle;
  const hostile = {}; Object.defineProperty(hostile, "message", {enumerable: true, get() {invoked++; throw new Error(sentinel);}});
  Object.defineProperty(hostile, "toJSON", {enumerable: true, get() {invoked++; throw new Error(sentinel);}});
  const array = []; Object.defineProperty(array, 0, {get() {invoked++; throw new Error(sentinel);}});
  const proxy = new Proxy({}, {ownKeys() {throw new Error(sentinel);}});
  for (const input of [cycle, hostile, array, proxy, {result: Array(500).fill(sentinel)}, {message: sentinel.repeat(10000)}]) {
    assert.doesNotThrow(() => createLogger("ApiV1Gateway", input).error(sentinel, input));
    assert.doesNotThrow(() => reportRuntimeError(input, input));
    denyLeak(policy.discloseDiagnostics(input));
  }
  assert.equal(invoked, 0); denyLeak(entries);
  const wide = policy.discloseDiagnostics({result: Array(500).fill(sentinel)});
  assert.ok(wide.result.length <= 51); assert.equal(wide.result.at(-1), "[LIMIT_REACHED]");
  assert.ok(JSON.stringify(policy.discloseDiagnostics(cycle)).includes("[CIRCULAR]"));
});

test("canonical API errors preserve code/status/static prose and typed reason/retry, suppress arbitrary text and details", () => {
  for (const code of Object.keys(STANDARD_API_ERROR_STATUS)) {
    const result = buildErrorResponse(code, sentinel, "safe-request-1", new Date().toISOString(),
      {reason: sentinel, field: sentinel, [sentinel]: sentinel, stack: sentinel, metadata: {message: sentinel}});
    denyLeak(result); assert.equal(result.error.code, code); assert.equal(result.error.details, undefined);
  }
  const result = buildErrorResponse("CONFLICT", "Exam runtime ownership was denied.", "safe-request-1", new Date().toISOString(),
    {reason: "integrity_rate_limited", retryAfterSeconds: 5, proof: sentinel});
  assert.equal(result.error.message, "Exam runtime ownership was denied.");
  assert.deepEqual(result.error.details, {reason: "integrity_rate_limited", retryAfterSeconds: 5});
  const unknown = buildErrorResponse(sentinel, sentinel, "safe-request-1", sentinel);
  denyLeak(unknown); assert.equal(unknown.error.code, "INTERNAL_ERROR");
  const success = {answer: sentinel};
  assert.equal(buildSuccessResponse(success, "OK", "safe-request-1", "now").data, success);
});

test("real middleware error handling preserves one safe ID across logger, context and error response", async t => {
  const entries = capture(t), req = createMockRequest({headers: {"x-request-id": `proof-${sentinel}`}}), res = createMockResponse();
  let id;
  await createMiddlewareHandler({service: "ApiV1Gateway", controller: request => {id = request.context.requestId; throw error();}})(req, res);
  assert.equal(res.statusCode, 500); denyLeak(res.body); denyLeak(entries);
  assert.equal(res.body.requestId, id); assert.ok(entries.every(entry => entry.requestId === id));
});

test("background export guard retains success and rejected retry semantics with a safe error for the platform", async () => {
  assert.equal(await policy.guardBackgroundDiagnostics(async value => value)(42), 42);
  await assert.rejects(policy.guardBackgroundDiagnostics(async () => {throw error();})(), failure => {
    denyLeak({message: failure.message, name: failure.name, stack: failure.stack});
    assert.equal(failure instanceof Error, true); return true;
  });
});

test("source inventory forbids raw application sinks and unguarded event registrations; static catalogue must match current source", () => {
  execFileSync(process.execPath, ["scripts/backend-disclosure-catalog.mjs"], {cwd: new URL("../", import.meta.url), stdio: "pipe"});
  function scan(dir) {
    for (const item of readdirSync(dir, {withFileTypes: true})) {
      if (item.isDirectory()) {if (item.name !== "tests") scan(`${dir}/${item.name}`); continue;}
      if (!item.name.endsWith(".ts")) continue;
      const source = readFileSync(`${dir}/${item.name}`, "utf8");
      if (!["logging.ts", "errorReporting.ts"].includes(item.name)) assert.doesNotMatch(source, /functions\.logger\.|console\.(?:log|warn|error|info|debug)\(/u, item.name);
      if (dir.endsWith("/triggers")) for (const match of source.matchAll(/\.on(?:Create|Update|Write|Run|Delete|Dispatch|Finalize)\(([^\n]*)/gu)) {
        assert.ok(match[1].startsWith("guardBackgroundDiagnostics("), item.name);
      }
    }
  }
  scan(new URL("../functions/src", import.meta.url).pathname);
});


test("package recovery diagnostics suppress provider/asset credentials while preserving lifecycle fields", async () => {
  const {AdminQuestionPackagesService} = require("../functions/lib/services/adminQuestionPackages");
  const service = new AdminQuestionPackagesService({storage: {deleteObject: async () => {}}});
  const writes = [];
  const references = {packageReference: {update: async value => writes.push(value), set: async value => writes.push(value)},
    uploadLogReference: {set: async value => writes.push(value)}};
  await service.recordRecovery(references, "canonical_asset_cleanup", ["existing-managed-path"], error());
  assert.equal(writes[0].state, "failed_recoverable");
  assert.equal(writes[0].recoveryPhase, "canonical_asset_cleanup");
  assert.deepEqual(writes[0].createdCanonicalObjects, ["existing-managed-path"]);
  denyLeak(writes[0].failureMessage);
  writes.splice(0);
  await service.recordValidationFailure(references, "existing-staged-path", error());
  assert.equal(writes[0].state, "validation_failed");
  denyLeak(writes[0].failureMessage);
});
