import assert from "node:assert/strict";
import test from "node:test";
import {AdminQuestionDistributionService} from
  "../services/adminQuestionDistribution";

const service = new AdminQuestionDistributionService({} as never);

test("admin question distribution normalizes bounded projection reads", () => {
  assert.deepEqual(service.normalizeRequest({
    examType: "all",
    instituteId: "inst-1",
    limit: "8",
  }), {examType: null, instituteId: "inst-1", limit: 8});
  assert.deepEqual(service.normalizeRequest({
    examType: "NEET",
    instituteId: "inst-1",
    limit: 20,
  }), {examType: "NEET", instituteId: "inst-1", limit: 20});
  assert.throws(() => service.normalizeRequest({
    instituteId: "inst-1",
    limit: 21,
  }), /between 1 and 20/u);
});
