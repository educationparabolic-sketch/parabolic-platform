import assert from "node:assert/strict";
import test from "node:test";
import {buildErrorResponse} from "../services/apiResponse";

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
