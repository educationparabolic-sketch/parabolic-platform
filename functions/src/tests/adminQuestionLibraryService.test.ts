import assert from "node:assert/strict";
import test from "node:test";
import {AdminQuestionLibraryService} from "../services/adminQuestionLibrary";

const service = new AdminQuestionLibraryService({} as never);

test("admin question library normalizes governed indexed query shapes", () => {
  const request = service.normalizeRequest({
    actorId: "teacher-1",
    actorRole: "teacher",
    cursor: "cursor-value",
    examType: "JEE",
    instituteId: "inst-1",
    limit: "25",
    subject: "Physics",
  });
  assert.deepEqual(request, {
    actorId: "teacher-1",
    actorRole: "teacher",
    cursor: "cursor-value",
    examType: "JEE",
    instituteId: "inst-1",
    limit: 25,
    subject: "Physics",
  });
});

test("admin question library rejects unindexed filter combinations", () => {
  assert.throws(() => service.normalizeRequest({
    actorId: "teacher-1",
    actorRole: "teacher",
    chapter: "Motion",
    difficulty: "Hard",
    instituteId: "inst-1",
    subject: "Physics",
  }), /accepts one indexed filter/u);
  assert.throws(() => service.normalizeRequest({
    actorId: "teacher-1",
    actorRole: "teacher",
    instituteId: "inst-1",
    limit: 101,
  }), /between 1 and 100/u);
  assert.throws(() => service.normalizeRequest({
    actorId: "teacher-1",
    actorRole: "teacher",
    instituteId: "inst-1",
    query: "two tokens",
  }), /exactly one indexed search token/u);
});
