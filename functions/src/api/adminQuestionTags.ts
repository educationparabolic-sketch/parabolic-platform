/* eslint-disable require-jsdoc */
import * as functions from "firebase-functions";
import {DecodedIdToken} from "firebase-admin/auth";
import {sendErrorResponse} from "../services/apiResponse";
import {getFirebaseAdminApp} from "../utils/firebaseAdmin";
import {createAuthenticationMiddleware} from "../middleware/auth";
import {
  createMiddlewareHandler,
  createRequestValidationMiddleware,
  setRequestData,
} from "../middleware/framework";
import {createRoleAuthorizationMiddleware} from "../middleware/role";
import {ADMIN_TEACHER_ROLES} from "../policy/adminRolePolicy";
import {createTenantGuardMiddleware} from "../middleware/tenant";
import {adminQuestionTagsService} from "../services/adminQuestionTags";
import {
  AdminQuestionBankValidationError,
  AdminQuestionTagMutationResult,
  AdminQuestionTagMutationValidatedRequest,
  AdminQuestionTagReadValidatedRequest,
  AdminQuestionTagsResult,
} from "../types/adminQuestionBank";
import {StandardApiSuccessResponse} from "../types/apiResponse";
import {MiddlewareRejectionError, MiddlewareRequest} from "../types/middleware";

interface AdminQuestionTagsDependencies {
  getTags: typeof adminQuestionTagsService.getTags;
  mutateTags: typeof adminQuestionTagsService.mutateTags;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

type TagResponse = AdminQuestionTagsResult | AdminQuestionTagMutationResult;

const buildSuccessResponse = (
  result: TagResponse,
  message: string,
  requestId: string,
  timestamp: string,
): StandardApiSuccessResponse<TagResponse> => ({
  code: "OK",
  data: result,
  message,
  requestId,
  success: true,
  timestamp,
});

export const createAdminQuestionTagsHandler = (
  dependencies: AdminQuestionTagsDependencies,
) => createMiddlewareHandler({
  controller: async (
    request: MiddlewareRequest,
    response: functions.Response,
  ): Promise<void> => {
    if (request.method === "GET") {
      const validatedRequest = request.context
        .requestData as unknown as AdminQuestionTagReadValidatedRequest;
      const result = await dependencies.getTags(validatedRequest);
      response.status(200).json(buildSuccessResponse(
        result,
        "Question tags loaded.",
        request.context.requestId,
        new Date().toISOString(),
      ));
      return;
    }

    const validatedRequest = request.context
      .requestData as unknown as AdminQuestionTagMutationValidatedRequest;
    const result = await dependencies.mutateTags(validatedRequest);
    response.status(200).json(buildSuccessResponse(
      result,
      `Question tag ${validatedRequest.mutation.action} completed.`,
      request.context.requestId,
      new Date().toISOString(),
    ));
  },
  middlewares: [
    async (request, _response, next): Promise<void> => {
      if (request.method !== "GET" && request.method !== "POST") {
        throw new MiddlewareRejectionError(
          "VALIDATION_ERROR",
          "Method not allowed. Use GET or POST.",
        );
      }
      await next();
    },
    createAuthenticationMiddleware(dependencies),
    createTenantGuardMiddleware({
      allowVendorBypass: false,
      resolveRequestInstituteId: (request): string | null =>
        request.context.identity?.instituteId ?? null,
    }),
    createRoleAuthorizationMiddleware({
      allowedRoles: ADMIN_TEACHER_ROLES,
      forbiddenMessage:
        "Only teacher and admin roles can access question tag governance.",
    }),
    createRequestValidationMiddleware({
      validator: (request: MiddlewareRequest): void => {
        const identity = request.context.identity;
        const context = {
          actorId: identity?.uid,
          actorRole: identity?.role,
          instituteId: identity?.instituteId,
          ipAddress: request.ip,
          userAgent: request.get("user-agent"),
        };
        const requestData = request.method === "GET" ?
          adminQuestionTagsService.normalizeReadRequest({
            ...context,
            field: request.query?.field,
          }) :
          adminQuestionTagsService.normalizeMutationRequest({
            ...context,
            body: request.body,
          });
        setRequestData(request, requestData as unknown as Record<string, unknown>);
      },
    }),
  ],
  onError: (error, context): boolean => {
    if (error instanceof AdminQuestionBankValidationError) {
      context.logger.warn("Question tag governance request rejected.", {
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
  service: "AdminQuestionTagsApi",
});

export const handleAdminQuestionTagsRequest = createAdminQuestionTagsHandler({
  getTags: adminQuestionTagsService.getTags.bind(adminQuestionTagsService),
  mutateTags: adminQuestionTagsService.mutateTags.bind(adminQuestionTagsService),
  verifyIdToken: (idToken: string) =>
    getFirebaseAdminApp().auth().verifyIdToken(idToken, true),
});

export {buildSuccessResponse};
