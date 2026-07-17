import { ApiClientError } from "../../../../../shared/services/apiClient";
import { getPortalApiClient } from "../../../../../shared/services/portalIntegration";

const apiClient = getPortalApiClient("vendor");

const LOCAL_AUDIT_STORAGE_KEY = "vendor-build-138-calibration-audit";

export type CalibrationSimulationMode = "SingleInstitute" | "SelectedInstitutes" | "AllInstitutes";

export type CalibrationPushScope = "ApplyGlobally" | "ApplyToSelectedInstitutes";

export interface StrategyProfileParameters {
  objectiveWeight: number;
  timingWeight: number;
  P1CoverageWeight: number;
  P1RoutingWeight: number;
  easyGuessFactor: number;
  mediumGuessFactor: number;
  hardGuessFactor: number;
  easyNeglectThreshold: number;
  hardBiasToleranceFactor: number;
  riskGuessWeight: number;
  riskPhaseWeight: number;
  riskOverstayWeight: number;
  riskEasyNeglectWeight: number;
  riskHardBiasWeight: number;
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
  parameters: StrategyProfileParameters;
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

const BASELINE_PARAMETERS: StrategyProfileParameters = {
  objectiveWeight: 0.6,
  timingWeight: 0.4,
  P1CoverageWeight: 0.7,
  P1RoutingWeight: 0.3,
  easyGuessFactor: 0.5,
  mediumGuessFactor: 0.6,
  hardGuessFactor: 0.7,
  easyNeglectThreshold: 0.7,
  hardBiasToleranceFactor: 0.1,
  riskGuessWeight: 0.3,
  riskPhaseWeight: 0.25,
  riskOverstayWeight: 0.15,
  riskEasyNeglectWeight: 0.15,
  riskHardBiasWeight: 0.15,
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
      "P1CoverageWeight increased 0.68 -> 0.70",
      "easyNeglectThreshold increased 0.68 -> 0.70",
      "hardBiasToleranceFactor reduced 0.12 -> 0.10",
    ],
    parameters: BASELINE_PARAMETERS,
  },
  {
    versionId: "cal_v2026_03_27",
    createdAt: "2026-03-27T06:14:00.000Z",
    createdBy: "vendor.risk@parabolic.local",
    activationDate: "2026-03-29T00:00:00.000Z",
    affectedInstitutes: [
      "inst_north_star",
      "inst_riverdale",
      "inst_orbit",
      "inst_delta",
      "inst_zenith",
    ],
    rollbackStatus: "available",
    isActive: false,
    parameterChanges: [
      "easyGuessFactor increased 0.45 -> 0.48",
      "mediumGuessFactor increased 0.55 -> 0.58",
      "riskGuessWeight increased 0.28 -> 0.32",
    ],
    parameters: {
      objectiveWeight: 0.6,
      timingWeight: 0.4,
      P1CoverageWeight: 0.68,
      P1RoutingWeight: 0.32,
      easyGuessFactor: 0.48,
      mediumGuessFactor: 0.58,
      hardGuessFactor: 0.68,
      easyNeglectThreshold: 0.68,
      hardBiasToleranceFactor: 0.12,
      riskGuessWeight: 0.32,
      riskPhaseWeight: 0.24,
      riskOverstayWeight: 0.14,
      riskEasyNeglectWeight: 0.15,
      riskHardBiasWeight: 0.15,
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
      "objectiveWeight reduced 0.60 -> 0.55",
      "timingWeight increased 0.40 -> 0.45",
      "hardGuessFactor reduced 0.68 -> 0.65",
    ],
    parameters: {
      objectiveWeight: 0.55,
      timingWeight: 0.45,
      P1CoverageWeight: 0.65,
      P1RoutingWeight: 0.35,
      easyGuessFactor: 0.45,
      mediumGuessFactor: 0.55,
      hardGuessFactor: 0.65,
      easyNeglectThreshold: 0.65,
      hardBiasToleranceFactor: 0.12,
      riskGuessWeight: 0.28,
      riskPhaseWeight: 0.27,
      riskOverstayWeight: 0.15,
      riskEasyNeglectWeight: 0.15,
      riskHardBiasWeight: 0.15,
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

export function validateStrategyProfileParameters(draft: StrategyProfileParameters): {
  isValid: boolean;
  issues: string[];
  riskWeightTotal: number;
} {
  const issues: string[] = [];

  for (const [key, value] of Object.entries(draft)) {
    if (!Number.isFinite(value)) {
      issues.push(`${key} must be a number.`);
      continue;
    }

    if (value < 0 || value > 1) {
      issues.push(`${key} must be between 0 and 1.`);
    }
  }

  const riskWeightTotal =
    draft.riskGuessWeight +
    draft.riskPhaseWeight +
    draft.riskOverstayWeight +
    draft.riskEasyNeglectWeight +
    draft.riskHardBiasWeight;

  if (Math.abs(riskWeightTotal - 1) > 0.0001) {
    issues.push(
      `Risk score weights must total 1.00. Current total: ${riskWeightTotal.toFixed(3)}.`,
    );
  }

  return {
    isValid: issues.length === 0,
    issues,
    riskWeightTotal,
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
  parameters: StrategyProfileParameters,
): CalibrationSimulationResult {
  const selected = dataset.institutes.filter((entry) => instituteIds.includes(entry.instituteId));
  const totalStudents = selected.reduce(
    (accumulator, entry) => accumulator + entry.studentCount,
    0,
  );
  const weightedRiskBaseline = selected.reduce(
    (accumulator, entry) => accumulator + entry.beforeAverageRiskScore * entry.studentCount,
    0,
  );
  const weightedDisciplineBaseline = selected.reduce(
    (accumulator, entry) => accumulator + entry.beforeDisciplineIndex * entry.studentCount,
    0,
  );

  const beforeAverageRiskScore = totalStudents === 0 ? 0 : weightedRiskBaseline / totalStudents;
  const beforeDisciplineIndex =
    totalStudents === 0 ? 0 : weightedDisciplineBaseline / totalStudents;

  const strategyIntensity =
    parameters.riskGuessWeight * parameters.mediumGuessFactor +
    parameters.riskPhaseWeight * (1 - parameters.objectiveWeight) +
    parameters.riskOverstayWeight * parameters.timingWeight +
    parameters.riskEasyNeglectWeight * (1 - parameters.easyNeglectThreshold) +
    parameters.riskHardBiasWeight * parameters.hardBiasToleranceFactor;
  const baselineIntensity =
    BASELINE_PARAMETERS.riskGuessWeight * BASELINE_PARAMETERS.mediumGuessFactor +
    BASELINE_PARAMETERS.riskPhaseWeight * (1 - BASELINE_PARAMETERS.objectiveWeight) +
    BASELINE_PARAMETERS.riskOverstayWeight * BASELINE_PARAMETERS.timingWeight +
    BASELINE_PARAMETERS.riskEasyNeglectWeight * (1 - BASELINE_PARAMETERS.easyNeglectThreshold) +
    BASELINE_PARAMETERS.riskHardBiasWeight * BASELINE_PARAMETERS.hardBiasToleranceFactor;
  const phaseAdherence =
    parameters.objectiveWeight * parameters.P1CoverageWeight +
    parameters.timingWeight * parameters.P1RoutingWeight;
  const baselinePhaseAdherence =
    BASELINE_PARAMETERS.objectiveWeight * BASELINE_PARAMETERS.P1CoverageWeight +
    BASELINE_PARAMETERS.timingWeight * BASELINE_PARAMETERS.P1RoutingWeight;

  const riskDelta = clampPercent((strategyIntensity - baselineIntensity) * 20);
  const disciplineDelta = clampPercent((phaseAdherence - baselinePhaseAdherence) * 10);
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
    summarySources: [
      "studentYearMetrics",
      "runAnalytics",
      "riskComponents",
      "disciplineComponents",
    ],
    comparison,
    generatedAt: new Date().toISOString(),
    engineSource: "local-fallback",
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
  parameters: StrategyProfileParameters;
}): Promise<CalibrationSimulationResult> {
  const { dataset, mode, selectedInstituteIds, parameters } = options;
  const instituteIds = resolveSelectedInstituteIds(dataset, mode, selectedInstituteIds);

  if (instituteIds.length === 0) {
    throw new Error("Select at least one institute before simulation.");
  }

  try {
    const response = await apiClient.post<
      CalibrationSimulationApiResponse,
      {
        institutes: string[];
        strategyProfileParameters: StrategyProfileParameters;
      }
    >("/vendor/calibration/simulate", {
      body: {
        institutes: instituteIds,
        strategyProfileParameters: parameters,
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
    const fallback = computeLocalSimulation(dataset, mode, instituteIds, parameters);

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
