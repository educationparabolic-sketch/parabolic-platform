import { ApiClientError } from "../../../../../shared/services/apiClient";
import { getPortalApiClient } from "../../../../../shared/services/portalIntegration";
import type {
  VendorAdministratorCommandIntent,
  VendorAdministratorCommandReceipt,
  VendorInstituteCreateIntent,
  VendorInstituteCreateReceipt,
  VendorInstituteDetail,
  VendorInstituteLifecycleIntent,
  VendorInstituteListQuery,
  VendorInstituteListResult,
  VendorInstituteMutationReceipt,
  VendorInstituteProfileUpdateIntent,
  VendorInstituteSummary,
  VendorOnboardingCommandIntent,
  VendorOnboardingCommandReceipt,
  VendorOnboardingCreateIntent,
  VendorOnboardingCreateReceipt,
  VendorOnboardingDetail,
  VendorOnboardingDetailQuery,
  VendorOnboardingEvent,
  VendorOnboardingListQuery,
  VendorOnboardingListResult,
  VendorOnboardingSummary,
} from "../../../../../shared/contracts/vendorInstitutes";

type RecordValue = Record<string, unknown>;

const apiClient = getPortalApiClient("vendor");

export type VendorInstituteFailureKind =
  | "conflict"
  | "permission"
  | "unavailable"
  | "validation"
  | "unknown";

export interface VendorInstituteFailure {
  kind: VendorInstituteFailureKind;
  message: string;
  requestId: string | null;
}

function invalidResponse(path: string, field: string): never {
  throw new Error(`Invalid Vendor API response for ${path}: ${field}.`);
}

function record(value: unknown, path: string): RecordValue {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return invalidResponse(path, "expected an object");
  }
  return value as RecordValue;
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string") return invalidResponse(path, "expected text");
  return value;
}

function nullableText(value: unknown, path: string): string | null {
  return value === null ? null : text(value, path);
}

function numberValue(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return invalidResponse(path, "expected a finite number");
  }
  return value;
}

function integer(value: unknown, path: string): number {
  const parsed = numberValue(value, path);
  if (!Number.isInteger(parsed) || parsed < 0)
    return invalidResponse(path, "expected a non-negative integer");
  return parsed;
}

function booleanValue(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") return invalidResponse(path, "expected a boolean");
  return value;
}

function oneOf<const Value extends string>(
  value: unknown,
  allowed: readonly Value[],
  path: string,
): Value {
  if (typeof value !== "string" || !allowed.includes(value as Value)) {
    return invalidResponse(path, `expected one of ${allowed.join(", ")}`);
  }
  return value as Value;
}

function list<Value>(
  value: unknown,
  path: string,
  parser: (item: unknown, path: string) => Value,
): Value[] {
  if (!Array.isArray(value)) return invalidResponse(path, "expected an array");
  return value.map((item, index) => parser(item, `${path}[${index}]`));
}

const LIFECYCLE_STATES = [
  "onboarding",
  "active",
  "suspended",
  "archived",
  "deletion_scheduled",
  "purging",
  "purged",
  "recovery_required",
] as const;
const LICENSE_LAYERS = ["L0", "L1", "L2", "L3"] as const;
const LICENSE_STATES = ["active", "grace", "expired"] as const;
const ONBOARDING_STATES = [
  "draft",
  "pending_review",
  "information_required",
  "approved",
  "institute_provisioned",
  "awaiting_commercial_authority",
  "ready_for_administrator",
  "setup_in_progress",
  "ready_for_activation",
  "active",
  "rejected",
  "expired",
] as const;
const INVITATION_STATES = [
  "not_sent",
  "queued",
  "delivered",
  "failed",
  "revoked",
  "accepted",
] as const;
const ADMINISTRATOR_STATES = ["invitation_pending", "active", "suspended"] as const;

function parsePrimaryAdministrator(value: unknown, path: string) {
  if (value === null) return null;
  const item = record(value, path);
  return {
    displayName: text(item.displayName, `${path}.displayName`),
    email: text(item.email, `${path}.email`),
    invitationStatus: oneOf(item.invitationStatus, INVITATION_STATES, `${path}.invitationStatus`),
    status: oneOf(item.status, ADMINISTRATOR_STATES, `${path}.status`),
    updatedAt: text(item.updatedAt, `${path}.updatedAt`),
    userId: text(item.userId, `${path}.userId`),
  };
}

function parseInstituteSummary(value: unknown, path: string): VendorInstituteSummary {
  const item = record(value, path);
  const aggregate = record(item.aggregate, `${path}.aggregate`);
  const commercial = record(item.commercial, `${path}.commercial`);
  return {
    accessStatus: oneOf(
      item.accessStatus,
      ["active", "suspended"] as const,
      `${path}.accessStatus`,
    ),
    aggregate: {
      activeStudentCount:
        aggregate.activeStudentCount === null
          ? null
          : integer(aggregate.activeStudentCount, `${path}.aggregate.activeStudentCount`),
      aggregateAsOf: nullableText(aggregate.aggregateAsOf, `${path}.aggregate.aggregateAsOf`),
      lastActiveAt: nullableText(aggregate.lastActiveAt, `${path}.aggregate.lastActiveAt`),
      monthlyTestRuns:
        aggregate.monthlyTestRuns === null
          ? null
          : integer(aggregate.monthlyTestRuns, `${path}.aggregate.monthlyTestRuns`),
    },
    commercial: {
      authorityState: oneOf(
        commercial.authorityState,
        ["available", "not_configured", "invalid"] as const,
        `${path}.commercial.authorityState`,
      ),
      licenseLayer:
        commercial.licenseLayer === null
          ? null
          : oneOf(commercial.licenseLayer, LICENSE_LAYERS, `${path}.commercial.licenseLayer`),
      licenseState:
        commercial.licenseState === null
          ? null
          : oneOf(commercial.licenseState, LICENSE_STATES, `${path}.commercial.licenseState`),
      licenseVersion: nullableText(commercial.licenseVersion, `${path}.commercial.licenseVersion`),
      planId: nullableText(commercial.planId, `${path}.commercial.planId`),
    },
    createdAt: text(item.createdAt, `${path}.createdAt`),
    instituteId: text(item.instituteId, `${path}.instituteId`),
    lifecycleState: oneOf(item.lifecycleState, LIFECYCLE_STATES, `${path}.lifecycleState`),
    primaryAdministrator: parsePrimaryAdministrator(
      item.primaryAdministrator,
      `${path}.primaryAdministrator`,
    ),
    registeredName: text(item.registeredName, `${path}.registeredName`),
    revision: integer(item.revision, `${path}.revision`),
    updatedAt: text(item.updatedAt, `${path}.updatedAt`),
  };
}

export function parseVendorInstituteList(value: unknown): VendorInstituteListResult {
  const item = record(value, "institutes");
  return {
    items: list(item.items, "institutes.items", parseInstituteSummary),
    nextCursor: nullableText(item.nextCursor, "institutes.nextCursor"),
    totalMatching: integer(item.totalMatching, "institutes.totalMatching"),
  };
}

export function parseVendorInstituteDetail(value: unknown): VendorInstituteDetail {
  const item = record(value, "institute");
  const summary = parseInstituteSummary(item, "institute");
  const deletion = record(item.deletion, "institute.deletion");
  const profile = record(item.profile, "institute.profile");
  return {
    ...summary,
    administrators: list(item.administrators, "institute.administrators", (administrator, path) => {
      const parsed = record(administrator, path);
      const primary = parsePrimaryAdministrator(parsed, path);
      if (!primary) return invalidResponse(path, "administrator cannot be null");
      return {
        ...primary,
        isPrimaryAdministrator: booleanValue(
          parsed.isPrimaryAdministrator,
          `${path}.isPrimaryAdministrator`,
        ),
        role: oneOf(parsed.role, ["admin", "teacher", "director"] as const, `${path}.role`),
      };
    }),
    deletion: {
      eligibleAt: nullableText(deletion.eligibleAt, "institute.deletion.eligibleAt"),
      lastErrorCode: nullableText(deletion.lastErrorCode, "institute.deletion.lastErrorCode"),
      operationId: nullableText(deletion.operationId, "institute.deletion.operationId"),
      scheduledAt: nullableText(deletion.scheduledAt, "institute.deletion.scheduledAt"),
      stage: oneOf(
        deletion.stage,
        ["none", "scheduled", "quiescing", "purging", "failed", "purged"] as const,
        "institute.deletion.stage",
      ),
    },
    profile: {
      registeredName: text(profile.registeredName, "institute.profile.registeredName"),
      vendorAccountReference: nullableText(
        profile.vendorAccountReference,
        "institute.profile.vendorAccountReference",
      ),
    },
    settingsRevision: integer(item.settingsRevision, "institute.settingsRevision"),
  };
}

function parseOnboardingSummary(value: unknown, path: string): VendorOnboardingSummary {
  const item = record(value, path);
  return {
    createdAt: text(item.createdAt, `${path}.createdAt`),
    instituteId: nullableText(item.instituteId, `${path}.instituteId`),
    onboardingId: text(item.onboardingId, `${path}.onboardingId`),
    primaryContactEmail: text(item.primaryContactEmail, `${path}.primaryContactEmail`),
    registeredName: text(item.registeredName, `${path}.registeredName`),
    revision: integer(item.revision, `${path}.revision`),
    status: oneOf(item.status, ONBOARDING_STATES, `${path}.status`),
    updatedAt: text(item.updatedAt, `${path}.updatedAt`),
  };
}

export function parseVendorOnboardingList(value: unknown): VendorOnboardingListResult {
  const item = record(value, "onboarding");
  return {
    items: list(item.items, "onboarding.items", parseOnboardingSummary),
    nextCursor: nullableText(item.nextCursor, "onboarding.nextCursor"),
    totalMatching: integer(item.totalMatching, "onboarding.totalMatching"),
  };
}

function parseOnboardingEvent(value: unknown, path: string): VendorOnboardingEvent {
  const item = record(value, path);
  return {
    actorUserId: text(item.actorUserId, `${path}.actorUserId`),
    eventId: text(item.eventId, `${path}.eventId`),
    occurredAt: text(item.occurredAt, `${path}.occurredAt`),
    revision: integer(item.revision, `${path}.revision`),
    summary: text(item.summary, `${path}.summary`),
    type: oneOf(
      item.type,
      [...ONBOARDING_STATES, "application_updated", "institute_created"] as const,
      `${path}.type`,
    ),
  };
}

export function parseVendorOnboardingDetail(value: unknown): VendorOnboardingDetail {
  const item = record(value, "onboardingDetail");
  const summary = parseOnboardingSummary(item, "onboardingDetail");
  const application = record(item.application, "onboardingDetail.application");
  const events = record(item.events, "onboardingDetail.events");
  return {
    ...summary,
    activationBlockers: list(
      item.activationBlockers,
      "onboardingDetail.activationBlockers",
      (blocker, path) =>
        oneOf(
          blocker,
          [
            "commercial_authority_missing",
            "institute_not_provisioned",
            "primary_administrator_missing",
            "profile_not_verified",
            "settings_incomplete",
          ] as const,
          path,
        ),
    ),
    application: {
      expectedConcurrentStudents: integer(
        application.expectedConcurrentStudents,
        "onboardingDetail.application.expectedConcurrentStudents",
      ),
      expectedExamSessionsPerMonth: integer(
        application.expectedExamSessionsPerMonth,
        "onboardingDetail.application.expectedExamSessionsPerMonth",
      ),
      expectedStudents: integer(
        application.expectedStudents,
        "onboardingDetail.application.expectedStudents",
      ),
      instituteType: text(application.instituteType, "onboardingDetail.application.instituteType"),
      location: text(application.location, "onboardingDetail.application.location"),
      primaryContactEmail: text(
        application.primaryContactEmail,
        "onboardingDetail.application.primaryContactEmail",
      ),
      primaryContactName: text(
        application.primaryContactName,
        "onboardingDetail.application.primaryContactName",
      ),
      primaryContactPhone: text(
        application.primaryContactPhone,
        "onboardingDetail.application.primaryContactPhone",
      ),
      registeredName: text(
        application.registeredName,
        "onboardingDetail.application.registeredName",
      ),
      timezone: text(application.timezone, "onboardingDetail.application.timezone"),
    },
    commercialReadiness: oneOf(
      item.commercialReadiness,
      ["not_configured", "configured", "invalid"] as const,
      "onboardingDetail.commercialReadiness",
    ),
    events: {
      items: list(events.items, "onboardingDetail.events.items", parseOnboardingEvent),
      nextCursor: nullableText(events.nextCursor, "onboardingDetail.events.nextCursor"),
    },
    initialSettingsComplete: booleanValue(
      item.initialSettingsComplete,
      "onboardingDetail.initialSettingsComplete",
    ),
    primaryAdministrator: parsePrimaryAdministrator(
      item.primaryAdministrator,
      "onboardingDetail.primaryAdministrator",
    ),
    profileVerified: booleanValue(item.profileVerified, "onboardingDetail.profileVerified"),
  };
}

function parseMutationReceipt(value: unknown): VendorInstituteMutationReceipt {
  const item = record(value, "instituteMutation");
  const deletion = record(item.deletion, "instituteMutation.deletion");
  return {
    auditEventId: text(item.auditEventId, "instituteMutation.auditEventId"),
    commandId: text(item.commandId, "instituteMutation.commandId"),
    completedAt: text(item.completedAt, "instituteMutation.completedAt"),
    deletion: {
      eligibleAt: nullableText(deletion.eligibleAt, "instituteMutation.deletion.eligibleAt"),
      lastErrorCode: nullableText(
        deletion.lastErrorCode,
        "instituteMutation.deletion.lastErrorCode",
      ),
      operationId: nullableText(deletion.operationId, "instituteMutation.deletion.operationId"),
      scheduledAt: nullableText(deletion.scheduledAt, "instituteMutation.deletion.scheduledAt"),
      stage: oneOf(
        deletion.stage,
        ["none", "scheduled", "quiescing", "purging", "failed", "purged"] as const,
        "instituteMutation.deletion.stage",
      ),
    },
    instituteId: text(item.instituteId, "instituteMutation.instituteId"),
    lifecycleState: oneOf(
      item.lifecycleState,
      LIFECYCLE_STATES,
      "instituteMutation.lifecycleState",
    ),
    propagationState: oneOf(
      item.propagationState,
      ["not_required", "pending_bwm_036"] as const,
      "instituteMutation.propagationState",
    ),
    replayed: booleanValue(item.replayed, "instituteMutation.replayed"),
    revision: integer(item.revision, "instituteMutation.revision"),
  };
}

function parseCreateReceipt(value: unknown): VendorInstituteCreateReceipt {
  const item = record(value, "instituteCreate");
  return {
    auditEventId: text(item.auditEventId, "instituteCreate.auditEventId"),
    commandId: text(item.commandId, "instituteCreate.commandId"),
    completedAt: text(item.completedAt, "instituteCreate.completedAt"),
    institute: parseVendorInstituteDetail(item.institute),
    replayed: booleanValue(item.replayed, "instituteCreate.replayed"),
  };
}

function parseOnboardingCreateReceipt(value: unknown): VendorOnboardingCreateReceipt {
  const item = record(value, "onboardingCreate");
  return {
    auditEventId: text(item.auditEventId, "onboardingCreate.auditEventId"),
    commandId: text(item.commandId, "onboardingCreate.commandId"),
    completedAt: text(item.completedAt, "onboardingCreate.completedAt"),
    onboarding: parseVendorOnboardingDetail(item.onboarding),
    replayed: booleanValue(item.replayed, "onboardingCreate.replayed"),
  };
}

function parseOnboardingCommandReceipt(value: unknown): VendorOnboardingCommandReceipt {
  const item = record(value, "onboardingCommand");
  return {
    auditEventId: text(item.auditEventId, "onboardingCommand.auditEventId"),
    commandId: text(item.commandId, "onboardingCommand.commandId"),
    completedAt: text(item.completedAt, "onboardingCommand.completedAt"),
    instituteId: nullableText(item.instituteId, "onboardingCommand.instituteId"),
    onboardingId: text(item.onboardingId, "onboardingCommand.onboardingId"),
    replayed: booleanValue(item.replayed, "onboardingCommand.replayed"),
    revision: integer(item.revision, "onboardingCommand.revision"),
    status: oneOf(item.status, ONBOARDING_STATES, "onboardingCommand.status"),
  };
}

function parseAdministratorReceipt(value: unknown): VendorAdministratorCommandReceipt {
  const item = record(value, "administratorCommand");
  const communication =
    item.communication === undefined
      ? undefined
      : record(item.communication, "administratorCommand.communication");
  return {
    auditEventId: text(item.auditEventId, "administratorCommand.auditEventId"),
    commandId: text(item.commandId, "administratorCommand.commandId"),
    ...(communication
      ? {
          communication: {
            communicationId: text(
              communication.communicationId,
              "administratorCommand.communication.communicationId",
            ),
            kind: oneOf(
              communication.kind,
              ["primary_administrator_invitation", "primary_administrator_password_reset"] as const,
              "administratorCommand.communication.kind",
            ),
            status: oneOf(
              communication.status,
              ["queued", "delivered", "failed"] as const,
              "administratorCommand.communication.status",
            ),
          },
        }
      : {}),
    completedAt: text(item.completedAt, "administratorCommand.completedAt"),
    instituteId: text(item.instituteId, "administratorCommand.instituteId"),
    primaryAdministrator: parsePrimaryAdministrator(
      item.primaryAdministrator,
      "administratorCommand.primaryAdministrator",
    ),
    reconciliationState: oneOf(
      item.reconciliationState,
      ["complete", "pending", "blocked_missing_entitlement"] as const,
      "administratorCommand.reconciliationState",
    ),
    replayed: booleanValue(item.replayed, "administratorCommand.replayed"),
    settingsRevision: integer(item.settingsRevision, "administratorCommand.settingsRevision"),
  };
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value);
}

export const vendorInstitutesApi = {
  listInstitutes: (query: VendorInstituteListQuery, signal?: AbortSignal) =>
    apiClient.get<VendorInstituteListResult>("/vendor/institutes", {
      emptyResultIsReady: true,
      handledFailureIsReady: true,
      query: { ...query },
      signal,
      responseAdapter: parseVendorInstituteList,
    }),
  createInstitute: (intent: VendorInstituteCreateIntent) =>
    apiClient.post<VendorInstituteCreateReceipt, VendorInstituteCreateIntent>(
      "/vendor/institutes",
      {
        body: intent,
        emptyResultIsReady: true,
        handledFailureIsReady: true,
        responseAdapter: parseCreateReceipt,
      },
    ),
  getInstitute: (instituteId: string, signal?: AbortSignal) =>
    apiClient.get<VendorInstituteDetail>(`/vendor/institutes/${encodePathSegment(instituteId)}`, {
      emptyResultIsReady: true,
      handledFailureIsReady: true,
      signal,
      responseAdapter: parseVendorInstituteDetail,
    }),
  updateInstitute: (instituteId: string, intent: VendorInstituteProfileUpdateIntent) =>
    apiClient.patch<VendorInstituteMutationReceipt, VendorInstituteProfileUpdateIntent>(
      `/vendor/institutes/${encodePathSegment(instituteId)}`,
      {
        body: intent,
        emptyResultIsReady: true,
        handledFailureIsReady: true,
        responseAdapter: parseMutationReceipt,
      },
    ),
  transitionInstitute: (instituteId: string, intent: VendorInstituteLifecycleIntent) =>
    apiClient.post<VendorInstituteMutationReceipt, VendorInstituteLifecycleIntent>(
      `/vendor/institutes/${encodePathSegment(instituteId)}/lifecycle`,
      {
        body: intent,
        emptyResultIsReady: true,
        handledFailureIsReady: true,
        responseAdapter: parseMutationReceipt,
      },
    ),
  listOnboarding: (query: VendorOnboardingListQuery, signal?: AbortSignal) =>
    apiClient.get<VendorOnboardingListResult>("/vendor/onboarding", {
      emptyResultIsReady: true,
      handledFailureIsReady: true,
      query: { ...query },
      signal,
      responseAdapter: parseVendorOnboardingList,
    }),
  createOnboarding: (intent: VendorOnboardingCreateIntent) =>
    apiClient.post<VendorOnboardingCreateReceipt, VendorOnboardingCreateIntent>(
      "/vendor/onboarding",
      {
        body: intent,
        emptyResultIsReady: true,
        handledFailureIsReady: true,
        responseAdapter: parseOnboardingCreateReceipt,
      },
    ),
  getOnboarding: (
    onboardingId: string,
    query: VendorOnboardingDetailQuery = {},
    signal?: AbortSignal,
  ) =>
    apiClient.get<VendorOnboardingDetail>(`/vendor/onboarding/${encodePathSegment(onboardingId)}`, {
      emptyResultIsReady: true,
      handledFailureIsReady: true,
      query: { ...query },
      signal,
      responseAdapter: parseVendorOnboardingDetail,
    }),
  commandOnboarding: (onboardingId: string, intent: VendorOnboardingCommandIntent) =>
    apiClient.post<VendorOnboardingCommandReceipt, VendorOnboardingCommandIntent>(
      `/vendor/onboarding/${encodePathSegment(onboardingId)}/commands`,
      {
        body: intent,
        emptyResultIsReady: true,
        handledFailureIsReady: true,
        responseAdapter: parseOnboardingCommandReceipt,
      },
    ),
  commandAdministrator: (instituteId: string, intent: VendorAdministratorCommandIntent) =>
    apiClient.post<VendorAdministratorCommandReceipt, VendorAdministratorCommandIntent>(
      `/vendor/institutes/${encodePathSegment(instituteId)}/administrators/commands`,
      {
        body: intent,
        emptyResultIsReady: true,
        handledFailureIsReady: true,
        responseAdapter: parseAdministratorReceipt,
      },
    ),
};

export function classifyVendorInstituteFailure(error: unknown): VendorInstituteFailure {
  if (error instanceof ApiClientError) {
    if (error.status === 401 || error.status === 403) {
      return {
        kind: "permission",
        message: "Your current Vendor session cannot access this authority.",
        requestId: error.requestId,
      };
    }
    if (error.status === 409 || error.code === "CONFLICT") {
      return {
        kind: "conflict",
        message: "The authoritative record changed. Reload it before retrying.",
        requestId: error.requestId,
      };
    }
    if (
      error.status === 0 ||
      error.status >= 500 ||
      error.code === "NETWORK_ERROR" ||
      error.code === "INVALID_RESPONSE"
    ) {
      return {
        kind: "unavailable",
        message: "The Vendor institute service is temporarily unavailable.",
        requestId: error.requestId,
      };
    }
    if (error.status === 400 || error.code === "VALIDATION_ERROR") {
      return { kind: "validation", message: error.message, requestId: error.requestId };
    }
    return { kind: "unknown", message: error.message, requestId: error.requestId };
  }
  return {
    kind: "unavailable",
    message:
      error instanceof Error
        ? error.message
        : "The Vendor institute response could not be validated.",
    requestId: null,
  };
}

export function createVendorIdempotencyKey(): string {
  return crypto.randomUUID();
}
