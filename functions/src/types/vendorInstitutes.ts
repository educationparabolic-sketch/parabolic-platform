/* eslint-disable require-jsdoc */
import {StandardApiErrorCode} from "./apiResponse";
import type {
  VendorInstituteCreateIntent,
  VendorInstituteCreateReceipt,
  VendorInstituteDetail,
  VendorInstituteLifecycleIntent,
  VendorInstituteListQuery,
  VendorInstituteListResult,
  VendorInstituteMutationReceipt,
  VendorInstituteProfileUpdateIntent,
  VendorAdministratorCommandIntent,
  VendorAdministratorCommandReceipt,
  VendorOnboardingCommandIntent,
  VendorOnboardingCommandReceipt,
  VendorOnboardingCreateIntent,
  VendorOnboardingCreateReceipt,
  VendorOnboardingDetail,
  VendorOnboardingDetailQuery,
  VendorOnboardingListQuery,
  VendorOnboardingListResult,
} from "../../../shared/contracts/vendorInstitutes";

export type {
  VendorInstituteAggregateSummary,
  VendorInstituteCommercialReference,
  VendorInstituteCreateIntent,
  VendorInstituteCreateReceipt,
  VendorInstituteDeletionSummary,
  VendorInstituteDetail,
  VendorInstituteLifecycleIntent,
  VendorInstituteListQuery,
  VendorInstituteListResult,
  VendorInstituteMutationReceipt,
  VendorInstituteProfileUpdateIntent,
  VendorInstituteSummary,
  VendorAdministratorCommandIntent,
  VendorAdministratorCommandReceipt,
  VendorAdministratorCommunicationReceipt,
  VendorOnboardingCommandIntent,
  VendorOnboardingCommandReceipt,
  VendorOnboardingCreateIntent,
  VendorOnboardingCreateReceipt,
  VendorOnboardingDetail,
  VendorOnboardingDetailQuery,
  VendorOnboardingListQuery,
  VendorOnboardingListResult,
  VendorOnboardingSummary,
  VendorPrimaryAdministratorSummary,
} from "../../../shared/contracts/vendorInstitutes";

export interface VendorInstituteReadContext {
  actorId: string;
  actorRole: "vendor";
}

export interface VendorInstituteCommandContext
  extends VendorInstituteReadContext {
  ipAddress?: string;
  userAgent?: string;
}

export interface VendorInstituteListValidatedRequest
  extends VendorInstituteReadContext, VendorInstituteListQuery {
  limit: number;
}

export interface VendorInstituteDetailValidatedRequest
  extends VendorInstituteReadContext {
  instituteId: string;
}

export interface VendorInstituteCreateValidatedRequest
  extends VendorInstituteCommandContext, VendorInstituteCreateIntent {}

export interface VendorInstituteProfileUpdateValidatedRequest
  extends VendorInstituteCommandContext {
  command: VendorInstituteProfileUpdateIntent;
  instituteId: string;
}

export interface VendorInstituteLifecycleValidatedRequest
  extends VendorInstituteCommandContext {
  command: VendorInstituteLifecycleIntent;
  instituteId: string;
}

export interface VendorOnboardingListValidatedRequest
  extends VendorInstituteReadContext, VendorOnboardingListQuery {
  limit: number;
}

export interface VendorOnboardingDetailValidatedRequest
  extends VendorInstituteReadContext, VendorOnboardingDetailQuery {
  eventsLimit: number;
  onboardingId: string;
}

export interface VendorOnboardingCreateValidatedRequest
  extends VendorInstituteCommandContext, VendorOnboardingCreateIntent {}

export interface VendorOnboardingCommandValidatedRequest
  extends VendorInstituteCommandContext {
  command: VendorOnboardingCommandIntent;
  onboardingId: string;
}

export interface VendorAdministratorCommandValidatedRequest
  extends VendorInstituteCommandContext {
  command: VendorAdministratorCommandIntent;
  instituteId: string;
}

export type VendorInstituteListServiceResult = VendorInstituteListResult;
export type VendorInstituteDetailServiceResult = VendorInstituteDetail;
export type VendorInstituteCreateServiceResult = VendorInstituteCreateReceipt;
export type VendorInstituteMutationServiceResult = VendorInstituteMutationReceipt;
export type VendorOnboardingListServiceResult = VendorOnboardingListResult;
export type VendorOnboardingDetailServiceResult = VendorOnboardingDetail;
export type VendorOnboardingCreateServiceResult = VendorOnboardingCreateReceipt;
export type VendorOnboardingCommandServiceResult = VendorOnboardingCommandReceipt;
export type VendorAdministratorCommandServiceResult = VendorAdministratorCommandReceipt;

export class VendorInstituteValidationError extends Error {
  constructor(
    public readonly code: StandardApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "VendorInstituteValidationError";
  }
}
