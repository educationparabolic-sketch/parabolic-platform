/** Shared BWM-034 Vendor institute, onboarding, and administrator contracts. */

export type VendorInstituteAccessStatus = "active" | "suspended";

export type VendorInstituteClaimPropagationState =
  | "not_required"
  | "pending"
  | "processing"
  | "retrying"
  | "succeeded"
  | "superseded"
  | "failed";

export interface VendorInstituteClaimPropagationReceipt {
  authorizationVersion: number;
  browserDeadlineAt: string | null;
  operationId: string | null;
  serverDeadlineAt: string | null;
  state: VendorInstituteClaimPropagationState;
}

export type VendorInstituteLifecycleState =
  | "onboarding"
  | "active"
  | "suspended"
  | "archived"
  | "deletion_scheduled"
  | "purging"
  | "purged"
  | "recovery_required";

export type VendorInstituteLifecycleTransition =
  | {action: "activate_onboarding"; from: "onboarding"; to: "active"}
  | {action: "suspend"; from: "active"; to: "suspended"}
  | {action: "restore"; from: "suspended"; to: "active"}
  | {
      action: "archive";
      from: "onboarding" | "active" | "suspended";
      to: "archived";
    }
  | {action: "schedule_deletion"; from: "archived"; to: "deletion_scheduled"}
  | {action: "cancel_deletion"; from: "deletion_scheduled"; to: "archived"}
  | {action: "execute_purge"; from: "deletion_scheduled"; to: "purging"}
  | {action: "complete_purge"; from: "purging"; to: "purged"}
  | {action: "fail_purge"; from: "purging"; to: "recovery_required"}
  | {action: "retry_purge"; from: "recovery_required"; to: "purging"};

export type VendorInstituteLicenseLayer = "L0" | "L1" | "L2" | "L3";

export type VendorInstituteLicenseState = "active" | "grace" | "expired";

export interface VendorCommandMetadata {
  /** Client-generated UUID. Only an actor/target-scoped SHA-256 hash is persisted. */
  idempotencyKey: string;
}

export interface VendorRevisionedCommandMetadata extends VendorCommandMetadata {
  /** Revision observed by the caller. Stale commands fail with a conflict. */
  expectedRevision: number;
}

export interface VendorCursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface VendorInstituteListQuery {
  cursor?: string;
  /** Defaults to 25 and may not exceed 50. */
  limit?: number;
  lifecycleState?: VendorInstituteLifecycleState;
  licenseLayer?: VendorInstituteLicenseLayer;
  query?: string;
}

export interface VendorInstituteAggregateSummary {
  /** Null means no authoritative aggregate exists; zero is never fabricated. */
  activeStudentCount: number | null;
  /** Timestamp of the source aggregate, or null when unavailable. */
  aggregateAsOf: string | null;
  lastActiveAt: string | null;
  monthlyTestRuns: number | null;
}

export interface VendorInstituteCommercialReference {
  /** BWM-035 owns mutation of these fields. BWM-034 projects them read-only. */
  authorityState: "available" | "not_configured" | "invalid";
  licenseLayer: VendorInstituteLicenseLayer | null;
  licenseState: VendorInstituteLicenseState | null;
  licenseVersion: string | null;
  planId: string | null;
}

export interface VendorPrimaryAdministratorSummary {
  displayName: string;
  email: string;
  invitationStatus:
    | "not_sent"
    | "queued"
    | "delivered"
    | "failed"
    | "revoked"
    | "accepted";
  status: "invitation_pending" | "active" | "suspended";
  updatedAt: string;
  userId: string;
}

export interface VendorInstituteSummary {
  accessStatus: VendorInstituteAccessStatus;
  aggregate: VendorInstituteAggregateSummary;
  commercial: VendorInstituteCommercialReference;
  createdAt: string;
  instituteId: string;
  lifecycleState: VendorInstituteLifecycleState;
  primaryAdministrator: VendorPrimaryAdministratorSummary | null;
  registeredName: string;
  revision: number;
  updatedAt: string;
}

export interface VendorInstituteListResult
  extends VendorCursorPage<VendorInstituteSummary> {
  /** Filtered aggregate count; it is not derived by loading the complete page set. */
  totalMatching: number;
}

export type VendorInstituteDeletionStage =
  | "none"
  | "scheduled"
  | "quiescing"
  | "purging"
  | "failed"
  | "purged";

export interface VendorInstituteDeletionSummary {
  eligibleAt: string | null;
  lastErrorCode: string | null;
  operationId: string | null;
  scheduledAt: string | null;
  stage: VendorInstituteDeletionStage;
}

export interface VendorInstituteProfile {
  /** Registered identity is Vendor-owned. Institute settings own local profile fields. */
  registeredName: string;
  vendorAccountReference: string | null;
}

export interface VendorInstituteAdministratorRecord
  extends VendorPrimaryAdministratorSummary {
  isPrimaryAdministrator: boolean;
  role: "admin" | "teacher" | "director";
}

export interface VendorInstituteDetail extends VendorInstituteSummary {
  /** Bounded by the existing 100-record settingsUsers limit. */
  administrators: VendorInstituteAdministratorRecord[];
  deletion: VendorInstituteDeletionSummary;
  profile: VendorInstituteProfile;
  settingsRevision: number;
}

export interface VendorInstituteCreateIntent extends VendorCommandMetadata {
  expectedOnboardingRevision: number;
  onboardingId: string;
}

export interface VendorInstituteCreateReceipt {
  auditEventId: string;
  commandId: string;
  completedAt: string;
  institute: VendorInstituteDetail;
  replayed: boolean;
}

export interface VendorInstituteProfileUpdateIntent
  extends VendorRevisionedCommandMetadata {
  profile: {
    registeredName?: string;
    vendorAccountReference?: string | null;
  };
}

export interface VendorInstituteMutationReceipt {
  auditEventId: string;
  commandId: string;
  completedAt: string;
  deletion: VendorInstituteDeletionSummary;
  instituteId: string;
  lifecycleState: VendorInstituteLifecycleState;
  /** Durable BWM-036 operation receipt; no per-user details are exposed. */
  propagation: VendorInstituteClaimPropagationReceipt;
  propagationState: VendorInstituteClaimPropagationState;
  replayed: boolean;
  revision: number;
}

export type VendorInstituteLifecycleIntent =
  | ({
      action: "suspend";
      reason: string;
    } & VendorRevisionedCommandMetadata)
  | ({
      action: "restore";
      reason: string;
    } & VendorRevisionedCommandMetadata)
  | ({
      action: "archive";
      reason: string;
    } & VendorRevisionedCommandMetadata)
  | ({
      action: "schedule_deletion";
      /** Browser confirmation is an explicit guard, never target authority. */
      confirmInstituteId: string;
      reason: string;
    } & VendorRevisionedCommandMetadata)
  | ({
      action: "cancel_deletion";
      reason: string;
    } & VendorRevisionedCommandMetadata)
  | ({
      action: "execute_purge" | "retry_purge";
      confirmInstituteId: string;
    } & VendorRevisionedCommandMetadata);

export type VendorOnboardingStatus =
  | "draft"
  | "pending_review"
  | "information_required"
  | "approved"
  | "institute_provisioned"
  | "awaiting_commercial_authority"
  | "ready_for_administrator"
  | "setup_in_progress"
  | "ready_for_activation"
  | "active"
  | "rejected"
  | "expired";

export type VendorOnboardingTransition =
  | {action: "submit"; from: "draft" | "information_required"; to: "pending_review"}
  | {action: "request_information"; from: "pending_review"; to: "information_required"}
  | {action: "approve"; from: "pending_review"; to: "approved"}
  | {action: "reject"; from: "pending_review"; to: "rejected"}
  | {action: "expire"; from: "draft" | "pending_review" | "information_required"; to: "expired"}
  | {action: "create_institute"; from: "approved"; to: "institute_provisioned"}
  | {
      action: "await_commercial_authority";
      from: "institute_provisioned";
      to: "awaiting_commercial_authority";
    }
  | {
      action: "commercial_authority_ready";
      from: "awaiting_commercial_authority";
      to: "ready_for_administrator";
    }
  | {
      action: "primary_administrator_ready";
      from: "ready_for_administrator";
      to: "setup_in_progress";
    }
  | {
      action: "setup_requirements_complete";
      from: "setup_in_progress";
      to: "ready_for_activation";
    }
  | {action: "activate"; from: "ready_for_activation"; to: "active"};

export interface VendorOnboardingApplicationIntent {
  expectedConcurrentStudents: number;
  expectedExamSessionsPerMonth: number;
  expectedStudents: number;
  instituteType: string;
  location: string;
  primaryContactEmail: string;
  primaryContactName: string;
  primaryContactPhone: string;
  registeredName: string;
  timezone: string;
}

export interface VendorOnboardingCreateIntent extends VendorCommandMetadata {
  application: VendorOnboardingApplicationIntent;
  saveAs: "draft" | "pending_review";
}

export interface VendorOnboardingSummary {
  createdAt: string;
  instituteId: string | null;
  onboardingId: string;
  primaryContactEmail: string;
  registeredName: string;
  revision: number;
  status: VendorOnboardingStatus;
  updatedAt: string;
}

export interface VendorOnboardingListQuery {
  cursor?: string;
  /** Defaults to 25 and may not exceed 50. */
  limit?: number;
  query?: string;
  status?: VendorOnboardingStatus;
}

export interface VendorOnboardingListResult
  extends VendorCursorPage<VendorOnboardingSummary> {
  totalMatching: number;
}

export interface VendorOnboardingDetailQuery {
  eventsCursor?: string;
  /** Defaults to 25 and may not exceed 50. */
  eventsLimit?: number;
}

export interface VendorOnboardingEvent {
  actorUserId: string;
  eventId: string;
  occurredAt: string;
  revision: number;
  summary: string;
  type: VendorOnboardingStatus | "application_updated" | "institute_created";
}

export interface VendorOnboardingDetail extends VendorOnboardingSummary {
  activationBlockers: Array<
    | "commercial_authority_missing"
    | "institute_not_provisioned"
    | "primary_administrator_missing"
    | "profile_not_verified"
    | "settings_incomplete"
  >;
  application: VendorOnboardingApplicationIntent;
  commercialReadiness: "not_configured" | "configured" | "invalid";
  events: VendorCursorPage<VendorOnboardingEvent>;
  initialSettingsComplete: boolean;
  primaryAdministrator: VendorPrimaryAdministratorSummary | null;
  profileVerified: boolean;
}

export interface VendorOnboardingCreateReceipt {
  auditEventId: string;
  commandId: string;
  completedAt: string;
  onboarding: VendorOnboardingDetail;
  replayed: boolean;
}

export type VendorOnboardingCommandIntent =
  | ({
      action: "submit" | "approve" | "request_information" | "expire";
      note: string;
    } & VendorRevisionedCommandMetadata)
  | ({
      action: "reject";
      reason: string;
    } & VendorRevisionedCommandMetadata)
  | ({
      action: "update_application";
      application: VendorOnboardingApplicationIntent;
    } & VendorRevisionedCommandMetadata)
  | ({
      /** Reconcile reads commercial/admin authority; it never accepts readiness booleans. */
      action:
        | "verify_profile"
        | "reconcile_prerequisites"
        | "complete_initial_settings"
        | "activate";
    } & VendorRevisionedCommandMetadata);

export interface VendorOnboardingCommandReceipt {
  auditEventId: string;
  commandId: string;
  completedAt: string;
  instituteId: string | null;
  onboardingId: string;
  replayed: boolean;
  revision: number;
  status: VendorOnboardingStatus;
}

export interface VendorPrimaryAdministratorIntent {
  displayName: string;
  email: string;
}

export type VendorAdministratorCommandIntent =
  | ({
      action: "invite_primary" | "propose_primary_replacement";
      administrator: VendorPrimaryAdministratorIntent;
    } & VendorRevisionedCommandMetadata)
  | ({
      action:
        | "resend_primary_invitation"
        | "reset_primary_access"
        | "suspend_primary_access"
        | "restore_primary_access"
        | "revoke_primary_invitation"
        /** Requires current verified-email and sign-in Auth readiness. */
        | "activate_primary_replacement";
      targetUserId: string;
    } & VendorRevisionedCommandMetadata);

export interface VendorAdministratorCommunicationReceipt {
  communicationId: string;
  kind: "primary_administrator_invitation" | "primary_administrator_password_reset";
  status: "queued" | "delivered" | "failed";
}

export interface VendorAdministratorCommandReceipt {
  auditEventId: string;
  commandId: string;
  communication?: VendorAdministratorCommunicationReceipt;
  completedAt: string;
  instituteId: string;
  primaryAdministrator: VendorPrimaryAdministratorSummary | null;
  reconciliationState: "complete" | "pending" | "blocked_missing_entitlement";
  replayed: boolean;
  settingsRevision: number;
}
