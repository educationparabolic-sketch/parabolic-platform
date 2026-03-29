import assert from "node:assert/strict";
import test from "node:test";
import {indexedQueryValidationService}
  from "../services/indexedQueryValidation";

test("indexed query validation returns matched governance metadata", () => {
  const validatedPlan = indexedQueryValidationService.assertIndexedQuery({
    collectionPath: "institutes/inst_build_60/students",
    filterFields: ["batchId"],
    limit: 25,
    orderByFields: ["studentId"],
    paginationMode: "cursor",
    policyId: "studentsBatchSearch",
  });

  assert.equal(validatedPlan.matchedPatternId, "batch_studentId");
  assert.equal(validatedPlan.policy.policyId, "studentsBatchSearch");
});

test("indexed query validation rejects unbounded query plans", () => {
  assert.throws(
    () =>
      indexedQueryValidationService.assertIndexedQuery({
        collectionPath: "institutes/inst_build_60/students",
        filterFields: [],
        limit: 25,
        orderByFields: ["studentId"],
        paginationMode: "cursor",
        policyId: "studentsBatchSearch",
      }),
    /collection scans/i,
  );
});
