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
  StudentSummaryValidationError,
  StudentTestsRequest,
  StudentTestsSuccessResponse,
} from "../types/studentSummary";
import {MiddlewareRequest} from "../types/middleware";
import {getFirebaseAdminApp} from "../utils/firebaseAdmin";

interface StudentTestsDependencies {
  listTests: typeof studentSummaryService.listTests;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

export const createStudentTestsHandler = (
  dependencies: StudentTestsDependencies,
) => createMiddlewareHandler({
  controller: async (
    request: MiddlewareRequest,
    response: functions.Response,
  ): Promise<void> => {
    const result = await dependencies.listTests(
      request.context.requestData as unknown as StudentTestsRequest,
    );
    const responseBody: StudentTestsSuccessResponse = {
      code: "OK",
      data: result,
      message: "Student tests loaded.",
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
          studentSummaryService.normalizeTestsRequest({
            instituteId: identity?.instituteId,
            licenseLayer: identity?.licenseLayer,
            page: request.query.page,
            pageSize: request.query.pageSize,
            status: request.query.status,
            studentId: identity?.studentId,
          }) as unknown as Record<string, unknown>,
        );
      },
    }),
  ],
  onError: (error, context): boolean => {
    if (error instanceof StudentSummaryValidationError) {
      context.logger.warn("Student tests request rejected.", {
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
  service: "StudentTestsApi",
});

export const handleStudentTestsRequest = createStudentTestsHandler({
  listTests: studentSummaryService.listTests.bind(studentSummaryService),
  verifyIdToken: (idToken: string) =>
    getFirebaseAdminApp().auth().verifyIdToken(idToken, true),
});
