import * as functions from "firebase-functions";
import {DecodedIdToken} from "firebase-admin/auth";
import {sendErrorResponse} from "../services/apiResponse";
import {getFirebaseAdminApp} from "../utils/firebaseAdmin";
import {createAuthenticationMiddleware} from "../middleware/auth";
import {
  createMethodMiddleware,
  createMiddlewareHandler,
  createRequestValidationMiddleware,
  setRequestData,
} from "../middleware/framework";
import {createRoleAuthorizationMiddleware} from "../middleware/role";
import {createTenantGuardMiddleware} from "../middleware/tenant";
import {adminQuestionUploadLogsService} from "../services/adminQuestionUploadLogs";
import {
  AdminQuestionUploadLogsSuccessResponse,
  AdminQuestionUploadLogsValidatedRequest,
  AdminQuestionUploadLogsValidationError,
} from "../types/adminQuestionUploadLogs";
import {MiddlewareRequest} from "../types/middleware";

interface AdminQuestionUploadLogsDependencies {
  getLogs: typeof adminQuestionUploadLogsService.getLogs;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

const buildSuccessResponse = (
  result: Awaited<ReturnType<typeof adminQuestionUploadLogsService.getLogs>>,
  requestId: string,
  timestamp: string,
): AdminQuestionUploadLogsSuccessResponse => ({
  code: "OK",
  data: result,
  message: "Question upload logs loaded.",
  requestId,
  success: true,
  timestamp,
});

export const createAdminQuestionUploadLogsHandler = (
  dependencies: AdminQuestionUploadLogsDependencies,
) => createMiddlewareHandler({
  controller: async (
    request: MiddlewareRequest,
    response: functions.Response,
  ): Promise<void> => {
    const validatedRequest = request.context
      .requestData as unknown as AdminQuestionUploadLogsValidatedRequest;
    const result = await dependencies.getLogs(validatedRequest);

    response.status(200).json(
      buildSuccessResponse(
        result,
        request.context.requestId,
        new Date().toISOString(),
      ),
    );
  },
  middlewares: [
    createMethodMiddleware("GET"),
    createAuthenticationMiddleware(dependencies),
    createTenantGuardMiddleware({
      allowVendorBypass: false,
      resolveRequestInstituteId: (request): string | null =>
        request.context.identity?.instituteId ?? null,
    }),
    createRoleAuthorizationMiddleware({
      allowedRoles: ["admin"],
      forbiddenMessage:
        "Only admin roles can access question upload logs.",
    }),
    createRequestValidationMiddleware({
      validator: (request: MiddlewareRequest): void => {
        const identity = request.context.identity;
        const validatedRequest = adminQuestionUploadLogsService.normalizeRequest({
          instituteId: identity?.instituteId,
          limit: request.query.limit,
        });

        setRequestData(
          request,
          validatedRequest as unknown as Record<string, unknown>,
        );
      },
    }),
  ],
  onError: (error, context): boolean => {
    if (error instanceof AdminQuestionUploadLogsValidationError) {
      context.logger.warn("Question upload logs request rejected.", {
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
  service: "AdminQuestionUploadLogsApi",
});

export const handleAdminQuestionUploadLogsRequest =
  createAdminQuestionUploadLogsHandler({
    getLogs: adminQuestionUploadLogsService.getLogs.bind(
      adminQuestionUploadLogsService,
    ),
    verifyIdToken: (idToken: string) =>
      getFirebaseAdminApp().auth().verifyIdToken(idToken),
  });

export {buildSuccessResponse};
