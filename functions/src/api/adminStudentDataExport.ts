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
import {studentDataExportService} from "../services/studentDataExport";
import {
  StudentDataExportRequest,
  StudentDataExportSuccessResponse,
  StudentDataExportValidatedRequest,
  StudentDataExportValidationError,
} from "../types/studentDataExport";
import {MiddlewareRequest} from "../types/middleware";

interface AdminStudentDataExportDependencies {
  generateExport: typeof studentDataExportService.generateExport;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

const buildSuccessResponse = (
  result: Awaited<ReturnType<typeof studentDataExportService.generateExport>>,
  requestId: string,
  timestamp: string,
): StudentDataExportSuccessResponse => ({
  code: "OK",
  data: result,
  message: "Student data export generated.",
  requestId,
  success: true,
  timestamp,
});

export const createAdminStudentDataExportHandler = (
  dependencies: AdminStudentDataExportDependencies,
) => createMiddlewareHandler({
  controller: async (
    request: MiddlewareRequest,
    response: functions.Response,
  ): Promise<void> => {
    const validatedRequest = request.context
      .requestData as unknown as StudentDataExportValidatedRequest;
    const result = await dependencies.generateExport(validatedRequest);

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
        const body = (request.body ?? {}) as StudentDataExportRequest;

        return typeof body.instituteId === "string" ?
          body.instituteId :
          null;
      },
    }),
    createRoleAuthorizationMiddleware({
      allowedRoles: ["admin", "director", "vendor"],
      forbiddenMessage:
        "Only admin, director, and vendor roles can approve data exports.",
    }),
    createRequestValidationMiddleware({
      validator: (request: MiddlewareRequest): void => {
        const body = (request.body ?? {}) as Partial<StudentDataExportRequest>;
        const identity = request.context.identity;
        const validatedRequest = studentDataExportService.normalizeRequest({
          actorId: identity?.uid,
          actorRole: identity?.role,
          includeAiSummaries: body.includeAiSummaries,
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
    if (error instanceof StudentDataExportValidationError) {
      context.logger.warn("Student data export request rejected.", {
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
  service: "AdminStudentDataExportApi",
});

export const handleAdminStudentDataExportRequest =
  createAdminStudentDataExportHandler({
    generateExport: studentDataExportService.generateExport.bind(
      studentDataExportService,
    ),
    verifyIdToken: (idToken: string) =>
      getFirebaseAdminApp().auth().verifyIdToken(idToken),
  });

export {buildSuccessResponse};
