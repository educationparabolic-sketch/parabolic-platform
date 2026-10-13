/**
 * BWM-038 calibration wire/authority contract, not a runtime validator.
 * Every request/result is closed: unknown fields, coercion and fabricated
 * defaults are forbidden. Storage/simulation runtime adopts this contract;
 * transport now enforces current Vendor intent and bounded version authority;
 * mounted frontend validates live authority with real local browser acceptance;
 * BWM-038 projection and BWM-039 bounded recoverable rollout are locally qualified.
 */
export type VendorCalibrationRiskState =
  | "Stable"
  | "Drift-Prone"
  | "Impulsive"
  | "Overextended"
  | "Volatile";

/** Each finite weight is in [0,1]; sum differs from 1 by at most 0.000001.
 * Validate before rounding; do not map overstay to wrong-streak or rename a
 * strategyProfileParameters object into weights. Zero total is invalid.
 */
export interface VendorCalibrationWeights {
  guessWeight: number;
  phaseWeight: number;
  easyNeglectWeight: number;
  hardBiasWeight: number;
  wrongStreakWeight: number;
}

/** Stored metadata only: these thresholds do not affect risk_projection_v1.
 * Guess factors are finite multipliers in (0,10]; phase deviation is [0,100]
 * percentage points. Editors cannot promise unsupported threshold effects.
 */
export interface VendorCalibrationThresholds {
  guessFactorEasy: number;
  guessFactorMedium: number;
  guessFactorHard: number;
  phaseDeviationThreshold: number;
}

/** POST /api/v1/vendor/calibration/simulate. Read-only, no business writes.
 * Explicit year avoids double-counting one Student across retained years.
 * IDs match [A-Za-z0-9_-]{1,128}; no whitespace, slash, dot segments or coercion.
 * 1..20 unique institute IDs; duplicates are rejected, not silently deduplicated.
 * The same explicit academic year must exist in each selected institute.
 */
export interface VendorCalibrationSimulationRequest {
  academicYearId: string;
  institutes: string[];
  weights: VendorCalibrationWeights;
}

export interface VendorCalibrationDistributionEntry {
  /** Safe nonnegative integer for summaries; signed integer for deltas. */
  count: number;
  /** [0,100] for summaries; [-100,100] percentage points for deltas. */
  percent: number;
}

export type VendorCalibrationDistribution = Record<
  VendorCalibrationRiskState, VendorCalibrationDistributionEntry
>;

export interface VendorCalibrationSummary {
  averageProjectedRiskScore: number;
  instituteCount: number;
  studentCount: number;
  riskDistribution: VendorCalibrationDistribution;
}

export interface VendorCalibrationDelta {
  averageProjectedRiskScore: number;
  studentCount: 0;
  riskDistribution: VendorCalibrationDistribution;
}

export interface VendorCalibrationInstituteProjection {
  instituteId: string;
  academicYearId: string;
  currentCalibrationVersion: string;
  currentCalibrationSourcePath: string;
  studentCount: number;
  beforeAverageProjectedRiskScore: number;
  projectedAverageRiskScore: number;
  riskDistributionDelta: Record<VendorCalibrationRiskState, number>;
}

export interface VendorCalibrationSource {
  instituteId: string;
  academicYearId: string;
  calibrationVersion: string;
  calibrationSourcePath: string;
  summaryDocumentCount: number;
}

export type VendorCalibrationUnsupportedOutput =
  | "disciplineDelta"
  | "clusterMovement"
  | "batchDelta"
  | "estimatedAlertDelta"
  | "stabilityImpact"
  | "productionRiskOutcome";

export interface VendorCalibrationSimulationMetadata {
  schemaVersion: 1;
  model: "risk_projection_v1";
  population: "student_year_summaries";
  academicYearId: string;
  /** Server ISO timestamp; identifies evaluation, not source freshness. */
  evaluatedAt: string;
  sources: VendorCalibrationSource[];
  unsupportedOutputs: Record<VendorCalibrationUnsupportedOutput, "unavailable">;
}

/** All sources validated before a result. No truncation, sampling or partial
 * success. All-empty population is empty; mixed empty/nonempty targets fail
 * closed. Invalid/missing signals or dangling calibration references fail.
 * Counts and source/target/year/version/path identities must reconcile;
 * before/after Student and institute counts match, buckets sum to Students,
 * percentages equal rounded count/total*100, deltas equal after minus before.
 */
export type VendorCalibrationSimulationResult = {
  availability: "available";
  metadata: VendorCalibrationSimulationMetadata;
  proposedWeights: VendorCalibrationWeights;
  before: VendorCalibrationSummary;
  after: VendorCalibrationSummary;
  delta: VendorCalibrationDelta;
  institutes: VendorCalibrationInstituteProjection[];
} | {
  availability: "empty";
  metadata: VendorCalibrationSimulationMetadata;
  proposedWeights: VendorCalibrationWeights;
  before: null;
  after: null;
  delta: null;
  institutes: [];
};

/** Existing immutable storage fields; no new draft/lifecycle authority.
 * Canonical path is globalCalibration/{versionId}; calibrationVersions is a
 * compatibility mirror only. All dates validated; missing creation time fails.
 * A legacy record without schemaVersion may be read only if the complete
 * existing weights/thresholds/identity/date/active shape passes validation;
 * schemaVersion in this DTO identifies the validated public projection.
 */
export interface VendorCalibrationVersion {
  schemaVersion: 1;
  versionId: string;
  weights: VendorCalibrationWeights;
  thresholds: VendorCalibrationThresholds;
  createdBy: string;
  createdAt: string;
  activationDate: string | null;
  isActive: boolean;
  sourcePath: string;
  /** Bounded immediate workflow, not authorization or a guarantee of success.
   * Requires current Vendor capability, explicit targets and optimistic checks.
   * No global activation, scheduling or production-release qualification.
   */
  deploymentAvailability: "immediate_selected_targets";
}

/** GET /api/v1/vendor/calibration/versions. Default 25, maximum 50.
 * Ascending document-ID page; cursor is bounded opaque base64url last-ID
 * authority, bound to schema/query. Fetch limit+1, validate every selected row.
 * No status/date filter, all-institute enumeration or unbounded client drain.
 */
export interface VendorCalibrationVersionsQuery {
  limit?: number;
  cursor?: string;
}

export interface VendorCalibrationVersionsResult {
  items: VendorCalibrationVersion[];
  hasMore: boolean;
  nextCursor: string | null;
}

/** GET /api/v1/vendor/calibration/versions/{versionId}: one validated record. */
export interface VendorCalibrationVersionDetailResult {
  version: VendorCalibrationVersion;
}

/** Legacy deployment declaration-only aliases preserve BWM-006's single owner.
 * VEN-02 no longer accepts these shapes: vendorCalibrationRollout.d.ts owns the
 * explicit keyed/preconditioned command and operation result. No dual parser.
 * Qualified immediate publishing uses only the mounted BWM-039 contract.
 */
export type VendorCalibrationDeploymentRequest =
  import("./apiDtos.js").VendorCalibrationPushRequest;
export type VendorCalibrationDeploymentResult =
  import("./apiDtos.js").DeployCalibrationVersionResult;

/** Declarative validation/authority requirements; no executable new defaults. */
export interface VendorCalibrationContractRules {
  schemaVersion: 1;
  capability: "vendor.calibration.manage";
  currentRevocationCheckedVendorRequired: true;
  maximumInstitutes: 20;
  maximumSummariesPerInstitute: 1000;
  maximumSummariesTotal: 5000;
  overflowProbeDocuments: 1;
  maximumActiveGlobalVersions: 1;
  activeGlobalProbeLimit: 2;
  defaultVersionPageSize: 25;
  maximumVersionPageSize: 50;
  maximumCursorLength: 512;
  weightSumTolerance: 0.000001;
  riskStateUpperBounds: [20, 40, 60, 80, 100];
  canonicalVersionPath: "globalCalibration/{versionId}";
  compatibilityVersionPath: "calibrationVersions/{versionId}";
  canonicalSummaryPath: "institutes/{instituteId}/academicYears/{academicYearId}/studentYearMetrics/{studentId}";
  signalPercentFields: ["avgPhaseAdherencePercent", "avgGuessRatePercent", "easyNeglectRatePercent", "hardBiasRatePercent"];
  legacyPercentAliases: ["avgPhaseAdherence", "guessRate", "easyNeglectRate", "hardBiasRate"];
  booleanSignalField: "wrongStreakActive";
  forbiddenInputs: ["raw_sessions", "answers", "question_attempts"];
  /** Simulation/legacy flags only; explicit inverse has its own rollout DTO. */
  forbiddenModes: ["dry_run_deployment", "draft", "scheduled", "rollback", "all_institutes"];
  activationRecoveryOwner: "BWM-039";
  unifiedAuditOwner: "BWM-040";
  remoteQualificationOwner: "BWM-053";
}

/** Source validation: percent signals must be finite [0,100], wrong-streak
 * must be boolean. A validated legacy alias is allowed only when canonical
 * is absent; if both are present they must agree. Never silently default or
 * skip a malformed source. One active eligible global model is required;
 * zero is unavailable and two are ambiguous. A future active model fails.
 * Institute overrides must resolve exactly or fail, not fall back silently.
 * Projection = weighted sum of guess/phase-deviation/neglect/bias/boolean
 * wrong-streak signals divided by validated weight sum, times 100. Round each
 * projected Student score to 2 decimals, apply inclusive 20/40/60/80 cutoffs;
 * aggregate the full scores before final 2-decimal averages/percentages/deltas.
 * Do not average already rounded institute means into platform means.
 * No raw Student identifiers/names/emails or answer/session data leave APIs.
 * Editing weights/targets/year, retry or failure clears prior UI authority.
 * Thresholds are read-only metadata; unsupported output is unavailable, never
 * a zero or a browser-derived formula. No browser localStorage audit or state
 * can be installed as version, activation, comparison or rollback authority.
 */
