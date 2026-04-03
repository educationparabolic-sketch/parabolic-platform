import * as functions from "firebase-functions";
import {DecodedIdToken} from "firebase-admin/auth";
import {sendErrorResponse} from "../services/apiResponse";
import {getFirebaseAdminApp} from "../utils/firebaseAdmin";
import {createAuthenticationMiddleware} from "../middleware/auth";
import {createGovernanceAccessMiddleware} from "../middleware/governanceAccess";
import {
  createMethodMiddleware,
  createMiddlewareHandler,
  createRequestValidationMiddleware,
  setRequestData,
} from "../middleware/framework";
import {createRoleAuthorizationMiddleware} from "../middleware/role";
import {createTenantGuardMiddleware} from "../middleware/tenant";
import {
  governanceSnapshotAccessService,
} from "../services/governanceSnapshotAccess";
import {
  GovernanceSnapshotAccessRequest,
  GovernanceSnapshotAccessSuccessResponse,
  GovernanceSnapshotAccessValidatedRequest,
  GovernanceSnapshotAccessValidationError,
} from "../types/governanceAccess";
import {MiddlewareRequest} from "../types/middleware";

interface GovernanceSnapshotsHandlerDependencies {
  readSnapshots: typeof governanceSnapshotAccessService.readSnapshots;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

const buildSuccessResponse = (
  result: Awaited<
    ReturnType<typeof governanceSnapshotAccessService.readSnapshots>
  >,
  requestId: string,
  timestamp: string,
): GovernanceSnapshotAccessSuccessResponse => ({
  code: "OK",
  data: result,
  message: "Governance snapshots retrieved.",
  requestId,
  success: true,
  timestamp,
});

export const createAdminGovernanceSnapshotsHandler = (
  dependencies: GovernanceSnapshotsHandlerDependencies,
) => createMiddlewareHandler({
  controller: async (
    request: MiddlewareRequest,
    response: functions.Response,
  ): Promise<void> => {
    const validatedRequest = request.context
      .requestData as unknown as GovernanceSnapshotAccessValidatedRequest;
    const result = await dependencies.readSnapshots(validatedRequest);

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
        const body = (request.body ?? {}) as GovernanceSnapshotAccessRequest;

        return typeof body.instituteId === "string" ?
          body.instituteId :
          null;
      },
    }),
    createRoleAuthorizationMiddleware({
      allowedRoles: ["director", "vendor"],
      forbiddenMessage:
        "Only director and vendor roles can access governance snapshots.",
    }),
    createGovernanceAccessMiddleware(),
    createRequestValidationMiddleware({
      validator: (request: MiddlewareRequest): void => {
        const body = (request.body ?? {}) as Partial<
          GovernanceSnapshotAccessValidatedRequest
        >;
        const validatedRequest =
          governanceSnapshotAccessService.normalizeRequest({
            instituteId:
              request.context.identity?.isVendor ?
                body.instituteId :
                request.context.identity?.instituteId ?? body.instituteId,
            limit: body.limit,
            month: body.month,
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
    if (error instanceof GovernanceSnapshotAccessValidationError) {
      context.logger.warn("Governance snapshot request rejected.", {
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
  service: "AdminGovernanceSnapshotsApi",
});

export const handleAdminGovernanceSnapshotsRequest =
  createAdminGovernanceSnapshotsHandler({
    readSnapshots: governanceSnapshotAccessService.readSnapshots.bind(
      governanceSnapshotAccessService,
    ),
    verifyIdToken: (idToken: string) =>
      getFirebaseAdminApp().auth().verifyIdToken(idToken),
  });

export {buildSuccessResponse};
