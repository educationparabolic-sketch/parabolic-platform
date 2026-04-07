import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {createLogger} from "./logging";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  UsageMeterDocument,
  UsageMeteringContext,
  UsageMeteringResult,
  UsageMeterSessionExecutionContext,
  UsageMeterStudentChangeContext,
} from "../types/usageMetering";

const INSTITUTES_COLLECTION = "institutes";
const STUDENTS_COLLECTION = "students";
const LICENSE_COLLECTION = "license";
const LICENSE_DOCUMENT_ID = "main";
const USAGE_METER_COLLECTION = "usageMeter";
const ASSIGNMENT_EVENTS_COLLECTION = "assignmentEvents";
const STUDENT_EVENTS_COLLECTION = "studentEvents";
const SESSION_EVENTS_COLLECTION = "sessionEvents";
const VENDOR_CONFIG_COLLECTION = "vendorConfig";
const PRICING_PLANS_COLLECTION = "pricingPlans";
const SUBMITTED_STATUS = "submitted";
const ACTIVE_STATUS = "active";

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

const normalizeOptionalString = (
  value: unknown,
): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = value.trim();
  return normalizedValue || null;
};

const resolveActiveStudentLimit = (
  licenseData: unknown,
  pricingPlanData?: unknown,
): number | null => {
  if (isRecord(pricingPlanData)) {
    const pricingPlanLimit =
      normalizeOptionalNumber(pricingPlanData.studentLimit);

    if (pricingPlanLimit !== null) {
      return pricingPlanLimit;
    }
  }

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

const resolvePricingPlanId = (
  licenseData: unknown,
): string | null => {
  if (!isRecord(licenseData)) {
    return null;
  }

  return normalizeOptionalString(licenseData.currentLayer) ??
    normalizeOptionalString(licenseData.planId) ??
    normalizeOptionalString(licenseData.billingPlan);
};

const resolvePricingPlanMetrics = (
  pricingPlanData: unknown,
): {
  basePriceMonthly: number | null;
  pricePerStudent: number | null;
} => {
  if (!isRecord(pricingPlanData)) {
    return {
      basePriceMonthly: null,
      pricePerStudent: null,
    };
  }

  const basePriceMonthly = normalizeOptionalNumber(
    pricingPlanData.basePriceMonthly,
  );
  const pricePerStudent = normalizeOptionalNumber(
    pricingPlanData.pricePerStudent,
  );

  return {
    basePriceMonthly,
    pricePerStudent,
  };
};

const resolveProjectedInvoiceAmount = (
  activeStudentCount: number,
  basePriceMonthly: number | null,
  pricePerStudent: number | null,
): number | null => {
  if (basePriceMonthly === null || pricePerStudent === null) {
    return null;
  }

  return basePriceMonthly + (activeStudentCount * pricePerStudent);
};

const resolveApproachingLimit = (
  activeStudentCount: number,
  activeStudentLimit: number | null,
): boolean => {
  if (activeStudentLimit === null || activeStudentLimit <= 0) {
    return false;
  }

  return activeStudentCount >= Math.ceil(activeStudentLimit * 0.9);
};

const resolveOverLimit = (
  activeStudentCount: number,
  activeStudentLimit: number | null,
): boolean => activeStudentLimit !== null &&
  activeStudentLimit >= 0 &&
  activeStudentCount > activeStudentLimit;

const isActiveStudentRecord = (
  value: unknown,
): boolean => isRecord(value) &&
  normalizeOptionalString(value.status) === ACTIVE_STATUS &&
  value.archived !== true &&
  value.deleted !== true;

const resolveStudentEventDate = (
  beforeData: unknown,
  afterData: unknown,
): Date => {
  const candidateRecords = [afterData, beforeData];

  for (const candidateRecord of candidateRecords) {
    if (!isRecord(candidateRecord)) {
      continue;
    }

    const candidateFields = [
      candidateRecord.updatedAt,
      candidateRecord.archivedAt,
      candidateRecord.createdAt,
    ];

    for (const candidateField of candidateFields) {
      if (candidateField instanceof Timestamp) {
        return candidateField.toDate();
      }

      if (candidateField instanceof Date) {
        return candidateField;
      }
    }
  }

  return new Date();
};

const resolveSessionSubmittedAt = (
  sessionData: unknown,
): Timestamp | null => {
  if (!isRecord(sessionData)) {
    return null;
  }

  if (sessionData.submittedAt instanceof Timestamp) {
    return sessionData.submittedAt;
  }

  if (sessionData.submittedAt instanceof Date) {
    return Timestamp.fromDate(sessionData.submittedAt);
  }

  return null;
};

const resolveStoredTimestamp = (
  value: unknown,
): Timestamp | null => {
  if (value instanceof Timestamp) {
    return value;
  }

  return null;
};

const buildUsageMeterDocument = (
  currentData: Record<string, unknown> | undefined,
  input: {
    activeStudentCount: number;
    activeStudentLimit: number | null;
    assignedStudentsCount: number;
    assignmentsCreated: number;
    cycleId: string;
    lastAssignmentRunId?: string;
    overLimitTimestamp: Timestamp | FirebaseFirestore.FieldValue | null;
    peakActiveStudents: number;
    sessionExecutionVolume: number;
    pricingPlanId: string | null;
    basePriceMonthly: number | null;
    pricePerStudent: number | null;
  },
): UsageMeterDocument => {
  const overLimit = resolveOverLimit(
    input.activeStudentCount,
    input.activeStudentLimit,
  );
  const projectedInvoiceAmount = resolveProjectedInvoiceAmount(
    input.activeStudentCount,
    input.basePriceMonthly,
    input.pricePerStudent,
  );

  return {
    activeStudentCount: input.activeStudentCount,
    activeStudentLimit: input.activeStudentLimit,
    approachingLimit: resolveApproachingLimit(
      input.activeStudentCount,
      input.activeStudentLimit,
    ),
    assignedStudentsCount: input.assignedStudentsCount,
    assignmentsCreated: input.assignmentsCreated,
    basePriceMonthly: input.basePriceMonthly,
    billingTierCompliance: !overLimit,
    cycleId: input.cycleId,
    lastAssignmentRunId:
      input.lastAssignmentRunId ??
      normalizeOptionalString(currentData?.lastAssignmentRunId) ??
      "",
    overLimit,
    overLimitSince: overLimit ?
      (input.overLimitTimestamp ??
        resolveStoredTimestamp(currentData?.overLimitSince) ??
        FieldValue.serverTimestamp()) :
      null,
    peakActiveStudents: input.peakActiveStudents,
    peakStudentUsage: input.peakActiveStudents,
    pricePerStudent: input.pricePerStudent,
    pricingPlanId: input.pricingPlanId,
    projectedInvoiceAmount,
    sessionExecutionVolume: input.sessionExecutionVolume,
    updatedAt: FieldValue.serverTimestamp(),
  };
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
          licenseSnapshot,
        ] = await Promise.all([
          transaction.get(assignmentEventReference),
          transaction.get(usageMeterReference),
          transaction.get(licenseReference),
        ]);

        if (assignmentEventSnapshot.exists) {
          return false;
        }

        const currentData = usageMeterSnapshot.data();
        const activeStudentCount =
          normalizeOptionalNumber(currentData?.activeStudentCount) ??
          await this.countActiveStudents(instituteId, transaction);
        const currentAssignmentsCreated = normalizeCountField(
          currentData?.assignmentsCreated,
        );
        const currentAssignedStudentsCount = normalizeCountField(
          currentData?.assignedStudentsCount,
        );
        const currentPeakStudentUsage = normalizeCountField(
          currentData?.peakActiveStudents ?? currentData?.peakStudentUsage,
        );
        const currentSessionExecutionVolume = normalizeCountField(
          currentData?.sessionExecutionVolume,
        );
        const pricingPlanId = resolvePricingPlanId(licenseSnapshot.data());
        const pricingPlanData = pricingPlanId ?
          (await transaction.get(this.firestore
            .collection(VENDOR_CONFIG_COLLECTION)
            .doc(PRICING_PLANS_COLLECTION)
            .collection(PRICING_PLANS_COLLECTION)
            .doc(pricingPlanId))).data() :
          undefined;
        const {basePriceMonthly, pricePerStudent} = resolvePricingPlanMetrics(
          pricingPlanData,
        );
        const activeStudentLimit = resolveActiveStudentLimit(
          licenseSnapshot.data(),
          pricingPlanData,
        );

        const nextUsageDocument = buildUsageMeterDocument(currentData, {
          activeStudentCount,
          activeStudentLimit,
          assignedStudentsCount:
            currentAssignedStudentsCount + recipientStudentIds.length,
          assignmentsCreated: currentAssignmentsCreated + 1,
          basePriceMonthly,
          cycleId,
          lastAssignmentRunId: runId,
          overLimitTimestamp:
            currentData?.overLimit === true ?
              resolveStoredTimestamp(currentData.overLimitSince) :
              null,
          peakActiveStudents: Math.max(
            currentPeakStudentUsage,
            activeStudentCount,
          ),
          pricePerStudent,
          pricingPlanId,
          sessionExecutionVolume: currentSessionExecutionVolume,
        });

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

  /**
   * Records active-student usage deltas for student lifecycle transitions.
   * @param {UsageMeterStudentChangeContext} context Trigger context metadata.
   * @param {unknown} beforeData Prior student state.
   * @param {unknown} afterData Updated student state.
   * @return {Promise<UsageMeteringResult>} Usage metering write result.
   */
  public async recordStudentStatusChange(
    context: UsageMeterStudentChangeContext,
    beforeData: unknown,
    afterData: unknown,
  ): Promise<UsageMeteringResult> {
    const eventId = normalizeRequiredString(context.eventId, "eventId");
    const instituteId = normalizeRequiredString(
      context.instituteId,
      "instituteId",
    );
    const studentId = normalizeRequiredString(context.studentId, "studentId");
    const beforeActive = isActiveStudentRecord(beforeData);
    const afterActive = isActiveStudentRecord(afterData);

    if (beforeActive === afterActive) {
      return {
        cycleId: formatCycleId(resolveStudentEventDate(beforeData, afterData)),
        reason: "no_usage_delta",
        usageMeterPath: "",
        wasUpdated: false,
      };
    }

    const eventDate = resolveStudentEventDate(beforeData, afterData);
    const cycleId = formatCycleId(eventDate);
    const usageMeterPath = `${INSTITUTES_COLLECTION}/${instituteId}/` +
      `${USAGE_METER_COLLECTION}/${cycleId}`;
    const usageMeterReference = this.firestore.doc(usageMeterPath);
    const studentEventReference = usageMeterReference
      .collection(STUDENT_EVENTS_COLLECTION)
      .doc(eventId);
    const licenseReference = this.firestore
      .collection(INSTITUTES_COLLECTION)
      .doc(instituteId)
      .collection(LICENSE_COLLECTION)
      .doc(LICENSE_DOCUMENT_ID);
    const activeStudentDelta = afterActive ? 1 : -1;

    const wasUpdated = await this.firestore.runTransaction(
      async (transaction) => {
        const [studentEventSnapshot, usageMeterSnapshot, licenseSnapshot] =
          await Promise.all([
            transaction.get(studentEventReference),
            transaction.get(usageMeterReference),
            transaction.get(licenseReference),
          ]);

        if (studentEventSnapshot.exists) {
          return false;
        }

        const currentData = usageMeterSnapshot.data();
        const pricingPlanId = resolvePricingPlanId(licenseSnapshot.data());
        const pricingPlanData = pricingPlanId ?
          (await transaction.get(this.firestore
            .collection(VENDOR_CONFIG_COLLECTION)
            .doc(PRICING_PLANS_COLLECTION)
            .collection(PRICING_PLANS_COLLECTION)
            .doc(pricingPlanId))).data() :
          undefined;
        const {basePriceMonthly, pricePerStudent} = resolvePricingPlanMetrics(
          pricingPlanData,
        );
        const activeStudentLimit = resolveActiveStudentLimit(
          licenseSnapshot.data(),
          pricingPlanData,
        );
        const currentActiveStudentCount =
          usageMeterSnapshot.exists ?
            normalizeCountField(currentData?.activeStudentCount) :
            await this.countActiveStudents(instituteId, transaction);
        const nextActiveStudentCount = usageMeterSnapshot.exists ?
          Math.max(0, currentActiveStudentCount + activeStudentDelta) :
          currentActiveStudentCount;
        const currentPeakStudentUsage = normalizeCountField(
          currentData?.peakActiveStudents ?? currentData?.peakStudentUsage,
        );
        const nextPeakStudentUsage = Math.max(
          currentPeakStudentUsage,
          nextActiveStudentCount,
        );
        const nextUsageDocument = buildUsageMeterDocument(currentData, {
          activeStudentCount: nextActiveStudentCount,
          activeStudentLimit,
          assignedStudentsCount: normalizeCountField(
            currentData?.assignedStudentsCount,
          ),
          assignmentsCreated: normalizeCountField(
            currentData?.assignmentsCreated,
          ),
          basePriceMonthly,
          cycleId,
          overLimitTimestamp:
            currentData?.overLimit === true ?
              resolveStoredTimestamp(currentData.overLimitSince) :
              null,
          peakActiveStudents: nextPeakStudentUsage,
          pricePerStudent,
          pricingPlanId,
          sessionExecutionVolume: normalizeCountField(
            currentData?.sessionExecutionVolume,
          ),
        });

        transaction.set(usageMeterReference, nextUsageDocument, {merge: true});
        transaction.create(studentEventReference, {
          activeStudentDelta,
          createdAt: FieldValue.serverTimestamp(),
          studentId,
        });

        return true;
      },
    );

    this.logger.info("Usage metering processed for student state change", {
      cycleId,
      eventId,
      instituteId,
      studentId,
      usageMeterPath,
      wasUpdated,
    });

    return {
      cycleId,
      usageMeterPath,
      wasUpdated,
    };
  }

  /**
   * Records session execution volume for submitted sessions.
   * @param {UsageMeterSessionExecutionContext} context Session identifiers.
   * @param {unknown} beforeData Prior session state.
   * @param {unknown} afterData Updated session state.
   * @return {Promise<UsageMeteringResult>} Usage metering write result.
   */
  public async recordSessionExecutionUsage(
    context: UsageMeterSessionExecutionContext,
    beforeData: unknown,
    afterData: unknown,
  ): Promise<UsageMeteringResult> {
    const instituteId = normalizeRequiredString(
      context.instituteId,
      "instituteId",
    );
    const runId = normalizeRequiredString(context.runId, "runId");
    const sessionId = normalizeRequiredString(context.sessionId, "sessionId");
    const yearId = normalizeRequiredString(context.yearId, "yearId");
    const beforeStatus = isRecord(beforeData) ?
      normalizeOptionalString(beforeData.status) :
      null;
    const afterStatus = isRecord(afterData) ?
      normalizeOptionalString(afterData.status) :
      null;

    if (beforeStatus === SUBMITTED_STATUS || afterStatus !== SUBMITTED_STATUS) {
      return {
        cycleId: "",
        reason: "status_not_transitioned",
        usageMeterPath: "",
        wasUpdated: false,
      };
    }

    const submittedAt = resolveSessionSubmittedAt(afterData);

    if (submittedAt === null) {
      throw new UsageMeteringValidationError(
        "Submitted sessions require a submittedAt timestamp " +
        "for usage metering.",
      );
    }

    const cycleId = formatCycleId(submittedAt.toDate());
    const usageMeterPath = `${INSTITUTES_COLLECTION}/${instituteId}/` +
      `${USAGE_METER_COLLECTION}/${cycleId}`;
    const usageMeterReference = this.firestore.doc(usageMeterPath);
    const sessionEventReference = usageMeterReference
      .collection(SESSION_EVENTS_COLLECTION)
      .doc(sessionId);
    const licenseReference = this.firestore
      .collection(INSTITUTES_COLLECTION)
      .doc(instituteId)
      .collection(LICENSE_COLLECTION)
      .doc(LICENSE_DOCUMENT_ID);

    const wasUpdated = await this.firestore.runTransaction(
      async (transaction) => {
        const [sessionEventSnapshot, usageMeterSnapshot, licenseSnapshot] =
          await Promise.all([
            transaction.get(sessionEventReference),
            transaction.get(usageMeterReference),
            transaction.get(licenseReference),
          ]);

        if (sessionEventSnapshot.exists) {
          return false;
        }

        const currentData = usageMeterSnapshot.data();
        const pricingPlanId = resolvePricingPlanId(licenseSnapshot.data());
        const pricingPlanData = pricingPlanId ?
          (await transaction.get(this.firestore
            .collection(VENDOR_CONFIG_COLLECTION)
            .doc(PRICING_PLANS_COLLECTION)
            .collection(PRICING_PLANS_COLLECTION)
            .doc(pricingPlanId))).data() :
          undefined;
        const {basePriceMonthly, pricePerStudent} = resolvePricingPlanMetrics(
          pricingPlanData,
        );
        const activeStudentLimit = resolveActiveStudentLimit(
          licenseSnapshot.data(),
          pricingPlanData,
        );
        const activeStudentCount =
          normalizeOptionalNumber(currentData?.activeStudentCount) ??
          await this.countActiveStudents(instituteId, transaction);
        const currentPeakStudentUsage = normalizeCountField(
          currentData?.peakActiveStudents ?? currentData?.peakStudentUsage,
        );
        const nextUsageDocument = buildUsageMeterDocument(currentData, {
          activeStudentCount,
          activeStudentLimit,
          assignedStudentsCount: normalizeCountField(
            currentData?.assignedStudentsCount,
          ),
          assignmentsCreated: normalizeCountField(
            currentData?.assignmentsCreated,
          ),
          basePriceMonthly,
          cycleId,
          lastAssignmentRunId: normalizeOptionalString(
            currentData?.lastAssignmentRunId,
          ) ?? "",
          overLimitTimestamp:
            currentData?.overLimit === true ?
              resolveStoredTimestamp(currentData.overLimitSince) :
              null,
          peakActiveStudents: Math.max(
            currentPeakStudentUsage,
            activeStudentCount,
          ),
          pricePerStudent,
          pricingPlanId,
          sessionExecutionVolume:
            normalizeCountField(currentData?.sessionExecutionVolume) + 1,
        });

        transaction.set(usageMeterReference, nextUsageDocument, {merge: true});
        transaction.create(sessionEventReference, {
          createdAt: FieldValue.serverTimestamp(),
          eventId: context.eventId ?? null,
          runId,
          sessionId,
          submittedAt,
          yearId,
        });

        return true;
      },
    );

    this.logger.info("Usage metering processed for submitted session", {
      cycleId,
      instituteId,
      runId,
      sessionId,
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

  /**
   * Counts currently active students for a single institute.
   * @param {string} instituteId Institute scope for the count query.
   * @param {FirebaseFirestore.Transaction} transaction Firestore transaction.
   * @return {Promise<number>} Active student count excluding archived and
   * soft-deleted records.
   */
  private async countActiveStudents(
    instituteId: string,
    transaction: FirebaseFirestore.Transaction,
  ): Promise<number> {
    const studentsReference = this.firestore
      .collection(INSTITUTES_COLLECTION)
      .doc(instituteId)
      .collection(STUDENTS_COLLECTION);
    const activeStudentsQuery = studentsReference.where(
      "status",
      "==",
      ACTIVE_STATUS,
    );
    const activeStudentsSnapshot = await transaction.get(activeStudentsQuery);

    return activeStudentsSnapshot.docs
      .filter((snapshot) => {
        const data = snapshot.data();
        return data.archived !== true && data.deleted !== true;
      })
      .length;
  }
}

export const usageMeteringService = new UsageMeteringService();
