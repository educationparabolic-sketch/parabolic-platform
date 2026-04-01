import {EnvironmentConfig, RuntimeEnvironment} from "../types/environment";
import {
  DEFAULT_CDN_BASE_URL,
  DEFAULT_QUESTION_ASSETS_BUCKET,
  DEFAULT_REPORTS_BUCKET,
} from "../services/cdnArchitecture";
import {createLogger} from "../services/logging";
import {loadManagedSecrets} from "./secrets";

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

const DEFAULT_ASSET_DELIVERY = {
  cdnBaseUrl: DEFAULT_CDN_BASE_URL,
  questionAssetsBucket: DEFAULT_QUESTION_ASSETS_BUCKET,
  reportsBucket: DEFAULT_REPORTS_BUCKET,
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

export const loadEnvironmentConfig = async (): Promise<EnvironmentConfig> => {
  const logger = createLogger("environmentConfigLoader");
  const nodeEnv = parseNodeEnv(getOptionalEnv("NODE_ENV"));
  const projectId = getRequiredEnv("PROJECT_ID");
  const secretResolution = await loadManagedSecrets({nodeEnv, projectId});

  const config: EnvironmentConfig = {
    assetDelivery: {
      buckets: {
        questionAssets:
          getOptionalEnv("QUESTION_ASSETS_BUCKET") ??
          DEFAULT_ASSET_DELIVERY.questionAssetsBucket,
        reports:
          getOptionalEnv("REPORTS_BUCKET") ??
          DEFAULT_ASSET_DELIVERY.reportsBucket,
      },
      cdnBaseUrl:
        getOptionalEnv("CDN_BASE_URL") ?? DEFAULT_ASSET_DELIVERY.cdnBaseUrl,
    },
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
    secrets: secretResolution.secrets,
    secretMetadata: secretResolution.metadata,
  };

  logger.info("Environment configuration loaded", {
    nodeEnv: config.nodeEnv,
    projectId: config.projectId,
    assetDelivery: config.assetDelivery,
    endpoints: config.endpoints,
    configuredSecrets: Object.entries(config.secretMetadata)
      .filter(([, metadata]) => metadata.source !== "unconfigured")
      .map(([key, metadata]) => ({
        key,
        source: metadata.source,
        configuredSecretName: metadata.configuredSecretName,
      })),
  });

  return config;
};
