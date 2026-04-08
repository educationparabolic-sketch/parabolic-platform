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
import {archivePipelineService} from "../services/archivePipeline";
import {
  AcademicYearArchiveRequest,
  AcademicYearArchiveSuccessResponse,
  AcademicYearArchiveValidatedRequest,
  AcademicYearArchiveValidationError,
} from "../types/archivePipeline";
import {MiddlewareRequest} from "../types/middleware";
import {systemEventTopologyService} from "../services/systemEventTopology";

interface AdminAcademicYearArchiveDependencies {
  archiveAcademicYear: typeof archivePipelineService.archiveAcademicYear;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

const buildSuccessResponse = (
  result: Awaited<
    ReturnType<typeof archivePipelineService.archiveAcademicYear>
  >,
  requestId: string,
  timestamp: string,
): AcademicYearArchiveSuccessResponse => ({
  code: "OK",
  data: result,
  message: "Academic year archived.",
  requestId,
  success: true,
  timestamp,
});

export const createAdminAcademicYearArchiveHandler = (
  dependencies: AdminAcademicYearArchiveDependencies,
) => createMiddlewareHandler({
  controller: async (
    request: MiddlewareRequest,
    response: functions.Response,
  ): Promise<void> => {
    const validatedRequest = request.context
      .requestData as unknown as AcademicYearArchiveValidatedRequest;
    const result = await systemEventTopologyService.executeEventHandler(
      "ArchiveTriggered",
      "adminAcademicYearArchive",
      {
        instituteId: validatedRequest.instituteId,
        requestId: request.context.requestId,
        yearId: validatedRequest.yearId,
      },
      async () => dependencies.archiveAcademicYear(validatedRequest),
    );

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
        const body = (request.body ?? {}) as AcademicYearArchiveRequest;

        return typeof body.instituteId === "string" ?
          body.instituteId :
          null;
      },
    }),
    createRoleAuthorizationMiddleware({
      allowedRoles: ["admin", "vendor"],
      forbiddenMessage:
        "Only admin and vendor roles can archive academic years.",
    }),
    createRequestValidationMiddleware({
      validator: (request: MiddlewareRequest): void => {
        const body = (request.body ?? {}) as Partial<
          AcademicYearArchiveRequest
        >;
        const identity = request.context.identity;

        const validatedRequest = archivePipelineService.normalizeRequest({
          actorId: identity?.uid,
          actorRole: identity?.role,
          doubleConfirm: body.doubleConfirm === true ? true : undefined,
          instituteId:
            identity?.isVendor ?
              body.instituteId :
              identity?.instituteId ?? body.instituteId,
          ipAddress: request.ip,
          isVendor: identity?.isVendor === true,
          userAgent: request.header("user-agent"),
          yearId: body.yearId,
        });

        setRequestData(
          request,
          validatedRequest as unknown as Record<string, unknown>,
        );
      },
    }),
  ],
  onError: (error, context): boolean => {
    if (error instanceof AcademicYearArchiveValidationError) {
      context.logger.warn("Academic year archive request rejected.", {
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
  service: "AdminAcademicYearArchiveApi",
});

export const handleAdminAcademicYearArchiveRequest =
  createAdminAcademicYearArchiveHandler({
    archiveAcademicYear:
      archivePipelineService.archiveAcademicYear.bind(archivePipelineService),
    verifyIdToken: (idToken: string) =>
      getFirebaseAdminApp().auth().verifyIdToken(idToken),
  });

export {buildSuccessResponse};
