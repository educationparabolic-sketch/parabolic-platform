import {randomUUID} from "crypto";
import {FieldValue} from "firebase-admin/firestore";
import {createLogger} from "./logging";
import {
  AuditLogEntry,
  AuditLogEntryInput,
  AuditLogMetadata,
  AuditLogScope,
  AuditLogWriteResult,
} from "../types/audit";
import {getFirestore} from "../utils/firebaseAdmin";

const GLOBAL_AUDIT_LOG_COLLECTION = "auditLogs";
const VENDOR_AUDIT_LOG_COLLECTION = "vendorAuditLogs";
const INSTITUTE_COLLECTION = "institutes";
const FORBIDDEN_TARGET_COLLECTION_SEGMENT = "sessions";
const FORBIDDEN_METADATA_KEYS = new Set([
  "answerMap",
  "answers",
  "responses",
  "sessionData",
]);

/**
 * Raised when an audit log payload violates storage constraints.
 */
class AuditLogValidationError extends Error {
  /**
   * Creates a validation error for invalid audit log payloads.
   * @param {string} message The validation failure message.
   */
  constructor(message: string) {
    super(message);
    this.name = "AuditLogValidationError";
  }
}

const normalizeRequiredString = (value: string, fieldName: string): string => {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new AuditLogValidationError(
      `Audit log field "${fieldName}" must be a non-empty string.`,
    );
  }

  return normalizedValue;
};

const validateTargetCollection = (targetCollection: string): string => {
  const normalizedTargetCollection =
    normalizeRequiredString(targetCollection, "targetCollection");
  const pathSegments = normalizedTargetCollection
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (pathSegments.includes(FORBIDDEN_TARGET_COLLECTION_SEGMENT)) {
    throw new AuditLogValidationError(
      "Audit logs must not target session-level collections.",
    );
  }

  return normalizedTargetCollection;
};

const sanitizeMetadata = (value: unknown): unknown => {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (
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
    return value
      .map((item) => sanitizeMetadata(item))
      .filter((item) => item !== undefined);
  }

  if (typeof value === "object") {
    const metadataEntries = Object.entries(value as Record<string, unknown>)
      .map(([key, nestedValue]) => {
        if (FORBIDDEN_METADATA_KEYS.has(key)) {
          throw new AuditLogValidationError(
            `Audit log metadata must not include "${key}".`,
          );
        }

        return [key, sanitizeMetadata(nestedValue)] as const;
      })
      .filter(([, nestedValue]) => nestedValue !== undefined);

    return Object.fromEntries(metadataEntries);
  }

  return String(value);
};

const normalizeMetadata = (
  metadata: AuditLogMetadata | undefined,
): AuditLogMetadata => {
  const sanitizedMetadata = sanitizeMetadata(metadata ?? {});

  if (
    sanitizedMetadata === null ||
    Array.isArray(sanitizedMetadata) ||
    typeof sanitizedMetadata !== "object"
  ) {
    throw new AuditLogValidationError(
      "Audit log metadata must resolve to an object.",
    );
  }

  return sanitizedMetadata as AuditLogMetadata;
};

const buildAuditLogPath = (
  scope: AuditLogScope,
  auditId: string,
  instituteId?: string,
): string => {
  switch (scope) {
  case "global":
    return `${GLOBAL_AUDIT_LOG_COLLECTION}/${auditId}`;
  case "vendor":
    return `${VENDOR_AUDIT_LOG_COLLECTION}/${auditId}`;
  case "institute":
    return `${INSTITUTE_COLLECTION}/${instituteId}/` +
      `${GLOBAL_AUDIT_LOG_COLLECTION}/${auditId}`;
  default: {
    const exhaustiveScope: never = scope;
    throw new Error(`Unsupported audit log scope: ${exhaustiveScope}`);
  }
  }
};

const resolveInstituteId = (
  scope: AuditLogScope,
  instituteId: string | null | undefined,
): string | null => {
  if (scope !== "institute") {
    return instituteId ? normalizeRequiredString(instituteId, "instituteId") :
      null;
  }

  return normalizeRequiredString(
    instituteId ?? "",
    "instituteId",
  );
};

/**
 * Persists immutable audit records to the architecture-defined Firestore
 * collections.
 */
export class AuditLogStorageService {
  private readonly logger = createLogger("AuditLogStorageService");

  /**
   * Persists a global audit record at the root audit collection.
   * @param {AuditLogEntryInput} entry The audit record payload.
   * @return {Promise<AuditLogWriteResult>} Storage metadata for the write.
   */
  public async createGlobalAuditLog(
    entry: AuditLogEntryInput,
  ): Promise<AuditLogWriteResult> {
    return this.createAuditLog("global", entry);
  }

  /**
   * Persists a vendor audit record at the vendor audit collection.
   * @param {AuditLogEntryInput} entry The audit record payload.
   * @return {Promise<AuditLogWriteResult>} Storage metadata for the write.
   */
  public async createVendorAuditLog(
    entry: AuditLogEntryInput,
  ): Promise<AuditLogWriteResult> {
    return this.createAuditLog("vendor", entry);
  }

  /**
   * Persists an institute audit record under the institute namespace.
   * @param {string} instituteId The owning institute identifier.
   * @param {AuditLogEntryInput} entry The audit record payload.
   * @return {Promise<AuditLogWriteResult>} Storage metadata for the write.
   */
  public async createInstituteAuditLog(
    instituteId: string,
    entry: AuditLogEntryInput,
  ): Promise<AuditLogWriteResult> {
    return this.createAuditLog("institute", {
      ...entry,
      instituteId,
    });
  }

  /**
   * Resolves the target collection path and stores an immutable audit record.
   * @param {AuditLogScope} scope The audit storage scope.
   * @param {AuditLogEntryInput} entry The audit record payload.
   * @return {Promise<AuditLogWriteResult>} Storage metadata for the write.
   */
  private async createAuditLog(
    scope: AuditLogScope,
    entry: AuditLogEntryInput,
  ): Promise<AuditLogWriteResult> {
    const auditId = entry.auditId?.trim() || randomUUID();
    const instituteId = resolveInstituteId(scope, entry.instituteId);
    const auditLogPath = buildAuditLogPath(
      scope,
      auditId,
      instituteId ?? undefined,
    );
    const auditLog: AuditLogEntry = {
      auditId,
      actorUid: normalizeRequiredString(entry.actorUid, "actorUid"),
      actorRole: normalizeRequiredString(entry.actorRole, "actorRole"),
      instituteId,
      actionType: normalizeRequiredString(entry.actionType, "actionType"),
      targetCollection: validateTargetCollection(entry.targetCollection),
      targetId: normalizeRequiredString(entry.targetId, "targetId"),
      metadata: normalizeMetadata(entry.metadata),
      timestamp: FieldValue.serverTimestamp(),
    };

    try {
      await getFirestore().doc(auditLogPath).create(auditLog);

      this.logger.info("Immutable audit log stored", {
        actionType: auditLog.actionType,
        actorRole: auditLog.actorRole,
        auditId,
        auditScope: scope,
        instituteId: instituteId ?? undefined,
        targetCollection: auditLog.targetCollection,
        targetId: auditLog.targetId,
      });

      return {
        auditId,
        path: auditLogPath,
        scope,
      };
    } catch (error) {
      this.logger.error("Failed to persist audit log", {
        actionType: auditLog.actionType,
        actorRole: auditLog.actorRole,
        auditId,
        auditScope: scope,
        error,
        instituteId: instituteId ?? undefined,
        targetCollection: auditLog.targetCollection,
        targetId: auditLog.targetId,
      });

      throw error;
    }
  }
}

export const auditLogStorageService = new AuditLogStorageService();
