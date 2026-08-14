/* eslint-disable require-jsdoc, @typescript-eslint/no-var-requires */
"use strict";

const assert = require("node:assert/strict");
const {randomUUID} = require("node:crypto");
const {deleteApp, initializeApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {getFirestore} = require("firebase-admin/firestore");

const projectId = "demo-parabolic-test";
async function main() {
  const app = initializeApp({projectId}, `failure-cleanup-${Date.now()}`);
  const auth = getAuth(app);
  const firestore = getFirestore(app);
  const uid = `failure_cleanup_${randomUUID()}`;
  const document = firestore.doc(`emulatorFailureCleanup/${uid}`);

  assert.equal(process.env.GCLOUD_PROJECT, projectId);
  assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST);
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST);

  try {
    await auth.createUser({uid});
    await document.set({marker: "intentional-failure"});
  } finally {
    await Promise.allSettled([auth.deleteUser(uid), document.delete()]);
  }

  await assert.rejects(
    auth.getUser(uid),
    (error) => error?.code === "auth/user-not-found",
  );
  assert.equal((await document.get()).exists, false);
  await deleteApp(app);

  console.error(
    "Intentional emulator cleanup probe failure after verified data removal.",
  );
  process.exit(23);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
