import {
  AssetCacheTier,
  AssetBucketKey,
  CdnArchitectureCachePolicy,
  CdnBucketDefinition,
  InitializeCdnArchitectureRequest,
  InitializedCdnArchitecture,
  QuestionAssetExtension,
  QuestionAssetKind,
  ReportAssetKind,
  ResolveQuestionAssetPathRequest,
  ResolveReportAssetPathRequest,
  ResolvedAssetLocation,
} from "../types/cdnArchitecture";

export const DEFAULT_CDN_BASE_URL = "https://cdn.yourdomain.com";
export const DEFAULT_QUESTION_ASSETS_BUCKET =
  "parabolic-prod-question-assets";
export const DEFAULT_REPORTS_BUCKET = "parabolic-prod-reports";

const DIRECT_BUCKET_URL_PATTERNS = [
  /^gs:\/\//i,
  /storage\.googleapis\.com/i,
  /firebasestorage\.googleapis\.com/i,
  /googleapis\.com\/download\/storage/i,
];

const CACHE_POLICIES:
Record<AssetCacheTier, CdnArchitectureCachePolicy> = {
  cold: {
    cacheControl: "public, max-age=31536000",
    durationSeconds: 31536000,
    tier: "cold",
  },
  hot: {
    cacheControl: "public, max-age=86400",
    durationSeconds: 86400,
    tier: "hot",
  },
  warm: {
    cacheControl: "public, max-age=604800",
    durationSeconds: 604800,
    tier: "warm",
  },
};

const resolveQuestionAssetFileName = (
  assetKind: QuestionAssetKind,
  extension: QuestionAssetExtension,
): string => {
  switch (assetKind) {
  case "questionImage":
    return `question.${extension}`;
  case "solutionImage":
    return `solution.${extension}`;
  case "solutionPdf":
    return `solution.${extension}`;
  default: {
    const exhaustiveAssetKind: never = assetKind;
    throw new Error(`Unsupported question asset kind: ${exhaustiveAssetKind}`);
  }
  }
};

const resolveDefaultQuestionExtension = (
  assetKind: QuestionAssetKind,
): QuestionAssetExtension =>
  assetKind === "solutionPdf" ? "pdf" : "png";

const resolveReportFileName = (
  reportKind: ReportAssetKind,
  extension: "csv" | "pdf",
  studentId?: string,
): string => {
  switch (reportKind) {
  case "studentMonthlyStatement":
    return `${requirePathSegment(studentId, "studentId")}.${extension}`;
  case "governanceReport":
    return `governance.${extension}`;
  case "analyticsExport":
    return `analytics-export.${extension}`;
  default: {
    const exhaustiveReportKind: never = reportKind;
    throw new Error(`Unsupported report asset kind: ${exhaustiveReportKind}`);
  }
  }
};

const normalizeBaseUrl = (value: string | undefined): string => {
  const baseUrl = (value ?? DEFAULT_CDN_BASE_URL).trim();

  if (!baseUrl) {
    throw new CdnArchitectureValidationError(
      "CDN base URL must be a non-empty string.",
    );
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(baseUrl);
  } catch (error) {
    throw new CdnArchitectureValidationError(
      "CDN base URL must be a valid absolute URL.",
    );
  }

  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    throw new CdnArchitectureValidationError(
      "CDN base URL must use http or https.",
    );
  }

  return parsedUrl.toString().replace(/\/+$/, "");
};

const normalizeBucketName = (
  value: string | undefined,
  fallback: string,
  fieldName: string,
): string => {
  const bucketName = (value ?? fallback).trim();

  if (!bucketName) {
    throw new CdnArchitectureValidationError(
      `CDN bucket field "${fieldName}" must be a non-empty string.`,
    );
  }

  if (bucketName.includes("/")) {
    throw new CdnArchitectureValidationError(
      `CDN bucket field "${fieldName}" must be a bucket name, not a path.`,
    );
  }

  return bucketName;
};

const requirePathSegment = (value: unknown, fieldName: string): string => {
  if (typeof value !== "string") {
    throw new CdnArchitectureValidationError(
      `CDN path field "${fieldName}" must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new CdnArchitectureValidationError(
      `CDN path field "${fieldName}" must be a non-empty string.`,
    );
  }

  if (normalizedValue.includes("/")) {
    throw new CdnArchitectureValidationError(
      `CDN path field "${fieldName}" must not contain "/".`,
    );
  }

  return normalizedValue;
};

const normalizePositiveInteger = (
  value: unknown,
  fieldName: string,
): number => {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1
  ) {
    throw new CdnArchitectureValidationError(
      `CDN field "${fieldName}" must be a positive integer.`,
    );
  }

  return value;
};

const normalizeMonth = (value: unknown): string => {
  const month = normalizePositiveInteger(value, "month");

  if (month > 12) {
    throw new CdnArchitectureValidationError(
      "CDN field \"month\" must be between 1 and 12.",
    );
  }

  return String(month).padStart(2, "0");
};

const buildBuckets = (
  request: InitializeCdnArchitectureRequest,
): Record<AssetBucketKey, CdnBucketDefinition> => ({
  questionAssets: {
    bucketKey: "questionAssets",
    bucketName: normalizeBucketName(
      request.questionAssetsBucket,
      DEFAULT_QUESTION_ASSETS_BUCKET,
      "questionAssetsBucket",
    ),
    supportsArchiveRetention: true,
    versionedAssetsOnly: true,
  },
  reports: {
    bucketKey: "reports",
    bucketName: normalizeBucketName(
      request.reportsBucket,
      DEFAULT_REPORTS_BUCKET,
      "reportsBucket",
    ),
    supportsArchiveRetention: true,
    versionedAssetsOnly: false,
  },
});

/**
 * Raised when CDN architecture initialization or path validation fails.
 */
export class CdnArchitectureValidationError extends Error {
  /**
   * @param {string} message Validation failure detail.
   */
  constructor(message: string) {
    super(message);
    this.name = "CdnArchitectureValidationError";
  }
}

/**
 * Shared CDN architecture bootstrap and asset-path normalization service.
 */
export class CdnArchitectureService {
  /**
   * Returns the deterministic CDN configuration used by the platform.
   * @param {InitializeCdnArchitectureRequest} request Optional overrides.
   * @return {InitializedCdnArchitecture} Normalized CDN architecture state.
   */
  public initializeArchitecture(
    request: InitializeCdnArchitectureRequest = {},
  ): InitializedCdnArchitecture {
    return {
      buckets: buildBuckets(request),
      cachePolicies: CACHE_POLICIES,
      cdnBaseUrl: normalizeBaseUrl(request.cdnBaseUrl),
      examOptimization: {
        firestoreReadsPerNavigationAllowed: false,
        generateSignedUrlPerNavigationAllowed: false,
        loadSolutionsDuringExamAllowed: false,
        preloadNextQuestionImage: true,
        proxyImageDeliveryThroughBackendAllowed: false,
      },
      security: {
        backendIamOnlyAccess: true,
        directBucketUrlsExposed: false,
        directoryListingEnabled: false,
        httpsOnlyDelivery: true,
        publicBucketAccessEnabled: false,
        signedUrlsRequired: true,
        uniformBucketLevelAccess: true,
      },
    };
  }

  /**
   * Resolves the immutable question-asset storage path for a versioned asset.
   * @param {ResolveQuestionAssetPathRequest} request Path resolution input.
   * @param {InitializeCdnArchitectureRequest} config Optional config overrides.
   * @return {ResolvedAssetLocation} Normalized CDN asset location metadata.
   */
  public resolveQuestionAssetLocation(
    request: ResolveQuestionAssetPathRequest,
    config: InitializeCdnArchitectureRequest = {},
  ): ResolvedAssetLocation {
    const architecture = this.initializeArchitecture(config);
    const instituteId = requirePathSegment(request.instituteId, "instituteId");
    const questionId = requirePathSegment(request.questionId, "questionId");
    const version = normalizePositiveInteger(request.version, "version");
    const extension = request.extension ??
      resolveDefaultQuestionExtension(request.assetKind);

    if (request.assetKind === "solutionPdf" && extension !== "pdf") {
      throw new CdnArchitectureValidationError(
        "Question asset kind \"solutionPdf\" must use the \"pdf\" " +
        "extension.",
      );
    }

    if (
      request.assetKind !== "solutionPdf" &&
      extension !== "png" &&
      extension !== "webp"
    ) {
      throw new CdnArchitectureValidationError(
        "Question image assets must use png or webp extensions.",
      );
    }

    const fileName = resolveQuestionAssetFileName(
      request.assetKind,
      extension,
    );
    const objectPath =
      `${instituteId}/questions/${questionId}/v${version}/${fileName}`;

    return {
      bucketKey: "questionAssets",
      bucketName: architecture.buckets.questionAssets.bucketName,
      cdnBaseUrl: architecture.cdnBaseUrl,
      cdnPath: objectPath,
      objectPath,
      requiresSignedUrl: true,
    };
  }

  /**
   * Resolves the reports-bucket location for generated PDF or CSV outputs.
   * @param {ResolveReportAssetPathRequest} request Path resolution input.
   * @param {InitializeCdnArchitectureRequest} config Optional config overrides.
   * @return {ResolvedAssetLocation} Normalized report asset location metadata.
   */
  public resolveReportAssetLocation(
    request: ResolveReportAssetPathRequest,
    config: InitializeCdnArchitectureRequest = {},
  ): ResolvedAssetLocation {
    const architecture = this.initializeArchitecture(config);
    const instituteId = requirePathSegment(
      request.instituteId,
      "instituteId",
    );
    const year = String(normalizePositiveInteger(request.year, "year"));
    const month = normalizeMonth(request.month);
    const extension = request.extension ?? "pdf";

    if (
      request.reportKind === "studentMonthlyStatement" &&
      extension !== "pdf"
    ) {
      throw new CdnArchitectureValidationError(
        "Report kind \"studentMonthlyStatement\" must use the \"pdf\" " +
        "extension.",
      );
    }

    const fileName = resolveReportFileName(
      request.reportKind,
      extension,
      request.studentId,
    );
    const objectPath =
      `${instituteId}/reports/${year}/${month}/${fileName}`;

    return {
      bucketKey: "reports",
      bucketName: architecture.buckets.reports.bucketName,
      cdnBaseUrl: architecture.cdnBaseUrl,
      cdnPath: objectPath,
      objectPath,
      requiresSignedUrl: true,
    };
  }

  /**
   * Rejects storage URLs so only the CDN domain is exposed externally.
   * @param {string} url Candidate URL for exposure.
   * @return {void} Returns when the URL is safe to expose.
   */
  public assertNoDirectBucketUrlExposure(url: string): void {
    const normalizedUrl = url.trim();

    if (!normalizedUrl) {
      throw new CdnArchitectureValidationError(
        "Asset URL must be a non-empty string.",
      );
    }

    if (
      DIRECT_BUCKET_URL_PATTERNS.some((pattern) => pattern.test(normalizedUrl))
    ) {
      throw new CdnArchitectureValidationError(
        "Direct bucket URLs must never be exposed; use the CDN domain instead.",
      );
    }
  }
}

export const cdnArchitectureService = new CdnArchitectureService();
