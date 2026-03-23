import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {createLogger} from "./logging";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  UsageMeterDocument,
  UsageMeteringContext,
  UsageMeteringResult,
} from "../types/usageMetering";

const INSTITUTES_COLLECTION = "institutes";
const STUDENTS_COLLECTION = "students";
const LICENSE_COLLECTION = "license";
const LICENSE_DOCUMENT_ID = "main";
const USAGE_METER_COLLECTION = "usageMeter";
const ASSIGNMENT_EVENTS_COLLECTION = "assignmentEvents";

/**
 * Raised when usage metering payloads violate build constraints.
 */
class UsageMeteringValidationError extends Error {
  /**
   * @param {string} message Validation failure detail.
   */
  constructor(message: string) {
    super(message);
    this.name = "UsageMeteringValidationError";
  }
}

const isRecord = (
  value: unknown,
): value is Record<string, unknown> => typeof value === "object" &&
  value !== null &&
  !Array.isArray(value);

const normalizeRequiredString = (
  value: unknown,
  fieldName: string,
): string => {
  if (typeof value !== "string") {
    throw new UsageMeteringValidationError(
      `Usage meter field "${fieldName}" must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new UsageMeteringValidationError(
      `Usage meter field "${fieldName}" must be a non-empty string.`,
    );
  }

  return normalizedValue;
};

const normalizeRecipientStudentIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    throw new UsageMeteringValidationError(
      "Usage meter field \"recipientStudentIds\" must be an array of strings.",
    );
  }

  const normalizedIds = value.map((entry) =>
    normalizeRequiredString(entry, "recipientStudentIds[]"),
  );

  const uniqueIds = new Set(normalizedIds);

  if (uniqueIds.size !== normalizedIds.length) {
    throw new UsageMeteringValidationError(
      "Usage meter field \"recipientStudentIds\" must not contain duplicates.",
    );
  }

  return normalizedIds;
};

const normalizeOptionalNumber = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return Math.floor(value);
};

const resolveActiveStudentLimit = (
  licenseData: unknown,
): number | null => {
  if (!isRecord(licenseData)) {
    return null;
  }

  return normalizeOptionalNumber(licenseData.activeStudentLimit) ??
    normalizeOptionalNumber(licenseData.studentLimit) ??
    normalizeOptionalNumber(licenseData.maxStudents);
};

const resolveCycleDate = (runData: Record<string, unknown>): Date => {
  const candidateFields = [
    runData.createdAt,
    runData.startWindow,
  ];

  for (const candidate of candidateFields) {
    if (candidate instanceof Timestamp) {
      return candidate.toDate();
    }

    if (candidate instanceof Date) {
      return candidate;
    }
  }

  return new Date();
};

const formatCycleId = (date: Date): string => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
};

const normalizeCountField = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return 0;
  }

  return Math.floor(value);
};

/**
 * Usage metering service for assignment-driven billing aggregates.
 */
export class UsageMeteringService {
  private readonly firestore = getFirestore();
  private readonly logger = createLogger("UsageMeteringService");

  /**
   * Records usage metrics for a run assignment event.
   * @param {UsageMeteringContext} context Assignment identifiers.
   * @param {unknown} runData Created run payload.
   * @return {Promise<UsageMeteringResult>} Usage metering write result.
   */
  public async recordAssignmentUsage(
    context: UsageMeteringContext,
    runData: unknown,
  ): Promise<UsageMeteringResult> {
    const instituteId = normalizeRequiredString(
      context.instituteId,
      "instituteId",
    );
    const yearId = normalizeRequiredString(context.yearId, "yearId");
    const runId = normalizeRequiredString(context.runId, "runId");

    if (!isRecord(runData)) {
      throw new UsageMeteringValidationError(
        "Usage metering requires run payload to be a Firestore object.",
      );
    }

    const payloadRunId = normalizeRequiredString(runData.runId, "runId");

    if (payloadRunId !== runId) {
      throw new UsageMeteringValidationError(
        "Usage metering requires payload runId to match document identifier.",
      );
    }

    const recipientStudentIds = normalizeRecipientStudentIds(
      runData.recipientStudentIds,
    );
    const cycleId = formatCycleId(resolveCycleDate(runData));

    const usageMeterPath = `${INSTITUTES_COLLECTION}/${instituteId}/` +
      `${USAGE_METER_COLLECTION}/${cycleId}`;
    const usageMeterReference = this.firestore.doc(usageMeterPath);
    const assignmentEventReference = usageMeterReference
      .collection(ASSIGNMENT_EVENTS_COLLECTION)
      .doc(runId);
    const studentsReference = this.firestore
      .collection(INSTITUTES_COLLECTION)
      .doc(instituteId)
      .collection(STUDENTS_COLLECTION);
    const activeStudentsQuery = studentsReference.where(
      "status",
      "==",
      "active",
    );
    const licenseReference = this.firestore
      .collection(INSTITUTES_COLLECTION)
      .doc(instituteId)
      .collection(LICENSE_COLLECTION)
      .doc(LICENSE_DOCUMENT_ID);

    const wasUpdated = await this.firestore.runTransaction(
      async (transaction) => {
        const [
          assignmentEventSnapshot,
          usageMeterSnapshot,
          activeStudentsSnapshot,
          licenseSnapshot,
        ] = await Promise.all([
          transaction.get(assignmentEventReference),
          transaction.get(usageMeterReference),
          transaction.get(activeStudentsQuery),
          transaction.get(licenseReference),
        ]);

        if (assignmentEventSnapshot.exists) {
          return false;
        }

        const activeStudentCount = activeStudentsSnapshot.docs
          .filter((snapshot) => snapshot.data().archived !== true)
          .length;
        const activeStudentLimit = resolveActiveStudentLimit(
          licenseSnapshot.data(),
        );
        const billingTierCompliance = activeStudentLimit === null ?
          true :
          activeStudentCount <= activeStudentLimit;
        const currentData = usageMeterSnapshot.data();
        const currentAssignmentsCreated = normalizeCountField(
          currentData?.assignmentsCreated,
        );
        const currentAssignedStudentsCount = normalizeCountField(
          currentData?.assignedStudentsCount,
        );
        const currentPeakStudentUsage = normalizeCountField(
          currentData?.peakStudentUsage,
        );

        const nextUsageDocument: UsageMeterDocument = {
          activeStudentCount,
          activeStudentLimit,
          assignedStudentsCount:
            currentAssignedStudentsCount + recipientStudentIds.length,
          assignmentsCreated: currentAssignmentsCreated + 1,
          billingTierCompliance,
          cycleId,
          lastAssignmentRunId: runId,
          peakStudentUsage: Math.max(
            currentPeakStudentUsage,
            activeStudentCount,
          ),
          updatedAt: FieldValue.serverTimestamp(),
        };

        transaction.set(usageMeterReference, nextUsageDocument, {merge: true});
        transaction.create(assignmentEventReference, {
          assignedStudentsCount: recipientStudentIds.length,
          createdAt: FieldValue.serverTimestamp(),
          runId,
          yearId,
        });

        return true;
      },
    );

    this.logger.info("Usage metering processed for assignment creation", {
      cycleId,
      instituteId,
      recipientCount: recipientStudentIds.length,
      runId,
      usageMeterPath,
      wasUpdated,
      yearId,
    });

    return {
      cycleId,
      usageMeterPath,
      wasUpdated,
    };
  }
}

export const usageMeteringService = new UsageMeteringService();
