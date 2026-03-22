import assert from "node:assert/strict";
import test from "node:test";
import {chapterDictionaryService} from "../services/chapterDictionary";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-15-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;

const firestore = getFirestore();

test.after(async () => {
  await getFirebaseAdminApp().delete();
});

const deleteDocumentIfPresent = async (path: string): Promise<void> => {
  const documentReference = firestore.doc(path);
  const snapshot = await documentReference.get();

  if (snapshot.exists) {
    await documentReference.delete();
  }
};

test(
  "incrementUsageCount stores and increments institute chapter " +
    "dictionary usage",
  async () => {
    const instituteId = "inst_build_15";
    const chapterPath =
      `institutes/${instituteId}/chapterDictionary/motion%20laws`;

    await deleteDocumentIfPresent(chapterPath);

    const firstResult = await chapterDictionaryService.incrementUsageCount({
      chapterName: " Motion  Laws ",
      instituteId,
      subject: " Physics ",
    });

    assert.equal(firstResult.entry.path, chapterPath);
    assert.equal(firstResult.entry.chapterName, "motion laws");
    assert.equal(firstResult.entry.subject, "physics");
    assert.equal(firstResult.entry.usageCount, 1);

    const secondResult = await chapterDictionaryService.incrementUsageCount({
      chapterName: "motion laws",
      instituteId,
      subject: "physics",
    });

    assert.equal(secondResult.entry.path, chapterPath);
    assert.equal(secondResult.entry.usageCount, 2);

    const chapterSnapshot = await firestore.doc(chapterPath).get();

    assert.equal(chapterSnapshot.data()?.chapterName, "motion laws");
    assert.equal(chapterSnapshot.data()?.subject, "physics");
    assert.equal(chapterSnapshot.data()?.usageCount, 2);

    await deleteDocumentIfPresent(chapterPath);
  },
);

test("incrementUsageCount rejects invalid input", async () => {
  await assert.rejects(
    chapterDictionaryService.incrementUsageCount({
      chapterName: "Motion",
      instituteId: "   ",
      subject: "Physics",
    }),
    (error: unknown) => {
      assert.match(String(error), /instituteId/i);
      return true;
    },
  );

  await assert.rejects(
    chapterDictionaryService.incrementUsageCount({
      chapterName: "   ",
      instituteId: "inst_build_15_validation",
      subject: "Physics",
    }),
    (error: unknown) => {
      assert.match(String(error), /chapterName/i);
      return true;
    },
  );

  await assert.rejects(
    chapterDictionaryService.incrementUsageCount({
      chapterName: "Motion",
      instituteId: "inst_build_15_validation",
      subject: "   ",
    }),
    (error: unknown) => {
      assert.match(String(error), /subject/i);
      return true;
    },
  );
});
