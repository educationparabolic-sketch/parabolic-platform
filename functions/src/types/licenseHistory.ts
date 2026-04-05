export interface LicenseHistoryEntryInput {
  entryId?: string;
  instituteId: string;
  previousLayer: string;
  newLayer: string;
  billingPlan: string;
  changedBy: string;
  reason: string;
  effectiveDate: string | Date;
  previousStudentLimit?: number;
  newStudentLimit?: number;
  stripeInvoiceId?: string;
}

export interface LicenseHistoryEntry {
  entryId: string;
  instituteId: string;
  previousLayer: string;
  newLayer: string;
  billingPlan: string;
  changedBy: string;
  reason: string;
  effectiveDate: string;
  previousStudentLimit?: number;
  newStudentLimit?: number;
  stripeInvoiceId?: string;
  timestamp: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
}

export interface LicenseHistoryWriteResult {
  entryId: string;
  instituteId: string;
  path: string;
}

export interface LicenseHistoryEntryWrite extends LicenseHistoryWriteResult {
  entry: LicenseHistoryEntry;
}
