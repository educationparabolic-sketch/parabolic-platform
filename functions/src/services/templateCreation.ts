import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {createLogger} from "./logging";
import {QuestionDifficulty} from "../types/questionIngestion";
import {
  NormalizedTemplateCreationInput,
  QuestionDifficultyCounts,
  TemplateCreationContext,
  TemplateCreationResult,
  TemplateDifficultyDistribution,
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
      difficultyDistribution: normalizedTemplate.difficultyDistribution,
      questionIds: normalizedTemplate.questionIds,
      templatePath,
      totalQuestions: normalizedTemplate.totalQuestions,
      validatedQuestionPaths: questionPaths,
    };
  }
}

export const templateCreationService = new TemplateCreationService();
