import {FieldValue} from "firebase-admin/firestore";
import {createLogger} from "./logging";
import {getFirestore} from "../utils/firebaseAdmin";
import {licenseHistoryService} from "./licenseHistory";
import {
  LicenseManagementFeatureFlags,
  LicenseManagementValidationError,
  UpdateInstituteLicenseInput,
  UpdateInstituteLicenseResult,
} from "../types/licenseManagement";
import {LicenseLayer} from "../types/middleware";

const INSTITUTES_COLLECTION = "institutes";
const LICENSE_COLLECTION = "license";
const LICENSE_CURRENT_DOCUMENT_ID = "current";
const LICENSE_MAIN_DOCUMENT_ID = "main";
const VENDOR_CONFIG_COLLECTION = "vendorConfig";
const PRICING_PLANS_DOCUMENT_ID = "pricingPlans";
const PRICING_PLANS_COLLECTION = "pricingPlans";

interface PricingPlanResolutionResult {
  activeStudentLimit: number | null;
  featureFlags: LicenseManagementFeatureFlags;
  path: string;
  planId: string;
  planName: string | null;
  resolvedLayer: LicenseLayer | null;
}

const isRecord = (
  value: unknown,
): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value);

const normalizeRequiredString = (
  value: unknown,
  fieldName: string,
): string => {
  if (typeof value !== "string") {
    throw new LicenseManagementValidationError(
      "VALIDATION_ERROR",
      `License field "${fieldName}" must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new LicenseManagementValidationError(
      "VALIDATION_ERROR",
      `License field "${fieldName}" must be a non-empty string.`,
    );
  }

  return normalizedValue;
};

const normalizeLicenseLayer = (
  value: unknown,
  fieldName: string,
): LicenseLayer => {
  const normalizedValue = normalizeRequiredString(
    value,
    fieldName,
  ).toUpperCase();

  if (
    normalizedValue !== "L0" &&
    normalizedValue !== "L1" &&
    normalizedValue !== "L2" &&
    normalizedValue !== "L3"
  ) {
    throw new LicenseManagementValidationError(
      "VALIDATION_ERROR",
      `License field "${fieldName}" must be one of L0, L1, L2, or L3.`,
    );
  }

  return normalizedValue;
};

const normalizeOptionalLicenseLayer = (
  value: unknown,
): LicenseLayer | null => {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim().toUpperCase();

  if (
    normalizedValue === "L0" ||
    normalizedValue === "L1" ||
    normalizedValue === "L2" ||
    normalizedValue === "L3"
  ) {
    return normalizedValue;
  }

  return null;
};

const normalizeOptionalString = (
  value: unknown,
): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue || null;
};

const normalizeOptionalNumber = (
  value: unknown,
): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return Math.floor(value);
};

const normalizeFeatureFlag = (
  value: unknown,
): boolean => value === true;

const normalizeFeatureFlags = (
  value: unknown,
): LicenseManagementFeatureFlags => {
  const featureFlagRecord = isRecord(value) ? value : {};

  return {
    adaptivePhase: normalizeFeatureFlag(featureFlagRecord.adaptivePhase),
    controlledMode: normalizeFeatureFlag(featureFlagRecord.controlledMode),
    governanceAccess: normalizeFeatureFlag(featureFlagRecord.governanceAccess),
    hardMode: normalizeFeatureFlag(featureFlagRecord.hardMode),
  };
};

const buildPricingPlansCollectionPath = (): string =>
  `${VENDOR_CONFIG_COLLECTION}/${PRICING_PLANS_DOCUMENT_ID}/` +
  `${PRICING_PLANS_COLLECTION}`;

const buildInstitutePath = (instituteId: string): string =>
  `${INSTITUTES_COLLECTION}/${instituteId}`;

const buildLicensePath = (
  instituteId: string,
  documentId: string,
): string =>
  `${buildInstitutePath(instituteId)}/` +
  `${LICENSE_COLLECTION}/${documentId}`;

const buildPricingPlanPath = (planId: string): string =>
  `${buildPricingPlansCollectionPath()}/${planId}`;

const matchesBillingPlanCandidate = (
  candidate: string | null,
  billingPlan: string,
): boolean => candidate !== null &&
  candidate.trim().toLowerCase() === billingPlan.trim().toLowerCase();

const resolveLayerFromPricingPlan = (
  planId: string,
  pricingPlanData: Record<string, unknown>,
): LicenseLayer | null =>
  normalizeOptionalLicenseLayer(pricingPlanData.planId) ??
  normalizeOptionalLicenseLayer(planId);

const buildPricingPlanResult = (
  planId: string,
  pricingPlanData: Record<string, unknown>,
): PricingPlanResolutionResult => ({
  activeStudentLimit: normalizeOptionalNumber(pricingPlanData.studentLimit),
  featureFlags: normalizeFeatureFlags(pricingPlanData.featureFlags),
  path: buildPricingPlanPath(planId),
  planId,
  planName:
    normalizeOptionalString(pricingPlanData.name) ??
    normalizeOptionalString(pricingPlanData.planName),
  resolvedLayer: resolveLayerFromPricingPlan(planId, pricingPlanData),
});

/**
 * Vendor license management service for the authoritative institute license.
 */
export class LicenseManagementService {
  private readonly firestore = getFirestore();
  private readonly logger = createLogger("LicenseManagementService");

  /**
   * Resolves vendor pricing configuration for a requested billing plan.
   * @param {string} billingPlan Vendor request billing plan identifier/name.
   * @param {LicenseLayer} newLayer Requested target license layer.
   * @return {Promise<PricingPlanResolutionResult>} Normalized pricing plan.
   */
  private async resolvePricingPlan(
    billingPlan: string,
    newLayer: LicenseLayer,
  ): Promise<PricingPlanResolutionResult> {
    const pricingPlansCollection = this.firestore.collection(
      buildPricingPlansCollectionPath(),
    );
    const directLookupCandidates = Array.from(new Set([
      billingPlan,
      newLayer,
    ]));

    for (const candidate of directLookupCandidates) {
      const snapshot = await pricingPlansCollection.doc(candidate).get();

      if (snapshot.exists && isRecord(snapshot.data())) {
        const result = buildPricingPlanResult(candidate, snapshot.data() ?? {});

        if (result.resolvedLayer && result.resolvedLayer !== newLayer) {
          throw new LicenseManagementValidationError(
            "VALIDATION_ERROR",
            "Billing plan does not match the requested license layer.",
          );
        }

        return result;
      }
    }

    const collectionSnapshot = await pricingPlansCollection.get();

    for (const documentSnapshot of collectionSnapshot.docs) {
      const pricingPlanData = documentSnapshot.data();

      if (!isRecord(pricingPlanData)) {
        continue;
      }

      const result = buildPricingPlanResult(
        documentSnapshot.id,
        pricingPlanData,
      );
      const planMatches =
        matchesBillingPlanCandidate(result.planId, billingPlan) ||
        matchesBillingPlanCandidate(result.planName, billingPlan);

      if (!planMatches) {
        continue;
      }

      if (result.resolvedLayer && result.resolvedLayer !== newLayer) {
        throw new LicenseManagementValidationError(
          "VALIDATION_ERROR",
          "Billing plan does not match the requested license layer.",
        );
      }

      return result;
    }

    throw new LicenseManagementValidationError(
      "NOT_FOUND",
      "Billing plan " +
        `"${billingPlan}" does not exist in vendor pricing configuration.`,
    );
  }

  /**
   * Updates the institute license document from vendor pricing config.
   * @param {UpdateInstituteLicenseInput} input Vendor license update request.
   * @return {Promise<UpdateInstituteLicenseResult>} Updated license summary.
   */
  public async updateInstituteLicense(
    input: UpdateInstituteLicenseInput,
  ): Promise<UpdateInstituteLicenseResult> {
    const instituteId = normalizeRequiredString(
      input.instituteId,
      "instituteId",
    );
    const billingPlan = normalizeRequiredString(
      input.billingPlan,
      "billingPlan",
    );
    const changedBy = normalizeRequiredString(input.changedBy, "changedBy");
    const newLayer = normalizeLicenseLayer(input.newLayer, "newLayer");
    const pricingPlan = await this.resolvePricingPlan(billingPlan, newLayer);
    const institutePath = buildInstitutePath(instituteId);
    const currentLicensePath = buildLicensePath(
      instituteId,
      LICENSE_CURRENT_DOCUMENT_ID,
    );
    const compatibilityLicensePath = buildLicensePath(
      instituteId,
      LICENSE_MAIN_DOCUMENT_ID,
    );
    const effectiveDate = new Date().toISOString();
    const mutationReason =
      "Vendor license update via POST /vendor/license/update.";

    const result = await this.firestore.runTransaction(async (transaction) => {
      const instituteReference = this.firestore.doc(institutePath);
      const currentLicenseReference = this.firestore.doc(currentLicensePath);
      const compatibilityLicenseReference = this.firestore.doc(
        compatibilityLicensePath,
      );
      const [
        instituteSnapshot,
        currentLicenseSnapshot,
        compatibilityLicenseSnapshot,
      ] = await Promise.all([
        transaction.get(instituteReference),
        transaction.get(currentLicenseReference),
        transaction.get(compatibilityLicenseReference),
      ]);

      if (!instituteSnapshot.exists) {
        throw new LicenseManagementValidationError(
          "NOT_FOUND",
          `Institute "${instituteId}" does not exist.`,
        );
      }

      const currentLicenseSnapshotData = currentLicenseSnapshot.data();
      const compatibilityLicenseSnapshotData =
        compatibilityLicenseSnapshot.data();
      const currentLicenseData: Record<string, unknown> =
        isRecord(currentLicenseSnapshotData) ?
          currentLicenseSnapshotData :
          {};
      const compatibilityLicenseData: Record<string, unknown> =
        isRecord(compatibilityLicenseSnapshotData) ?
          compatibilityLicenseSnapshotData :
          {};
      const baseLicenseData: Record<string, unknown> =
        currentLicenseSnapshot.exists ?
          currentLicenseData :
          compatibilityLicenseData;
      const previousLayer = normalizeOptionalLicenseLayer(
        baseLicenseData.currentLayer,
      );
      const previousStudentLimit = normalizeOptionalNumber(
        baseLicenseData.activeStudentLimit,
      );
      const nextLicenseDocument: Record<string, unknown> = {
        ...baseLicenseData,
        activeStudentLimit: pricingPlan.activeStudentLimit,
        currentLayer: newLayer,
        featureFlags: pricingPlan.featureFlags,
        licenseState:
          normalizeOptionalString(baseLicenseData.licenseState) ?? "active",
        planId: pricingPlan.planId,
        planName: pricingPlan.planName ?? billingPlan,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: changedBy,
      };
      const licenseHistoryWrite = licenseHistoryService
        .prepareLicenseHistoryEntry({
          billingPlan,
          changedBy,
          effectiveDate,
          instituteId,
          newLayer,
          newStudentLimit:
            pricingPlan.activeStudentLimit ?? undefined,
          previousLayer: previousLayer ?? "L0",
          previousStudentLimit: previousStudentLimit ?? undefined,
          reason: mutationReason,
        });

      transaction.set(
        currentLicenseReference,
        nextLicenseDocument,
        {merge: true},
      );
      transaction.set(
        compatibilityLicenseReference,
        nextLicenseDocument,
        {merge: true},
      );
      transaction.create(
        this.firestore.doc(licenseHistoryWrite.path),
        licenseHistoryWrite.entry,
      );

      return {
        activeStudentLimit: pricingPlan.activeStudentLimit,
        billingPlan,
        compatibilityLicensePath,
        instituteId,
        licenseHistoryEntryId: licenseHistoryWrite.entryId,
        licenseHistoryPath: licenseHistoryWrite.path,
        licensePath: currentLicensePath,
        newLayer,
        planId: pricingPlan.planId,
        planName: pricingPlan.planName ?? billingPlan,
        previousLayer,
      };
    });

    this.logger.info("Institute license updated by vendor API.", {
      activeStudentLimit: result.activeStudentLimit,
      billingPlan: result.billingPlan,
      changedBy,
      compatibilityLicensePath: result.compatibilityLicensePath,
      instituteId: result.instituteId,
      licenseHistoryEntryId: result.licenseHistoryEntryId,
      licenseHistoryPath: result.licenseHistoryPath,
      licensePath: result.licensePath,
      newLayer: result.newLayer,
      planId: result.planId,
      planName: result.planName,
      previousLayer: result.previousLayer,
      pricingPlanPath: pricingPlan.path,
    });

    return result;
  }
}

export const licenseManagementService = new LicenseManagementService();
