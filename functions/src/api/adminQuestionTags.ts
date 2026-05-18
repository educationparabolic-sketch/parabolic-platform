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
import {createTenantGuardMiddleware} from "../middleware/tenant";
import {adminQuestionTagsService} from "../services/adminQuestionTags";
import {
  AdminQuestionTagsMutationRequest,
  AdminQuestionTagsReadRequest,
  AdminQuestionTagsSuccessResponse,
  AdminQuestionTagsValidationError,
} from "../types/adminQuestionTags";
import {MiddlewareRejectionError, MiddlewareRequest} from "../types/middleware";

interface AdminQuestionTagsDependencies {
  getTags: typeof adminQuestionTagsService.getTags;
  mutateTags: typeof adminQuestionTagsService.mutateTags;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

const buildSuccessResponse = (
  result: Awaited<ReturnType<typeof adminQuestionTagsService.getTags>>,
  message: string,
  requestId: string,
  timestamp: string,
): AdminQuestionTagsSuccessResponse => ({
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
        .requestData as unknown as AdminQuestionTagsReadRequest;
      const result = await dependencies.getTags(validatedRequest);

      response.status(200).json(
        buildSuccessResponse(
          result,
          "Question tags loaded.",
          request.context.requestId,
          new Date().toISOString(),
        ),
      );
      return;
    }

    const validatedRequest = request.context
      .requestData as unknown as AdminQuestionTagsMutationRequest;
    const result = await dependencies.mutateTags(validatedRequest);

    response.status(200).json(
      buildSuccessResponse(
        result,
        `Question tag ${validatedRequest.actionType} completed.`,
        request.context.requestId,
        new Date().toISOString(),
      ),
    );
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
      allowedRoles: ["admin"],
      forbiddenMessage:
        "Only admin roles can access question tag governance.",
    }),
    createRequestValidationMiddleware({
      validator: (request: MiddlewareRequest): void => {
        const identity = request.context.identity;
        const requestData =
          request.method === "GET" ?
            adminQuestionTagsService.normalizeReadRequest({
              instituteId: identity?.instituteId,
            }) :
            adminQuestionTagsService.normalizeMutationRequest({
              actionType: request.body?.actionType,
              instituteId: identity?.instituteId,
              primaryTag: request.body?.primaryTag,
              secondaryTag: request.body?.secondaryTag,
            });

        setRequestData(
          request,
          requestData as unknown as Record<string, unknown>,
        );
      },
    }),
  ],
  onError: (error, context): boolean => {
    if (error instanceof AdminQuestionTagsValidationError) {
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

export const handleAdminQuestionTagsRequest =
  createAdminQuestionTagsHandler({
    getTags: adminQuestionTagsService.getTags.bind(
      adminQuestionTagsService,
    ),
    mutateTags: adminQuestionTagsService.mutateTags.bind(
      adminQuestionTagsService,
    ),
    verifyIdToken: (idToken: string) =>
      getFirebaseAdminApp().auth().verifyIdToken(idToken),
  });

export {buildSuccessResponse};
