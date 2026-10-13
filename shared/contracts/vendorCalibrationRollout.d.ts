/** BWM-039 / DEC-071 shared declaration; secured transport is implemented.
 * Internal atomic apply/rollback runtime: functions/src/services/calibrationRollout.ts.
 * Mounted immediate publish/status/inverse adoption is BWM-039 substep seven.
 * Creation, scheduling, global activation and unified audit are not supported.
 * All objects are closed; reject unknown keys, coercion and fabricated defaults.
 * Current revocation-checked enabled/non-suspended Vendor +
 * vendor.calibration.manage is required for commands and single-operation reads.
 */
export interface VendorCalibrationRolloutTarget {
  /** [A-Za-z0-9_-]{1,128}; 1..20 unique targets, never deduplicate silently. */
  instituteId: string;
  /** null means no institute pointer, not a missing precondition. */
  expectedCalibrationVersion: string | null;
}

/** Replacement VEN-02 POST /vendor/calibration/push; legacy DTO is NOT accepted
 * by the rollout handler. No dual parser or implicit key/precondition.
 */
export interface VendorCalibrationRolloutRequest {
  /** Canonical lowercase UUID v4; retain across uncertain completion/retry. */
  idempotencyKey: string;
  versionId: string;
  targets: VendorCalibrationRolloutTarget[];
}

/** VEN-39 POST /vendor/calibration/operations/{operationId}/rollback. */
export interface VendorCalibrationRollbackRequest {
  idempotencyKey: string;
  /** Positive safe integer; original completed apply revision must match. */
  expectedOperationRevision: number;
}

/** Absence must be restored with field deletion, not synthesized null. */
export type VendorCalibrationPointer =
  | {present: false}
  | {present: true; value: string | null};

export interface VendorCalibrationTargetSnapshot {
  instituteId: string;
  institutePointer: VendorCalibrationPointer;
  currentLicensePointer: VendorCalibrationPointer;
  compatibilityLicensePointer: VendorCalibrationPointer;
}

export type VendorCalibrationFailureCode =
  | "INVALID_SOURCE" | "INVALID_TARGET" | "TARGET_CONFLICT"
  | "OPERATION_CONFLICT" | "APPLY_FAILED";

export interface VendorCalibrationTargetOutcome<State extends "applied" | "not_applied"> {
  instituteId: string;
  state: State;
  before: VendorCalibrationTargetSnapshot;
  after: VendorCalibrationTargetSnapshot;
  calibrationPath: string;
  calibrationHistoryPath: string;
}

/** Stored exact terminal receipt; never add a replay flag/timestamp on replay.
 * A rollback has its own operation ID/receipt and applied inverse outcomes.
 * Successful targets reconcile exactly to sorted request targets; failed receipts have
 * zero applied targets, before=after, and no invented missing-source snapshot.
 */
export type VendorCalibrationOperationReceipt = {
  schemaVersion: 1;
  operationId: string;
  kind: "rollout" | "rollback";
  originalOperationId: string | null;
  revision: number;
  versionId: string;
  completedAt: string;
  vendorCalibrationLogPath: string;
} & ({
  state: "applied";
  targets: VendorCalibrationTargetOutcome<"applied">[];
  failureCode: null;
} | {
  state: "not_applied";
  /** Validated snapshots only; may be empty when preflight cannot capture all. */
  targets: VendorCalibrationTargetOutcome<"not_applied">[];
  failureCode: VendorCalibrationFailureCode;
});

/** VEN-38 GET /vendor/calibration/operations/{operationId}; no list/query scan.
 * Current Vendor scope must match; omit actor, hash, fingerprint and internals.
 * Pending is uncertainty, not permission to issue a fresh command/key.
 */
export type VendorCalibrationOperationResult = {
  operationId: string;
  revision: number;
  state: "pending";
  receipt: null;
  rollbackOperationId: null;
} | {
  operationId: string;
  revision: number;
  state: "applied";
  receipt: Extract<VendorCalibrationOperationReceipt, {state: "applied"}>;
  rollbackOperationId: null;
} | {
  operationId: string;
  revision: number;
  state: "not_applied";
  receipt: Extract<VendorCalibrationOperationReceipt, {state: "not_applied"}>;
  rollbackOperationId: null;
} | {
  operationId: string;
  revision: number;
  state: "rolled_back";
  /** Original apply receipt is immutable, even after inverse application. */
  receipt: Extract<VendorCalibrationOperationReceipt, {state: "applied"}>;
  rollbackOperationId: string;
};

/** Server-only journal. Timestamp strings below describe ISO wire/storage
 * projections; Firestore adapters must validate actual timestamp authority.
 */
export interface VendorCalibrationOperationRecord {
  schemaVersion: 1;
  operationId: string;
  vendorUid: string;
  kind: "rollout" | "rollback";
  keyHash: string;
  requestFingerprint: string;
  sourceFingerprint: string | null;
  originalOperationId: string | null;
  expectedOperationRevision: number | null;
  versionId: string;
  targets: VendorCalibrationRolloutTarget[];
  snapshots: VendorCalibrationTargetSnapshot[];
  state: "pending" | "applied" | "not_applied" | "rolled_back";
  revision: number;
  createdAt: string;
  updatedAt: string;
  receipt: VendorCalibrationOperationReceipt | null;
  rollbackOperationId: string | null;
}

/** Server-only create-once root fact; target history uses this same authority
 * projected to exactly one institute outcome. Preflight failures may have no
 * captured target outcomes; retain requested IDs without inventing snapshots.
 */
export interface VendorCalibrationTerminalLog {
  schemaVersion: 1;
  operationId: string;
  vendorUid: string;
  requestFingerprint: string;
  sourceFingerprint: string | null;
  requestedInstituteIds: string[];
  receipt: VendorCalibrationOperationReceipt;
}

/** Runtime adoption must enforce these requirements; declarations alone do not.
 * Identity: SHA-256 of JSON.stringify([1,vendorUid,kind,lowercaseUuid]) in UTF-8
 * gives keyHash; operationId = "cal_" + keyHash (lowercase hex). Never store raw
 * keys. Fingerprint: SHA-256 JSON.stringify([1,kind,versionId,sorted target
 * [instituteId,expectedCalibrationVersion] pairs]) for apply; rollback uses
 * [1,kind,originalOperationId,expectedOperationRevision]. Sort by ASCII ID.
 * Source fingerprint: SHA-256 JSON.stringify([1,versionId,
 * [guessWeight,phaseWeight,easyNeglectWeight,hardBiasWeight,wrongStreakWeight],
 * [guessFactorEasy,guessFactorMedium,guessFactorHard,phaseDeviationThreshold],
 * createdBy,createdAt,activationDate,isActive]); ISO dates and null activation.
 * source path/identity must match. Re-read source/targets inside apply transaction.
 * Same scoped key + same fingerprint returns exact stored receipt; changed
 * semantics conflict. Terminal not_applied replays failure; corrected intent
 * requires a new key. Pending may be safely resumed against the same journal.
 * Reserve pending journal first (revision 1, no target mutation). Apply atomically
 * creates immutable institute version copies, updates institute plus BOTH existing
 * validated license mirrors, terminal journal (revision 2), root log and target
 * histories. A failure before commit never applies any target; terminalize failure
 * in a separate guarded journal/log transaction. If that write fails, keep pending
 * uncertainty, not fabricated terminal failure. Lost commit response rereads journal.
 * Immutable copy collision is reusable only if complete source fingerprint matches;
 * otherwise conflict, never merge/overwrite. Inactive non-future valid global
 * candidate is allowed; institute copy becomes active, global authority unchanged.
 * Rollback transaction verifies original applied revision, no previous inverse,
 * and every current pointer equals captured after value. It restores exact prior
 * field presence/value, appends inverse histories/root log, completes inverse
 * journal and marks original rolled_back revision+1 with inverse ID atomically.
 * Unrelated license fields are preserved. Never delete immutable copies/history,
 * rewrite historical runs/sessions, or roll back one target independently.
 * No draft/create/schedule/all_institutes/global activation or threshold effect.
 */
export interface VendorCalibrationRolloutContractRules {
  maximumInstitutes: 20;
  journalPath: "vendorCalibrationRollouts/{operationId}";
  terminalLogPath: "vendorCalibrationLogs/{operationId}";
  targetHistoryPath: "institutes/{instituteId}/calibrationHistory/{operationId}";
  immutableCopyPath: "institutes/{instituteId}/calibration/{versionId}";
  runtimeAndConsumerOwner: "BWM-039";
  unifiedAuditReadOwner: "BWM-040";
  deployedMigrationOwner: "BWM-053";
  publishingRequiresQualifiedFrozenConsumer: true;
}
