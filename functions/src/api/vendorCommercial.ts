/* eslint-disable max-len */
import * as functions from "firebase-functions";
import {DecodedIdToken, UserRecord} from "firebase-admin/auth";
import type {
  VendorBillingCommunicationIntent,
  VendorInvoiceCommandIntent,
  VendorInvoiceStatus,
  VendorLicenseCatalogCommandIntent,
  VendorLicenseRequestDecisionIntent,
  VendorOfflinePaymentCommandIntent,
  VendorPaymentEventCommandIntent,
  VendorPaymentEventProcessingState,
  VendorPaymentEventReconciliationState,
  VendorSubscriptionCommandIntent,
} from "../../../shared/contracts/vendorCommercial";
import {createAuthenticationMiddleware} from "../middleware/auth";
import {
  createMiddlewareHandler,
  createRequestValidationMiddleware,
  setRequestData,
} from "../middleware/framework";
import {createRoleAuthorizationMiddleware} from "../middleware/role";
import {buildSuccessResponse, sendErrorResponse} from "../services/apiResponse";
import {vendorInvoicesService} from "../services/vendorInvoices";
import {vendorLicenseCatalogService} from "../services/vendorLicenseCatalog";
import {vendorLicenseRequestsService} from "../services/vendorLicenseRequests";
import {vendorPaymentEventsService} from "../services/vendorPaymentEvents";
import {vendorSubscriptionsService} from "../services/vendorSubscriptions";
import {
  VendorCommercialActorContext,
  VendorCommercialValidatedOperation,
  VendorCommercialValidationError,
} from "../types/vendorCommercial";
import {MiddlewareRequest} from "../types/middleware";
import {getFirebaseAdminApp} from "../utils/firebaseAdmin";

type VendorCommercialCapability = "vendor.licenses.manage";

interface VendorCommercialDependencies {
  commandCatalog: typeof vendorLicenseCatalogService.commandCatalog;
  commandInvoice: typeof vendorInvoicesService.commandInvoice;
  commandOfflinePayment: typeof vendorInvoicesService.commandOfflinePayment;
  commandSubscription: typeof vendorSubscriptionsService.commandSubscription;
  communicateInvoice: typeof vendorInvoicesService.communicateInvoice;
  decideRequest: typeof vendorLicenseRequestsService.decideRequest;
  getCatalog: typeof vendorLicenseCatalogService.getCatalog;
  getInvoice: typeof vendorInvoicesService.getInvoice;
  getRequestDetail: typeof vendorLicenseRequestsService.getRequestDetail;
  getSubscription: typeof vendorSubscriptionsService.getSubscription;
  getUser: (userId: string) => Promise<UserRecord>;
  listEvents: typeof vendorPaymentEventsService.listEvents;
  listInvoices: typeof vendorInvoicesService.listInvoices;
  listRequests: typeof vendorLicenseRequestsService.listRequests;
  retryEvent: typeof vendorPaymentEventsService.retryEvent;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

const queryString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const queryNumber = (value: unknown): number | undefined => {
  const normalized = queryString(value);
  return normalized === undefined ? undefined : Number(normalized);
};

const queryLimit = (value: unknown): number => {
  const normalized = queryNumber(value) ?? 25;
  if (!Number.isSafeInteger(normalized) || normalized < 1 || normalized > 50) {
    throw new VendorCommercialValidationError(
      "VALIDATION_ERROR",
      "Field \"limit\" must be an integer from 1 to 50.",
    );
  }
  return normalized;
};

const relativePath = (request: MiddlewareRequest): string =>
  request.path.replace(/^\/api\/v1/u, "");

const bodyRecord = (request: MiddlewareRequest): Record<string, unknown> => {
  if (typeof request.body !== "object" || request.body === null ||
    Array.isArray(request.body)) {
    throw new VendorCommercialValidationError(
      "VALIDATION_ERROR",
      "Request body must be an object.",
    );
  }
  return request.body as Record<string, unknown>;
};

const commandContext = (
  request: MiddlewareRequest,
): VendorCommercialActorContext => {
  const identity = request.context.identity;
  if (!identity || identity.role !== "vendor") {
    throw new VendorCommercialValidationError(
      "FORBIDDEN",
      "Vendor commercial authority is required.",
    );
  }
  return {
    actorId: identity.uid,
    actorRole: "vendor",
    ipAddress: request.ip,
    userAgent: request.get("user-agent"),
  };
};

const publicCommand = <T>(
  request: MiddlewareRequest,
  fields: readonly string[],
): T => {
  const body = bodyRecord(request);
  return Object.fromEntries(fields
    .filter((field) => body[field] !== undefined)
    .map((field) => [field, body[field]])) as T;
};

const assertCurrentVendor = async (
  request: MiddlewareRequest,
  dependencies: VendorCommercialDependencies,
): Promise<void> => {
  const identity = request.context.identity;
  if (!identity || identity.role !== "vendor" || !identity.isVendor) {
    throw new VendorCommercialValidationError(
      "FORBIDDEN",
      "Vendor commercial authority is required.",
    );
  }
  const user = await dependencies.getUser(identity.uid);
  const claims = user.customClaims ?? {};
  if (user.disabled || claims.isSuspended === true ||
    (claims.role !== "vendor" && claims.isVendor !== true)) {
    throw new VendorCommercialValidationError(
      "FORBIDDEN",
      "Current Vendor identity cannot manage commercial authority.",
    );
  }
};

const assertVendorCapability = (
  request: MiddlewareRequest,
  capability: VendorCommercialCapability,
): void => {
  if (request.context.identity?.role !== "vendor") {
    throw new VendorCommercialValidationError(
      "FORBIDDEN",
      `Current identity cannot use capability ${capability}.`,
    );
  }
};

const validateOperation = async (
  request: MiddlewareRequest,
  dependencies: VendorCommercialDependencies,
): Promise<VendorCommercialValidatedOperation> => {
  await assertCurrentVendor(request, dependencies);
  assertVendorCapability(request, "vendor.licenses.manage");
  const path = relativePath(request);
  const context = commandContext(request);
  const instituteId = queryString(request.params.instituteId);
  const requestId = queryString(request.params.requestId);

  if (request.method === "GET" && path === "/vendor/license-requests") {
    return {
      operation: "list_license_requests",
      request: vendorLicenseRequestsService.normalizeListRequest({
        ...context,
        cursor: queryString(request.query.cursor),
        instituteId: queryString(request.query.instituteId),
        limit: queryNumber(request.query.limit),
        requestedLayer: queryString(request.query.requestedLayer),
        status: queryString(request.query.status),
      }),
    };
  }
  if (request.method === "GET" && instituteId && requestId &&
    path === `/vendor/institutes/${instituteId}/license-requests/${requestId}`) {
    return {
      operation: "get_license_request",
      request: vendorLicenseRequestsService.normalizeDetailRequest({
        ...context,
        instituteId,
        requestId,
      }),
    };
  }
  if (request.method === "POST" && instituteId && requestId &&
    path === `/vendor/institutes/${instituteId}/license-requests/${requestId}/decision`) {
    return {
      operation: "decide_license_request",
      request: vendorLicenseRequestsService.normalizeDecisionRequest({
        ...(bodyRecord(request) as Partial<VendorLicenseRequestDecisionIntent>),
        ...context,
        instituteId,
        requestId,
      }),
    };
  }
  if (request.method === "GET" && path === "/vendor/license-catalog") {
    return {operation: "get_license_catalog", request: context};
  }
  if (request.method === "POST" && path === "/vendor/license-catalog/commands") {
    return {
      operation: "command_license_catalog",
      request: {
        ...context,
        command: publicCommand<VendorLicenseCatalogCommandIntent>(request, [
          "action", "billingInterval", "expectedCatalogRevision",
          "expectedPlanRevision", "featureFlags", "idempotencyKey", "layer",
          "limits", "planId", "price", "reason", "versionId",
        ]),
      },
    };
  }
  if (request.method === "GET" && instituteId &&
    path === `/vendor/institutes/${instituteId}/subscription`) {
    return {operation: "get_subscription", request: {...context, instituteId}};
  }
  if (request.method === "POST" && instituteId &&
    path === `/vendor/institutes/${instituteId}/subscription/commands`) {
    return {
      operation: "command_subscription",
      request: {
        ...context,
        command: publicCommand<VendorSubscriptionCommandIntent>(request, [
          "action", "effective", "expectedRevision", "extensionDays",
          "idempotencyKey", "planId", "planVersionId", "reason",
        ]),
        instituteId,
      },
    };
  }
  if (request.method === "GET" && path === "/vendor/invoices") {
    return {
      operation: "list_invoices",
      request: {
        ...context,
        cursor: queryString(request.query.cursor),
        instituteId: queryString(request.query.instituteId),
        limit: queryLimit(request.query.limit),
        status: queryString(request.query.status) as VendorInvoiceStatus | undefined,
      },
    };
  }
  const invoiceId = queryString(request.params.invoiceId);
  if (request.method === "GET" && instituteId && invoiceId &&
    path === `/vendor/institutes/${instituteId}/invoices/${invoiceId}`) {
    return {operation: "get_invoice", request: {...context, instituteId, invoiceId}};
  }
  if (request.method === "POST" && instituteId && invoiceId &&
    path === `/vendor/institutes/${instituteId}/invoices/${invoiceId}/commands`) {
    return {
      operation: "command_invoice",
      request: {
        ...context,
        command: publicCommand<VendorInvoiceCommandIntent>(request, [
          "action", "expectedRevision", "idempotencyKey", "reason",
        ]),
        instituteId,
        invoiceId,
      },
    };
  }
  if (request.method === "POST" && instituteId && invoiceId &&
    path === `/vendor/institutes/${instituteId}/invoices/${invoiceId}/communications`) {
    return {
      operation: "communicate_invoice",
      request: {
        ...context,
        command: publicCommand<VendorBillingCommunicationIntent>(request, [
          "action", "expectedRevision", "idempotencyKey", "reason",
        ]),
        instituteId,
        invoiceId,
      },
    };
  }
  if (request.method === "POST" && instituteId && invoiceId &&
    path === `/vendor/institutes/${instituteId}/invoices/${invoiceId}/offline-payments`) {
    return {
      operation: "command_offline_payment",
      request: {
        ...context,
        command: publicCommand<VendorOfflinePaymentCommandIntent>(request, [
          "action", "amount", "evidenceReference", "expectedOfflinePaymentRevision",
          "expectedRevision", "externalReference", "idempotencyKey", "method",
          "occurredAt", "offlinePaymentId", "reason",
        ]),
        instituteId,
        invoiceId,
      },
    };
  }
  if (request.method === "GET" && path === "/vendor/payment-events") {
    return {
      operation: "list_payment_events",
      request: {
        ...context,
        cursor: queryString(request.query.cursor),
        instituteId: queryString(request.query.instituteId),
        limit: queryLimit(request.query.limit),
        processingState: queryString(request.query.processingState) as
          VendorPaymentEventProcessingState | undefined,
        reconciliationState: queryString(request.query.reconciliationState) as
          VendorPaymentEventReconciliationState | undefined,
      },
    };
  }
  const eventId = queryString(request.params.eventId);
  if (request.method === "POST" && eventId &&
    path === `/vendor/payment-events/${eventId}/commands`) {
    return {
      operation: "retry_payment_event",
      request: {
        ...context,
        command: publicCommand<VendorPaymentEventCommandIntent>(request, [
          "action", "expectedRevision", "idempotencyKey", "reason",
        ]),
        eventId,
      },
    };
  }
  throw new VendorCommercialValidationError(
    "VALIDATION_ERROR",
    "Request does not match a supported Vendor commercial route.",
  );
};

const messageFor = (
  operation: VendorCommercialValidatedOperation["operation"],
): string => ({
  command_invoice: "Vendor invoice command recorded.",
  command_license_catalog: "Vendor license-catalog command recorded.",
  command_offline_payment: "Vendor offline-payment command recorded.",
  command_subscription: "Vendor subscription command recorded.",
  communicate_invoice: "Vendor billing communication queued.",
  decide_license_request: "Vendor license-request decision recorded.",
  get_invoice: "Vendor invoice loaded.",
  get_license_catalog: "Vendor license catalog loaded.",
  get_license_request: "Vendor license request loaded.",
  get_subscription: "Vendor subscription loaded.",
  list_invoices: "Vendor invoice queue loaded.",
  list_payment_events: "Vendor payment-event queue loaded.",
  list_license_requests: "Vendor license-request queue loaded.",
  retry_payment_event: "Vendor payment-event reconciliation recorded.",
})[operation];

const executeOperation = async (
  operation: VendorCommercialValidatedOperation,
  dependencies: VendorCommercialDependencies,
): Promise<unknown> => {
  switch (operation.operation) {
  case "list_license_requests": return dependencies.listRequests(operation.request);
  case "get_license_request": return dependencies.getRequestDetail(operation.request);
  case "decide_license_request": return dependencies.decideRequest(operation.request);
  case "get_license_catalog": return dependencies.getCatalog(operation.request);
  case "command_license_catalog": return dependencies.commandCatalog(operation.request);
  case "get_subscription": return dependencies.getSubscription(operation.request);
  case "command_subscription": return dependencies.commandSubscription(operation.request);
  case "list_invoices": return dependencies.listInvoices(operation.request);
  case "get_invoice": return dependencies.getInvoice(operation.request);
  case "command_invoice": return dependencies.commandInvoice(operation.request);
  case "communicate_invoice": return dependencies.communicateInvoice(operation.request);
  case "command_offline_payment":
    return dependencies.commandOfflinePayment(operation.request);
  case "list_payment_events": return dependencies.listEvents(operation.request);
  case "retry_payment_event": return dependencies.retryEvent(operation.request);
  }
};

export const createVendorCommercialHandler = (
  dependencies: VendorCommercialDependencies,
) => createMiddlewareHandler({
  controller: async (request, response: functions.Response): Promise<void> => {
    const operation = request.context.requestData as unknown as
      VendorCommercialValidatedOperation;
    const result = await executeOperation(operation, dependencies);
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
      forbiddenMessage: "Only Vendor operators can manage licensing authority.",
    }),
    createRequestValidationMiddleware({
      validator: async (request): Promise<void> => {
        const operation = await validateOperation(request, dependencies);
        setRequestData(request, operation as unknown as Record<string, unknown>);
      },
    }),
  ],
  onError: (error, context): boolean => {
    if (!(error instanceof VendorCommercialValidationError)) return false;
    sendErrorResponse(context.response, context.requestId, error.code, error.message);
    return true;
  },
  service: "VendorCommercialApi",
});

const dependencies: VendorCommercialDependencies = {
  commandCatalog: vendorLicenseCatalogService.commandCatalog,
  commandInvoice: vendorInvoicesService.commandInvoice,
  commandOfflinePayment: vendorInvoicesService.commandOfflinePayment,
  commandSubscription: vendorSubscriptionsService.commandSubscription,
  communicateInvoice: vendorInvoicesService.communicateInvoice,
  decideRequest: vendorLicenseRequestsService.decideRequest,
  getCatalog: vendorLicenseCatalogService.getCatalog,
  getInvoice: vendorInvoicesService.getInvoice,
  getRequestDetail: vendorLicenseRequestsService.getRequestDetail,
  getSubscription: vendorSubscriptionsService.getSubscription,
  getUser: (userId) => getFirebaseAdminApp().auth().getUser(userId),
  listEvents: vendorPaymentEventsService.listEvents,
  listInvoices: vendorInvoicesService.listInvoices,
  listRequests: vendorLicenseRequestsService.listRequests,
  retryEvent: vendorPaymentEventsService.retryEvent,
  verifyIdToken: (idToken) =>
    getFirebaseAdminApp().auth().verifyIdToken(idToken, true),
};

export const handleVendorCommercialRequest =
  createVendorCommercialHandler(dependencies);
