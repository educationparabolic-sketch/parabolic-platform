import {
  ManagedSecretKey,
  ManagedSecrets,
  RuntimeEnvironment,
  SecretResolutionMetadata,
} from "../types/environment";
import {createLogger} from "../services/logging";

interface SecretManagerContext {
  nodeEnv: RuntimeEnvironment;
  projectId: string;
}

interface SecretResolutionResult {
  secrets: ManagedSecrets;
  metadata: Record<ManagedSecretKey, SecretResolutionMetadata>;
}

interface SecretManagerAccessResponse {
  name?: string;
  payload?: {
    data?: string;
  };
}

interface SecretDefinition {
  envVar: string;
  secretNameEnvVar: string;
}

const SECRET_MANAGER_SCOPE =
  "https://www.googleapis.com/auth/cloud-platform";

const SECRET_DEFINITIONS: Record<ManagedSecretKey, SecretDefinition> = {
  stripeSecretKey: {
    envVar: "STRIPE_SECRET_KEY",
    secretNameEnvVar: "STRIPE_SECRET_KEY_SECRET_NAME",
  },
  stripeWebhookSecret: {
    envVar: "STRIPE_WEBHOOK_SECRET",
    secretNameEnvVar: "STRIPE_WEBHOOK_SECRET_NAME",
  },
  aiApiKey: {
    envVar: "AI_API_KEY",
    secretNameEnvVar: "AI_API_KEY_SECRET_NAME",
  },
  emailProviderKey: {
    envVar: "EMAIL_PROVIDER_KEY",
    secretNameEnvVar: "EMAIL_PROVIDER_KEY_SECRET_NAME",
  },
};

const secretCache = new Map<string, Promise<SecretResolutionResult>>();
const logger = createLogger("secretManagerService");

const getOptionalEnv = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value && value.length > 0 ? value : undefined;
};

const isProductionEnvironment = (nodeEnv: RuntimeEnvironment): boolean =>
  nodeEnv === "production";

const getConfiguredSecretName = (
  key: ManagedSecretKey,
): string | undefined => {
  const definition = SECRET_DEFINITIONS[key];
  return (
    getOptionalEnv(definition.secretNameEnvVar) ??
    definition.envVar
  );
};

const buildSecretVersionPath = (
  projectId: string,
  configuredSecretName: string,
): string => {
  if (configuredSecretName.startsWith("projects/")) {
    return configuredSecretName.includes("/versions/") ?
      configuredSecretName :
      `${configuredSecretName}/versions/latest`;
  }

  return "projects/" +
    `${projectId}/secrets/${configuredSecretName}/versions/latest`;
};

const decodeSecretPayload = (
  encodedPayload: string | undefined,
): string | undefined => {
  if (!encodedPayload) {
    return undefined;
  }

  return Buffer.from(encodedPayload, "base64").toString("utf8");
};

const createUnsetMetadata = (
  key: ManagedSecretKey,
  source: SecretResolutionMetadata["source"],
  configuredSecretName?: string,
  resolvedSecretVersion?: string,
): SecretResolutionMetadata => ({
  envVar: SECRET_DEFINITIONS[key].envVar,
  secretNameEnvVar: SECRET_DEFINITIONS[key].secretNameEnvVar,
  source,
  configuredSecretName,
  resolvedSecretVersion,
});

const loadEnvironmentSecrets = (): SecretResolutionResult => {
  const secrets = {} as ManagedSecrets;
  const metadata = {} as Record<ManagedSecretKey, SecretResolutionMetadata>;

  (Object.keys(SECRET_DEFINITIONS) as ManagedSecretKey[]).forEach((key) => {
    const envVar = SECRET_DEFINITIONS[key].envVar;
    const value = getOptionalEnv(envVar);

    secrets[key] = value;
    metadata[key] = createUnsetMetadata(
      key,
      value ? "environment" : "unconfigured",
    );
  });

  return {secrets, metadata};
};

const loadGoogleSecretManagerSecrets = async (
  projectId: string,
): Promise<SecretResolutionResult> => {
  const {GoogleAuth} = await import("google-auth-library");
  const auth = new GoogleAuth({scopes: [SECRET_MANAGER_SCOPE], projectId});
  const client = await auth.getClient();

  const secrets = {} as ManagedSecrets;
  const metadata = {} as Record<ManagedSecretKey, SecretResolutionMetadata>;

  for (const key of Object.keys(SECRET_DEFINITIONS) as ManagedSecretKey[]) {
    const configuredSecretName = getConfiguredSecretName(key);

    if (!configuredSecretName) {
      metadata[key] = createUnsetMetadata(key, "unconfigured");
      continue;
    }

    const secretVersionPath = buildSecretVersionPath(
      projectId,
      configuredSecretName,
    );

    try {
      const response =
        await client.request<SecretManagerAccessResponse>({
          url: `https://secretmanager.googleapis.com/v1/${secretVersionPath}:access`,
          method: "GET",
        });

      const value = decodeSecretPayload(response.data.payload?.data);

      secrets[key] = value;
      metadata[key] = createUnsetMetadata(
        key,
        value ? "googleSecretManager" : "unconfigured",
        configuredSecretName,
        response.data.name,
      );

      if (!value) {
        logger.warn("Secret version returned an empty payload", {
          secretKey: key,
          configuredSecretName,
          secretVersionPath,
        });
      }
    } catch (error) {
      const status = typeof error === "object" &&
        error !== null &&
        "response" in error &&
        typeof error.response === "object" &&
        error.response !== null &&
        "status" in error.response ?
        error.response.status :
        undefined;

      if (status === 404) {
        metadata[key] = createUnsetMetadata(
          key,
          "unconfigured",
          configuredSecretName,
        );

        logger.warn("Configured secret was not found in Secret Manager", {
          secretKey: key,
          configuredSecretName,
          secretVersionPath,
        });
        continue;
      }

      logger.error("Secret Manager lookup failed", {
        secretKey: key,
        configuredSecretName,
        secretVersionPath,
        error,
      });
      throw error;
    }
  }

  return {secrets, metadata};
};

export const loadManagedSecrets = async (
  context: SecretManagerContext,
): Promise<SecretResolutionResult> => {
  const cacheKey = `${context.nodeEnv}:${context.projectId}`;
  const cachedResult = secretCache.get(cacheKey);

  if (cachedResult) {
    return cachedResult;
  }

  const loadPromise = isProductionEnvironment(context.nodeEnv) ?
    loadGoogleSecretManagerSecrets(context.projectId) :
    Promise.resolve(loadEnvironmentSecrets());

  secretCache.set(cacheKey, loadPromise);

  try {
    return await loadPromise;
  } catch (error) {
    secretCache.delete(cacheKey);
    throw error;
  }
};
