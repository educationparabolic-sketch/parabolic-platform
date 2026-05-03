import {createLogger} from "./logging";
import {signedUrlService} from "./signedUrl";
import {storageBucketArchitectureService} from "./storageBucketArchitecture";
import {cdnArchitectureService} from "./cdnArchitecture";
import {StorageObjectTarget} from "../types/storageBucketArchitecture";
import {
  QuestionAssetUploadResult,
  QuestionAssetUploadValidatedRequest,
  QuestionAssetUploadValidationError,
} from "../types/questionAssetUpload";
import {LicenseLayer} from "../types/middleware";
import {
  QuestionAssetExtension,
  QuestionAssetKind,
} from "../types/cdnArchitecture";

const ALLOWED_LICENSE_LAYERS = new Set<LicenseLayer>(["L0", "L1", "L2", "L3"]);
const PNG_SIGNATURE = Buffer.from([
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a,
]);
const PDF_SIGNATURE = Buffer.from("%PDF-");
const RIFF_SIGNATURE = Buffer.from("RIFF");
const WEBP_SIGNATURE = Buffer.from("WEBP");

interface QuestionAssetUploadDependencies {
  generatePreviewUrl:
    typeof signedUrlService.generateQuestionAssetSignedUrl;
  resolveStorageTarget:
    typeof storageBucketArchitectureService.resolveQuestionAssetStorageTarget;
  uploadAssetFile: (
    target: StorageObjectTarget,
    content: Buffer,
    metadata: Record<string, string>,
  ) => Promise<void>;
}

const normalizeRequiredString = (
  value: unknown,
  fieldName: string,
): string => {
  if (typeof value !== "string") {
    throw new QuestionAssetUploadValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a string.`,
    );
  }

  const normalizedValue = value.trim();
  if (!normalizedValue) {
    throw new QuestionAssetUploadValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a non-empty string.`,
    );
  }

  return normalizedValue;
};

const normalizeOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalizedValue = value.trim();
  return normalizedValue || undefined;
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
    throw new QuestionAssetUploadValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a positive integer.`,
    );
  }

  return value;
};

const assertAssetKind = (value: unknown): QuestionAssetKind => {
  const normalizedValue = normalizeRequiredString(value, "assetKind");

  if (
    normalizedValue !== "questionImage" &&
    normalizedValue !== "solutionImage" &&
    normalizedValue !== "solutionPdf"
  ) {
    throw new QuestionAssetUploadValidationError(
      "VALIDATION_ERROR",
      "Field \"assetKind\" must be questionImage, solutionImage, " +
      "or solutionPdf.",
    );
  }

  return normalizedValue;
};

const assertExtension = (
  value: unknown,
  assetKind: QuestionAssetKind,
): QuestionAssetExtension => {
  const fallbackExtension = assetKind === "solutionPdf" ? "pdf" : "png";
  const normalizedValue = normalizeOptionalString(value) ?? fallbackExtension;

  if (
    normalizedValue !== "png" &&
    normalizedValue !== "webp" &&
    normalizedValue !== "pdf"
  ) {
    throw new QuestionAssetUploadValidationError(
      "VALIDATION_ERROR",
      "Field \"extension\" must be png, webp, or pdf.",
    );
  }

  if (assetKind === "solutionPdf" && normalizedValue !== "pdf") {
    throw new QuestionAssetUploadValidationError(
      "VALIDATION_ERROR",
      "Field \"solutionPdf\" uploads must use the pdf extension.",
    );
  }

  if (
    assetKind !== "solutionPdf" &&
    normalizedValue === "pdf"
  ) {
    throw new QuestionAssetUploadValidationError(
      "VALIDATION_ERROR",
      "Question image uploads must use png or webp extensions.",
    );
  }

  return normalizedValue;
};

const decodeContentBase64 = (value: string): Buffer => {
  const normalizedValue = value.trim();

  try {
    const buffer = Buffer.from(normalizedValue, "base64");

    if (buffer.length === 0) {
      throw new Error("empty");
    }

    return buffer;
  } catch {
    throw new QuestionAssetUploadValidationError(
      "VALIDATION_ERROR",
      "Field \"contentBase64\" must be valid base64-encoded binary content.",
    );
  }
};

const hasSignatureAtOffset = (
  buffer: Buffer,
  signature: Buffer,
  offset: number,
): boolean => {
  if (buffer.length < offset + signature.length) {
    return false;
  }

  return buffer.subarray(offset, offset + signature.length)
    .equals(signature);
};

const assertContentMatchesExtension = (
  content: Buffer,
  extension: QuestionAssetExtension,
): void => {
  if (extension === "png" && content.subarray(0, PNG_SIGNATURE.length)
    .equals(PNG_SIGNATURE)) {
    return;
  }

  if (
    extension === "webp" &&
    hasSignatureAtOffset(content, RIFF_SIGNATURE, 0) &&
    hasSignatureAtOffset(content, WEBP_SIGNATURE, 8)
  ) {
    return;
  }

  if (
    extension === "pdf" &&
    content.subarray(0, PDF_SIGNATURE.length).equals(PDF_SIGNATURE)
  ) {
    return;
  }

  throw new QuestionAssetUploadValidationError(
    "VALIDATION_ERROR",
    `Uploaded file content does not match the ".${extension}" extension.`,
  );
};

const buildUploadMetadata = (
  request: QuestionAssetUploadValidatedRequest,
): Record<string, string> => ({
  actorId: request.actorId,
  assetKind: request.assetKind,
  instituteId: request.instituteId,
  questionId: request.questionId,
  uploadedAt: new Date().toISOString(),
  version: String(request.version),
});

const defaultUploadAssetFile = async (
  target: StorageObjectTarget,
  content: Buffer,
  metadata: Record<string, string>,
): Promise<void> => {
  const bucket = storageBucketArchitectureService.getBucket("questionAssets");
  const file = bucket.file(target.objectPath);
  const hotCachePolicy = cdnArchitectureService.initializeArchitecture()
    .cachePolicies.hot.cacheControl;

  await file.save(content, {
    contentType: target.contentType,
    metadata: {
      cacheControl: hotCachePolicy,
      metadata,
    },
    resumable: false,
  });
};

export class QuestionAssetUploadService {
  private readonly logger = createLogger("QuestionAssetUploadService");

  constructor(
    private readonly dependencies: QuestionAssetUploadDependencies = {
      generatePreviewUrl:
        signedUrlService.generateQuestionAssetSignedUrl.bind(signedUrlService),
      resolveStorageTarget:
        storageBucketArchitectureService.resolveQuestionAssetStorageTarget.bind(
          storageBucketArchitectureService,
        ),
      uploadAssetFile: defaultUploadAssetFile,
    },
  ) {}

  public normalizeRequest(
    input: Partial<QuestionAssetUploadValidatedRequest> & {
      assetKind?: unknown;
      contentBase64?: unknown;
      extension?: unknown;
      questionId?: unknown;
      version?: unknown;
    },
  ): QuestionAssetUploadValidatedRequest {
    const actorLicenseLayer = normalizeRequiredString(
      input.actorLicenseLayer,
      "actorLicenseLayer",
    ) as LicenseLayer;

    if (!ALLOWED_LICENSE_LAYERS.has(actorLicenseLayer)) {
      throw new QuestionAssetUploadValidationError(
        "VALIDATION_ERROR",
        "Field \"actorLicenseLayer\" must be a supported license layer.",
      );
    }

    const assetKind = assertAssetKind(input.assetKind);
    const extension = assertExtension(input.extension, assetKind);
    const contentBase64 = normalizeRequiredString(
      input.contentBase64,
      "contentBase64",
    );

    return {
      actorId: normalizeRequiredString(input.actorId, "actorId"),
      actorLicenseLayer,
      actorRole: normalizeRequiredString(input.actorRole, "actorRole")
        .toLowerCase(),
      assetKind,
      contentBase64,
      extension,
      instituteId: normalizeRequiredString(input.instituteId, "instituteId"),
      ipAddress: normalizeOptionalString(input.ipAddress),
      questionId: normalizeRequiredString(input.questionId, "questionId"),
      userAgent: normalizeOptionalString(input.userAgent),
      version: normalizePositiveInteger(input.version, "version"),
    };
  }

  public async uploadAsset(
    request: QuestionAssetUploadValidatedRequest,
  ): Promise<QuestionAssetUploadResult> {
    const normalizedRequest = this.normalizeRequest(request);
    const content = decodeContentBase64(normalizedRequest.contentBase64);
    assertContentMatchesExtension(content, normalizedRequest.extension);

    const storageTarget = this.dependencies.resolveStorageTarget({
      assetKind: normalizedRequest.assetKind,
      extension: normalizedRequest.extension,
      instituteId: normalizedRequest.instituteId,
      questionId: normalizedRequest.questionId,
      version: normalizedRequest.version,
    });

    await this.dependencies.uploadAssetFile(
      storageTarget,
      content,
      buildUploadMetadata(normalizedRequest),
    );

    const previewUrl = this.dependencies.generatePreviewUrl({
      accessContext: "dashboardView",
      assetKind: normalizedRequest.assetKind,
      extension: normalizedRequest.extension,
      instituteId: normalizedRequest.instituteId,
      questionId: normalizedRequest.questionId,
      version: normalizedRequest.version,
    });

    const result: QuestionAssetUploadResult = {
      assetKind: normalizedRequest.assetKind,
      bucketName: storageTarget.bucketName,
      cdnPath: storageTarget.cdnPath,
      contentType: storageTarget.contentType,
      objectPath: storageTarget.objectPath,
      previewSignedUrl: previewUrl.signedUrl,
      questionId: normalizedRequest.questionId,
      uploaded: true,
      version: normalizedRequest.version,
    };

    this.logger.info("Question asset uploaded to managed storage.", {
      assetKind: result.assetKind,
      bucketName: result.bucketName,
      objectPath: result.objectPath,
      questionId: result.questionId,
      version: String(result.version),
    });

    return result;
  }
}

export const questionAssetUploadService = new QuestionAssetUploadService();
