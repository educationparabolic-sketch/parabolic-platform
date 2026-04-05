import {Timestamp} from "firebase-admin/firestore";

export interface UsageMeteringContext {
  instituteId: string;
  runId: string;
  yearId: string;
}

export interface UsageMeterStudentChangeContext {
  eventId: string;
  instituteId: string;
  studentId: string;
}

export interface UsageMeterSessionExecutionContext {
  eventId?: string;
  instituteId: string;
  runId: string;
  sessionId: string;
  yearId: string;
}

export interface UsageMeteringResult {
  cycleId: string;
  usageMeterPath: string;
  wasUpdated: boolean;
  reason?: string;
}

export interface UsageMeterDocument {
  activeStudentCount: number;
  activeStudentLimit: number | null;
  approachingLimit: boolean;
  assignedStudentsCount: number;
  assignmentsCreated: number;
  basePriceMonthly?: number | null;
  billingTierCompliance: boolean;
  cycleId: string;
  overLimit: boolean;
  overLimitSince: Timestamp | FirebaseFirestore.FieldValue | null;
  peakActiveStudents: number;
  pricePerStudent?: number | null;
  pricingPlanId?: string | null;
  projectedInvoiceAmount?: number | null;
  lastAssignmentRunId: string;
  peakStudentUsage: number;
  sessionExecutionVolume: number;
  updatedAt: Timestamp | FirebaseFirestore.FieldValue;
}
