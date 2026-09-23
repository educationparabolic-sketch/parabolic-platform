import * as functions from "firebase-functions";
import {DecodedIdToken} from "firebase-admin/auth";
import type {
  AdminInterventionOutcomeUpdateRequest,
  AdminInterventionRecommendationCreateRequest,
} from "../../../shared/contracts/apiDtos";
import {createAuthenticationMiddleware} from "../middleware/auth";
import {
  createCapabilityAuthorizationMiddleware,
} from "../middleware/capability";
import {
  createMiddlewareHandler,
  createRequestValidationMiddleware,
  setRequestData,
} from "../middleware/framework";
import {createRoleAuthorizationMiddleware} from "../middleware/role";
import {createTenantGuardMiddleware} from "../middleware/tenant";
import {sendErrorResponse} from "../services/apiResponse";
import {
  interventionRecommendationService,
} from "../services/interventionRecommendations";
import {
  AdminInterventionOutcomeUpdateValidatedRequest,
  AdminInterventionRecommendationCreateValidatedRequest,
  AdminInterventionRecommendationValidationError,
  AdminInterventionTimelineValidatedRequest,
} from "../types/adminGovernanceInterventions";
import {MiddlewareRequest} from "../types/middleware";
import {getFirebaseAdminApp} from "../utils/firebaseAdmin";

interface Dependencies {
  createRecommendation:
    typeof interventionRecommendationService.createRecommendation;
  listTimeline: typeof interventionRecommendationService.listTimeline;
  updateOutcome: typeof interventionRecommendationService.updateOutcome;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

const queryString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const queryNumber = (value: unknown): number | undefined => {
  const normalized = queryString(value);
  return normalized === undefined ? undefined : Number(normalized);
};

const actorContext = (request: MiddlewareRequest) => ({
  actorId: request.context.identity?.uid,
  actorRole: request.context.identity?.role,
  instituteId: request.context.identity?.instituteId ?? undefined,
  ipAddress: request.ip,
  userAgent: request.get("user-agent"),
});

function success<T>(data: T, message: string, requestId: string) {
  return {
    code: "OK" as const,
    data,
    message,
    requestId,
    success: true as const,
    timestamp: new Date().toISOString(),
  };
}

const commonMiddlewares = (dependencies: Dependencies) => [
  createAuthenticationMiddleware(dependencies),
  createTenantGuardMiddleware({
    allowVendorBypass: false,
    resolveRequestInstituteId: (request: MiddlewareRequest) =>
      request.context.identity?.instituteId,
  }),
];

export const createAdminInterventionTimelineHandler = (
  dependencies: Dependencies,
) => createMiddlewareHandler({
  controller: async (request, response: functions.Response): Promise<void> => {
    const validated = request.context.requestData as unknown as
      AdminInterventionTimelineValidatedRequest;
    response.status(200).json(success(
      await dependencies.listTimeline(validated),
      "Intervention recommendation timeline loaded.",
      request.context.requestId,
    ));
  },
  middlewares: [
    ...commonMiddlewares(dependencies),
    createRoleAuthorizationMiddleware({
      allowedRoles: ["teacher", "admin", "director"],
      forbiddenMessage: "Role cannot read intervention recommendations.",
    }),
    createCapabilityAuthorizationMiddleware({
      minimumLicenseLayer: "L1",
      requiredFeatureFlag: "riskOverview",
      roleMinimumLicenseLayers: {director: "L3"},
    }),
    createRequestValidationMiddleware({
      validator: (request): void => {
        setRequestData(request, interventionRecommendationService
          .normalizeTimelineRequest({
            ...actorContext(request),
            cursor: queryString(request.query.cursor),
            limit: queryNumber(request.query.limit),
            studentId: queryString(request.query.studentId),
            yearId: queryString(request.query.yearId),
          }) as unknown as Record<string, unknown>);
      },
    }),
  ],
  onError: handleValidationError,
  service: "AdminInterventionTimelineApi",
});

type MutationData =
  | {operation: "create"; request: AdminInterventionRecommendationCreateValidatedRequest}
  | {operation: "outcome"; request: AdminInterventionOutcomeUpdateValidatedRequest};

export const createAdminInterventionMutationHandler = (
  dependencies: Dependencies,
) => createMiddlewareHandler({
  controller: async (request, response: functions.Response): Promise<void> => {
    const data = request.context.requestData as unknown as MutationData;
    const result = data.operation === "create" ?
      await dependencies.createRecommendation(data.request) :
      await dependencies.updateOutcome(data.request);
    response.status(200).json(success(
      result,
      data.operation === "create" ?
        "Intervention recommendation created." :
        "Intervention outcome updated.",
      request.context.requestId,
    ));
  },
  middlewares: [
    ...commonMiddlewares(dependencies),
    createRoleAuthorizationMiddleware({
      allowedRoles: ["teacher", "admin"],
      forbiddenMessage: "Only teacher and admin roles can mutate interventions.",
    }),
    createCapabilityAuthorizationMiddleware({
      minimumLicenseLayer: "L1",
      requiredFeatureFlag: "riskOverview",
    }),
    createRequestValidationMiddleware({
      validator: (request): void => {
        const path = request.path.replace(/^\/api\/v1/u, "");
        let data: MutationData;
        if (request.method === "POST" &&
          path === "/admin/interventions/recommendations") {
          const body = (request.body ?? {}) as Partial<
            AdminInterventionRecommendationCreateRequest
          >;
          data = {operation: "create", request: interventionRecommendationService
            .normalizeCreateRequest({...body, ...actorContext(request)})};
        } else if (request.method === "PATCH" &&
          request.params.interventionId && path.endsWith("/outcome")) {
          const body = (request.body ?? {}) as Partial<
            AdminInterventionOutcomeUpdateRequest
          >;
          data = {operation: "outcome", request: interventionRecommendationService
            .normalizeOutcomeRequest({
              ...body,
              ...actorContext(request),
              interventionId: queryString(request.params.interventionId),
            })};
        } else {
          throw new AdminInterventionRecommendationValidationError(
            "VALIDATION_ERROR",
            "Request does not match a supported intervention mutation route.",
          );
        }
        setRequestData(request, data as unknown as Record<string, unknown>);
      },
    }),
  ],
  onError: handleValidationError,
  service: "AdminInterventionMutationApi",
});

function handleValidationError(
  error: unknown,
  context: {
    response: functions.Response;
    requestId: string;
  },
): boolean {
  if (!(error instanceof AdminInterventionRecommendationValidationError)) {
    return false;
  }
  sendErrorResponse(
    context.response,
    context.requestId,
    error.code,
    error.message,
  );
  return true;
}

const dependencies: Dependencies = {
  createRecommendation:
    interventionRecommendationService.createRecommendation.bind(
      interventionRecommendationService,
    ),
  listTimeline: interventionRecommendationService.listTimeline.bind(
    interventionRecommendationService,
  ),
  updateOutcome: interventionRecommendationService.updateOutcome.bind(
    interventionRecommendationService,
  ),
  verifyIdToken: (idToken) =>
    getFirebaseAdminApp().auth().verifyIdToken(idToken, true),
};

export const handleAdminInterventionTimelineRequest =
  createAdminInterventionTimelineHandler(dependencies);

export const handleAdminInterventionMutationRequest =
  createAdminInterventionMutationHandler(dependencies);
