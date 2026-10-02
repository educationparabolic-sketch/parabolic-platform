/* eslint-disable max-len */
import * as functions from "firebase-functions";
import {DecodedIdToken, UserRecord} from "firebase-admin/auth";
import type {
  VendorAdministratorCommandIntent,
  VendorInstituteCreateIntent,
  VendorInstituteLifecycleIntent,
  VendorInstituteProfileUpdateIntent,
  VendorOnboardingCommandIntent,
  VendorOnboardingCreateIntent,
} from "../../../shared/contracts/vendorInstitutes";
import {createAuthenticationMiddleware} from "../middleware/auth";
import {
  createMiddlewareHandler,
  createRequestValidationMiddleware,
  setRequestData,
} from "../middleware/framework";
import {createRoleAuthorizationMiddleware} from "../middleware/role";
import {buildSuccessResponse, sendErrorResponse} from "../services/apiResponse";
import {vendorAdministratorService} from "../services/vendorAdministrators";
import {vendorInstituteCommandsService} from "../services/vendorInstituteCommands";
import {vendorInstituteReadModelsService} from "../services/vendorInstituteReadModels";
import {vendorOnboardingService} from "../services/vendorOnboarding";
import {
  VendorAdministratorCommandValidatedRequest,
  VendorInstituteCreateValidatedRequest,
  VendorInstituteDetailValidatedRequest,
  VendorInstituteLifecycleValidatedRequest,
  VendorInstituteListValidatedRequest,
  VendorInstituteProfileUpdateValidatedRequest,
  VendorInstituteValidationError,
  VendorOnboardingCommandValidatedRequest,
  VendorOnboardingCreateValidatedRequest,
  VendorOnboardingDetailValidatedRequest,
  VendorOnboardingListValidatedRequest,
} from "../types/vendorInstitutes";
import {MiddlewareRequest} from "../types/middleware";
import {getFirebaseAdminApp} from "../utils/firebaseAdmin";

type VendorInstituteCapability =
  | "vendor.institutes.read"
  | "vendor.institutes.manage_lifecycle";

const VENDOR_CAPABILITY_ALLOWED_ROLES: Readonly<
Record<VendorInstituteCapability, readonly string[]>
> = {
  "vendor.institutes.manage_lifecycle": ["vendor"],
  "vendor.institutes.read": ["vendor"],
};

type VendorInstituteValidatedOperation =
  | {capability: "vendor.institutes.read"; operation: "list_institutes"; request: VendorInstituteListValidatedRequest}
  | {capability: "vendor.institutes.manage_lifecycle"; operation: "create_institute"; request: VendorInstituteCreateValidatedRequest}
  | {capability: "vendor.institutes.read"; operation: "get_institute"; request: VendorInstituteDetailValidatedRequest}
  | {capability: "vendor.institutes.manage_lifecycle"; operation: "update_institute_profile"; request: VendorInstituteProfileUpdateValidatedRequest}
  | {capability: "vendor.institutes.manage_lifecycle"; operation: "transition_institute_lifecycle"; request: VendorInstituteLifecycleValidatedRequest}
  | {capability: "vendor.institutes.read"; operation: "list_onboarding"; request: VendorOnboardingListValidatedRequest}
  | {capability: "vendor.institutes.manage_lifecycle"; operation: "create_onboarding"; request: VendorOnboardingCreateValidatedRequest}
  | {capability: "vendor.institutes.read"; operation: "get_onboarding"; request: VendorOnboardingDetailValidatedRequest}
  | {capability: "vendor.institutes.manage_lifecycle"; operation: "command_onboarding"; request: VendorOnboardingCommandValidatedRequest}
  | {capability: "vendor.institutes.manage_lifecycle"; operation: "command_administrator"; request: VendorAdministratorCommandValidatedRequest};

interface VendorInstitutesDependencies {
  createInstitute: typeof vendorInstituteCommandsService.createInstitute;
  createOnboarding: typeof vendorOnboardingService.createOnboarding;
  executeAdministratorCommand: typeof vendorAdministratorService.executeCommand;
  executeOnboardingCommand: typeof vendorOnboardingService.executeCommand;
  getInstituteDetail: typeof vendorInstituteReadModelsService.getInstituteDetail;
  getOnboardingDetail: typeof vendorOnboardingService.getOnboardingDetail;
  getUser: (userId: string) => Promise<UserRecord>;
  listInstitutes: typeof vendorInstituteReadModelsService.listInstitutes;
  listOnboarding: typeof vendorOnboardingService.listOnboarding;
  transitionLifecycle: typeof vendorInstituteCommandsService.transitionLifecycle;
  updateProfile: typeof vendorInstituteCommandsService.updateProfile;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

const queryString = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const queryNumber = (value: unknown): number | undefined => {
  const normalized = queryString(value);
  return normalized === undefined ? undefined : Number(normalized);
};

const relativePath = (request: MiddlewareRequest): string =>
  request.path.replace(/^\/api\/v1/u, "");

const commandContext = (request: MiddlewareRequest) => ({
  actorId: request.context.identity?.uid,
  actorRole: request.context.identity?.role,
  ipAddress: request.ip,
  userAgent: request.get("user-agent"),
});

const assertCurrentVendor = async (
  request: MiddlewareRequest,
  dependencies: VendorInstitutesDependencies,
): Promise<void> => {
  const identity = request.context.identity;
  if (!identity || identity.role !== "vendor" || !identity.isVendor) {
    throw new VendorInstituteValidationError(
      "FORBIDDEN",
      "Vendor institute authority is required.",
    );
  }
  const user = await dependencies.getUser(identity.uid);
  const claims = user.customClaims ?? {};
  if (user.disabled || claims.isSuspended === true ||
    (claims.role !== "vendor" && claims.isVendor !== true)) {
    throw new VendorInstituteValidationError(
      "FORBIDDEN",
      "Current Vendor identity cannot administer institutes.",
    );
  }
};

const bodyRecord = (request: MiddlewareRequest): Record<string, unknown> => {
  if (typeof request.body !== "object" || request.body === null ||
    Array.isArray(request.body)) {
    throw new VendorInstituteValidationError(
      "VALIDATION_ERROR",
      "Request body must be an object.",
    );
  }
  return request.body as Record<string, unknown>;
};

const capabilityFor = (
  method: string,
  path: string,
): VendorInstituteCapability | null => {
  if (method === "GET" && (
    path === "/vendor/institutes" ||
    path === "/vendor/onboarding" ||
    /^\/vendor\/institutes\/[^/]+$/u.test(path) ||
    /^\/vendor\/onboarding\/[^/]+$/u.test(path)
  )) return "vendor.institutes.read";
  if ((method === "POST" || method === "PATCH") && (
    path === "/vendor/institutes" ||
    path === "/vendor/onboarding" ||
    /^\/vendor\/institutes\/[^/]+$/u.test(path) ||
    /^\/vendor\/institutes\/[^/]+\/(?:lifecycle|administrators\/commands)$/u.test(path) ||
    /^\/vendor\/onboarding\/[^/]+\/commands$/u.test(path)
  )) return "vendor.institutes.manage_lifecycle";
  return null;
};

const assertVendorCapability = (
  request: MiddlewareRequest,
  capability: VendorInstituteCapability,
): void => {
  const role = request.context.identity?.role;
  if (!role || !VENDOR_CAPABILITY_ALLOWED_ROLES[capability].includes(role)) {
    throw new VendorInstituteValidationError(
      "FORBIDDEN",
      `Current identity cannot use capability ${capability}.`,
    );
  }
};

const validateOperation = async (
  request: MiddlewareRequest,
  dependencies: VendorInstitutesDependencies,
): Promise<VendorInstituteValidatedOperation> => {
  await assertCurrentVendor(request, dependencies);
  const path = relativePath(request);
  const capability = capabilityFor(request.method, path);
  if (!capability) {
    throw new VendorInstituteValidationError(
      "VALIDATION_ERROR",
      "Request does not match a supported Vendor institute route.",
    );
  }
  assertVendorCapability(request, capability);
  const context = commandContext(request);
  const instituteId = queryString(request.params.instituteId);
  const onboardingId = queryString(request.params.onboardingId);

  if (request.method === "GET" && path === "/vendor/institutes") {
    return {
      capability: "vendor.institutes.read",
      operation: "list_institutes",
      request: vendorInstituteReadModelsService.normalizeListRequest({
        ...context,
        cursor: queryString(request.query.cursor),
        lifecycleState: queryString(request.query.lifecycleState),
        licenseLayer: queryString(request.query.licenseLayer),
        limit: queryNumber(request.query.limit),
        query: queryString(request.query.query),
      }),
    };
  }
  if (request.method === "POST" && path === "/vendor/institutes") {
    return {
      capability: "vendor.institutes.manage_lifecycle",
      operation: "create_institute",
      request: vendorInstituteCommandsService.normalizeCreateRequest({
        ...(bodyRecord(request) as Partial<VendorInstituteCreateIntent>),
        ...context,
      }),
    };
  }
  if (request.method === "GET" && instituteId &&
    path === `/vendor/institutes/${instituteId}`) {
    return {
      capability: "vendor.institutes.read",
      operation: "get_institute",
      request: vendorInstituteReadModelsService.normalizeDetailRequest({
        ...context,
        instituteId,
      }),
    };
  }
  if (request.method === "PATCH" && instituteId &&
    path === `/vendor/institutes/${instituteId}`) {
    return {
      capability: "vendor.institutes.manage_lifecycle",
      operation: "update_institute_profile",
      request: vendorInstituteCommandsService.normalizeProfileUpdateRequest({
        ...(bodyRecord(request) as Partial<VendorInstituteProfileUpdateIntent>),
        ...context,
        instituteId,
      }),
    };
  }
  if (request.method === "POST" && instituteId &&
    path === `/vendor/institutes/${instituteId}/lifecycle`) {
    return {
      capability: "vendor.institutes.manage_lifecycle",
      operation: "transition_institute_lifecycle",
      request: vendorInstituteCommandsService.normalizeLifecycleRequest({
        ...(bodyRecord(request) as Partial<VendorInstituteLifecycleIntent>),
        ...context,
        instituteId,
      }),
    };
  }
  if (request.method === "GET" && path === "/vendor/onboarding") {
    return {
      capability: "vendor.institutes.read",
      operation: "list_onboarding",
      request: vendorOnboardingService.normalizeListRequest({
        ...context,
        cursor: queryString(request.query.cursor),
        limit: queryNumber(request.query.limit),
        query: queryString(request.query.query),
        status: queryString(request.query.status),
      }),
    };
  }
  if (request.method === "POST" && path === "/vendor/onboarding") {
    return {
      capability: "vendor.institutes.manage_lifecycle",
      operation: "create_onboarding",
      request: vendorOnboardingService.normalizeCreateRequest({
        ...(bodyRecord(request) as Partial<VendorOnboardingCreateIntent>),
        ...context,
      }),
    };
  }
  if (request.method === "GET" && onboardingId &&
    path === `/vendor/onboarding/${onboardingId}`) {
    return {
      capability: "vendor.institutes.read",
      operation: "get_onboarding",
      request: vendorOnboardingService.normalizeDetailRequest({
        ...context,
        eventsCursor: queryString(request.query.eventsCursor),
        eventsLimit: queryNumber(request.query.eventsLimit),
        onboardingId,
      }),
    };
  }
  if (request.method === "POST" && onboardingId &&
    path === `/vendor/onboarding/${onboardingId}/commands`) {
    return {
      capability: "vendor.institutes.manage_lifecycle",
      operation: "command_onboarding",
      request: vendorOnboardingService.normalizeCommandRequest({
        ...(bodyRecord(request) as Partial<VendorOnboardingCommandIntent>),
        ...context,
        onboardingId,
      }),
    };
  }
  if (request.method === "POST" && instituteId &&
    path === `/vendor/institutes/${instituteId}/administrators/commands`) {
    const normalized = vendorAdministratorService.normalizeCommandRequest({
      ...bodyRecord(request),
      ...context,
      instituteId,
    });
    const command = {
      action: normalized.action,
      expectedRevision: normalized.expectedRevision,
      idempotencyKey: normalized.idempotencyKey,
      ...(normalized.administrator ? {
        administrator: normalized.administrator,
      } : {}),
      ...(normalized.targetUserId ? {
        targetUserId: normalized.targetUserId,
      } : {}),
    } as VendorAdministratorCommandIntent;
    return {
      capability: "vendor.institutes.manage_lifecycle",
      operation: "command_administrator",
      request: {
        actorId: normalized.actorId,
        actorRole: normalized.actorRole,
        command,
        instituteId: normalized.instituteId,
        ...(normalized.ipAddress ? {ipAddress: normalized.ipAddress} : {}),
        ...(normalized.userAgent ? {userAgent: normalized.userAgent} : {}),
      } as VendorAdministratorCommandValidatedRequest,
    };
  }
  throw new VendorInstituteValidationError(
    "VALIDATION_ERROR",
    "Request does not match a supported Vendor institute route.",
  );
};

const messageFor = (operation: VendorInstituteValidatedOperation["operation"]): string => ({
  command_administrator: "Vendor administrator command completed.",
  command_onboarding: "Vendor onboarding command completed.",
  create_institute: "Vendor institute created.",
  create_onboarding: "Vendor onboarding created.",
  get_institute: "Vendor institute loaded.",
  get_onboarding: "Vendor onboarding loaded.",
  list_institutes: "Vendor institute directory loaded.",
  list_onboarding: "Vendor onboarding queue loaded.",
  transition_institute_lifecycle: "Vendor institute lifecycle command completed.",
  update_institute_profile: "Vendor institute profile updated.",
})[operation];

export const createVendorInstitutesHandler = (
  dependencies: VendorInstitutesDependencies,
) => createMiddlewareHandler({
  controller: async (request, response: functions.Response): Promise<void> => {
    const operation = request.context.requestData as unknown as VendorInstituteValidatedOperation;
    let result: unknown;
    if (operation.operation === "list_institutes") result = await dependencies.listInstitutes(operation.request);
    else if (operation.operation === "create_institute") result = await dependencies.createInstitute(operation.request);
    else if (operation.operation === "get_institute") result = await dependencies.getInstituteDetail(operation.request);
    else if (operation.operation === "update_institute_profile") result = await dependencies.updateProfile(operation.request);
    else if (operation.operation === "transition_institute_lifecycle") result = await dependencies.transitionLifecycle(operation.request);
    else if (operation.operation === "list_onboarding") result = await dependencies.listOnboarding(operation.request);
    else if (operation.operation === "create_onboarding") result = await dependencies.createOnboarding(operation.request);
    else if (operation.operation === "get_onboarding") result = await dependencies.getOnboardingDetail(operation.request);
    else if (operation.operation === "command_onboarding") result = await dependencies.executeOnboardingCommand(operation.request);
    else result = await dependencies.executeAdministratorCommand(operation.request);
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
      forbiddenMessage: "Only Vendor operators can administer institutes.",
    }),
    createRequestValidationMiddleware({
      validator: async (request): Promise<void> => {
        const operation = await validateOperation(request, dependencies);
        setRequestData(request, operation as unknown as Record<string, unknown>);
      },
    }),
  ],
  onError: (error, context): boolean => {
    if (!(error instanceof VendorInstituteValidationError)) return false;
    sendErrorResponse(context.response, context.requestId, error.code, error.message);
    return true;
  },
  service: "VendorInstitutesApi",
});

const dependencies: VendorInstitutesDependencies = {
  createInstitute: vendorInstituteCommandsService.createInstitute.bind(vendorInstituteCommandsService),
  createOnboarding: vendorOnboardingService.createOnboarding.bind(vendorOnboardingService),
  executeAdministratorCommand: vendorAdministratorService.executeCommand.bind(vendorAdministratorService),
  executeOnboardingCommand: vendorOnboardingService.executeCommand.bind(vendorOnboardingService),
  getInstituteDetail: vendorInstituteReadModelsService.getInstituteDetail.bind(vendorInstituteReadModelsService),
  getOnboardingDetail: vendorOnboardingService.getOnboardingDetail.bind(vendorOnboardingService),
  getUser: (userId) => getFirebaseAdminApp().auth().getUser(userId),
  listInstitutes: vendorInstituteReadModelsService.listInstitutes.bind(vendorInstituteReadModelsService),
  listOnboarding: vendorOnboardingService.listOnboarding.bind(vendorOnboardingService),
  transitionLifecycle: vendorInstituteCommandsService.transitionLifecycle.bind(vendorInstituteCommandsService),
  updateProfile: vendorInstituteCommandsService.updateProfile.bind(vendorInstituteCommandsService),
  verifyIdToken: (idToken) => getFirebaseAdminApp().auth().verifyIdToken(idToken, true),
};

export const handleVendorInstitutesRequest = createVendorInstitutesHandler(dependencies);
