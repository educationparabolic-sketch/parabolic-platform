/* eslint-disable require-jsdoc */
import * as functions from "firebase-functions";
import {DecodedIdToken} from "firebase-admin/auth";
import {createAuthenticationMiddleware, getBearerToken} from "../middleware/auth";
import {
  createMethodMiddleware,
  createMiddlewareHandler,
  createRequestValidationMiddleware,
  setRequestData,
} from "../middleware/framework";
import {createRoleAuthorizationMiddleware} from "../middleware/role";
import {createTenantGuardMiddleware} from "../middleware/tenant";
import {sendErrorResponse} from "../services/apiResponse";
import {studentSolutionsService, normalizeStudentSolutionSelection} from "../services/studentSolutions";
import {
  StudentSolutionsSuccessResponse,
  StudentSummaryValidationError,
} from "../types/studentSummary";
import {MiddlewareRequest} from "../types/middleware";
import {getFirebaseAdminApp} from "../utils/firebaseAdmin";

interface StudentSolutionsDependencies {
  getSolutions: typeof studentSolutionsService.getSolutions;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

export const createStudentSolutionsHandler = (
  dependencies: StudentSolutionsDependencies,
) => {
  const handler = createMiddlewareHandler({
    controller: async (
      request: MiddlewareRequest,
      response: functions.Response,
    ): Promise<void> => {
      const result = await dependencies.getSolutions(
        getBearerToken(request.headers.authorization), request.params.testId, request.query,
      );
      const responseBody: StudentSolutionsSuccessResponse = {
        code: "OK",
        data: result,
        message: "Student solutions loaded.",
        requestId: request.context.requestId,
        success: true,
        timestamp: new Date().toISOString(),
      };
      response.status(200).json(responseBody);
    },
    middlewares: [
      createMethodMiddleware("GET"),
      createAuthenticationMiddleware(dependencies, {attachStudentId: true}),
      createTenantGuardMiddleware({
        allowVendorBypass: false,
        resolveRequestInstituteId: (request) =>
          request.context.identity?.instituteId,
      }),
      createRoleAuthorizationMiddleware({
        allowedRoles: ["student"],
        forbiddenMessage: "Only Students can access Student summaries.",
      }),
      createRequestValidationMiddleware({
        validator: (request): void => {
          if (!request.params.testId) {
            const match = request.path.match(/^(?:\/api\/v1)?\/student\/tests\/([^/]+)\/solutions$/u);
            if (match) {
              try {
                request.params.testId = decodeURIComponent(match[1]);
              } catch {
                throw new StudentSummaryValidationError("VALIDATION_ERROR", "Test selector is invalid.");
              }
            }
          }
          setRequestData(request, normalizeStudentSolutionSelection(request.params.testId, request.query) as
          unknown as Record<string, unknown>);
        },
      }),
    ],
    onError: (error, context): boolean => {
      if (error instanceof StudentSummaryValidationError) {
        context.logger.warn("Student solutions request rejected.", {
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
    service: "StudentSolutionsApi",
  });
  return async (request: functions.https.Request, response: functions.Response): Promise<void> => {
    response.set("Cache-Control", "private, max-age=0, no-store");
    response.set("Pragma", "no-cache");
    response.set("X-Content-Type-Options", "nosniff");
    await handler(request, response);
  };
};

export const handleStudentSolutionsRequest = createStudentSolutionsHandler({
  getSolutions: studentSolutionsService.getSolutions.bind(studentSolutionsService),
  verifyIdToken: (idToken: string) =>
    getFirebaseAdminApp().auth().verifyIdToken(idToken, true),
});
