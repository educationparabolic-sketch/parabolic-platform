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
import {studentSoftDeleteService} from "../services/studentSoftDelete";
import {
  StudentSoftDeleteRequest,
  StudentSoftDeleteSuccessResponse,
  StudentSoftDeleteValidatedRequest,
  StudentSoftDeleteValidationError,
} from "../types/studentSoftDelete";
import {MiddlewareRequest} from "../types/middleware";

interface AdminStudentSoftDeleteDependencies {
  softDeleteStudent: typeof studentSoftDeleteService.softDeleteStudent;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

const buildSuccessResponse = (
  result: Awaited<
    ReturnType<typeof studentSoftDeleteService.softDeleteStudent>
  >,
  requestId: string,
  timestamp: string,
): StudentSoftDeleteSuccessResponse => ({
  code: "OK",
  data: result,
  message: "Student record soft-deleted.",
  requestId,
  success: true,
  timestamp,
});

export const createAdminStudentSoftDeleteHandler = (
  dependencies: AdminStudentSoftDeleteDependencies,
) => createMiddlewareHandler({
  controller: async (
    request: MiddlewareRequest,
    response: functions.Response,
  ): Promise<void> => {
    const validatedRequest = request.context
      .requestData as unknown as StudentSoftDeleteValidatedRequest;
    const result = await dependencies.softDeleteStudent(validatedRequest);

    response.status(200).json(
      buildSuccessResponse(
        result,
        request.context.requestId,
        new Date().toISOString(),
      ),
    );
  },
  middlewares: [
    createMethodMiddleware("POST"),
    createAuthenticationMiddleware(dependencies),
    createTenantGuardMiddleware({
      resolveRequestInstituteId: (request): string | null => {
        const body = (request.body ?? {}) as StudentSoftDeleteRequest;

        return typeof body.instituteId === "string" ?
          body.instituteId :
          null;
      },
    }),
    createRoleAuthorizationMiddleware({
      allowedRoles: ["admin", "vendor"],
      forbiddenMessage:
        "Only admin and vendor roles can soft-delete student records.",
    }),
    createRequestValidationMiddleware({
      validator: (request: MiddlewareRequest): void => {
        const body = (request.body ?? {}) as Partial<StudentSoftDeleteRequest>;
        const identity = request.context.identity;
        const validatedRequest = studentSoftDeleteService.normalizeRequest({
          actorId: identity?.uid,
          actorRole: identity?.role,
          instituteId:
            identity?.isVendor ?
              body.instituteId :
              identity?.instituteId ?? body.instituteId,
          ipAddress: request.ip,
          studentId: body.studentId,
          userAgent: request.header("user-agent"),
        });

        setRequestData(
          request,
          validatedRequest as unknown as Record<string, unknown>,
        );
      },
    }),
  ],
  onError: (error, context): boolean => {
    if (error instanceof StudentSoftDeleteValidationError) {
      context.logger.warn("Student soft-delete request rejected.", {
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
  service: "AdminStudentSoftDeleteApi",
});

export const handleAdminStudentSoftDeleteRequest =
  createAdminStudentSoftDeleteHandler({
    softDeleteStudent: studentSoftDeleteService.softDeleteStudent.bind(
      studentSoftDeleteService,
    ),
    verifyIdToken: (idToken: string) =>
      getFirebaseAdminApp().auth().verifyIdToken(idToken),
  });

export {buildSuccessResponse};
