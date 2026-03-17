export type RuntimeEnvironment =
  "development" | "staging" | "production" | "test";

export interface ServiceEndpoints {
  appBaseUrl: string;
  examBaseUrl: string;
  vendorBaseUrl: string;
}

export interface EnvironmentConfig {
  nodeEnv: RuntimeEnvironment;
  projectId: string;
  endpoints: ServiceEndpoints;
  secrets: {
    stripeSecretKey?: string;
    stripeWebhookSecret?: string;
    aiApiKey?: string;
    emailProviderKey?: string;
  };
}
