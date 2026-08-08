/**
 * Transport DTOs shared by frontend portal adapters and Functions handlers.
 *
 * Keep backend-only validated request/context types in `functions/src/types` and
 * view-model types inside their owning portal. Only wire-level request/result
 * shapes belong here.
 */

export interface AdminStudentOnboardingResendRequest {
  instituteId?: string;
  studentId?: string;
}

export interface AdminStudentOnboardingResendResult {
  jobId: string;
  jobPath: string;
  queuedAt: string;
  recipientEmail: string;
  status: "pending";
  studentId: string;
}

export interface StudentBulkIngestionStudentInput {
  batch?: string;
  batchId?: string;
  class?: string;
  email?: string;
  enrollmentYear?: string;
  fullName?: string;
  name?: string;
  parentEmail?: string;
  phone?: string;
  studentId?: string;
}

export interface StudentBulkIngestionRequest {
  commit?: boolean;
  csvContent?: string;
  deactivateMissing?: boolean;
  instituteId: string;
  students?: StudentBulkIngestionStudentInput[];
}

export type StudentBulkIngestionRowAction =
  | "create"
  | "update"
  | "deactivate"
  | "none";

export interface StudentBulkIngestionRowResult {
  action: StudentBulkIngestionRowAction;
  email: string | null;
  errors: string[];
  fullName: string | null;
  rowNumber: number;
  studentId: string | null;
}

export interface StudentBulkIngestionSummary {
  created: number;
  deactivationCandidates: number;
  deactivated: number;
  invalid: number;
  onboardingEmailsQueued: number;
  received: number;
  updated: number;
  valid: number;
}

export interface StudentBulkIngestionResult {
  commitRequested: boolean;
  committed: boolean;
  deactivateMissing: boolean;
  rows: StudentBulkIngestionRowResult[];
  summary: StudentBulkIngestionSummary;
}

export type InterventionActionType =
  | "ASSIGN_REMEDIAL_TEST"
  | "SEND_ALERT"
  | "TRACK_OUTCOME"
  | "LIST_ACTIONS";

export type InterventionOutcomeStatus =
  | "pending"
  | "improving"
  | "no_change"
  | "escalated"
  | "resolved";

export interface AdminInterventionRequest {
  instituteId: string;
  yearId: string;
  actionType: InterventionActionType;
  studentId?: string;
  remedialTestId?: string;
  alertMessage?: string;
  outcomeStatus?: InterventionOutcomeStatus;
  outcomeNotes?: string;
  limit?: number;
}

export interface InterventionActionRecord {
  interventionId: string;
  actionType: InterventionActionType;
  instituteId: string;
  yearId: string;
  studentId?: string;
  studentName?: string;
  riskCluster?: string;
  remedialTestId?: string;
  alertMessage?: string;
  outcomeStatus?: InterventionOutcomeStatus;
  outcomeNotes?: string;
  auditId?: string;
  auditPath?: string;
  timestamp: string;
}

export interface AdminInterventionResult {
  mode: "action" | "list";
  action?: InterventionActionRecord;
  actions: InterventionActionRecord[];
}

export interface QuestionBulkUploadQuestionInput {
  chapter?: string;
  correctAnswer?: string;
  difficulty?: "Easy" | "Medium" | "Hard";
  examType?: string;
  marks?: number | string;
  negativeMarks?: number | string;
  parentQuestionId?: string | null;
  questionId?: string;
  questionImageUrl?: string;
  questionTextKeywords?: string[] | string;
  questionType?: string;
  simulationLink?: string | null;
  solutionImageUrl?: string;
  status?: "active" | "used" | "archived" | "deprecated";
  subject?: string;
  tags?: string[] | string;
  tutorialVideoLink?: string | null;
  uniqueKey?: string;
  version?: number | string;
}

export interface QuestionBulkUploadRequest {
  commit?: boolean;
  csvContent?: string;
  instituteId: string;
  questions?: QuestionBulkUploadQuestionInput[];
}

export type QuestionBulkUploadRowAction = "create" | "update" | "none";

export interface QuestionBulkUploadRowResult {
  action: QuestionBulkUploadRowAction;
  errors: string[];
  questionId: string | null;
  rowNumber: number;
  uniqueKey: string | null;
  warnings: string[];
}

export interface QuestionBulkUploadSummary {
  created: number;
  invalid: number;
  received: number;
  updated: number;
  valid: number;
  warnings: number;
}

export interface QuestionBulkUploadResult {
  commitRequested: boolean;
  committed: boolean;
  rows: QuestionBulkUploadRowResult[];
  summary: QuestionBulkUploadSummary;
  uploadLogId: string | null;
  uploadLogPath: string | null;
}

export interface VendorCalibrationPushRequest {
  targetInstitutes: string[];
  versionId: string;
}

export interface DeployedInstituteCalibrationResult {
  calibrationPath: string;
  calibrationHistoryPath: string;
  instituteId: string;
  licensePath: string;
  compatibilityLicensePath: string;
}

export interface DeployCalibrationVersionResult {
  calibrationSourcePath: string;
  deployedInstituteCount: number;
  deployedInstitutes: DeployedInstituteCalibrationResult[];
  deploymentLogId: string;
  vendorCalibrationLogPath: string;
  versionId: string;
}
