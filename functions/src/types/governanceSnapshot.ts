export type GovernanceRiskCluster =
  "stable" |
  "driftProne" |
  "impulsive" |
  "overextended" |
  "volatile";

export interface GovernanceSnapshotAggregationInput {
  snapshotMonth?: string;
}

export interface GovernanceSnapshotRunResult {
  academicYear: string;
  created: boolean;
  documentPath?: string;
  instituteId: string;
  reason?:
    "already_exists" |
    "no_summary_documents";
}

export interface GovernanceSnapshotAggregationResult {
  createdCount: number;
  results: GovernanceSnapshotRunResult[];
  skippedCount: number;
  snapshotMonth: string;
}

export interface GovernanceRiskDistribution {
  driftProne: number;
  impulsive: number;
  overextended: number;
  stable: number;
  volatile: number;
}

export interface GovernanceSnapshotDocument {
  academicYear: string;
  avgAccuracyPercent: number;
  avgPhaseAdherence: number;
  avgRawScorePercent: number;
  createdAt: FirebaseFirestore.Timestamp;
  disciplineMean: number;
  disciplineTrend: number;
  disciplineVariance: number;
  executionIntegrityScore: number;
  generatedAt: FirebaseFirestore.Timestamp;
  immutable: true;
  instituteId: string;
  month: string;
  overrideFrequency: number;
  phaseCompliancePercent: number;
  riskClusterDistribution: GovernanceRiskDistribution;
  riskDistribution: GovernanceRiskDistribution;
  rushPatternPercent: number;
  easyNeglectPercent: number;
  hardBiasPercent: number;
  skipBurstPercent: number;
  schemaVersion: 1;
  stabilityIndex: number;
  templateVarianceMean: number;
  wrongStreakPercent: number;
}
