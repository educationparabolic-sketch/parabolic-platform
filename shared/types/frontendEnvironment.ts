export interface FrontendEnvironment {
  mode: string;
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
}

export interface FrontendEnvironmentValidationResult {
  isConfigured: boolean;
  missingKeys: string[];
}
