import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {createLogger} from "./logging";
import {QuestionDifficulty} from "../types/questionIngestion";
import {
  NormalizedTemplateCreationInput,
  QuestionDifficultyCounts,
  TemplateCreationContext,
  TemplateCreationResult,
  TemplateDifficultyDistribution,
  TemplatePhaseConfigSnapshot,
  TemplateTimingProfile,
  TemplateTimingWindow,
} from "../types/templateCreation";
import {getFirestore} from "../utils/firebaseAdmin";

const INSTITUTES_COLLECTION = "institutes";
const QUESTION_BANK_COLLECTION = "questionBank";
const TESTS_COLLECTION = "tests";
const ALLOWED_DIFFICULTIES = new Set<QuestionDifficulty>([
  "Easy",
  "Medium",
  "Hard",
]);

/**
 * Raised when a newly created template fails architecture validation.
 */
class TemplateCreationValidationError extends Error {
  /**
   * @param {string} message Validation failure detail.
   */
  constructor(message: string) {
    super(message);
    this.name = "TemplateCreationValidationError";
  }
}

const isPlainObject = (
  value: unknown,
): value is Record<string, unknown> => typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof Date) &&
  !(value instanceof Timestamp);

const normalizeRequiredString = (
  value: unknown,
  fieldName: string,
): string => {
  if (typeof value !== "string") {
    throw new TemplateCreationValidationError(
      `Template field "${fieldName}" must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new TemplateCreationValidationError(
      `Template field "${fieldName}" must be a non-empty string.`,
    );
  }

  return normalizedValue;
};

const normalizePositiveInteger = (
  value: unknown,
  fieldName: string,
): number => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new TemplateCreationValidationError(
      `Template field "${fieldName}" must be a positive integer.`,
    );
  }

  return value;
};

const normalizeNonNegativeInteger = (
  value: unknown,
  fieldName: string,
): number => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw new TemplateCreationValidationError(
      `Template field "${fieldName}" must be a non-negative integer.`,
    );
  }

  return value;
};

const normalizeQuestionIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    throw new TemplateCreationValidationError(
      "Template field \"questionIds\" must be an array of strings.",
    );
  }

  const normalizedQuestionIds = value.map((questionId) =>
    normalizeRequiredString(questionId, "questionIds[]"),
  );

  if (normalizedQuestionIds.length === 0) {
    throw new TemplateCreationValidationError(
      "Template field \"questionIds\" must contain at least one question id.",
    );
  }

  const uniqueQuestionIds = Array.from(new Set(normalizedQuestionIds));

  if (uniqueQuestionIds.length !== normalizedQuestionIds.length) {
    throw new TemplateCreationValidationError(
      "Template field \"questionIds\" must not contain duplicates.",
    );
  }

  return uniqueQuestionIds;
};

const normalizeDifficultyDistribution = (
  value: unknown,
): TemplateDifficultyDistribution => {
  if (!isPlainObject(value)) {
    throw new TemplateCreationValidationError(
      "Template field \"difficultyDistribution\" must be an object.",
    );
  }

  return {
    easy: normalizeNonNegativeInteger(
      value.easy,
      "difficultyDistribution.easy",
    ),
    hard: normalizeNonNegativeInteger(
      value.hard,
      "difficultyDistribution.hard",
    ),
    medium: normalizeNonNegativeInteger(
      value.medium,
      "difficultyDistribution.medium",
    ),
  };
};

const normalizeTimingWindow = (
  value: unknown,
  fieldName: string,
): TemplateTimingWindow => {
  if (!isPlainObject(value)) {
    throw new TemplateCreationValidationError(
      `Template field "${fieldName}" must be an object.`,
    );
  }

  const min = normalizePositiveInteger(value.min, `${fieldName}.min`);
  const max = normalizePositiveInteger(value.max, `${fieldName}.max`);

  if (min > max) {
    throw new TemplateCreationValidationError(
      `Template field "${fieldName}" must satisfy min <= max.`,
    );
  }

  return {max, min};
};

const normalizeTimingProfile = (value: unknown): TemplateTimingProfile => {
  if (!isPlainObject(value)) {
    throw new TemplateCreationValidationError(
      "Template field \"timingProfile\" must be an object.",
    );
  }

  return {
    easy: normalizeTimingWindow(value.easy, "timingProfile.easy"),
    hard: normalizeTimingWindow(value.hard, "timingProfile.hard"),
    medium: normalizeTimingWindow(value.medium, "timingProfile.medium"),
  };
};

const PHASE_EASY_WEIGHT = 1;
const PHASE_MEDIUM_WEIGHT = 2.3;
const PHASE_HARD_WEIGHT = 4;
const PHASE_PERCENT_PRECISION_FACTOR = 100;
const PHASE_PERCENT_TOLERANCE = 0.01;

const roundToTwoDecimals = (value: number): number =>
  Math.round(value * PHASE_PERCENT_PRECISION_FACTOR) /
  PHASE_PERCENT_PRECISION_FACTOR;

const normalizePercentField = (value: unknown, fieldName: string): number => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100
  ) {
    throw new TemplateCreationValidationError(
      `Template field "${fieldName}" must be a number between 0 and 100.`,
    );
  }

  return roundToTwoDecimals(value);
};

const computeDefaultPhaseConfigSnapshot = (
  difficultyDistribution: TemplateDifficultyDistribution,
): TemplatePhaseConfigSnapshot => {
  const easyLoad = difficultyDistribution.easy * PHASE_EASY_WEIGHT;
  const mediumLoad = difficultyDistribution.medium * PHASE_MEDIUM_WEIGHT;
  const hardLoad = difficultyDistribution.hard * PHASE_HARD_WEIGHT;
  const totalLoad = easyLoad + mediumLoad + hardLoad;

  if (totalLoad <= 0) {
    throw new TemplateCreationValidationError(
      "Template phaseConfigSnapshot cannot be computed from an empty " +
      "difficulty distribution.",
    );
  }

  const phase1Percent = roundToTwoDecimals((easyLoad / totalLoad) * 100);
  const phase2Percent = roundToTwoDecimals((mediumLoad / totalLoad) * 100);
  const phase3Percent = roundToTwoDecimals(100 - phase1Percent - phase2Percent);

  return {
    phase1Percent,
    phase2Percent,
    phase3Percent,
  };
};

const normalizePhaseConfigSnapshot = (
  value: unknown,
  difficultyDistribution: TemplateDifficultyDistribution,
): TemplatePhaseConfigSnapshot => {
  if (value === undefined) {
    return computeDefaultPhaseConfigSnapshot(difficultyDistribution);
  }

  if (!isPlainObject(value)) {
    throw new TemplateCreationValidationError(
      "Template field \"phaseConfigSnapshot\" must be an object.",
    );
  }

  const phase1Percent = normalizePercentField(
    value.phase1Percent,
    "phaseConfigSnapshot.phase1Percent",
  );
  const phase2Percent = normalizePercentField(
    value.phase2Percent,
    "phaseConfigSnapshot.phase2Percent",
  );
  const phase3Percent = normalizePercentField(
    value.phase3Percent,
    "phaseConfigSnapshot.phase3Percent",
  );
  const phaseTotal = roundToTwoDecimals(
    phase1Percent + phase2Percent + phase3Percent,
  );

  if (Math.abs(phaseTotal - 100) > PHASE_PERCENT_TOLERANCE) {
    throw new TemplateCreationValidationError(
      "Template field \"phaseConfigSnapshot\" must sum to 100.",
    );
  }

  return {
    phase1Percent,
    phase2Percent,
    phase3Percent,
  };
};

const countDifficulties = (
  difficulties: QuestionDifficulty[],
): QuestionDifficultyCounts => {
  const counts: QuestionDifficultyCounts = {
    Easy: 0,
    Hard: 0,
    Medium: 0,
  };

  difficulties.forEach((difficulty) => {
    counts[difficulty] += 1;
  });

  return counts;
};

const normalizeTemplateInput = (
  context: TemplateCreationContext,
  data: unknown,
): NormalizedTemplateCreationInput => {
  if (!isPlainObject(data)) {
    throw new TemplateCreationValidationError(
      "Template payload must be a Firestore object.",
    );
  }

  const testId = normalizeRequiredString(data.testId, "testId");

  if (testId !== context.testId) {
    throw new TemplateCreationValidationError(
      "Template field \"testId\" must match the document identifier.",
    );
  }

  const questionIds = normalizeQuestionIds(data.questionIds);
  const difficultyDistribution = normalizeDifficultyDistribution(
    data.difficultyDistribution,
  );
  const phaseConfigSnapshot = normalizePhaseConfigSnapshot(
    data.phaseConfigSnapshot,
    difficultyDistribution,
  );
  const timingProfile = normalizeTimingProfile(data.timingProfile);
  const totalQuestions = data.totalQuestions === undefined ?
    questionIds.length :
    normalizePositiveInteger(data.totalQuestions, "totalQuestions");

  if (totalQuestions !== questionIds.length) {
    throw new TemplateCreationValidationError(
      "Template field \"totalQuestions\" must match questionIds length.",
    );
  }

  const difficultyTotal =
    difficultyDistribution.easy +
    difficultyDistribution.medium +
    difficultyDistribution.hard;

  if (difficultyTotal !== totalQuestions) {
    throw new TemplateCreationValidationError(
      "Template difficultyDistribution total must match totalQuestions.",
    );
  }

  return {
    difficultyDistribution,
    phaseConfigSnapshot,
    questionIds,
    timingProfile,
    totalQuestions,
  };
};

const getQuestionPath = (instituteId: string, questionId: string): string =>
  `${INSTITUTES_COLLECTION}/${instituteId}/${QUESTION_BANK_COLLECTION}/` +
  `${questionId}`;

/**
 * Validates and normalizes newly created test templates.
 */
export class TemplateCreationService {
  private readonly logger = createLogger("TemplateCreationService");
  private readonly firestore = getFirestore();

  /**
   * Validates template question references, distribution, and timing profile.
   * @param {TemplateCreationContext} context Trigger context identifiers.
   * @param {unknown} data Newly written template payload.
   * @return {Promise<TemplateCreationResult>} Persisted template metadata.
   */
  public async processTemplateCreated(
    context: TemplateCreationContext,
    data: unknown,
  ): Promise<TemplateCreationResult> {
    const instituteId = normalizeRequiredString(
      context.instituteId,
      "instituteId",
    );
    const testId = normalizeRequiredString(context.testId, "testId");
    const normalizedTemplate = normalizeTemplateInput(
      {instituteId, testId},
      data,
    );
    const templatePath =
      `${INSTITUTES_COLLECTION}/${instituteId}/${TESTS_COLLECTION}/${testId}`;
    const questionPaths = normalizedTemplate.questionIds.map((questionId) =>
      getQuestionPath(instituteId, questionId),
    );
    const questionReferences = questionPaths.map((path) =>
      this.firestore.doc(path),
    );
    const questionSnapshots = await this.firestore.getAll(
      ...questionReferences,
    );
    const questionDifficulties = questionSnapshots.map((snapshot, index) => {
      if (!snapshot.exists) {
        throw new TemplateCreationValidationError(
          "Template references a question that does not belong to this " +
          `institute: "${normalizedTemplate.questionIds[index]}".`,
        );
      }

      const payloadDifficulty = snapshot.data()?.difficulty;

      if (
        typeof payloadDifficulty !== "string" ||
        !ALLOWED_DIFFICULTIES.has(payloadDifficulty as QuestionDifficulty)
      ) {
        throw new TemplateCreationValidationError(
          "Referenced question has an unsupported difficulty value at " +
          `${snapshot.ref.path}.`,
        );
      }

      return payloadDifficulty as QuestionDifficulty;
    });
    const actualDistribution = countDifficulties(questionDifficulties);

    if (
      normalizedTemplate.difficultyDistribution.easy !==
        actualDistribution.Easy ||
      normalizedTemplate.difficultyDistribution.medium !==
        actualDistribution.Medium ||
      normalizedTemplate.difficultyDistribution.hard !== actualDistribution.Hard
    ) {
      throw new TemplateCreationValidationError(
        "Template difficultyDistribution must match the referenced questions.",
      );
    }

    const templateReference = this.firestore.doc(templatePath);
    const createdAt = isPlainObject(data) &&
      data.createdAt instanceof Timestamp ?
      data.createdAt :
      FieldValue.serverTimestamp();
    const normalizedTotalRuns = isPlainObject(data) &&
      typeof data.totalRuns === "number" &&
      Number.isFinite(data.totalRuns) &&
      data.totalRuns >= 0 ?
      Math.floor(data.totalRuns) :
      0;

    await templateReference.set({
      createdAt,
      difficultyDistribution: normalizedTemplate.difficultyDistribution,
      phaseConfigSnapshot: normalizedTemplate.phaseConfigSnapshot,
      questionIds: normalizedTemplate.questionIds,
      status: "draft",
      testId,
      timingProfile: normalizedTemplate.timingProfile,
      totalQuestions: normalizedTemplate.totalQuestions,
      totalRuns: normalizedTotalRuns,
    }, {merge: true});

    this.logger.info("Template creation validation completed", {
      instituteId,
      questionCount: normalizedTemplate.totalQuestions,
      templatePath,
      testId,
    });

    return {
      configurationSnapshot: {
        difficultyDistribution: normalizedTemplate.difficultyDistribution,
        phaseConfigSnapshot: normalizedTemplate.phaseConfigSnapshot,
        timingProfile: normalizedTemplate.timingProfile,
      },
      difficultyDistribution: normalizedTemplate.difficultyDistribution,
      phaseConfigSnapshot: normalizedTemplate.phaseConfigSnapshot,
      questionIds: normalizedTemplate.questionIds,
      templatePath,
      timingProfile: normalizedTemplate.timingProfile,
      totalQuestions: normalizedTemplate.totalQuestions,
      validatedQuestionPaths: questionPaths,
    };
  }
}

export const templateCreationService = new TemplateCreationService();
