import {FieldValue} from "firebase-admin/firestore";
import {createLogger} from "./logging";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  TemplateAnalyticsInitializationContext,
  TemplateAnalyticsInitializationResult,
} from "../types/templateAnalytics";

const INSTITUTES_COLLECTION = "institutes";
const ACADEMIC_YEARS_COLLECTION = "academicYears";
const TEMPLATE_ANALYTICS_COLLECTION = "templateAnalytics";

/**
 * Raised when template analytics initialization input is invalid.
 */
class TemplateAnalyticsInitializationValidationError extends Error {
  /**
   * @param {string} message Validation failure detail.
   */
  constructor(message: string) {
    super(message);
    this.name = "TemplateAnalyticsInitializationValidationError";
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
    throw new TemplateAnalyticsInitializationValidationError(
      `Template field "${fieldName}" must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new TemplateAnalyticsInitializationValidationError(
      `Template field "${fieldName}" must be a non-empty string.`,
    );
  }

  return normalizedValue;
};

/**
 * Creates template-level analytics stubs for newly created templates.
 */
export class TemplateAnalyticsInitializationService {
  private readonly firestore = getFirestore();
  private readonly logger = createLogger(
    "TemplateAnalyticsInitializationService",
  );

  /**
   * Initializes the template analytics summary document in academic-year scope.
   * @param {TemplateAnalyticsInitializationContext} context
   * Trigger identifiers.
   * @param {unknown} templateData Newly created template payload.
   * @return {Promise<TemplateAnalyticsInitializationResult>}
   * Result metadata for deterministic logging and testing.
   */
  public async initializeTemplateAnalytics(
    context: TemplateAnalyticsInitializationContext,
    templateData: unknown,
  ): Promise<TemplateAnalyticsInitializationResult> {
    const instituteId = normalizeRequiredString(
      context.instituteId,
      "instituteId",
    );
    const testId = normalizeRequiredString(context.testId, "testId");

    if (!isRecord(templateData)) {
      throw new TemplateAnalyticsInitializationValidationError(
        "Template payload must be a Firestore object.",
      );
    }

    const yearId = normalizeRequiredString(
      templateData.academicYear,
      "academicYear",
    );
    const templateAnalyticsPath = `${INSTITUTES_COLLECTION}/${instituteId}/` +
      `${ACADEMIC_YEARS_COLLECTION}/${yearId}/` +
      `${TEMPLATE_ANALYTICS_COLLECTION}/${testId}`;
    const templateAnalyticsReference = this.firestore.doc(
      templateAnalyticsPath,
    );

    try {
      await templateAnalyticsReference.create({
        avgAccuracyPercent: 0,
        avgRawScorePercent: 0,
        difficultyConsistencyScore: 0,
        lastUpdated: FieldValue.serverTimestamp(),
        phaseVariance: 0,
        riskShiftIndex: 0,
        stabilityIndex: 0,
        totalRuns: 0,
      });

      this.logger.info("Template analytics initialized", {
        instituteId,
        templateAnalyticsPath,
        testId,
        yearId,
      });

      return {
        templateAnalyticsPath,
        wasCreated: true,
        yearId,
      };
    } catch (error) {
      const errorCode = isRecord(error) ?
        error.code :
        undefined;

      if (errorCode !== 6 && errorCode !== "already-exists") {
        throw error;
      }

      this.logger.info("Template analytics already initialized", {
        instituteId,
        templateAnalyticsPath,
        testId,
        yearId,
      });

      return {
        templateAnalyticsPath,
        wasCreated: false,
        yearId,
      };
    }
  }
}

export const templateAnalyticsInitializationService =
  new TemplateAnalyticsInitializationService();
