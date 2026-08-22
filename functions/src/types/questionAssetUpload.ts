import {StandardApiErrorCode} from "./apiResponse";
import {LicenseLayer} from "./middleware";
import type {
  QuestionAssetExtension,
  QuestionAssetKind,
  QuestionAssetUploadResult,
} from "../../../shared/contracts/apiDtos";
export type {
  QuestionAssetExtension,
  QuestionAssetKind,
  QuestionAssetUploadRequest,
  QuestionAssetUploadResult,
} from "../../../shared/contracts/apiDtos";

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

export interface QuestionAssetStorageUploadResult
  extends QuestionAssetUploadResult {
  bucketName: string;
  disposition: "created" | "replayed";
  objectPath: string;
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
