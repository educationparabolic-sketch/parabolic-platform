import { FirebaseError, initializeApp, type FirebaseApp, getApps } from "firebase/app";
import { browserLocalPersistence, connectAuthEmulator, initializeAuth, type Auth } from "firebase/auth";
import { isLoopbackHostname } from "./browserRuntimeEnvironment";
import { getFrontendEnvironment, validateFrontendEnvironment } from "./frontendEnvironment";
import { assertBrowserAuthPersistenceAvailable } from "./browserAuthPersistence";

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

export function ensureFirebaseClient(options: {localPersistence?: boolean} = {localPersistence: true}): FirebaseClient {
  if (options.localPersistence === false) {
    throw new FirebaseError("frontend/unsupported-auth-persistence", "Origin-local Auth persistence is required.");
  }
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
  assertBrowserAuthPersistenceAvailable();
  const app = existingApp ?? initializeApp(buildFirebaseConfig());
  // Every portal must register cross-tab listeners on the persistence it actually uses.
  // Switching from the default IndexedDB backend later can leave stale listeners.
  const auth = initializeAuth(app, {persistence: browserLocalPersistence});
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
