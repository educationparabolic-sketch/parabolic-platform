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
  phaseCompliancePercent: number;
  overrideFrequency: number;
  executionIntegrityScore: number;
  riskDistribution: Record<GovernanceRiskCluster, number>;
  generatedAt: string;
}

export interface GovernanceDashboardDataset {
  snapshots: GovernanceSnapshotRecord[];
}

export const FALLBACK_GOVERNANCE_DATASET: GovernanceDashboardDataset = {
  snapshots: [
    {
      documentId: "2025_11",
      month: "2025-11",
      stabilityIndex: 72,
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
  phaseCompliancePercent?: unknown;
  overrideFrequency?: unknown;
  executionIntegrityScore?: unknown;
  riskDistribution?: unknown;
  generatedAt?: unknown;
}

interface GovernanceSnapshotsApiResult {
  data?: {
    snapshots?: unknown;
  };
  snapshots?: unknown;
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

function normalizeGovernanceSnapshot(value: unknown, index: number): GovernanceSnapshotRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as GovernanceSnapshotApiRecord;
  const month = toNonEmptyString(record.month, `snapshot-${index + 1}`);

  return {
    documentId: toNonEmptyString(record.documentId, month.replace("-", "_")),
    month,
    stabilityIndex: toNumberOrZero(record.stabilityIndex),
    phaseCompliancePercent: toNumberOrZero(record.phaseCompliancePercent),
    overrideFrequency: toNumberOrZero(record.overrideFrequency),
    executionIntegrityScore: toNumberOrZero(record.executionIntegrityScore),
    riskDistribution: normalizeRiskDistribution(record.riskDistribution),
    generatedAt: toNonEmptyString(record.generatedAt, new Date(0).toISOString()),
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

export async function fetchGovernanceDataset(): Promise<GovernanceDashboardDataset> {
  const instituteId = import.meta.env.VITE_GOVERNANCE_INSTITUTE_ID ?? "demo-institute";
  const yearId = import.meta.env.VITE_GOVERNANCE_YEAR_ID ?? "2025-26";

  const payload = await apiClient.post<GovernanceSnapshotsApiResult>("/admin/governance/snapshots", {
    body: {
      instituteId,
      yearId,
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

  return { snapshots };
}

export { ApiClientError };
