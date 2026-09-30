/* eslint-disable max-len */
import * as functions from "firebase-functions";
import {DecodedIdToken, UserRecord} from "firebase-admin/auth";
import type {VendorSupportTicketCommandRequest} from "../../../shared/contracts/adminSupport";
import {createAuthenticationMiddleware} from "../middleware/auth";
import {
  createMiddlewareHandler,
  createRequestValidationMiddleware,
  setRequestData,
} from "../middleware/framework";
import {createRoleAuthorizationMiddleware} from "../middleware/role";
import {buildSuccessResponse, sendErrorResponse} from "../services/apiResponse";
import {adminSupportService} from "../services/adminSupport";
import {
  AdminSupportValidationError,
  VendorSupportResolvedContext,
  VendorSupportValidatedOperation,
} from "../types/adminSupport";
import {MiddlewareRequest} from "../types/middleware";
import {getFirebaseAdminApp} from "../utils/firebaseAdmin";

interface VendorSupportDependencies {
  downloadVendorAttachment: typeof adminSupportService.downloadVendorAttachment;
  executeVendorCommand: typeof adminSupportService.executeVendorCommand;
  getUser: (userId: string) => Promise<UserRecord>;
  getVendorTicketDetail: typeof adminSupportService.getVendorTicketDetail;
  listVendorTickets: typeof adminSupportService.listVendorTickets;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

const queryString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const queryNumber = (input: unknown): number | undefined => {
  const value = queryString(input);
  return value === undefined ? undefined : Number(value);
};

const relativePath = (request: MiddlewareRequest): string =>
  request.path.replace(/^\/api\/v1/u, "");

const operatorContext = async (
  request: MiddlewareRequest,
  dependencies: VendorSupportDependencies,
): Promise<VendorSupportResolvedContext> => {
  const identity = request.context.identity;
  if (!identity || identity.role !== "vendor" || !identity.isVendor) {
    throw new AdminSupportValidationError("FORBIDDEN", "Vendor support authority is required.");
  }
  const user = await dependencies.getUser(identity.uid);
  const claims = user.customClaims ?? {};
  if (user.disabled || (claims.role !== "vendor" && claims.isVendor !== true)) {
    throw new AdminSupportValidationError("FORBIDDEN", "Current Vendor identity cannot operate support tickets.");
  }
  return {
    actorDisplayName: user.displayName?.trim() || user.email?.trim() || "Vendor Support",
    actorId: identity.uid,
    actorRole: "vendor",
    ipAddress: request.ip,
    userAgent: request.get("user-agent"),
  };
};

const messageFor = (operation: VendorSupportValidatedOperation["operation"]): string => {
  if (operation === "list") return "Support queue loaded.";
  if (operation === "detail") return "Support ticket loaded.";
  if (operation === "download") return "Support attachment download authorized.";
  return "Support ticket command completed.";
};

export const createVendorSupportHandler = (
  dependencies: VendorSupportDependencies,
) => createMiddlewareHandler({
  controller: async (request, response: functions.Response): Promise<void> => {
    const operation = request.context.requestData as unknown as VendorSupportValidatedOperation;
    let result: unknown;
    if (operation.operation === "list") result = await dependencies.listVendorTickets(operation.request);
    else if (operation.operation === "detail") result = await dependencies.getVendorTicketDetail(operation.request);
    else if (operation.operation === "download") result = await dependencies.downloadVendorAttachment(operation.request);
    else result = await dependencies.executeVendorCommand(operation.request);
    response.status(200).json(buildSuccessResponse(
      result,
      messageFor(operation.operation),
      request.context.requestId,
      new Date().toISOString(),
    ));
  },
  middlewares: [
    createAuthenticationMiddleware(dependencies),
    createRoleAuthorizationMiddleware({
      allowedRoles: ["vendor"],
      forbiddenMessage: "Only Vendor support operators can access the support queue.",
    }),
    createRequestValidationMiddleware({
      validator: async (request): Promise<void> => {
        const path = relativePath(request);
        const context = await operatorContext(request, dependencies);
        const pathTicketId = queryString(request.params.ticketId);
        const pathAttachmentId = queryString(request.params.attachmentId);
        let operation: VendorSupportValidatedOperation;
        if (request.method === "GET" && path === "/vendor/support/tickets") {
          operation = {
            operation: "list",
            request: adminSupportService.normalizeVendorListRequest({
              ...context,
              assignedOperatorUserId: queryString(request.query.assignedOperatorUserId),
              assignedTeam: queryString(request.query.assignedTeam) as never,
              category: queryString(request.query.category) as never,
              cursor: queryString(request.query.cursor),
              instituteId: queryString(request.query.instituteId),
              limit: queryNumber(request.query.limit),
              priority: queryString(request.query.priority) as never,
              status: queryString(request.query.status) as never,
              ticketReference: queryString(request.query.ticketReference),
            }),
          };
        } else if (request.method === "GET" && pathTicketId &&
          path === `/vendor/support/tickets/${pathTicketId}`) {
          operation = {
            operation: "detail",
            request: adminSupportService.normalizeVendorDetailRequest({
              ...context,
              messageCursor: queryString(request.query.messageCursor),
              messageLimit: queryNumber(request.query.messageLimit),
              ticketId: pathTicketId,
            }),
          };
        } else if (request.method === "GET" && pathTicketId && pathAttachmentId &&
          path === `/vendor/support/tickets/${pathTicketId}/attachments/${pathAttachmentId}/download`) {
          operation = {
            operation: "download",
            request: {...context, attachmentId: pathAttachmentId, ticketId: pathTicketId},
          };
        } else if (request.method === "POST" && pathTicketId &&
          path === `/vendor/support/tickets/${pathTicketId}/commands`) {
          operation = {
            operation: "command",
            request: adminSupportService.normalizeVendorCommandRequest({
              ...((request.body ?? {}) as Partial<VendorSupportTicketCommandRequest>),
              ...context,
              ticketId: pathTicketId,
            } as never),
          };
        } else {
          throw new AdminSupportValidationError("VALIDATION_ERROR", "Request does not match a supported Vendor support route.");
        }
        setRequestData(request, operation as unknown as Record<string, unknown>);
      },
    }),
  ],
  onError: (error, context): boolean => {
    if (!(error instanceof AdminSupportValidationError)) return false;
    sendErrorResponse(context.response, context.requestId, error.code, error.message);
    return true;
  },
  service: "VendorSupportApi",
});

const dependencies: VendorSupportDependencies = {
  downloadVendorAttachment: adminSupportService.downloadVendorAttachment.bind(adminSupportService),
  executeVendorCommand: adminSupportService.executeVendorCommand.bind(adminSupportService),
  getUser: (userId) => getFirebaseAdminApp().auth().getUser(userId),
  getVendorTicketDetail: adminSupportService.getVendorTicketDetail.bind(adminSupportService),
  listVendorTickets: adminSupportService.listVendorTickets.bind(adminSupportService),
  verifyIdToken: (idToken) => getFirebaseAdminApp().auth().verifyIdToken(idToken, true),
};

export const handleVendorSupportRequest = createVendorSupportHandler(dependencies);
