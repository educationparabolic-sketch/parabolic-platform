import assert from "node:assert/strict";
import test from "node:test";
import {cursorPaginationService} from "../services/cursorPagination";

/**
 * Minimal query double for cursor pagination unit tests.
 */
class FakeQuery {
  public readonly appliedLimits: number[] = [];
  public readonly cursors: unknown[][] = [];

  /**
   * Records the requested limit and returns the fake query.
   * @param {number} value Requested limit.
   * @return {FakeQuery} Fake query instance.
   */
  public limit(value: number): this {
    this.appliedLimits.push(value);
    return this;
  }

  /**
   * Records cursor arguments and returns the fake query.
   * @param {...unknown[]} values Cursor arguments.
   * @return {FakeQuery} Fake query instance.
   */
  public startAfter(...values: unknown[]): this {
    this.cursors.push(values);
    return this;
  }
}

test("cursor pagination applies limit plus one and startAfter", () => {
  const query = new FakeQuery();

  const paginatedQuery = cursorPaginationService.applyToQuery(
    query as unknown as FirebaseFirestore.Query,
    20,
    (workingQuery, cursor: {sortValue: string}) => {
      (workingQuery as unknown as FakeQuery).startAfter(cursor.sortValue);
      return workingQuery;
    },
    undefined,
    {sortValue: "student_2"},
  );

  assert.equal(paginatedQuery, query as unknown as FirebaseFirestore.Query);
  assert.deepEqual(query.appliedLimits, [21]);
  assert.deepEqual(query.cursors, [["student_2"]]);
});

test(
  "cursor pagination trims pages and returns a next cursor only when needed",
  () => {
    const page = cursorPaginationService.buildPage(
      [
        {id: "doc_1"},
        {id: "doc_2"},
        {id: "doc_3"},
      ],
      2,
      (document) => document.id,
    );

    assert.equal(page.hasMore, true);
    assert.deepEqual(page.selectedDocuments, [
      {id: "doc_1"},
      {id: "doc_2"},
    ]);
    assert.equal(page.nextCursor, "doc_2");
  },
);

test(
  "cursor pagination returns a null next cursor on the terminal page",
  () => {
    const page = cursorPaginationService.buildPage(
      [
        {id: "doc_1"},
        {id: "doc_2"},
      ],
      2,
      (document) => document.id,
    );

    assert.equal(page.hasMore, false);
    assert.deepEqual(page.selectedDocuments, [
      {id: "doc_1"},
      {id: "doc_2"},
    ]);
    assert.equal(page.nextCursor, null);
  },
);

test("cursor pagination rejects invalid page sizes", () => {
  assert.throws(
    () => cursorPaginationService.createPageWindow(0),
    /between 1 and 100/i,
  );

  assert.throws(
    () => cursorPaginationService.createPageWindow(101),
    /between 1 and 100/i,
  );
});
