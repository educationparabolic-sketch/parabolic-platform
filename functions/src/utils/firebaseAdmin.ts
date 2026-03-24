import * as admin from "firebase-admin";

let firebaseApp: admin.app.App | undefined;

const resolveProjectId = (): string | undefined => {
  const directProjectId =
    process.env.GOOGLE_CLOUD_PROJECT?.trim() ||
    process.env.GCLOUD_PROJECT?.trim() ||
    process.env.PROJECT_ID?.trim();

  if (directProjectId) {
    return directProjectId;
  }

  const firebaseConfig = process.env.FIREBASE_CONFIG?.trim();

  if (!firebaseConfig) {
    return undefined;
  }

  try {
    const parsedConfig = JSON.parse(firebaseConfig) as {projectId?: unknown};
    const projectId = typeof parsedConfig.projectId === "string" ?
      parsedConfig.projectId.trim() :
      "";

    return projectId || undefined;
  } catch {
    return undefined;
  }
};

const initializeFirebaseApp = (): admin.app.App => {
  if (firebaseApp) {
    return firebaseApp;
  }

  const projectId = resolveProjectId();

  firebaseApp = admin.apps.length > 0 ?
    admin.app() :
    admin.initializeApp(projectId ? {projectId} : undefined);

  return firebaseApp;
};

export const getFirebaseAdminApp = (): admin.app.App =>
  initializeFirebaseApp();

export const getFirestore = (): FirebaseFirestore.Firestore =>
  getFirebaseAdminApp().firestore();
