export type AuditLogScope = "global" | "vendor" | "institute";

export type AuditLogMetadata = Record<string, unknown>;
export type AuditLogAdditionalFields = Record<string, unknown>;

export type AdministrativeActionType =
  | "CREATE_TEST_TEMPLATE"
  | "UPDATE_TEST_TEMPLATE"
  | "ACTIVATE_TEST_TEMPLATE"
  | "ARCHIVE_TEST_TEMPLATE"
  | "ARCHIVE_ACADEMIC_YEAR"
  | "SOFT_DELETE_STUDENT"
  | "DATA_EXPORT"
  | "CREATE_ASSIGNMENT"
  | "IMPORT_STUDENTS"
  | "CHANGE_ROLE"
  | "UPDATE_CALIBRATION";

export type AdministrativeActionEntityType =
  | "test"
  | "academicYear"
  | "assignment"
  | "student"
  | "role"
  | "calibration";

export interface AdministrativeActionState {
  [key: string]: unknown;
}

export interface AuditLogEntryInput {
  auditId?: string;
  actorUid: string;
  actorRole: string;
  instituteId?: string | null;
  actionType: string;
  targetCollection: string;
  targetId: string;
  metadata?: AuditLogMetadata;
  additionalFields?: AuditLogAdditionalFields;
}

export interface AuditLogEntry {
  auditId: string;
  actorUid: string;
  actorRole: string;
  instituteId: string | null;
  actionType: string;
  targetCollection: string;
  targetId: string;
  metadata: AuditLogMetadata;
  timestamp: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  [key: string]: unknown;
}

export interface AuditLogWriteResult {
  auditId: string;
  path: string;
  scope: AuditLogScope;
}

export interface AdministrativeActionLogInput {
  auditId?: string;
  scope: AuditLogScope;
  actorId: string;
  actorRole: string;
  tenantId?: string | null;
  actionType: AdministrativeActionType;
  entityType: AdministrativeActionEntityType;
  entityId: string;
  targetCollection: string;
  beforeState?: AdministrativeActionState;
  afterState?: AdministrativeActionState;
  ipAddress?: string;
  userAgent?: string;
  layer?: string;
  calibrationVersion?: string;
  riskModelVersion?: string;
  metadata?: AuditLogMetadata;
}

export interface InstituteAdministrativeActionContext {
  auditId?: string;
  actorId: string;
  actorRole: string;
  instituteId: string;
  entityId: string;
  ipAddress?: string;
  userAgent?: string;
  layer?: string;
  beforeState?: AdministrativeActionState;
  afterState?: AdministrativeActionState;
  metadata?: AuditLogMetadata;
}

export interface VendorAdministrativeActionContext {
  auditId?: string;
  actorId: string;
  actorRole: string;
  entityId: string;
  ipAddress?: string;
  userAgent?: string;
  layer?: string;
  calibrationVersion?: string;
  riskModelVersion?: string;
  beforeState?: AdministrativeActionState;
  afterState?: AdministrativeActionState;
  metadata?: AuditLogMetadata;
}
