import { ApiClientError } from "../../../../../shared/services/apiClient";
import { getPortalApiClient } from "../../../../../shared/services/portalIntegration";

const apiClient = getPortalApiClient("admin");

export type AdminLicenseLevel = "L0" | "L1" | "L2";
export type AdminLicenseTier = "Tier 1" | "Tier 2" | "Tier 3";
export type AdminLicensePlanId = "TRIAL" | `${AdminLicenseLevel}-${"T1" | "T2" | "T3"}`;
export type AdminSubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "suspended"
  | "trial_expired";

export interface AdminLicensePlan {
  id: AdminLicensePlanId;
  level: AdminLicenseLevel;
  tier: AdminLicenseTier;
  baseFeeInr: number;
  perStudentFeeInr: number;
  maxConcurrentStudents: number;
  maxExamSessionsPerMonth: number;
  availability: "onboarding_only" | "available";
}

export interface AdminCurrentLicense {
  instituteId: string;
  instituteName: string;
  planId: AdminLicensePlanId;
  level: AdminLicenseLevel;
  tier: AdminLicenseTier;
  subscriptionStatus: AdminSubscriptionStatus;
  billingCycle: "Monthly" | "Quarterly";
  licenseStartDate: string;
  expiryDate: string;
  activeStudentCount: number;
  baseFeeInr: number;
  perStudentFeeInr: number;
  maxConcurrentStudents: number;
  maxExamSessionsPerMonth: number;
}

export interface AdminLicenseUsage {
  activeStudents: number;
  peakConcurrentStudents: number;
  examSessionsThisMonth: number;
  monthlyTestRuns: number;
  estimatedCurrentChargeInr: number;
}

export interface AdminLicenseInvoice {
  id: string;
  invoiceNumber: string;
  billingPeriod: string;
  issuedAt: string;
  dueAt: string;
  amountInr: number;
  status: "draft" | "due" | "past_due" | "paid" | "failed";
}

export interface AdminLicenseCapability {
  id: string;
  label: string;
  description: string;
  minimumLevel: AdminLicenseLevel;
}

export interface AdminLicenseUpgradeRequest {
  id: string;
  requestedPlanId: AdminLicensePlanId;
  submittedAt: string;
  requestedBy: string;
  reason: string;
  status: "pending" | "payment_required" | "approved" | "rejected";
  vendorNote: string;
}

export interface AdminLicenseHistoryEntry {
  id: string;
  timestamp: string;
  previousPlanId: AdminLicensePlanId;
  newPlanId: AdminLicensePlanId;
  billingCycle: "Monthly" | "Quarterly";
  reason: string;
  actor: string;
}

export interface AdminLicensingSnapshot {
  currentLicense: AdminCurrentLicense;
  usage: AdminLicenseUsage;
  plans: AdminLicensePlan[];
  capabilities: AdminLicenseCapability[];
  invoices: AdminLicenseInvoice[];
  upgradeRequests: AdminLicenseUpgradeRequest[];
  licenseHistory: AdminLicenseHistoryEntry[];
}

interface AdminLicensingApiResponse {
  code: string;
  data?: { snapshot?: unknown; request?: AdminLicenseUpgradeRequest };
}

export const LICENSE_PLANS: AdminLicensePlan[] = [
  {
    id: "TRIAL",
    level: "L0",
    tier: "Tier 1",
    baseFeeInr: 0,
    perStudentFeeInr: 0,
    maxConcurrentStudents: 200,
    maxExamSessionsPerMonth: 30,
    availability: "onboarding_only",
  },
  {
    id: "L0-T1",
    level: "L0",
    tier: "Tier 1",
    baseFeeInr: 3500,
    perStudentFeeInr: 50,
    maxConcurrentStudents: 200,
    maxExamSessionsPerMonth: 30,
    availability: "available",
  },
  {
    id: "L0-T2",
    level: "L0",
    tier: "Tier 2",
    baseFeeInr: 6500,
    perStudentFeeInr: 52,
    maxConcurrentStudents: 400,
    maxExamSessionsPerMonth: 50,
    availability: "available",
  },
  {
    id: "L0-T3",
    level: "L0",
    tier: "Tier 3",
    baseFeeInr: 9500,
    perStudentFeeInr: 54,
    maxConcurrentStudents: 600,
    maxExamSessionsPerMonth: 70,
    availability: "available",
  },
  {
    id: "L1-T1",
    level: "L1",
    tier: "Tier 1",
    baseFeeInr: 5500,
    perStudentFeeInr: 98,
    maxConcurrentStudents: 200,
    maxExamSessionsPerMonth: 30,
    availability: "available",
  },
  {
    id: "L1-T2",
    level: "L1",
    tier: "Tier 2",
    baseFeeInr: 8500,
    perStudentFeeInr: 105,
    maxConcurrentStudents: 400,
    maxExamSessionsPerMonth: 50,
    availability: "available",
  },
  {
    id: "L1-T3",
    level: "L1",
    tier: "Tier 3",
    baseFeeInr: 11500,
    perStudentFeeInr: 108,
    maxConcurrentStudents: 600,
    maxExamSessionsPerMonth: 70,
    availability: "available",
  },
  {
    id: "L2-T1",
    level: "L2",
    tier: "Tier 1",
    baseFeeInr: 8500,
    perStudentFeeInr: 140,
    maxConcurrentStudents: 200,
    maxExamSessionsPerMonth: 30,
    availability: "available",
  },
  {
    id: "L2-T2",
    level: "L2",
    tier: "Tier 2",
    baseFeeInr: 11500,
    perStudentFeeInr: 155,
    maxConcurrentStudents: 400,
    maxExamSessionsPerMonth: 50,
    availability: "available",
  },
  {
    id: "L2-T3",
    level: "L2",
    tier: "Tier 3",
    baseFeeInr: 14500,
    perStudentFeeInr: 160,
    maxConcurrentStudents: 600,
    maxExamSessionsPerMonth: 70,
    availability: "available",
  },
];

export const FALLBACK_SNAPSHOT: AdminLicensingSnapshot = {
  currentLicense: {
    instituteId: "inst_demo_admin",
    instituteName: "Parabolic Demo Institute",
    planId: "L2-T2",
    level: "L2",
    tier: "Tier 2",
    subscriptionStatus: "active",
    billingCycle: "Monthly",
    licenseStartDate: "2026-07-01",
    expiryDate: "2027-06-30",
    activeStudentCount: 412,
    baseFeeInr: 11500,
    perStudentFeeInr: 155,
    maxConcurrentStudents: 400,
    maxExamSessionsPerMonth: 50,
  },
  usage: {
    activeStudents: 412,
    peakConcurrentStudents: 312,
    examSessionsThisMonth: 42,
    monthlyTestRuns: 1482,
    estimatedCurrentChargeInr: 75360,
  },
  plans: LICENSE_PLANS,
  capabilities: [
    {
      id: "basic_test_engine",
      label: "Test authoring and execution",
      description: "Core question, test, assignment, and examination workflows.",
      minimumLevel: "L0",
    },
    {
      id: "raw_accuracy_analytics",
      label: "Accuracy analytics",
      description: "Operational result and accuracy summaries.",
      minimumLevel: "L0",
    },
    {
      id: "risk_overview",
      label: "Risk overview",
      description: "Institute-level student risk summaries.",
      minimumLevel: "L1",
    },
    {
      id: "pattern_alerts",
      label: "Pattern alerts",
      description: "Behavior-pattern monitoring and alerts.",
      minimumLevel: "L1",
    },
    {
      id: "adaptive_phase",
      label: "Adaptive phase controls",
      description: "Phase-aware orchestration and routing controls.",
      minimumLevel: "L2",
    },
    {
      id: "controlled_mode",
      label: "Controlled mode",
      description: "Controlled examination and intervention capabilities.",
      minimumLevel: "L2",
    },
    {
      id: "governance",
      label: "Governance intelligence",
      description: "Governance dashboards and immutable override visibility.",
      minimumLevel: "L2",
    },
  ],
  invoices: [
    {
      id: "invoice_2026_07",
      invoiceNumber: "INV-2026-07118",
      billingPeriod: "July 2026",
      issuedAt: "2026-07-01T04:30:00.000Z",
      dueAt: "2026-07-20T23:59:59.000Z",
      amountInr: 75360,
      status: "due",
    },
    {
      id: "invoice_2026_06",
      invoiceNumber: "INV-2026-06118",
      billingPeriod: "June 2026",
      issuedAt: "2026-06-01T04:30:00.000Z",
      dueAt: "2026-06-20T23:59:59.000Z",
      amountInr: 73190,
      status: "paid",
    },
  ],
  upgradeRequests: [],
  licenseHistory: [
    {
      id: "lic_evt_20260701",
      timestamp: "2026-07-01T05:30:00.000Z",
      previousPlanId: "L2-T1",
      newPlanId: "L2-T2",
      billingCycle: "Monthly",
      reason: "Higher concurrency required for the new academic session.",
      actor: "vendor.licensing@parabolic.local",
    },
    {
      id: "lic_evt_20260101",
      timestamp: "2026-01-01T05:30:00.000Z",
      previousPlanId: "L1-T2",
      newPlanId: "L2-T1",
      billingCycle: "Monthly",
      reason: "L2 capabilities approved following institute request.",
      actor: "vendor.licensing@parabolic.local",
    },
  ],
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPlanId(value: unknown): value is AdminLicensePlanId {
  return typeof value === "string" && LICENSE_PLANS.some((plan) => plan.id === value);
}

function toString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function toNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeSnapshot(value: unknown): AdminLicensingSnapshot | null {
  if (!isPlainObject(value)) return null;
  const current = isPlainObject(value.currentLicense) ? value.currentLicense : null;
  const usage = isPlainObject(value.usage) ? value.usage : null;
  if (!current || !usage || !isPlanId(current.planId)) return null;

  const plan = LICENSE_PLANS.find((entry) => entry.id === current.planId);
  if (!plan) return null;
  const subscriptionStatus = toString(current.subscriptionStatus, "active");
  const normalizedStatus: AdminSubscriptionStatus = [
    "trialing",
    "active",
    "past_due",
    "suspended",
    "trial_expired",
  ].includes(subscriptionStatus)
    ? (subscriptionStatus as AdminSubscriptionStatus)
    : "active";

  return {
    ...FALLBACK_SNAPSHOT,
    currentLicense: {
      instituteId: toString(current.instituteId, FALLBACK_SNAPSHOT.currentLicense.instituteId),
      instituteName: toString(
        current.instituteName,
        FALLBACK_SNAPSHOT.currentLicense.instituteName,
      ),
      planId: plan.id,
      level: plan.level,
      tier: plan.tier,
      subscriptionStatus: normalizedStatus,
      billingCycle: current.billingCycle === "Quarterly" ? "Quarterly" : "Monthly",
      licenseStartDate: toString(
        current.licenseStartDate,
        FALLBACK_SNAPSHOT.currentLicense.licenseStartDate,
      ),
      expiryDate: toString(current.expiryDate, FALLBACK_SNAPSHOT.currentLicense.expiryDate),
      activeStudentCount: Math.max(0, Math.round(toNumber(current.activeStudentCount, 0))),
      baseFeeInr: plan.baseFeeInr,
      perStudentFeeInr: plan.perStudentFeeInr,
      maxConcurrentStudents: plan.maxConcurrentStudents,
      maxExamSessionsPerMonth: plan.maxExamSessionsPerMonth,
    },
    usage: {
      activeStudents: Math.max(0, Math.round(toNumber(usage.activeStudents, 0))),
      peakConcurrentStudents: Math.max(0, Math.round(toNumber(usage.peakConcurrentStudents, 0))),
      examSessionsThisMonth: Math.max(0, Math.round(toNumber(usage.examSessionsThisMonth, 0))),
      monthlyTestRuns: Math.max(0, Math.round(toNumber(usage.monthlyTestRuns, 0))),
      estimatedCurrentChargeInr: Math.max(
        0,
        Math.round(toNumber(usage.estimatedCurrentChargeInr, 0)),
      ),
    },
  };
}

export function isLocalLicensingReadMode(): boolean {
  const host = window.location.hostname.toLowerCase();
  return host === "127.0.0.1" || host === "localhost";
}

export async function fetchLicensingSnapshot(instituteId: string): Promise<AdminLicensingSnapshot> {
  if (isLocalLicensingReadMode()) return FALLBACK_SNAPSHOT;
  const result = await apiClient.post<AdminLicensingApiResponse, Record<string, unknown>>(
    "/admin/licensing",
    { body: { actionType: "GET_LICENSE_SNAPSHOT", instituteId } },
  );
  const snapshot = normalizeSnapshot(result.data?.snapshot);
  if (!snapshot) throw new Error("Licensing API did not return a valid vendor-aligned snapshot.");
  return snapshot;
}

export async function submitLicenseUpgradeRequest(input: {
  instituteId: string;
  currentPlanId: AdminLicensePlanId;
  requestedPlanId: AdminLicensePlanId;
  requestedBy: string;
  reason: string;
}): Promise<AdminLicenseUpgradeRequest> {
  if (isLocalLicensingReadMode()) {
    return {
      id: `license_req_${Date.now()}`,
      requestedPlanId: input.requestedPlanId,
      submittedAt: new Date().toISOString(),
      requestedBy: input.requestedBy,
      reason: input.reason,
      status: "pending",
      vendorNote: "Awaiting vendor review.",
    };
  }

  const result = await apiClient.post<
    AdminLicensingApiResponse,
    typeof input & { actionType: "REQUEST_LICENSE_UPGRADE" }
  >("/admin/licensing", {
    body: { actionType: "REQUEST_LICENSE_UPGRADE", ...input },
  });
  if (!result.data?.request) throw new Error("Vendor did not return the created license request.");
  return result.data.request;
}

export function getPlanRank(plan: AdminLicensePlan): number {
  if (plan.id === "TRIAL") return -1;
  const levelRank = { L0: 0, L1: 1, L2: 2 }[plan.level];
  const tierRank = { "Tier 1": 1, "Tier 2": 2, "Tier 3": 3 }[plan.tier];
  return levelRank * 3 + tierRank;
}

export function levelIncludes(
  currentLevel: AdminLicenseLevel,
  requiredLevel: AdminLicenseLevel,
): boolean {
  return { L0: 0, L1: 1, L2: 2 }[currentLevel] >= { L0: 0, L1: 1, L2: 2 }[requiredLevel];
}

export { ApiClientError };
