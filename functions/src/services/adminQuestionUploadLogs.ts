import {Timestamp} from "firebase-admin/firestore";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  AdminQuestionUploadLogRecord,
  AdminQuestionUploadLogsResult,
  AdminQuestionUploadLogsValidatedRequest,
  AdminQuestionUploadLogsValidationError,
} from "../types/adminQuestionUploadLogs";

const INSTITUTES_COLLECTION = "institutes";
const QUESTION_UPLOAD_LOGS_COLLECTION = "questionUploadLogs";
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

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
}

export const adminQuestionUploadLogsService = new AdminQuestionUploadLogsService();
