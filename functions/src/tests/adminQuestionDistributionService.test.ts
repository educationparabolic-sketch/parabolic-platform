import assert from "node:assert/strict";
import test from "node:test";
import {AdminQuestionDistributionService} from "../services/adminQuestionDistribution";

function createFirestoreMock(): FirebaseFirestore.Firestore {
  const questionDocuments = [
    {
      data: () => ({
        chapter: "Kinematics",
        difficulty: "Easy",
        examType: "JEEMains",
        marks: 4,
        status: "active",
        subject: "Physics",
      }),
      id: "q-001",
    },
    {
      data: () => ({
        chapter: "Kinematics",
        difficulty: "Medium",
        examType: "JEEMains",
        marks: 4,
        status: "used",
        subject: "Physics",
      }),
      id: "q-002",
    },
    {
      data: () => ({
        chapter: "Thermodynamics",
        difficulty: "Hard",
        examType: "JEEMains",
        marks: 4,
        status: "active",
        subject: "Chemistry",
      }),
      id: "q-003",
    },
    {
      data: () => ({
        chapter: "Legacy",
        difficulty: "Hard",
        examType: "JEEMains",
        marks: 4,
        status: "deprecated",
        subject: "Physics",
      }),
      id: "q-004",
    },
  ];

  const analyticsByPath: Record<string, Record<string, unknown>> = {
    "institutes/inst_build_m5/questionAnalytics/q-001": {
      disciplineStressIndex: 10,
      guessRate: 20,
      overstayRate: 5,
      riskImpactScore: 12,
    },
    "institutes/inst_build_m5/questionAnalytics/q-002": {
      disciplineStressIndex: 30,
      guessRate: 15,
      overstayRate: 25,
      riskImpactScore: 28,
    },
    "institutes/inst_build_m5/questionAnalytics/q-003": {
      disciplineStressIndex: 60,
      guessRate: 8,
      overstayRate: 40,
      riskImpactScore: 72,
    },
  };

  return {
    collection: () => ({
      doc: () => ({
        collection: () => ({
          get: async () => ({
            docs: questionDocuments,
          }),
        }),
      }),
    }),
    doc: (path: string) => ({
      id: path.split("/")[path.split("/").length - 1] ?? "",
      path,
    }),
    getAll: async (...references: Array<{id: string; path: string}>) =>
      references.map((reference) => {
        const data = analyticsByPath[reference.path];

        return {
          data: () => data,
          exists: Boolean(data),
          id: reference.id,
        };
      }),
  } as never;
}

test("admin question distribution service aggregates question bank analytics", async () => {
  const service = new AdminQuestionDistributionService(createFirestoreMock());

  const summary = await service.getDistributionSummary({
    instituteId: "inst_build_m5",
    limit: 5,
  });

  assert.equal(summary.totalQuestions, 3);
  assert.equal(summary.examType, "JEEMains");
  assert.equal(summary.missingDifficultyWarnings, 0);
  assert.equal(summary.difficulties[0]?.difficulty, "Easy");
  assert.equal(summary.difficulties[0]?.sharePercent, 33.33);
  assert.equal(summary.difficulties[1]?.difficulty, "Medium");
  assert.equal(summary.difficulties[2]?.difficulty, "Hard");
  assert.equal(summary.chapters.length, 2);
  assert.equal(summary.chapters[0]?.chapter, "Kinematics");
  assert.equal(summary.chapters[0]?.questionCount, 2);
  assert.equal(summary.chapters[0]?.riskImpactScore, 20);
  assert.equal(summary.chapters[1]?.chapter, "Thermodynamics");
  assert.equal(summary.chapters[1]?.disciplineStressIndex, 60);
});
