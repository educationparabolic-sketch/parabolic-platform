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
import {ADMIN_TEACHER_ROLES} from "../policy/adminRolePolicy";
import {createTenantGuardMiddleware} from "../middleware/tenant";
import {adminRunsService} from "../services/adminRuns";
import {
  AdminRunsSuccessResponse,
  AdminRunsDetailSuccessResponse,
  AdminRunsListSuccessResponse,
  AdminRunsValidatedRequest,
  AdminRunsValidationError,
} from "../types/adminRuns";
import {MiddlewareRejectionError, MiddlewareRequest} from "../types/middleware";

interface AdminRunsDependencies {
  createRun: typeof adminRunsService.createRun;
  getRun: typeof adminRunsService.getRun;
  listRuns: typeof adminRunsService.listRuns;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

type ValidatedAdminRunsRequest =
  | {action: "create"; payload: AdminRunsValidatedRequest}
  | {action: "detail"; payload: ReturnType<typeof adminRunsService.normalizeDetailRequest>}
  | {action: "list"; payload: ReturnType<typeof adminRunsService.normalizeListRequest>};

function assertSupportedMethod(method: string): void {
  if (method !== "GET" && method !== "POST") {
    throw new MiddlewareRejectionError(
      "VALIDATION_ERROR",
      "Method not allowed. Use GET or POST.",
    );
  }
}

const buildSuccessResponse = (
  result: Awaited<ReturnType<typeof adminRunsService.createRun>>,
  requestId: string,
  timestamp: string,
): AdminRunsSuccessResponse => ({
  code: "OK",
  data: result,
  message: result.disposition === "created" ?
    "Run scheduled." :
    "Existing scheduled run returned.",
  requestId,
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
      .requestData as unknown as ValidatedAdminRunsRequest;

    if (validatedRequest.action === "list") {
      const result = await dependencies.listRuns(validatedRequest.payload);
      const responseBody: AdminRunsListSuccessResponse = {
        code: "OK",
        data: result,
        message: "Runs loaded.",
        requestId: request.context.requestId,
        success: true,
        timestamp: new Date().toISOString(),
      };
      response.status(200).json(responseBody);
      return;
    }

    if (validatedRequest.action === "detail") {
      const result = await dependencies.getRun(validatedRequest.payload);
      const responseBody: AdminRunsDetailSuccessResponse = {
        code: "OK",
        data: result,
        message: "Run loaded.",
        requestId: request.context.requestId,
        success: true,
        timestamp: new Date().toISOString(),
      };
      response.status(200).json(responseBody);
      return;
    }

    const result = await dependencies.createRun(validatedRequest.payload);

    response.status(result.disposition === "created" ? 201 : 200).json(
      buildSuccessResponse(
        result,
        request.context.requestId,
        new Date().toISOString(),
      ),
    );
  },
  middlewares: [
    async (request, _response, next): Promise<void> => {
      assertSupportedMethod(request.method);
      await next();
    },
    createAuthenticationMiddleware(dependencies),
    createTenantGuardMiddleware({
      allowVendorBypass: false,
      resolveRequestInstituteId: (request): string | null =>
        request.context.identity?.instituteId ?? null,
    }),
    createRoleAuthorizationMiddleware({
      allowedRoles: ADMIN_TEACHER_ROLES,
      forbiddenMessage: "Only teacher and admin roles can access assignment runs.",
    }),
    createRequestValidationMiddleware({
      validator: (request: MiddlewareRequest): void => {
        const identity = request.context.identity;

        if (request.method === "GET") {
          if (request.params.runId) {
            setRequestData(request, {
              action: "detail",
              payload: adminRunsService.normalizeDetailRequest({
                instituteId: identity?.instituteId,
                runId: request.params.runId,
              }),
            });
            return;
          }

          setRequestData(request, {
            action: "list",
            payload: adminRunsService.normalizeListRequest({
              cursor: request.query.cursor,
              instituteId: identity?.instituteId,
              limit: request.query.limit,
              status: request.query.status,
            }),
          });
          return;
        }

        const validatedRequest = adminRunsService.normalizeRequest({
          actorId: identity?.uid,
          actorRole: identity?.role,
          body: request.body as Record<string, unknown>,
          instituteId: identity?.instituteId,
        });

        setRequestData(
          request,
          {
            action: "create",
            payload: validatedRequest,
          },
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
  getRun: adminRunsService.getRun.bind(adminRunsService),
  listRuns: adminRunsService.listRuns.bind(adminRunsService),
  verifyIdToken: (idToken: string) =>
    getFirebaseAdminApp().auth().verifyIdToken(idToken, true),
});

export {buildSuccessResponse};
