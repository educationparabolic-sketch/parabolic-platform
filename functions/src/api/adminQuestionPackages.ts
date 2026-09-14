import * as functions from "firebase-functions";
import {DecodedIdToken} from "firebase-admin/auth";
import {createAuthenticationMiddleware} from "../middleware/auth";
import {
  createMiddlewareHandler,
  createRequestValidationMiddleware,
  setRequestData,
} from "../middleware/framework";
import {createRoleAuthorizationMiddleware} from "../middleware/role";
import {createTenantGuardMiddleware} from "../middleware/tenant";
import {ADMIN_TEACHER_ROLES} from "../policy/adminRolePolicy";
import {sendErrorResponse} from "../services/apiResponse";
import {adminQuestionPackagesService} from "../services/adminQuestionPackages";
import {
  AdminQuestionBankValidationError,
  AdminQuestionPackageCommitValidatedRequest,
  AdminQuestionPackageRollbackValidatedRequest,
  AdminQuestionPackageValidateValidatedRequest,
} from "../types/adminQuestionBank";
import {StandardApiSuccessResponse} from "../types/apiResponse";
import {MiddlewareRequest} from "../types/middleware";
import {getFirebaseAdminApp} from "../utils/firebaseAdmin";

type RequestData =
  | {operation: "commit"; request: AdminQuestionPackageCommitValidatedRequest}
  | {operation: "rollback"; request: AdminQuestionPackageRollbackValidatedRequest}
  | {operation: "validate"; request: AdminQuestionPackageValidateValidatedRequest};

interface Dependencies {
  commitPackage: typeof adminQuestionPackagesService.commitPackage;
  rollbackPackage: typeof adminQuestionPackagesService.rollbackPackage;
  validatePackage: typeof adminQuestionPackagesService.validatePackage;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

const resolveOperation = (request: MiddlewareRequest): RequestData["operation"] => {
  const path = request.path.replace(/^\/api\/v1/, "");
  if (request.method !== "POST") {
    throw new AdminQuestionBankValidationError(
      "VALIDATION_ERROR", "Question package routes require POST.",
    );
  }
  if (path === "/admin/questions/packages/validate") return "validate";
  if (path.endsWith("/commit") && request.params.packageId) return "commit";
  if (path.endsWith("/rollback") && request.params.uploadLogId) return "rollback";
  throw new AdminQuestionBankValidationError(
    "VALIDATION_ERROR", "Request does not match a supported question package route.",
  );
};

const buildSuccessResponse = <TData>(
  data: TData,
  message: string,
  requestId: string,
): StandardApiSuccessResponse<TData> => ({
    code: "OK", data, message, requestId, success: true,
    timestamp: new Date().toISOString(),
  });

export const createAdminQuestionPackagesHandler = (
  dependencies: Dependencies,
) => createMiddlewareHandler({
  controller: async (request, response: functions.Response): Promise<void> => {
    const data = request.context.requestData as unknown as RequestData;
    const result = data.operation === "validate" ?
      await dependencies.validatePackage(data.request) :
      data.operation === "commit" ?
        await dependencies.commitPackage(data.request) :
        await dependencies.rollbackPackage(data.request);
    response.status(200).json(buildSuccessResponse(
      result,
      data.operation === "validate" ? "Question package validated." :
        data.operation === "commit" ? "Question package committed." :
          "Question package rolled back.",
      request.context.requestId,
    ));
  },
  middlewares: [
    createAuthenticationMiddleware(dependencies),
    createTenantGuardMiddleware({
      allowVendorBypass: false,
      resolveRequestInstituteId: (request) =>
        request.context.identity?.instituteId ?? null,
    }),
    createRoleAuthorizationMiddleware({
      allowedRoles: ADMIN_TEACHER_ROLES,
      forbiddenMessage: "Only teacher and admin roles can manage question packages.",
    }),
    createRequestValidationMiddleware({
      validator: (request): void => {
        const identity = request.context.identity;
        const operation = resolveOperation(request);
        const input = {
          actorId: identity?.uid,
          actorRole: identity?.role,
          body: request.body,
          instituteId: identity?.instituteId,
          ipAddress: request.ip,
          userAgent: request.get("user-agent"),
        };
        const data: RequestData = operation === "validate" ? {
          operation,
          request: adminQuestionPackagesService.normalizeValidateRequest(input),
        } : operation === "commit" ? {
          operation,
          request: adminQuestionPackagesService.normalizeCommitRequest({
            ...input, packageId: request.params.packageId,
          }),
        } : {
          operation,
          request: adminQuestionPackagesService.normalizeRollbackRequest({
            ...input, uploadLogId: request.params.uploadLogId,
          }),
        };
        setRequestData(request, data as unknown as Record<string, unknown>);
      },
    }),
  ],
  onError: (error, context): boolean => {
    if (!(error instanceof AdminQuestionBankValidationError)) return false;
    sendErrorResponse(context.response, context.requestId, error.code, error.message);
    return true;
  },
  service: "AdminQuestionPackagesApi",
});

export const handleAdminQuestionPackagesRequest =
  createAdminQuestionPackagesHandler({
    commitPackage: adminQuestionPackagesService.commitPackage.bind(
      adminQuestionPackagesService,
    ),
    rollbackPackage: adminQuestionPackagesService.rollbackPackage.bind(
      adminQuestionPackagesService,
    ),
    validatePackage: adminQuestionPackagesService.validatePackage.bind(
      adminQuestionPackagesService,
    ),
    verifyIdToken: (idToken) =>
      getFirebaseAdminApp().auth().verifyIdToken(idToken, true),
  });

export {buildSuccessResponse, resolveOperation};
