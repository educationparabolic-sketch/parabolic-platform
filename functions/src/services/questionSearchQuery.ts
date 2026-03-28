import {Timestamp} from "firebase-admin/firestore";
import {createLogger} from "./logging";
import {
  DifficultySubjectFilter,
  ExamTypeSubjectFilter,
  PrimaryTagFilter,
  QuestionSearchCursor,
  QuestionSearchFilter,
  QuestionSearchQueryRequest,
  QuestionSearchQueryResult,
  QuestionSearchResultItem,
  SubjectChapterFilter,
} from "../types/questionSearch";
import {searchArchitectureService} from "./searchArchitecture";
import {getFirestore} from "../utils/firebaseAdmin";

type SupportedQueryPattern =
  "examType_subject" |
  "subject_chapter" |
  "difficulty_subject" |
  "primaryTag";

/**
 * Raised when a question-search request fails validation.
 */
class QuestionSearchValidationError extends Error {
  /**
   * @param {string} message Validation failure detail.
   */
  constructor(message: string) {
    super(message);
    this.name = "QuestionSearchValidationError";
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
    throw new QuestionSearchValidationError(
      `Question search field "${fieldName}" must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new QuestionSearchValidationError(
      `Question search field "${fieldName}" must be a non-empty string.`,
    );
  }

  return normalizedValue;
};

const normalizeTagFilter = (value: unknown): string =>
  normalizeRequiredString(value, "primaryTag")
    .toLowerCase()
    .replace(/\s+/g, " ");

const normalizeCursor = (
  value: unknown,
): QuestionSearchCursor | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (!isPlainObject(value)) {
    throw new QuestionSearchValidationError(
      "Question search \"cursor\" must be an object.",
    );
  }

  const createdAtMillis = value.createdAtMillis;
  const questionId = value.questionId;

  if (
    typeof createdAtMillis !== "number" ||
    !Number.isFinite(createdAtMillis) ||
    createdAtMillis < 0
  ) {
    throw new QuestionSearchValidationError(
      "Question search cursor \"createdAtMillis\" must be a valid number.",
    );
  }

  return {
    createdAtMillis,
    questionId: normalizeRequiredString(questionId, "cursor.questionId"),
  };
};

const detectQueryPattern = (
  filter: QuestionSearchFilter,
): SupportedQueryPattern => {
  const filterObject = filter as unknown as Record<string, unknown>;
  const filterKeys = Object.keys(filterObject).sort().join(",");

  if (filterKeys === "examType,subject") {
    return "examType_subject";
  }

  if (filterKeys === "chapter,subject") {
    return "subject_chapter";
  }

  if (filterKeys === "difficulty,subject") {
    return "difficulty_subject";
  }

  if (filterKeys === "primaryTag") {
    return "primaryTag";
  }

  throw new QuestionSearchValidationError(
    "Unsupported question-search filter combination. Allowed combinations " +
    "are examType+subject, subject+chapter, difficulty+subject, and " +
    "primaryTag.",
  );
};

const normalizeSearchItem = (
  snapshot: FirebaseFirestore.QueryDocumentSnapshot,
): QuestionSearchResultItem => {
  const payload = snapshot.data();
  const createdAt = payload.createdAt;

  if (!(createdAt instanceof Timestamp)) {
    throw new QuestionSearchValidationError(
      "Question document must contain a Firestore timestamp at \"createdAt\".",
    );
  }

  return {
    chapter: normalizeRequiredString(payload.chapter, "chapter"),
    createdAt,
    difficulty: normalizeRequiredString(
      payload.difficulty,
      "difficulty",
    ) as QuestionSearchResultItem["difficulty"],
    examType: normalizeRequiredString(payload.examType, "examType"),
    questionId: normalizeRequiredString(payload.questionId, "questionId"),
    status: normalizeRequiredString(
      payload.status,
      "status",
    ) as QuestionSearchResultItem["status"],
    subject: normalizeRequiredString(payload.subject, "subject"),
    tags: Array.isArray(payload.tags) ?
      payload.tags.filter((tag): tag is string => typeof tag === "string") :
      [],
  };
};

/**
 * Executes indexed and paginated question-bank queries for supported filters.
 */
export class QuestionSearchQueryService {
  private readonly logger = createLogger("QuestionSearchQueryService");

  /**
   * Queries institute question-bank documents using approved indexed filters.
   * @param {QuestionSearchQueryRequest} request Query and pagination input.
   * @return {Promise<QuestionSearchQueryResult>} Paginated query result.
   */
  public async searchQuestions(
    request: QuestionSearchQueryRequest,
  ): Promise<QuestionSearchQueryResult> {
    const instituteId = normalizeRequiredString(
      request.instituteId,
      "instituteId",
    );
    const searchDomain = searchArchitectureService.initializeDomain({
      domain: "questionBank",
      instituteId,
      limit: request.limit,
    });
    const limit = searchDomain.limit;
    const cursor = normalizeCursor(request.cursor);
    const queryPattern = detectQueryPattern(request.filter);
    searchArchitectureService.assertQueryPattern("questionBank", queryPattern);
    const collectionPath = searchDomain.collectionPath;
    const firestore = getFirestore();
    let query: FirebaseFirestore.Query = firestore.collection(
      collectionPath,
    );

    if (queryPattern === "examType_subject") {
      const filter = request.filter as ExamTypeSubjectFilter;
      query = query
        .where(
          "examType",
          "==",
          normalizeRequiredString(filter.examType, "examType"),
        )
        .where(
          "subject",
          "==",
          normalizeRequiredString(filter.subject, "subject"),
        );
    } else if (queryPattern === "subject_chapter") {
      const filter = request.filter as SubjectChapterFilter;
      query = query
        .where(
          "subject",
          "==",
          normalizeRequiredString(filter.subject, "subject"),
        )
        .where(
          "chapter",
          "==",
          normalizeRequiredString(filter.chapter, "chapter"),
        );
    } else if (queryPattern === "difficulty_subject") {
      const filter = request.filter as DifficultySubjectFilter;
      query = query
        .where(
          "difficulty",
          "==",
          normalizeRequiredString(filter.difficulty, "difficulty"),
        )
        .where(
          "subject",
          "==",
          normalizeRequiredString(filter.subject, "subject"),
        );
    } else {
      const filter = request.filter as PrimaryTagFilter;
      query = query.where(
        "tags",
        "array-contains",
        normalizeTagFilter(filter.primaryTag),
      );
    }

    query = query.orderBy("createdAt", "desc").orderBy("questionId").limit(
      limit + 1,
    );

    if (cursor) {
      query = query.startAfter(
        Timestamp.fromMillis(cursor.createdAtMillis),
        cursor.questionId,
      );
    }

    const querySnapshot = await query.get();
    const hasMore = querySnapshot.docs.length > limit;
    const selectedDocuments = querySnapshot.docs.slice(0, limit);
    const questions = selectedDocuments.map(normalizeSearchItem);
    const lastResult =
      questions.length > 0 ? questions[questions.length - 1] : undefined;
    const nextCursor = hasMore && lastResult ?
      {
        createdAtMillis: lastResult.createdAt.toMillis(),
        questionId: lastResult.questionId,
      } :
      null;

    this.logger.info("Question search query completed", {
      cursorProvided: Boolean(cursor),
      instituteId,
      limit,
      queryPattern,
      resultCount: questions.length,
    });

    return {
      nextCursor,
      questions,
    };
  }
}

export const questionSearchQueryService = new QuestionSearchQueryService();
