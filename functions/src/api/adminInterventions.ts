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
import {createLicenseEnforcementMiddleware} from "../middleware/license";
import {interventionToolsService} from "../services/interventionTools";
import {
  AdminInterventionRequest,
  AdminInterventionSuccessResponse,
  AdminInterventionValidatedRequest,
  AdminInterventionValidationError,
} from "../types/interventionTools";
import {MiddlewareRequest} from "../types/middleware";

interface AdminInterventionsHandlerDependencies {
  executeRequest: typeof interventionToolsService.executeRequest;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

const buildSuccessResponse = (
  result: Awaited<ReturnType<typeof interventionToolsService.executeRequest>>,
  requestId: string,
  timestamp: string,
): AdminInterventionSuccessResponse => ({
  code: "OK",
  data: result,
  message: "Admin intervention request processed.",
  requestId,
  success: true,
  timestamp,
});

export const createAdminInterventionsHandler = (
  dependencies: AdminInterventionsHandlerDependencies,
) => createMiddlewareHandler({
  controller: async (
    request: MiddlewareRequest,
    response: functions.Response,
  ): Promise<void> => {
    const validatedRequest = request.context
      .requestData as unknown as AdminInterventionValidatedRequest;
    const result = await dependencies.executeRequest(validatedRequest);

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
        const body = (request.body ?? {}) as AdminInterventionRequest;

        return typeof body.instituteId === "string" ?
          body.instituteId :
          null;
      },
    }),
    createRoleAuthorizationMiddleware({
      allowedRoles: ["admin", "teacher"],
      forbiddenMessage:
        "Only admin and teacher roles can perform intervention actions.",
    }),
    createLicenseEnforcementMiddleware({
      requiredLayer: "L1",
      restrictionMessage:
        "Intervention tools require L1 or higher license access.",
    }),
    createRequestValidationMiddleware({
      validator: (request: MiddlewareRequest): void => {
        const body = (request.body ?? {}) as Partial<AdminInterventionRequest>;
        const identity = request.context.identity;

        const validatedRequest = interventionToolsService.normalizeRequest({
          actionType: body.actionType,
          actorId: identity?.uid,
          actorRole: identity?.role,
          alertMessage: body.alertMessage,
          instituteId: identity?.instituteId ?? body.instituteId,
          ipAddress: request.ip,
          limit: body.limit,
          outcomeNotes: body.outcomeNotes,
          outcomeStatus: body.outcomeStatus,
          remedialTestId: body.remedialTestId,
          studentId: body.studentId,
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
    if (error instanceof AdminInterventionValidationError) {
      context.logger.warn("Intervention request rejected.", {
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
  service: "AdminInterventionsApi",
});

export const handleAdminInterventionsRequest =
  createAdminInterventionsHandler({
    executeRequest: interventionToolsService.executeRequest.bind(
      interventionToolsService,
    ),
    verifyIdToken: (idToken: string) =>
      getFirebaseAdminApp().auth().verifyIdToken(idToken),
  });

export {buildSuccessResponse};
