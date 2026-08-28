/* eslint-disable require-jsdoc */
import * as functions from "firebase-functions";
import {DecodedIdToken} from "firebase-admin/auth";
import {createAuthenticationMiddleware} from "../middleware/auth";
import {
  createMethodMiddleware,
  createMiddlewareHandler,
  createRequestValidationMiddleware,
  setRequestData,
} from "../middleware/framework";
import {createRoleAuthorizationMiddleware} from "../middleware/role";
import {createTenantGuardMiddleware} from "../middleware/tenant";
import {sendErrorResponse} from "../services/apiResponse";
import {studentSummaryService} from "../services/studentSummary";
import {
  StudentSolutionsRequest,
  StudentSolutionsSuccessResponse,
  StudentSummaryValidationError,
} from "../types/studentSummary";
import {MiddlewareRequest} from "../types/middleware";
import {getFirebaseAdminApp} from "../utils/firebaseAdmin";

interface StudentSolutionsDependencies {
  getSolutions: typeof studentSummaryService.getSolutions;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

export const createStudentSolutionsHandler = (
  dependencies: StudentSolutionsDependencies,
) => createMiddlewareHandler({
  controller: async (
    request: MiddlewareRequest,
    response: functions.Response,
  ): Promise<void> => {
    const result = await dependencies.getSolutions(
      request.context.requestData as unknown as StudentSolutionsRequest,
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
        const identity = request.context.identity;
        setRequestData(
          request,
          studentSummaryService.normalizeSolutionsRequest({
            instituteId: identity?.instituteId,
            licenseLayer: identity?.licenseLayer,
            page: request.query.page,
            pageSize: request.query.pageSize,
            studentId: identity?.studentId,
            testId: request.params.testId,
          }) as unknown as Record<string, unknown>,
        );
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

export const handleStudentSolutionsRequest = createStudentSolutionsHandler({
  getSolutions: studentSummaryService.getSolutions.bind(studentSummaryService),
  verifyIdToken: (idToken: string) =>
    getFirebaseAdminApp().auth().verifyIdToken(idToken, true),
});
