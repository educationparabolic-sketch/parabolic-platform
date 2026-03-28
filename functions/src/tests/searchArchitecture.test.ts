import assert from "node:assert/strict";
import test from "node:test";
import {searchArchitectureService} from "../services/searchArchitecture";

test(
  "initializeDomain configures question-bank search deterministically",
  () => {
    const result = searchArchitectureService.initializeDomain({
      actorRole: "teacher",
      domain: "questionBank",
      instituteId: "inst_build_51",
      limit: 40,
    });

    assert.equal(
      result.collectionPath,
      "institutes/inst_build_51/questionBank",
    );
    assert.equal(result.limit, 40);
    assert.deepEqual(result.definition.indexedOrderByFields, [
      "createdAt",
      "questionId",
      "usedCount",
    ]);
    assert.equal(result.definition.usesSummaryCollectionsOnly, false);
  },
);

test(
  "initializeDomain requires academic-year scope for summary analytics",
  () => {
    assert.throws(
      () =>
        searchArchitectureService.initializeDomain({
          actorRole: "admin",
          domain: "studentYearMetrics",
          instituteId: "inst_build_51",
        }),
      /yearId/i,
    );

    const result = searchArchitectureService.initializeDomain({
      actorRole: "admin",
      domain: "studentYearMetrics",
      instituteId: "inst_build_51",
      yearId: "2026",
    });

    assert.equal(
      result.collectionPath,
      "institutes/inst_build_51/academicYears/2026/studentYearMetrics",
    );
    assert.equal(result.definition.usesSummaryCollectionsOnly, true);
  },
);

test("initializeDomain rejects roles blocked by search security rules", () => {
  assert.throws(
    () =>
      searchArchitectureService.initializeDomain({
        actorRole: "student",
        domain: "questionBank",
        instituteId: "inst_build_51",
      }),
    /cannot access questionBank search/i,
  );
});

test("assertQueryPattern enforces deterministic domain query patterns", () => {
  searchArchitectureService.assertQueryPattern(
    "questionBank",
    "difficulty_subject",
  );

  assert.throws(
    () =>
      searchArchitectureService.assertQueryPattern(
        "students",
        "difficulty_subject",
      ),
    /unsupported students search query pattern/i,
  );
});

test(
  "vendor aggregate search is isolated from institute-scoped collections",
  () => {
    const result = searchArchitectureService.initializeDomain({
      actorRole: "vendor",
      domain: "vendorAggregates",
    });

    assert.equal(result.collectionPath, "vendorAggregates");
    assert.equal(result.definition.usesSummaryCollectionsOnly, true);
  },
);
