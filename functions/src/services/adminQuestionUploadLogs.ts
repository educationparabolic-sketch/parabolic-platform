import {Timestamp} from "firebase-admin/firestore";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  AdminQuestionUploadLogDetailResult,
  AdminQuestionPackageRowResult,
  AdminQuestionPackageState,
  AdminQuestionPackageSummary,
} from "../types/adminQuestionBank";
import {
  AdminQuestionUploadLogDetailValidatedRequest,
  AdminQuestionUploadLogRecord,
  AdminQuestionUploadLogsResult,
  AdminQuestionUploadLogsValidatedRequest,
  AdminQuestionUploadLogsValidationError,
} from "../types/adminQuestionUploadLogs";

const INSTITUTES_COLLECTION = "institutes";
const QUESTION_UPLOAD_LOGS_COLLECTION = "questionUploadLogs";
const QUESTION_PACKAGES_COLLECTION = "questionPackages";
const QUESTION_BANK_COLLECTION = "questionBank";
const TESTS_COLLECTION = "tests";
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const MAX_PACKAGE_QUESTIONS = 100;
const MAX_USAGE_TEMPLATES = 100;

function normalizeRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AdminQuestionUploadLogsValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a non-empty string.`,
    );
  }

  return value.trim();
}

function normalizeLimit(value: unknown): number {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_LIMIT;
  }

  const parsedValue =
    typeof value === "string" ? Number.parseInt(value, 10) : Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new AdminQuestionUploadLogsValidationError(
      "VALIDATION_ERROR",
      "Field \"limit\" must be a positive integer.",
    );
  }

  return Math.min(parsedValue, MAX_LIMIT);
}

function normalizeLogRecord(
  id: string,
  value: FirebaseFirestore.DocumentData | undefined,
): AdminQuestionUploadLogRecord {
  const timestampValue =
    value?.committedAt instanceof Timestamp ? value.committedAt :
      value?.createdAt instanceof Timestamp ? value.createdAt :
        null;

  return {
    created:
      typeof value?.created === "number" && Number.isFinite(value.created) ?
        value.created :
        0,
    errors:
      typeof value?.errors === "number" && Number.isFinite(value.errors) ?
        value.errors :
        0,
    id,
    timestamp:
      timestampValue ? timestampValue.toDate().toISOString() : new Date(0).toISOString(),
    totalRows:
      typeof value?.totalRows === "number" && Number.isFinite(value.totalRows) ?
        value.totalRows :
        0,
    uploadedBy:
      typeof value?.uploadedBy === "string" && value.uploadedBy.trim().length > 0 ?
        value.uploadedBy.trim() :
        "unknown",
    versionCreated:
      typeof value?.versionCreated === "number" && Number.isFinite(value.versionCreated) ?
        value.versionCreated :
        0,
    warnings:
      typeof value?.warnings === "number" && Number.isFinite(value.warnings) ?
        value.warnings :
        0,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function toTimestampIso(value: unknown): string | null {
  return value instanceof Timestamp ? value.toDate().toISOString() :
    typeof value === "string" && value.trim() ? value.trim() : null;
}

function requirePackageState(value: unknown): AdminQuestionPackageState {
  if (
    value === "validation_failed" || value === "validated" ||
    value === "committing" || value === "committed" ||
    value === "rollback_pending" || value === "rolled_back" ||
    value === "failed_recoverable"
  ) return value;
  throw new AdminQuestionUploadLogsValidationError(
    "CONFLICT", "Question upload log has an invalid package state.",
  );
}

function requireRows(value: unknown): AdminQuestionPackageRowResult[] {
  if (!Array.isArray(value) || value.length > MAX_PACKAGE_QUESTIONS + 1) {
    throw new AdminQuestionUploadLogsValidationError(
      "CONFLICT", "Question upload log row authority is invalid or over-bound.",
    );
  }
  return value as AdminQuestionPackageRowResult[];
}

function requireSummary(value: unknown): AdminQuestionPackageSummary {
  if (!isRecord(value)) {
    throw new AdminQuestionUploadLogsValidationError(
      "CONFLICT", "Question upload log summary authority is invalid.",
    );
  }
  return value as unknown as AdminQuestionPackageSummary;
}

function rollbackState(input: {
  packageData: FirebaseFirestore.DocumentData;
  questionSnapshots: FirebaseFirestore.DocumentSnapshot[];
  templates: FirebaseFirestore.QueryDocumentSnapshot[];
}): {eligible: boolean; reason: string | null} {
  if (input.packageData.state !== "committed") {
    return {eligible: false, reason: "Only a committed package can be rolled back."};
  }
  const result = isRecord(input.packageData.commitResult) ?
    input.packageData.commitResult : {};
  const questions = Array.isArray(result.questions) ? result.questions : [];
  if (questions.length === 0 || questions.length > MAX_PACKAGE_QUESTIONS) {
    return {eligible: false, reason: "Committed question authority is missing or over-bound."};
  }
  if (questions.some((question) => !isRecord(question) || question.action !== "create")) {
    return {eligible: false, reason: "Packages containing updates cannot be safely rolled back."};
  }
  for (let index = 0; index < questions.length; index += 1) {
    const authority = questions[index] as Record<string, unknown>;
    const snapshot = input.questionSnapshots[index];
    if (!snapshot?.exists) {
      return {eligible: false, reason: "A committed question is missing."};
    }
    const data = snapshot.data() ?? {};
    if (data.revision !== authority.revision || data.version !== authority.version) {
      return {eligible: false, reason: "A committed question changed after import."};
    }
    if ((typeof data.usedCount === "number" && data.usedCount > 0) ||
      data.usedInTemplate === true || data.status === "used" ||
      (typeof data.successorQuestionId === "string" && data.successorQuestionId)) {
      return {eligible: false, reason: "A committed question is already in use or versioned."};
    }
  }
  const activeUsage = input.templates.some((template) => {
    const data = template.data();
    return data.status === "assigned" ||
      (typeof data.totalRuns === "number" && data.totalRuns > 0);
  });
  return activeUsage ?
    {eligible: false, reason: "A committed question is used by an assigned template."} :
    {eligible: true, reason: null};
}

export class AdminQuestionUploadLogsService {
  constructor(
    private readonly firestore: FirebaseFirestore.Firestore = getFirestore(),
  ) {}

  public normalizeRequest(input: {
    instituteId?: unknown;
    limit?: unknown;
  }): AdminQuestionUploadLogsValidatedRequest {
    return {
      instituteId: normalizeRequiredString(input.instituteId, "instituteId"),
      limit: normalizeLimit(input.limit),
    };
  }

  public normalizeDetailRequest(input: {
    instituteId?: unknown;
    uploadLogId?: unknown;
  }): AdminQuestionUploadLogDetailValidatedRequest {
    return {
      instituteId: normalizeRequiredString(input.instituteId, "instituteId"),
      uploadLogId: normalizeRequiredString(input.uploadLogId, "uploadLogId"),
    };
  }

  public async getLogs(
    request: AdminQuestionUploadLogsValidatedRequest,
  ): Promise<AdminQuestionUploadLogsResult> {
    const snapshot = await this.firestore
      .collection(INSTITUTES_COLLECTION)
      .doc(request.instituteId)
      .collection(QUESTION_UPLOAD_LOGS_COLLECTION)
      .orderBy("committedAt", "desc")
      .limit(request.limit)
      .get();

    return {
      logs: snapshot.docs.map((document) =>
        normalizeLogRecord(document.id, document.data()),
      ),
    };
  }

  public async getLogDetail(
    request: AdminQuestionUploadLogDetailValidatedRequest,
  ): Promise<AdminQuestionUploadLogDetailResult> {
    const institute = this.firestore.collection(INSTITUTES_COLLECTION)
      .doc(request.instituteId);
    const logReference = institute.collection(QUESTION_UPLOAD_LOGS_COLLECTION)
      .doc(request.uploadLogId);
    const logSnapshot = await logReference.get();
    if (!logSnapshot.exists) {
      throw new AdminQuestionUploadLogsValidationError(
        "NOT_FOUND", `Question upload log "${request.uploadLogId}" was not found.`,
      );
    }
    const logData = logSnapshot.data() ?? {};
    const packageId = normalizeRequiredString(logData.packageId, "packageId");
    if (packageId !== request.uploadLogId) {
      throw new AdminQuestionUploadLogsValidationError(
        "CONFLICT", "Question upload log and package identifiers diverge.",
      );
    }
    const packageSnapshot = await institute.collection(QUESTION_PACKAGES_COLLECTION)
      .doc(packageId).get();
    if (!packageSnapshot.exists) {
      throw new AdminQuestionUploadLogsValidationError(
        "CONFLICT", "Question upload log is missing package authority.",
      );
    }
    const packageData = packageSnapshot.data() ?? {};
    const validationResult = isRecord(packageData.validationResult) ?
      packageData.validationResult : {};
    const rows = requireRows(logData.rows);
    const summary = requireSummary(logData.summary);
    if (validationResult.contentSha256 !== logData.contentSha256 ||
      stableJson(validationResult.rows) !== stableJson(rows) ||
      stableJson(validationResult.summary) !== stableJson(summary)) {
      throw new AdminQuestionUploadLogsValidationError(
        "CONFLICT", "Immutable question validation-log authority diverged.",
      );
    }
    const commitResult = isRecord(packageData.commitResult) ? packageData.commitResult : {};
    const committedQuestions = Array.isArray(commitResult.questions) ?
      commitResult.questions : [];
    if (committedQuestions.length > MAX_PACKAGE_QUESTIONS) {
      throw new AdminQuestionUploadLogsValidationError(
        "CONFLICT", "Committed question authority exceeds the read bound.",
      );
    }
    const questionIds = committedQuestions.map((question) => {
      if (!isRecord(question)) {
        throw new AdminQuestionUploadLogsValidationError(
          "CONFLICT", "Committed question authority is invalid.",
        );
      }
      return normalizeRequiredString(question.questionId, "commitResult.questionId");
    });
    const questionReferences = questionIds.map((questionId) =>
      institute.collection(QUESTION_BANK_COLLECTION).doc(questionId));
    const questionSnapshots = questionReferences.length ?
      await this.firestore.getAll(...questionReferences) : [];
    const templateById = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    for (let offset = 0; offset < questionIds.length; offset += 30) {
      const chunk = questionIds.slice(offset, offset + 30);
      if (!chunk.length) continue;
      const templates = await institute.collection(TESTS_COLLECTION)
        .where("questionIds", "array-contains-any", chunk)
        .limit(MAX_USAGE_TEMPLATES + 1).get();
      templates.docs.forEach((template) => templateById.set(template.id, template));
      if (templateById.size > MAX_USAGE_TEMPLATES) {
        throw new AdminQuestionUploadLogsValidationError(
          "CONFLICT", `Question usage exceeds the ${MAX_USAGE_TEMPLATES}-template read bound.`,
        );
      }
    }
    const rollback = rollbackState({
      packageData,
      questionSnapshots,
      templates: Array.from(templateById.values()),
    });
    const validatedAt = toTimestampIso(logData.validatedAt);
    if (!validatedAt) {
      throw new AdminQuestionUploadLogsValidationError(
        "CONFLICT", "Question upload log is missing its validation timestamp.",
      );
    }
    return {
      committedAt: toTimestampIso(logData.committedAt),
      contentSha256: normalizeRequiredString(logData.contentSha256, "contentSha256"),
      packageId,
      packageRevision:
        typeof logData.packageRevision === "number" &&
        Number.isInteger(logData.packageRevision) && logData.packageRevision > 0 ?
          logData.packageRevision : 1,
      rollbackEligible: rollback.eligible,
      rollbackReason: rollback.reason,
      rows,
      state: requirePackageState(logData.state),
      summary,
      uploadLogId: request.uploadLogId,
      uploadedBy: normalizeRequiredString(logData.uploadedBy, "uploadedBy"),
      validatedAt,
    };
  }
}

export const adminQuestionUploadLogsService = new AdminQuestionUploadLogsService();
