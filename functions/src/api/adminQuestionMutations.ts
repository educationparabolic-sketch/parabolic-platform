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
import {adminQuestionMutationsService} from "../services/adminQuestionMutations";
import {
  AdminQuestionBankValidationError,
  AdminQuestionLifecycleValidatedRequest,
  AdminQuestionMetadataUpdateValidatedRequest,
  AdminQuestionStructureUpdateValidatedRequest,
  AdminQuestionVersionCreateValidatedRequest,
} from "../types/adminQuestionBank";
import {StandardApiSuccessResponse} from "../types/apiResponse";
import {MiddlewareRequest} from "../types/middleware";
import {getFirebaseAdminApp} from "../utils/firebaseAdmin";

type Operation = "lifecycle" | "metadata" | "structure" | "version";

type RequestData =
  | {operation: "lifecycle"; request: AdminQuestionLifecycleValidatedRequest}
  | {operation: "metadata"; request: AdminQuestionMetadataUpdateValidatedRequest}
  | {operation: "structure"; request: AdminQuestionStructureUpdateValidatedRequest}
  | {operation: "version"; request: AdminQuestionVersionCreateValidatedRequest};

interface Dependencies {
  createVersion: typeof adminQuestionMutationsService.createSuccessorVersion;
  updateLifecycle: typeof adminQuestionMutationsService.updateLifecycle;
  updateMetadata: typeof adminQuestionMutationsService.updateMetadata;
  updateStructure: typeof adminQuestionMutationsService.updateStructure;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

const resolveOperation = (request: MiddlewareRequest): Operation => {
  const path = request.path.replace(/^\/api\/v1/, "");
  if (typeof request.params.questionId !== "string") {
    throw new AdminQuestionBankValidationError(
      "VALIDATION_ERROR",
      "Question mutation route is missing its question identifier.",
    );
  }
  if (request.method === "PATCH" && path.endsWith("/metadata")) return "metadata";
  if (request.method === "PATCH" && path.endsWith("/structure")) return "structure";
  if (request.method === "POST" && path.endsWith("/versions")) return "version";
  if (request.method === "POST" && path.endsWith("/lifecycle")) return "lifecycle";
  throw new AdminQuestionBankValidationError(
    "VALIDATION_ERROR",
    "Request does not match a supported Question Bank mutation route.",
  );
};

const buildSuccessResponse = <TData>(
  data: TData,
  message: string,
  requestId: string,
): StandardApiSuccessResponse<TData> => ({
    code: "OK",
    data,
    message,
    requestId,
    success: true,
    timestamp: new Date().toISOString(),
  });

export const createAdminQuestionMutationsHandler = (
  dependencies: Dependencies,
) => createMiddlewareHandler({
  controller: async (request, response: functions.Response): Promise<void> => {
    const data = request.context.requestData as unknown as RequestData;
    let result: unknown;
    let message: string;
    switch (data.operation) {
    case "metadata":
      result = await dependencies.updateMetadata(data.request);
      message = "Question metadata updated.";
      break;
    case "structure":
      result = await dependencies.updateStructure(data.request);
      message = "Question structure updated.";
      break;
    case "version":
      result = await dependencies.createVersion(data.request);
      message = "Question successor version created.";
      break;
    case "lifecycle":
      result = await dependencies.updateLifecycle(data.request);
      message = "Question lifecycle updated.";
      break;
    }
    response.status(200).json(buildSuccessResponse(
      result,
      message,
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
      forbiddenMessage: "Only teacher and admin roles can mutate questions.",
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
          questionId: request.params.questionId,
          userAgent: request.get("user-agent"),
        };
        let data: RequestData;
        switch (operation) {
        case "metadata":
          data = {operation, request: adminQuestionMutationsService
            .normalizeMetadataUpdateRequest(input)};
          break;
        case "structure":
          data = {operation, request: adminQuestionMutationsService
            .normalizeStructureUpdateRequest(input)};
          break;
        case "version":
          data = {operation, request: adminQuestionMutationsService
            .normalizeVersionCreateRequest(input)};
          break;
        case "lifecycle":
          data = {operation, request: adminQuestionMutationsService
            .normalizeLifecycleRequest(input)};
          break;
        }
        setRequestData(request, data as unknown as Record<string, unknown>);
      },
    }),
  ],
  onError: (error, context): boolean => {
    if (!(error instanceof AdminQuestionBankValidationError)) return false;
    sendErrorResponse(
      context.response,
      context.requestId,
      error.code,
      error.message,
    );
    return true;
  },
  service: "AdminQuestionMutationsApi",
});

export const handleAdminQuestionMutationsRequest =
  createAdminQuestionMutationsHandler({
    createVersion: adminQuestionMutationsService.createSuccessorVersion.bind(
      adminQuestionMutationsService,
    ),
    updateLifecycle: adminQuestionMutationsService.updateLifecycle.bind(
      adminQuestionMutationsService,
    ),
    updateMetadata: adminQuestionMutationsService.updateMetadata.bind(
      adminQuestionMutationsService,
    ),
    updateStructure: adminQuestionMutationsService.updateStructure.bind(
      adminQuestionMutationsService,
    ),
    verifyIdToken: (idToken) =>
      getFirebaseAdminApp().auth().verifyIdToken(idToken, true),
  });

export {buildSuccessResponse, resolveOperation};
