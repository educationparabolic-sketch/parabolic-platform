export type AssetBucketKey = "questionAssets" | "reports";

export type AssetCacheTier = "hot" | "warm" | "cold";

export type QuestionAssetKind =
  "questionImage" |
  "solutionImage" |
  "solutionPdf";

export type QuestionAssetExtension = "png" | "webp" | "pdf";

export type ReportAssetKind =
  "studentMonthlyStatement" |
  "governanceReport" |
  "analyticsExport";

export interface CdnBucketDefinition {
  bucketKey: AssetBucketKey;
  bucketName: string;
  supportsArchiveRetention: boolean;
  versionedAssetsOnly: boolean;
}

export interface CdnSecurityPolicy {
  backendIamOnlyAccess: true;
  directBucketUrlsExposed: false;
  directoryListingEnabled: false;
  httpsOnlyDelivery: true;
  publicBucketAccessEnabled: false;
  signedUrlsRequired: true;
  uniformBucketLevelAccess: true;
}

export interface CdnExamOptimizationPolicy {
  firestoreReadsPerNavigationAllowed: false;
  generateSignedUrlPerNavigationAllowed: false;
  loadSolutionsDuringExamAllowed: false;
  preloadNextQuestionImage: true;
  proxyImageDeliveryThroughBackendAllowed: false;
}

export interface CdnArchitectureCachePolicy {
  cacheControl: string;
  durationSeconds: number;
  tier: AssetCacheTier;
}

export interface InitializeCdnArchitectureRequest {
  cdnBaseUrl?: string;
  questionAssetsBucket?: string;
  reportsBucket?: string;
}

export interface InitializedCdnArchitecture {
  buckets: Record<AssetBucketKey, CdnBucketDefinition>;
  cachePolicies: Record<AssetCacheTier, CdnArchitectureCachePolicy>;
  cdnBaseUrl: string;
  examOptimization: CdnExamOptimizationPolicy;
  security: CdnSecurityPolicy;
}

export interface ResolveQuestionAssetPathRequest {
  assetKind: QuestionAssetKind;
  extension?: QuestionAssetExtension;
  instituteId: string;
  questionId: string;
  version: number;
}

export interface ResolveReportAssetPathRequest {
  extension?: "csv" | "pdf";
  instituteId: string;
  month: number;
  reportKind: ReportAssetKind;
  studentId?: string;
  year: number;
}

export interface ResolvedAssetLocation {
  bucketKey: AssetBucketKey;
  bucketName: string;
  cdnBaseUrl: string;
  cdnPath: string;
  objectPath: string;
  requiresSignedUrl: true;
}
