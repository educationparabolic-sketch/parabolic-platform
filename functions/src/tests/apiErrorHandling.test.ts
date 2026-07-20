import assert from "node:assert/strict";
import test from "node:test";
import {
  buildErrorResponse,
  sendErrorResponse,
} from "../services/apiResponse";

test(
  "buildErrorResponse returns the standardized nested API error contract",
  () => {
    const response = buildErrorResponse(
      "TENANT_MISMATCH",
      "Token instituteId does not match request instituteId.",
      "req_build_49",
      "2026-03-27T12:00:00.000Z",
    );

    assert.deepEqual(response, {
      error: {
        code: "TENANT_MISMATCH",
        message: "Token instituteId does not match request instituteId.",
      },
      meta: {
        requestId: "req_build_49",
        timestamp: "2026-03-27T12:00:00.000Z",
      },
      success: false,
    });
  },
);

test("sendErrorResponse maps METHOD_NOT_ALLOWED to HTTP 405", () => {
  let responseBody: unknown;
  let responseStatus: number | undefined;
  const response = {
    json: (body: unknown) => {
      responseBody = body;
      return response;
    },
    status: (status: number) => {
      responseStatus = status;
      return response;
    },
  } as unknown as Parameters<typeof sendErrorResponse>[0];

  sendErrorResponse(
    response,
    "req_method_not_allowed",
    "METHOD_NOT_ALLOWED",
    "Method PUT is not allowed for this API route.",
  );

  assert.equal(responseStatus, 405);
  const timestamp = (responseBody as {meta: {timestamp: string}})
    .meta.timestamp;
  assert.match(timestamp, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(responseBody, {
    error: {
      code: "METHOD_NOT_ALLOWED",
      message: "Method PUT is not allowed for this API route.",
    },
    meta: {
      requestId: "req_method_not_allowed",
      timestamp,
    },
    success: false,
  });
});
