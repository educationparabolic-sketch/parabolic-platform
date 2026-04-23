import type {
  FrontendEnvironment,
  FrontendEnvironmentValidationResult,
} from "../types/frontendEnvironment";

const REQUIRED_ENV_KEYS = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_APP_ID",
] as const;

type RequiredEnvKey = (typeof REQUIRED_ENV_KEYS)[number];

function readEnvValue(key: string): string {
  const value = import.meta.env[key as keyof ImportMetaEnv];

  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function readRequiredValue(key: RequiredEnvKey): string {
  return readEnvValue(key);
}

function readOptionalUrlValue(key: string): string | undefined {
  const value = readEnvValue(key);
  if (!value) {
    return undefined;
  }

  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function validateFrontendEnvironment(): FrontendEnvironmentValidationResult {
  const missingKeys = REQUIRED_ENV_KEYS.filter((key) => readRequiredValue(key).length === 0);

  return {
    isConfigured: missingKeys.length === 0,
    missingKeys,
  };
}

export function getFrontendEnvironment(): FrontendEnvironment {
  return {
    mode: import.meta.env.MODE,
    firebaseApiKey: readRequiredValue("VITE_FIREBASE_API_KEY"),
    firebaseAuthDomain: readRequiredValue("VITE_FIREBASE_AUTH_DOMAIN"),
    firebaseProjectId: readRequiredValue("VITE_FIREBASE_PROJECT_ID"),
    firebaseAppId: readRequiredValue("VITE_FIREBASE_APP_ID"),
    firebaseStorageBucket: readEnvValue("VITE_FIREBASE_STORAGE_BUCKET") || undefined,
    firebaseMessagingSenderId: readEnvValue("VITE_FIREBASE_MESSAGING_SENDER_ID") || undefined,
    firebaseMeasurementId: readEnvValue("VITE_FIREBASE_MEASUREMENT_ID") || undefined,
    apiBaseUrl: readOptionalUrlValue("VITE_API_BASE_URL"),
    cdnBaseUrl: readOptionalUrlValue("VITE_CDN_BASE_URL"),
    portalBaseUrl: readOptionalUrlValue("VITE_PORTAL_BASE_URL"),
    examBaseUrl: readOptionalUrlValue("VITE_EXAM_BASE_URL"),
    vendorBaseUrl: readOptionalUrlValue("VITE_VENDOR_BASE_URL"),
  };
}
