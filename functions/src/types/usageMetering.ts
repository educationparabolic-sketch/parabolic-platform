import {Timestamp} from "firebase-admin/firestore";

export interface UsageMeteringContext {
  instituteId: string;
  runId: string;
  yearId: string;
}

export interface UsageMeteringResult {
  usageMeterPath: string;
  cycleId: string;
  wasUpdated: boolean;
}

export interface UsageMeterDocument {
  activeStudentCount: number;
  activeStudentLimit: number | null;
  assignedStudentsCount: number;
  assignmentsCreated: number;
  billingTierCompliance: boolean;
  cycleId: string;
  lastAssignmentRunId: string;
  peakStudentUsage: number;
  updatedAt: Timestamp | FirebaseFirestore.FieldValue;
}
