import {FieldValue} from "firebase-admin/firestore";
import {createLogger} from "./logging";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  BillingSnapshotDocument,
  BillingSnapshotGenerationInput,
  BillingSnapshotGenerationResult,
  BillingSnapshotResult,
  BillingSnapshotWebhookStatus,
} from "../types/billingSnapshot";

const BILLING_SNAPSHOTS_COLLECTION = "billingSnapshots";
const LICENSE_COLLECTION = "license";
const LICENSE_MAIN_DOCUMENT_ID = "main";
const LICENSE_CURRENT_DOCUMENT_ID = "current";
const USAGE_METER_COLLECTION = "usageMeter";
const SCHEMA_VERSION = 1;

/**
 * Raised when a billing snapshot request or payload is structurally invalid.
 */
class BillingSnapshotValidationError extends Error {
  /**
   * @param {string} message Safe validation detail for debugging and tests.
   */
  constructor(message: string) {
    super(message);
    this.name = "BillingSnapshotValidationError";
  }
}

const isRecord = (
  value: unknown,
): value is Record<string, unknown> => typeof value === "object" &&
  value !== null &&
  !Array.isArray(value);

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

  return Number(value.toFixed(2));
};

const normalizeRequiredCycleId = (
  value: string | undefined,
): string => {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    return buildDefaultCycleId(new Date());
  }

  if (!/^\d{4}-\d{2}$/.test(normalizedValue)) {
    throw new BillingSnapshotValidationError(
      "Billing snapshot cycleId must match the YYYY-MM format.",
    );
  }

  return normalizedValue;
};

const buildDefaultCycleId = (date: Date): string => {
  const previousMonthDate = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth() - 1,
    1,
  ));

  return [
    previousMonthDate.getUTCFullYear(),
    String(previousMonthDate.getUTCMonth() + 1).padStart(2, "0"),
  ].join("-");
};

const buildCycleBoundary = (
  cycleId: string,
): {cycleEnd: string; cycleStart: string} => {
  const [yearSegment, monthSegment] = cycleId.split("-");
  const year = Number(yearSegment);
  const month = Number(monthSegment);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    throw new BillingSnapshotValidationError(
      "Billing snapshot cycleId must be a valid calendar month.",
    );
  }

  const cycleStart = new Date(Date.UTC(year, month - 1, 1));
  const cycleEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  return {
    cycleEnd: cycleEnd.toISOString(),
    cycleStart: cycleStart.toISOString(),
  };
};

const normalizeLicenseTier = (
  value: unknown,
): string | null => {
  const normalizedValue = normalizeOptionalString(value)?.toUpperCase();

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

const resolveInvoiceAmount = (
  usageMeterData: Record<string, unknown>,
): number | null =>
  normalizeOptionalNumber(usageMeterData.projectedInvoiceAmount) ??
  normalizeOptionalNumber(usageMeterData.invoiceAmount);

const resolvePeakUsage = (
  usageMeterData: Record<string, unknown>,
  activeStudentCount: number,
): number =>
  normalizeOptionalNumber(usageMeterData.peakActiveStudents) ??
  normalizeOptionalNumber(usageMeterData.peakStudentUsage) ??
  activeStudentCount;

const resolveBillingSnapshotId = (
  instituteId: string,
  cycleId: string,
): string => `${instituteId}__${cycleId}`;

const resolveInstituteName = (
  instituteData: unknown,
): string | null => {
  if (!isRecord(instituteData)) {
    return null;
  }

  return normalizeOptionalString(instituteData.name) ??
    normalizeOptionalString(instituteData.instituteName);
};

const resolveWebhookStatus = (
  licenseData: Record<string, unknown>,
): BillingSnapshotWebhookStatus => {
  const normalizedStatus = normalizeOptionalString(
    licenseData.stripeWebhookStatus,
  )?.toLowerCase();

  if (
    normalizedStatus === "pending" ||
    normalizedStatus === "succeeded" ||
    normalizedStatus === "failed" ||
    normalizedStatus === "not_applicable"
  ) {
    return normalizedStatus;
  }

  return "pending";
};

const buildSnapshotDocument = (
  instituteId: string,
  cycleId: string,
  usageMeterData: Record<string, unknown>,
  licenseData: Record<string, unknown>,
  instituteData: unknown,
): BillingSnapshotDocument => {
  const activeStudentCount =
    normalizeOptionalNumber(usageMeterData.activeStudentCount) ?? 0;
  const peakUsage = resolvePeakUsage(usageMeterData, activeStudentCount);
  const licenseTier =
    normalizeLicenseTier(licenseData.currentLayer) ??
    normalizeLicenseTier(licenseData.planId) ??
    normalizeLicenseTier(usageMeterData.pricingPlanId);

  if (!licenseTier) {
    throw new BillingSnapshotValidationError(
      `Billing snapshot requires a valid license tier for ${instituteId}.`,
    );
  }

  const invoiceAmount = resolveInvoiceAmount(usageMeterData);
  const snapshotId = resolveBillingSnapshotId(instituteId, cycleId);
  const {cycleEnd, cycleStart} = buildCycleBoundary(cycleId);

  return {
    activeStudentCount,
    billingCycle: "monthly",
    createdAt: FieldValue.serverTimestamp(),
    cycleEnd,
    cycleId,
    cycleStart,
    generatedAt: FieldValue.serverTimestamp(),
    immutable: true,
    instituteId,
    instituteName: resolveInstituteName(instituteData),
    invoiceAmount,
    invoiceId: snapshotId,
    licenseLayer: licenseTier,
    licenseTier,
    monthlyRevenue: invoiceAmount,
    peakActiveStudents: peakUsage,
    peakUsage,
    schemaVersion: SCHEMA_VERSION,
    stripeWebhookStatus: resolveWebhookStatus(licenseData),
  };
};

/**
 * Generates root-level billing snapshots from per-institute usage summaries.
 */
export class BillingSnapshotService {
  private readonly firestore = getFirestore();
  private readonly logger = createLogger("BillingSnapshotService");

  /**
   * Creates immutable billing snapshots for a bounded billing cycle.
   * @param {BillingSnapshotGenerationInput} input Optional cycle/institute
   * filter used by schedulers and repeatable tests.
   * @return {Promise<BillingSnapshotGenerationResult>} Snapshot run summary.
   */
  public async generateBillingSnapshots(
    input: BillingSnapshotGenerationInput = {},
  ): Promise<BillingSnapshotGenerationResult> {
    const cycleId = normalizeRequiredCycleId(input.cycleId);
    const usageMeterSnapshot = await this.firestore
      .collectionGroup(USAGE_METER_COLLECTION)
      .where("cycleId", "==", cycleId)
      .get();
    const results: BillingSnapshotResult[] = [];

    for (const documentSnapshot of usageMeterSnapshot.docs) {
      const instituteReference = documentSnapshot.ref.parent.parent;

      if (!instituteReference) {
        results.push({
          billingSnapshotPath: "",
          cycleId,
          instituteId: "",
          reason: "invalid_usage_scope",
          status: "skipped",
        });
        continue;
      }

      const instituteId = instituteReference.id;

      if (input.instituteId && input.instituteId !== instituteId) {
        continue;
      }

      const result = await this.persistBillingSnapshot(
        instituteReference,
        cycleId,
        documentSnapshot.data(),
      );
      results.push(result);
    }

    const createdCount = results
      .filter((result) => result.status === "created")
      .length;
    const skippedCount = results.length - createdCount;
    const runResult: BillingSnapshotGenerationResult = {
      createdCount,
      cycleId,
      results,
      skippedCount,
    };

    this.logger.info("Billing snapshot generation completed.", {
      createdCount,
      cycleId,
      instituteFilter: input.instituteId ?? null,
      matchedUsageDocuments: usageMeterSnapshot.size,
      skippedCount,
    });

    return runResult;
  }

  /**
   * Persists a single immutable billing snapshot when one does not yet exist.
   * @param {FirebaseFirestore.DocumentReference} instituteReference Institute
   * root document reference.
   * @param {string} cycleId Target billing cycle identifier.
   * @param {Record<string, unknown>} usageMeterData Source usage summary.
   * @return {Promise<BillingSnapshotResult>} Per-institute write result.
   */
  private async persistBillingSnapshot(
    instituteReference: FirebaseFirestore.DocumentReference,
    cycleId: string,
    usageMeterData: Record<string, unknown>,
  ): Promise<BillingSnapshotResult> {
    const instituteId = instituteReference.id;
    const snapshotId = resolveBillingSnapshotId(instituteId, cycleId);
    const billingSnapshotReference = this.firestore
      .collection(BILLING_SNAPSHOTS_COLLECTION)
      .doc(snapshotId);
    const billingSnapshotPath = billingSnapshotReference.path;

    try {
      return await this.firestore.runTransaction(async (transaction) => {
        const [
          existingSnapshot,
          instituteSnapshot,
          licenseSnapshot,
        ] = await Promise.all([
          transaction.get(billingSnapshotReference),
          transaction.get(instituteReference),
          this.getLicenseSnapshot(transaction, instituteReference),
        ]);

        if (existingSnapshot.exists) {
          return {
            billingSnapshotPath,
            cycleId,
            instituteId,
            reason: "already_exists",
            status: "skipped",
          };
        }

        if (!licenseSnapshot.exists || !isRecord(licenseSnapshot.data())) {
          return {
            billingSnapshotPath,
            cycleId,
            instituteId,
            reason: "license_not_found",
            status: "skipped",
          };
        }

        const billingSnapshotDocument = buildSnapshotDocument(
          instituteId,
          cycleId,
          usageMeterData,
          licenseSnapshot.data() as Record<string, unknown>,
          instituteSnapshot.data(),
        );

        transaction.create(billingSnapshotReference, billingSnapshotDocument);

        return {
          billingSnapshotPath,
          cycleId,
          instituteId,
          status: "created",
        };
      });
    } catch (error) {
      this.logger.error("Billing snapshot persistence failed.", {
        billingSnapshotPath,
        cycleId,
        error,
        instituteId,
      });

      throw error;
    }
  }

  /**
   * Resolves the active license document while remaining compatible with the
   * repo's existing `license/main` path and the architecture's
   * `license/current` path.
   * @param {FirebaseFirestore.Transaction} transaction Active transaction.
   * @param {FirebaseFirestore.DocumentReference} instituteReference Institute
   * root document reference.
   * @return {Promise<FirebaseFirestore.DocumentSnapshot>} License snapshot.
   */
  private async getLicenseSnapshot(
    transaction: FirebaseFirestore.Transaction,
    instituteReference: FirebaseFirestore.DocumentReference,
  ): Promise<FirebaseFirestore.DocumentSnapshot> {
    const mainReference = instituteReference
      .collection(LICENSE_COLLECTION)
      .doc(LICENSE_MAIN_DOCUMENT_ID);
    const mainSnapshot = await transaction.get(mainReference);

    if (mainSnapshot.exists) {
      return mainSnapshot;
    }

    const currentReference = instituteReference
      .collection(LICENSE_COLLECTION)
      .doc(LICENSE_CURRENT_DOCUMENT_ID);

    return transaction.get(currentReference);
  }
}

export const billingSnapshotService = new BillingSnapshotService();
