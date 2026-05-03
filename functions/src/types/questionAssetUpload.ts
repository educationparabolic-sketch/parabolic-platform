import {StandardApiErrorCode} from "./apiResponse";
import {LicenseLayer} from "./middleware";
import {
  QuestionAssetExtension,
  QuestionAssetKind,
} from "./cdnArchitecture";

export interface QuestionAssetUploadRequest {
  assetKind?: QuestionAssetKind;
  contentBase64?: string;
  extension?: QuestionAssetExtension;
  instituteId: string;
  questionId?: string;
  version?: number;
}

export interface QuestionAssetUploadValidatedRequest {
  actorId: string;
  actorLicenseLayer: LicenseLayer;
  actorRole: string;
  assetKind: QuestionAssetKind;
  contentBase64: string;
  extension: QuestionAssetExtension;
  instituteId: string;
  ipAddress?: string;
  questionId: string;
  userAgent?: string;
  version: number;
}

export interface QuestionAssetUploadResult {
  assetKind: QuestionAssetKind;
  bucketName: string;
  cdnPath: string;
  contentType: string;
  objectPath: string;
  previewSignedUrl: string;
  questionId: string;
  uploaded: true;
  version: number;
}

export interface QuestionAssetUploadSuccessResponse {
  code: "OK";
  data: QuestionAssetUploadResult;
  message: string;
  requestId: string;
  success: true;
  timestamp: string;
}

export class QuestionAssetUploadValidationError extends Error {
  constructor(
    public readonly code: StandardApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "QuestionAssetUploadValidationError";
  }
}
