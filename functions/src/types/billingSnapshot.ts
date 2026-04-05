import {Timestamp} from "firebase-admin/firestore";

export type BillingSnapshotWebhookStatus =
  "pending" |
  "succeeded" |
  "failed" |
  "not_applicable";

export interface BillingSnapshotGenerationInput {
  cycleId?: string;
  instituteId?: string;
}

export interface BillingSnapshotResult {
  billingSnapshotPath: string;
  cycleId: string;
  instituteId: string;
  reason?: string;
  status: "created" | "skipped";
}

export interface BillingSnapshotGenerationResult {
  createdCount: number;
  cycleId: string;
  results: BillingSnapshotResult[];
  skippedCount: number;
}

export interface BillingSnapshotDocument {
  activeStudentCount: number;
  billingCycle: "monthly";
  createdAt: Timestamp | FirebaseFirestore.FieldValue;
  cycleEnd: string;
  cycleId: string;
  cycleStart: string;
  generatedAt: Timestamp | FirebaseFirestore.FieldValue;
  immutable: true;
  instituteId: string;
  instituteName?: string | null;
  invoiceAmount: number | null;
  invoiceId: string;
  licenseLayer: string;
  licenseTier: string;
  monthlyRevenue: number | null;
  peakActiveStudents: number;
  peakUsage: number;
  schemaVersion: 1;
  stripeWebhookStatus: BillingSnapshotWebhookStatus;
}
