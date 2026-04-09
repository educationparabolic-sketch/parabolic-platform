import { FirebaseError, initializeApp, type FirebaseApp, getApps } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFrontendEnvironment, validateFrontendEnvironment } from "./frontendEnvironment";

interface FirebaseClient {
  app: FirebaseApp;
  auth: Auth;
}

let firebaseClient: FirebaseClient | null = null;

function buildFirebaseConfig() {
  const environment = getFrontendEnvironment();

  return {
    apiKey: environment.firebaseApiKey,
    authDomain: environment.firebaseAuthDomain,
    projectId: environment.firebaseProjectId,
    appId: environment.firebaseAppId,
    storageBucket: environment.firebaseStorageBucket,
    messagingSenderId: environment.firebaseMessagingSenderId,
    measurementId: environment.firebaseMeasurementId,
  };
}

export function ensureFirebaseClient(): FirebaseClient {
  if (firebaseClient) {
    return firebaseClient;
  }

  const validation = validateFrontendEnvironment();
  if (!validation.isConfigured) {
    throw new FirebaseError(
      "frontend/missing-environment",
      `Missing frontend Firebase environment values: ${validation.missingKeys.join(", ")}`,
    );
  }

  const existingApp = getApps()[0];
  const app = existingApp ?? initializeApp(buildFirebaseConfig());

  firebaseClient = {
    app,
    auth: getAuth(app),
  };

  return firebaseClient;
}

export function getFirebaseAuth(): Auth {
  return ensureFirebaseClient().auth;
}
