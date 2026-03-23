import {FieldValue} from "firebase-admin/firestore";
import {createLogger} from "./logging";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  RunAnalyticsInitializationContext,
  RunAnalyticsInitializationResult,
} from "../types/runAnalyticsInitialization";

const INSTITUTES_COLLECTION = "institutes";
const ACADEMIC_YEARS_COLLECTION = "academicYears";
const RUN_ANALYTICS_COLLECTION = "runAnalytics";

/**
 * Raised when run analytics initialization input is invalid.
 */
class RunAnalyticsInitializationValidationError extends Error {
  /**
   * @param {string} message Validation failure detail.
   */
  constructor(message: string) {
    super(message);
    this.name = "RunAnalyticsInitializationValidationError";
  }
}

const normalizeRequiredString = (
  value: unknown,
  fieldName: string,
): string => {
  if (typeof value !== "string") {
    throw new RunAnalyticsInitializationValidationError(
      `Run analytics field "${fieldName}" must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new RunAnalyticsInitializationValidationError(
      `Run analytics field "${fieldName}" must be a non-empty string.`,
    );
  }

  return normalizedValue;
};

const isRecord = (
  value: unknown,
): value is Record<string, unknown> => typeof value === "object" &&
  value !== null &&
  !Array.isArray(value);

/**
 * Creates run-level analytics stubs for newly created runs.
 */
export class RunAnalyticsInitializationService {
  private readonly firestore = getFirestore();
  private readonly logger = createLogger("RunAnalyticsInitializationService");

  /**
   * Initializes the run analytics summary document in academic-year scope.
   * @param {RunAnalyticsInitializationContext} context Trigger identifiers.
   * @param {unknown} runData Newly created run payload.
   * @return {Promise<RunAnalyticsInitializationResult>}
   * Result metadata for deterministic logging and testing.
   */
  public async initializeRunAnalytics(
    context: RunAnalyticsInitializationContext,
    runData: unknown,
  ): Promise<RunAnalyticsInitializationResult> {
    const instituteId = normalizeRequiredString(
      context.instituteId,
      "instituteId",
    );
    const yearId = normalizeRequiredString(context.yearId, "yearId");
    const runId = normalizeRequiredString(context.runId, "runId");

    if (!isRecord(runData)) {
      throw new RunAnalyticsInitializationValidationError(
        "Run payload must be a Firestore object.",
      );
    }

    const payloadRunId = normalizeRequiredString(runData.runId, "runId");

    if (payloadRunId !== runId) {
      throw new RunAnalyticsInitializationValidationError(
        "Run analytics initialization requires payload runId to match " +
        "document identifier.",
      );
    }

    const runAnalyticsPath = `${INSTITUTES_COLLECTION}/${instituteId}/` +
      `${ACADEMIC_YEARS_COLLECTION}/${yearId}/` +
      `${RUN_ANALYTICS_COLLECTION}/${runId}`;
    const runAnalyticsReference = this.firestore.doc(runAnalyticsPath);

    try {
      await runAnalyticsReference.create({
        avgAccuracyPercent: 0,
        avgRawScorePercent: 0,
        completionRate: 0,
        createdAt: FieldValue.serverTimestamp(),
        disciplineAverage: 0,
        guessRateAverage: 0,
        overrideCount: 0,
        phaseAdherenceAverage: 0,
        riskDistribution: {},
        stdDeviation: 0,
      });

      this.logger.info("Run analytics initialized", {
        instituteId,
        runAnalyticsPath,
        runId,
        yearId,
      });

      return {
        runAnalyticsPath,
        wasCreated: true,
      };
    } catch (error) {
      const errorCode = isRecord(error) ?
        error.code :
        undefined;

      if (errorCode !== 6 && errorCode !== "already-exists") {
        throw error;
      }

      this.logger.info("Run analytics already initialized", {
        instituteId,
        runAnalyticsPath,
        runId,
        yearId,
      });

      return {
        runAnalyticsPath,
        wasCreated: false,
      };
    }
  }
}

export const runAnalyticsInitializationService =
  new RunAnalyticsInitializationService();
