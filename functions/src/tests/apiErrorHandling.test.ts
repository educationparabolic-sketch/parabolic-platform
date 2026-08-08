import assert from "node:assert/strict";
import test from "node:test";
import {
  buildErrorResponse,
  buildSuccessResponse,
  sendErrorResponse,
  STANDARD_API_ERROR_STATUS,
} from "../services/apiResponse";
import {STANDARD_API_ERROR_CODES} from "../types/apiResponse";

test("buildSuccessResponse returns the canonical success envelope", () => {
  assert.deepEqual(
    buildSuccessResponse(
      {studentId: "student_build_49"},
      "Student loaded.",
      "req_success_build_49",
      "2026-03-27T11:00:00.000Z",
    ),
    {
      code: "OK",
      data: {studentId: "student_build_49"},
      message: "Student loaded.",
      requestId: "req_success_build_49",
      success: true,
      timestamp: "2026-03-27T11:00:00.000Z",
    },
  );
});

test(
  "buildErrorResponse returns the canonical error envelope with typed details",
  () => {
    const response = buildErrorResponse(
      "TENANT_MISMATCH",
      "Token instituteId does not match request instituteId.",
      "req_build_49",
      "2026-03-27T12:00:00.000Z",
      {field: "instituteId"},
    );

    assert.deepEqual(response, {
      error: {
        code: "TENANT_MISMATCH",
        details: {field: "instituteId"},
        message: "Token instituteId does not match request instituteId.",
      },
      requestId: "req_build_49",
      success: false,
      timestamp: "2026-03-27T12:00:00.000Z",
    });
  },
);

test("every stable API error code has one HTTP status mapping", () => {
  assert.deepEqual(
    Object.keys(STANDARD_API_ERROR_STATUS).sort(),
    [...STANDARD_API_ERROR_CODES].sort(),
  );
});

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
  const timestamp = (responseBody as {timestamp: string}).timestamp;
  assert.match(timestamp, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(responseBody, {
    error: {
      code: "METHOD_NOT_ALLOWED",
      message: "Method PUT is not allowed for this API route.",
    },
    requestId: "req_method_not_allowed",
    success: false,
    timestamp,
  });
});
