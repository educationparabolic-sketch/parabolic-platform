/* eslint-disable max-len */
import * as functions from "firebase-functions";
import {DecodedIdToken} from "firebase-admin/auth";
import type {
  AdminSupportTicketCommandRequest,
  AdminSupportTicketCreateRequest,
} from "../../../shared/contracts/adminSupport";
import {createAuthenticationMiddleware} from "../middleware/auth";
import {createCapabilityAuthorizationMiddleware} from "../middleware/capability";
import {
  createMiddlewareHandler,
  createRequestValidationMiddleware,
  setRequestData,
} from "../middleware/framework";
import {createRoleAuthorizationMiddleware} from "../middleware/role";
import {createTenantGuardMiddleware} from "../middleware/tenant";
import {buildSuccessResponse, sendErrorResponse} from "../services/apiResponse";
import {adminSupportService} from "../services/adminSupport";
import {
  AdminSupportResolvedContext,
  AdminSupportValidatedOperation,
  AdminSupportValidationError,
} from "../types/adminSupport";
import {MiddlewareRequest} from "../types/middleware";
import {getFirebaseAdminApp} from "../utils/firebaseAdmin";

interface AdminSupportDependencies {
  createTicket: typeof adminSupportService.createTicket;
  downloadAttachment: typeof adminSupportService.downloadAttachment;
  executeCommand: typeof adminSupportService.executeCommand;
  getTicketDetail: typeof adminSupportService.getTicketDetail;
  listTickets: typeof adminSupportService.listTickets;
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
  actorRole: request.context.identity?.role as
    AdminSupportResolvedContext["actorRole"] | undefined,
  instituteId: request.context.identity?.instituteId ?? undefined,
  ipAddress: request.ip,
  userAgent: request.get("user-agent"),
});

const relativePath = (request: MiddlewareRequest): string =>
  request.path.replace(/^\/api\/v1/u, "");

const messageFor = (operation: AdminSupportValidatedOperation["operation"]): string => {
  if (operation === "list") return "Support tickets loaded.";
  if (operation === "detail") return "Support ticket loaded.";
  if (operation === "download") return "Support attachment download authorized.";
  if (operation === "create") return "Support ticket created.";
  return "Support ticket command completed.";
};

export const createAdminSupportHandler = (
  dependencies: AdminSupportDependencies,
) => createMiddlewareHandler({
  controller: async (request, response: functions.Response): Promise<void> => {
    const operation = request.context.requestData as unknown as
      AdminSupportValidatedOperation;
    let result: unknown;
    if (operation.operation === "list") {
      result = await dependencies.listTickets(operation.request);
    } else if (operation.operation === "download") {
      result = await dependencies.downloadAttachment(operation.request);
    } else if (operation.operation === "detail") {
      result = await dependencies.getTicketDetail(operation.request);
    } else if (operation.operation === "create") {
      result = await dependencies.createTicket(operation.request);
    } else {
      result = await dependencies.executeCommand(operation.request);
    }
    response.status(200).json(buildSuccessResponse(
      result,
      messageFor(operation.operation),
      request.context.requestId,
      new Date().toISOString(),
    ));
  },
  middlewares: [
    createAuthenticationMiddleware(dependencies),
    createTenantGuardMiddleware({
      allowVendorBypass: false,
      resolveRequestInstituteId: (request) =>
        request.context.identity?.instituteId,
    }),
    createRoleAuthorizationMiddleware({
      allowedRoles: ["teacher", "admin", "director"],
      forbiddenMessage: "Role cannot access institute support.",
    }),
    createCapabilityAuthorizationMiddleware({
      minimumLicenseLayer: "L0",
      roleMinimumLicenseLayers: {director: "L3"},
    }),
    createRequestValidationMiddleware({
      validator: (request): void => {
        const path = relativePath(request);
        const context = actorContext(request);
        const pathTicketId = queryString(request.params.ticketId);
        const pathAttachmentId = queryString(request.params.attachmentId);
        let operation: AdminSupportValidatedOperation;
        if (request.method === "GET" && path === "/admin/support/tickets") {
          operation = {
            operation: "list",
            request: adminSupportService.normalizeListRequest({
              ...context,
              category: queryString(request.query.category) as never,
              cursor: queryString(request.query.cursor),
              limit: queryNumber(request.query.limit),
              priority: queryString(request.query.priority) as never,
              status: queryString(request.query.status) as never,
              ticketReference: queryString(request.query.ticketReference),
            }),
          };
        } else if (request.method === "POST" && path === "/admin/support/tickets") {
          const body = (request.body ?? {}) as Partial<AdminSupportTicketCreateRequest>;
          operation = {
            operation: "create",
            request: adminSupportService.normalizeCreateRequest({
              ...body,
              ...context,
            }),
          };
        } else if (request.method === "GET" && pathTicketId &&
          path === `/admin/support/tickets/${pathTicketId}`) {
          operation = {
            operation: "detail",
            request: adminSupportService.normalizeDetailRequest({
              ...context,
              messageCursor: queryString(request.query.messageCursor),
              messageLimit: queryNumber(request.query.messageLimit),
              ticketId: pathTicketId,
            }),
          };
        } else if (request.method === "GET" && pathTicketId && pathAttachmentId &&
          path === `/admin/support/tickets/${pathTicketId}/attachments/${pathAttachmentId}/download`) {
          operation = {
            operation: "download",
            request: {
              ...context,
              attachmentId: pathAttachmentId,
              ticketId: pathTicketId,
            } as never,
          };
        } else if (request.method === "POST" && pathTicketId &&
          path === `/admin/support/tickets/${pathTicketId}/commands`) {
          const body = (request.body ?? {}) as Partial<AdminSupportTicketCommandRequest>;
          operation = {
            operation: "command",
            request: adminSupportService.normalizeCommandRequest({
              ...body,
              ...context,
              ticketId: pathTicketId,
            }),
          };
        } else {
          throw new AdminSupportValidationError(
            "VALIDATION_ERROR",
            "Request does not match a supported institute support route.",
          );
        }
        setRequestData(request, operation as unknown as Record<string, unknown>);
      },
    }),
  ],
  onError: (error, context): boolean => {
    if (!(error instanceof AdminSupportValidationError)) return false;
    sendErrorResponse(
      context.response,
      context.requestId,
      error.code,
      error.message,
    );
    return true;
  },
  service: "AdminSupportApi",
});

const dependencies: AdminSupportDependencies = {
  createTicket: adminSupportService.createTicket.bind(adminSupportService),
  downloadAttachment: adminSupportService.downloadAttachment.bind(adminSupportService),
  executeCommand: adminSupportService.executeCommand.bind(adminSupportService),
  getTicketDetail: adminSupportService.getTicketDetail.bind(adminSupportService),
  listTickets: adminSupportService.listTickets.bind(adminSupportService),
  verifyIdToken: (idToken) =>
    getFirebaseAdminApp().auth().verifyIdToken(idToken, true),
};

export const handleAdminSupportRequest = createAdminSupportHandler(dependencies);
