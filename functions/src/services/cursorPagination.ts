import {
  CursorPaginationPage,
  CursorPaginationWindow,
} from "../types/cursorPagination";

const DEFAULT_MAX_CURSOR_LIMIT = 100;

/**
 * Raised when cursor pagination configuration violates platform rules.
 */
class CursorPaginationValidationError extends Error {
  /**
   * @param {string} message Validation failure detail.
   */
  constructor(message: string) {
    super(message);
    this.name = "CursorPaginationValidationError";
  }
}

const normalizeLimit = (limit: number, maxLimit: number): number => {
  if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) {
    throw new CursorPaginationValidationError(
      "Cursor pagination limit must be an integer between 1 and " +
      `${maxLimit}.`,
    );
  }

  return limit;
};

/**
 * Shared cursor pagination helpers for Firestore list queries.
 */
export class CursorPaginationService {
  /**
   * Normalizes a requested list limit into a Firestore page window.
   * @param {number} limit Requested page size.
   * @param {number} maxLimit Maximum allowed page size.
   * @return {CursorPaginationWindow} Normalized page-window settings.
   */
  public createPageWindow(
    limit: number,
    maxLimit = DEFAULT_MAX_CURSOR_LIMIT,
  ): CursorPaginationWindow {
    const normalizedLimit = normalizeLimit(limit, maxLimit);

    return {
      limit: normalizedLimit,
      queryLimit: normalizedLimit + 1,
    };
  }

  /**
   * Applies the approved limit + startAfter pagination pattern to a query.
   * @param {FirebaseFirestore.Query} baseQuery Firestore query before limit.
   * @param {number} limit Requested page size.
   * @param {Function} [applyCursor] Cursor application callback.
   * @param {number} [maxLimit] Maximum allowed page size.
   * @param {*} [cursor] Optional cursor payload.
   * @template TCursor
   * @return {FirebaseFirestore.Query} Cursor-paginated Firestore query.
   */
  public applyToQuery<TCursor>(
    baseQuery: FirebaseFirestore.Query,
    limit: number,
    applyCursor?: (
      query: FirebaseFirestore.Query,
      cursor: TCursor,
    ) => FirebaseFirestore.Query,
    maxLimit = DEFAULT_MAX_CURSOR_LIMIT,
    cursor?: TCursor,
  ): FirebaseFirestore.Query {
    const window = this.createPageWindow(limit, maxLimit);
    let query = baseQuery.limit(window.queryLimit);

    if (cursor !== undefined) {
      if (!applyCursor) {
        throw new CursorPaginationValidationError(
          "Cursor pagination requires an applyCursor callback when a cursor " +
          "is provided.",
        );
      }

      query = applyCursor(query, cursor);
    }

    return query;
  }

  /**
   * Trims a query result page and computes the next cursor when more results
   * remain.
   * @param {TDocument[]} documents Firestore query documents.
   * @param {number} limit Requested page size.
   * @param {Function} buildCursor Cursor builder.
   * @param {number} [maxLimit] Maximum allowed page size.
   * @template TDocument, TCursor
   * @return {CursorPaginationPage<TDocument, TCursor>} Normalized page data.
   */
  public buildPage<TDocument, TCursor>(
    documents: TDocument[],
    limit: number,
    buildCursor: (document: TDocument) => TCursor,
    maxLimit = DEFAULT_MAX_CURSOR_LIMIT,
  ): CursorPaginationPage<TDocument, TCursor> {
    const window = this.createPageWindow(limit, maxLimit);
    const hasMore = documents.length > window.limit;
    const selectedDocuments = documents.slice(0, window.limit);
    const lastDocument = selectedDocuments.length > 0 ?
      selectedDocuments[selectedDocuments.length - 1] :
      undefined;

    return {
      hasMore,
      nextCursor:
        hasMore && lastDocument ? buildCursor(lastDocument) : null,
      selectedDocuments,
    };
  }
}

export const cursorPaginationService = new CursorPaginationService();
