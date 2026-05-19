/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
import {Timestamp} from "firebase-admin/firestore";
import {createLogger} from "./logging";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  AdminLicensingActionType,
  AdminLicensingRequest,
  AdminLicensingResult,
  AdminLicensingSnapshot,
  AdminLicensingValidatedRequest,
  AdminLicensingValidationError,
  LicenseLayer,
  LicensingEligibilityStageSnapshot,
  LicensingFeatureMatrixRow,
  LicensingHistoryEntrySnapshot,
} from "../types/adminLicensing";

const INSTITUTES_COLLECTION = "institutes";
const LICENSE_COLLECTION = "license";
const LICENSE_CURRENT_DOCUMENT_ID = "current";
const LICENSE_MAIN_DOCUMENT_ID = "main";
const LICENSE_HISTORY_COLLECTION = "licenseHistory";
const USAGE_METER_COLLECTION = "usageMeter";

const LICENSING_ACTIONS: AdminLicensingActionType[] = ["GET_LICENSE_SNAPSHOT"];
const LICENSE_LAYER_ORDER: Record<LicenseLayer, number> = {
  L0: 0,
  L1: 1,
  L2: 2,
  L3: 3,
};

interface AdminLicensingDependencies {
  firestore: FirebaseFirestore.Firestore;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeRequiredString = (value: unknown, field: string): string => {
  if (typeof value !== "string") {
    throw new AdminLicensingValidationError(
      "VALIDATION_ERROR",
      `Field "${field}" must be a string.`,
    );
  }

  const normalized = value.trim();
  if (!normalized) {
    throw new AdminLicensingValidationError(
      "VALIDATION_ERROR",
      `Field "${field}" must be a non-empty string.`,
    );
  }

  return normalized;
};

const normalizeOptionalString = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
};

const normalizeOptionalNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const normalizeLayer = (value: unknown): LicenseLayer | null => {
  const normalized = normalizeOptionalString(value)?.toUpperCase();

  if (
    normalized === "L0" ||
    normalized === "L1" ||
    normalized === "L2" ||
    normalized === "L3"
  ) {
    return normalized;
  }

  return null;
};

const toIsoString = (value: unknown): string | null => {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return normalizeOptionalString(value);
};

const hasLayerAccess = (
  currentLayer: LicenseLayer,
  requiredLayer: LicenseLayer,
): boolean => LICENSE_LAYER_ORDER[currentLayer] >= LICENSE_LAYER_ORDER[requiredLayer];

const formatCurrency = (value: number | null): string =>
  value === null ? "Unknown" : `USD ${value.toFixed(2)}`;

const buildCycleDate = (
  cycleId: string | null,
): string | null => {
  if (!cycleId || !/^\d{4}-\d{2}$/.test(cycleId)) {
    return null;
  }

  const [yearSegment, monthSegment] = cycleId.split("-");
  const year = Number(yearSegment);
  const month = Number(monthSegment);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
};

const buildInstitutePath = (instituteId: string): string =>
  `${INSTITUTES_COLLECTION}/${instituteId}`;

const buildLicensePath = (instituteId: string, documentId: string): string =>
  `${buildInstitutePath(instituteId)}/${LICENSE_COLLECTION}/${documentId}`;

const resolveFeatureMatrix = (
  featureFlags: Record<string, boolean>,
): LicensingFeatureMatrixRow[] => {
  const governanceEnabled = featureFlags.governanceAccess !== false;
  const adaptiveEnabled = featureFlags.adaptivePhase !== false;
  const controlledEnabled = featureFlags.controlledMode !== false;
  const hardModeEnabled = featureFlags.hardMode !== false;

  const allEnabled = {
    L0: "enabled",
    L1: "enabled",
    L2: "enabled",
    L3: "enabled",
  } as const;

  return [
    {
      description: "Core test authoring, assignment, and execution.",
      feature: "BasicTestEngine",
      layers: allEnabled,
    },
    {
      description: "Raw and accuracy analytics visibility.",
      feature: "RawAndAccuracyAnalytics",
      layers: allEnabled,
    },
    {
      description: "Risk insight overviews.",
      feature: "RiskOverview",
      layers: {
        L0: "locked",
        L1: "enabled",
        L2: "enabled",
        L3: "enabled",
      },
    },
    {
      description: "Behavior pattern alerting.",
      feature: "PatternAlerts",
      layers: {
        L0: "locked",
        L1: "enabled",
        L2: "enabled",
        L3: "enabled",
      },
    },
    {
      description: "Adaptive phase orchestration.",
      feature: "AdaptivePhase",
      layers: {
        L0: "locked",
        L1: "locked",
        L2: adaptiveEnabled ? "enabled" : "locked",
        L3: adaptiveEnabled ? "enabled" : "locked",
      },
    },
    {
      description: "Controlled mode enforcement.",
      feature: "ControlledMode",
      layers: {
        L0: "locked",
        L1: "locked",
        L2: controlledEnabled ? "enabled" : "locked",
        L3: controlledEnabled ? "enabled" : "locked",
      },
    },
    {
      description: "Hard mode assignment controls.",
      feature: "HardMode",
      layers: {
        L0: "locked",
        L1: "locked",
        L2: hardModeEnabled ? "enabled" : "locked",
        L3: hardModeEnabled ? "enabled" : "locked",
      },
    },
    {
      description: "Governance dashboard access.",
      feature: "GovernanceDashboard",
      layers: {
        L0: "locked",
        L1: "locked",
        L2: "locked",
        L3: governanceEnabled ? "enabled" : "locked",
      },
    },
    {
      description: "Override audit visibility.",
      feature: "OverrideAudit",
      layers: {
        L0: "locked",
        L1: "locked",
        L2: "locked",
        L3: governanceEnabled ? "enabled" : "locked",
      },
    },
  ];
};

const buildEligibilityStages = (
  currentLayer: LicenseLayer,
  activeStudents: number,
  attemptsUsed: number,
  eligibilityFlags: Record<string, boolean>,
): LicensingEligibilityStageSnapshot[] => {
  const l1Checklist = [
    {
      id: "tests",
      label: "10+ completed tests",
      met: attemptsUsed >= 10 || hasLayerAccess(currentLayer, "L1"),
    },
    {
      id: "students",
      label: "30+ active students",
      met: activeStudents >= 30 || hasLayerAccess(currentLayer, "L1"),
    },
    {
      id: "tagging",
      label: "Difficulty tagging coverage >= 90%",
      met: eligibilityFlags.l1Eligible === true || hasLayerAccess(currentLayer, "L1"),
    },
  ];
  const l2Checklist = [
    {
      id: "runs",
      label: "25+ diagnostic runs",
      met: attemptsUsed >= 25 || hasLayerAccess(currentLayer, "L2"),
    },
    {
      id: "adherence",
      label: "Phase adherence metric available",
      met: eligibilityFlags.l2Eligible === true || hasLayerAccess(currentLayer, "L2"),
    },
    {
      id: "variance",
      label: "Behavioral variance computed",
      met: eligibilityFlags.l2Eligible === true || hasLayerAccess(currentLayer, "L2"),
    },
  ];
  const l3Checklist = [
    {
      id: "stability",
      label: "Stability Index >= 70",
      met: eligibilityFlags.l3Eligible === true || hasLayerAccess(currentLayer, "L3"),
    },
    {
      id: "year",
      label: "At least 1 academic year completed",
      met: eligibilityFlags.l3Eligible === true || hasLayerAccess(currentLayer, "L3"),
    },
    {
      id: "vendor",
      label: "Vendor invitation required",
      met: eligibilityFlags.l3Eligible === true || hasLayerAccess(currentLayer, "L3"),
    },
  ];

  const buildStage = (
    stage: string,
    label: string,
    checklist: Array<{id: string; label: string; met: boolean}>,
    summaryEligible: string,
    summaryPending: string,
    statusOverride?: LicensingEligibilityStageSnapshot["status"],
  ): LicensingEligibilityStageSnapshot => {
    const progressCurrent = checklist.filter((item) => item.met).length;
    const progressTarget = checklist.length;
    const status =
      statusOverride ??
      (progressCurrent === progressTarget ? "eligible" : progressCurrent > 0 ? "in_progress" : "locked");

    return {
      checklist,
      label,
      progressCurrent,
      progressTarget,
      stage,
      status,
      summary: status === "eligible" ? summaryEligible : summaryPending,
    };
  };

  return [
    buildStage(
      "L1",
      "L0 to L1",
      l1Checklist,
      "Diagnostic unlock requirements are complete.",
      "Diagnostic unlock is tracking toward readiness.",
    ),
    buildStage(
      "L2",
      "L1 to L2",
      l2Checklist,
      "Controlled mode readiness is supported by current diagnostic coverage.",
      "Controlled mode readiness still needs more diagnostic evidence.",
    ),
    buildStage(
      "L3",
      "L2 to L3",
      l3Checklist,
      "Governance tier has already been approved.",
      "Governance tier remains evaluation-driven and vendor-approved.",
      hasLayerAccess(currentLayer, "L3") ? "eligible" : l3Checklist.some((item) => item.met) ? "in_progress" : "locked",
    ),
  ];
};

const resolveUpgradePreviewCards = (currentLayer: LicenseLayer): string[] => {
  switch (currentLayer) {
  case "L0":
    return [
      "Risk Overview preview",
      "Pattern Alerts preview",
      "Student Intelligence sample card",
    ];
  case "L1":
    return [
      "Controlled Mode toggle preview",
      "Discipline Index graph sample",
      "Adaptive Phase preview",
    ];
  case "L2":
    return [
      "Stability Index gauge sample",
      "Batch risk heatmap preview",
      "Override audit timeline sample",
    ];
  case "L3":
    return [
      "Institutional stability board",
      "Override audit timeline sample",
      "Governance report export preview",
    ];
  default:
    return [];
  }
};

export class AdminLicensingService {
  private readonly logger = createLogger("AdminLicensingService");

  constructor(
    private readonly dependencies: AdminLicensingDependencies = {
      firestore: getFirestore(),
    },
  ) {}

  public normalizeRequest(
    input: Partial<AdminLicensingRequest> & {
      actorId?: string;
      actorRole?: string;
      ipAddress?: string;
      userAgent?: string;
    },
  ): AdminLicensingValidatedRequest {
    const actionType = normalizeRequiredString(input.actionType, "actionType");

    if (!LICENSING_ACTIONS.includes(actionType as AdminLicensingActionType)) {
      throw new AdminLicensingValidationError(
        "VALIDATION_ERROR",
        "Field \"actionType\" is not supported.",
      );
    }

    return {
      actionType: actionType as AdminLicensingActionType,
      actorId: normalizeRequiredString(input.actorId, "actorId"),
      actorRole: normalizeRequiredString(input.actorRole, "actorRole"),
      instituteId: normalizeRequiredString(input.instituteId, "instituteId"),
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    };
  }

  public async executeRequest(
    request: AdminLicensingValidatedRequest,
  ): Promise<AdminLicensingResult> {
    if (request.actionType !== "GET_LICENSE_SNAPSHOT") {
      throw new AdminLicensingValidationError(
        "VALIDATION_ERROR",
        "Field \"actionType\" is not supported.",
      );
    }

    const snapshot = await this.getSnapshot(request.instituteId);

    return {
      actionType: request.actionType,
      snapshot,
    };
  }

  private async getSnapshot(instituteId: string): Promise<AdminLicensingSnapshot> {
    const licenseCurrentReference = this.dependencies.firestore.doc(
      buildLicensePath(instituteId, LICENSE_CURRENT_DOCUMENT_ID),
    );
    const licenseMainReference = this.dependencies.firestore.doc(
      buildLicensePath(instituteId, LICENSE_MAIN_DOCUMENT_ID),
    );
    const usageMeterReference = this.dependencies.firestore
      .collection(`${buildInstitutePath(instituteId)}/${USAGE_METER_COLLECTION}`)
      .orderBy("cycleId", "desc")
      .limit(1);
    const historyReference = this.dependencies.firestore
      .collection(`${buildInstitutePath(instituteId)}/${LICENSE_HISTORY_COLLECTION}`)
      .orderBy("timestamp", "desc")
      .limit(12);

    const [
      licenseCurrentSnapshot,
      licenseMainSnapshot,
      usageMeterSnapshot,
      historySnapshot,
    ] = await Promise.all([
      licenseCurrentReference.get(),
      licenseMainReference.get(),
      usageMeterReference.get(),
      historyReference.get(),
    ]);

    const licenseData =
      licenseCurrentSnapshot.data() ??
      licenseMainSnapshot.data() ??
      {};
    const typedLicenseData = isPlainObject(licenseData) ? licenseData : {};
    const usageData = usageMeterSnapshot.docs[0]?.data() ?? {};
    const typedUsageData = isPlainObject(usageData) ? usageData : {};
    const currentLayer = normalizeLayer(
      typedLicenseData.currentLayer ?? typedLicenseData.licenseLayer,
    ) ?? "L0";
    const featureFlagsSource = isPlainObject(typedLicenseData.featureFlags) ?
      typedLicenseData.featureFlags :
      {};
    const featureFlags = Object.fromEntries(
      Object.entries(featureFlagsSource).map(([key, value]) => [key, value === true]),
    ) as Record<string, boolean>;
    const eligibilityFlags = isPlainObject(typedLicenseData.eligibilityFlags) ?
      Object.fromEntries(
        Object.entries(typedLicenseData.eligibilityFlags).map(([key, value]) => [key, value === true]),
      ) as Record<string, boolean> :
      {};

    const activeStudentCount = Math.max(
      0,
      Math.round(
        normalizeOptionalNumber(typedUsageData.activeStudentCount) ??
        normalizeOptionalNumber(typedLicenseData.activeStudentCount) ??
        0,
      ),
    );
    const maxStudentLimit = Math.max(
      1,
      Math.round(
        normalizeOptionalNumber(typedLicenseData.activeStudentLimit) ??
        normalizeOptionalNumber(typedLicenseData.studentLimit) ??
        normalizeOptionalNumber(typedLicenseData.maxStudents) ??
        (activeStudentCount || 1),
      ),
    );
    const attemptsUsed = Math.max(
      0,
      Math.round(
        normalizeOptionalNumber(typedUsageData.sessionExecutionVolume) ??
        normalizeOptionalNumber(typedLicenseData.attemptsUsedThisMonth) ??
        0,
      ),
    );
    const attemptsQuota = Math.max(
      attemptsUsed,
      Math.round(
        normalizeOptionalNumber(typedLicenseData.attemptsQuotaThisMonth) ??
        normalizeOptionalNumber(typedLicenseData.monthlyAttemptLimit) ??
        maxStudentLimit * 6,
      ),
    );
    const concurrencyLimit = Math.max(
      1,
      Math.round(
        normalizeOptionalNumber(typedLicenseData.concurrencyLimit) ??
        normalizeOptionalNumber(typedLicenseData.maxConcurrent) ??
        normalizeOptionalNumber(typedLicenseData.maxConcurrentAllowed) ??
        normalizeOptionalNumber(typedUsageData.peakActiveStudents) ??
        1,
      ),
    );
    const peakConcurrency = Math.max(
      0,
      Math.round(
        normalizeOptionalNumber(typedUsageData.peakActiveStudents) ??
        normalizeOptionalNumber(typedUsageData.peakStudentUsage) ??
        0,
      ),
    );
    const projectedInvoiceAmount =
      normalizeOptionalNumber(typedUsageData.projectedInvoiceAmount) ??
      normalizeOptionalNumber(typedUsageData.invoiceAmount);
    const cycleId = normalizeOptionalString(typedUsageData.cycleId);
    const nextBillingDate =
      buildCycleDate(cycleId) ??
      normalizeOptionalString(typedLicenseData.renewalDate) ??
      normalizeOptionalString(typedLicenseData.expiryDate) ??
      "Unknown";
    const vendorBaseUrl =
      normalizeOptionalString(typedLicenseData.vendorPortalBaseUrl) ??
      "https://vendor.yourdomain.com";

    const history = historySnapshot.docs
      .map((documentSnapshot): LicensingHistoryEntrySnapshot | null => {
        const documentData = documentSnapshot.data();
        if (!isPlainObject(documentData)) {
          return null;
        }

        const previousLayer = normalizeLayer(documentData.previousLayer) ?? "L0";
        const newLayer = normalizeLayer(documentData.newLayer) ?? currentLayer;
        const billingPlan =
          normalizeOptionalString(documentData.billingPlan) ??
          normalizeOptionalString(documentData.planName) ??
          newLayer;

        return {
          actor:
            normalizeOptionalString(documentData.actor) ??
            normalizeOptionalString(documentData.changedBy) ??
            "vendor",
          billingChange: `Plan set to ${billingPlan}`,
          eventId:
            normalizeOptionalString(documentData.entryId) ??
            normalizeOptionalString(documentData.eventId) ??
            documentSnapshot.id,
          newLayer,
          previousLayer,
          reason:
            normalizeOptionalString(documentData.reason) ??
            "License change recorded by vendor authority.",
          timestamp:
            toIsoString(documentData.timestamp) ??
            toIsoString(documentData.effectiveDate) ??
            new Date(0).toISOString(),
        };
      })
      .filter((entry): entry is LicensingHistoryEntrySnapshot => entry !== null);

    const snapshot: AdminLicensingSnapshot = {
      currentPlan: {
        activeStudentCount,
        attemptsQuotaThisMonth: attemptsQuota,
        attemptsUsedThisMonth: attemptsUsed,
        billingCycle:
          normalizeOptionalString(typedLicenseData.billingCycle) ??
          "monthly",
        concurrencyLimit,
        currentLayer,
        expiryDate:
          normalizeOptionalString(typedLicenseData.expiryDate) ??
          "Unknown",
        licenseStartDate:
          normalizeOptionalString(typedLicenseData.startDate) ??
          normalizeOptionalString(typedLicenseData.licenseStartDate) ??
          "Unknown",
        maxStudentLimit,
        planName:
          normalizeOptionalString(typedLicenseData.planName) ??
          normalizeOptionalString(typedLicenseData.planId) ??
          currentLayer,
        renewalDate:
          normalizeOptionalString(typedLicenseData.renewalDate) ??
          normalizeOptionalString(typedLicenseData.expiryDate) ??
          "Unknown",
      },
      eligibilityProgress: buildEligibilityStages(
        currentLayer,
        activeStudentCount,
        attemptsUsed,
        eligibilityFlags,
      ),
      featureMatrix: resolveFeatureMatrix(featureFlags),
      licenseHistory: history,
      upgradePreview: {
        currentLayer,
        previewCards: resolveUpgradePreviewCards(currentLayer),
        requestUpgradeUrl: `${vendorBaseUrl}/licensing/request-upgrade`,
        scheduleEvaluationUrl: `${vendorBaseUrl}/licensing/schedule-evaluation`,
      },
      usageAndBilling: {
        actions: {
          contactSupportUrl: `${vendorBaseUrl}/support`,
          downloadInvoiceUrl: `${vendorBaseUrl}/billing/invoice/latest`,
          updatePaymentMethodUrl: `${vendorBaseUrl}/billing/payment-method`,
          viewBillingHistoryUrl: `${vendorBaseUrl}/billing/history`,
        },
        activeStudents: activeStudentCount,
        attemptsRemaining: Math.max(0, attemptsQuota - attemptsUsed),
        attemptsUsed,
        estimatedCurrentBill: formatCurrency(projectedInvoiceAmount),
        maxConcurrentAllowed: concurrencyLimit,
        maxStudentsAllowed: maxStudentLimit,
        nextBillingDate,
        peakConcurrency,
        remainingStudentSlots: Math.max(0, maxStudentLimit - activeStudentCount),
      },
    };

    this.logger.info("Admin licensing snapshot loaded.", {
      activeStudentCount,
      currentLayer,
      historyCount: snapshot.licenseHistory.length,
      instituteId,
    });

    return snapshot;
  }
}

export const adminLicensingService = new AdminLicensingService();
