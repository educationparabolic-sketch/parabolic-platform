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
import {adminStudentsService} from "../services/adminStudents";
import {
  AdminStudentsSuccessResponse,
  AdminStudentsValidatedRequest,
  AdminStudentsValidationError,
} from "../types/adminStudents";
import {MiddlewareRequest} from "../types/middleware";

interface AdminStudentsDependencies {
  listStudents: typeof adminStudentsService.listStudents;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

const buildSuccessResponse = (
  result: Awaited<ReturnType<typeof adminStudentsService.listStudents>>,
  requestId: string,
  timestamp: string,
): AdminStudentsSuccessResponse => ({
  code: "OK",
  data: result,
  message: "Students loaded.",
  requestId,
  students: result.students,
  success: true,
  timestamp,
});

export const createAdminStudentsHandler = (
  dependencies: AdminStudentsDependencies,
) => createMiddlewareHandler({
  controller: async (
    request: MiddlewareRequest,
    response: functions.Response,
  ): Promise<void> => {
    const validatedRequest = request.context
      .requestData as unknown as AdminStudentsValidatedRequest;
    const result = await dependencies.listStudents(validatedRequest);

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
      allowedRoles: ["admin", "director"],
      forbiddenMessage:
        "Only admin and director roles can access student summaries.",
    }),
    createRequestValidationMiddleware({
      validator: (request: MiddlewareRequest): void => {
        const identity = request.context.identity;
        const validatedRequest = adminStudentsService.normalizeRequest({
          actorId: identity?.uid,
          actorRole: identity?.role,
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
    if (error instanceof AdminStudentsValidationError) {
      context.logger.warn("Admin students request rejected.", {
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
  service: "AdminStudentsApi",
});

export const handleAdminStudentsRequest = createAdminStudentsHandler({
  listStudents: adminStudentsService.listStudents.bind(adminStudentsService),
  verifyIdToken: (idToken: string) =>
    getFirebaseAdminApp().auth().verifyIdToken(idToken),
});

export {buildSuccessResponse};
