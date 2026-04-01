import {
  AssetBucketKey,
  InitializeCdnArchitectureRequest,
  ResolvedAssetLocation,
} from "../types/cdnArchitecture";
import {
  InitializedStorageBucketArchitecture,
  InitializeStorageBucketArchitectureRequest,
  ResolveQuestionAssetStorageTargetRequest,
  ResolveReportAssetStorageTargetRequest,
  StorageObjectTarget,
  ValidateStorageObjectPathRequest,
} from "../types/storageBucketArchitecture";
import {cdnArchitectureService} from "./cdnArchitecture";
import {getFirebaseAdminApp} from "../utils/firebaseAdmin";

const QUESTION_ASSET_OBJECT_PATH_PATTERN = new RegExp(
  "^[^/]+/questions/[^/]+/v[1-9]\\d*/" +
  "(?:question|solution)\\.(?:png|webp|pdf)$",
);

const REPORT_OBJECT_PATH_PATTERN =
  /^[^/]+\/reports\/\d{4}\/(?:0[1-9]|1[0-2])\/[^/]+\.(?:pdf|csv)$/;

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  csv: "text/csv",
  pdf: "application/pdf",
  png: "image/png",
  webp: "image/webp",
};

const STORAGE_BUCKET_DIRECTORY_TEMPLATES: Record<AssetBucketKey, string> = {
  questionAssets:
    "/{instituteId}/questions/{questionId}/v{version}/question.png|" +
    "solution.png|solution.pdf",
  reports: "/{instituteId}/reports/{year}/{month}/{fileName}",
};

const STORAGE_BUCKET_IMMUTABILITY: Record<AssetBucketKey, boolean> = {
  questionAssets: true,
  reports: false,
};

const STORAGE_BUCKET_PATH_PATTERNS: Record<AssetBucketKey, RegExp> = {
  questionAssets: QUESTION_ASSET_OBJECT_PATH_PATTERN,
  reports: REPORT_OBJECT_PATH_PATTERN,
};

const STORAGE_SECURITY_POLICY = {
  backendIamOnlyAccess: true,
  directoryListingEnabled: false,
  publicBucketAccessEnabled: false,
  uniformBucketLevelAccess: true,
} as const;

const normalizeNonEmptyString = (
  value: unknown,
  fieldName: string,
): string => {
  if (typeof value !== "string") {
    throw new StorageBucketArchitectureValidationError(
      `Storage architecture field "${fieldName}" must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new StorageBucketArchitectureValidationError(
      `Storage architecture field "${fieldName}" must be a non-empty string.`,
    );
  }

  return normalizedValue;
};

const buildStorageObjectTarget = (
  location: ResolvedAssetLocation,
): StorageObjectTarget => {
  const extension = location.objectPath.split(".").pop();
  const directoryPath = location.objectPath
    .split("/")
    .slice(0, -1)
    .join("/");
  const contentType = extension ?
    CONTENT_TYPE_BY_EXTENSION[extension] :
    undefined;

  if (!contentType) {
    throw new StorageBucketArchitectureValidationError(
      `Unsupported asset extension for "${location.objectPath}".`,
    );
  }

  return {
    ...location,
    contentType,
    directoryPath,
    gsUri: `gs://${location.bucketName}/${location.objectPath}`,
  };
};

/**
 * Raised when storage bucket architecture validation fails.
 */
export class StorageBucketArchitectureValidationError extends Error {
  /**
   * @param {string} message Validation failure detail.
   */
  constructor(message: string) {
    super(message);
    this.name = "StorageBucketArchitectureValidationError";
  }
}

/**
 * Storage-bucket architecture service for deterministic asset bucket topology.
 */
export class StorageBucketArchitectureService {
  /**
   * Returns the storage bucket architecture aligned to the CDN configuration.
   * @param {InitializeStorageBucketArchitectureRequest} request Overrides.
   * @return {InitializedStorageBucketArchitecture} Normalized bucket metadata.
   */
  public initializeArchitecture(
    request: InitializeStorageBucketArchitectureRequest = {},
  ): InitializedStorageBucketArchitecture {
    const cdnArchitecture = cdnArchitectureService.initializeArchitecture(
      request,
    );

    return {
      buckets: {
        questionAssets: {
          bucketKey: "questionAssets",
          bucketName: cdnArchitecture.buckets.questionAssets.bucketName,
          directoryTemplate:
            STORAGE_BUCKET_DIRECTORY_TEMPLATES.questionAssets,
          immutableObjects: STORAGE_BUCKET_IMMUTABILITY.questionAssets,
        },
        reports: {
          bucketKey: "reports",
          bucketName: cdnArchitecture.buckets.reports.bucketName,
          directoryTemplate: STORAGE_BUCKET_DIRECTORY_TEMPLATES.reports,
          immutableObjects: STORAGE_BUCKET_IMMUTABILITY.reports,
        },
      },
      security: STORAGE_SECURITY_POLICY,
    };
  }

  /**
   * Returns a bucket handle for the managed storage bucket.
   * @param {AssetBucketKey} bucketKey Bucket identifier.
   * @param {InitializeCdnArchitectureRequest} config Optional overrides.
   * @return {unknown} Firebase Admin Storage bucket handle.
   */
  public getBucket(
    bucketKey: AssetBucketKey,
    config: InitializeCdnArchitectureRequest = {},
  ) {
    const bucketName = this.initializeArchitecture(config).buckets[bucketKey]
      .bucketName;
    return getFirebaseAdminApp().storage().bucket(bucketName);
  }

  /**
   * Resolves the question asset upload target for immutable versioned assets.
   * @param {ResolveQuestionAssetStorageTargetRequest} request Path input.
   * @param {InitializeCdnArchitectureRequest} config Optional overrides.
   * @return {StorageObjectTarget} Normalized storage target metadata.
   */
  public resolveQuestionAssetStorageTarget(
    request: ResolveQuestionAssetStorageTargetRequest,
    config: InitializeCdnArchitectureRequest = {},
  ): StorageObjectTarget {
    const location = cdnArchitectureService.resolveQuestionAssetLocation(
      request,
      config,
    );

    this.assertAssetLocationMatchesArchitecture(location);
    return buildStorageObjectTarget(location);
  }

  /**
   * Resolves the report asset upload target for generated exports.
   * @param {ResolveReportAssetStorageTargetRequest} request Path input.
   * @param {InitializeCdnArchitectureRequest} config Optional overrides.
   * @return {StorageObjectTarget} Normalized storage target metadata.
   */
  public resolveReportAssetStorageTarget(
    request: ResolveReportAssetStorageTargetRequest,
    config: InitializeCdnArchitectureRequest = {},
  ): StorageObjectTarget {
    const location = cdnArchitectureService.resolveReportAssetLocation(
      request,
      config,
    );

    this.assertAssetLocationMatchesArchitecture(location);
    return buildStorageObjectTarget(location);
  }

  /**
   * Validates that a bucket/object path pair conforms to the storage contract.
   * @param {ValidateStorageObjectPathRequest} request Validation input.
   * @param {InitializeCdnArchitectureRequest} config Optional overrides.
   * @return {void} Returns when the object path is valid.
   */
  public assertStorageObjectPath(
    request: ValidateStorageObjectPathRequest,
    config: InitializeCdnArchitectureRequest = {},
  ): void {
    const architecture = this.initializeArchitecture(config);
    const bucket = architecture.buckets[request.bucketKey];
    const bucketName = normalizeNonEmptyString(
      request.bucketName,
      "bucketName",
    );
    const objectPath = normalizeNonEmptyString(
      request.objectPath,
      "objectPath",
    );

    if (bucket.bucketName !== bucketName) {
      throw new StorageBucketArchitectureValidationError(
        `Bucket "${bucketName}" does not match the configured ` +
        `${request.bucketKey} bucket.`,
      );
    }

    const pattern = STORAGE_BUCKET_PATH_PATTERNS[request.bucketKey];

    if (!pattern.test(objectPath)) {
      throw new StorageBucketArchitectureValidationError(
        `Object path "${objectPath}" does not match the ` +
        `${request.bucketKey} storage structure.`,
      );
    }
  }

  /**
   * Validates a resolved asset location against the storage architecture.
   * @param {ResolvedAssetLocation} location Asset location metadata.
   * @param {InitializeCdnArchitectureRequest} config Optional overrides.
   * @return {void} Returns when the asset location is valid.
   */
  public assertAssetLocationMatchesArchitecture(
    location: ResolvedAssetLocation,
    config: InitializeCdnArchitectureRequest = {},
  ): void {
    this.assertStorageObjectPath({
      bucketKey: location.bucketKey,
      bucketName: location.bucketName,
      objectPath: location.objectPath,
    }, config);
  }
}

export const storageBucketArchitectureService =
  new StorageBucketArchitectureService();
