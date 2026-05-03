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
  questionBulkUploadService,
} from "../services/questionBulkUpload";
import {
  QuestionBulkUploadRequest,
  QuestionBulkUploadSuccessResponse,
  QuestionBulkUploadValidatedRequest,
  QuestionBulkUploadValidationError,
} from "../types/questionBulkUpload";
import {MiddlewareRequest} from "../types/middleware";

interface AdminQuestionsBulkDependencies {
  ingestQuestions: typeof questionBulkUploadService.ingestQuestions;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

const buildSuccessResponse = (
  result: Awaited<ReturnType<typeof questionBulkUploadService.ingestQuestions>>,
  requestId: string,
  timestamp: string,
): QuestionBulkUploadSuccessResponse => ({
  code: "OK",
  data: result,
  message:
    result.committed ?
      "Question bulk upload committed." :
      "Question bulk upload validated.",
  requestId,
  success: true,
  timestamp,
});

export const createAdminQuestionsBulkHandler = (
  dependencies: AdminQuestionsBulkDependencies,
) => createMiddlewareHandler({
  controller: async (
    request: MiddlewareRequest,
    response: functions.Response,
  ): Promise<void> => {
    const validatedRequest = request.context
      .requestData as unknown as QuestionBulkUploadValidatedRequest;
    const result = await dependencies.ingestQuestions(validatedRequest);

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
        const body = (request.body ?? {}) as QuestionBulkUploadRequest;
        return typeof body.instituteId === "string" ? body.instituteId : null;
      },
    }),
    createRoleAuthorizationMiddleware({
      allowedRoles: ["admin"],
      forbiddenMessage:
        "Only admin roles can run question bulk upload.",
    }),
    createRequestValidationMiddleware({
      validator: (request: MiddlewareRequest): void => {
        const body = (request.body ?? {}) as Partial<QuestionBulkUploadRequest>;
        const identity = request.context.identity;
        const validatedRequest = questionBulkUploadService.normalizeRequest({
          actorId: identity?.uid,
          actorLicenseLayer: identity?.licenseLayer ?? undefined,
          actorRole: identity?.role,
          commit: body.commit,
          csvContent: body.csvContent,
          instituteId: identity?.instituteId ?? body.instituteId,
          ipAddress: request.ip,
          questions: body.questions,
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
    if (error instanceof QuestionBulkUploadValidationError) {
      context.logger.warn("Question bulk upload request rejected.", {
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
  service: "AdminQuestionsBulkApi",
});

export const handleAdminQuestionsBulkRequest =
  createAdminQuestionsBulkHandler({
    ingestQuestions: questionBulkUploadService.ingestQuestions.bind(
      questionBulkUploadService,
    ),
    verifyIdToken: (idToken: string) =>
      getFirebaseAdminApp().auth().verifyIdToken(idToken),
  });

export {buildSuccessResponse};
