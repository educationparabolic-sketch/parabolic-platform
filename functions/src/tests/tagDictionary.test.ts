import assert from "node:assert/strict";
import test from "node:test";
import {tagDictionaryService} from "../services/tagDictionary";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-14-tests";
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
  "incrementUsageCounts stores and increments institute tag dictionary usage",
  async () => {
    const instituteId = "inst_build_14";
    const circuitsPath =
      `institutes/${instituteId}/tagDictionary/circuits`;
    const currentPath = `institutes/${instituteId}/tagDictionary/current`;

    await deleteDocumentIfPresent(circuitsPath);
    await deleteDocumentIfPresent(currentPath);

    const firstResult = await tagDictionaryService.incrementUsageCounts({
      instituteId,
      tags: [" Circuits ", "current", "circuits"],
    });

    assert.deepEqual(
      firstResult.entries.map((entry) => entry.path),
      [circuitsPath, currentPath],
    );
    assert.deepEqual(
      firstResult.entries.map((entry) => entry.usageCount),
      [1, 1],
    );

    const secondResult = await tagDictionaryService.incrementUsageCounts({
      instituteId,
      tags: ["current"],
    });

    assert.deepEqual(
      secondResult.entries.map((entry) => entry.path),
      [currentPath],
    );
    assert.deepEqual(
      secondResult.entries.map((entry) => entry.usageCount),
      [2],
    );

    const circuitsSnapshot = await firestore.doc(circuitsPath).get();
    const currentSnapshot = await firestore.doc(currentPath).get();

    assert.equal(circuitsSnapshot.data()?.tagName, "circuits");
    assert.equal(circuitsSnapshot.data()?.usageCount, 1);
    assert.equal(currentSnapshot.data()?.tagName, "current");
    assert.equal(currentSnapshot.data()?.usageCount, 2);

    await deleteDocumentIfPresent(circuitsPath);
    await deleteDocumentIfPresent(currentPath);
  },
);

test("incrementUsageCounts rejects invalid input", async () => {
  await assert.rejects(
    tagDictionaryService.incrementUsageCounts({
      instituteId: "   ",
      tags: ["kinematics"],
    }),
    (error: unknown) => {
      assert.match(String(error), /instituteId/i);
      return true;
    },
  );

  await assert.rejects(
    tagDictionaryService.incrementUsageCounts({
      instituteId: "inst_build_14_validation",
      tags: ["  "],
    }),
    (error: unknown) => {
      assert.match(String(error), /tags\[\]/i);
      return true;
    },
  );
});
