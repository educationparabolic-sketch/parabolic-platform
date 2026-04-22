import { ApiClientError, createApiClient } from "../../../../../shared/services/apiClient";

const apiClient = createApiClient({ baseUrl: "/" });

const LOCAL_AUDIT_STORAGE_KEY = "vendor-build-138-calibration-audit";

export type CalibrationSimulationMode =
  | "SingleInstitute"
  | "SelectedInstitutes"
  | "AllInstitutes";

export type CalibrationPushScope = "ApplyGlobally" | "ApplyToSelectedInstitutes";

export interface CalibrationWeightsDraft {
  guessWeight: number;
  phaseDeviationWeight: number;
  easyNeglectWeight: number;
  hardBiasWeight: number;
  consecutiveWrongWeight: number;
}

export interface CalibrationThresholdDraft {
  guessFactorPerDifficulty: number;
  phaseTolerancePercent: number;
  hardBiasDeviationAllowance: number;
  stabilityVarianceThreshold: number;
  minTimeMultiplier: number;
  maxTimeMultiplier: number;
}

export interface VendorCalibrationVersionRecord {
  versionId: string;
  createdAt: string;
  createdBy: string;
  activationDate: string | null;
  affectedInstitutes: string[];
  rollbackStatus: "available" | "rollback_queued" | "rolled_back";
  isActive: boolean;
  parameterChanges: string[];
  weights: CalibrationWeightsDraft;
  thresholds: CalibrationThresholdDraft;
}

export interface CalibrationInstituteSummary {
  instituteId: string;
  instituteName: string;
  studentCount: number;
  beforeAverageRiskScore: number;
  beforeDisciplineIndex: number;
}

export interface CalibrationDistributionEntry {
  count: number;
  percent: number;
}

export interface CalibrationImpactComparison {
  beforeAverageRiskScore: number;
  afterAverageRiskScore: number;
  beforeDisciplineIndex: number;
  afterDisciplineIndex: number;
  riskDistributionShift: Record<"low" | "medium" | "high", CalibrationDistributionEntry>;
  clusterMovementPercent: number;
  batchLevelDeltaPercent: number;
  stabilityImpact: "improved" | "neutral" | "degraded";
  estimatedAlertDelta: number;
}

export interface CalibrationSimulationResult {
  mode: CalibrationSimulationMode;
  instituteIds: string[];
  summarySources: Array<
    "studentYearMetrics" | "runAnalytics" | "riskComponents" | "disciplineComponents"
  >;
  comparison: CalibrationImpactComparison;
  generatedAt: string;
  engineSource: "api" | "local-fallback";
}

export interface VendorCalibrationAuditRecord {
  id: string;
  actionType:
    | "CalibrationPush"
    | "ManualOverride"
    | "RollbackQueued"
    | "RollbackApplied"
    | "SimulationExecuted";
  actorUid: string;
  actorRole: "Vendor";
  targetCollection: "auditLogs";
  targetId: string;
  eventScope: "Global" | "SelectedInstitutes";
  instituteIds: string[];
  calibrationVersionId: string;
  calibrationSourcePath?: string;
  note: string;
  createdAt: string;
}

export interface VendorCalibrationDataset {
  sourceCollections: Array<
    "calibrationVersions" | "vendorAggregates" | "studentYearMetrics" | "runAnalytics" | "auditLogs"
  >;
  institutes: CalibrationInstituteSummary[];
  versions: VendorCalibrationVersionRecord[];
  baselineComparison: CalibrationImpactComparison;
  seededAuditRecords: VendorCalibrationAuditRecord[];
}

export interface CalibrationPushResult {
  deployedInstituteCount: number;
  deploymentLogId: string;
  versionId: string;
  vendorCalibrationLogPath: string;
  engineSource: "api" | "local-fallback";
}

interface CalibrationSimulationApiResponse {
  code: "OK";
  data: {
    after: {
      averageProjectedRiskScore: number;
      riskDistribution: Record<"low" | "medium" | "high", CalibrationDistributionEntry>;
    };
    before: {
      averageProjectedRiskScore: number;
      riskDistribution: Record<"low" | "medium" | "high", CalibrationDistributionEntry>;
    };
    delta: {
      averageProjectedRiskScore: number;
      riskDistribution: Record<"low" | "medium" | "high", CalibrationDistributionEntry>;
    };
  };
}

interface CalibrationPushApiResponse {
  code: "OK";
  data: {
    deployedInstituteCount: number;
    deploymentLogId: string;
    versionId: string;
    vendorCalibrationLogPath: string;
  };
}

const INSTITUTES: CalibrationInstituteSummary[] = [
  {
    instituteId: "inst_north_star",
    instituteName: "North Star Academy",
    studentCount: 1340,
    beforeAverageRiskScore: 41.6,
    beforeDisciplineIndex: 74.2,
  },
  {
    instituteId: "inst_riverdale",
    instituteName: "Riverdale Test Hub",
    studentCount: 820,
    beforeAverageRiskScore: 57.4,
    beforeDisciplineIndex: 61.1,
  },
  {
    instituteId: "inst_orbit",
    instituteName: "Orbit Scholars",
    studentCount: 2055,
    beforeAverageRiskScore: 35.2,
    beforeDisciplineIndex: 82.3,
  },
  {
    instituteId: "inst_delta",
    instituteName: "Delta Coaching Network",
    studentCount: 395,
    beforeAverageRiskScore: 52.1,
    beforeDisciplineIndex: 56.5,
  },
  {
    instituteId: "inst_zenith",
    instituteName: "Zenith Integrated Prep",
    studentCount: 1495,
    beforeAverageRiskScore: 63.9,
    beforeDisciplineIndex: 48.7,
  },
];

const BASELINE_WEIGHTS: CalibrationWeightsDraft = {
  guessWeight: 0.24,
  phaseDeviationWeight: 0.2,
  easyNeglectWeight: 0.19,
  hardBiasWeight: 0.18,
  consecutiveWrongWeight: 0.19,
};

const BASELINE_THRESHOLDS: CalibrationThresholdDraft = {
  guessFactorPerDifficulty: 1.15,
  phaseTolerancePercent: 12,
  hardBiasDeviationAllowance: 18,
  stabilityVarianceThreshold: 10,
  minTimeMultiplier: 0.7,
  maxTimeMultiplier: 1.35,
};

const VERSIONS: VendorCalibrationVersionRecord[] = [
  {
    versionId: "cal_v2026_04_18",
    createdAt: "2026-04-18T08:30:00.000Z",
    createdBy: "vendor.ops@parabolic.local",
    activationDate: "2026-04-19T00:00:00.000Z",
    affectedInstitutes: ["inst_north_star", "inst_orbit", "inst_zenith"],
    rollbackStatus: "available",
    isActive: true,
    parameterChanges: [
      "HardBiasWeight increased 0.16 -> 0.18",
      "PhaseTolerancePercent tightened 14 -> 12",
      "MaxTimeMultiplier adjusted 1.40 -> 1.35",
    ],
    weights: BASELINE_WEIGHTS,
    thresholds: BASELINE_THRESHOLDS,
  },
  {
    versionId: "cal_v2026_03_27",
    createdAt: "2026-03-27T06:14:00.000Z",
    createdBy: "vendor.risk@parabolic.local",
    activationDate: "2026-03-29T00:00:00.000Z",
    affectedInstitutes: ["inst_north_star", "inst_riverdale", "inst_orbit", "inst_delta", "inst_zenith"],
    rollbackStatus: "available",
    isActive: false,
    parameterChanges: [
      "GuessWeight reduced 0.27 -> 0.24",
      "ConsecutiveWrongWeight raised 0.17 -> 0.19",
      "StabilityVarianceThreshold tightened 12 -> 10",
    ],
    weights: {
      guessWeight: 0.23,
      phaseDeviationWeight: 0.2,
      easyNeglectWeight: 0.2,
      hardBiasWeight: 0.18,
      consecutiveWrongWeight: 0.19,
    },
    thresholds: {
      guessFactorPerDifficulty: 1.2,
      phaseTolerancePercent: 14,
      hardBiasDeviationAllowance: 20,
      stabilityVarianceThreshold: 12,
      minTimeMultiplier: 0.75,
      maxTimeMultiplier: 1.4,
    },
  },
  {
    versionId: "cal_v2026_02_09",
    createdAt: "2026-02-09T05:01:00.000Z",
    createdBy: "vendor.calibration@parabolic.local",
    activationDate: "2026-02-10T00:00:00.000Z",
    affectedInstitutes: ["inst_north_star", "inst_orbit"],
    rollbackStatus: "rolled_back",
    isActive: false,
    parameterChanges: [
      "EasyNeglectWeight increased 0.16 -> 0.21",
      "PhaseDeviationWeight reduced 0.23 -> 0.2",
      "MinTimeMultiplier lowered 0.8 -> 0.75",
    ],
    weights: {
      guessWeight: 0.22,
      phaseDeviationWeight: 0.21,
      easyNeglectWeight: 0.21,
      hardBiasWeight: 0.17,
      consecutiveWrongWeight: 0.19,
    },
    thresholds: {
      guessFactorPerDifficulty: 1.25,
      phaseTolerancePercent: 15,
      hardBiasDeviationAllowance: 22,
      stabilityVarianceThreshold: 14,
      minTimeMultiplier: 0.8,
      maxTimeMultiplier: 1.45,
    },
  },
];

const BASELINE_COMPARISON: CalibrationImpactComparison = {
  beforeAverageRiskScore: 49.8,
  afterAverageRiskScore: 47.9,
  beforeDisciplineIndex: 64.6,
  afterDisciplineIndex: 66.1,
  riskDistributionShift: {
    low: { count: 102, percent: 31.2 },
    medium: { count: -68, percent: -20.8 },
    high: { count: -34, percent: -10.4 },
  },
  clusterMovementPercent: 9.8,
  batchLevelDeltaPercent: -4.1,
  stabilityImpact: "improved",
  estimatedAlertDelta: -27,
};

const SEEDED_AUDIT_RECORDS: VendorCalibrationAuditRecord[] = [
  {
    id: "audit_cal_20260419_01",
    actionType: "CalibrationPush",
    actorUid: "vendor.ops@parabolic.local",
    actorRole: "Vendor",
    targetCollection: "auditLogs",
    targetId: "calibrationVersions/cal_v2026_04_18",
    eventScope: "SelectedInstitutes",
    instituteIds: ["inst_north_star", "inst_orbit", "inst_zenith"],
    calibrationVersionId: "cal_v2026_04_18",
    calibrationSourcePath: "globalCalibration/cal_v2026_04_18",
    note: "Controlled rollout completed after simulation delta review.",
    createdAt: "2026-04-19T01:10:00.000Z",
  },
  {
    id: "audit_cal_20260411_02",
    actionType: "ManualOverride",
    actorUid: "vendor.risk@parabolic.local",
    actorRole: "Vendor",
    targetCollection: "auditLogs",
    targetId: "calibrationVersions/cal_v2026_04_18",
    eventScope: "Global",
    instituteIds: [],
    calibrationVersionId: "cal_v2026_04_18",
    note: "Temporarily increased hard bias sensitivity for high volatility week.",
    createdAt: "2026-04-11T09:45:00.000Z",
  },
  {
    id: "audit_cal_20260330_03",
    actionType: "RollbackApplied",
    actorUid: "vendor.calibration@parabolic.local",
    actorRole: "Vendor",
    targetCollection: "auditLogs",
    targetId: "calibrationVersions/cal_v2026_03_27",
    eventScope: "SelectedInstitutes",
    instituteIds: ["inst_riverdale"],
    calibrationVersionId: "cal_v2026_03_27",
    calibrationSourcePath: "globalCalibration/cal_v2026_03_27",
    note: "Partial rollback applied due to rapid alert increase in Riverdale cluster.",
    createdAt: "2026-03-30T04:22:00.000Z",
  },
];

function clampPercent(value: number): number {
  const rounded = Math.round(value * 10) / 10;
  if (rounded < -100) {
    return -100;
  }

  if (rounded > 100) {
    return 100;
  }

  return rounded;
}

export function getVendorCalibrationDataset(): VendorCalibrationDataset {
  return {
    sourceCollections: [
      "calibrationVersions",
      "vendorAggregates",
      "studentYearMetrics",
      "runAnalytics",
      "auditLogs",
    ],
    institutes: INSTITUTES,
    versions: VERSIONS,
    baselineComparison: BASELINE_COMPARISON,
    seededAuditRecords: SEEDED_AUDIT_RECORDS,
  };
}

export function validateCalibrationWeights(
  draft: CalibrationWeightsDraft,
): { isValid: boolean; issues: string[]; total: number } {
  const entries = Object.entries(draft);
  const issues: string[] = [];

  for (const [key, value] of entries) {
    if (!Number.isFinite(value)) {
      issues.push(`${key} must be a number.`);
      continue;
    }

    if (value < 0 || value > 1) {
      issues.push(`${key} must be between 0 and 1.`);
    }
  }

  const total = entries.reduce((accumulator, [, value]) => accumulator + value, 0);
  if (Math.abs(total - 1) > 0.0001) {
    issues.push(`Risk weights must sum to 1. Current sum: ${total.toFixed(3)}.`);
  }

  return {
    isValid: issues.length === 0,
    issues,
    total,
  };
}

export function validateCalibrationThresholds(
  draft: CalibrationThresholdDraft,
): { isValid: boolean; issues: string[] } {
  const issues: string[] = [];

  if (draft.guessFactorPerDifficulty < 0.5 || draft.guessFactorPerDifficulty > 2) {
    issues.push("GuessFactorPerDifficulty must be between 0.5 and 2.0.");
  }

  if (draft.phaseTolerancePercent < 0 || draft.phaseTolerancePercent > 50) {
    issues.push("PhaseTolerancePercent must be between 0 and 50.");
  }

  if (draft.hardBiasDeviationAllowance < 0 || draft.hardBiasDeviationAllowance > 60) {
    issues.push("HardBiasDeviationAllowance must be between 0 and 60.");
  }

  if (draft.stabilityVarianceThreshold < 0 || draft.stabilityVarianceThreshold > 40) {
    issues.push("StabilityVarianceThreshold must be between 0 and 40.");
  }

  if (draft.minTimeMultiplier < 0.5 || draft.minTimeMultiplier > 1.5) {
    issues.push("MinTimeMultiplier must be between 0.5 and 1.5.");
  }

  if (draft.maxTimeMultiplier < 1 || draft.maxTimeMultiplier > 2) {
    issues.push("MaxTimeMultiplier must be between 1.0 and 2.0.");
  }

  if (draft.minTimeMultiplier > draft.maxTimeMultiplier) {
    issues.push("MinTimeMultiplier must not exceed MaxTimeMultiplier.");
  }

  return {
    isValid: issues.length === 0,
    issues,
  };
}

function resolveSelectedInstituteIds(
  dataset: VendorCalibrationDataset,
  mode: CalibrationSimulationMode,
  selectedInstituteIds: string[],
): string[] {
  if (mode === "AllInstitutes") {
    return dataset.institutes.map((entry) => entry.instituteId);
  }

  if (mode === "SingleInstitute") {
    const target = selectedInstituteIds[0];
    return target ? [target] : [];
  }

  return selectedInstituteIds;
}

function computeLocalSimulation(
  dataset: VendorCalibrationDataset,
  mode: CalibrationSimulationMode,
  instituteIds: string[],
  weights: CalibrationWeightsDraft,
): CalibrationSimulationResult {
  const selected = dataset.institutes.filter((entry) => instituteIds.includes(entry.instituteId));
  const totalStudents = selected.reduce((accumulator, entry) => accumulator + entry.studentCount, 0);
  const weightedRiskBaseline = selected.reduce(
    (accumulator, entry) => accumulator + entry.beforeAverageRiskScore * entry.studentCount,
    0,
  );
  const weightedDisciplineBaseline = selected.reduce(
    (accumulator, entry) => accumulator + entry.beforeDisciplineIndex * entry.studentCount,
    0,
  );

  const beforeAverageRiskScore = totalStudents === 0 ? 0 : weightedRiskBaseline / totalStudents;
  const beforeDisciplineIndex = totalStudents === 0 ? 0 : weightedDisciplineBaseline / totalStudents;

  const intensity =
    weights.hardBiasWeight * 0.32 +
    weights.easyNeglectWeight * 0.24 +
    weights.consecutiveWrongWeight * 0.18 -
    weights.phaseDeviationWeight * 0.16 -
    weights.guessWeight * 0.08;

  const riskDelta = clampPercent(-(intensity * 12));
  const disciplineDelta = clampPercent((weights.phaseDeviationWeight + weights.easyNeglectWeight) * 6);
  const mediumShift = clampPercent(riskDelta * 0.7);
  const highShift = clampPercent(riskDelta * 0.3);

  const comparison: CalibrationImpactComparison = {
    beforeAverageRiskScore: Math.round(beforeAverageRiskScore * 10) / 10,
    afterAverageRiskScore: Math.round((beforeAverageRiskScore + riskDelta) * 10) / 10,
    beforeDisciplineIndex: Math.round(beforeDisciplineIndex * 10) / 10,
    afterDisciplineIndex: Math.round((beforeDisciplineIndex + disciplineDelta) * 10) / 10,
    riskDistributionShift: {
      low: { count: Math.round(-riskDelta * 4), percent: clampPercent(-riskDelta) },
      medium: { count: Math.round(-mediumShift * 3), percent: -mediumShift },
      high: { count: Math.round(-highShift * 2), percent: -highShift },
    },
    clusterMovementPercent: Math.abs(clampPercent(riskDelta * 1.8)),
    batchLevelDeltaPercent: clampPercent(riskDelta * 0.9),
    stabilityImpact: riskDelta <= -2 ? "improved" : riskDelta >= 2 ? "degraded" : "neutral",
    estimatedAlertDelta: Math.round(riskDelta * 5),
  };

  return {
    mode,
    instituteIds,
    summarySources: ["studentYearMetrics", "runAnalytics", "riskComponents", "disciplineComponents"],
    comparison,
    generatedAt: new Date().toISOString(),
    engineSource: "local-fallback",
  };
}

function toSimulationApiWeights(weights: CalibrationWeightsDraft): {
  easyNeglectWeight: number;
  guessWeight: number;
  hardBiasWeight: number;
  phaseWeight: number;
  wrongStreakWeight: number;
} {
  return {
    easyNeglectWeight: weights.easyNeglectWeight,
    guessWeight: weights.guessWeight,
    hardBiasWeight: weights.hardBiasWeight,
    phaseWeight: weights.phaseDeviationWeight,
    wrongStreakWeight: weights.consecutiveWrongWeight,
  };
}

function toLocalAuditRecord(line: unknown): VendorCalibrationAuditRecord | null {
  if (!line || typeof line !== "object") {
    return null;
  }

  const record = line as Partial<VendorCalibrationAuditRecord>;

  if (
    typeof record.id !== "string" ||
    typeof record.actionType !== "string" ||
    typeof record.actorUid !== "string" ||
    typeof record.targetId !== "string" ||
    typeof record.createdAt !== "string"
  ) {
    return null;
  }

  return {
    id: record.id,
    actionType: record.actionType,
    actorUid: record.actorUid,
    actorRole: "Vendor",
    targetCollection: "auditLogs",
    targetId: record.targetId,
    eventScope: record.eventScope === "Global" ? "Global" : "SelectedInstitutes",
    instituteIds: Array.isArray(record.instituteIds)
      ? record.instituteIds.filter((value): value is string => typeof value === "string")
      : [],
    calibrationVersionId:
      typeof record.calibrationVersionId === "string" ? record.calibrationVersionId : "unknown",
    calibrationSourcePath:
      typeof record.calibrationSourcePath === "string" ? record.calibrationSourcePath : undefined,
    note: typeof record.note === "string" ? record.note : "",
    createdAt: record.createdAt,
  };
}

function readLocalAuditRecords(): VendorCalibrationAuditRecord[] {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(LOCAL_AUDIT_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((entry) => toLocalAuditRecord(entry))
      .filter((entry): entry is VendorCalibrationAuditRecord => Boolean(entry));
  } catch {
    return [];
  }
}

function writeLocalAuditRecords(records: VendorCalibrationAuditRecord[]): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(LOCAL_AUDIT_STORAGE_KEY, JSON.stringify(records.slice(0, 120)));
}

export function getCalibrationAuditRecords(
  dataset: VendorCalibrationDataset,
): VendorCalibrationAuditRecord[] {
  return [...readLocalAuditRecords(), ...dataset.seededAuditRecords].sort((left, right) => {
    return Date.parse(right.createdAt) - Date.parse(left.createdAt);
  });
}

export function appendCalibrationAuditRecord(record: VendorCalibrationAuditRecord): void {
  const previous = readLocalAuditRecords();
  writeLocalAuditRecords([record, ...previous]);
}

export async function runCalibrationSimulation(options: {
  dataset: VendorCalibrationDataset;
  mode: CalibrationSimulationMode;
  selectedInstituteIds: string[];
  weights: CalibrationWeightsDraft;
}): Promise<CalibrationSimulationResult> {
  const { dataset, mode, selectedInstituteIds, weights } = options;
  const instituteIds = resolveSelectedInstituteIds(dataset, mode, selectedInstituteIds);

  if (instituteIds.length === 0) {
    throw new Error("Select at least one institute before simulation.");
  }

  try {
    const response = await apiClient.post<
      CalibrationSimulationApiResponse,
      {
        institutes: string[];
        weights: ReturnType<typeof toSimulationApiWeights>;
      }
    >("/vendor/calibration/simulate", {
      body: {
        institutes: instituteIds,
        weights: toSimulationApiWeights(weights),
      },
      retry: {
        retryUnsafeMethods: false,
      },
    });

    return {
      mode,
      instituteIds,
      summarySources: [
        "studentYearMetrics",
        "runAnalytics",
        "riskComponents",
        "disciplineComponents",
      ],
      comparison: {
        beforeAverageRiskScore: response.data.before.averageProjectedRiskScore,
        afterAverageRiskScore: response.data.after.averageProjectedRiskScore,
        beforeDisciplineIndex: 0,
        afterDisciplineIndex: 0,
        riskDistributionShift: response.data.delta.riskDistribution,
        clusterMovementPercent: Math.abs(response.data.delta.averageProjectedRiskScore),
        batchLevelDeltaPercent: response.data.delta.averageProjectedRiskScore,
        stabilityImpact:
          response.data.delta.averageProjectedRiskScore <= -0.2
            ? "improved"
            : response.data.delta.averageProjectedRiskScore >= 0.2
              ? "degraded"
              : "neutral",
        estimatedAlertDelta: Math.round(response.data.delta.averageProjectedRiskScore * 5),
      },
      generatedAt: new Date().toISOString(),
      engineSource: "api",
    };
  } catch (error) {
    const fallback = computeLocalSimulation(dataset, mode, instituteIds, weights);

    if (error instanceof ApiClientError) {
      return {
        ...fallback,
        comparison: {
          ...fallback.comparison,
          estimatedAlertDelta: fallback.comparison.estimatedAlertDelta,
        },
      };
    }

    return fallback;
  }
}

export async function pushCalibrationVersion(options: {
  dataset: VendorCalibrationDataset;
  versionId: string;
  pushScope: CalibrationPushScope;
  selectedInstituteIds: string[];
}): Promise<CalibrationPushResult> {
  const { dataset, versionId, pushScope, selectedInstituteIds } = options;

  const targetInstitutes =
    pushScope === "ApplyGlobally"
      ? dataset.institutes.map((entry) => entry.instituteId)
      : selectedInstituteIds;

  if (targetInstitutes.length === 0) {
    throw new Error("Select at least one institute before pushing calibration.");
  }

  try {
    const response = await apiClient.post<
      CalibrationPushApiResponse,
      { targetInstitutes: string[]; versionId: string }
    >("/vendor/calibration/push", {
      body: {
        targetInstitutes,
        versionId,
      },
      retry: {
        retryUnsafeMethods: false,
      },
    });

    return {
      deployedInstituteCount: response.data.deployedInstituteCount,
      deploymentLogId: response.data.deploymentLogId,
      versionId: response.data.versionId,
      vendorCalibrationLogPath: response.data.vendorCalibrationLogPath,
      engineSource: "api",
    };
  } catch {
    return {
      deployedInstituteCount: targetInstitutes.length,
      deploymentLogId: `local_${Date.now()}`,
      versionId,
      vendorCalibrationLogPath: `auditLogs/local_${Date.now()}`,
      engineSource: "local-fallback",
    };
  }
}

export { ApiClientError };
