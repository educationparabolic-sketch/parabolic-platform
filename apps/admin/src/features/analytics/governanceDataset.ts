import { ApiClientError } from "../../../../../shared/services/apiClient";
import type {
  AdminGovernanceReportDownloadResult,
  AdminGovernanceReportGenerateRequest,
  AdminGovernanceReportGenerateResult,
  AdminGovernanceReportListResult,
  AdminGovernanceReportRecord,
  AdminGovernanceRiskDistribution,
  AdminGovernanceSnapshotRecord,
} from "../../../../../shared/contracts/apiDtos";
import {
  shouldUseLiveApi as shouldUseConfiguredLiveApi,
} from "../../../../../shared/services/frontendEnvironment";
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
export type GovernanceSnapshotRecord = AdminGovernanceSnapshotRecord;

export interface GovernanceDashboardDataset {
  nextCursor: string | null;
  snapshots: GovernanceSnapshotRecord[];
  source: "fixture" | "live";
  yearId: string;
}

export interface GovernanceRequestContext {
  yearId: string;
}

export type GovernanceReportRecord = AdminGovernanceReportRecord;

export const EMPTY_LIVE_GOVERNANCE_DATASET: GovernanceDashboardDataset = {
  nextCursor: null,
  snapshots: [],
  source: "live",
  yearId: "",
};

export const FALLBACK_GOVERNANCE_DATASET: GovernanceDashboardDataset = {
  nextCursor: null,
  source: "fixture",
  yearId: "2026",
  snapshots: [
    {
      academicYear: "2026",
      avgAccuracyPercent: 76,
      avgPhaseAdherence: 78,
      avgRawScorePercent: 67,
      calibrationVersionUsed: "fixture-calibration-2026-02",
      createdAt: "2026-03-01T00:00:00.000Z",
      disciplineMean: 74,
      disciplineTrend: 1.8,
      disciplineVariance: 7.1,
      documentId: "2026_02",
      easyNeglectPercent: 8,
      executionIntegrityScore: 79,
      generatedAt: "2026-03-01T00:00:00.000Z",
      hardBiasPercent: 7,
      immutable: true,
      month: "2026-02",
      overrideFrequency: 5,
      phaseCompliancePercent: 84,
      riskClusterDistribution: {
        driftProne: 17,
        impulsive: 11,
        overextended: 9,
        stable: 55,
        volatile: 8,
      },
      riskModelVersionUsed: "fixture-risk-2026-02",
      rushPatternPercent: 10,
      schemaVersion: 1,
      skipBurstPercent: 4,
      stabilityIndex: 78,
      templateVarianceMean: 5.4,
      templateVersionRangeUsed: "fixture-template-v3..v8",
      wrongStreakPercent: 3,
    },
    {
      academicYear: "2026",
      avgAccuracyPercent: 79,
      avgPhaseAdherence: 81,
      avgRawScorePercent: 70,
      calibrationVersionUsed: "fixture-calibration-2026-03",
      createdAt: "2026-04-01T00:00:00.000Z",
      disciplineMean: 77,
      disciplineTrend: 2.4,
      disciplineVariance: 6.2,
      documentId: "2026_03",
      easyNeglectPercent: 7,
      executionIntegrityScore: 83,
      generatedAt: "2026-04-01T00:00:00.000Z",
      hardBiasPercent: 6,
      immutable: true,
      month: "2026-03",
      overrideFrequency: 4,
      phaseCompliancePercent: 87,
      riskClusterDistribution: {
        driftProne: 15,
        impulsive: 10,
        overextended: 8,
        stable: 60,
        volatile: 7,
      },
      riskModelVersionUsed: "fixture-risk-2026-03",
      rushPatternPercent: 9,
      schemaVersion: 1,
      skipBurstPercent: 3,
      stabilityIndex: 82,
      templateVarianceMean: 4.8,
      templateVersionRangeUsed: "fixture-template-v3..v9",
      wrongStreakPercent: 2,
    },
  ],
};

function requireObject(value: unknown, fieldName: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Governance field "${fieldName}" must be an object.`);
  }

  return value as Record<string, unknown>;
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Governance field "${fieldName}" must be a non-empty string.`);
  }

  return value.trim();
}

function requireNullableString(value: unknown, fieldName: string): string | null {
  if (value === null) {
    return null;
  }

  return requireString(value, fieldName);
}

function requireNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Governance field "${fieldName}" must be a finite number.`);
  }

  return value;
}

function requireBooleanTrue(value: unknown, fieldName: string): true {
  if (value !== true) {
    throw new Error(`Governance field "${fieldName}" must be true.`);
  }
  return true;
}

function requireRiskDistribution(value: unknown): AdminGovernanceRiskDistribution {
  const record = requireObject(value, "riskClusterDistribution");
  return {
    driftProne: requireNumber(record.driftProne, "riskClusterDistribution.driftProne"),
    impulsive: requireNumber(record.impulsive, "riskClusterDistribution.impulsive"),
    overextended: requireNumber(record.overextended, "riskClusterDistribution.overextended"),
    stable: requireNumber(record.stable, "riskClusterDistribution.stable"),
    volatile: requireNumber(record.volatile, "riskClusterDistribution.volatile"),
  };
}

function normalizeGovernanceSnapshot(value: unknown): GovernanceSnapshotRecord {
  const record = requireObject(value, "snapshot");

  if (record.immutable !== true || record.schemaVersion !== 1) {
    throw new Error("Governance snapshot must be immutable schema version 1.");
  }

  return {
    academicYear: requireString(record.academicYear, "academicYear"),
    avgAccuracyPercent: requireNumber(record.avgAccuracyPercent, "avgAccuracyPercent"),
    avgPhaseAdherence: requireNumber(record.avgPhaseAdherence, "avgPhaseAdherence"),
    avgRawScorePercent: requireNumber(record.avgRawScorePercent, "avgRawScorePercent"),
    calibrationVersionUsed: requireNullableString(
      record.calibrationVersionUsed,
      "calibrationVersionUsed",
    ),
    createdAt: requireString(record.createdAt, "createdAt"),
    disciplineMean: requireNumber(record.disciplineMean, "disciplineMean"),
    disciplineTrend: requireNumber(record.disciplineTrend, "disciplineTrend"),
    disciplineVariance: requireNumber(record.disciplineVariance, "disciplineVariance"),
    documentId: requireString(record.documentId, "documentId"),
    easyNeglectPercent: requireNumber(record.easyNeglectPercent, "easyNeglectPercent"),
    executionIntegrityScore: requireNumber(
      record.executionIntegrityScore,
      "executionIntegrityScore",
    ),
    generatedAt: requireString(record.generatedAt, "generatedAt"),
    hardBiasPercent: requireNumber(record.hardBiasPercent, "hardBiasPercent"),
    immutable: true,
    month: requireString(record.month, "month"),
    overrideFrequency: requireNumber(record.overrideFrequency, "overrideFrequency"),
    phaseCompliancePercent: requireNumber(
      record.phaseCompliancePercent,
      "phaseCompliancePercent",
    ),
    riskClusterDistribution: requireRiskDistribution(record.riskClusterDistribution),
    riskModelVersionUsed: requireNullableString(
      record.riskModelVersionUsed,
      "riskModelVersionUsed",
    ),
    rushPatternPercent: requireNumber(record.rushPatternPercent, "rushPatternPercent"),
    schemaVersion: 1,
    skipBurstPercent: requireNumber(record.skipBurstPercent, "skipBurstPercent"),
    stabilityIndex: requireNumber(record.stabilityIndex, "stabilityIndex"),
    templateVarianceMean: requireNumber(record.templateVarianceMean, "templateVarianceMean"),
    templateVersionRangeUsed: requireNullableString(
      record.templateVersionRangeUsed,
      "templateVersionRangeUsed",
    ),
    wrongStreakPercent: requireNumber(record.wrongStreakPercent, "wrongStreakPercent"),
  };
}

function normalizeGovernanceReport(value: unknown): GovernanceReportRecord {
  const record = requireObject(value, "report");
  const source = requireObject(record.source, "source");
  if (record.contentType !== "application/pdf" || record.status !== "ready") {
    throw new Error("Governance report must be a ready PDF artifact.");
  }
  return {
    auditId: requireString(record.auditId, "auditId"),
    contentType: "application/pdf",
    createdAt: requireString(record.createdAt, "createdAt"),
    fileName: requireString(record.fileName, "fileName"),
    immutable: requireBooleanTrue(record.immutable, "immutable"),
    month: requireString(record.month, "month"),
    reportId: requireString(record.reportId, "reportId"),
    sha256: requireString(record.sha256, "sha256"),
    sizeBytes: requireNumber(record.sizeBytes, "sizeBytes"),
    source: {
      calibrationVersionUsed: requireNullableString(
        source.calibrationVersionUsed,
        "source.calibrationVersionUsed",
      ),
      eventCutoffAt: requireString(source.eventCutoffAt, "source.eventCutoffAt"),
      eventRecordCount: requireNumber(source.eventRecordCount, "source.eventRecordCount"),
      riskModelVersionUsed: requireNullableString(
        source.riskModelVersionUsed,
        "source.riskModelVersionUsed",
      ),
      snapshotGeneratedAt: requireString(
        source.snapshotGeneratedAt,
        "source.snapshotGeneratedAt",
      ),
      snapshotId: requireString(source.snapshotId, "source.snapshotId"),
      snapshotSha256: requireString(source.snapshotSha256, "source.snapshotSha256"),
      templateVersionRangeUsed: requireNullableString(
        source.templateVersionRangeUsed,
        "source.templateVersionRangeUsed",
      ),
    },
    status: "ready",
    yearId: requireString(record.yearId, "yearId"),
  };
}

export function shouldUseLiveApi(): boolean {
  return shouldUseConfiguredLiveApi();
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

export async function fetchGovernanceDataset(
  context: GovernanceRequestContext,
): Promise<GovernanceDashboardDataset> {
  const payload = await apiClient.get<unknown>("/admin/governance/snapshots", {
    query: {
      limit: 36,
      yearId: context.yearId,
    },
  });
  const result = requireObject(payload, "response");

  if (!Array.isArray(result.snapshots)) {
    throw new Error("Governance response must include a snapshots array.");
  }

  const yearId = requireString(result.yearId, "yearId");
  if (yearId !== context.yearId) {
    throw new Error("Governance response academic year does not match the request.");
  }

  const nextCursor = result.nextCursor === null ? null :
    requireString(result.nextCursor, "nextCursor");

  return {
    nextCursor,
    snapshots: result.snapshots
      .map(normalizeGovernanceSnapshot)
      .sort((left, right) => left.month.localeCompare(right.month)),
    source: "live",
    yearId,
  };
}

export async function fetchGovernanceReports(
  context: GovernanceRequestContext,
): Promise<AdminGovernanceReportListResult> {
  const payload = requireObject(await apiClient.get<unknown>(
    "/admin/governance/reports",
    {query: {limit: 50, yearId: context.yearId}},
  ), "response");
  if (!Array.isArray(payload.reports)) {
    throw new Error("Governance response must include a reports array.");
  }
  const yearId = requireString(payload.yearId, "yearId");
  if (yearId !== context.yearId) {
    throw new Error("Governance report year does not match the request.");
  }
  return {
    nextCursor: payload.nextCursor === null ? null :
      requireString(payload.nextCursor, "nextCursor"),
    reports: payload.reports.map(normalizeGovernanceReport),
    yearId,
  };
}

export async function generateGovernanceReport(
  input: AdminGovernanceReportGenerateRequest,
): Promise<AdminGovernanceReportGenerateResult> {
  const payload = requireObject(await apiClient.post<
    unknown,
    AdminGovernanceReportGenerateRequest
  >(
    "/admin/governance/reports",
    {body: input},
  ), "response");
  if (payload.disposition !== "applied" && payload.disposition !== "replayed") {
    throw new Error("Governance report response has an invalid disposition.");
  }
  return {
    disposition: payload.disposition,
    report: normalizeGovernanceReport(payload.report),
  };
}

export async function authorizeGovernanceReportDownload(
  reportId: string,
): Promise<AdminGovernanceReportDownloadResult> {
  const payload = requireObject(await apiClient.get<unknown>(
    `/admin/governance/reports/${reportId}/download`,
  ), "response");
  if (payload.contentType !== "application/pdf") {
    throw new Error("Governance download must authorize a PDF artifact.");
  }
  return {
    contentType: "application/pdf",
    downloadUrl: requireString(payload.downloadUrl, "downloadUrl"),
    expiresAt: requireString(payload.expiresAt, "expiresAt"),
    fileName: requireString(payload.fileName, "fileName"),
    reportId: requireString(payload.reportId, "reportId"),
    sha256: requireString(payload.sha256, "sha256"),
    sizeBytes: requireNumber(payload.sizeBytes, "sizeBytes"),
  };
}

export { ApiClientError };
