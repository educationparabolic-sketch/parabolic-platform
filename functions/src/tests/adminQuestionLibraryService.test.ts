import assert from "node:assert/strict";
import test from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import {AdminQuestionLibraryService} from "../services/adminQuestionLibrary";

function createFirestoreMock(): FirebaseFirestore.Firestore {
  const questionDocuments = [
    {
      data: () => ({
        chapter: "Kinematics",
        createdAt: Timestamp.fromDate(new Date("2026-05-10T00:00:00.000Z")),
        difficulty: "Easy",
        academicYear: "2026-27",
        additionalTag: "jee-main",
        examType: "JEEMains",
        lastUsedAt: Timestamp.fromDate(new Date("2026-05-10T08:30:00.000Z")),
        marks: 4,
        negativeMarks: 1,
        primaryTag: "motion",
        questionId: "q-001",
        questionType: "MCQ",
        status: "active",
        subject: "Physics",
        tags: ["motion", "basics"],
        uniqueKey: "PH-KIN-001",
        usedCount: 4,
        version: 2,
      }),
      id: "q-001",
    },
    {
      data: () => ({
        chapter: "Thermodynamics",
        createdAt: Timestamp.fromDate(new Date("2025-12-01T00:00:00.000Z")),
        difficulty: "Hard",
        examType: "NEET",
        lastUsedAt: Timestamp.fromDate(new Date("2024-01-01T00:00:00.000Z")),
        marks: 4,
        negativeMarks: 1,
        questionId: "q-002",
        questionType: "Integer",
        status: "archived",
        subject: "Chemistry",
        tags: ["thermo"],
        uniqueKey: "CH-THM-002",
        usedCount: 0,
        version: 1,
      }),
      id: "q-002",
    },
  ];

  return {
    collection: () => ({
      doc: () => ({
        collection: () => ({
          limit: () => ({
            get: async () => ({
              docs: questionDocuments,
            }),
          }),
          orderBy: () => ({
            limit: () => ({
              get: async () => ({
                docs: questionDocuments,
              }),
            }),
          }),
        }),
      }),
    }),
  } as never;
}

test("admin question library service maps persisted question records", async () => {
  const service = new AdminQuestionLibraryService(createFirestoreMock());

  const result = await service.getLibrary({
    instituteId: "inst_build_m5",
    limit: 25,
  });

  assert.equal(result.questions.length, 2);
  assert.deepEqual(result.questions[0], {
    academicYear: "2026-27",
    additionalTag: "jee-main",
    chapter: "Kinematics",
    difficulty: "easy",
    examType: "JEEMains",
    id: "q-001",
    lastUsedDate: "2026-05-10",
    marks: 4,
    negativeMarks: 1,
    primaryTag: "motion",
    prompt: "Physics Kinematics MCQ",
    questionType: "MCQ",
    secondaryTag: "basics",
    status: "active",
    subject: "Physics",
    thermalState: "hot",
    uniqueKey: "PH-KIN-001",
    usedCount: 4,
    version: 2,
  });
  assert.equal(result.questions[1]?.status, "archived");
  assert.equal(result.questions[1]?.thermalState, "cold");
  assert.equal(result.questions[1]?.secondaryTag, "none");
  assert.equal(result.questions[1]?.academicYear, "unassigned");
  assert.equal(result.questions[1]?.additionalTag, "none");
  assert.equal(result.questions[1]?.lastUsedDate, "2024-01-01");
});
