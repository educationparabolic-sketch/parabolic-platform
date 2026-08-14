import { FirebaseError, initializeApp, type FirebaseApp, getApps } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { isLoopbackHostname } from "./browserRuntimeEnvironment";
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

function connectConfiguredAuthEmulator(auth: Auth): void {
  const emulatorUrl = import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL?.trim();
  if (!emulatorUrl) {
    return;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(emulatorUrl);
  } catch {
    throw new FirebaseError(
      "frontend/invalid-auth-emulator",
      "VITE_FIREBASE_AUTH_EMULATOR_URL must be an absolute loopback HTTP origin.",
    );
  }

  const emulatorIsLoopback = isLoopbackHostname(parsedUrl.hostname);
  const browserIsLoopback = isLoopbackHostname(window.location.hostname);
  const containsOriginOnly =
    !parsedUrl.username &&
    !parsedUrl.password &&
    (parsedUrl.pathname === "/" || parsedUrl.pathname === "") &&
    !parsedUrl.search &&
    !parsedUrl.hash;

  if (
    parsedUrl.protocol !== "http:" ||
    !emulatorIsLoopback ||
    !browserIsLoopback ||
    !containsOriginOnly
  ) {
    throw new FirebaseError(
      "frontend/invalid-auth-emulator",
      "Firebase Auth emulator connections are allowed only between loopback origins.",
    );
  }

  connectAuthEmulator(auth, parsedUrl.origin, { disableWarnings: true });
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
  const auth = getAuth(app);
  connectConfiguredAuthEmulator(auth);

  firebaseClient = {
    app,
    auth,
  };

  return firebaseClient;
}

export function getFirebaseAuth(): Auth {
  return ensureFirebaseClient().auth;
}
