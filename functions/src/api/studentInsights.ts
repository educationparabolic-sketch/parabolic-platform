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
  StudentInsightsRequest,
  StudentInsightsSuccessResponse,
  StudentSummaryValidationError,
} from "../types/studentSummary";
import {MiddlewareRequest} from "../types/middleware";
import {getFirebaseAdminApp} from "../utils/firebaseAdmin";

interface StudentInsightsDependencies {
  getInsights: typeof studentSummaryService.getInsights;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

export const createStudentInsightsHandler = (
  dependencies: StudentInsightsDependencies,
) => createMiddlewareHandler({
  controller: async (
    request: MiddlewareRequest,
    response: functions.Response,
  ): Promise<void> => {
    const result = await dependencies.getInsights(
      request.context.requestData as unknown as StudentInsightsRequest,
    );
    const responseBody: StudentInsightsSuccessResponse = {
      code: "OK",
      data: result,
      message: "Student insights loaded.",
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
          studentSummaryService.normalizeInsightsRequest({
            instituteId: identity?.instituteId,
            licenseLayer: identity?.licenseLayer,
            limit: request.query.limit,
            studentId: identity?.studentId,
          }) as unknown as Record<string, unknown>,
        );
      },
    }),
  ],
  onError: (error, context): boolean => {
    if (error instanceof StudentSummaryValidationError) {
      context.logger.warn("Student insights request rejected.", {
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
  service: "StudentInsightsApi",
});

export const handleStudentInsightsRequest = createStudentInsightsHandler({
  getInsights: studentSummaryService.getInsights.bind(studentSummaryService),
  verifyIdToken: (idToken: string) =>
    getFirebaseAdminApp().auth().verifyIdToken(idToken, true),
});
