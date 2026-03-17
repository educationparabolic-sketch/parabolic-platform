import {logger} from "firebase-functions";
import {EnvironmentConfig, RuntimeEnvironment} from "../types/environment";

const ALLOWED_ENVS: ReadonlySet<RuntimeEnvironment> = new Set([
  "development",
  "staging",
  "production",
  "test",
]);

const DEFAULT_ENDPOINTS = {
  appBaseUrl: "http://localhost:5173",
  examBaseUrl: "http://localhost:4173",
  vendorBaseUrl: "http://localhost:6173",
} as const;

const getOptionalEnv = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value && value.length > 0 ? value : undefined;
};

const getRequiredEnv = (key: string): string => {
  const value = getOptionalEnv(key);
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

const parseNodeEnv = (value: string | undefined): RuntimeEnvironment => {
  if (!value) {
    return "development";
  }

  if (ALLOWED_ENVS.has(value as RuntimeEnvironment)) {
    return value as RuntimeEnvironment;
  }

  const allowedValues = Array.from(ALLOWED_ENVS).join(", ");
  throw new Error(
    `Invalid NODE_ENV value: ${value}. Expected one of ${allowedValues}`,
  );
};

export const loadEnvironmentConfig = (): EnvironmentConfig => {
  const nodeEnv = parseNodeEnv(getOptionalEnv("NODE_ENV"));
  const projectId = getRequiredEnv("PROJECT_ID");

  const config: EnvironmentConfig = {
    nodeEnv,
    projectId,
    endpoints: {
      appBaseUrl:
        getOptionalEnv("APP_BASE_URL") ?? DEFAULT_ENDPOINTS.appBaseUrl,
      examBaseUrl:
        getOptionalEnv("EXAM_BASE_URL") ?? DEFAULT_ENDPOINTS.examBaseUrl,
      vendorBaseUrl:
        getOptionalEnv("VENDOR_BASE_URL") ?? DEFAULT_ENDPOINTS.vendorBaseUrl,
    },
    secrets: {
      stripeSecretKey: getOptionalEnv("STRIPE_SECRET_KEY"),
      stripeWebhookSecret: getOptionalEnv("STRIPE_WEBHOOK_SECRET"),
      aiApiKey: getOptionalEnv("AI_API_KEY"),
      emailProviderKey: getOptionalEnv("EMAIL_PROVIDER_KEY"),
    },
  };

  logger.info("Environment configuration loaded", {
    nodeEnv: config.nodeEnv,
    projectId: config.projectId,
    endpoints: config.endpoints,
    configuredSecrets: Object.entries(config.secrets)
      .filter(([, value]) => Boolean(value))
      .map(([key]) => key),
  });

  return config;
};
