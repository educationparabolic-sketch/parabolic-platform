/* eslint-disable require-jsdoc */
import {StandardApiErrorCode} from "./apiResponse";

export type AdminLicensingActionType = "GET_LICENSE_SNAPSHOT";
export type LicenseLayer = "L0" | "L1" | "L2" | "L3";
export type LicensingCapabilityState = "enabled" | "locked";
export type LicensingEligibilityStatus = "eligible" | "in_progress" | "locked";

export interface LicensingCurrentPlanSnapshot {
  currentLayer: LicenseLayer;
  planName: string;
  licenseStartDate: string;
  expiryDate: string;
  renewalDate: string;
  billingCycle: string;
  activeStudentCount: number;
  maxStudentLimit: number;
  concurrencyLimit: number;
  attemptsUsedThisMonth: number;
  attemptsQuotaThisMonth: number;
}

export interface LicensingFeatureMatrixRow {
  feature: string;
  description: string;
  layers: Record<LicenseLayer, LicensingCapabilityState>;
}

export interface LicensingEligibilityChecklistItem {
  id: string;
  label: string;
  met: boolean;
}

export interface LicensingEligibilityStageSnapshot {
  stage: string;
  label: string;
  status: LicensingEligibilityStatus;
  summary: string;
  checklist: LicensingEligibilityChecklistItem[];
  progressCurrent: number;
  progressTarget: number;
}

export interface LicensingUsageAndBillingSnapshot {
  activeStudents: number;
  maxStudentsAllowed: number;
  remainingStudentSlots: number;
  attemptsUsed: number;
  attemptsRemaining: number;
  peakConcurrency: number;
  maxConcurrentAllowed: number;
  estimatedCurrentBill: string;
  nextBillingDate: string;
  actions: {
    downloadInvoiceUrl: string;
    viewBillingHistoryUrl: string;
    updatePaymentMethodUrl: string;
    contactSupportUrl: string;
  };
}

export interface LicensingUpgradePreviewSnapshot {
  currentLayer: LicenseLayer;
  previewCards: string[];
  requestUpgradeUrl: string;
  scheduleEvaluationUrl: string;
}

export interface LicensingHistoryEntrySnapshot {
  eventId: string;
  timestamp: string;
  previousLayer: LicenseLayer;
  newLayer: LicenseLayer;
  billingChange: string;
  reason: string;
  actor: string;
}

export interface AdminLicensingSnapshot {
  currentPlan: LicensingCurrentPlanSnapshot;
  featureMatrix: LicensingFeatureMatrixRow[];
  eligibilityProgress: LicensingEligibilityStageSnapshot[];
  usageAndBilling: LicensingUsageAndBillingSnapshot;
  upgradePreview: LicensingUpgradePreviewSnapshot;
  licenseHistory: LicensingHistoryEntrySnapshot[];
}

export interface AdminLicensingRequest {
  instituteId: string;
  actionType: AdminLicensingActionType;
}

export interface AdminLicensingValidatedRequest extends AdminLicensingRequest {
  actorId: string;
  actorRole: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AdminLicensingResult {
  actionType: AdminLicensingActionType;
  snapshot: AdminLicensingSnapshot;
}

export interface AdminLicensingSuccessResponse {
  success: true;
  code: "OK";
  message: string;
  data: AdminLicensingResult;
  requestId: string;
  timestamp: string;
}

export class AdminLicensingValidationError extends Error {
  public readonly code: StandardApiErrorCode;

  constructor(code: StandardApiErrorCode, message: string) {
    super(message);
    this.name = "AdminLicensingValidationError";
    this.code = code;
  }
}
