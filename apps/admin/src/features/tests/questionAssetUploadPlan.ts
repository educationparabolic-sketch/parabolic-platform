import type {
  QuestionAssetExtension,
  QuestionAssetUploadRequest,
  QuestionAssetUploadResult,
  QuestionBulkUploadRowResult,
} from "../../../../../shared/contracts/apiDtos";

export interface QuestionAssetWorkbookReference {
  questionImageFile: string;
  solutionImageFile: string;
}

export interface QuestionAssetUploadPlanEntry {
  assetKind: "questionImage" | "solutionImage";
  request: QuestionAssetUploadRequest;
  rowIndex: number;
  sourceFileName: string;
}

export interface ManagedQuestionAssetPaths {
  questionImageUrl: string;
  solutionImageUrl: string;
}

export type ManagedQuestionAssetPathsByRow = Map<
number,
ManagedQuestionAssetPaths
>;

const SUPPORTED_IMAGE_EXTENSIONS = new Set<QuestionAssetExtension>([
  "png",
  "webp",
]);

export function resolveQuestionImageExtension(
  fileName: string,
): Exclude<QuestionAssetExtension, "pdf"> {
  const extension = fileName.split(".").pop()?.trim().toLowerCase();
  if (!extension || !SUPPORTED_IMAGE_EXTENSIONS.has(
    extension as QuestionAssetExtension,
  )) {
    throw new Error(
      `Question asset "${fileName}" must use a .png or .webp extension.`,
    );
  }

  return extension as Exclude<QuestionAssetExtension, "pdf">;
}

export function isSupportedQuestionImageFile(fileName: string): boolean {
  try {
    resolveQuestionImageExtension(fileName);
    return true;
  } catch {
    return false;
  }
}

export function encodeQuestionAssetBase64(bytes: Uint8Array): string {
  if (bytes.byteLength === 0) {
    throw new Error("Question assets must not be empty.");
  }

  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return btoa(binary);
}

export function buildQuestionAssetUploadPlan(input: {
  assetFiles: Readonly<Record<string, Uint8Array>>;
  instituteId: string;
  serverRows: readonly QuestionBulkUploadRowResult[];
  workbookRows: readonly QuestionAssetWorkbookReference[];
}): QuestionAssetUploadPlanEntry[] {
  const rowsByNumber = new Map<number, QuestionBulkUploadRowResult>();
  input.serverRows.forEach((row) => {
    if (rowsByNumber.has(row.rowNumber)) {
      throw new Error(
        `System validation returned duplicate row ${row.rowNumber}.`,
      );
    }
    rowsByNumber.set(row.rowNumber, row);
  });

  return input.workbookRows.flatMap((workbookRow, rowIndex) => {
    const serverRowNumber = rowIndex + 1;
    const serverRow = rowsByNumber.get(serverRowNumber);
    if (
      !serverRow ||
      serverRow.errors.length > 0 ||
      !serverRow.questionId ||
      !Number.isInteger(serverRow.version) ||
      serverRow.version < 1
    ) {
      throw new Error(
        `System validation did not return an authoritative ID and version ` +
        `for question row ${serverRowNumber}.`,
      );
    }
    const questionId = serverRow.questionId;
    const version = serverRow.version;

    return ([
      {
        assetKind: "questionImage" as const,
        sourceFileName: workbookRow.questionImageFile,
      },
      {
        assetKind: "solutionImage" as const,
        sourceFileName: workbookRow.solutionImageFile,
      },
    ]).map(({assetKind, sourceFileName}) => {
      const content = input.assetFiles[sourceFileName];
      if (!content) {
        throw new Error(
          `Validated ZIP asset "${sourceFileName}" is no longer available.`,
        );
      }

      return {
        assetKind,
        request: {
          assetKind,
          contentBase64: encodeQuestionAssetBase64(content),
          extension: resolveQuestionImageExtension(sourceFileName),
          instituteId: input.instituteId,
          questionId,
          version,
        },
        rowIndex,
        sourceFileName,
      };
    });
  });
}

export async function uploadQuestionAssetPlan(
  plan: readonly QuestionAssetUploadPlanEntry[],
  uploadAsset: (
    request: QuestionAssetUploadRequest,
  ) => Promise<QuestionAssetUploadResult>,
): Promise<ManagedQuestionAssetPathsByRow> {
  const pathsByRow: ManagedQuestionAssetPathsByRow = new Map();

  for (const entry of plan) {
    const result = await uploadAsset(entry.request);
    if (
      result.assetKind !== entry.assetKind ||
      result.questionId !== entry.request.questionId ||
      result.version !== entry.request.version ||
      result.uploaded !== true
    ) {
      throw new Error(
        `Question asset upload returned mismatched authority for ` +
        `"${entry.sourceFileName}".`,
      );
    }

    const current = pathsByRow.get(entry.rowIndex) ?? {
      questionImageUrl: "",
      solutionImageUrl: "",
    };
    if (entry.assetKind === "questionImage") {
      current.questionImageUrl = result.cdnPath;
    } else {
      current.solutionImageUrl = result.cdnPath;
    }
    pathsByRow.set(entry.rowIndex, current);
  }

  const rowIndexes = new Set(plan.map((entry) => entry.rowIndex));
  rowIndexes.forEach((rowIndex) => {
    const paths = pathsByRow.get(rowIndex);
    if (!paths?.questionImageUrl || !paths.solutionImageUrl) {
      throw new Error(
        `Question row ${rowIndex + 1} did not upload both required assets.`,
      );
    }
  });

  return pathsByRow;
}
