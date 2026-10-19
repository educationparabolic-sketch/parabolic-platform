/* eslint-disable require-jsdoc */
import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {createExamSessionIntegrityEventsHandler} from "../api/examSessionIntegrityEvents";
import {ExamProctoringError} from "../services/examProctoringPolicy";
import {createMockRequest, createMockResponse} from "./helpers/http";

const command = {contractVersion: 1, batchId: randomUUID(), events: [{eventType: "CAMERA_LOST",
  observedAt: "2026-10-19T01:00:00.000Z", phase: "exam"}]};
function request() {
  const raw = createMockRequest({method: "POST", path: "/exam/session/session/integrity-events",
    headers: {"authorization": "Bearer secret-token", "content-type": "application/json",
      "x-parabolic-exam-owner": Buffer.alloc(32, 7).toString("base64url"), "x-parabolic-exam-generation": "1"},
    body: command});
  return Object.assign(raw, {rawBody: Buffer.from(JSON.stringify(command)),
    is: (type: string) => type === "application/json"});
}
test("uncertain provider failure never acknowledges or discloses provider data", async () => {
  let calls = 0;
  const handler = createExamSessionIntegrityEventsHandler({ingest: async () => {
    calls++;
    throw new Error("secret-token secret-proof gs://private/path payload");
  }});
  const response = createMockResponse();
  await handler(request() as never, response as never);
  assert.equal(calls, 1);
  assert.equal(response.statusCode, 500);
  assert.equal((response.body as {success: boolean}).success, false);
  assert.doesNotMatch(JSON.stringify(response.body), /secret|gs:\/\/|payload/u);
  assert.match(String(response.headers["cache-control"]), /no-store/u);
});
test("rate denial preserves standard error and fixed Retry-After without a success receipt", async () => {
  const handler = createExamSessionIntegrityEventsHandler({ingest: async () => {
    throw new ExamProctoringError("CONFLICT", "integrity_rate_limited");
  }});
  const response = createMockResponse();
  await handler(request() as never, response as never);
  assert.equal(response.statusCode, 409);
  assert.equal(response.headers["retry-after"], "5");
  assert.deepEqual((response.body as {error: {details: unknown}}).error.details,
    {reason: "integrity_rate_limited", retryAfterSeconds: 5});
});
test("unsupported encoding/query/raw fields stop before persistence", async () => {
  let calls = 0;
  const handler = createExamSessionIntegrityEventsHandler({ingest: async () => {
    calls++; throw Error();
  }});
  for (const patch of [{query: {scope: "other"}}, {headers: {...(request().headers as Record<string, string>),
    "content-encoding": "gzip"}},
  {rawBody: Buffer.from(JSON.stringify({...command, media: "secret"}))},
  {path: "/exam/session/session/integrity-events/extra"}, {method: "GET"}]) {
    const response = createMockResponse();
    await handler(Object.assign(request(), patch) as never, response as never);
    assert.ok(response.statusCode >= 400);
    assert.match(String(response.headers["cache-control"]), /no-store/u);
  }
  assert.equal(calls, 0);
});
