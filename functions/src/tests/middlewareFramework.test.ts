import assert from "node:assert/strict";
import test from "node:test";
import {
  createMethodMiddleware,
  createMiddlewareHandler,
  createRequestValidationMiddleware,
  setRequestData,
  setRequestIdentity,
} from "../middleware/framework";
import {createLicenseEnforcementMiddleware} from "../middleware/license";
import {
  createMockRequest,
  createMockResponse,
} from "./helpers/http";

test("middleware framework executes middleware in order", async () => {
  const executionOrder: string[] = [];
  const handler = createMiddlewareHandler({
    controller: async (request, response) => {
      executionOrder.push("controller");
      response.status(200).json({
        requestData: request.context.requestData,
        requestId: request.context.requestId,
      });
    },
    middlewares: [
      async (request, _response, next) => {
        executionOrder.push("first");
        setRequestIdentity(request, {
          instituteId: "inst_build_61",
          isSuspended: false,
          isVendor: false,
          licenseLayer: "L1",
          role: "teacher",
          uid: "uid_build_61",
        });
        await next();
      },
      createRequestValidationMiddleware({
        validator: (request) => {
          executionOrder.push("second");
          setRequestData(request, {
            instituteId: request.context.identity?.instituteId,
          });
        },
      }),
    ],
    service: "MiddlewareFrameworkTestApi",
  });
  const response = createMockResponse();

  await handler(createMockRequest() as never, response as never);

  assert.deepEqual(executionOrder, [
    "first",
    "second",
    "controller",
  ]);
  assert.equal(response.statusCode, 200);
  assert.equal(
    typeof (response.body as {requestId: string}).requestId,
    "string",
  );
  assert.deepEqual(
    (response.body as {requestData: Record<string, unknown>}).requestData,
    {instituteId: "inst_build_61"},
  );
});

test(
  "middleware framework short-circuits when next is not called",
  async () => {
    const handler = createMiddlewareHandler({
      controller: async () => {
        throw new Error("controller should not be called");
      },
      middlewares: [
        async (_request, response) => {
          response.status(202).json({code: "accepted"});
        },
      ],
      service: "MiddlewareFrameworkTestApi",
    });
    const response = createMockResponse();

    await handler(createMockRequest() as never, response as never);

    assert.equal(response.statusCode, 202);
    assert.deepEqual(response.body, {code: "accepted"});
  },
);

test("middleware framework returns standardized method errors", async () => {
  const handler = createMiddlewareHandler({
    controller: async () => {
      throw new Error("controller should not be called");
    },
    middlewares: [createMethodMiddleware("POST")],
    service: "MiddlewareFrameworkTestApi",
  });
  const response = createMockResponse();

  await handler(
    createMockRequest({method: "GET"}) as never,
    response as never,
  );

  const responseBody = response.body as {
    error: {
      code: string;
      message: string;
    };
    meta: {
      requestId: string;
      timestamp: string;
    };
    success: boolean;
  };

  assert.equal(response.statusCode, 400);
  assert.equal(responseBody.error.code, "VALIDATION_ERROR");
  assert.equal(responseBody.error.message, "Method not allowed. Use POST.");
  assert.equal(responseBody.success, false);
  assert.equal(typeof responseBody.meta.requestId, "string");
  assert.equal(typeof responseBody.meta.timestamp, "string");
});

test("middleware framework returns standardized license errors", async () => {
  const handler = createMiddlewareHandler({
    controller: async () => {
      throw new Error("controller should not be called");
    },
    middlewares: [
      async (request, _response, next) => {
        setRequestIdentity(request, {
          instituteId: "inst_build_65",
          isSuspended: false,
          isVendor: false,
          licenseLayer: "L1",
          role: "teacher",
          uid: "uid_build_65",
        });
        await next();
      },
      createLicenseEnforcementMiddleware({
        requiredLayer: "L2",
        restrictionMessage: "Controlled mode requires license layer L2.",
      }),
    ],
    service: "MiddlewareFrameworkTestApi",
  });
  const response = createMockResponse();

  await handler(createMockRequest() as never, response as never);

  const responseBody = response.body as {
    error: {
      code: string;
      message: string;
    };
    meta: {
      requestId: string;
      timestamp: string;
    };
    success: boolean;
  };

  assert.equal(response.statusCode, 403);
  assert.equal(responseBody.error.code, "LICENSE_RESTRICTED");
  assert.equal(
    responseBody.error.message,
    "Controlled mode requires license layer L2.",
  );
  assert.equal(responseBody.success, false);
  assert.equal(typeof responseBody.meta.requestId, "string");
  assert.equal(typeof responseBody.meta.timestamp, "string");
});
