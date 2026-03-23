import {isDeepStrictEqual} from "node:util";
import {createLogger} from "./logging";
import {auditLogStorageService} from "./auditLogStorage";
import {
  AdministrativeActionLogInput,
  AdministrativeActionState,
  AuditLogWriteResult,
  InstituteAdministrativeActionContext,
  VendorAdministrativeActionContext,
} from "../types/audit";

const DEFAULT_INSTITUTE_LAYER = "L1";
const DEFAULT_VENDOR_LAYER = "L2";
const SESSION_ENTITY_TYPE = "session";

const isPlainObject = (
  value: unknown,
): value is Record<string, unknown> => typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof Date);

const normalizeOptionalString = (
  value: string | undefined,
): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const normalizedValue = value.trim();
  return normalizedValue || undefined;
};

const normalizeRequiredString = (value: string, fieldName: string): string => {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new Error(
      `Administrative action field "${fieldName}" must be a non-empty string.`,
    );
  }

  return normalizedValue;
};

const normalizeStateValue = (value: unknown): unknown => {
  if (value === undefined) {
    return undefined;
  }

  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeStateValue(item));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, nestedValue]) => [key, normalizeStateValue(nestedValue)])
        .filter(([, nestedValue]) => nestedValue !== undefined),
    );
  }

  return String(value);
};

const normalizeState = (
  state: AdministrativeActionState | undefined,
): Record<string, unknown> => {
  if (!state) {
    return {};
  }

  return normalizeStateValue(state) as Record<string, unknown>;
};

const diffStates = (
  beforeState: Record<string, unknown>,
  afterState: Record<string, unknown>,
): {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
} => {
  const diffBefore: Record<string, unknown> = {};
  const diffAfter: Record<string, unknown> = {};
  const keys = new Set([
    ...Object.keys(beforeState),
    ...Object.keys(afterState),
  ]);

  keys.forEach((key) => {
    const beforeValue = beforeState[key];
    const afterValue = afterState[key];

    if (isPlainObject(beforeValue) && isPlainObject(afterValue)) {
      const nestedDiff = diffStates(beforeValue, afterValue);

      if (Object.keys(nestedDiff.before).length > 0) {
        diffBefore[key] = nestedDiff.before;
      }

      if (Object.keys(nestedDiff.after).length > 0) {
        diffAfter[key] = nestedDiff.after;
      }

      return;
    }

    if (isDeepStrictEqual(beforeValue, afterValue)) {
      return;
    }

    if (beforeValue !== undefined) {
      diffBefore[key] = beforeValue;
    }

    if (afterValue !== undefined) {
      diffAfter[key] = afterValue;
    }
  });

  return {
    before: diffBefore,
    after: diffAfter,
  };
};

/**
 * Emits architecture-aligned audit events for critical administrative actions.
 */
export class AdministrativeActionLoggingService {
  private readonly logger = createLogger("AdministrativeActionLoggingService");

  /**
   * Stores an administrative audit event in the appropriate immutable scope.
   * @param {AdministrativeActionLogInput} input Administrative action details.
   * @return {Promise<AuditLogWriteResult>} Firestore write metadata.
   */
  public async logAdministrativeAction(
    input: AdministrativeActionLogInput,
  ): Promise<AuditLogWriteResult> {
    const actorId = normalizeRequiredString(input.actorId, "actorId");
    const actorRole = normalizeRequiredString(input.actorRole, "actorRole");
    const entityType = normalizeRequiredString(input.entityType, "entityType");
    const entityId = normalizeRequiredString(input.entityId, "entityId");
    const targetCollection = normalizeRequiredString(
      input.targetCollection,
      "targetCollection",
    );

    if (entityType.toLowerCase() === SESSION_ENTITY_TYPE) {
      throw new Error("Administrative action logs must not target sessions.");
    }

    const normalizedTenantId = input.tenantId === null ?
      null :
      normalizeOptionalString(input.tenantId);
    const normalizedBeforeState = normalizeState(input.beforeState);
    const normalizedAfterState = normalizeState(input.afterState);
    const changedState = diffStates(
      normalizedBeforeState,
      normalizedAfterState,
    );
    const defaultLayer = input.scope === "vendor" ?
      DEFAULT_VENDOR_LAYER :
      DEFAULT_INSTITUTE_LAYER;
    const layer = normalizeOptionalString(input.layer) ?? defaultLayer;

    const auditWrite = await this.writeAuditLog(input.scope, {
      actionType: input.actionType,
      actorRole,
      actorUid: actorId,
      additionalFields: {
        actorId,
        after: changedState.after,
        before: changedState.before,
        calibrationVersion: normalizeOptionalString(input.calibrationVersion),
        entityId,
        entityType,
        ipAddress: normalizeOptionalString(input.ipAddress),
        layer,
        riskModelVersion: normalizeOptionalString(input.riskModelVersion),
        tenantId: normalizedTenantId,
        userAgent: normalizeOptionalString(input.userAgent),
      },
      auditId: normalizeOptionalString(input.auditId),
      instituteId: normalizedTenantId,
      metadata: input.metadata,
      targetCollection,
      targetId: entityId,
    });

    this.logger.info("Administrative action audit log stored", {
      actionType: input.actionType,
      actorId,
      auditId: auditWrite.auditId,
      auditScope: auditWrite.scope,
      entityId,
      entityType,
      instituteId: normalizedTenantId ?? undefined,
      targetCollection,
    });

    return auditWrite;
  }

  /**
   * Logs institute-scoped test template creation.
   * @param {InstituteAdministrativeActionContext} context Action context.
   * @return {Promise<AuditLogWriteResult>} Firestore write metadata.
   */
  public async logTestTemplateCreation(
    context: InstituteAdministrativeActionContext,
  ): Promise<AuditLogWriteResult> {
    return this.logAdministrativeAction({
      ...context,
      actionType: "CREATE_TEST_TEMPLATE",
      entityType: "test",
      scope: "institute",
      targetCollection: "tests",
      tenantId: context.instituteId,
    });
  }

  /**
   * Logs institute-scoped test template updates.
   * @param {InstituteAdministrativeActionContext} context Action context.
   * @return {Promise<AuditLogWriteResult>} Firestore write metadata.
   */
  public async logTestTemplateUpdate(
    context: InstituteAdministrativeActionContext,
  ): Promise<AuditLogWriteResult> {
    return this.logAdministrativeAction({
      ...context,
      actionType: "UPDATE_TEST_TEMPLATE",
      entityType: "test",
      scope: "institute",
      targetCollection: "tests",
      tenantId: context.instituteId,
    });
  }

  /**
   * Logs institute-scoped test template activation.
   * @param {InstituteAdministrativeActionContext} context Action context.
   * @return {Promise<AuditLogWriteResult>} Firestore write metadata.
   */
  public async logTestTemplateActivation(
    context: InstituteAdministrativeActionContext,
  ): Promise<AuditLogWriteResult> {
    return this.logAdministrativeAction({
      ...context,
      actionType: "ACTIVATE_TEST_TEMPLATE",
      entityType: "test",
      scope: "institute",
      targetCollection: "tests",
      tenantId: context.instituteId,
    });
  }

  /**
   * Logs institute-scoped test template archival.
   * @param {InstituteAdministrativeActionContext} context Action context.
   * @return {Promise<AuditLogWriteResult>} Firestore write metadata.
   */
  public async logTestTemplateArchival(
    context: InstituteAdministrativeActionContext,
  ): Promise<AuditLogWriteResult> {
    return this.logAdministrativeAction({
      ...context,
      actionType: "ARCHIVE_TEST_TEMPLATE",
      entityType: "test",
      scope: "institute",
      targetCollection: "tests",
      tenantId: context.instituteId,
    });
  }

  /**
   * Logs institute-scoped assignment creation.
   * @param {InstituteAdministrativeActionContext} context Action context.
   * @return {Promise<AuditLogWriteResult>} Firestore write metadata.
   */
  public async logAssignmentCreation(
    context: InstituteAdministrativeActionContext,
  ): Promise<AuditLogWriteResult> {
    return this.logAdministrativeAction({
      ...context,
      actionType: "CREATE_ASSIGNMENT",
      entityType: "assignment",
      scope: "institute",
      targetCollection: "runs",
      tenantId: context.instituteId,
    });
  }

  /**
   * Logs institute-scoped bulk student imports.
   * @param {InstituteAdministrativeActionContext} context Action context.
   * @return {Promise<AuditLogWriteResult>} Firestore write metadata.
   */
  public async logStudentImport(
    context: InstituteAdministrativeActionContext,
  ): Promise<AuditLogWriteResult> {
    return this.logAdministrativeAction({
      ...context,
      actionType: "IMPORT_STUDENTS",
      entityType: "student",
      scope: "institute",
      targetCollection: "students",
      tenantId: context.instituteId,
    });
  }

  /**
   * Logs institute-scoped role changes.
   * @param {InstituteAdministrativeActionContext} context Action context.
   * @return {Promise<AuditLogWriteResult>} Firestore write metadata.
   */
  public async logRoleChange(
    context: InstituteAdministrativeActionContext,
  ): Promise<AuditLogWriteResult> {
    return this.logAdministrativeAction({
      ...context,
      actionType: "CHANGE_ROLE",
      entityType: "role",
      scope: "institute",
      targetCollection: "users",
      tenantId: context.instituteId,
    });
  }

  /**
   * Logs vendor-scoped calibration updates.
   * @param {VendorAdministrativeActionContext} context Action context.
   * @return {Promise<AuditLogWriteResult>} Firestore write metadata.
   */
  public async logCalibrationUpdate(
    context: VendorAdministrativeActionContext,
  ): Promise<AuditLogWriteResult> {
    return this.logAdministrativeAction({
      ...context,
      actionType: "UPDATE_CALIBRATION",
      entityType: "calibration",
      scope: "vendor",
      targetCollection: "globalCalibration",
    });
  }

  /**
   * Routes the action log write to the scope-specific immutable collection.
   * @param {string} scope Audit storage scope.
   * @param {object} input Normalized audit payload.
   * @return {Promise<AuditLogWriteResult>} Firestore write metadata.
   */
  private async writeAuditLog(
    scope: AdministrativeActionLogInput["scope"],
    input: {
      actionType: string;
      actorRole: string;
      actorUid: string;
      additionalFields: Record<string, unknown>;
      auditId?: string;
      instituteId?: string | null;
      metadata?: Record<string, unknown>;
      targetCollection: string;
      targetId: string;
    },
  ): Promise<AuditLogWriteResult> {
    switch (scope) {
    case "global":
      return auditLogStorageService.createGlobalAuditLog(input);
    case "vendor":
      return auditLogStorageService.createVendorAuditLog(input);
    case "institute":
      return auditLogStorageService.createInstituteAuditLog(
        input.instituteId ?? "",
        input,
      );
    default: {
      const exhaustiveScope: never = scope;
      throw new Error(
        `Unsupported administrative action audit scope: ${exhaustiveScope}`,
      );
    }
    }
  }
}

export const administrativeActionLoggingService =
  new AdministrativeActionLoggingService();
