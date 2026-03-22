import assert from "node:assert/strict";
import test from "node:test";
import {searchTokenIndexService} from "../services/searchTokenIndex";

test(
  "generateTokens includes subject, chapter, tags, and question text keywords",
  () => {
    const result = searchTokenIndexService.generateTokens({
      chapter: "Motion Laws",
      questionTextKeywords: ["Relative Velocity", " acceleration "],
      subject: "Physics",
      tags: ["kinematics", "velocity"],
    });

    assert.deepEqual(result.searchTokens, [
      "acceleration",
      "kinematics",
      "laws",
      "motion",
      "physics",
      "relative",
      "velocity",
    ]);
  },
);

test("generateTokens removes duplicates and normalizes casing", () => {
  const result = searchTokenIndexService.generateTokens({
    chapter: "Current Electricity",
    questionTextKeywords: ["Voltage Drop", "voltage"],
    subject: "Physics",
    tags: [" Voltage ", "circuits", "Circuits"],
  });

  assert.deepEqual(result.searchTokens, [
    "circuits",
    "current",
    "drop",
    "electricity",
    "physics",
    "voltage",
  ]);
});
