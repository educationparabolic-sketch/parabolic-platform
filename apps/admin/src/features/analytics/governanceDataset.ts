import { ApiClientError } from "../../../../../shared/services/apiClient";
import { getPortalApiClient } from "../../../../../shared/services/portalIntegration";

const apiClient = getPortalApiClient("admin");

export const GOVERNANCE_RISK_CLUSTERS = [
  "stable",
  "driftProne",
  "impulsive",
  "overextended",
  "volatile",
] as const;

export type GovernanceRiskCluster = (typeof GOVERNANCE_RISK_CLUSTERS)[number];

export interface GovernanceSnapshotRecord {
  documentId: string;
  month: string;
  stabilityIndex: number;
  rawMarksStdDeviation: number;
  accuracyStdDeviation: number;
  batchToBatchSpreadPercent: number;
  stabilityByDifficulty: {
    easy: number;
    medium: number;
    hard: number;
  };
  controlledModeRawImprovementPercent: number;
  controlledModeAccuracyImprovementPercent: number;
  riskReductionPercent: number;
  disciplineIndexRolling30Day: number;
  disciplineIndexYearToDate: number;
  disciplineIndexYearOverYear: number;
  overrideFrequencyPerRun: number;
  overrideFrequencyPerBatch: number;
  overrideFrequencyPerTeacherAggregated: number;
  overrideRawMarksWithOverridePercent: number;
  overrideRawMarksWithoutOverridePercent: number;
  overrideAccuracyShiftPercent: number;
  overrideRiskEscalationDelta: number;
  repeatedOverridePatternCount: number;
  repeatedOverridePatternLabel: string;
  phaseCompliancePercent: number;
  overrideFrequency: number;
  executionIntegrityScore: number;
  riskDistribution: Record<GovernanceRiskCluster, number>;
  generatedAt: string;
}

export interface GovernanceTemplateStabilityComparison {
  templateId: string;
  templateName: string;
  runCount: number;
  rawDeltaPercent: number;
  accuracyDeltaPercent: number;
  riskShiftAcrossBatchesPercent: number;
  templateStabilityIndex: number;
  latestBatchStabilityIndex: number;
  interpretation: string;
}

export interface GovernanceBatchRiskSummary {
  batchId: string;
  batchName: string;
  riskDistribution: Record<GovernanceRiskCluster, number>;
  avgDisciplineIndex: number;
  avgPhaseAdherencePercent: number;
  rawStabilityScorePercent: number;
  accuracyStabilityScorePercent: number;
}

export interface GovernanceDashboardDataset {
  snapshots: GovernanceSnapshotRecord[];
  templateStabilityComparisons: GovernanceTemplateStabilityComparison[];
  batchRiskSummaries: GovernanceBatchRiskSummary[];
}

export interface GovernanceRequestContext {
  instituteId: string;
  yearId: string;
}

export const FALLBACK_GOVERNANCE_DATASET: GovernanceDashboardDataset = {
  templateStabilityComparisons: [
    {
      templateId: "tmpl-001",
      templateName: "JEE Mains Mock - Set A",
      runCount: 6,
      rawDeltaPercent: 4,
      accuracyDeltaPercent: 3,
      riskShiftAcrossBatchesPercent: 7,
      templateStabilityIndex: 86,
      latestBatchStabilityIndex: 72,
      interpretation: "Stable template + watch-zone batch pattern -> training issue.",
    },
    {
      templateId: "tmpl-002",
      templateName: "NEET Revision - Biology Focus",
      runCount: 5,
      rawDeltaPercent: 12,
      accuracyDeltaPercent: 10,
      riskShiftAcrossBatchesPercent: 15,
      templateStabilityIndex: 64,
      latestBatchStabilityIndex: 82,
      interpretation: "Unstable template + stable batch pattern -> template issue.",
    },
  ],
  batchRiskSummaries: [
    {
      batchId: "batch-a",
      batchName: "Batch A",
      riskDistribution: {
        stable: 62,
        driftProne: 14,
        impulsive: 9,
        overextended: 8,
        volatile: 7,
      },
      avgDisciplineIndex: 84,
      avgPhaseAdherencePercent: 88,
      rawStabilityScorePercent: 86,
      accuracyStabilityScorePercent: 84,
    },
    {
      batchId: "batch-b",
      batchName: "Batch B",
      riskDistribution: {
        stable: 48,
        driftProne: 21,
        impulsive: 16,
        overextended: 9,
        volatile: 6,
      },
      avgDisciplineIndex: 72,
      avgPhaseAdherencePercent: 76,
      rawStabilityScorePercent: 71,
      accuracyStabilityScorePercent: 73,
    },
    {
      batchId: "batch-c",
      batchName: "Batch C",
      riskDistribution: {
        stable: 55,
        driftProne: 18,
        impulsive: 11,
        overextended: 10,
        volatile: 6,
      },
      avgDisciplineIndex: 78,
      avgPhaseAdherencePercent: 81,
      rawStabilityScorePercent: 79,
      accuracyStabilityScorePercent: 78,
    },
  ],
  snapshots: [
    {
      documentId: "2025_11",
      month: "2025-11",
      stabilityIndex: 72,
      rawMarksStdDeviation: 14,
      accuracyStdDeviation: 11,
      batchToBatchSpreadPercent: 18,
      stabilityByDifficulty: {
        easy: 82,
        medium: 73,
        hard: 64,
      },
      controlledModeRawImprovementPercent: 8,
      controlledModeAccuracyImprovementPercent: 6,
      riskReductionPercent: 9,
      disciplineIndexRolling30Day: 72,
      disciplineIndexYearToDate: 70,
      disciplineIndexYearOverYear: 4,
      overrideFrequencyPerRun: 7,
      overrideFrequencyPerBatch: 11,
      overrideFrequencyPerTeacherAggregated: 9,
      overrideRawMarksWithOverridePercent: 61,
      overrideRawMarksWithoutOverridePercent: 64,
      overrideAccuracyShiftPercent: -2,
      overrideRiskEscalationDelta: 4,
      repeatedOverridePatternCount: 14,
      repeatedOverridePatternLabel: "Controlled Mode bypassed",
      phaseCompliancePercent: 79,
      overrideFrequency: 7,
      executionIntegrityScore: 74,
      riskDistribution: {
        stable: 48,
        driftProne: 20,
        impulsive: 14,
        overextended: 10,
        volatile: 8,
      },
      generatedAt: "2025-11-30T18:10:00.000Z",
    },
    {
      documentId: "2025_12",
      month: "2025-12",
      stabilityIndex: 74,
      rawMarksStdDeviation: 13,
      accuracyStdDeviation: 10,
      batchToBatchSpreadPercent: 17,
      stabilityByDifficulty: {
        easy: 83,
        medium: 74,
        hard: 66,
      },
      controlledModeRawImprovementPercent: 9,
      controlledModeAccuracyImprovementPercent: 7,
      riskReductionPercent: 10,
      disciplineIndexRolling30Day: 74,
      disciplineIndexYearToDate: 72,
      disciplineIndexYearOverYear: 5,
      overrideFrequencyPerRun: 6,
      overrideFrequencyPerBatch: 10,
      overrideFrequencyPerTeacherAggregated: 8,
      overrideRawMarksWithOverridePercent: 62,
      overrideRawMarksWithoutOverridePercent: 65,
      overrideAccuracyShiftPercent: -2,
      overrideRiskEscalationDelta: 3,
      repeatedOverridePatternCount: 12,
      repeatedOverridePatternLabel: "Controlled Mode bypassed",
      phaseCompliancePercent: 81,
      overrideFrequency: 6,
      executionIntegrityScore: 76,
      riskDistribution: {
        stable: 50,
        driftProne: 19,
        impulsive: 13,
        overextended: 10,
        volatile: 8,
      },
      generatedAt: "2025-12-31T18:10:00.000Z",
    },
    {
      documentId: "2026_01",
      month: "2026-01",
      stabilityIndex: 76,
      rawMarksStdDeviation: 12,
      accuracyStdDeviation: 9,
      batchToBatchSpreadPercent: 15,
      stabilityByDifficulty: {
        easy: 84,
        medium: 76,
        hard: 68,
      },
      controlledModeRawImprovementPercent: 10,
      controlledModeAccuracyImprovementPercent: 8,
      riskReductionPercent: 11,
      disciplineIndexRolling30Day: 76,
      disciplineIndexYearToDate: 74,
      disciplineIndexYearOverYear: 6,
      overrideFrequencyPerRun: 5,
      overrideFrequencyPerBatch: 8,
      overrideFrequencyPerTeacherAggregated: 7,
      overrideRawMarksWithOverridePercent: 64,
      overrideRawMarksWithoutOverridePercent: 66,
      overrideAccuracyShiftPercent: -1,
      overrideRiskEscalationDelta: 3,
      repeatedOverridePatternCount: 10,
      repeatedOverridePatternLabel: "Timer guardrail bypassed",
      phaseCompliancePercent: 83,
      overrideFrequency: 5,
      executionIntegrityScore: 79,
      riskDistribution: {
        stable: 53,
        driftProne: 18,
        impulsive: 12,
        overextended: 9,
        volatile: 8,
      },
      generatedAt: "2026-01-31T18:10:00.000Z",
    },
    {
      documentId: "2026_02",
      month: "2026-02",
      stabilityIndex: 78,
      rawMarksStdDeviation: 11,
      accuracyStdDeviation: 8,
      batchToBatchSpreadPercent: 14,
      stabilityByDifficulty: {
        easy: 86,
        medium: 78,
        hard: 70,
      },
      controlledModeRawImprovementPercent: 11,
      controlledModeAccuracyImprovementPercent: 9,
      riskReductionPercent: 12,
      disciplineIndexRolling30Day: 78,
      disciplineIndexYearToDate: 75,
      disciplineIndexYearOverYear: 6,
      overrideFrequencyPerRun: 5,
      overrideFrequencyPerBatch: 7,
      overrideFrequencyPerTeacherAggregated: 6,
      overrideRawMarksWithOverridePercent: 65,
      overrideRawMarksWithoutOverridePercent: 67,
      overrideAccuracyShiftPercent: -1,
      overrideRiskEscalationDelta: 2,
      repeatedOverridePatternCount: 9,
      repeatedOverridePatternLabel: "Timer guardrail bypassed",
      phaseCompliancePercent: 84,
      overrideFrequency: 5,
      executionIntegrityScore: 81,
      riskDistribution: {
        stable: 55,
        driftProne: 17,
        impulsive: 11,
        overextended: 9,
        volatile: 8,
      },
      generatedAt: "2026-02-28T18:10:00.000Z",
    },
    {
      documentId: "2026_03",
      month: "2026-03",
      stabilityIndex: 81,
      rawMarksStdDeviation: 9,
      accuracyStdDeviation: 7,
      batchToBatchSpreadPercent: 12,
      stabilityByDifficulty: {
        easy: 88,
        medium: 81,
        hard: 74,
      },
      controlledModeRawImprovementPercent: 13,
      controlledModeAccuracyImprovementPercent: 10,
      riskReductionPercent: 14,
      disciplineIndexRolling30Day: 81,
      disciplineIndexYearToDate: 78,
      disciplineIndexYearOverYear: 8,
      overrideFrequencyPerRun: 4,
      overrideFrequencyPerBatch: 6,
      overrideFrequencyPerTeacherAggregated: 5,
      overrideRawMarksWithOverridePercent: 67,
      overrideRawMarksWithoutOverridePercent: 68,
      overrideAccuracyShiftPercent: 0,
      overrideRiskEscalationDelta: 1,
      repeatedOverridePatternCount: 7,
      repeatedOverridePatternLabel: "Phase split bypassed",
      phaseCompliancePercent: 86,
      overrideFrequency: 4,
      executionIntegrityScore: 84,
      riskDistribution: {
        stable: 58,
        driftProne: 15,
        impulsive: 10,
        overextended: 9,
        volatile: 8,
      },
      generatedAt: "2026-03-31T18:10:00.000Z",
    },
    {
      documentId: "2026_04",
      month: "2026-04",
      stabilityIndex: 82,
      rawMarksStdDeviation: 8,
      accuracyStdDeviation: 7,
      batchToBatchSpreadPercent: 11,
      stabilityByDifficulty: {
        easy: 89,
        medium: 82,
        hard: 75,
      },
      controlledModeRawImprovementPercent: 14,
      controlledModeAccuracyImprovementPercent: 11,
      riskReductionPercent: 15,
      disciplineIndexRolling30Day: 82,
      disciplineIndexYearToDate: 79,
      disciplineIndexYearOverYear: 8,
      overrideFrequencyPerRun: 4,
      overrideFrequencyPerBatch: 5,
      overrideFrequencyPerTeacherAggregated: 4,
      overrideRawMarksWithOverridePercent: 68,
      overrideRawMarksWithoutOverridePercent: 69,
      overrideAccuracyShiftPercent: 0,
      overrideRiskEscalationDelta: 1,
      repeatedOverridePatternCount: 6,
      repeatedOverridePatternLabel: "Phase split bypassed",
      phaseCompliancePercent: 87,
      overrideFrequency: 4,
      executionIntegrityScore: 85,
      riskDistribution: {
        stable: 60,
        driftProne: 14,
        impulsive: 10,
        overextended: 8,
        volatile: 8,
      },
      generatedAt: "2026-04-10T18:10:00.000Z",
    },
  ],
};

interface GovernanceSnapshotApiRecord {
  documentId?: unknown;
  month?: unknown;
  stabilityIndex?: unknown;
  rawMarksStdDeviation?: unknown;
  rawScoreStdDeviation?: unknown;
  accuracyStdDeviation?: unknown;
  batchToBatchSpreadPercent?: unknown;
  batchSpreadPercent?: unknown;
  stabilityByDifficulty?: unknown;
  controlledModeRawImprovementPercent?: unknown;
  controlledModeAccuracyImprovementPercent?: unknown;
  riskReductionPercent?: unknown;
  disciplineIndexRolling30Day?: unknown;
  disciplineIndexYearToDate?: unknown;
  disciplineIndexYearOverYear?: unknown;
  disciplineMean?: unknown;
  overrideFrequencyPerRun?: unknown;
  overrideFrequencyPerBatch?: unknown;
  overrideFrequencyPerTeacherAggregated?: unknown;
  overrideRawMarksWithOverridePercent?: unknown;
  overrideRawMarksWithoutOverridePercent?: unknown;
  overrideAccuracyShiftPercent?: unknown;
  overrideRiskEscalationDelta?: unknown;
  repeatedOverridePatternCount?: unknown;
  repeatedOverridePatternLabel?: unknown;
  phaseCompliancePercent?: unknown;
  overrideFrequency?: unknown;
  executionIntegrityScore?: unknown;
  riskDistribution?: unknown;
  generatedAt?: unknown;
}

interface GovernanceSnapshotsApiResult {
  data?: {
    snapshots?: unknown;
    templateStabilityComparisons?: unknown;
    batchRiskSummaries?: unknown;
  };
  snapshots?: unknown;
  templateStabilityComparisons?: unknown;
  batchRiskSummaries?: unknown;
}

interface GovernanceTemplateStabilityApiRecord {
  templateId?: unknown;
  templateName?: unknown;
  runCount?: unknown;
  rawDeltaPercent?: unknown;
  rawDelta?: unknown;
  accuracyDeltaPercent?: unknown;
  accuracyDelta?: unknown;
  riskShiftAcrossBatchesPercent?: unknown;
  riskShiftPercent?: unknown;
  templateStabilityIndex?: unknown;
  latestBatchStabilityIndex?: unknown;
  interpretation?: unknown;
}

interface GovernanceBatchRiskApiRecord {
  batchId?: unknown;
  batchName?: unknown;
  riskDistribution?: unknown;
  avgDisciplineIndex?: unknown;
  avgPhaseAdherencePercent?: unknown;
  rawStabilityScorePercent?: unknown;
  accuracyStabilityScorePercent?: unknown;
}

function toNumberOrZero(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function toNonEmptyString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function normalizeRiskDistribution(value: unknown): Record<GovernanceRiskCluster, number> {
  const fallback: Record<GovernanceRiskCluster, number> = {
    stable: 0,
    driftProne: 0,
    impulsive: 0,
    overextended: 0,
    volatile: 0,
  };

  if (!value || typeof value !== "object") {
    return fallback;
  }

  const source = value as Record<string, unknown>;
  return {
    stable: toNumberOrZero(source.stable),
    driftProne: toNumberOrZero(source.driftProne),
    impulsive: toNumberOrZero(source.impulsive),
    overextended: toNumberOrZero(source.overextended),
    volatile: toNumberOrZero(source.volatile),
  };
}

function normalizeDifficultyStability(
  value: unknown,
  fallbackStabilityIndex: number,
): GovernanceSnapshotRecord["stabilityByDifficulty"] {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};

  return {
    easy: toNumberOrZero(source.easy) || Math.min(100, fallbackStabilityIndex + 7),
    medium: toNumberOrZero(source.medium) || fallbackStabilityIndex,
    hard: toNumberOrZero(source.hard) || Math.max(0, fallbackStabilityIndex - 8),
  };
}

function normalizeGovernanceSnapshot(value: unknown, index: number): GovernanceSnapshotRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as GovernanceSnapshotApiRecord;
  const month = toNonEmptyString(record.month, `snapshot-${index + 1}`);
  const stabilityIndex = toNumberOrZero(record.stabilityIndex);

  return {
    documentId: toNonEmptyString(record.documentId, month.replace("-", "_")),
    month,
    stabilityIndex,
    rawMarksStdDeviation: toNumberOrZero(record.rawMarksStdDeviation ?? record.rawScoreStdDeviation) || Math.max(0, Math.round((100 - stabilityIndex) * 0.5)),
    accuracyStdDeviation: toNumberOrZero(record.accuracyStdDeviation) || Math.max(0, Math.round((100 - stabilityIndex) * 0.4)),
    batchToBatchSpreadPercent:
      toNumberOrZero(record.batchToBatchSpreadPercent ?? record.batchSpreadPercent) ||
      Math.max(0, Math.round((100 - stabilityIndex) * 0.6)),
    stabilityByDifficulty: normalizeDifficultyStability(record.stabilityByDifficulty, stabilityIndex),
    controlledModeRawImprovementPercent:
      toNumberOrZero(record.controlledModeRawImprovementPercent) ||
      Math.max(0, Math.round((stabilityIndex - 60) * 0.35)),
    controlledModeAccuracyImprovementPercent:
      toNumberOrZero(record.controlledModeAccuracyImprovementPercent) ||
      Math.max(0, Math.round((stabilityIndex - 60) * 0.28)),
    riskReductionPercent:
      toNumberOrZero(record.riskReductionPercent) ||
      Math.max(0, Math.round((stabilityIndex - 58) * 0.32)),
    disciplineIndexRolling30Day:
      toNumberOrZero(record.disciplineIndexRolling30Day ?? record.disciplineMean) ||
      Math.max(0, Math.min(100, Math.round(stabilityIndex + 1))),
    disciplineIndexYearToDate:
      toNumberOrZero(record.disciplineIndexYearToDate) ||
      Math.max(0, Math.min(100, Math.round(stabilityIndex - 2))),
    disciplineIndexYearOverYear:
      toNumberOrZero(record.disciplineIndexYearOverYear) ||
      Math.round((stabilityIndex - 70) * 0.3),
    overrideFrequencyPerRun: toNumberOrZero(record.overrideFrequencyPerRun ?? record.overrideFrequency),
    overrideFrequencyPerBatch:
      toNumberOrZero(record.overrideFrequencyPerBatch) ||
      Math.round(toNumberOrZero(record.overrideFrequency) * 1.4),
    overrideFrequencyPerTeacherAggregated:
      toNumberOrZero(record.overrideFrequencyPerTeacherAggregated) ||
      Math.round(toNumberOrZero(record.overrideFrequency) * 1.2),
    overrideRawMarksWithOverridePercent:
      toNumberOrZero(record.overrideRawMarksWithOverridePercent) ||
      Math.max(0, Math.round(stabilityIndex - toNumberOrZero(record.overrideFrequency) * 1.5)),
    overrideRawMarksWithoutOverridePercent:
      toNumberOrZero(record.overrideRawMarksWithoutOverridePercent) ||
      Math.max(0, Math.round(stabilityIndex - toNumberOrZero(record.overrideFrequency))),
    overrideAccuracyShiftPercent:
      toNumberOrZero(record.overrideAccuracyShiftPercent) ||
      -Math.round(toNumberOrZero(record.overrideFrequency) * 0.25),
    overrideRiskEscalationDelta:
      toNumberOrZero(record.overrideRiskEscalationDelta) ||
      Math.round(toNumberOrZero(record.overrideFrequency) * 0.5),
    repeatedOverridePatternCount:
      toNumberOrZero(record.repeatedOverridePatternCount) ||
      Math.round(toNumberOrZero(record.overrideFrequency) * 1.5),
    repeatedOverridePatternLabel:
      toNonEmptyString(record.repeatedOverridePatternLabel, "Controlled Mode bypassed"),
    phaseCompliancePercent: toNumberOrZero(record.phaseCompliancePercent),
    overrideFrequency: toNumberOrZero(record.overrideFrequency),
    executionIntegrityScore: toNumberOrZero(record.executionIntegrityScore),
    riskDistribution: normalizeRiskDistribution(record.riskDistribution),
    generatedAt: toNonEmptyString(record.generatedAt, new Date(0).toISOString()),
  };
}

function normalizeTemplateStabilityComparison(
  value: unknown,
  index: number,
): GovernanceTemplateStabilityComparison | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as GovernanceTemplateStabilityApiRecord;
  const templateId = toNonEmptyString(record.templateId, `template-${index + 1}`);
  const templateStabilityIndex = toNumberOrZero(record.templateStabilityIndex);
  const latestBatchStabilityIndex = toNumberOrZero(record.latestBatchStabilityIndex);
  const rawDeltaPercent = toNumberOrZero(record.rawDeltaPercent ?? record.rawDelta);
  const accuracyDeltaPercent = toNumberOrZero(record.accuracyDeltaPercent ?? record.accuracyDelta);
  const riskShiftAcrossBatchesPercent = toNumberOrZero(record.riskShiftAcrossBatchesPercent ?? record.riskShiftPercent);
  const fallbackInterpretation =
    templateStabilityIndex >= 75 && latestBatchStabilityIndex < 75 ?
      "Stable template + unstable batch pattern -> training issue." :
      templateStabilityIndex < 75 && latestBatchStabilityIndex >= 75 ?
        "Unstable template + stable batch pattern -> template issue." :
        "Template and batch stability should be reviewed together.";

  return {
    templateId,
    templateName: toNonEmptyString(record.templateName, `Template ${index + 1}`),
    runCount: toNumberOrZero(record.runCount),
    rawDeltaPercent,
    accuracyDeltaPercent,
    riskShiftAcrossBatchesPercent,
    templateStabilityIndex,
    latestBatchStabilityIndex,
    interpretation: toNonEmptyString(record.interpretation, fallbackInterpretation),
  };
}

function normalizeBatchRiskSummary(value: unknown, index: number): GovernanceBatchRiskSummary | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as GovernanceBatchRiskApiRecord;

  return {
    batchId: toNonEmptyString(record.batchId, `batch-${index + 1}`),
    batchName: toNonEmptyString(record.batchName, `Batch ${index + 1}`),
    riskDistribution: normalizeRiskDistribution(record.riskDistribution),
    avgDisciplineIndex: toNumberOrZero(record.avgDisciplineIndex),
    avgPhaseAdherencePercent: toNumberOrZero(record.avgPhaseAdherencePercent),
    rawStabilityScorePercent: toNumberOrZero(record.rawStabilityScorePercent),
    accuracyStabilityScorePercent: toNumberOrZero(record.accuracyStabilityScorePercent),
  };
}

export function shouldUseLiveApi(): boolean {
  const host = window.location.hostname.toLowerCase();
  return host !== "127.0.0.1" && host !== "localhost";
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

function resolvePayloadSnapshots(payload: GovernanceSnapshotsApiResult): unknown[] {
  const embedded = payload?.data?.snapshots;
  if (Array.isArray(embedded)) {
    return embedded;
  }

  if (Array.isArray(payload?.snapshots)) {
    return payload.snapshots;
  }

  return [];
}

function resolveTemplateStabilityComparisons(payload: GovernanceSnapshotsApiResult): unknown[] {
  const embedded = payload?.data?.templateStabilityComparisons;
  if (Array.isArray(embedded)) {
    return embedded;
  }

  if (Array.isArray(payload?.templateStabilityComparisons)) {
    return payload.templateStabilityComparisons;
  }

  return [];
}

function resolveBatchRiskSummaries(payload: GovernanceSnapshotsApiResult): unknown[] {
  const embedded = payload?.data?.batchRiskSummaries;
  if (Array.isArray(embedded)) {
    return embedded;
  }

  if (Array.isArray(payload?.batchRiskSummaries)) {
    return payload.batchRiskSummaries;
  }

  return [];
}

export async function fetchGovernanceDataset(context: GovernanceRequestContext): Promise<GovernanceDashboardDataset> {
  const payload = await apiClient.post<GovernanceSnapshotsApiResult>("/admin/governance/snapshots", {
    body: {
      instituteId: context.instituteId,
      yearId: context.yearId,
      limit: 10,
    },
  });

  if (!payload || typeof payload !== "object") {
    throw new Error("POST /admin/governance/snapshots returned an invalid payload.");
  }

  const snapshots = resolvePayloadSnapshots(payload)
    .map((entry, index) => normalizeGovernanceSnapshot(entry, index))
    .filter((entry): entry is GovernanceSnapshotRecord => Boolean(entry))
    .sort((left, right) => left.month.localeCompare(right.month));

  if (snapshots.length === 0) {
    throw new Error("POST /admin/governance/snapshots did not include governance snapshot records.");
  }

  const templateStabilityComparisons = resolveTemplateStabilityComparisons(payload)
    .map((entry, index) => normalizeTemplateStabilityComparison(entry, index))
    .filter((entry): entry is GovernanceTemplateStabilityComparison => Boolean(entry));
  const batchRiskSummaries = resolveBatchRiskSummaries(payload)
    .map((entry, index) => normalizeBatchRiskSummary(entry, index))
    .filter((entry): entry is GovernanceBatchRiskSummary => Boolean(entry));

  return {
    snapshots,
    templateStabilityComparisons:
      templateStabilityComparisons.length > 0 ?
        templateStabilityComparisons :
        FALLBACK_GOVERNANCE_DATASET.templateStabilityComparisons,
    batchRiskSummaries:
      batchRiskSummaries.length > 0 ?
        batchRiskSummaries :
        FALLBACK_GOVERNANCE_DATASET.batchRiskSummaries,
  };
}

export { ApiClientError };
