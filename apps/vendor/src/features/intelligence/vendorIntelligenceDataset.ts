export interface VendorIntelligenceKpi {
  id:
    | "InstituteGrowthRate"
    | "LicenseLayerDistribution"
    | "ChurnRate"
    | "UpgradeConversionRate"
    | "ActiveStudentGrowth";
  label: string;
  value: string;
  helper: string;
}

export interface VendorLayerDistributionPoint {
  layer: "TRIAL" | "L0" | "L1" | "L2";
  instituteCount: number;
  percentage: number;
}

export interface VendorMonthlyTrendPoint {
  month: string;
  activeInstitutes: number;
  activeStudents: number;
  churnRatePercent: number;
}

export interface DisciplineIndexPoint {
  examType: string;
  disciplineIndex: number;
}

export interface BehaviorSignalPoint {
  metric:
    | "GlobalHardBiasFrequency"
    | "GlobalEasyNeglectFrequency"
    | "ControlledModeEffectivenessGlobal";
  percentage: number;
}

export interface TopicWeaknessCluster {
  clusterId: string;
  examType: string;
  instituteCount: number;
  severity: "low" | "medium" | "high";
  dominantTopics: string[];
}

export interface VendorIntelligenceDataset {
  sourceCollections: ["vendorAggregates", "billingRecords", "licenseHistory"];
  summaryOnly: true;
  kpis: VendorIntelligenceKpi[];
  monthlyTrend: VendorMonthlyTrendPoint[];
  layerDistribution: VendorLayerDistributionPoint[];
  disciplineIndexByExamType: DisciplineIndexPoint[];
  behaviorSignals: BehaviorSignalPoint[];
  topicWeaknessClusters: TopicWeaknessCluster[];
}

export function getVendorIntelligenceDataset(): VendorIntelligenceDataset {
  return {
    sourceCollections: ["vendorAggregates", "billingRecords", "licenseHistory"],
    summaryOnly: true,
    kpis: [
      {
        id: "InstituteGrowthRate",
        label: "Institute Growth Rate",
        value: "+4.1%",
        helper: "Month-over-month active institute growth.",
      },
      {
        id: "LicenseLayerDistribution",
        label: "Subscription Mix",
        value: "Trial: 31 | L0: 14 | L1: 42 | L2: 56",
        helper: "Current institutes across trial and license layers.",
      },
      {
        id: "ChurnRate",
        label: "Churn Rate",
        value: "2.9%",
        helper: "Current-cycle institute churn indicator.",
      },
      {
        id: "UpgradeConversionRate",
        label: "Upgrade Conversion Rate",
        value: "11.7%",
        helper: "Institutes moving to a higher layer this cycle.",
      },
      {
        id: "ActiveStudentGrowth",
        label: "Active Student Growth",
        value: "+6.3%",
        helper: "Active student delta versus previous month.",
      },
    ],
    monthlyTrend: [
      { month: "2025-11", activeInstitutes: 131, activeStudents: 40120, churnRatePercent: 3.4 },
      { month: "2025-12", activeInstitutes: 133, activeStudents: 40790, churnRatePercent: 3.2 },
      { month: "2026-01", activeInstitutes: 136, activeStudents: 41840, churnRatePercent: 3.1 },
      { month: "2026-02", activeInstitutes: 139, activeStudents: 42710, churnRatePercent: 3.0 },
      { month: "2026-03", activeInstitutes: 141, activeStudents: 43840, churnRatePercent: 2.9 },
      { month: "2026-04", activeInstitutes: 143, activeStudents: 45120, churnRatePercent: 2.9 },
    ],
    layerDistribution: [
      { layer: "TRIAL", instituteCount: 31, percentage: 21.7 },
      { layer: "L0", instituteCount: 14, percentage: 9.8 },
      { layer: "L1", instituteCount: 42, percentage: 29.4 },
      { layer: "L2", instituteCount: 56, percentage: 39.2 },
    ],
    disciplineIndexByExamType: [
      { examType: "JEE Main", disciplineIndex: 76.3 },
      { examType: "JEE Advanced", disciplineIndex: 71.5 },
      { examType: "NEET", disciplineIndex: 74.2 },
      { examType: "Foundation", disciplineIndex: 79.1 },
    ],
    behaviorSignals: [
      { metric: "GlobalHardBiasFrequency", percentage: 17.8 },
      { metric: "GlobalEasyNeglectFrequency", percentage: 12.6 },
      { metric: "ControlledModeEffectivenessGlobal", percentage: 68.4 },
    ],
    topicWeaknessClusters: [
      {
        clusterId: "cluster-01",
        examType: "JEE Main",
        instituteCount: 38,
        severity: "high",
        dominantTopics: [
          "Organic Reaction Mechanism",
          "Permutation/Combination",
          "Current Electricity",
        ],
      },
      {
        clusterId: "cluster-02",
        examType: "NEET",
        instituteCount: 31,
        severity: "medium",
        dominantTopics: ["Human Physiology", "Plant Growth Regulators", "Thermodynamics"],
      },
      {
        clusterId: "cluster-03",
        examType: "JEE Advanced",
        instituteCount: 19,
        severity: "high",
        dominantTopics: ["Vector 3D", "Rotational Dynamics", "Electrochemistry"],
      },
      {
        clusterId: "cluster-04",
        examType: "Foundation",
        instituteCount: 24,
        severity: "low",
        dominantTopics: ["Basic Algebra", "Grammar Precision", "Data Interpretation"],
      },
    ],
  };
}
