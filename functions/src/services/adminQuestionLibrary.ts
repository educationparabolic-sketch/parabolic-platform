import {Timestamp} from "firebase-admin/firestore";
import {getFirestore} from "../utils/firebaseAdmin";
import {cdnArchitectureService} from "./cdnArchitecture";
import {signedUrlService} from "./signedUrl";
import {storageBucketArchitectureService} from "./storageBucketArchitecture";
import {QuestionBankDocument} from "../types/questionIngestion";
import {
  AdminQuestionLibraryRecord,
  AdminQuestionLibraryResult,
  AdminQuestionLibraryValidatedRequest,
  AdminQuestionLibraryValidationError,
} from "../types/adminQuestionLibrary";
import {QuestionAssetExtension, QuestionAssetKind} from "../types/cdnArchitecture";

const INSTITUTES_COLLECTION = "institutes";
const QUESTION_BANK_COLLECTION = "questionBank";
const DEFAULT_LIMIT = 250;
const MAX_LIMIT = 500;
const HOT_WINDOW_DAYS = 120;
const COLD_WINDOW_DAYS = 365;

type QuestionLifecycleState = AdminQuestionLibraryRecord["thermalState"];

interface SafeQuestionAssetReference {
  cdnPath: string;
  previewSignedUrl: string;
}

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

function toIsoDate(timestamp: Timestamp | null): string | null {
  return timestamp instanceof Timestamp ?
    timestamp.toDate().toISOString().slice(0, 10) :
    null;
}

function toQuestionBankDocument(
  snapshot: FirebaseFirestore.QueryDocumentSnapshot,
): QuestionBankDocument {
  const payload = snapshot.data();
  const tags = Array.isArray(payload.tags) ?
    payload.tags.filter((tag): tag is string => typeof tag === "string") :
    [];

  return {
    academicYear:
      typeof payload.academicYear === "string" && payload.academicYear.trim().length > 0 ?
        payload.academicYear.trim() :
        null,
    additionalTag:
      typeof payload.additionalTag === "string" && payload.additionalTag.trim().length > 0 ?
        payload.additionalTag.trim() :
        null,
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
    internalNotes:
      typeof payload.internalNotes === "string" && payload.internalNotes.trim().length > 0 ?
        payload.internalNotes.trim() :
        null,
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
    topic:
      typeof payload.topic === "string" && payload.topic.trim().length > 0 ?
        payload.topic.trim() :
        null,
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

function toQuestionAssetExtension(
  value: string,
): QuestionAssetExtension | null {
  const extension = value.split(".").pop()?.toLowerCase();
  return extension === "png" || extension === "webp" ? extension : null;
}

function toSafeQuestionAssetReference(
  storedPath: string,
  context: {
    assetKind: Extract<QuestionAssetKind, "questionImage" | "solutionImage">;
    instituteId: string;
    questionId: string;
    version: number;
  },
  generatePreviewUrl:
    typeof signedUrlService.generateQuestionAssetSignedUrl,
): SafeQuestionAssetReference {
  const candidatePath = storedPath.trim().replace(/^\/+/, "");
  const extension = toQuestionAssetExtension(candidatePath);

  if (!candidatePath || candidatePath.includes("://") || !extension) {
    return {cdnPath: "", previewSignedUrl: ""};
  }

  const target = storageBucketArchitectureService
    .resolveQuestionAssetStorageTarget({
      assetKind: context.assetKind,
      extension,
      instituteId: context.instituteId,
      questionId: context.questionId,
      version: context.version,
    });

  if (candidatePath !== target.cdnPath) {
    return {cdnPath: "", previewSignedUrl: ""};
  }

  const preview = generatePreviewUrl({
    accessContext: "dashboardView",
    assetKind: context.assetKind,
    extension,
    instituteId: context.instituteId,
    questionId: context.questionId,
    version: context.version,
  });

  let parsedPreviewUrl: URL;
  try {
    parsedPreviewUrl = new URL(preview.signedUrl);
  } catch {
    return {cdnPath: "", previewSignedUrl: ""};
  }

  if (
    preview.accessContext !== "dashboardView" ||
    preview.cdnPath !== target.cdnPath ||
    preview.expiresInSeconds !== 30 * 60 ||
    parsedPreviewUrl.protocol !== "https:" ||
    !parsedPreviewUrl.searchParams.get("Expires") ||
    !parsedPreviewUrl.searchParams.get("KeyName") ||
    !parsedPreviewUrl.searchParams.get("Signature")
  ) {
    return {cdnPath: "", previewSignedUrl: ""};
  }

  cdnArchitectureService.assertNoDirectBucketUrlExposure(preview.signedUrl);

  return {
    cdnPath: target.cdnPath,
    previewSignedUrl: preview.signedUrl,
  };
}

function toLibraryRecord(
  question: QuestionBankDocument,
  instituteId: string,
  generatePreviewUrl:
    typeof signedUrlService.generateQuestionAssetSignedUrl,
): AdminQuestionLibraryRecord {
  const primaryTag = question.primaryTag ?? question.tags[0] ?? "untagged";
  const secondaryTag =
    question.tags.find((tag) => tag !== primaryTag) ??
    question.tags[1] ??
    "none";
  const additionalTag =
    question.additionalTag ??
    question.tags.find((tag) => tag !== primaryTag && tag !== secondaryTag) ??
    "none";
  const questionImage = toSafeQuestionAssetReference(
    question.questionImageUrl,
    {
      assetKind: "questionImage",
      instituteId,
      questionId: question.questionId,
      version: question.version,
    },
    generatePreviewUrl,
  );
  const solutionImage = toSafeQuestionAssetReference(
    question.solutionImageUrl,
    {
      assetKind: "solutionImage",
      instituteId,
      questionId: question.questionId,
      version: question.version,
    },
    generatePreviewUrl,
  );

  return {
    academicYear: question.academicYear ?? "unassigned",
    additionalTag,
    chapter: question.chapter,
    correctAnswer: question.correctAnswer,
    difficulty: toDifficulty(question.difficulty),
    examType: question.examType,
    id: question.questionId,
    internalNotes: question.internalNotes ?? "",
    lastUsedDate: toIsoDate(question.lastUsedAt),
    marks: question.marks,
    negativeMarks: question.negativeMarks,
    primaryTag,
    prompt: `${question.subject} ${question.chapter} ${question.questionType}`,
    questionImageFile: questionImage.cdnPath,
    questionImagePreviewUrl: questionImage.previewSignedUrl,
    questionType: question.questionType,
    secondaryTag,
    simulationLink: question.simulationLink ?? "",
    solutionImageFile: solutionImage.cdnPath,
    solutionImagePreviewUrl: solutionImage.previewSignedUrl,
    status: question.status,
    subject: question.subject,
    thermalState: toThermalState(question),
    topic: question.topic ?? "",
    uniqueKey: question.uniqueKey,
    tutorialVideoLink: question.tutorialVideoLink ?? "",
    usedCount: question.usedCount,
    version: question.version,
  };
}

export class AdminQuestionLibraryService {
  constructor(
    private readonly firestore: FirebaseFirestore.Firestore = getFirestore(),
    private readonly generatePreviewUrl:
      typeof signedUrlService.generateQuestionAssetSignedUrl =
    signedUrlService.generateQuestionAssetSignedUrl.bind(signedUrlService),
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
        toLibraryRecord(
          toQuestionBankDocument(document),
          request.instituteId,
          this.generatePreviewUrl,
        ),
      ),
    };
  }
}

export const adminQuestionLibraryService = new AdminQuestionLibraryService();
