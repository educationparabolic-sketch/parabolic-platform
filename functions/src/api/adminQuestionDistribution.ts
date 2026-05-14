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
import {adminQuestionDistributionService} from "../services/adminQuestionDistribution";
import {
  AdminQuestionDistributionSuccessResponse,
  AdminQuestionDistributionValidatedRequest,
  AdminQuestionDistributionValidationError,
} from "../types/adminQuestionDistribution";
import {MiddlewareRequest} from "../types/middleware";

interface AdminQuestionDistributionDependencies {
  getDistributionSummary:
    typeof adminQuestionDistributionService.getDistributionSummary;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

const buildSuccessResponse = (
  result: Awaited<
    ReturnType<typeof adminQuestionDistributionService.getDistributionSummary>
  >,
  requestId: string,
  timestamp: string,
): AdminQuestionDistributionSuccessResponse => ({
  code: "OK",
  data: {
    summary: result,
  },
  message: "Question distribution summary loaded.",
  requestId,
  success: true,
  timestamp,
});

export const createAdminQuestionDistributionHandler = (
  dependencies: AdminQuestionDistributionDependencies,
) => createMiddlewareHandler({
  controller: async (
    request: MiddlewareRequest,
    response: functions.Response,
  ): Promise<void> => {
    const validatedRequest = request.context
      .requestData as unknown as AdminQuestionDistributionValidatedRequest;
    const result =
      await dependencies.getDistributionSummary(validatedRequest);

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
      allowedRoles: ["admin"],
      forbiddenMessage:
        "Only admin roles can access question distribution summaries.",
    }),
    createRequestValidationMiddleware({
      validator: (request: MiddlewareRequest): void => {
        const identity = request.context.identity;
        const validatedRequest =
          adminQuestionDistributionService.normalizeRequest({
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
    if (error instanceof AdminQuestionDistributionValidationError) {
      context.logger.warn("Question distribution request rejected.", {
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
  service: "AdminQuestionDistributionApi",
});

export const handleAdminQuestionDistributionRequest =
  createAdminQuestionDistributionHandler({
    getDistributionSummary:
      adminQuestionDistributionService.getDistributionSummary.bind(
        adminQuestionDistributionService,
      ),
    verifyIdToken: (idToken: string) =>
      getFirebaseAdminApp().auth().verifyIdToken(idToken),
  });

export {buildSuccessResponse};
