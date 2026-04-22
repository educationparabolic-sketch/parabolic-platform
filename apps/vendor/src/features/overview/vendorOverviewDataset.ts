export interface VendorOverviewMetric {
  id:
    | "TotalInstitutes"
    | "ActiveInstitutes"
    | "TotalActiveStudents"
    | "TotalMonthlyTestRuns"
    | "GlobalRiskDistribution"
    | "GlobalDisciplineIndex"
    | "MonthlyRecurringRevenue"
    | "InfrastructureCostEstimate"
    | "SystemErrorRate";
  label: string;
  value: string;
  helper: string;
}

export interface VendorOverviewDataset {
  dataSource: "vendorMetrics";
  summaryOnly: true;
  metrics: VendorOverviewMetric[];
  globalCollectionBoundaries: {
    isolatedFromInstituteQueries: true;
    strictRbacEnforced: true;
    dedicatedMiddlewareRequired: true;
  };
}

export function getVendorOverviewDataset(): VendorOverviewDataset {
  return {
    dataSource: "vendorMetrics",
    summaryOnly: true,
    metrics: [
      {
        id: "TotalInstitutes",
        label: "Total Institutes",
        value: "148",
        helper: "Global institute portfolio count",
      },
      {
        id: "ActiveInstitutes",
        label: "Active Institutes",
        value: "136",
        helper: "Institutes with active subscriptions",
      },
      {
        id: "TotalActiveStudents",
        label: "Total Active Students",
        value: "42,930",
        helper: "Current billing-cycle active students",
      },
      {
        id: "TotalMonthlyTestRuns",
        label: "Total Monthly Test Runs",
        value: "8,214",
        helper: "Submitted run count in the current month",
      },
      {
        id: "GlobalRiskDistribution",
        label: "Global Risk Distribution",
        value: "Low 63% | Moderate 28% | High 9%",
        helper: "Aggregated cross-institute risk snapshot",
      },
      {
        id: "GlobalDisciplineIndex",
        label: "Global Discipline Index",
        value: "74.6",
        helper: "Summary-only cross-institute discipline index",
      },
      {
        id: "MonthlyRecurringRevenue",
        label: "Monthly Recurring Revenue (MRR)",
        value: "$184,250",
        helper: "Current-month recognized recurring revenue",
      },
      {
        id: "InfrastructureCostEstimate",
        label: "Infrastructure Cost Estimate",
        value: "$38,940",
        helper: "Firestore, Functions, Hosting, and storage estimate",
      },
      {
        id: "SystemErrorRate",
        label: "System Error Rate",
        value: "0.21%",
        helper: "Cloud runtime and endpoint error percentage",
      },
    ],
    globalCollectionBoundaries: {
      isolatedFromInstituteQueries: true,
      strictRbacEnforced: true,
      dedicatedMiddlewareRequired: true,
    },
  };
}
