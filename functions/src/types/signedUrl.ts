import {
  InitializeCdnArchitectureRequest,
  ResolveQuestionAssetPathRequest,
  ResolveReportAssetPathRequest,
} from "./cdnArchitecture";

export type SignedUrlAccessContext =
  "examSession" |
  "dashboardView" |
  "dataExportDownload";

export interface SignedUrlContextPolicy {
  accessContext: SignedUrlAccessContext;
  expiresInSeconds: number;
}

export interface SignedUrlServiceConfig
  extends InitializeCdnArchitectureRequest {
  signedUrlKeyName?: string;
  signedUrlKeyValue?: string;
}

export interface GenerateSignedUrlForCdnPathRequest {
  accessContext: SignedUrlAccessContext;
  cdnPath: string;
}

export interface GenerateQuestionAssetSignedUrlRequest
  extends ResolveQuestionAssetPathRequest {
  accessContext?: SignedUrlAccessContext;
}

export interface GenerateReportAssetSignedUrlRequest
  extends ResolveReportAssetPathRequest {
  accessContext?: SignedUrlAccessContext;
}

export interface GenerateRestrictedMediaSignedUrlRequest {
  accessContext?: SignedUrlAccessContext;
  mediaPath: string;
}

export interface SignedUrlGenerationResult {
  accessContext: SignedUrlAccessContext;
  cdnPath: string;
  expiresAt: string;
  expiresInSeconds: number;
  signedUrl: string;
}

export interface InitializedSignedUrlService {
  contextPolicies: Record<SignedUrlAccessContext, SignedUrlContextPolicy>;
  keyName: string;
}
