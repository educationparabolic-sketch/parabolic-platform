/** Shared BWM-036 institute authorization propagation and convergence contract. */

export declare const CLAIM_PROPAGATION_SCHEMA_VERSION: 1;
export declare const CLAIM_PROPAGATION_PAGE_SIZE: 100;
export declare const CLAIM_PROPAGATION_LEASE_SECONDS: 60;
export declare const CLAIM_PROPAGATION_MAX_ATTEMPTS: 5;
export declare const CLAIM_PROPAGATION_RETRY_DELAYS_SECONDS:
  readonly [5, 15, 30, 60];
export declare const CLAIM_PROPAGATION_SERVER_SLA_SECONDS: 240;
export declare const CLAIM_PROPAGATION_BROWSER_SLA_SECONDS: 300;
export declare const CLAIM_PROPAGATION_TOKEN_REFRESH_SECONDS: 60;
export declare const CLAIM_PROPAGATION_SCHEDULE_MINUTES: 1;
export declare const CLAIM_PROPAGATION_SWEEP_MAX_OPERATIONS: 100;

export type ClaimPropagationLicenseLayer = "L0" | "L1" | "L2" | "L3";
export type ClaimPropagationLicenseState = "active" | "grace" | "expired";
export type ClaimPropagationInstituteAccess = "active" | "suspended";

export interface ClaimPropagationFeatureFlags {
  adaptivePhase: boolean;
  controlledMode: boolean;
  governanceAccess: boolean;
  hardMode: boolean;
  riskOverview: boolean;
}

/**
 * Immutable entitlement/access target identified by one monotonically
 * increasing institute-root authorizationVersion. Mutable usage counts are
 * intentionally excluded from Firebase custom claims.
 */
export interface ClaimPropagationDesiredAuthority {
  activeStudentLimit: number;
  authorizationVersion: number;
  concurrentSessionLimit: number;
  expiryDate: string | null;
  featureFlags: ClaimPropagationFeatureFlags;
  gracePeriodEndsAt: string | null;
  instituteAccess: ClaimPropagationInstituteAccess;
  instituteId: string;
  instituteRevision: number;
  licenseLayer: ClaimPropagationLicenseLayer;
  licenseState: ClaimPropagationLicenseState;
  licenseVersion: string;
}

/** Claims are server-authored; limits and mutable usage never enter the token. */
export interface ClaimPropagationManagedClaimTarget {
  authorizationVersion: number;
  expiryDate: string | null;
  featureFlags: ClaimPropagationFeatureFlags;
  gracePeriodEndsAt: string | null;
  instituteId: string;
  isSuspended: boolean;
  licenseLayer: ClaimPropagationLicenseLayer;
  licenseState: ClaimPropagationLicenseState;
  licenseVersion: string;
}

export type ClaimPropagationSource =
  | "institute_suspended"
  | "institute_restored"
  | "institute_archived"
  | "license_changed"
  | "stripe_entitlement_reconciled"
  | "commercial_entitlement_reconciled"
  | "license_expired"
  | "grace_expired";

export type ClaimPropagationOperationState =
  | "pending"
  | "processing"
  | "retrying"
  | "succeeded"
  | "superseded"
  | "dead_lettered";

export type ClaimPropagationDeliveryState =
  | "pending"
  | "processing"
  | "retrying"
  | "synchronized"
  | "missing"
  | "superseded"
  | "dead_lettered";

export type ClaimPropagationIdentityKind = "staff" | "student";
export type ClaimPropagationOperationId = `v${number}`;

export interface ClaimPropagationEnumerationCheckpoint {
  pageSize: 100;
  staffComplete: boolean;
  studentCursor: string | null;
  studentsComplete: boolean;
}

export interface ClaimPropagationCounts {
  claimsChanged: number;
  deadLettered: number;
  discovered: number;
  missing: number;
  refreshTokensRevoked: number;
  synchronized: number;
}

/**
 * Stored at
 * institutes/{instituteId}/claimPropagationOperations/{operationId}.
 * Within that institute scope, the operation ID is exactly
 * `v{authorizationVersion}`.
 */
export interface ClaimPropagationOperationRecord {
  attemptCount: number;
  auditEventId: string;
  browserDeadlineAt: string;
  completedAt: string | null;
  counts: ClaimPropagationCounts;
  createdAt: string;
  desiredAuthority: ClaimPropagationDesiredAuthority;
  enumeration: ClaimPropagationEnumerationCheckpoint;
  instituteId: string;
  lastErrorCode: string | null;
  leaseExpiresAt: string | null;
  leaseOwnerHash: string | null;
  maxAttempts: 5;
  nextAttemptAt: string | null;
  operationId: ClaimPropagationOperationId;
  schemaVersion: 1;
  serverDeadlineAt: string;
  source: ClaimPropagationSource;
  state: ClaimPropagationOperationState;
  supersededByOperationId: string | null;
  updatedAt: string;
}

/**
 * Stored at institutes/{instituteId}/claimPropagationOperations/
 * {operationId}/deliveries/{uid}. Raw tokens, credentials, and claim payloads
 * are never persisted.
 */
export interface ClaimPropagationDeliveryRecord {
  attemptCount: number;
  authorizationVersion: number;
  claimsChanged: boolean | null;
  completedAt: string | null;
  identityKind: ClaimPropagationIdentityKind;
  lastErrorCode: string | null;
  leaseExpiresAt: string | null;
  leaseOwnerHash: string | null;
  nextAttemptAt: string | null;
  refreshTokensRevoked: boolean;
  state: ClaimPropagationDeliveryState;
  uid: string;
  updatedAt: string;
}

export type ClaimPropagationPublicState =
  | "not_required"
  | "pending"
  | "processing"
  | "retrying"
  | "succeeded"
  | "superseded"
  | "failed";

/** Safe control-plane projection; it contains no per-user identity or claim. */
export interface ClaimPropagationPublicReceipt {
  authorizationVersion: number;
  browserDeadlineAt: string | null;
  operationId: string | null;
  serverDeadlineAt: string | null;
  state: ClaimPropagationPublicState;
}

export type InstituteAuthorityFreshnessDisposition =
  | "current"
  | "stale"
  | "suspended"
  | "license_restricted";

/** Every institute-bound backend request compares this version before work. */
export interface InstituteAuthorityFreshnessDecision {
  currentAuthorizationVersion: number;
  disposition: InstituteAuthorityFreshnessDisposition;
  presentedAuthorizationVersion: number | null;
}

export type InstituteSessionEnforcementReason =
  | "current"
  | "stale_authorization_version"
  | "institute_suspended"
  | "license_expired"
  | "license_downgrade"
  | "active_student_limit"
  | "concurrent_session_limit";

export type InstituteSessionEnforcementDisposition =
  | "allow"
  | "deny_new"
  | "interrupt_recoverable";

/**
 * Upgrades do not rewrite an active Exam runtime snapshot. Suspension,
 * expiration, or a downgrade below its required authority blocks subsequent
 * writes and preserves the session for explicit recovery; the browser never
 * auto-submits or invents a terminal result.
 */
export interface InstituteSessionEnforcementDecision {
  disposition: InstituteSessionEnforcementDisposition;
  reason: InstituteSessionEnforcementReason;
}

export type ClaimPropagationBrowserAction =
  | "accept_refreshed_authority"
  | "force_refresh"
  | "show_license_restricted"
  | "show_suspended"
  | "interrupt_exam_recoverable"
  | "sign_out";

/**
 * BWM-040 owns broader Vendor health/read models. BWM-052 owns production IAM
 * and provider configuration. BWM-053 owns deployed indexes, schedules, and
 * authorizationVersion/limit backfills. None may replace this operation truth.
 */
export interface ClaimPropagationOwnershipBoundary {
  auditAndHealthReadModelOwner: "BWM-040";
  deployedInfrastructureOwner: "BWM-053";
  productionIamOwner: "BWM-052";
}
