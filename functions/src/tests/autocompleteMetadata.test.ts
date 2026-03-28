import assert from "node:assert/strict";
import test from "node:test";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {
  ChapterAutocompleteRequest,
  TagAutocompleteRequest,
} from "../types/autocompleteMetadata";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-55-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";

const firestore = getFirestore();
const instituteId = "inst_build_55";

const tagPaths = [
  `institutes/${instituteId}/tagDictionary/algebra`,
  `institutes/${instituteId}/tagDictionary/algorithms`,
  `institutes/${instituteId}/tagDictionary/biology`,
];

const chapterPaths = [
  `institutes/${instituteId}/chapterDictionary/algebraic%20identities`,
  `institutes/${instituteId}/chapterDictionary/alternating%20current`,
  `institutes/${instituteId}/chapterDictionary/atoms`,
];

const deleteDocumentIfPresent = async (path: string): Promise<void> => {
  const snapshot = await firestore.doc(path).get();

  if (snapshot.exists) {
    await firestore.doc(path).delete();
  }
};

const seedAutocompleteMetadata = async (): Promise<void> => {
  await Promise.all([
    firestore.doc(tagPaths[0]).set({
      tagName: "algebra",
      usageCount: 7,
    }),
    firestore.doc(tagPaths[1]).set({
      tagName: "algorithms",
      usageCount: 4,
    }),
    firestore.doc(tagPaths[2]).set({
      tagName: "biology",
      usageCount: 9,
    }),
    firestore.doc(chapterPaths[0]).set({
      chapterName: "algebraic identities",
      subject: "mathematics",
      usageCount: 6,
    }),
    firestore.doc(chapterPaths[1]).set({
      chapterName: "alternating current",
      subject: "physics",
      usageCount: 5,
    }),
    firestore.doc(chapterPaths[2]).set({
      chapterName: "atoms",
      subject: "chemistry",
      usageCount: 3,
    }),
  ]);
};

let autocompleteMetadataService: {
  getChapterSuggestions: (
    request: ChapterAutocompleteRequest,
  ) => ReturnType<
    typeof import(
      "../services/autocompleteMetadata"
    ).autocompleteMetadataService.getChapterSuggestions
  >;
  getTagSuggestions: (
    request: TagAutocompleteRequest,
  ) => ReturnType<
    typeof import(
      "../services/autocompleteMetadata"
    ).autocompleteMetadataService.getTagSuggestions
  >;
};

test.before(async () => {
  const module = await import("../services/autocompleteMetadata.js");
  autocompleteMetadataService = module.autocompleteMetadataService;

  await Promise.all(
    [...tagPaths, ...chapterPaths].map((path) =>
      deleteDocumentIfPresent(path),
    ),
  );
  await seedAutocompleteMetadata();
});

test.after(async () => {
  await Promise.all(
    [...tagPaths, ...chapterPaths].map((path) =>
      deleteDocumentIfPresent(path),
    ),
  );
  await getFirebaseAdminApp().delete();
});

test("getTagSuggestions returns normalized prefix matches", async () => {
  const result = await autocompleteMetadataService.getTagSuggestions({
    actorRole: "teacher",
    instituteId,
    limit: 5,
    query: " AlG ",
  });

  assert.deepEqual(
    result.suggestions.map((suggestion) => suggestion.tagName),
    ["algebra", "algorithms"],
  );
  assert.deepEqual(
    result.suggestions.map((suggestion) => suggestion.usageCount),
    [7, 4],
  );
});

test("getChapterSuggestions filters by prefix and subject", async () => {
  const result = await autocompleteMetadataService.getChapterSuggestions({
    actorRole: "admin",
    instituteId,
    limit: 5,
    query: "al",
    subject: "Physics",
  });

  assert.deepEqual(
    result.suggestions.map((suggestion) => suggestion.chapterName),
    ["alternating current"],
  );
  assert.deepEqual(
    result.suggestions.map((suggestion) => suggestion.subject),
    ["physics"],
  );
});

test("autocomplete metadata rejects disallowed roles", async () => {
  await assert.rejects(
    autocompleteMetadataService.getTagSuggestions({
      actorRole: "student",
      instituteId,
      query: "alg",
    }),
    (error: unknown) => {
      assert.match(String(error), /cannot access autocomplete metadata/i);
      return true;
    },
  );
});

test("autocomplete metadata validates required query text", async () => {
  await assert.rejects(
    autocompleteMetadataService.getChapterSuggestions({
      actorRole: "internal",
      instituteId,
      query: "   ",
    }),
    (error: unknown) => {
      assert.match(String(error), /query/i);
      return true;
    },
  );
});
