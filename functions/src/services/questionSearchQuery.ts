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
  QuestionSearchSort,
  QuestionSearchSortDirection,
  QuestionSearchSortField,
  SearchTokenFilter,
  SubjectChapterFilter,
} from "../types/questionSearch";
import {searchArchitectureService} from "./searchArchitecture";
import {getFirestore} from "../utils/firebaseAdmin";
import {cursorPaginationService} from "./cursorPagination";
import {indexedQueryValidationService} from "./indexedQueryValidation";

type SupportedQueryPattern =
  "examType_subject" |
  "subject_chapter" |
  "difficulty_subject" |
  "primaryTag" |
  "token_text";

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

const normalizeSearchTokenFilter = (value: unknown): string => {
  const normalizedValue = normalizeRequiredString(value, "searchToken")
    .trim()
    .toLowerCase();

  const normalizedTokens = normalizedValue
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter(Boolean);

  if (normalizedTokens.length !== 1) {
    throw new QuestionSearchValidationError(
      "Question search field \"searchToken\" must resolve to exactly one " +
      "search token.",
    );
  }

  return normalizedTokens[0];
};

const normalizeSortField = (value: unknown): QuestionSearchSortField => {
  if (value === undefined) {
    return "createdAt";
  }

  if (value === "createdAt" || value === "usedCount") {
    return value;
  }

  throw new QuestionSearchValidationError(
    "Question search sort field must be one of createdAt or usedCount.",
  );
};

const normalizeSortDirection = (
  value: unknown,
): QuestionSearchSortDirection => {
  if (value === undefined) {
    return "desc";
  }

  if (value === "asc" || value === "desc") {
    return value;
  }

  throw new QuestionSearchValidationError(
    "Question search sort direction must be either asc or desc.",
  );
};

const normalizeSort = (value: unknown): Required<QuestionSearchSort> => {
  if (value === undefined) {
    return {
      direction: "desc",
      field: "createdAt",
    };
  }

  if (!isPlainObject(value)) {
    throw new QuestionSearchValidationError(
      "Question search \"sort\" must be an object.",
    );
  }

  return {
    direction: normalizeSortDirection(value.direction),
    field: normalizeSortField(value.field),
  };
};

const normalizeCursor = (
  value: unknown,
  sortField: QuestionSearchSortField,
): QuestionSearchCursor | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (!isPlainObject(value)) {
    throw new QuestionSearchValidationError(
      "Question search \"cursor\" must be an object.",
    );
  }

  const questionId = value.questionId;
  const cursorSortField = value.sortField;
  const sortValue = value.sortValue;

  if (
    typeof sortValue !== "number" ||
    !Number.isFinite(sortValue) ||
    sortValue < 0
  ) {
    throw new QuestionSearchValidationError(
      "Question search cursor \"sortValue\" must be a valid number.",
    );
  }

  if (cursorSortField !== sortField) {
    throw new QuestionSearchValidationError(
      "Question search cursor sortField must match the active sort field.",
    );
  }

  return {
    questionId: normalizeRequiredString(questionId, "cursor.questionId"),
    sortField,
    sortValue,
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

  if (filterKeys === "searchToken") {
    return "token_text";
  }

  throw new QuestionSearchValidationError(
    "Unsupported question-search filter combination. Allowed combinations " +
    "are examType+subject, subject+chapter, difficulty+subject, and " +
    "primaryTag, and searchToken.",
  );
};

const getGovernedFilterFields = (
  queryPattern: SupportedQueryPattern,
): string[] => {
  if (queryPattern === "examType_subject") {
    return ["examType", "subject"];
  }

  if (queryPattern === "subject_chapter") {
    return ["subject", "chapter"];
  }

  if (queryPattern === "difficulty_subject") {
    return ["difficulty", "subject"];
  }

  if (queryPattern === "primaryTag") {
    return ["primaryTag"];
  }

  return ["searchTokens"];
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
    primaryTag: typeof payload.primaryTag === "string" ?
      normalizeTagFilter(payload.primaryTag) :
      Array.isArray(payload.tags) && typeof payload.tags[0] === "string" ?
        normalizeTagFilter(payload.tags[0]) :
        null,
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

const buildQuestionCursor = (
  snapshot: FirebaseFirestore.QueryDocumentSnapshot,
  sortField: QuestionSearchSortField,
): QuestionSearchCursor => {
  const payload = snapshot.data();
  const sortValue = payload[sortField];

  if (sortField === "createdAt") {
    if (!(sortValue instanceof Timestamp)) {
      throw new QuestionSearchValidationError(
        "Question search cursor requires a Firestore timestamp sort value.",
      );
    }

    return {
      questionId: normalizeRequiredString(
        payload.questionId ?? snapshot.id,
        "cursor.questionId",
      ),
      sortField,
      sortValue: sortValue.toMillis(),
    };
  }

  if (typeof sortValue !== "number" || !Number.isFinite(sortValue)) {
    throw new QuestionSearchValidationError(
      "Question search cursor requires a numeric sort value.",
    );
  }

  return {
    questionId: normalizeRequiredString(
      payload.questionId ?? snapshot.id,
      "cursor.questionId",
    ),
    sortField,
    sortValue,
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
    const sort = normalizeSort(request.sort);
    const searchDomain = searchArchitectureService.initializeDomain({
      actorRole: request.actorRole,
      domain: "questionBank",
      instituteId,
      limit: request.limit,
    });
    const limit = searchDomain.limit;
    const cursor = normalizeCursor(request.cursor, sort.field);
    const queryPattern = detectQueryPattern(request.filter);
    searchArchitectureService.assertQueryPattern("questionBank", queryPattern);
    const collectionPath = searchDomain.collectionPath;
    indexedQueryValidationService.assertIndexedQuery({
      collectionPath,
      filterFields: getGovernedFilterFields(queryPattern),
      limit,
      orderByFields: [sort.field, "questionId"],
      paginationMode: "cursor",
      policyId: "questionBankSearch",
    });
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
    } else if (queryPattern === "primaryTag") {
      const filter = request.filter as PrimaryTagFilter;
      query = query.where(
        "primaryTag",
        "==",
        normalizeTagFilter(filter.primaryTag),
      );
    } else {
      const filter = request.filter as SearchTokenFilter;
      query = query.where(
        "searchTokens",
        "array-contains",
        normalizeSearchTokenFilter(filter.searchToken),
      );
    }

    query = query
      .orderBy(sort.field, sort.direction)
      .orderBy("questionId", sort.direction);

    query = cursorPaginationService.applyToQuery(
      query,
      limit,
      (paginatedQuery, activeCursor) => {
        const cursorValue = sort.field === "createdAt" ?
          Timestamp.fromMillis(activeCursor.sortValue) :
          activeCursor.sortValue;

        return paginatedQuery.startAfter(cursorValue, activeCursor.questionId);
      },
      undefined,
      cursor,
    );

    const querySnapshot = await query.get();
    const page = cursorPaginationService.buildPage(
      querySnapshot.docs,
      limit,
      (snapshot) => buildQuestionCursor(snapshot, sort.field),
    );
    const selectedDocuments = page.selectedDocuments;
    const questions = selectedDocuments.map(normalizeSearchItem);

    this.logger.info("Question search query completed", {
      cursorProvided: Boolean(cursor),
      instituteId,
      limit,
      queryPattern,
      resultCount: questions.length,
      sortDirection: sort.direction,
      sortField: sort.field,
    });

    return {
      nextCursor: page.nextCursor,
      questions,
    };
  }
}

export const questionSearchQueryService = new QuestionSearchQueryService();
