export type FrontendDataMode = "live" | "fixture";

export function resolveFrontendDataMode(value: unknown): FrontendDataMode {
  return typeof value === "string" && value.trim().toLowerCase() === "fixture" ? "fixture" : "live";
}

export interface FrontendEnvironment {
  mode: string;
  dataMode: FrontendDataMode;
  firebaseApiKey: string;
  firebaseAuthDomain: string;
  firebaseProjectId: string;
  firebaseAppId: string;
  firebaseStorageBucket?: string;
  firebaseMessagingSenderId?: string;
  firebaseMeasurementId?: string;
  apiBaseUrl?: string;
  cdnBaseUrl?: string;
  portalBaseUrl?: string;
  examBaseUrl?: string;
  vendorBaseUrl?: string;
  examDevMockEntry?: boolean;
  release: FrontendReleaseMetadata;
}

export interface FrontendReleaseMetadata {
  id: string;
  commitSha: string;
  builtAt: string;
}

export interface FrontendEnvironmentValidationResult {
  isConfigured: boolean;
  missingKeys: string[];
}
