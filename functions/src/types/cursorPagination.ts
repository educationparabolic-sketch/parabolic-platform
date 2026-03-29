export interface CursorPaginationWindow {
  limit: number;
  queryLimit: number;
}

export interface CursorPaginationPage<TDocument, TCursor> {
  hasMore: boolean;
  nextCursor: TCursor | null;
  selectedDocuments: TDocument[];
}
