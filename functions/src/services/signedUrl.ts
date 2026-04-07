import {createHmac} from "crypto";
import {
  GenerateQuestionAssetSignedUrlRequest,
  GenerateReportAssetSignedUrlRequest,
  GenerateRestrictedMediaSignedUrlRequest,
  GenerateSignedUrlForCdnPathRequest,
  InitializedSignedUrlService,
  SignedUrlGenerationResult,
  SignedUrlServiceConfig,
} from "../types/signedUrl";
import {
  cdnArchitectureService,
} from "./cdnArchitecture";
import {storageBucketArchitectureService} from "./storageBucketArchitecture";
import {createLogger} from "./logging";

const DEFAULT_SIGNED_URL_KEY_NAME = "cdn-signing-key";
const DASHBOARD_VIEW_EXPIRY_SECONDS = 30 * 60;
const DATA_EXPORT_DOWNLOAD_EXPIRY_SECONDS = 24 * 60 * 60;
const EXAM_SESSION_EXPIRY_SECONDS = 2 * 60 * 60;
const RESERVED_SIGNED_URL_QUERY_PARAMETERS = new Set([
  "Expires",
  "KeyName",
  "Signature",
]);

const normalizeOptionalEnv = (
  value: string | undefined,
): string | undefined => {
  const normalizedValue = value?.trim();
  return normalizedValue ? normalizedValue : undefined;
};

const normalizePositiveInteger = (value: number, fieldName: string): number => {
  if (!Number.isInteger(value) || value < 1) {
    throw new SignedUrlGenerationError(
      `Signed URL field "${fieldName}" must be a positive integer.`,
    );
  }

  return value;
};

const normalizePath = (value: string, fieldName: string): string => {
  const normalizedValue = value.trim().replace(/^\/+/, "");

  if (!normalizedValue) {
    throw new SignedUrlGenerationError(
      `Signed URL field "${fieldName}" must be a non-empty string.`,
    );
  }

  if (normalizedValue.includes("://")) {
    throw new SignedUrlGenerationError(
      `Signed URL field "${fieldName}" must be a CDN path, not a full URL.`,
    );
  }

  return normalizedValue;
};

const buildContextPolicies = () => ({
  dashboardView: {
    accessContext: "dashboardView",
    expiresInSeconds: DASHBOARD_VIEW_EXPIRY_SECONDS,
  },
  dataExportDownload: {
    accessContext: "dataExportDownload",
    expiresInSeconds: DATA_EXPORT_DOWNLOAD_EXPIRY_SECONDS,
  },
  examSession: {
    accessContext: "examSession",
    expiresInSeconds: EXAM_SESSION_EXPIRY_SECONDS,
  },
} as const);

const decodeSigningKey = (value: string): Buffer => {
  try {
    const decoded = Buffer.from(value, "base64url");

    if (decoded.length === 0) {
      throw new Error("empty decoded key");
    }

    return decoded;
  } catch (error) {
    throw new SignedUrlGenerationError(
      "CDN signed URL key must be base64url encoded.",
    );
  }
};

const assertNoReservedSignedQueryParameters = (url: URL): void => {
  for (const parameterName of RESERVED_SIGNED_URL_QUERY_PARAMETERS) {
    if (url.searchParams.has(parameterName)) {
      throw new SignedUrlGenerationError(
        "CDN signed URLs cannot be generated from paths that already include " +
        `"${parameterName}" query parameters.`,
      );
    }
  }
};

/**
 * Raised when signed URL generation input or configuration is invalid.
 */
export class SignedUrlGenerationError extends Error {
  /**
   * @param {string} message Validation or signing failure detail.
   */
  constructor(message: string) {
    super(message);
    this.name = "SignedUrlGenerationError";
  }
}

/**
 * Generates Cloud CDN signed URLs without exposing direct bucket endpoints.
 */
export class SignedUrlService {
  private readonly logger = createLogger("SignedUrlService");

  /**
   * Returns the deterministic signed URL configuration for the platform.
   * @param {SignedUrlServiceConfig} config Optional runtime overrides.
   * @return {InitializedSignedUrlService} Normalized service configuration.
   */
  public initializeService(
    config: SignedUrlServiceConfig = {},
  ): InitializedSignedUrlService {
    const keyName = normalizeOptionalEnv(
      config.signedUrlKeyName ?? process.env.CDN_SIGNED_URL_KEY_NAME,
    ) ?? DEFAULT_SIGNED_URL_KEY_NAME;
    const keyValue = normalizeOptionalEnv(
      config.signedUrlKeyValue ?? process.env.CDN_SIGNED_URL_KEY_VALUE,
    );

    if (!keyValue) {
      throw new SignedUrlGenerationError(
        "Missing required CDN signed URL key environment variable: " +
        "CDN_SIGNED_URL_KEY_VALUE",
      );
    }

    decodeSigningKey(keyValue);

    return {
      contextPolicies: buildContextPolicies(),
      keyName,
    };
  }

  /**
   * Generates a signed CDN URL for an already-resolved CDN path.
   * @param {GenerateSignedUrlForCdnPathRequest} request Sign request metadata.
   * @param {SignedUrlServiceConfig} config Optional runtime overrides.
   * @return {SignedUrlGenerationResult} Signed CDN URL metadata.
   */
  public generateSignedUrlForCdnPath(
    request: GenerateSignedUrlForCdnPathRequest,
    config: SignedUrlServiceConfig = {},
  ): SignedUrlGenerationResult {
    const architecture = cdnArchitectureService.initializeArchitecture(config);
    const serviceConfig = this.initializeService(config);
    const contextPolicy = serviceConfig.contextPolicies[request.accessContext];
    const cdnPath = normalizePath(request.cdnPath, "cdnPath");
    const keyValue = normalizeOptionalEnv(
      config.signedUrlKeyValue ?? process.env.CDN_SIGNED_URL_KEY_VALUE,
    );

    if (!contextPolicy || !keyValue) {
      throw new SignedUrlGenerationError(
        "Signed URL configuration is incomplete.",
      );
    }

    const url = new URL(`${architecture.cdnBaseUrl}/${cdnPath}`);
    assertNoReservedSignedQueryParameters(url);

    const expiresInSeconds = normalizePositiveInteger(
      contextPolicy.expiresInSeconds,
      "expiresInSeconds",
    );
    const expiresEpochSeconds =
      Math.floor(Date.now() / 1000) + expiresInSeconds;

    url.searchParams.append("Expires", String(expiresEpochSeconds));
    url.searchParams.append("KeyName", serviceConfig.keyName);

    const signature = createHmac("sha1", decodeSigningKey(keyValue))
      .update(url.toString())
      .digest("base64url");

    url.searchParams.append("Signature", signature);
    cdnArchitectureService.assertNoDirectBucketUrlExposure(url.toString());

    const result: SignedUrlGenerationResult = {
      accessContext: contextPolicy.accessContext,
      cdnPath,
      expiresAt: new Date(expiresEpochSeconds * 1000).toISOString(),
      expiresInSeconds,
      signedUrl: url.toString(),
    };

    this.logger.info("Generated signed CDN asset URL.", {
      accessContext: result.accessContext,
      cdnPath: result.cdnPath,
      expiresAt: result.expiresAt,
      keyName: serviceConfig.keyName,
    });

    return result;
  }

  /**
   * Generates a signed URL for a question or solution asset.
   * @param {GenerateQuestionAssetSignedUrlRequest} request Asset path metadata.
   * @param {SignedUrlServiceConfig} config Optional runtime overrides.
   * @return {SignedUrlGenerationResult} Signed CDN URL metadata.
   */
  public generateQuestionAssetSignedUrl(
    request: GenerateQuestionAssetSignedUrlRequest,
    config: SignedUrlServiceConfig = {},
  ): SignedUrlGenerationResult {
    const location = storageBucketArchitectureService
      .resolveQuestionAssetStorageTarget(request, config);

    return this.generateSignedUrlForCdnPath({
      accessContext: request.accessContext ?? "examSession",
      cdnPath: location.cdnPath,
    }, config);
  }

  /**
   * Generates a signed URL for a downloadable report asset.
   * @param {GenerateReportAssetSignedUrlRequest} request Report path metadata.
   * @param {SignedUrlServiceConfig} config Optional runtime overrides.
   * @return {SignedUrlGenerationResult} Signed CDN URL metadata.
   */
  public generateReportAssetSignedUrl(
    request: GenerateReportAssetSignedUrlRequest,
    config: SignedUrlServiceConfig = {},
  ): SignedUrlGenerationResult {
    const location = storageBucketArchitectureService
      .resolveReportAssetStorageTarget(request, config);

    return this.generateSignedUrlForCdnPath({
      accessContext: request.accessContext ?? "dashboardView",
      cdnPath: location.cdnPath,
    }, config);
  }

  /**
   * Generates a signed URL for non-bucket-modeled restricted media assets.
   * @param {GenerateRestrictedMediaSignedUrlRequest} request Media path input.
   * @param {SignedUrlServiceConfig} config Optional runtime overrides.
   * @return {SignedUrlGenerationResult} Signed CDN URL metadata.
   */
  public generateRestrictedMediaSignedUrl(
    request: GenerateRestrictedMediaSignedUrlRequest,
    config: SignedUrlServiceConfig = {},
  ): SignedUrlGenerationResult {
    return this.generateSignedUrlForCdnPath({
      accessContext: request.accessContext ?? "dashboardView",
      cdnPath: normalizePath(request.mediaPath, "mediaPath"),
    }, config);
  }
}

/**
 * Shared signed URL service instance for CDN-backed asset delivery.
 */
export const signedUrlService = new SignedUrlService();
