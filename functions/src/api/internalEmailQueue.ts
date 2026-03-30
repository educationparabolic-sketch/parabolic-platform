import * as functions from "firebase-functions";
import {DecodedIdToken} from "firebase-admin/auth";
import {sendErrorResponse} from "../services/apiResponse";
import {
  emailQueueService,
  EmailQueueValidationError,
} from "../services/emailQueue";
import {getFirebaseAdminApp} from "../utils/firebaseAdmin";
import {
  EmailQueueRequestPayload,
  EmailQueueSuccessResponse,
} from "../types/emailQueue";
import {
  createMethodMiddleware,
  createMiddlewareHandler,
  createRequestValidationMiddleware,
  setRequestData,
} from "../middleware/framework";
import {MiddlewareRequest} from "../types/middleware";
import {createAuthenticationMiddleware} from "../middleware/auth";
import {createTenantGuardMiddleware} from "../middleware/tenant";

interface InternalEmailQueueRequestBody {
  payload?: unknown;
  recipientEmail?: unknown;
  templateType?: unknown;
}

interface EmailQueueRequestDependencies {
  enqueueEmailJob: typeof emailQueueService.enqueueEmailJob;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

interface InternalEmailQueueValidatedRequestData
extends Record<string, unknown> {
  payload: EmailQueueRequestPayload;
  recipientEmail: string;
  templateType: string;
}

const buildSuccessResponse = (
  result: Awaited<ReturnType<typeof emailQueueService.enqueueEmailJob>>,
  requestId: string,
  timestamp: string,
): EmailQueueSuccessResponse => ({
  code: "OK",
  data: result,
  message: "Email job queued.",
  requestId,
  success: true,
  timestamp,
});

const getPayloadInstituteId = (payload: unknown): string => {
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload) ||
    typeof (payload as {instituteId?: unknown}).instituteId !== "string" ||
    !(payload as {instituteId: string}).instituteId.trim()
  ) {
    throw new EmailQueueValidationError(
      "VALIDATION_ERROR",
      "Field \"payload.instituteId\" must be a non-empty string.",
    );
  }

  return (payload as {instituteId: string}).instituteId.trim();
};

export const createInternalEmailQueueHandler = (
  dependencies: EmailQueueRequestDependencies,
) => createMiddlewareHandler({
  controller: async (
    request: MiddlewareRequest,
    response: functions.Response,
  ): Promise<void> => {
    const requestId = request.context.requestId;
    const validatedData = request.context
      .requestData as InternalEmailQueueValidatedRequestData;
    const result = await dependencies.enqueueEmailJob(validatedData);

    response.status(200).json(
      buildSuccessResponse(result, requestId, new Date().toISOString()),
    );
  },
  middlewares: [
    createMethodMiddleware("POST"),
    createAuthenticationMiddleware(dependencies),
    createTenantGuardMiddleware({
      mismatchMessage:
        "Token instituteId does not match payload.instituteId.",
      resolveRequestInstituteId: (request): string | null => {
        const body = (request.body ?? {}) as InternalEmailQueueRequestBody;
        const payload = body.payload;

        if (
          typeof payload !== "object" ||
          payload === null ||
          Array.isArray(payload) ||
          typeof (payload as {instituteId?: unknown}).instituteId !== "string"
        ) {
          return null;
        }

        return (payload as {instituteId: string}).instituteId;
      },
    }),
    async (request, _response, next): Promise<void> => {
      const normalizedRole = request.context.identity?.role;

      if (normalizedRole !== "service" &&
        normalizedRole !== "backend_service") {
        throw new EmailQueueValidationError(
          "FORBIDDEN",
          "Only backend service roles can enqueue email jobs.",
        );
      }

      await next();
    },
    createRequestValidationMiddleware({
      validator: (request: MiddlewareRequest): void => {
        const body = (request.body ?? {}) as InternalEmailQueueRequestBody;
        const instituteId = getPayloadInstituteId(body.payload);
        const payload = body.payload as EmailQueueRequestPayload;

        setRequestData(request, {
          payload: {
            ...payload,
            instituteId: request.context.identity?.instituteId ?? instituteId,
          },
          recipientEmail: body.recipientEmail as string,
          templateType: body.templateType as string,
        });
      },
    }),
  ],
  onError: (error, context): boolean => {
    if (error instanceof EmailQueueValidationError) {
      context.logger.warn("Internal email queue request rejected.", {
        code: error.code,
        error,
      });
      sendErrorResponse(
        context.response,
        context.requestId,
        error.code,
        error.message,
      );
      return true;
    }

    return false;
  },
  service: "EmailQueueApi",
});

export const handleInternalEmailQueueRequest = createInternalEmailQueueHandler({
  enqueueEmailJob: emailQueueService.enqueueEmailJob.bind(emailQueueService),
  verifyIdToken: (idToken: string) =>
    getFirebaseAdminApp().auth().verifyIdToken(idToken),
});

export {buildSuccessResponse};
