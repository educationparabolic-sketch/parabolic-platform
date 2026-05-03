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
import {
  studentBulkIngestionService,
} from "../services/studentBulkIngestion";
import {
  StudentBulkIngestionRequest,
  StudentBulkIngestionSuccessResponse,
  StudentBulkIngestionValidatedRequest,
  StudentBulkIngestionValidationError,
} from "../types/studentBulkIngestion";
import {MiddlewareRequest} from "../types/middleware";

interface AdminStudentsBulkDependencies {
  ingestStudents: typeof studentBulkIngestionService.ingestStudents;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

const buildSuccessResponse = (
  result: Awaited<ReturnType<typeof studentBulkIngestionService.ingestStudents>>,
  requestId: string,
  timestamp: string,
): StudentBulkIngestionSuccessResponse => ({
  code: "OK",
  data: result,
  message:
    result.committed ?
      "Student bulk ingestion committed." :
      "Student bulk ingestion validated.",
  requestId,
  success: true,
  timestamp,
});

export const createAdminStudentsBulkHandler = (
  dependencies: AdminStudentsBulkDependencies,
) => createMiddlewareHandler({
  controller: async (
    request: MiddlewareRequest,
    response: functions.Response,
  ): Promise<void> => {
    const validatedRequest = request.context
      .requestData as unknown as StudentBulkIngestionValidatedRequest;
    const result = await dependencies.ingestStudents(validatedRequest);

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
      allowVendorBypass: false,
      resolveRequestInstituteId: (request): string | null => {
        const body = (request.body ?? {}) as StudentBulkIngestionRequest;
        return typeof body.instituteId === "string" ? body.instituteId : null;
      },
    }),
    createRoleAuthorizationMiddleware({
      allowedRoles: ["admin"],
      forbiddenMessage:
        "Only admin roles can run student bulk ingestion.",
    }),
    createRequestValidationMiddleware({
      validator: (request: MiddlewareRequest): void => {
        const body = (request.body ?? {}) as Partial<StudentBulkIngestionRequest>;
        const identity = request.context.identity;
        const validatedRequest = studentBulkIngestionService.normalizeRequest({
          actorId: identity?.uid,
          actorLicenseLayer: identity?.licenseLayer ?? undefined,
          actorRole: identity?.role,
          commit: body.commit,
          csvContent: body.csvContent,
          deactivateMissing: body.deactivateMissing,
          instituteId: identity?.instituteId ?? body.instituteId,
          ipAddress: request.ip,
          students: body.students,
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
    if (error instanceof StudentBulkIngestionValidationError) {
      context.logger.warn("Student bulk ingestion request rejected.", {
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
  service: "AdminStudentsBulkApi",
});

export const handleAdminStudentsBulkRequest =
  createAdminStudentsBulkHandler({
    ingestStudents: studentBulkIngestionService.ingestStudents.bind(
      studentBulkIngestionService,
    ),
    verifyIdToken: (idToken: string) =>
      getFirebaseAdminApp().auth().verifyIdToken(idToken),
  });

export {buildSuccessResponse};
