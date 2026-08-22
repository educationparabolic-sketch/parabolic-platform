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
import {ADMIN_TEACHER_ROLES} from "../policy/adminRolePolicy";
import {createTenantGuardMiddleware} from "../middleware/tenant";
import {
  questionAssetUploadService,
} from "../services/questionAssetUpload";
import {
  QuestionAssetUploadResult,
  QuestionAssetUploadRequest,
  QuestionAssetUploadSuccessResponse,
  QuestionAssetUploadValidatedRequest,
  QuestionAssetUploadValidationError,
} from "../types/questionAssetUpload";
import {MiddlewareRequest} from "../types/middleware";

interface AdminQuestionAssetsDependencies {
  uploadAsset: typeof questionAssetUploadService.uploadAsset;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

const buildSuccessResponse = (
  result: Awaited<ReturnType<typeof questionAssetUploadService.uploadAsset>>,
  requestId: string,
  timestamp: string,
): QuestionAssetUploadSuccessResponse => {
  const publicResult: QuestionAssetUploadResult = {
    assetKind: result.assetKind,
    cdnPath: result.cdnPath,
    contentType: result.contentType,
    previewSignedUrl: result.previewSignedUrl,
    questionId: result.questionId,
    uploaded: true,
    version: result.version,
  };

  return {
    code: "OK",
    data: publicResult,
    message: "Question asset uploaded.",
    requestId,
    success: true,
    timestamp,
  };
};

export const createAdminQuestionAssetsHandler = (
  dependencies: AdminQuestionAssetsDependencies,
) => createMiddlewareHandler({
  controller: async (
    request: MiddlewareRequest,
    response: functions.Response,
  ): Promise<void> => {
    const validatedRequest = request.context
      .requestData as unknown as QuestionAssetUploadValidatedRequest;
    const result = await dependencies.uploadAsset(validatedRequest);

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
        const body = (request.body ?? {}) as QuestionAssetUploadRequest;
        return typeof body.instituteId === "string" ? body.instituteId : null;
      },
    }),
    createRoleAuthorizationMiddleware({
      allowedRoles: ADMIN_TEACHER_ROLES,
      forbiddenMessage:
        "Only teacher and admin roles can upload question assets.",
    }),
    createRequestValidationMiddleware({
      validator: (request: MiddlewareRequest): void => {
        const body = (request.body ?? {}) as Partial<QuestionAssetUploadRequest>;
        const identity = request.context.identity;
        const validatedRequest = questionAssetUploadService.normalizeRequest({
          actorId: identity?.uid,
          actorLicenseLayer: identity?.licenseLayer ?? undefined,
          actorRole: identity?.role,
          assetKind: body.assetKind,
          contentBase64: body.contentBase64,
          extension: body.extension,
          instituteId: identity?.instituteId ?? body.instituteId,
          ipAddress: request.ip,
          questionId: body.questionId,
          userAgent: request.header("user-agent"),
          version: body.version,
        });

        setRequestData(
          request,
          validatedRequest as unknown as Record<string, unknown>,
        );
      },
    }),
  ],
  onError: (error, context): boolean => {
    if (error instanceof QuestionAssetUploadValidationError) {
      context.logger.warn("Question asset upload request rejected.", {
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
  service: "AdminQuestionAssetsApi",
});

export const handleAdminQuestionAssetsRequest =
  createAdminQuestionAssetsHandler({
    uploadAsset: questionAssetUploadService.uploadAsset.bind(
      questionAssetUploadService,
    ),
    verifyIdToken: (idToken: string) =>
      getFirebaseAdminApp().auth().verifyIdToken(idToken, true),
  });

export {buildSuccessResponse};
