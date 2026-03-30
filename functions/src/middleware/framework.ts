import * as functions from "firebase-functions";
import {sendErrorResponse} from "../services/apiResponse";
import {createRequestLogger} from "../services/logging";
import {
  LicenseLayer,
  Middleware,
  MiddlewareHandlerOptions,
  MiddlewareIdentityContext,
  MiddlewareNext,
  MiddlewareRequest,
  MiddlewareRequestContext,
  MiddlewareRejectionError,
  RequestValidationOptions,
} from "../types/middleware";

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value);

const mergeRequestData = (
  currentValue: Record<string, unknown> | undefined,
  nextValue: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined => {
  if (!currentValue) {
    return nextValue;
  }

  if (!nextValue) {
    return currentValue;
  }

  return {
    ...currentValue,
    ...nextValue,
  };
};

export const ensureRequestContext = (
  request: MiddlewareRequest,
  requestId: string,
): MiddlewareRequestContext => {
  const existingContext = isPlainObject(request.context) ?
    request.context :
    undefined;
  const nextContext: MiddlewareRequestContext = {
    ...existingContext,
    requestData: mergeRequestData(existingContext?.requestData, undefined),
    requestId,
  };

  request.context = nextContext;

  return nextContext;
};

export const mergeRequestContext = (
  request: MiddlewareRequest,
  partialContext: Partial<MiddlewareRequestContext>,
): MiddlewareRequestContext => {
  const currentContext = ensureRequestContext(
    request,
    request.context?.requestId ?? "unknown-request",
  );
  const nextContext: MiddlewareRequestContext = {
    ...currentContext,
    ...partialContext,
    requestData: mergeRequestData(
      currentContext.requestData,
      partialContext.requestData,
    ),
    requestId: currentContext.requestId,
  };

  request.context = nextContext;

  return nextContext;
};

export const setRequestIdentity = (
  request: MiddlewareRequest,
  identity: MiddlewareIdentityContext,
): MiddlewareRequestContext =>
  mergeRequestContext(request, {
    identity,
    licenseDepth: identity.licenseLayer,
  });

export const setRequestData = (
  request: MiddlewareRequest,
  requestData: Record<string, unknown>,
): MiddlewareRequestContext =>
  mergeRequestContext(request, {requestData});

export const createMethodMiddleware = (
  expectedMethod: string,
): Middleware => async (request, _response, next): Promise<void> => {
  if (request.method !== expectedMethod) {
    throw new MiddlewareRejectionError(
      "VALIDATION_ERROR",
      `Method not allowed. Use ${expectedMethod}.`,
    );
  }

  await next();
};

export const createRequestValidationMiddleware = (
  options: RequestValidationOptions,
): Middleware => async (request, _response, next): Promise<void> => {
  await options.validator(request);
  await next();
};

const runMiddlewareStack = async (
  request: MiddlewareRequest,
  response: functions.Response,
  middlewares: Middleware[],
  controller: MiddlewareHandlerOptions["controller"],
): Promise<void> => {
  const dispatch = async (index: number): Promise<void> => {
    if (index >= middlewares.length) {
      await controller(request, response);
      return;
    }

    const middleware = middlewares[index];
    let nextCalled = false;

    const next: MiddlewareNext = async () => {
      if (nextCalled) {
        throw new Error("Middleware next() called multiple times.");
      }

      nextCalled = true;
      await dispatch(index + 1);
    };

    await middleware(request, response, next);
  };

  await dispatch(0);
};

export const createMiddlewareHandler = (
  options: MiddlewareHandlerOptions,
) =>
  async (
    rawRequest: functions.https.Request,
    response: functions.Response,
  ): Promise<void> => {
    const request = rawRequest as MiddlewareRequest;
    const logger = createRequestLogger(options.service, rawRequest);
    const requestId = logger.getRequestId();

    ensureRequestContext(request, requestId);

    try {
      await runMiddlewareStack(
        request,
        response,
        options.middlewares ?? [],
        options.controller,
      );
    } catch (error) {
      if (error instanceof MiddlewareRejectionError) {
        logger.warn("Middleware rejected request.", {
          code: error.code,
          error,
        });
        sendErrorResponse(response, requestId, error.code, error.message);
        return;
      }

      if (options.onError) {
        const handled = await options.onError(error, {
          logger,
          request,
          requestId,
          response,
        });

        if (handled) {
          return;
        }
      }

      logger.error("Unhandled middleware pipeline failure.", {error});
      sendErrorResponse(
        response,
        requestId,
        "INTERNAL_ERROR",
        "Unexpected error while processing request.",
      );
    }
  };

export const resolveLicenseLayer = (
  value: unknown,
): LicenseLayer | null => {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim().toUpperCase();

  if (
    normalizedValue !== "L0" &&
    normalizedValue !== "L1" &&
    normalizedValue !== "L2" &&
    normalizedValue !== "L3"
  ) {
    return null;
  }

  return normalizedValue;
};
