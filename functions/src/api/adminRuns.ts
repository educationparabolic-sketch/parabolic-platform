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
import {adminRunsService} from "../services/adminRuns";
import {
  AdminRunsSuccessResponse,
  AdminRunsValidatedRequest,
  AdminRunsValidationError,
} from "../types/adminRuns";
import {MiddlewareRequest} from "../types/middleware";

interface AdminRunsDependencies {
  createRun: typeof adminRunsService.createRun;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

const buildSuccessResponse = (
  result: Awaited<ReturnType<typeof adminRunsService.createRun>>,
  requestId: string,
  timestamp: string,
): AdminRunsSuccessResponse => ({
  code: "OK",
  data: result,
  message: "Run scheduled.",
  requestId,
  runId: result.runId,
  success: true,
  timestamp,
});

export const createAdminRunsHandler = (
  dependencies: AdminRunsDependencies,
) => createMiddlewareHandler({
  controller: async (
    request: MiddlewareRequest,
    response: functions.Response,
  ): Promise<void> => {
    const validatedRequest = request.context
      .requestData as unknown as AdminRunsValidatedRequest;
    const result = await dependencies.createRun(validatedRequest);

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
      resolveRequestInstituteId: (request): string | null =>
        request.context.identity?.instituteId ?? null,
    }),
    createRoleAuthorizationMiddleware({
      allowedRoles: ["admin"],
      forbiddenMessage: "Only admin roles can schedule assignment runs.",
    }),
    createRequestValidationMiddleware({
      validator: (request: MiddlewareRequest): void => {
        const identity = request.context.identity;
        const validatedRequest = adminRunsService.normalizeRequest({
          actorId: identity?.uid,
          actorRole: identity?.role,
          body: request.body as Record<string, unknown>,
          instituteId: identity?.instituteId,
        });

        setRequestData(
          request,
          validatedRequest as unknown as Record<string, unknown>,
        );
      },
    }),
  ],
  onError: (error, context): boolean => {
    if (error instanceof AdminRunsValidationError) {
      context.logger.warn("Admin run scheduling request rejected.", {
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
  service: "AdminRunsApi",
});

export const handleAdminRunsRequest = createAdminRunsHandler({
  createRun: adminRunsService.createRun.bind(adminRunsService),
  verifyIdToken: (idToken: string) =>
    getFirebaseAdminApp().auth().verifyIdToken(idToken),
});

export {buildSuccessResponse};
