export interface VendorOverviewDataset {
  dataSource: "vendorMetrics";
  summaryOnly: true;
  reportingPeriod: string;
  portfolio: {
    totalInstitutes: number;
    activeInstitutes: number;
    activeStudents: number;
    monthlyTestRuns: number;
  };
  intelligence: {
    globalDisciplineIndex: number;
    riskDistribution: {
      low: number;
      moderate: number;
      high: number;
    };
  };
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
    reportingPeriod: "July 2026",
    portfolio: {
      totalInstitutes: 148,
      activeInstitutes: 143,
      activeStudents: 45120,
      monthlyTestRuns: 8214,
    },
    intelligence: {
      globalDisciplineIndex: 75.3,
      riskDistribution: {
        low: 63,
        moderate: 28,
        high: 9,
      },
    },
    globalCollectionBoundaries: {
      isolatedFromInstituteQueries: true,
      strictRbacEnforced: true,
      dedicatedMiddlewareRequired: true,
    },
  };
}
