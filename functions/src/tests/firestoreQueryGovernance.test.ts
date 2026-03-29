import assert from "node:assert/strict";
import test from "node:test";
import {firestoreQueryGovernanceService}
  from "../services/firestoreQueryGovernance";

test("question-bank search policy accepts approved indexed query plans", () => {
  assert.doesNotThrow(() =>
    firestoreQueryGovernanceService.assertQueryPlan({
      collectionPath: "institutes/inst_build_56/questionBank",
      filterFields: ["difficulty", "subject"],
      limit: 25,
      orderByFields: ["createdAt", "questionId"],
      paginationMode: "cursor",
      policyId: "questionBankSearch",
    }),
  );
});

test(
  "query governance rejects non-institute paths for institute policies",
  () => {
    assert.throws(
      () =>
        firestoreQueryGovernanceService.assertQueryPlan({
          collectionPath: "questionBank",
          filterFields: ["difficulty", "subject"],
          limit: 25,
          orderByFields: ["createdAt", "questionId"],
          paginationMode: "cursor",
          policyId: "questionBankSearch",
        }),
      /not approved/i,
    );
  },
);

test("query governance rejects collection scans on governed queries", () => {
  assert.throws(
    () =>
      firestoreQueryGovernanceService.assertQueryPlan({
        collectionPath: "institutes/inst_build_56/students",
        filterFields: [],
        limit: 10,
        orderByFields: ["studentId"],
        paginationMode: "cursor",
        policyId: "studentsBatchSearch",
      }),
    /disallows collection scans/i,
  );
});

test("query governance rejects unindexed filter and orderBy fields", () => {
  assert.throws(
    () =>
      firestoreQueryGovernanceService.assertQueryPlan({
        collectionPath:
          "institutes/inst_build_56/academicYears/2026/studentYearMetrics",
        filterFields: ["batchId"],
        limit: 10,
        orderByFields: ["studentId"],
        paginationMode: "cursor",
        policyId: "studentYearMetricsSearch",
      }),
    /filter field "batchId" is not indexed/i,
  );

  assert.throws(
    () =>
      firestoreQueryGovernanceService.assertQueryPlan({
        collectionPath: "institutes/inst_build_56/questionBank",
        filterFields: ["primaryTag"],
        limit: 10,
        orderByFields: ["lastUsedAt"],
        paginationMode: "cursor",
        policyId: "questionBankSearch",
      }),
    /orderBy field "lastUsedAt" is not indexed/i,
  );
});

test("autocomplete policies allow bounded non-cursor query plans", () => {
  assert.doesNotThrow(() =>
    firestoreQueryGovernanceService.assertQueryPlan({
      collectionPath: "institutes/inst_build_56/tagDictionary",
      filterFields: ["tagName"],
      limit: 10,
      orderByFields: ["tagName"],
      paginationMode: "bounded-list",
      policyId: "tagDictionaryAutocomplete",
    }),
  );

  assert.throws(
    () =>
      firestoreQueryGovernanceService.assertQueryPlan({
        collectionPath: "institutes/inst_build_56/tagDictionary",
        filterFields: ["tagName"],
        limit: 10,
        orderByFields: ["tagName"],
        paginationMode: "cursor",
        policyId: "tagDictionaryAutocomplete",
      }),
    /pagination mode/i,
  );
});
