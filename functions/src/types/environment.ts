export type RuntimeEnvironment =
  "development" | "staging" | "production" | "test";

export interface ServiceEndpoints {
  appBaseUrl: string;
  examBaseUrl: string;
  vendorBaseUrl: string;
}

export interface AssetDeliveryConfig {
  buckets: {
    questionAssets: string;
    reports: string;
  };
  cdnBaseUrl: string;
}

export type ManagedSecretKey =
  | "stripeSecretKey"
  | "stripeWebhookSecret"
  | "aiApiKey"
  | "emailProviderKey";

export type SecretSource =
  | "environment"
  | "googleSecretManager"
  | "unconfigured";

export interface SecretDescriptor {
  envVar: string;
  secretNameEnvVar: string;
}

export interface SecretResolutionMetadata extends SecretDescriptor {
  source: SecretSource;
  configuredSecretName?: string;
  resolvedSecretVersion?: string;
}

export interface ManagedSecrets {
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  aiApiKey?: string;
  emailProviderKey?: string;
}

export interface EnvironmentConfig {
  assetDelivery: AssetDeliveryConfig;
  nodeEnv: RuntimeEnvironment;
  projectId: string;
  endpoints: ServiceEndpoints;
  secrets: ManagedSecrets;
  secretMetadata: Record<ManagedSecretKey, SecretResolutionMetadata>;
}
