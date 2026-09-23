import * as functions from "firebase-functions";
import {DecodedIdToken} from "firebase-admin/auth";
import type {
  AdminGovernanceReportGenerateRequest,
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
  governanceReportArtifactService,
} from "../services/governanceReportArtifacts";
import {
  governanceSnapshotAccessService,
} from "../services/governanceSnapshotAccess";
import {
  AdminGovernanceReportDownloadValidatedRequest,
  AdminGovernanceReportGenerateValidatedRequest,
  AdminGovernanceReportListValidatedRequest,
  AdminGovernanceSnapshotListValidatedRequest,
} from "../types/adminGovernanceInterventions";
import {
  GovernanceReportArtifactValidationError,
} from "../types/governanceReportArtifacts";
import {
  GovernanceSnapshotAccessValidationError,
} from "../types/governanceAccess";
import {MiddlewareRequest, MiddlewareRejectionError} from "../types/middleware";
import {getFirebaseAdminApp} from "../utils/firebaseAdmin";

type Operation = "download" | "generate" | "list" | "snapshots";

type RequestData =
  | {operation: "download"; request: AdminGovernanceReportDownloadValidatedRequest}
  | {operation: "generate"; request: AdminGovernanceReportGenerateValidatedRequest}
  | {operation: "list"; request: AdminGovernanceReportListValidatedRequest}
  | {operation: "snapshots"; request: AdminGovernanceSnapshotListValidatedRequest};

interface Dependencies {
  createDownload: typeof governanceReportArtifactService.createDownload;
  generateReport: typeof governanceReportArtifactService.generateReportArtifact;
  listReports: typeof governanceReportArtifactService.listReports;
  readSnapshots: typeof governanceSnapshotAccessService.readSnapshots;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

const queryString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const queryNumber = (value: unknown): number | undefined => {
  const normalized = queryString(value);
  return normalized === undefined ? undefined : Number(normalized);
};

const resolveOperation = (request: MiddlewareRequest): Operation => {
  const path = request.path.replace(/^\/api\/v1/u, "");
  if (request.method === "GET" && path === "/admin/governance/snapshots") {
    return "snapshots";
  }
  if (request.method === "POST" && path === "/admin/governance/reports") {
    return "generate";
  }
  if (request.method === "GET" && path === "/admin/governance/reports") {
    return "list";
  }
  if (request.method === "GET" && request.params.reportId &&
    path.endsWith("/download")) {
    return "download";
  }
  throw new GovernanceReportArtifactValidationError(
    "VALIDATION_ERROR",
    "Request does not match a supported governance route.",
  );
};

const resolveInstituteId = (request: MiddlewareRequest): string => {
  const identity = request.context.identity;
  const targetInstituteId = queryString(request.query.targetInstituteId) ??
    (typeof request.body?.targetInstituteId === "string" ?
      request.body.targetInstituteId : undefined);
  if (identity?.isVendor) {
    if (!targetInstituteId?.trim()) {
      throw new MiddlewareRejectionError(
        "VALIDATION_ERROR",
        "Vendor governance requests require targetInstituteId.",
      );
    }
    return targetInstituteId.trim();
  }
  if (!identity?.instituteId) {
    throw new MiddlewareRejectionError(
      "TENANT_MISMATCH",
      "Authenticated identity is missing required instituteId claim.",
    );
  }
  return identity.instituteId;
};

function success<T>(
  data: T,
  message: string,
  requestId: string,
) {
  return {
    code: "OK" as const,
    data,
    message,
    requestId,
    success: true as const,
    timestamp: new Date().toISOString(),
  };
}

export const createAdminGovernanceTransportHandler = (
  dependencies: Dependencies,
) => createMiddlewareHandler({
  controller: async (request, response: functions.Response): Promise<void> => {
    const data = request.context.requestData as unknown as RequestData;
    if (data.operation === "snapshots") {
      response.status(200).json(success(
        await dependencies.readSnapshots(data.request),
        "Governance snapshots loaded.",
        request.context.requestId,
      ));
      return;
    }
    if (data.operation === "generate") {
      response.status(200).json(success(
        await dependencies.generateReport(data.request),
        "Governance report artifact generated.",
        request.context.requestId,
      ));
      return;
    }
    if (data.operation === "list") {
      response.status(200).json(success(
        await dependencies.listReports(data.request),
        "Governance reports loaded.",
        request.context.requestId,
      ));
      return;
    }
    response.status(200).json(success(
      await dependencies.createDownload(data.request),
      "Governance report download authorized.",
      request.context.requestId,
    ));
  },
  middlewares: [
    createAuthenticationMiddleware(dependencies),
    createTenantGuardMiddleware({
      allowVendorBypass: true,
      resolveRequestInstituteId: (request) =>
        request.context.identity?.instituteId,
    }),
    createRoleAuthorizationMiddleware({
      allowedRoles: ["director", "vendor"],
      forbiddenMessage:
        "Only director and vendor roles can access governance transport.",
    }),
    createCapabilityAuthorizationMiddleware({
      minimumLicenseLayer: "L3",
      requiredFeatureFlag: "governanceAccess",
      vendorBypass: true,
    }),
    createRequestValidationMiddleware({
      validator: (request): void => {
        const identity = request.context.identity;
        const operation = resolveOperation(request);
        const context = {
          actorId: identity?.uid,
          actorRole: identity?.role,
          instituteId: resolveInstituteId(request),
          ipAddress: request.ip,
          userAgent: request.get("user-agent"),
        };
        let data: RequestData;
        if (operation === "snapshots") {
          const normalized = governanceSnapshotAccessService.normalizeRequest({
            ...context,
            cursor: queryString(request.query.cursor),
            limit: queryNumber(request.query.limit),
            month: queryString(request.query.month),
            yearId: queryString(request.query.yearId),
          });
          data = {operation, request: {
            ...normalized,
            ...context,
          } as AdminGovernanceSnapshotListValidatedRequest};
        } else if (operation === "generate") {
          const body = (request.body ?? {}) as Partial<
            AdminGovernanceReportGenerateRequest
          >;
          data = {operation, request: governanceReportArtifactService
            .normalizeGenerateRequest({...body, ...context})};
        } else if (operation === "list") {
          data = {operation, request: governanceReportArtifactService
            .normalizeListRequest({
              ...context,
              cursor: queryString(request.query.cursor),
              limit: queryNumber(request.query.limit),
              yearId: queryString(request.query.yearId),
            })};
        } else {
          data = {operation, request: governanceReportArtifactService
            .normalizeDownloadRequest({
              ...context,
              reportId: queryString(request.params.reportId),
            })};
        }
        setRequestData(request, data as unknown as Record<string, unknown>);
      },
    }),
  ],
  onError: (error, context): boolean => {
    if (!(error instanceof GovernanceReportArtifactValidationError) &&
      !(error instanceof GovernanceSnapshotAccessValidationError)) {
      return false;
    }
    sendErrorResponse(
      context.response,
      context.requestId,
      error.code,
      error.message,
    );
    return true;
  },
  service: "AdminGovernanceTransportApi",
});

export const handleAdminGovernanceTransportRequest =
  createAdminGovernanceTransportHandler({
    createDownload: governanceReportArtifactService.createDownload.bind(
      governanceReportArtifactService,
    ),
    generateReport: governanceReportArtifactService.generateReportArtifact.bind(
      governanceReportArtifactService,
    ),
    listReports: governanceReportArtifactService.listReports.bind(
      governanceReportArtifactService,
    ),
    readSnapshots: governanceSnapshotAccessService.readSnapshots.bind(
      governanceSnapshotAccessService,
    ),
    verifyIdToken: (idToken) =>
      getFirebaseAdminApp().auth().verifyIdToken(idToken, true),
  });
