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
import {governanceReportingService} from "../services/governanceReporting";
import {
  GovernanceReportingRequest,
  GovernanceReportingSuccessResponse,
  GovernanceReportingValidatedRequest,
  GovernanceReportingValidationError,
} from "../types/governanceReporting";
import {MiddlewareRequest} from "../types/middleware";

interface GovernanceReportsHandlerDependencies {
  generateReport: typeof governanceReportingService.generateReport;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

const buildSuccessResponse = (
  result: Awaited<
    ReturnType<typeof governanceReportingService.generateReport>
  >,
  requestId: string,
  timestamp: string,
): GovernanceReportingSuccessResponse => ({
  code: "OK",
  data: result,
  message: "Governance report generated.",
  requestId,
  success: true,
  timestamp,
});

export const createAdminGovernanceReportsHandler = (
  dependencies: GovernanceReportsHandlerDependencies,
) => createMiddlewareHandler({
  controller: async (
    request: MiddlewareRequest,
    response: functions.Response,
  ): Promise<void> => {
    const validatedRequest = request.context
      .requestData as unknown as GovernanceReportingValidatedRequest;
    const result = await dependencies.generateReport(validatedRequest);

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
        const body = (request.body ?? {}) as GovernanceReportingRequest;

        return typeof body.instituteId === "string" ?
          body.instituteId :
          null;
      },
    }),
    createRoleAuthorizationMiddleware({
      allowedRoles: ["director", "vendor"],
      forbiddenMessage:
        "Only director and vendor roles can access governance reports.",
    }),
    createGovernanceAccessMiddleware(),
    createRequestValidationMiddleware({
      validator: (request: MiddlewareRequest): void => {
        const body = (request.body ?? {}) as Partial<
          GovernanceReportingValidatedRequest
        >;
        const validatedRequest = governanceReportingService.normalizeRequest({
          includePdfExport: body.includePdfExport,
          instituteId:
            request.context.identity?.isVendor ?
              body.instituteId :
              request.context.identity?.instituteId ?? body.instituteId,
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
    if (error instanceof GovernanceReportingValidationError) {
      context.logger.warn("Governance report request rejected.", {
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
  service: "AdminGovernanceReportsApi",
});

export const handleAdminGovernanceReportsRequest =
  createAdminGovernanceReportsHandler({
    generateReport: governanceReportingService.generateReport.bind(
      governanceReportingService,
    ),
    verifyIdToken: (idToken: string) =>
      getFirebaseAdminApp().auth().verifyIdToken(idToken),
  });

export {buildSuccessResponse};
