import * as functions from "firebase-functions";
import {DecodedIdToken} from "firebase-admin/auth";
import {sendErrorResponse} from "../services/apiResponse";
import {getFirebaseAdminApp} from "../utils/firebaseAdmin";
import {createAuthenticationMiddleware} from "../middleware/auth";
import {
  createMiddlewareHandler,
  createRequestValidationMiddleware,
  setRequestData,
} from "../middleware/framework";
import {createRoleAuthorizationMiddleware} from "../middleware/role";
import {createTenantGuardMiddleware} from "../middleware/tenant";
import {
  adminStudentMutationsService,
} from "../services/adminStudentMutations";
import {
  AdminStudentBatchAssignmentValidatedRequest,
  AdminStudentLifecycleUpdateValidatedRequest,
  AdminStudentMutationValidationError,
  AdminStudentPhotoReviewValidatedRequest,
  AdminStudentProfileUpdateValidatedRequest,
} from "../types/adminStudentMutations";
import {StandardApiSuccessResponse} from "../types/apiResponse";
import {MiddlewareRequest} from "../types/middleware";

type AdminStudentMutationOperation =
  | "batch-assignment"
  | "lifecycle-update"
  | "photo-review"
  | "profile-update";

type AdminStudentMutationRequestData =
  | {
    operation: "batch-assignment";
    request: AdminStudentBatchAssignmentValidatedRequest;
  }
  | {
    operation: "lifecycle-update";
    request: AdminStudentLifecycleUpdateValidatedRequest;
  }
  | {
    operation: "photo-review";
    request: AdminStudentPhotoReviewValidatedRequest;
  }
  | {
    operation: "profile-update";
    request: AdminStudentProfileUpdateValidatedRequest;
  };

interface AdminStudentMutationDependencies {
  assignBatch: typeof adminStudentMutationsService.assignBatch;
  reviewPhoto: typeof adminStudentMutationsService.reviewPhoto;
  updateLifecycle: typeof adminStudentMutationsService.updateLifecycle;
  updateProfile: typeof adminStudentMutationsService.updateProfile;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

const resolveOperation = (
  request: MiddlewareRequest,
): AdminStudentMutationOperation => {
  const path = request.path.replace(/^\/api\/v1/, "");

  if (
    request.method === "PATCH" &&
    path.endsWith("/profile") &&
    typeof request.params.studentId === "string"
  ) {
    return "profile-update";
  }
  if (
    request.method === "POST" &&
    path === "/admin/students/batch-assignment"
  ) {
    return "batch-assignment";
  }
  if (
    request.method === "POST" &&
    path.endsWith("/lifecycle") &&
    typeof request.params.studentId === "string"
  ) {
    return "lifecycle-update";
  }
  if (
    request.method === "POST" &&
    path.endsWith("/photo-review") &&
    typeof request.params.studentId === "string"
  ) {
    return "photo-review";
  }

  throw new AdminStudentMutationValidationError(
    "VALIDATION_ERROR",
    "Request does not match a supported Admin Student mutation route.",
  );
};

const buildSuccessResponse = <TData>(
  data: TData,
  message: string,
  requestId: string,
  timestamp: string,
): StandardApiSuccessResponse<TData> => ({
    code: "OK",
    data,
    message,
    requestId,
    success: true,
    timestamp,
  });

export const createAdminStudentMutationsHandler = (
  dependencies: AdminStudentMutationDependencies,
) => createMiddlewareHandler({
  controller: async (
    request: MiddlewareRequest,
    response: functions.Response,
  ): Promise<void> => {
    const requestData = request.context.requestData as unknown as
      AdminStudentMutationRequestData;
    let result: unknown;
    let message: string;

    switch (requestData.operation) {
    case "profile-update":
      result = await dependencies.updateProfile(requestData.request);
      message = "Student profile updated.";
      break;
    case "batch-assignment":
      result = await dependencies.assignBatch(requestData.request);
      message = "Student batch assignment applied.";
      break;
    case "lifecycle-update":
      result = await dependencies.updateLifecycle(requestData.request);
      message = "Student lifecycle updated.";
      break;
    case "photo-review":
      result = await dependencies.reviewPhoto(requestData.request);
      message = "Student photo review recorded.";
      break;
    }

    response.status(200).json(buildSuccessResponse(
      result,
      message,
      request.context.requestId,
      new Date().toISOString(),
    ));
  },
  middlewares: [
    createAuthenticationMiddleware(dependencies),
    createTenantGuardMiddleware({
      allowVendorBypass: false,
      resolveRequestInstituteId: (request): string | null =>
        request.context.identity?.instituteId ?? null,
    }),
    createRoleAuthorizationMiddleware({
      allowedRoles: ["admin"],
      forbiddenMessage: "Only admin roles can mutate Student records.",
    }),
    createRequestValidationMiddleware({
      validator: (request: MiddlewareRequest): void => {
        const identity = request.context.identity;
        const operation = resolveOperation(request);
        const commonInput = {
          actorId: identity?.uid,
          actorRole: identity?.role,
          body: request.body,
          instituteId: identity?.instituteId ?? undefined,
          ipAddress: request.ip,
          userAgent: request.header("user-agent"),
        };
        let requestData: AdminStudentMutationRequestData;

        switch (operation) {
        case "profile-update":
          requestData = {
            operation,
            request: adminStudentMutationsService
              .normalizeProfileUpdateRequest({
                ...commonInput,
                studentId: request.params.studentId,
              }),
          };
          break;
        case "batch-assignment":
          requestData = {
            operation,
            request: adminStudentMutationsService
              .normalizeBatchAssignmentRequest(commonInput),
          };
          break;
        case "lifecycle-update":
          requestData = {
            operation,
            request: adminStudentMutationsService
              .normalizeLifecycleUpdateRequest({
                ...commonInput,
                studentId: request.params.studentId,
              }),
          };
          break;
        case "photo-review":
          requestData = {
            operation,
            request: adminStudentMutationsService.normalizePhotoReviewRequest({
              ...commonInput,
              studentId: request.params.studentId,
            }),
          };
          break;
        }

        setRequestData(
          request,
          requestData as unknown as Record<string, unknown>,
        );
      },
    }),
  ],
  onError: (error, context): boolean => {
    if (error instanceof AdminStudentMutationValidationError) {
      context.logger.warn("Admin Student mutation request rejected.", {
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
  service: "AdminStudentMutationsApi",
});

export const handleAdminStudentMutationsRequest =
  createAdminStudentMutationsHandler({
    assignBatch: adminStudentMutationsService.assignBatch.bind(
      adminStudentMutationsService,
    ),
    reviewPhoto: adminStudentMutationsService.reviewPhoto.bind(
      adminStudentMutationsService,
    ),
    updateLifecycle: adminStudentMutationsService.updateLifecycle.bind(
      adminStudentMutationsService,
    ),
    updateProfile: adminStudentMutationsService.updateProfile.bind(
      adminStudentMutationsService,
    ),
    verifyIdToken: (idToken: string) =>
      getFirebaseAdminApp().auth().verifyIdToken(idToken, true),
  });

export {buildSuccessResponse, resolveOperation};
