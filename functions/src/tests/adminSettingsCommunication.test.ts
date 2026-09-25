import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import test from "node:test";
import * as gcpMetadata from "gcp-metadata";
import {Timestamp} from "firebase-admin/firestore";
import {
  AdminSettingsCommunicationService,
  buildAdminSettingsCommunicationDocument,
} from "../services/adminSettingsCommunication";
import {
  EmailDeliveryProvider,
  EmailDeliveryProviderError,
  EmailDeliveryMessage,
} from "../services/emailDeliveryProvider";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.GCLOUD_PROJECT ??= "parabolic-platform-build-125-tests";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();
const auth = getFirebaseAdminApp().auth();
const FIXED_TIME = Timestamp.fromDate(new Date("2026-09-24T08:00:00.000Z"));

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const deleteAuthUserIfPresent = async (uid: string): Promise<void> => {
  try {
    await auth.deleteUser(uid);
  } catch (error) {
    if (!(error instanceof Error && "code" in error &&
      (error as {code?: unknown}).code === "auth/user-not-found")) throw error;
  }
};

test.after(async () => {
  await getFirebaseAdminApp().delete();
});

test("communication worker generates a Firebase action link in memory and deduplicates delivery", async () => {
  const instituteId = "inst_settings_communication";
  const targetUserId = "staff_settings_communication";
  const recipientEmail = "communication@example.test";
  const commandIdHash = sha256(`${instituteId}:communication-command`);
  const document = buildAdminSettingsCommunicationDocument({
    commandIdHash,
    completedAt: FIXED_TIME,
    displayName: "Communication Teacher",
    instituteId,
    kind: "staff_invitation",
    recipientEmail,
    targetUserId,
  });
  const communicationReference = firestore.collection("emailQueue").doc(document.communicationId);
  await communicationReference.delete();
  await firestore.doc(`institutes/${instituteId}`).set({
    profile: {instituteName: "Communication Institute"},
    settingsUsers: {
      [targetUserId]: {
        displayName: "Communication Teacher",
        email: recipientEmail,
        role: "teacher",
        status: "invitation_pending",
      },
    },
  });
  await deleteAuthUserIfPresent(targetUserId);
  await auth.createUser({email: recipientEmail, uid: targetUserId});
  await communicationReference.create(document.data);
  const messages: EmailDeliveryMessage[] = [];
  const provider: EmailDeliveryProvider = {
    send: async (message) => {
      messages.push(message);
      return {providerMessageId: "provider-message-sensitive"};
    },
  };
  const service = new AdminSettingsCommunicationService({
    auth,
    firestore,
    now: () => FIXED_TIME,
    provider,
  });

  assert.equal(await service.processCommunication(document.communicationId), true);
  assert.equal(await service.processCommunication(document.communicationId), false);
  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.recipientEmail, recipientEmail);
  assert.match(messages[0]?.text ?? "", /https?:\/\//);
  assert.match(messages[0]?.text ?? "", /oobCode=/);

  const persisted = (await communicationReference.get()).data() ?? {};
  assert.equal(persisted.status, "sent");
  assert.equal(persisted.retryCount, 0);
  assert.equal(persisted.providerMessageIdHash, sha256("provider-message-sensitive"));
  assert.equal(persisted.nextAttemptAt, null);
  const persistedJson = JSON.stringify(persisted);
  assert.doesNotMatch(persistedJson, /oobCode=|https?:\/\//);
  assert.doesNotMatch(persistedJson, /provider-message-sensitive/);
  assert.deepEqual(await service.loadReceipt(document.communicationId), {
    communicationId: document.communicationId,
    kind: "staff_invitation",
    status: "delivered",
  });

  await communicationReference.delete();
  await firestore.doc(`institutes/${instituteId}`).delete();
  await deleteAuthUserIfPresent(targetUserId);
});

test("communication worker retries transient provider failures with bounded backoff", async () => {
  const instituteId = "inst_settings_communication_retry";
  const targetUserId = "staff_settings_communication_retry";
  const recipientEmail = "retry@example.test";
  const document = buildAdminSettingsCommunicationDocument({
    commandIdHash: sha256(`${instituteId}:retry-command`),
    completedAt: FIXED_TIME,
    displayName: "Retry Teacher",
    instituteId,
    kind: "staff_password_reset",
    recipientEmail,
    targetUserId,
  });
  const communicationReference = firestore.collection("emailQueue").doc(document.communicationId);
  await communicationReference.delete();
  await firestore.doc(`institutes/${instituteId}`).set({
    profile: {instituteName: "Retry Institute"},
    settingsUsers: {
      [targetUserId]: {displayName: "Retry Teacher", email: recipientEmail},
    },
  });
  await deleteAuthUserIfPresent(targetUserId);
  await auth.createUser({email: recipientEmail, uid: targetUserId});
  await communicationReference.create(document.data);
  let now = FIXED_TIME;
  let attempts = 0;
  const provider: EmailDeliveryProvider = {
    send: async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new EmailDeliveryProviderError("provider_http_429", true, "Provider rejected request.");
      }
      return {};
    },
  };
  const service = new AdminSettingsCommunicationService({
    auth,
    firestore,
    now: () => now,
    provider,
  });

  assert.equal(await service.processCommunication(document.communicationId), true);
  let persisted = (await communicationReference.get()).data() ?? {};
  assert.equal(persisted.status, "retrying");
  assert.equal(persisted.retryCount, 1);
  assert.equal(persisted.lastErrorCode, "provider_http_429");
  assert.equal(persisted.nextAttemptAt.toMillis(), FIXED_TIME.toMillis() + 60_000);
  assert.equal(await service.processCommunication(document.communicationId), false);
  now = Timestamp.fromMillis(FIXED_TIME.toMillis() + 60_000);
  assert.equal(await service.processCommunication(document.communicationId), true);
  persisted = (await communicationReference.get()).data() ?? {};
  assert.equal(persisted.status, "sent");
  assert.equal(attempts, 2);

  await communicationReference.delete();
  await firestore.doc(`institutes/${instituteId}`).delete();
  await deleteAuthUserIfPresent(targetUserId);
});
