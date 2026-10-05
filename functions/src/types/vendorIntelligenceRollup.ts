export type VendorIntelligenceRollupLayer = "L0" | "L1" | "L2" | "L3";

export type VendorIntelligenceRollupState =
  | "pending"
  | "processing"
  | "complete"
  | "failed_retryable";

export type VendorIntelligenceRollupPhase =
  | "collecting"
  | "installing"
  | "complete";

export interface VendorIntelligenceRollupInput {
  monthId?: string;
  workerId?: string;
}

export interface VendorIntelligenceRollupResult {
  monthId: string;
  operationPath: string;
  phase: VendorIntelligenceRollupPhase;
  processedInstituteCount: number;
  snapshotPath: string;
  state: VendorIntelligenceRollupState;
}

export interface VendorIntelligenceRollupMoney {
  amountMinor: number;
  currency: string;
}

export interface VendorIntelligenceRollupSourceCounts {
  billingSnapshots: number;
  governanceSnapshots: number;
  licenseHistory: number;
  usageMeter: number;
}

export interface VendorIntelligenceRollupLayerCounts {
  L0: number;
  L1: number;
  L2: number;
  L3: number;
}

export interface VendorIntelligenceRollupLayerMoney {
  L0: number;
  L1: number;
  L2: number;
  L3: number;
}

export interface VendorIntelligenceRollupItemDocument {
  activeStudentCount: number | null;
  currentLayer: VendorIntelligenceRollupLayer;
  generatedAt: string;
  governanceSnapshotPresent: boolean;
  instituteId: string;
  instituteName: string | null;
  instituteStatus: "active" | "suspended";
  lastActivityAt: string | null;
  latestCompleteMonth: string;
  licenseTransitionCount: number;
  monthlyRecurringRevenue: VendorIntelligenceRollupMoney | null;
  monthlySessionExecutions: number | null;
  monthlyTestRuns: number | null;
  schemaVersion: 1;
  sourceFingerprint: string;
  sourcePresence: {
    billingSnapshot: boolean;
    governanceSnapshot: boolean;
    licenseHistory: boolean;
    usageMeter: boolean;
  };
}

export interface VendorIntelligencePortfolioSnapshotDocument {
  activeInstituteCount: number;
  currency: string | null;
  excludedInstituteCount: number;
  generatedAt: string;
  immutable: true;
  instituteCountByLayer: VendorIntelligenceRollupLayerCounts;
  monthId: string;
  revenueByLayerMinor: VendorIntelligenceRollupLayerMoney;
  schemaVersion: 1;
  sourceDocumentCounts: VendorIntelligenceRollupSourceCounts;
  sourceFingerprint: string;
  status: "complete";
  suspendedInstituteCount: number;
  totalActiveStudents: number;
  totalInstituteCount: number;
  totalMonthlyRevenueMinor: number;
  totalSessionExecutions: number;
  totalTestRuns: number;
  transitionCount: number;
}
