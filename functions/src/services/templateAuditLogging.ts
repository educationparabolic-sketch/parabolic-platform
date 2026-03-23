import {
  administrativeActionLoggingService,
} from "./administrativeActionLogging";
import {AuditLogWriteResult} from "../types/audit";

const DEFAULT_ACTOR_ID = "system_template_audit";
const DEFAULT_ACTOR_ROLE = "system";

type TemplateLifecycleEventType =
  | "creation"
  | "update"
  | "activation"
  | "archival";

interface TemplateAuditLoggingContext {
  instituteId: string;
  testId: string;
}

interface TemplateAuditActorContext {
  actorId?: string;
  actorRole?: string;
  ipAddress?: string;
  userAgent?: string;
  layer?: string;
}

interface LogTemplateLifecycleEventInput {
  auditId?: string;
  actor?: TemplateAuditActorContext;
  afterState?: Record<string, unknown>;
  beforeState?: Record<string, unknown>;
  context: TemplateAuditLoggingContext;
  eventType: TemplateLifecycleEventType;
  metadata?: Record<string, unknown>;
}

const normalizeOptionalString = (
  value: unknown,
): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalizedValue = value.trim();
  return normalizedValue || undefined;
};

/**
 * Emits template lifecycle events to immutable institute audit logs.
 */
export class TemplateAuditLoggingService {
  /**
   * Writes a template lifecycle audit record aligned with Build 20.
   * @param {LogTemplateLifecycleEventInput} input Lifecycle event input.
   * @return {Promise<AuditLogWriteResult>} Immutable audit write metadata.
   */
  public async logTemplateLifecycleEvent(
    input: LogTemplateLifecycleEventInput,
  ): Promise<AuditLogWriteResult> {
    const instituteId = normalizeOptionalString(input.context.instituteId);
    const testId = normalizeOptionalString(input.context.testId);

    if (!instituteId) {
      throw new Error("Template audit logging requires a valid instituteId.");
    }

    if (!testId) {
      throw new Error("Template audit logging requires a valid testId.");
    }

    const actorId =
      normalizeOptionalString(input.actor?.actorId) ?? DEFAULT_ACTOR_ID;
    const actorRole =
      normalizeOptionalString(input.actor?.actorRole) ?? DEFAULT_ACTOR_ROLE;
    const context = {
      actorId,
      actorRole,
      afterState: input.afterState,
      auditId: normalizeOptionalString(input.auditId),
      beforeState: input.beforeState,
      entityId: testId,
      instituteId,
      ipAddress: normalizeOptionalString(input.actor?.ipAddress),
      layer: normalizeOptionalString(input.actor?.layer),
      metadata: input.metadata,
      userAgent: normalizeOptionalString(input.actor?.userAgent),
    };

    switch (input.eventType) {
    case "creation":
      return administrativeActionLoggingService
        .logTestTemplateCreation(context);
    case "update":
      return administrativeActionLoggingService.logTestTemplateUpdate(context);
    case "activation":
      return administrativeActionLoggingService.logTestTemplateActivation(
        context,
      );
    case "archival":
      return administrativeActionLoggingService
        .logTestTemplateArchival(context);
    default: {
      const exhaustiveEventType: never = input.eventType;
      throw new Error(
        `Unsupported template lifecycle audit event: ${exhaustiveEventType}`,
      );
    }
    }
  }
}

export const templateAuditLoggingService = new TemplateAuditLoggingService();
