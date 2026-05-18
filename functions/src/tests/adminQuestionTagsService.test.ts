import assert from "node:assert/strict";
import test from "node:test";
import {Timestamp} from "firebase-admin/firestore";
import {AdminQuestionTagsService} from "../services/adminQuestionTags";

function createReadOnlyFirestoreMock(): FirebaseFirestore.Firestore {
  const questionDocuments = [
    {
      data: () => ({
        primaryTag: "motion",
        status: "active",
        tags: ["motion", "basics"],
        usedCount: 2,
      }),
      id: "q-001",
    },
    {
      data: () => ({
        primaryTag: "algebra",
        status: "deprecated",
        tags: ["algebra"],
        usedCount: 0,
      }),
      id: "q-002",
    },
  ];
  const tagDocuments = [
    {
      data: () => ({
        status: "active",
        tagName: "fresh-tag",
        updatedAt: Timestamp.fromDate(new Date("2026-05-18T00:00:00.000Z")),
      }),
      id: "fresh-tag",
    },
  ];

  return {
    collection: () => ({
      doc: () => ({
        collection: (name: string) => ({
          get: async () => ({
            docs: name === "questionBank" ? questionDocuments : tagDocuments,
          }),
        }),
      }),
    }),
  } as never;
}

function createMutableFirestoreMock(): FirebaseFirestore.Firestore {
  const writes: Array<{
    data: Record<string, unknown>;
    kind: "set" | "update";
    path: string;
  }> = [];
  const questionDocuments = [
    {
      data: () => ({
        primaryTag: "motion",
        status: "active",
        tags: ["motion", "basics"],
        usedCount: 0,
      }),
      id: "q-001",
      ref: {path: "institutes/inst_build_m126/questionBank/q-001"},
    },
  ];
  const tagDocuments = [
    {
      data: () => ({
        status: "active",
        tagName: "motion",
        updatedAt: Timestamp.fromDate(new Date("2026-05-18T00:00:00.000Z")),
      }),
      id: "motion",
    },
  ];

  return {
    batch: () => ({
      commit: async () => undefined,
      set: (ref: {path: string}, data: Record<string, unknown>) => {
        writes.push({data, kind: "set", path: ref.path});
      },
      update: (ref: {path: string}, data: Record<string, unknown>) => {
        writes.push({data, kind: "update", path: ref.path});
      },
    }),
    collection: () => ({
      doc: (docId: string) => ({
        collection: (name: string) => ({
          doc: (nestedDocId: string) => ({
            path: `institutes/${docId}/${name}/${nestedDocId}`,
          }),
          get: async () => ({
            docs: name === "questionBank" ? questionDocuments : tagDocuments,
          }),
        }),
      }),
    }),
    _writes: writes,
  } as never;
}

test("admin question tags service merges persisted tag inventory and question coverage", async () => {
  const service = new AdminQuestionTagsService(createReadOnlyFirestoreMock());

  const result = await service.getTags({
    instituteId: "inst_build_m126",
  });

  assert.deepEqual(result.tags, [
    {
      id: "algebra",
      name: "algebra",
      questionCount: 1,
      status: "active",
      usedInActiveTemplate: false,
    },
    {
      id: "basics",
      name: "basics",
      questionCount: 1,
      status: "active",
      usedInActiveTemplate: true,
    },
    {
      id: "fresh-tag",
      name: "fresh-tag",
      questionCount: 0,
      status: "active",
      usedInActiveTemplate: false,
    },
    {
      id: "motion",
      name: "motion",
      questionCount: 1,
      status: "active",
      usedInActiveTemplate: true,
    },
  ]);
});

test("admin question tags service renames persisted tag coverage", async () => {
  const firestore = createMutableFirestoreMock();
  const service = new AdminQuestionTagsService(firestore);

  await service.mutateTags({
    actionType: "rename",
    instituteId: "inst_build_m126",
    primaryTag: "motion",
    secondaryTag: "kinematics",
  });

  const writes = (firestore as never as {_writes: Array<{kind: string; path: string; data: Record<string, unknown>}>})._writes;
  assert.equal(writes.some((write) => write.kind === "update" && write.path.endsWith("/questionBank/q-001")), true);
  assert.equal(writes.some((write) => write.kind === "set" && write.path.endsWith("/tagDictionary/kinematics")), true);
  assert.equal(writes.some((write) => write.kind === "set" && write.path.endsWith("/tagDictionary/motion")), true);
});
