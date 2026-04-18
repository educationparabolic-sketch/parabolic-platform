import {ApiClientError, createApiClient} from "../../../../../shared/services/apiClient";
import {LICENSE_LAYER_ORDER, type LicenseLayer} from "../../../../../shared/types/portalRouting";

const apiClient = createApiClient({baseUrl: "/"});

export type CapabilityState = "enabled" | "locked";

export interface LicensingCurrentPlan {
  currentLayer: LicenseLayer;
  planName: string;
  licenseStartDate: string;
  expiryDate: string;
  renewalDate: string;
  billingCycle: string;
  activeStudentCount: number;
  maxStudentLimit: number;
  concurrencyLimit: number;
  attemptsUsedThisMonth: number;
  attemptsQuotaThisMonth: number;
}

export interface LicensingFeatureRow {
  feature: string;
  description: string;
  layers: Record<LicenseLayer, CapabilityState>;
}

export interface LicensingEligibilityStage {
  stage: string;
  label: string;
  status: "eligible" | "in_progress" | "locked";
  summary: string;
  checklist: Array<{
    id: string;
    label: string;
    met: boolean;
  }>;
  progressCurrent: number;
  progressTarget: number;
}

export interface LicensingUsageAndBilling {
  activeStudents: number;
  maxStudentsAllowed: number;
  remainingStudentSlots: number;
  attemptsUsed: number;
  attemptsRemaining: number;
  peakConcurrency: number;
  maxConcurrentAllowed: number;
  estimatedCurrentBill: string;
  nextBillingDate: string;
  actions: {
    downloadInvoiceUrl: string;
    viewBillingHistoryUrl: string;
    updatePaymentMethodUrl: string;
    contactSupportUrl: string;
  };
}

export interface LicensingUpgradePreview {
  currentLayer: LicenseLayer;
  previewCards: string[];
  requestUpgradeUrl: string;
  scheduleEvaluationUrl: string;
}

export interface LicensingHistoryEntry {
  eventId: string;
  timestamp: string;
  previousLayer: LicenseLayer;
  newLayer: LicenseLayer;
  billingChange: string;
  reason: string;
  actor: string;
}

export interface AdminLicensingSnapshot {
  currentPlan: LicensingCurrentPlan;
  featureMatrix: LicensingFeatureRow[];
  eligibilityProgress: LicensingEligibilityStage[];
  usageAndBilling: LicensingUsageAndBilling;
  upgradePreview: LicensingUpgradePreview;
  licenseHistory: LicensingHistoryEntry[];
}

interface AdminLicensingApiResponse {
  code: string;
  data?: {
    snapshot?: unknown;
  };
}

function toNonEmptyString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
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

function toLayer(value: unknown, fallback: LicenseLayer): LicenseLayer {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().toUpperCase();
  if (normalized === "L0" || normalized === "L1" || normalized === "L2" || normalized === "L3") {
    return normalized;
  }

  return fallback;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const FALLBACK_SNAPSHOT: AdminLicensingSnapshot = {
  currentPlan: {
    activeStudentCount: 412,
    attemptsQuotaThisMonth: 2500,
    attemptsUsedThisMonth: 1482,
    billingCycle: "Monthly",
    concurrencyLimit: 120,
    currentLayer: "L2",
    expiryDate: "2026-12-31",
    licenseStartDate: "2026-01-01",
    maxStudentLimit: 500,
    planName: "Controlled Growth",
    renewalDate: "2027-01-01",
  },
  eligibilityProgress: [
    {
      checklist: [
        {id: "tests", label: "10+ completed tests", met: true},
        {id: "students", label: "30+ active students", met: true},
        {id: "tagging", label: "Difficulty tagging coverage >= 90%", met: true},
      ],
      label: "L0 to L1",
      progressCurrent: 10,
      progressTarget: 10,
      stage: "L1",
      status: "eligible",
      summary: "Diagnostic unlock requirements are complete.",
    },
    {
      checklist: [
        {id: "runs", label: "25+ diagnostic runs", met: true},
        {id: "adherence", label: "Phase adherence metric available", met: true},
        {id: "variance", label: "Behavioral variance computed", met: true},
      ],
      label: "L1 to L2",
      progressCurrent: 25,
      progressTarget: 25,
      stage: "L2",
      status: "eligible",
      summary: "Controlled mode eligibility achieved.",
    },
    {
      checklist: [
        {id: "stability", label: "StabilityIndex >= 70", met: false},
        {id: "year", label: "At least 1 academic year completed", met: true},
        {id: "vendor", label: "Vendor invitation required", met: false},
      ],
      label: "L2 to L3",
      progressCurrent: 71,
      progressTarget: 100,
      stage: "L3",
      status: "in_progress",
      summary: "Invitation-only governance tier pending vendor approval.",
    },
  ],
  featureMatrix: [
    {
      description: "Core test authoring, assignment, and execution.",
      feature: "BasicTestEngine",
      layers: {L0: "enabled", L1: "enabled", L2: "enabled", L3: "enabled"},
    },
    {
      description: "Raw and accuracy analytics visibility.",
      feature: "RawAndAccuracyAnalytics",
      layers: {L0: "enabled", L1: "enabled", L2: "enabled", L3: "enabled"},
    },
    {
      description: "Risk insight overviews.",
      feature: "RiskOverview",
      layers: {L0: "locked", L1: "enabled", L2: "enabled", L3: "enabled"},
    },
    {
      description: "Behavior pattern alerting.",
      feature: "PatternAlerts",
      layers: {L0: "locked", L1: "enabled", L2: "enabled", L3: "enabled"},
    },
    {
      description: "Adaptive phase orchestration.",
      feature: "AdaptivePhase",
      layers: {L0: "locked", L1: "locked", L2: "enabled", L3: "enabled"},
    },
    {
      description: "Controlled mode enforcement.",
      feature: "ControlledMode",
      layers: {L0: "locked", L1: "locked", L2: "enabled", L3: "enabled"},
    },
    {
      description: "Hard mode assignment controls.",
      feature: "HardMode",
      layers: {L0: "locked", L1: "locked", L2: "enabled", L3: "enabled"},
    },
    {
      description: "Governance dashboard access.",
      feature: "GovernanceDashboard",
      layers: {L0: "locked", L1: "locked", L2: "locked", L3: "enabled"},
    },
    {
      description: "Override audit visibility.",
      feature: "OverrideAudit",
      layers: {L0: "locked", L1: "locked", L2: "locked", L3: "enabled"},
    },
  ],
  licenseHistory: [
    {
      actor: "vendor_ops_014",
      billingChange: "Monthly plan updated to Controlled Growth",
      eventId: "lic_evt_20260101",
      newLayer: "L2",
      previousLayer: "L1",
      reason: "Eligibility approved after controlled diagnostics review",
      timestamp: "2026-01-01T05:30:00.000Z",
    },
    {
      actor: "vendor_ops_004",
      billingChange: "Monthly plan activated",
      eventId: "lic_evt_20250701",
      newLayer: "L1",
      previousLayer: "L0",
      reason: "L1 readiness checklist met",
      timestamp: "2025-07-01T05:30:00.000Z",
    },
  ],
  upgradePreview: {
    currentLayer: "L2",
    previewCards: [
      "Stability Index gauge sample",
      "Batch risk heatmap preview",
      "Override audit timeline sample",
    ],
    requestUpgradeUrl: "https://vendor.yourdomain.com/licensing/request-upgrade",
    scheduleEvaluationUrl: "https://vendor.yourdomain.com/licensing/schedule-evaluation",
  },
  usageAndBilling: {
    actions: {
      contactSupportUrl: "https://vendor.yourdomain.com/support",
      downloadInvoiceUrl: "https://vendor.yourdomain.com/billing/invoice/latest",
      updatePaymentMethodUrl: "https://vendor.yourdomain.com/billing/payment-method",
      viewBillingHistoryUrl: "https://vendor.yourdomain.com/billing/history",
    },
    activeStudents: 412,
    attemptsRemaining: 1018,
    attemptsUsed: 1482,
    estimatedCurrentBill: "USD 1,842.00",
    maxConcurrentAllowed: 120,
    maxStudentsAllowed: 500,
    nextBillingDate: "2026-05-01",
    peakConcurrency: 74,
    remainingStudentSlots: 88,
  },
};

function normalizeSnapshot(value: unknown): AdminLicensingSnapshot | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const currentPlanSource = isPlainObject(value.currentPlan) ? value.currentPlan : {};
  const usageSource = isPlainObject(value.usageAndBilling) ? value.usageAndBilling : {};
  const actionsSource = isPlainObject(usageSource.actions) ? usageSource.actions : {};
  const upgradeSource = isPlainObject(value.upgradePreview) ? value.upgradePreview : {};

  const normalized: AdminLicensingSnapshot = {
    currentPlan: {
      activeStudentCount: Math.max(0, Math.round(toNumberOrZero(currentPlanSource.activeStudentCount))),
      attemptsQuotaThisMonth: Math.max(1, Math.round(toNumberOrZero(currentPlanSource.attemptsQuotaThisMonth) || 1)),
      attemptsUsedThisMonth: Math.max(0, Math.round(toNumberOrZero(currentPlanSource.attemptsUsedThisMonth))),
      billingCycle: toNonEmptyString(currentPlanSource.billingCycle, "Monthly"),
      concurrencyLimit: Math.max(1, Math.round(toNumberOrZero(currentPlanSource.concurrencyLimit) || 1)),
      currentLayer: toLayer(currentPlanSource.currentLayer, "L0"),
      expiryDate: toNonEmptyString(currentPlanSource.expiryDate, "Unknown"),
      licenseStartDate: toNonEmptyString(currentPlanSource.licenseStartDate, "Unknown"),
      maxStudentLimit: Math.max(1, Math.round(toNumberOrZero(currentPlanSource.maxStudentLimit) || 1)),
      planName: toNonEmptyString(currentPlanSource.planName, "Plan"),
      renewalDate: toNonEmptyString(currentPlanSource.renewalDate, "Unknown"),
    },
    eligibilityProgress: Array.isArray(value.eligibilityProgress) ?
      value.eligibilityProgress
        .map((stage) => {
          if (!isPlainObject(stage)) {
            return null;
          }

          const checklist = Array.isArray(stage.checklist) ?
            stage.checklist
              .map((item) => {
                if (!isPlainObject(item)) {
                  return null;
                }

                return {
                  id: toNonEmptyString(item.id, "check"),
                  label: toNonEmptyString(item.label, "Criteria"),
                  met: Boolean(item.met),
                };
              })
              .filter((item): item is LicensingEligibilityStage["checklist"][number] => Boolean(item)) :
            [];

          const statusRaw = toNonEmptyString(stage.status, "locked");
          const status: LicensingEligibilityStage["status"] =
            statusRaw === "eligible" || statusRaw === "in_progress" ? statusRaw : "locked";

          return {
            checklist,
            label: toNonEmptyString(stage.label, "Stage"),
            progressCurrent: Math.max(0, Math.round(toNumberOrZero(stage.progressCurrent))),
            progressTarget: Math.max(1, Math.round(toNumberOrZero(stage.progressTarget) || 1)),
            stage: toNonEmptyString(stage.stage, "Lx"),
            status,
            summary: toNonEmptyString(stage.summary, "Eligibility status"),
          } as LicensingEligibilityStage;
        })
        .filter((stage): stage is LicensingEligibilityStage => Boolean(stage)) :
      [],
    featureMatrix: Array.isArray(value.featureMatrix) ?
      value.featureMatrix
        .map((row) => {
          if (!isPlainObject(row)) {
            return null;
          }

          const layersSource = isPlainObject(row.layers) ? row.layers : {};
          const parseState = (layer: LicenseLayer): CapabilityState =>
            toNonEmptyString(layersSource[layer], "locked") === "enabled" ? "enabled" : "locked";

          return {
            description: toNonEmptyString(row.description, ""),
            feature: toNonEmptyString(row.feature, "Feature"),
            layers: {
              L0: parseState("L0"),
              L1: parseState("L1"),
              L2: parseState("L2"),
              L3: parseState("L3"),
            },
          } as LicensingFeatureRow;
        })
        .filter((row): row is LicensingFeatureRow => Boolean(row)) :
      [],
    licenseHistory: Array.isArray(value.licenseHistory) ?
      value.licenseHistory
        .map((entry) => {
          if (!isPlainObject(entry)) {
            return null;
          }

          return {
            actor: toNonEmptyString(entry.actor, "vendor"),
            billingChange: toNonEmptyString(entry.billingChange, ""),
            eventId: toNonEmptyString(entry.eventId, "event"),
            newLayer: toLayer(entry.newLayer, "L0"),
            previousLayer: toLayer(entry.previousLayer, "L0"),
            reason: toNonEmptyString(entry.reason, ""),
            timestamp: toNonEmptyString(entry.timestamp, new Date(0).toISOString()),
          } as LicensingHistoryEntry;
        })
        .filter((entry): entry is LicensingHistoryEntry => Boolean(entry)) :
      [],
    upgradePreview: {
      currentLayer: toLayer(upgradeSource.currentLayer, "L0"),
      previewCards:
        Array.isArray(upgradeSource.previewCards) ?
          upgradeSource.previewCards
            .map((item) => toNonEmptyString(item))
            .filter((item) => item.length > 0) :
          [],
      requestUpgradeUrl: toNonEmptyString(upgradeSource.requestUpgradeUrl, "https://vendor.yourdomain.com/licensing/request-upgrade"),
      scheduleEvaluationUrl: toNonEmptyString(upgradeSource.scheduleEvaluationUrl, "https://vendor.yourdomain.com/licensing/schedule-evaluation"),
    },
    usageAndBilling: {
      actions: {
        contactSupportUrl: toNonEmptyString(actionsSource.contactSupportUrl, "https://vendor.yourdomain.com/support"),
        downloadInvoiceUrl: toNonEmptyString(actionsSource.downloadInvoiceUrl, "https://vendor.yourdomain.com/billing/invoice/latest"),
        updatePaymentMethodUrl: toNonEmptyString(actionsSource.updatePaymentMethodUrl, "https://vendor.yourdomain.com/billing/payment-method"),
        viewBillingHistoryUrl: toNonEmptyString(actionsSource.viewBillingHistoryUrl, "https://vendor.yourdomain.com/billing/history"),
      },
      activeStudents: Math.max(0, Math.round(toNumberOrZero(usageSource.activeStudents))),
      attemptsRemaining: Math.max(0, Math.round(toNumberOrZero(usageSource.attemptsRemaining))),
      attemptsUsed: Math.max(0, Math.round(toNumberOrZero(usageSource.attemptsUsed))),
      estimatedCurrentBill: toNonEmptyString(usageSource.estimatedCurrentBill, "Unknown"),
      maxConcurrentAllowed: Math.max(1, Math.round(toNumberOrZero(usageSource.maxConcurrentAllowed) || 1)),
      maxStudentsAllowed: Math.max(1, Math.round(toNumberOrZero(usageSource.maxStudentsAllowed) || 1)),
      nextBillingDate: toNonEmptyString(usageSource.nextBillingDate, "Unknown"),
      peakConcurrency: Math.max(0, Math.round(toNumberOrZero(usageSource.peakConcurrency))),
      remainingStudentSlots: Math.max(0, Math.round(toNumberOrZero(usageSource.remainingStudentSlots))),
    },
  };

  return normalized;
}

export function isLocalLicensingReadMode(): boolean {
  const host = window.location.hostname.toLowerCase();
  return host === "127.0.0.1" || host === "localhost";
}

export function resolveLayerBadge(layer: LicenseLayer): string {
  switch (layer) {
    case "L0":
      return "Operational";
    case "L1":
      return "Diagnostic";
    case "L2":
      return "Controlled";
    case "L3":
      return "Governance";
    default:
      return "Operational";
  }
}

export function hasLayerAccess(currentLayer: LicenseLayer, requiredLayer: LicenseLayer): boolean {
  return LICENSE_LAYER_ORDER[currentLayer] >= LICENSE_LAYER_ORDER[requiredLayer];
}

export async function fetchLicensingSnapshot(instituteId: string): Promise<AdminLicensingSnapshot> {
  if (isLocalLicensingReadMode()) {
    return FALLBACK_SNAPSHOT;
  }

  const result = await apiClient.post<AdminLicensingApiResponse, Record<string, unknown>>(
    "/admin/licensing",
    {
      body: {
        actionType: "GET_LICENSE_SNAPSHOT",
        instituteId,
      },
    },
  );

  const snapshot = normalizeSnapshot(result.data?.snapshot);
  if (!snapshot) {
    throw new Error("POST /admin/licensing did not return a valid licensing snapshot.");
  }

  return snapshot;
}

export {ApiClientError, FALLBACK_SNAPSHOT};
