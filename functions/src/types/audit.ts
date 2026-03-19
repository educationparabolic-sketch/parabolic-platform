export type AuditLogScope = "global" | "vendor" | "institute";

export type AuditLogMetadata = Record<string, unknown>;

export interface AuditLogEntryInput {
  auditId?: string;
  actorUid: string;
  actorRole: string;
  instituteId?: string | null;
  actionType: string;
  targetCollection: string;
  targetId: string;
  metadata?: AuditLogMetadata;
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
}

export interface AuditLogWriteResult {
  auditId: string;
  path: string;
  scope: AuditLogScope;
}
