import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {createLogger} from "./logging";
import {searchTokenIndexService} from "./searchTokenIndex";
import {chapterDictionaryService} from "./chapterDictionary";
import {tagDictionaryService} from "./tagDictionary";
import {
  QuestionAnalyticsDocument,
  QuestionBankDocument,
  QuestionDifficulty,
  QuestionIngestionContext,
  QuestionIngestionResult,
  QuestionStatus,
} from "../types/questionIngestion";
import {getFirestore} from "../utils/firebaseAdmin";

const INSTITUTES_COLLECTION = "institutes";
const QUESTION_BANK_COLLECTION = "questionBank";
const QUESTION_ANALYTICS_COLLECTION = "questionAnalytics";

const ALLOWED_DIFFICULTIES = new Set<QuestionDifficulty>([
  "Easy",
  "Medium",
  "Hard",
]);
const ALLOWED_STATUSES = new Set<QuestionStatus>([
  "active",
  "used",
  "archived",
  "deprecated",
]);

/**
 * Raised when a question-bank document fails ingestion validation.
 */
class QuestionIngestionValidationError extends Error {
  /**
   * @param {string} message Validation failure detail.
   */
  constructor(message: string) {
    super(message);
    this.name = "QuestionIngestionValidationError";
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
    throw new QuestionIngestionValidationError(
      `Question field "${fieldName}" must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new QuestionIngestionValidationError(
      `Question field "${fieldName}" must be a non-empty string.`,
    );
  }

  return normalizedValue;
};

const normalizeOptionalString = (
  value: unknown,
  fieldName: string,
): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  return normalizeRequiredString(value, fieldName);
};

const normalizeStringAllowEmpty = (
  value: unknown,
  fieldName: string,
): string => {
  if (typeof value !== "string") {
    throw new QuestionIngestionValidationError(
      `Question field "${fieldName}" must be a string.`,
    );
  }

  return value.trim();
};

const normalizeRequiredNumber = (
  value: unknown,
  fieldName: string,
): number => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new QuestionIngestionValidationError(
      `Question field "${fieldName}" must be a valid number.`,
    );
  }

  return value;
};

const normalizeNonNegativeNumber = (
  value: unknown,
  fieldName: string,
): number => {
  const normalizedValue = normalizeRequiredNumber(value, fieldName);

  if (normalizedValue < 0) {
    throw new QuestionIngestionValidationError(
      `Question field "${fieldName}" must be non-negative.`,
    );
  }

  return normalizedValue;
};

const normalizeDifficulty = (value: unknown): QuestionDifficulty => {
  const normalizedValue = normalizeRequiredString(value, "difficulty");

  if (!ALLOWED_DIFFICULTIES.has(normalizedValue as QuestionDifficulty)) {
    throw new QuestionIngestionValidationError(
      "Question field \"difficulty\" must be one of Easy, Medium, or Hard.",
    );
  }

  return normalizedValue as QuestionDifficulty;
};

const normalizeStatus = (value: unknown): QuestionStatus => {
  if (value === undefined) {
    return "active";
  }

  const normalizedValue = normalizeRequiredString(
    value,
    "status",
  ).toLowerCase();

  if (!ALLOWED_STATUSES.has(normalizedValue as QuestionStatus)) {
    throw new QuestionIngestionValidationError(
      "Question field \"status\" must be one of active, used, " +
      "archived, or deprecated.",
    );
  }

  return normalizedValue as QuestionStatus;
};

const normalizeTags = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    throw new QuestionIngestionValidationError(
      "Question field \"tags\" must be an array of strings.",
    );
  }

  const normalizedTags = value.map((tag) => {
    if (typeof tag !== "string") {
      throw new QuestionIngestionValidationError(
        "Question field \"tags\" must contain only strings.",
      );
    }

    const normalizedTag = tag
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");

    if (!normalizedTag) {
      throw new QuestionIngestionValidationError(
        "Question field \"tags\" must not contain empty values.",
      );
    }

    return normalizedTag;
  });

  return Array.from(new Set(normalizedTags)).sort();
};

const normalizeTimestamp = (
  value: unknown,
  fieldName: string,
): FirebaseFirestore.Timestamp => {
  if (!(value instanceof Timestamp)) {
    throw new QuestionIngestionValidationError(
      `Question field "${fieldName}" must be a Firestore timestamp.`,
    );
  }

  return value;
};

const normalizeLastUsedAt = (
  value: unknown,
): FirebaseFirestore.Timestamp | null => {
  if (value === null || value === undefined) {
    return null;
  }

  return normalizeTimestamp(value, "lastUsedAt");
};

const normalizeQuestionTextKeywords = (value: unknown): string[] => {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new QuestionIngestionValidationError(
      "Question field \"questionTextKeywords\" must be an array of strings.",
    );
  }

  return value.map((keyword) => {
    if (typeof keyword !== "string") {
      throw new QuestionIngestionValidationError(
        "Question field \"questionTextKeywords\" must contain only strings.",
      );
    }

    const normalizedKeyword = keyword.trim();

    if (!normalizedKeyword) {
      throw new QuestionIngestionValidationError(
        "Question field \"questionTextKeywords\" must not contain " +
        "empty values.",
      );
    }

    return normalizedKeyword;
  });
};

const buildQuestionAnalyticsStub = (): QuestionAnalyticsDocument => ({
  avgRawPercentWhenUsed: 0,
  avgAccuracyWhenUsed: 0,
  averageResponseTimeMs: 0,
  correctAttemptCount: 0,
  disciplineStressIndex: 0,
  guessRate: 0,
  incorrectAttemptCount: 0,
  overstayRate: 0,
  riskImpactScore: 0,
});

const normalizeQuestionDocument = (
  context: QuestionIngestionContext,
  data: unknown,
): {
  normalizedQuestion: QuestionBankDocument;
  normalizedTags: string[];
  searchTokens: string[];
  updatePayload: Record<string, unknown>;
} => {
  if (!isPlainObject(data)) {
    throw new QuestionIngestionValidationError(
      "Question payload must be a Firestore object.",
    );
  }

  const questionId = normalizeRequiredString(data.questionId, "questionId");

  if (questionId !== context.questionId) {
    throw new QuestionIngestionValidationError(
      "Question field \"questionId\" must match the document identifier.",
    );
  }

  const normalizedTags = normalizeTags(data.tags);
  const subject = normalizeRequiredString(data.subject, "subject");
  const chapter = normalizeRequiredString(data.chapter, "chapter");
  const {searchTokens} = searchTokenIndexService.generateTokens({
    chapter,
    questionTextKeywords: normalizeQuestionTextKeywords(
      data.questionTextKeywords,
    ),
    subject,
    tags: normalizedTags,
  });
  const createdAt = data.createdAt instanceof Timestamp ?
    normalizeTimestamp(data.createdAt, "createdAt") :
    Timestamp.now();

  const normalizedQuestion: QuestionBankDocument = {
    chapter,
    correctAnswer: normalizeRequiredString(data.correctAnswer, "correctAnswer"),
    createdAt,
    difficulty: normalizeDifficulty(data.difficulty),
    examType: normalizeRequiredString(data.examType, "examType"),
    lastUsedAt: normalizeLastUsedAt(data.lastUsedAt),
    marks: normalizeNonNegativeNumber(data.marks, "marks"),
    negativeMarks: normalizeNonNegativeNumber(
      data.negativeMarks,
      "negativeMarks",
    ),
    parentQuestionId: normalizeOptionalString(
      data.parentQuestionId,
      "parentQuestionId",
    ),
    questionId,
    questionImageUrl: normalizeStringAllowEmpty(
      data.questionImageUrl,
      "questionImageUrl",
    ),
    questionType: normalizeRequiredString(data.questionType, "questionType"),
    searchTokens,
    simulationLink: normalizeOptionalString(
      data.simulationLink,
      "simulationLink",
    ),
    solutionImageUrl: normalizeStringAllowEmpty(
      data.solutionImageUrl,
      "solutionImageUrl",
    ),
    status: normalizeStatus(data.status),
    subject,
    tags: normalizedTags,
    tutorialVideoLink: normalizeOptionalString(
      data.tutorialVideoLink,
      "tutorialVideoLink",
    ),
    uniqueKey: normalizeRequiredString(data.uniqueKey, "uniqueKey"),
    usedCount: data.usedCount === undefined ?
      0 :
      normalizeNonNegativeNumber(data.usedCount, "usedCount"),
    version: normalizeNonNegativeNumber(data.version, "version"),
  };

  const updatePayload: Record<string, unknown> = {
    createdAt: data.createdAt instanceof Timestamp ?
      createdAt :
      FieldValue.serverTimestamp(),
    lastUsedAt: normalizedQuestion.lastUsedAt,
    searchTokens,
    status: normalizedQuestion.status,
    tags: normalizedTags,
    usedCount: normalizedQuestion.usedCount,
  };

  return {
    normalizedQuestion,
    normalizedTags,
    searchTokens,
    updatePayload,
  };
};

/**
 * Validates and normalizes newly created institute question documents.
 */
export class QuestionIngestionService {
  private readonly firestore = getFirestore();
  private readonly logger = createLogger("QuestionIngestionService");

  /**
   * Ingests a newly created institute question-bank document.
   * @param {QuestionIngestionContext} context Path-bound identifiers.
   * @param {unknown} data Raw Firestore document payload.
   * @return {Promise<QuestionIngestionResult>} Persisted ingestion metadata.
   */
  public async ingestQuestion(
    context: QuestionIngestionContext,
    data: unknown,
  ): Promise<QuestionIngestionResult> {
    const normalizedContext = {
      instituteId: normalizeRequiredString(
        context.instituteId,
        "instituteId",
      ),
      questionId: normalizeRequiredString(context.questionId, "questionId"),
    };
    const questionPath =
      `${INSTITUTES_COLLECTION}/${normalizedContext.instituteId}/` +
      `${QUESTION_BANK_COLLECTION}/${normalizedContext.questionId}`;
    const analyticsPath =
      `${INSTITUTES_COLLECTION}/${normalizedContext.instituteId}/` +
      `${QUESTION_ANALYTICS_COLLECTION}/${normalizedContext.questionId}`;

    try {
      const {
        normalizedQuestion,
        normalizedTags,
        searchTokens,
        updatePayload,
      } = normalizeQuestionDocument(normalizedContext, data);
      const questionReference = this.firestore.doc(questionPath);
      const analyticsReference = this.firestore.doc(analyticsPath);
      let tagDictionaryPaths: string[] = [];
      let chapterDictionaryPaths: string[] = [];

      await this.firestore.runTransaction(async (transaction) => {
        const analyticsSnapshot = await transaction.get(analyticsReference);
        const tagDictionaryEntries =
          await tagDictionaryService.incrementUsageCountsWithTransaction(
            transaction,
            {
              instituteId: normalizedContext.instituteId,
              tags: normalizedTags,
            },
          );
        tagDictionaryPaths = tagDictionaryEntries.map((entry) => entry.path);
        const chapterDictionaryEntry =
          await chapterDictionaryService.incrementUsageCountWithTransaction(
            transaction,
            {
              chapterName: normalizedQuestion.chapter,
              instituteId: normalizedContext.instituteId,
              subject: normalizedQuestion.subject,
            },
          );
        chapterDictionaryPaths = [chapterDictionaryEntry.path];

        transaction.set(questionReference, updatePayload, {merge: true});

        if (!analyticsSnapshot.exists) {
          transaction.create(
            analyticsReference,
            buildQuestionAnalyticsStub(),
          );
        }
      });

      this.logger.info("Question ingestion completed", {
        analyticsPath,
        difficulty: normalizedQuestion.difficulty,
        instituteId: normalizedContext.instituteId,
        questionId: normalizedContext.questionId,
        questionPath,
        chapterDictionaryPaths,
        searchTokenCount: searchTokens.length,
        subject: normalizedQuestion.subject,
        tagDictionaryPaths,
        tags: normalizedTags,
      });

      return {
        analyticsPath,
        normalizedTags,
        questionPath,
        searchTokens,
        chapterDictionaryPaths,
        tagDictionaryPaths,
      };
    } catch (error) {
      this.logger.error("Question ingestion failed", {
        error,
        instituteId: normalizedContext.instituteId,
        questionId: normalizedContext.questionId,
        questionPath,
      });
      throw error;
    }
  }
}

export const questionIngestionService = new QuestionIngestionService();
