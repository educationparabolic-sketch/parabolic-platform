import {Timestamp} from "firebase-admin/firestore";
import {getFirestore} from "../utils/firebaseAdmin";
import {QuestionBankDocument} from "../types/questionIngestion";
import {
  AdminQuestionLibraryRecord,
  AdminQuestionLibraryResult,
  AdminQuestionLibraryValidatedRequest,
  AdminQuestionLibraryValidationError,
} from "../types/adminQuestionLibrary";

const INSTITUTES_COLLECTION = "institutes";
const QUESTION_BANK_COLLECTION = "questionBank";
const DEFAULT_LIMIT = 250;
const MAX_LIMIT = 500;
const HOT_WINDOW_DAYS = 120;
const COLD_WINDOW_DAYS = 365;

type QuestionLifecycleState = AdminQuestionLibraryRecord["thermalState"];

function normalizeRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AdminQuestionLibraryValidationError(
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
    throw new AdminQuestionLibraryValidationError(
      "VALIDATION_ERROR",
      "Field \"limit\" must be a positive integer.",
    );
  }

  return Math.min(parsedValue, MAX_LIMIT);
}

function toNonEmptyString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ?
    value.trim() :
    fallback;
}

function toNonNegativeNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return 0;
  }

  return value;
}

function toDifficulty(value: unknown): AdminQuestionLibraryRecord["difficulty"] {
  if (value === "Easy") {
    return "easy";
  }

  if (value === "Medium") {
    return "medium";
  }

  if (value === "Hard") {
    return "hard";
  }

  return "medium";
}

function toStatus(
  value: unknown,
): AdminQuestionLibraryRecord["status"] {
  if (
    value === "active" ||
    value === "used" ||
    value === "archived" ||
    value === "deprecated"
  ) {
    return value;
  }

  return "active";
}

function toThermalState(
  question: QuestionBankDocument,
): QuestionLifecycleState {
  if (question.status === "archived") {
    return "cold";
  }

  if (question.usedCount >= 3) {
    return "hot";
  }

  if (!(question.lastUsedAt instanceof Timestamp)) {
    return question.usedCount > 0 ? "warm" : "cold";
  }

  const ageDays =
    (Date.now() - question.lastUsedAt.toDate().getTime()) /
    (1000 * 60 * 60 * 24);

  if (ageDays <= HOT_WINDOW_DAYS) {
    return "hot";
  }

  if (ageDays >= COLD_WINDOW_DAYS) {
    return "cold";
  }

  return "warm";
}

function toQuestionBankDocument(
  snapshot: FirebaseFirestore.QueryDocumentSnapshot,
): QuestionBankDocument {
  const payload = snapshot.data();
  const tags = Array.isArray(payload.tags) ?
    payload.tags.filter((tag): tag is string => typeof tag === "string") :
    [];

  return {
    chapter: toNonEmptyString(payload.chapter, "Unknown Chapter"),
    correctAnswer: toNonEmptyString(payload.correctAnswer, ""),
    createdAt:
      payload.createdAt instanceof Timestamp ?
        payload.createdAt :
        Timestamp.fromDate(new Date(0)),
    difficulty:
      payload.difficulty === "Easy" ||
        payload.difficulty === "Medium" ||
        payload.difficulty === "Hard" ?
        payload.difficulty :
        "Medium",
    examType: toNonEmptyString(payload.examType, "General"),
    lastUsedAt: payload.lastUsedAt instanceof Timestamp ? payload.lastUsedAt : null,
    marks: toNonNegativeNumber(payload.marks),
    negativeMarks: toNonNegativeNumber(payload.negativeMarks),
    parentQuestionId:
      typeof payload.parentQuestionId === "string" ? payload.parentQuestionId : null,
    primaryTag:
      typeof payload.primaryTag === "string" && payload.primaryTag.trim().length > 0 ?
        payload.primaryTag.trim() :
        null,
    questionId: toNonEmptyString(payload.questionId, snapshot.id),
    questionImageUrl: toNonEmptyString(payload.questionImageUrl, ""),
    questionType: toNonEmptyString(payload.questionType, "Question"),
    searchTokens: Array.isArray(payload.searchTokens) ?
      payload.searchTokens.filter((token): token is string => typeof token === "string") :
      undefined,
    simulationLink:
      typeof payload.simulationLink === "string" ? payload.simulationLink : null,
    solutionImageUrl: toNonEmptyString(payload.solutionImageUrl, ""),
    status: toStatus(payload.status),
    subject: toNonEmptyString(payload.subject, "General"),
    tags,
    tutorialVideoLink:
      typeof payload.tutorialVideoLink === "string" ?
        payload.tutorialVideoLink :
        null,
    uniqueKey: toNonEmptyString(payload.uniqueKey, snapshot.id),
    usedCount: toNonNegativeNumber(payload.usedCount),
    version:
      Number.isInteger(payload.version) && payload.version > 0 ?
        payload.version :
        1,
  };
}

function toLibraryRecord(
  question: QuestionBankDocument,
): AdminQuestionLibraryRecord {
  const primaryTag = question.primaryTag ?? question.tags[0] ?? "untagged";
  const secondaryTag =
    question.tags.find((tag) => tag !== primaryTag) ??
    question.tags[1] ??
    "none";

  return {
    chapter: question.chapter,
    difficulty: toDifficulty(question.difficulty),
    id: question.questionId,
    marks: question.marks,
    negativeMarks: question.negativeMarks,
    primaryTag,
    prompt: `${question.subject} ${question.chapter} ${question.questionType}`,
    secondaryTag,
    status: question.status,
    subject: question.subject,
    thermalState: toThermalState(question),
    uniqueKey: question.uniqueKey,
    usedCount: question.usedCount,
    version: question.version,
  };
}

export class AdminQuestionLibraryService {
  constructor(
    private readonly firestore: FirebaseFirestore.Firestore = getFirestore(),
  ) {}

  public normalizeRequest(input: {
    instituteId?: unknown;
    limit?: unknown;
  }): AdminQuestionLibraryValidatedRequest {
    return {
      instituteId: normalizeRequiredString(input.instituteId, "instituteId"),
      limit: normalizeLimit(input.limit),
    };
  }

  public async getLibrary(
    request: AdminQuestionLibraryValidatedRequest,
  ): Promise<AdminQuestionLibraryResult> {
    const snapshot = await this.firestore
      .collection(INSTITUTES_COLLECTION)
      .doc(request.instituteId)
      .collection(QUESTION_BANK_COLLECTION)
      .orderBy("createdAt", "desc")
      .limit(request.limit)
      .get();

    return {
      questions: snapshot.docs.map((document) =>
        toLibraryRecord(toQuestionBankDocument(document)),
      ),
    };
  }
}

export const adminQuestionLibraryService = new AdminQuestionLibraryService();
