import {Timestamp} from "firebase-admin/firestore";
import {createLogger} from "./logging";
import {cdnArchitectureService} from "./cdnArchitecture";
import {getFirestore} from "../utils/firebaseAdmin";
import {storageBucketArchitectureService} from "./storageBucketArchitecture";
import {
  QuestionBulkUploadQuestionInput,
  QuestionBulkUploadResult,
  QuestionBulkUploadRowAction,
  QuestionBulkUploadRowResult,
  QuestionBulkUploadValidatedRequest,
  QuestionBulkUploadValidatedRow,
  QuestionBulkUploadValidationError,
} from "../types/questionBulkUpload";
import {QuestionAssetExtension} from "../types/cdnArchitecture";
import {LicenseLayer} from "../types/middleware";
import {QuestionStatus} from "../types/questionIngestion";

const INSTITUTES_COLLECTION = "institutes";
const QUESTION_BANK_COLLECTION = "questionBank";
const QUESTION_UPLOAD_LOGS_COLLECTION = "questionUploadLogs";
const ALLOWED_LICENSE_LAYERS = new Set<LicenseLayer>(["L0", "L1", "L2", "L3"]);
const ALLOWED_DIFFICULTIES = new Set(["Easy", "Medium", "Hard"]);
const ALLOWED_STATUSES = new Set<QuestionStatus>([
  "active",
  "used",
  "archived",
  "deprecated",
]);
const CSV_REQUIRED_HEADERS = [
  "uniquekey",
  "examtype",
  "subject",
  "chapter",
  "difficulty",
  "marks",
  "negativemarks",
  "questiontype",
  "correctanswer",
];

interface ExistingQuestionRecord {
  createdAt?: FirebaseFirestore.Timestamp;
  lastUsedAt?: FirebaseFirestore.Timestamp | null;
  primaryTag?: string | null;
  questionId: string;
  searchTokens?: string[];
  status?: QuestionStatus;
  uniqueKey?: string;
  usedCount?: number;
}

interface PreparedRow {
  action: Extract<QuestionBulkUploadRowAction, "create" | "update">;
  existingQuestion?: ExistingQuestionRecord;
  row: QuestionBulkUploadValidatedRow;
}

const normalizeRequiredString = (value: unknown, fieldName: string): string => {
  if (typeof value !== "string") {
    throw new QuestionBulkUploadValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new QuestionBulkUploadValidationError(
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

const normalizeOptionalNullableString = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  return normalizeRequiredString(value, "value");
};

const normalizeRequiredPositiveInteger = (
  value: unknown,
  fieldName: string,
): number => {
  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new QuestionBulkUploadValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a positive integer.`,
    );
  }

  return parsedValue;
};

const normalizeRequiredNumber = (
  value: unknown,
  fieldName: string,
): number => {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue)) {
    throw new QuestionBulkUploadValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a valid number.`,
    );
  }

  if (parsedValue < 0) {
    throw new QuestionBulkUploadValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be non-negative.`,
    );
  }

  return parsedValue;
};

const normalizeDelimitedStringList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map((entry) =>
      normalizeRequiredString(entry, "listEntry").toLowerCase(),
    ))).sort();
  }

  const normalizedValue = normalizeOptionalString(value);

  if (!normalizedValue) {
    return [];
  }

  return Array.from(new Set(
    normalizedValue
      .split(/[|;,]/)
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => Boolean(entry)),
  )).sort();
};

const normalizeDelimitedKeywordList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map((entry) =>
      normalizeRequiredString(entry, "questionTextKeywords"),
    )));
  }

  const normalizedValue = normalizeOptionalString(value);

  if (!normalizedValue) {
    return [];
  }

  return Array.from(new Set(
    normalizedValue
      .split(/[|;,]/)
      .map((entry) => entry.trim())
      .filter((entry) => Boolean(entry)),
  ));
};

const normalizeCsvHeader = (value: string): string =>
  value.trim().toLowerCase().replace(/[\s_-]+/g, "");

const parseCsvLine = (line: string): string[] => {
  const values: string[] = [];
  let currentValue = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === "\"") {
      if (inQuotes && nextCharacter === "\"") {
        currentValue += "\"";
        index += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (character === "," && !inQuotes) {
      values.push(currentValue.trim());
      currentValue = "";
      continue;
    }

    currentValue += character;
  }

  if (inQuotes) {
    throw new QuestionBulkUploadValidationError(
      "VALIDATION_ERROR",
      "CSV content contains an unterminated quoted field.",
    );
  }

  values.push(currentValue.trim());
  return values;
};

const parseCsvContent = (
  csvContent: string,
): QuestionBulkUploadQuestionInput[] => {
  const normalizedContent = csvContent.trim();

  if (!normalizedContent) {
    throw new QuestionBulkUploadValidationError(
      "VALIDATION_ERROR",
      "Field \"csvContent\" must include at least one data row.",
    );
  }

  const lines = normalizedContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => Boolean(line));

  if (lines.length < 2) {
    throw new QuestionBulkUploadValidationError(
      "VALIDATION_ERROR",
      "CSV content must include a header row and at least one question row.",
    );
  }

  const headers = parseCsvLine(lines[0] ?? "");
  const headerMap = new Map<string, number>();
  headers.forEach((header, index) => {
    headerMap.set(normalizeCsvHeader(header), index);
  });

  for (const requiredHeader of CSV_REQUIRED_HEADERS) {
    if (!headerMap.has(requiredHeader)) {
      throw new QuestionBulkUploadValidationError(
        "VALIDATION_ERROR",
        `CSV content is missing required header "${requiredHeader}".`,
      );
    }
  }

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const readColumn = (headerName: string): string | undefined => {
      const index = headerMap.get(headerName);
      if (index === undefined) {
        return undefined;
      }

      return values[index]?.trim();
    };

    return {
      chapter: readColumn("chapter"),
      correctAnswer: readColumn("correctanswer"),
      difficulty: readColumn("difficulty") as never,
      examType: readColumn("examtype"),
      marks: readColumn("marks"),
      negativeMarks: readColumn("negativemarks"),
      parentQuestionId: readColumn("parentquestionid") ?? null,
      questionId: readColumn("questionid"),
      questionImageUrl: readColumn("questionimageurl"),
      questionTextKeywords: readColumn("questiontextkeywords"),
      questionType: readColumn("questiontype"),
      simulationLink: readColumn("simulationlink") ?? null,
      solutionImageUrl: readColumn("solutionimageurl"),
      status: readColumn("status") as never,
      subject: readColumn("subject"),
      tags: readColumn("tags"),
      tutorialVideoLink: readColumn("tutorialvideolink") ?? null,
      uniqueKey: readColumn("uniquekey"),
      version: readColumn("version"),
    };
  });
};

const buildQuestionIdFromUniqueKey = (
  uniqueKey: string,
  version: number,
): string => {
  const slug = uniqueKey
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!slug) {
    throw new QuestionBulkUploadValidationError(
      "VALIDATION_ERROR",
      "Field \"uniqueKey\" must contain at least one alphanumeric character.",
    );
  }

  return `${slug}-v${version}`;
};

const normalizeQuestionAssetExtension = (
  assetPath: string,
): QuestionAssetExtension => {
  const extension = assetPath.split(".").pop()?.toLowerCase();

  if (
    extension !== "png" &&
    extension !== "webp" &&
    extension !== "pdf"
  ) {
    throw new QuestionBulkUploadValidationError(
      "VALIDATION_ERROR",
      "Question asset references must use png, webp, or pdf extensions.",
    );
  }

  return extension;
};

const normalizeManagedQuestionAssetPath = (
  value: unknown,
  input: {
    assetKind: "questionImage" | "solutionImage";
    instituteId: string;
    questionId: string;
    rowNumber: number;
    version: number;
  },
): string => {
  const normalizedValue = normalizeOptionalString(value);

  if (!normalizedValue) {
    return "";
  }

  cdnArchitectureService.assertNoDirectBucketUrlExposure(normalizedValue);

  let candidatePath = normalizedValue.replace(/^\/+/, "");

  if (
    normalizedValue.startsWith("http://") ||
    normalizedValue.startsWith("https://")
  ) {
    let parsedUrl: URL;

    try {
      parsedUrl = new URL(normalizedValue);
    } catch {
      throw new QuestionBulkUploadValidationError(
        "VALIDATION_ERROR",
        `Row ${input.rowNumber} must use a valid managed asset URL.`,
      );
    }

    const architecture = cdnArchitectureService.initializeArchitecture();
    const baseUrl = new URL(architecture.cdnBaseUrl);

    if (parsedUrl.origin !== baseUrl.origin) {
      throw new QuestionBulkUploadValidationError(
        "VALIDATION_ERROR",
        `Row ${input.rowNumber} must use the managed CDN domain for ` +
        `${input.assetKind}.`,
      );
    }

    candidatePath = parsedUrl.pathname.replace(/^\/+/, "");
  }

  const extension = normalizeQuestionAssetExtension(candidatePath);
  const expectedTarget = storageBucketArchitectureService
    .resolveQuestionAssetStorageTarget({
      assetKind: input.assetKind,
      extension,
      instituteId: input.instituteId,
      questionId: input.questionId,
      version: input.version,
    });

  if (candidatePath !== expectedTarget.objectPath) {
    throw new QuestionBulkUploadValidationError(
      "VALIDATION_ERROR",
      `Row ${input.rowNumber} must reference the canonical managed ` +
      `${input.assetKind} path for questionId "${input.questionId}".`,
    );
  }

  return expectedTarget.objectPath;
};

const normalizeExistingQuestion = (
  data: FirebaseFirestore.DocumentData | undefined,
  questionId: string,
): ExistingQuestionRecord => ({
  createdAt:
    data?.createdAt instanceof Timestamp ? data.createdAt : undefined,
  lastUsedAt:
    data?.lastUsedAt instanceof Timestamp || data?.lastUsedAt === null ?
      data.lastUsedAt :
      undefined,
  primaryTag:
    typeof data?.primaryTag === "string" ? data.primaryTag :
      data?.primaryTag === null ? null :
        undefined,
  questionId,
  searchTokens:
    Array.isArray(data?.searchTokens) ?
      data.searchTokens.filter((entry: unknown): entry is string =>
        typeof entry === "string",
      ) :
      undefined,
  status:
    typeof data?.status === "string" &&
      ALLOWED_STATUSES.has(data.status as QuestionStatus) ?
      data.status as QuestionStatus :
      undefined,
  uniqueKey:
    typeof data?.uniqueKey === "string" ? data.uniqueKey :
      undefined,
  usedCount:
    typeof data?.usedCount === "number" && Number.isFinite(data.usedCount) ?
      data.usedCount :
      undefined,
});

export class QuestionBulkUploadService {
  private readonly logger = createLogger("QuestionBulkUploadService");

  constructor(
    private readonly firestore: FirebaseFirestore.Firestore = getFirestore(),
  ) {}

  public normalizeRequest(
    input: Partial<QuestionBulkUploadValidatedRequest> & {
      commit?: unknown;
      csvContent?: unknown;
      questions?: unknown;
    },
  ): QuestionBulkUploadValidatedRequest {
    const actorLicenseLayer = normalizeRequiredString(
      input.actorLicenseLayer,
      "actorLicenseLayer",
    ) as LicenseLayer;

    if (!ALLOWED_LICENSE_LAYERS.has(actorLicenseLayer)) {
      throw new QuestionBulkUploadValidationError(
        "VALIDATION_ERROR",
        "Field \"actorLicenseLayer\" must be a supported license layer.",
      );
    }

    const rawQuestions = Array.isArray(input.questions) ? input.questions : null;
    const csvContent = normalizeOptionalString(input.csvContent);

    if (!rawQuestions && !csvContent) {
      throw new QuestionBulkUploadValidationError(
        "VALIDATION_ERROR",
        "Provide either \"questions\" or \"csvContent\" for question upload.",
      );
    }

    if (rawQuestions && csvContent) {
      throw new QuestionBulkUploadValidationError(
        "VALIDATION_ERROR",
        "Provide only one of \"questions\" or \"csvContent\" per request.",
      );
    }

    const parsedQuestions = rawQuestions ??
      parseCsvContent(csvContent ?? "");

    if (parsedQuestions.length === 0) {
      throw new QuestionBulkUploadValidationError(
        "VALIDATION_ERROR",
        "Question upload requires at least one row.",
      );
    }

    const instituteId = normalizeRequiredString(
      input.instituteId,
      "instituteId",
    );
    const rows = parsedQuestions.map((row, index) =>
      this.normalizeRow(
        row as QuestionBulkUploadQuestionInput,
        index + 1,
        instituteId,
      ),
    );

    return {
      actorId: normalizeRequiredString(input.actorId, "actorId"),
      actorLicenseLayer,
      actorRole: normalizeRequiredString(input.actorRole, "actorRole")
        .toLowerCase(),
      commit: input.commit === true,
      instituteId,
      ipAddress: normalizeOptionalString(input.ipAddress),
      rows,
      userAgent: normalizeOptionalString(input.userAgent),
    };
  }

  public async ingestQuestions(
    request: QuestionBulkUploadValidatedRequest,
  ): Promise<QuestionBulkUploadResult> {
    const questionCollection = this.firestore
      .collection(INSTITUTES_COLLECTION)
      .doc(request.instituteId)
      .collection(QUESTION_BANK_COLLECTION);
    const existingSnapshots = await Promise.all(
      request.rows.map((row) => questionCollection.doc(row.questionId).get()),
    );
    const existingById = new Map<string, ExistingQuestionRecord>();

    existingSnapshots.forEach((snapshot, index) => {
      if (!snapshot.exists) {
        return;
      }

      const row = request.rows[index];
      if (!row) {
        return;
      }

      existingById.set(
        row.questionId,
        normalizeExistingQuestion(snapshot.data(), row.questionId),
      );
    });

    const uniqueKeyMatches = await Promise.all(
      request.rows.map((row) =>
        questionCollection.where("uniqueKey", "==", row.uniqueKey).limit(2).get(),
      ),
    );

    const rowResults: QuestionBulkUploadRowResult[] = [];
    const preparedRows: PreparedRow[] = [];
    const seenQuestionIds = new Set<string>();
    const seenUniqueKeys = new Set<string>();

    request.rows.forEach((row, index) => {
      const errors: string[] = [];
      const warnings: string[] = [];

      if (seenQuestionIds.has(row.questionId)) {
        errors.push("Duplicate questionId within upload.");
      }
      seenQuestionIds.add(row.questionId);

      if (seenUniqueKeys.has(row.uniqueKey)) {
        errors.push("Duplicate uniqueKey within upload.");
      }
      seenUniqueKeys.add(row.uniqueKey);

      const existingQuestion = existingById.get(row.questionId);
      const conflictingUniqueKey = uniqueKeyMatches[index]?.docs.find((document) =>
        document.id !== row.questionId,
      );

      if (conflictingUniqueKey) {
        errors.push("UniqueKey is already assigned to another question record.");
      }

      if (
        existingQuestion?.uniqueKey &&
        existingQuestion.uniqueKey !== row.uniqueKey
      ) {
        errors.push(
          "Existing questionId is linked to a different uniqueKey.",
        );
      }

      if (row.questionId === buildQuestionIdFromUniqueKey(row.uniqueKey, row.version)) {
        warnings.push("questionId was derived from uniqueKey and version.");
      }

      const rowResult: QuestionBulkUploadRowResult = {
        action: existingQuestion ? "update" : "create",
        errors,
        questionId: row.questionId,
        rowNumber: row.rowNumber,
        uniqueKey: row.uniqueKey,
        warnings,
      };

      rowResults.push(rowResult);

      if (errors.length === 0) {
        preparedRows.push({
          action: existingQuestion ? "update" : "create",
          existingQuestion,
          row,
        });
      }
    });

    const invalid = rowResults.filter((row) => row.errors.length > 0).length;
    const warningCount = rowResults.reduce((total, row) =>
      total + row.warnings.length, 0,
    );
    const createdCount = preparedRows.filter((row) => row.action === "create").length;
    const updatedCount = preparedRows.filter((row) => row.action === "update").length;
    const canCommit = request.commit && invalid === 0;

    let uploadLogId: string | null = null;
    let uploadLogPath: string | null = null;

    if (canCommit) {
      const batch = this.firestore.batch();
      const now = Timestamp.fromDate(new Date());
      const questionUploadLogReference = this.firestore
        .collection(INSTITUTES_COLLECTION)
        .doc(request.instituteId)
        .collection(QUESTION_UPLOAD_LOGS_COLLECTION)
        .doc();

      preparedRows.forEach((entry) => {
        const documentReference = questionCollection.doc(entry.row.questionId);
        const createdAt = entry.existingQuestion?.createdAt ?? now;

        batch.set(documentReference, {
          chapter: entry.row.chapter,
          correctAnswer: entry.row.correctAnswer,
          createdAt,
          difficulty: entry.row.difficulty,
          examType: entry.row.examType,
          lastUsedAt: entry.existingQuestion?.lastUsedAt ?? null,
          marks: entry.row.marks,
          negativeMarks: entry.row.negativeMarks,
          parentQuestionId: entry.row.parentQuestionId,
          primaryTag: entry.existingQuestion?.primaryTag ?? null,
          questionId: entry.row.questionId,
          questionImageUrl: entry.row.questionImageUrl,
          questionTextKeywords: entry.row.questionTextKeywords,
          questionType: entry.row.questionType,
          searchTokens: entry.existingQuestion?.searchTokens ?? [],
          simulationLink: entry.row.simulationLink,
          solutionImageUrl: entry.row.solutionImageUrl,
          status: entry.row.status,
          subject: entry.row.subject,
          tags: entry.row.tags,
          tutorialVideoLink: entry.row.tutorialVideoLink,
          uniqueKey: entry.row.uniqueKey,
          updatedAt: now,
          usedCount: entry.existingQuestion?.usedCount ?? 0,
          version: entry.row.version,
        });
      });

      batch.create(questionUploadLogReference, {
        created: createdCount,
        errors: invalid,
        committedAt: now,
        totalRows: request.rows.length,
        uploadedBy: request.actorId,
        versionCreated: createdCount,
        warnings: warningCount,
      });

      await batch.commit();
      uploadLogId = questionUploadLogReference.id;
      uploadLogPath = questionUploadLogReference.path;
    }

    const result: QuestionBulkUploadResult = {
      commitRequested: request.commit,
      committed: canCommit,
      rows: rowResults,
      summary: {
        created: canCommit ? createdCount : 0,
        invalid,
        received: request.rows.length,
        updated: canCommit ? updatedCount : 0,
        valid: request.rows.length - invalid,
        warnings: warningCount,
      },
      uploadLogId,
      uploadLogPath,
    };

    this.logger.info("Question bulk upload evaluated.", {
      committed: result.committed,
      created: result.summary.created,
      instituteId: request.instituteId,
      invalid,
      received: request.rows.length,
      updated: result.summary.updated,
      warnings: warningCount,
    });

    return result;
  }

  private normalizeRow(
    value: QuestionBulkUploadQuestionInput,
    rowNumber: number,
    instituteId: string,
  ): QuestionBulkUploadValidatedRow {
    const uniqueKey = normalizeRequiredString(value.uniqueKey, "uniqueKey");
    const version = normalizeRequiredPositiveInteger(value.version ?? 1, "version");
    const questionId = normalizeOptionalString(value.questionId) ??
      buildQuestionIdFromUniqueKey(uniqueKey, version);
    const difficulty = normalizeRequiredString(
      value.difficulty,
      "difficulty",
    );

    if (!ALLOWED_DIFFICULTIES.has(difficulty)) {
      throw new QuestionBulkUploadValidationError(
        "VALIDATION_ERROR",
        `Row ${rowNumber} must include a supported difficulty.`,
      );
    }

    const status = normalizeOptionalString(value.status)?.toLowerCase() ?? "active";
    if (!ALLOWED_STATUSES.has(status as QuestionStatus)) {
      throw new QuestionBulkUploadValidationError(
        "VALIDATION_ERROR",
        `Row ${rowNumber} must include a supported status value.`,
      );
    }

    return {
      chapter: normalizeRequiredString(value.chapter, "chapter"),
      correctAnswer: normalizeRequiredString(value.correctAnswer, "correctAnswer")
        .toUpperCase(),
      difficulty: difficulty as QuestionBulkUploadValidatedRow["difficulty"],
      examType: normalizeRequiredString(value.examType, "examType"),
      marks: normalizeRequiredNumber(value.marks, "marks"),
      negativeMarks: normalizeRequiredNumber(
        value.negativeMarks ?? 0,
        "negativeMarks",
      ),
      parentQuestionId: normalizeOptionalNullableString(value.parentQuestionId),
      questionId,
      questionImageUrl: normalizeManagedQuestionAssetPath(
        value.questionImageUrl,
        {
          assetKind: "questionImage",
          instituteId,
          questionId,
          rowNumber,
          version,
        },
      ),
      questionTextKeywords: normalizeDelimitedKeywordList(
        value.questionTextKeywords,
      ),
      questionType: normalizeRequiredString(value.questionType, "questionType"),
      rowNumber,
      simulationLink: normalizeOptionalNullableString(value.simulationLink),
      solutionImageUrl: normalizeManagedQuestionAssetPath(
        value.solutionImageUrl,
        {
          assetKind: "solutionImage",
          instituteId,
          questionId,
          rowNumber,
          version,
        },
      ),
      status: status as QuestionStatus,
      subject: normalizeRequiredString(value.subject, "subject"),
      tags: normalizeDelimitedStringList(value.tags),
      tutorialVideoLink: normalizeOptionalNullableString(value.tutorialVideoLink),
      uniqueKey,
      version,
    };
  }
}

export const questionBulkUploadService = new QuestionBulkUploadService();
