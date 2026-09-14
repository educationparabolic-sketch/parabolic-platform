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
import {ADMIN_TEACHER_ROLES} from "../policy/adminRolePolicy";
import {createTenantGuardMiddleware} from "../middleware/tenant";
import {adminQuestionUploadLogsService} from "../services/adminQuestionUploadLogs";
import {
  AdminQuestionUploadLogDetailSuccessResponse,
  AdminQuestionUploadLogsSuccessResponse,
  AdminQuestionUploadLogsValidationError,
} from "../types/adminQuestionUploadLogs";
import {MiddlewareRequest} from "../types/middleware";

interface AdminQuestionUploadLogsDependencies {
  getLogDetail: typeof adminQuestionUploadLogsService.getLogDetail;
  getLogs: typeof adminQuestionUploadLogsService.getLogs;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

type ValidatedUploadLogRead =
  | {action: "detail"; payload: ReturnType<typeof adminQuestionUploadLogsService.normalizeDetailRequest>}
  | {action: "list"; payload: ReturnType<typeof adminQuestionUploadLogsService.normalizeRequest>};

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
      .requestData as unknown as ValidatedUploadLogRead;
    if (validatedRequest.action === "detail") {
      const result = await dependencies.getLogDetail(validatedRequest.payload);
      const body: AdminQuestionUploadLogDetailSuccessResponse = {
        code: "OK",
        data: result,
        message: "Question upload log detail loaded.",
        requestId: request.context.requestId,
        success: true,
        timestamp: new Date().toISOString(),
      };
      response.status(200).json(body);
      return;
    }
    const result = await dependencies.getLogs(validatedRequest.payload);

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
      allowedRoles: ADMIN_TEACHER_ROLES,
      forbiddenMessage:
        "Only teacher and admin roles can access question upload logs.",
    }),
    createRequestValidationMiddleware({
      validator: (request: MiddlewareRequest): void => {
        const identity = request.context.identity;
        if (request.params.uploadLogId) {
          setRequestData(request, {
            action: "detail",
            payload: adminQuestionUploadLogsService.normalizeDetailRequest({
              instituteId: identity?.instituteId,
              uploadLogId: request.params.uploadLogId,
            }),
          });
          return;
        }
        const validatedRequest = adminQuestionUploadLogsService.normalizeRequest({
          instituteId: identity?.instituteId,
          limit: request.query.limit,
        });

        setRequestData(request, {action: "list", payload: validatedRequest});
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
    getLogDetail: adminQuestionUploadLogsService.getLogDetail.bind(
      adminQuestionUploadLogsService,
    ),
    getLogs: adminQuestionUploadLogsService.getLogs.bind(
      adminQuestionUploadLogsService,
    ),
    verifyIdToken: (idToken: string) =>
      getFirebaseAdminApp().auth().verifyIdToken(idToken, true),
  });

export {buildSuccessResponse};
