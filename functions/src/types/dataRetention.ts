export interface DataRetentionPolicyConfig {
  auditLogRetentionDays: number;
  billingRecordRetentionDays: number;
  emailLogRetentionDays: number;
  maxDocumentsPerRun: number;
  sessionArchiveGraceDays: number;
  sessionArchiveRetentionDays: number;
}

export interface SessionRetentionSummary {
  academicYearsAlreadyClean: number;
  archivedAcademicYearsReviewed: number;
  sessionDocumentsDeleted: number;
  summaryDocumentsRetained: number;
}

export interface EmailQueueRetentionSummary {
  documentsDeleted: number;
  documentsReviewed: number;
  documentsRetained: number;
}

export interface BillingRecordRetentionSummary {
  documentsDeleted: number;
  documentsReviewed: number;
  documentsRetained: number;
}

export interface AuditLogRetentionSummary {
  documentsReviewed: number;
  protectedDocumentsRetained: number;
  vendorDocumentsReviewed: number;
  vendorProtectedDocumentsRetained: number;
}

export interface CalibrationHistoryRetentionSummary {
  documentsReviewed: number;
  permanentDocumentsRetained: number;
  vendorDocumentsReviewed: number;
  vendorPermanentDocumentsRetained: number;
}

export interface DataRetentionExecutionResult {
  auditLogs: AuditLogRetentionSummary;
  billingRecords: BillingRecordRetentionSummary;
  calibrationHistory: CalibrationHistoryRetentionSummary;
  completedAt: string;
  config: DataRetentionPolicyConfig;
  emailQueue: EmailQueueRetentionSummary;
  notes: string[];
  sessions: SessionRetentionSummary;
}
