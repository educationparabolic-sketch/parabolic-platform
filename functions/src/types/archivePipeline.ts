import {StandardApiErrorCode} from "./apiResponse";
import type {
  AdminAcademicYearArchiveReceipt,
} from "../../../shared/contracts/adminSettings";

export interface AcademicYearArchiveRequest {
  academicYearId?: string;
  commandId?: string;
  confirmIrreversibleArchive?: boolean;
  expectedRevision?: number;
  targetInstituteId?: string;
}

export interface AcademicYearArchiveValidatedRequest {
  academicYearId: string;
  actorId: string;
  actorRole: string;
  commandId: string;
  confirmIrreversibleArchive: true;
  expectedRevision: number;
  instituteId: string;
  ipAddress?: string;
  isVendor: boolean;
  userAgent?: string;
}

export interface ArchiveBigQuerySessionRow {
  academic_year: string;
  accuracy_percent: number | null;
  batch_id: string | null;
  calibration_version: string | null;
  consecutive_wrong_streak_max: number | null;
  created_at: string | null;
  discipline_index: number | null;
  duration_seconds: number | null;
  easy_neglect_signal: boolean | null;
  easy_remaining_after_phase1_percent: number | null;
  exam_type: string | null;
  guess_rate_percent: number | null;
  hard_bias_signal: boolean | null;
  hard_in_phase1_percent: number | null;
  institute_id: string;
  max_time_violation_percent: number | null;
  min_time_violation_percent: number | null;
  mode: string | null;
  phase_adherence_percent: number | null;
  phase_deviation_percent: number | null;
  rank_in_batch: number | null;
  raw_score_percent: number | null;
  risk_cluster: string | null;
  risk_score: number | null;
  run_id: string;
  rush_signal: boolean | null;
  session_id: string;
  skip_burst_count: number | null;
  skip_burst_signal: boolean | null;
  student_id: string;
  submitted_at: string | null;
  template_id: string | null;
  wrong_streak_signal: boolean | null;
}

export type AcademicYearArchiveResult = AdminAcademicYearArchiveReceipt;

export interface AcademicYearArchiveSuccessResponse {
  code: "OK";
  data: AcademicYearArchiveResult;
  message: string;
  requestId: string;
  success: true;
  timestamp: string;
}

/**
 * Raised when archive input or lifecycle state is invalid.
 */
export class AcademicYearArchiveValidationError extends Error {
  public readonly code: StandardApiErrorCode;

  /**
   * @param {StandardApiErrorCode} code Stable API error code.
   * @param {string} message Safe archive validation detail.
   */
  constructor(code: StandardApiErrorCode, message: string) {
    super(message);
    this.name = "AcademicYearArchiveValidationError";
    this.code = code;
  }
}
