import * as functions from "firebase-functions";
import {DecodedIdToken} from "firebase-admin/auth";
import {sendErrorResponse} from "../services/apiResponse";
import {createRequestLogger} from "../services/logging";
import {
  emailQueueService,
  EmailQueueValidationError,
} from "../services/emailQueue";
import {getFirebaseAdminApp} from "../utils/firebaseAdmin";
import {
  EmailQueueRequestPayload,
  EmailQueueSuccessResponse,
} from "../types/emailQueue";

interface InternalEmailQueueRequestBody {
  payload?: unknown;
  recipientEmail?: unknown;
  templateType?: unknown;
}

interface EmailQueueRequestDependencies {
  enqueueEmailJob: typeof emailQueueService.enqueueEmailJob;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

const normalizeRole = (decodedToken: Record<string, unknown>): string =>
  String(decodedToken.role ?? decodedToken.userRole ?? "")
    .trim()
    .toLowerCase();

const resolveInstituteClaim = (
  decodedToken: Record<string, unknown>,
): string | null => {
  const rawValue = decodedToken.instituteId ?? decodedToken.tenantId;

  if (typeof rawValue !== "string") {
    return null;
  }

  const normalizedValue = rawValue.trim();
  return normalizedValue || null;
};

const getBearerToken = (
  request: functions.https.Request,
): string => {
  const headerValue = request.header("authorization");

  if (!headerValue) {
    throw new EmailQueueValidationError(
      "UNAUTHORIZED",
      "Missing authorization header.",
    );
  }

  const [scheme, token] = headerValue.split(" ");

  if (scheme?.toLowerCase() !== "bearer" || !token?.trim()) {
    throw new EmailQueueValidationError(
      "UNAUTHORIZED",
      "Authorization header must be in Bearer token format.",
    );
  }

  return token.trim();
};

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
) =>
  async (
    request: functions.https.Request,
    response: functions.Response,
  ): Promise<void> => {
    const logger = createRequestLogger("EmailQueueApi", request);
    const requestId = logger.getRequestId();

    try {
      if (request.method !== "POST") {
        sendErrorResponse(
          response,
          requestId,
          "VALIDATION_ERROR",
          "Method not allowed. Use POST.",
        );
        return;
      }

      const idToken = getBearerToken(request);
      const decodedToken = await dependencies.verifyIdToken(idToken);
      const normalizedRole = normalizeRole(decodedToken);

      if (
        normalizedRole !== "service" &&
        normalizedRole !== "backend_service"
      ) {
        throw new EmailQueueValidationError(
          "FORBIDDEN",
          "Only backend service roles can enqueue email jobs.",
        );
      }

      const body = (request.body ?? {}) as InternalEmailQueueRequestBody;
      const instituteId = getPayloadInstituteId(body.payload);
      const instituteClaim = resolveInstituteClaim(decodedToken);

      if (instituteClaim && instituteClaim !== instituteId) {
        throw new EmailQueueValidationError(
          "TENANT_MISMATCH",
          "Token instituteId does not match payload.instituteId.",
        );
      }

      const result = await dependencies.enqueueEmailJob({
        payload: body.payload as EmailQueueRequestPayload,
        recipientEmail: body.recipientEmail as string,
        templateType: body.templateType as string,
      });

      logger.info("Internal email queue request completed.", {
        instituteId,
        jobId: result.jobId,
        jobPath: result.jobPath,
      });

      response.status(200).json(
        buildSuccessResponse(result, requestId, new Date().toISOString()),
      );
    } catch (error) {
      if (error instanceof EmailQueueValidationError) {
        logger.warn("Internal email queue request rejected.", {
          code: error.code,
          error,
        });
        sendErrorResponse(response, requestId, error.code, error.message);
        return;
      }

      logger.error("Internal email queue request failed.", {error});
      sendErrorResponse(
        response,
        requestId,
        "INTERNAL_ERROR",
        "Unexpected error while queueing email job.",
      );
    }
  };

export const handleInternalEmailQueueRequest = createInternalEmailQueueHandler({
  enqueueEmailJob: emailQueueService.enqueueEmailJob.bind(emailQueueService),
  verifyIdToken: (idToken: string) =>
    getFirebaseAdminApp().auth().verifyIdToken(idToken),
});

export {buildSuccessResponse};
