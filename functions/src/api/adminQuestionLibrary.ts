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
import {adminQuestionLibraryService} from "../services/adminQuestionLibrary";
import {
  AdminQuestionLibrarySuccessResponse,
  AdminQuestionLibraryValidatedRequest,
  AdminQuestionLibraryValidationError,
} from "../types/adminQuestionLibrary";
import {MiddlewareRequest} from "../types/middleware";

interface AdminQuestionLibraryDependencies {
  getLibrary: typeof adminQuestionLibraryService.getLibrary;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

const buildSuccessResponse = (
  result: Awaited<ReturnType<typeof adminQuestionLibraryService.getLibrary>>,
  requestId: string,
  timestamp: string,
): AdminQuestionLibrarySuccessResponse => ({
  code: "OK",
  data: result,
  message: "Question library loaded.",
  requestId,
  success: true,
  timestamp,
});

export const createAdminQuestionLibraryHandler = (
  dependencies: AdminQuestionLibraryDependencies,
) => createMiddlewareHandler({
  controller: async (
    request: MiddlewareRequest,
    response: functions.Response,
  ): Promise<void> => {
    const validatedRequest = request.context
      .requestData as unknown as AdminQuestionLibraryValidatedRequest;
    const result = await dependencies.getLibrary(validatedRequest);

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
        "Only admin roles can access question library records.",
    }),
    createRequestValidationMiddleware({
      validator: (request: MiddlewareRequest): void => {
        const identity = request.context.identity;
        const validatedRequest = adminQuestionLibraryService.normalizeRequest({
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
    if (error instanceof AdminQuestionLibraryValidationError) {
      context.logger.warn("Question library request rejected.", {
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
  service: "AdminQuestionLibraryApi",
});

export const handleAdminQuestionLibraryRequest =
  createAdminQuestionLibraryHandler({
    getLibrary: adminQuestionLibraryService.getLibrary.bind(
      adminQuestionLibraryService,
    ),
    verifyIdToken: (idToken: string) =>
      getFirebaseAdminApp().auth().verifyIdToken(idToken),
  });

export {buildSuccessResponse};
