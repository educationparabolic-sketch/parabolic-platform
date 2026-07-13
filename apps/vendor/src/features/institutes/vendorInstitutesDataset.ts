import type { LicenseLayer } from "../../../../../shared/types/portalRouting";

export type VendorLicenseLevel = "L0" | "L1" | "L2";
export type VendorLicenseTier = "Tier 1" | "Tier 2" | "Tier 3";
export type VendorLicensePlanId = `${VendorLicenseLevel}-${"T1" | "T2" | "T3"}`;

export type VendorInstituteSubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "suspended"
  | "canceled";

export type VendorInstituteLifecycleStatus = "active" | "watchlist" | "suspended" | "archived";

export type VendorInstituteActionType =
  | "ViewInstitute"
  | "SuspendInstitute"
  | "UpgradeLicense"
  | "DowngradeLicense"
  | "ExtendLicense"
  | "ForceArchive"
  | "DeleteInstitute";

export interface VendorInstituteRecord {
  id: string;
  instituteName: string;
  currentLicenseLayer: VendorLicenseLevel;
  currentLicensePlanId: VendorLicensePlanId;
  activeStudentCount: number;
  subscriptionStatus: VendorInstituteSubscriptionStatus;
  lifecycleStatus: VendorInstituteLifecycleStatus;
  monthlyUsage: number;
  concurrentStudentsNow: number;
  peakConcurrentStudents: number;
  examSessionsThisMonth: number;
  lastActiveDate: string;
  paymentStatus: "Paid" | "Due" | "Failed";
  riskProfile?: "Low" | "Moderate" | "High";
  stabilityIndex?: number;
  activityMetrics: {
    monthlyTestRuns: number;
    averageDisciplineIndex: number;
    highRiskStudents: number;
    supportTicketsOpen: number;
  };
  billing: {
    billingCycle: "Monthly" | "Quarterly";
    nextInvoiceDate: string;
    paymentFailures: number;
    amountDueInr: number;
    manualOverrideEnabled: boolean;
  };
}

export interface VendorLicensePlan {
  id: VendorLicensePlanId;
  level: VendorLicenseLevel;
  tier: VendorLicenseTier;
  baseFeeInr: number;
  perStudentFeeInr: number;
  maxConcurrentStudents: number;
  maxExamSessionsPerMonth: number;
  isActive: boolean;
}

export interface VendorLicenseChangeRecord {
  id: string;
  instituteId: string;
  instituteName: string;
  changedAt: string;
  changedBy: string;
  fromLayer: VendorLicenseLevel;
  toLayer: VendorLicenseLevel;
  fromPlanId: VendorLicensePlanId;
  toPlanId: VendorLicensePlanId;
  reason: string;
  billingCycle: "Monthly" | "Quarterly";
}

export interface VendorLicenseWebhookLog {
  id: string;
  instituteId: string;
  receivedAt: string;
  eventType: string;
  status: "processed" | "retrying" | "failed";
  summary: string;
}

export interface VendorInstitutesDataset {
  sourceCollection: "institutes";
  licensePlans: VendorLicensePlan[];
  institutes: VendorInstituteRecord[];
  licenseChangeHistory: VendorLicenseChangeRecord[];
  webhookLogs: VendorLicenseWebhookLog[];
}

const LICENSE_PLANS: VendorLicensePlan[] = [
  {
    id: "L0-T1",
    level: "L0",
    tier: "Tier 1",
    baseFeeInr: 3500,
    perStudentFeeInr: 50,
    maxConcurrentStudents: 200,
    maxExamSessionsPerMonth: 30,
    isActive: true,
  },
  {
    id: "L0-T2",
    level: "L0",
    tier: "Tier 2",
    baseFeeInr: 6500,
    perStudentFeeInr: 52,
    maxConcurrentStudents: 400,
    maxExamSessionsPerMonth: 50,
    isActive: true,
  },
  {
    id: "L0-T3",
    level: "L0",
    tier: "Tier 3",
    baseFeeInr: 9500,
    perStudentFeeInr: 54,
    maxConcurrentStudents: 600,
    maxExamSessionsPerMonth: 70,
    isActive: true,
  },
  {
    id: "L1-T1",
    level: "L1",
    tier: "Tier 1",
    baseFeeInr: 5500,
    perStudentFeeInr: 98,
    maxConcurrentStudents: 200,
    maxExamSessionsPerMonth: 30,
    isActive: true,
  },
  {
    id: "L1-T2",
    level: "L1",
    tier: "Tier 2",
    baseFeeInr: 8500,
    perStudentFeeInr: 105,
    maxConcurrentStudents: 400,
    maxExamSessionsPerMonth: 50,
    isActive: true,
  },
  {
    id: "L1-T3",
    level: "L1",
    tier: "Tier 3",
    baseFeeInr: 11500,
    perStudentFeeInr: 108,
    maxConcurrentStudents: 600,
    maxExamSessionsPerMonth: 70,
    isActive: true,
  },
  {
    id: "L2-T1",
    level: "L2",
    tier: "Tier 1",
    baseFeeInr: 8500,
    perStudentFeeInr: 140,
    maxConcurrentStudents: 200,
    maxExamSessionsPerMonth: 30,
    isActive: true,
  },
  {
    id: "L2-T2",
    level: "L2",
    tier: "Tier 2",
    baseFeeInr: 11500,
    perStudentFeeInr: 155,
    maxConcurrentStudents: 400,
    maxExamSessionsPerMonth: 50,
    isActive: true,
  },
  {
    id: "L2-T3",
    level: "L2",
    tier: "Tier 3",
    baseFeeInr: 14500,
    perStudentFeeInr: 160,
    maxConcurrentStudents: 600,
    maxExamSessionsPerMonth: 70,
    isActive: true,
  },
];

const INSTITUTES: VendorInstituteRecord[] = [
  {
    id: "inst_north_star",
    instituteName: "North Star Academy",
    currentLicenseLayer: "L2",
    currentLicensePlanId: "L2-T3",
    activeStudentCount: 1340,
    subscriptionStatus: "active",
    lifecycleStatus: "active",
    monthlyUsage: 93,
    concurrentStudentsNow: 518,
    peakConcurrentStudents: 574,
    examSessionsThisMonth: 66,
    lastActiveDate: "2026-04-21T12:40:00.000Z",
    paymentStatus: "Paid",
    riskProfile: "Moderate",
    stabilityIndex: 78,
    activityMetrics: {
      monthlyTestRuns: 612,
      averageDisciplineIndex: 74,
      highRiskStudents: 117,
      supportTicketsOpen: 2,
    },
    billing: {
      billingCycle: "Monthly",
      nextInvoiceDate: "2026-05-01T00:00:00.000Z",
      paymentFailures: 0,
      amountDueInr: 228900,
      manualOverrideEnabled: false,
    },
  },
  {
    id: "inst_riverdale",
    instituteName: "Riverdale Test Hub",
    currentLicenseLayer: "L1",
    currentLicensePlanId: "L1-T2",
    activeStudentCount: 820,
    subscriptionStatus: "past_due",
    lifecycleStatus: "watchlist",
    monthlyUsage: 67,
    concurrentStudentsNow: 312,
    peakConcurrentStudents: 361,
    examSessionsThisMonth: 42,
    lastActiveDate: "2026-04-20T09:15:00.000Z",
    paymentStatus: "Due",
    riskProfile: "High",
    stabilityIndex: 58,
    activityMetrics: {
      monthlyTestRuns: 389,
      averageDisciplineIndex: 61,
      highRiskStudents: 143,
      supportTicketsOpen: 5,
    },
    billing: {
      billingCycle: "Monthly",
      nextInvoiceDate: "2026-04-24T00:00:00.000Z",
      paymentFailures: 2,
      amountDueInr: 94600,
      manualOverrideEnabled: true,
    },
  },
  {
    id: "inst_orbit",
    instituteName: "Orbit Scholars",
    currentLicenseLayer: "L2",
    currentLicensePlanId: "L2-T3",
    activeStudentCount: 2055,
    subscriptionStatus: "active",
    lifecycleStatus: "active",
    monthlyUsage: 98,
    concurrentStudentsNow: 589,
    peakConcurrentStudents: 600,
    examSessionsThisMonth: 70,
    lastActiveDate: "2026-04-22T05:22:00.000Z",
    paymentStatus: "Paid",
    riskProfile: "Low",
    stabilityIndex: 88,
    activityMetrics: {
      monthlyTestRuns: 946,
      averageDisciplineIndex: 82,
      highRiskStudents: 88,
      supportTicketsOpen: 1,
    },
    billing: {
      billingCycle: "Quarterly",
      nextInvoiceDate: "2026-06-15T00:00:00.000Z",
      paymentFailures: 0,
      amountDueInr: 343300,
      manualOverrideEnabled: false,
    },
  },
  {
    id: "inst_delta",
    instituteName: "Delta Coaching Network",
    currentLicenseLayer: "L0",
    currentLicensePlanId: "L0-T1",
    activeStudentCount: 395,
    subscriptionStatus: "trialing",
    lifecycleStatus: "active",
    monthlyUsage: 41,
    concurrentStudentsNow: 92,
    peakConcurrentStudents: 118,
    examSessionsThisMonth: 12,
    lastActiveDate: "2026-04-19T16:48:00.000Z",
    paymentStatus: "Paid",
    activityMetrics: {
      monthlyTestRuns: 146,
      averageDisciplineIndex: 56,
      highRiskStudents: 62,
      supportTicketsOpen: 3,
    },
    billing: {
      billingCycle: "Monthly",
      nextInvoiceDate: "2026-04-29T00:00:00.000Z",
      paymentFailures: 0,
      amountDueInr: 23250,
      manualOverrideEnabled: false,
    },
  },
  {
    id: "inst_zenith",
    instituteName: "Zenith Integrated Prep",
    currentLicenseLayer: "L2",
    currentLicensePlanId: "L2-T2",
    activeStudentCount: 1495,
    subscriptionStatus: "suspended",
    lifecycleStatus: "suspended",
    monthlyUsage: 32,
    concurrentStudentsNow: 0,
    peakConcurrentStudents: 448,
    examSessionsThisMonth: 18,
    lastActiveDate: "2026-04-12T08:30:00.000Z",
    paymentStatus: "Failed",
    riskProfile: "High",
    stabilityIndex: 44,
    activityMetrics: {
      monthlyTestRuns: 211,
      averageDisciplineIndex: 49,
      highRiskStudents: 202,
      supportTicketsOpen: 9,
    },
    billing: {
      billingCycle: "Monthly",
      nextInvoiceDate: "2026-04-16T00:00:00.000Z",
      paymentFailures: 3,
      amountDueInr: 243225,
      manualOverrideEnabled: true,
    },
  },
];

const LICENSE_HISTORY: VendorLicenseChangeRecord[] = [
  {
    id: "hist_001",
    instituteId: "inst_north_star",
    instituteName: "North Star Academy",
    changedAt: "2026-04-15T06:12:00.000Z",
    changedBy: "vendor.ops@parabolic.local",
    fromLayer: "L1",
    toLayer: "L2",
    fromPlanId: "L1-T3",
    toPlanId: "L2-T3",
    reason: "Governance analytics enablement",
    billingCycle: "Monthly",
  },
  {
    id: "hist_002",
    instituteId: "inst_riverdale",
    instituteName: "Riverdale Test Hub",
    changedAt: "2026-04-10T11:42:00.000Z",
    changedBy: "vendor.billing@parabolic.local",
    fromLayer: "L2",
    toLayer: "L1",
    fromPlanId: "L2-T2",
    toPlanId: "L1-T2",
    reason: "Temporary downgrade during delinquency recovery",
    billingCycle: "Monthly",
  },
  {
    id: "hist_003",
    instituteId: "inst_orbit",
    instituteName: "Orbit Scholars",
    changedAt: "2026-04-09T05:05:00.000Z",
    changedBy: "vendor.ops@parabolic.local",
    fromLayer: "L2",
    toLayer: "L2",
    fromPlanId: "L2-T2",
    toPlanId: "L2-T3",
    reason: "Tier capacity expansion approved",
    billingCycle: "Quarterly",
  },
  {
    id: "hist_004",
    instituteId: "inst_zenith",
    instituteName: "Zenith Integrated Prep",
    changedAt: "2026-04-05T13:35:00.000Z",
    changedBy: "vendor.billing@parabolic.local",
    fromLayer: "L2",
    toLayer: "L2",
    fromPlanId: "L2-T3",
    toPlanId: "L2-T2",
    reason: "Payment failure fallback policy",
    billingCycle: "Monthly",
  },
  {
    id: "hist_005",
    instituteId: "inst_delta",
    instituteName: "Delta Coaching Network",
    changedAt: "2026-04-02T17:22:00.000Z",
    changedBy: "vendor.ops@parabolic.local",
    fromLayer: "L0",
    toLayer: "L0",
    fromPlanId: "L0-T1",
    toPlanId: "L0-T1",
    reason: "Trial extension approved",
    billingCycle: "Monthly",
  },
];

const WEBHOOK_LOGS: VendorLicenseWebhookLog[] = [
  {
    id: "webhook_001",
    instituteId: "inst_north_star",
    receivedAt: "2026-04-21T03:40:00.000Z",
    eventType: "invoice.paid",
    status: "processed",
    summary: "Monthly invoice paid successfully.",
  },
  {
    id: "webhook_002",
    instituteId: "inst_riverdale",
    receivedAt: "2026-04-20T14:08:00.000Z",
    eventType: "invoice.payment_failed",
    status: "retrying",
    summary: "Card charge failed; retry scheduled in 24h.",
  },
  {
    id: "webhook_003",
    instituteId: "inst_zenith",
    receivedAt: "2026-04-16T06:11:00.000Z",
    eventType: "customer.subscription.updated",
    status: "failed",
    summary: "Subscription suspended after repeated payment failure.",
  },
  {
    id: "webhook_004",
    instituteId: "inst_orbit",
    receivedAt: "2026-04-09T02:05:00.000Z",
    eventType: "invoice.created",
    status: "processed",
    summary: "Quarterly invoice generated for L2 Tier 3 capacity plan.",
  },
  {
    id: "webhook_005",
    instituteId: "inst_delta",
    receivedAt: "2026-04-02T08:01:00.000Z",
    eventType: "customer.subscription.trial_will_end",
    status: "processed",
    summary: "Trial expiration warning synced to vendor controls.",
  },
];

export function getVendorInstitutesDataset(): VendorInstitutesDataset {
  return {
    sourceCollection: "institutes",
    licensePlans: LICENSE_PLANS,
    institutes: INSTITUTES,
    licenseChangeHistory: LICENSE_HISTORY,
    webhookLogs: WEBHOOK_LOGS,
  };
}

export function filterInstitutes(
  institutes: VendorInstituteRecord[],
  filters: {
    query: string;
    layer: LicenseLayer | "all";
    subscriptionStatus: VendorInstituteSubscriptionStatus | "all";
    lifecycleStatus: VendorInstituteLifecycleStatus | "all";
  },
): VendorInstituteRecord[] {
  const query = filters.query.trim().toLowerCase();

  return institutes.filter((institute) => {
    if (filters.layer !== "all" && institute.currentLicenseLayer !== filters.layer) {
      return false;
    }

    if (
      filters.subscriptionStatus !== "all" &&
      institute.subscriptionStatus !== filters.subscriptionStatus
    ) {
      return false;
    }

    if (filters.lifecycleStatus !== "all" && institute.lifecycleStatus !== filters.lifecycleStatus) {
      return false;
    }

    if (query.length === 0) {
      return true;
    }

    const haystack = [
      institute.instituteName,
      institute.id,
      institute.currentLicenseLayer,
      institute.subscriptionStatus,
      institute.paymentStatus,
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(query);
  });
}

export function getLicenseHistoryForInstitute(
  dataset: VendorInstitutesDataset,
  instituteId: string,
): VendorLicenseChangeRecord[] {
  return dataset.licenseChangeHistory.filter((entry) => entry.instituteId === instituteId);
}

export function getWebhookLogsForInstitute(
  dataset: VendorInstitutesDataset,
  instituteId: string,
): VendorLicenseWebhookLog[] {
  return dataset.webhookLogs.filter((entry) => entry.instituteId === instituteId);
}
