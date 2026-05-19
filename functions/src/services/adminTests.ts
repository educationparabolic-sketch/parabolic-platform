/* eslint-disable require-jsdoc */
import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  AdminTestDifficultyDistribution,
  AdminTestsCreateRequest,
  AdminTestsCreateResult,
  AdminTestsListRequest,
  AdminTestSelectionMethod,
  AdminTestsValidationError,
  AdminTestTemplateRecord,
  AdminTestTemplateStatus,
  AdminTestTimingProfile,
  AdminTestTimingWindow,
} from "../types/adminTests";

const INSTITUTES_COLLECTION = "institutes";
const TESTS_COLLECTION = "tests";
const DEFAULT_LIMIT = 250;
const MAX_LIMIT = 500;
const SELECTION_METHODS = new Set<AdminTestSelectionMethod>([
  "manual",
  "offset_limit",
  "round_robin",
  "shuffle_slice",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeRequiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AdminTestsValidationError(
      "VALIDATION_ERROR",
      `Field "${field}" must be a non-empty string.`,
    );
  }

  return value.trim();
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ?
    value.trim() :
    undefined;
}

function toNonEmptyString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ?
    value.trim() :
    fallback;
}

function normalizePositiveInteger(value: unknown, field: string): number {
  const parsed = typeof value === "string" ? Number(value) : value;

  if (
    typeof parsed !== "number" ||
    !Number.isFinite(parsed) ||
    !Number.isInteger(parsed) ||
    parsed <= 0
  ) {
    throw new AdminTestsValidationError(
      "VALIDATION_ERROR",
      `Field "${field}" must be a positive integer.`,
    );
  }

  return parsed;
}

function normalizeNonNegativeInteger(value: unknown, field: string): number {
  const parsed = typeof value === "string" ? Number(value) : value;

  if (
    typeof parsed !== "number" ||
    !Number.isFinite(parsed) ||
    !Number.isInteger(parsed) ||
    parsed < 0
  ) {
    throw new AdminTestsValidationError(
      "VALIDATION_ERROR",
      `Field "${field}" must be a non-negative integer.`,
    );
  }

  return parsed;
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function normalizeLimit(value: unknown): number {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_LIMIT;
  }

  return Math.min(normalizePositiveInteger(value, "limit"), MAX_LIMIT);
}

function normalizeSelectionMethod(value: unknown): AdminTestSelectionMethod {
  const normalized = normalizeRequiredString(value, "selectionMethod");
  if (!SELECTION_METHODS.has(normalized as AdminTestSelectionMethod)) {
    throw new AdminTestsValidationError(
      "VALIDATION_ERROR",
      "Field \"selectionMethod\" must be a supported template selection " +
        "method.",
    );
  }

  return normalized as AdminTestSelectionMethod;
}

function toSelectionMethod(value: unknown): AdminTestSelectionMethod {
  return typeof value === "string" &&
    SELECTION_METHODS.has(value as AdminTestSelectionMethod) ?
    value as AdminTestSelectionMethod :
    "manual";
}

function normalizeQuestionIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new AdminTestsValidationError(
      "VALIDATION_ERROR",
      "Field \"questionIds\" must be an array of question ids.",
    );
  }

  const ids = value.map((entry) => normalizeRequiredString(
    entry,
    "questionIds[]",
  ));
  const uniqueIds = [...new Set(ids)];

  if (uniqueIds.length === 0) {
    throw new AdminTestsValidationError(
      "VALIDATION_ERROR",
      "Field \"questionIds\" must contain at least one question id.",
    );
  }

  if (uniqueIds.length !== ids.length) {
    throw new AdminTestsValidationError(
      "VALIDATION_ERROR",
      "Field \"questionIds\" must not contain duplicate ids.",
    );
  }

  return uniqueIds;
}

function normalizeDifficultyDistribution(
  value: unknown,
): AdminTestDifficultyDistribution {
  if (!isRecord(value)) {
    throw new AdminTestsValidationError(
      "VALIDATION_ERROR",
      "Field \"difficultyDistribution\" must be an object.",
    );
  }

  return {
    easy: normalizeNonNegativeInteger(
      value.easy,
      "difficultyDistribution.easy",
    ),
    hard: normalizeNonNegativeInteger(
      value.hard,
      "difficultyDistribution.hard",
    ),
    medium: normalizeNonNegativeInteger(
      value.medium,
      "difficultyDistribution.medium",
    ),
  };
}

function normalizeTimingWindow(
  value: unknown,
  field: string,
): AdminTestTimingWindow {
  if (!isRecord(value)) {
    throw new AdminTestsValidationError(
      "VALIDATION_ERROR",
      `Field "${field}" must be an object.`,
    );
  }

  const minSeconds = normalizePositiveInteger(
    value.minSeconds ?? value.min,
    `${field}.minSeconds`,
  );
  const maxSeconds = normalizePositiveInteger(
    value.maxSeconds ?? value.max,
    `${field}.maxSeconds`,
  );

  if (minSeconds > maxSeconds) {
    throw new AdminTestsValidationError(
      "VALIDATION_ERROR",
      `Field "${field}" must satisfy minSeconds <= maxSeconds.`,
    );
  }

  return {maxSeconds, minSeconds};
}

function normalizeTimingProfile(value: unknown): AdminTestTimingProfile {
  if (!isRecord(value)) {
    throw new AdminTestsValidationError(
      "VALIDATION_ERROR",
      "Field \"timingProfile\" must be an object.",
    );
  }

  return {
    easy: normalizeTimingWindow(value.easy, "timingProfile.easy"),
    hard: normalizeTimingWindow(value.hard, "timingProfile.hard"),
    medium: normalizeTimingWindow(value.medium, "timingProfile.medium"),
  };
}

function toTimingWindow(value: unknown): AdminTestTimingWindow {
  if (!isRecord(value)) {
    return {maxSeconds: 60, minSeconds: 30};
  }

  return {
    maxSeconds: Math.max(1, Math.round(
      toNumber(value.maxSeconds ?? value.max, 60),
    )),
    minSeconds: Math.max(1, Math.round(
      toNumber(value.minSeconds ?? value.min, 30),
    )),
  };
}

function toStatus(value: unknown): AdminTestTemplateStatus {
  if (
    value === "draft" ||
    value === "ready" ||
    value === "assigned" ||
    value === "archived" ||
    value === "deprecated"
  ) {
    return value;
  }

  return "draft";
}

function toIsoString(value: unknown): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  return new Date(0).toISOString();
}

function toTemplateRecord(
  snapshot: FirebaseFirestore.QueryDocumentSnapshot,
): AdminTestTemplateRecord {
  const data = snapshot.data();
  const difficultyDistribution = isRecord(data.difficultyDistribution) ?
    data.difficultyDistribution :
    {};
  const timingProfile = isRecord(data.timingProfile) ? data.timingProfile : {};
  const questionIds = Array.isArray(data.questionIds) ?
    data.questionIds.filter((entry): entry is string =>
      typeof entry === "string" && entry.trim().length > 0,
    ) :
    [];

  return {
    canonicalId: toNonEmptyString(data.canonicalId, snapshot.id),
    difficultyDistribution: {
      easy: Math.max(0, Math.round(toNumber(difficultyDistribution.easy))),
      hard: Math.max(0, Math.round(toNumber(difficultyDistribution.hard))),
      medium: Math.max(0, Math.round(toNumber(difficultyDistribution.medium))),
    },
    examType: toNonEmptyString(data.examType, "General"),
    id: toNonEmptyString(data.testId, snapshot.id),
    selectedQuestionIds: questionIds,
    selectionMethod: toSelectionMethod(data.selectionMethod),
    status: toStatus(data.status),
    templateName: toNonEmptyString(data.templateName, snapshot.id),
    timingProfile: {
      easy: toTimingWindow(timingProfile.easy),
      hard: toTimingWindow(timingProfile.hard),
      medium: toTimingWindow(timingProfile.medium),
    },
    totalDurationMinutes: Math.max(30, Math.round(
      toNumber(data.totalDurationMinutes ?? data.durationMinutes, 180),
    )),
    updatedAt: toIsoString(data.updatedAt ?? data.createdAt),
  };
}

function toFirestoreTimingProfile(
  value: AdminTestTimingProfile,
): Record<string, {min: number; max: number}> {
  return {
    easy: {max: value.easy.maxSeconds, min: value.easy.minSeconds},
    hard: {max: value.hard.maxSeconds, min: value.hard.minSeconds},
    medium: {max: value.medium.maxSeconds, min: value.medium.minSeconds},
  };
}

export class AdminTestsService {
  constructor(
    private readonly firestore: FirebaseFirestore.Firestore = getFirestore(),
  ) {}

  public normalizeListRequest(input: {
    instituteId?: unknown;
    limit?: unknown;
  }): AdminTestsListRequest {
    return {
      instituteId: normalizeRequiredString(input.instituteId, "instituteId"),
      limit: normalizeLimit(input.limit),
    };
  }

  public normalizeCreateRequest(input: {
    actorId?: unknown;
    actorRole?: unknown;
    body?: unknown;
    instituteId?: unknown;
    ipAddress?: string;
    userAgent?: unknown;
  }): AdminTestsCreateRequest {
    const body = isRecord(input.body) ? input.body : {};
    const questionIds = normalizeQuestionIds(
      body.questionIds ?? body.selectedQuestionIds,
    );
    const difficultyDistribution = normalizeDifficultyDistribution(
      body.difficultyDistribution,
    );
    const difficultyTotal =
      difficultyDistribution.easy +
      difficultyDistribution.medium +
      difficultyDistribution.hard;

    if (difficultyTotal !== questionIds.length) {
      throw new AdminTestsValidationError(
        "VALIDATION_ERROR",
        "difficultyDistribution total must match questionIds length.",
      );
    }

    return {
      actorId: normalizeRequiredString(input.actorId, "actorId"),
      actorRole: normalizeRequiredString(input.actorRole, "actorRole"),
      canonicalId: normalizeRequiredString(body.canonicalId, "canonicalId"),
      difficultyDistribution,
      examType: normalizeRequiredString(body.examType, "examType"),
      instituteId: normalizeRequiredString(input.instituteId, "instituteId"),
      ipAddress: input.ipAddress,
      publish: body.publish === true,
      questionIds,
      selectionMethod: normalizeSelectionMethod(body.selectionMethod),
      templateName: normalizeRequiredString(body.templateName, "templateName"),
      timingProfile: normalizeTimingProfile(body.timingProfile),
      totalDurationMinutes: normalizePositiveInteger(
        body.totalDurationMinutes,
        "totalDurationMinutes",
      ),
      userAgent: normalizeOptionalString(input.userAgent),
    };
  }

  public async listTemplates(
    request: AdminTestsListRequest,
  ): Promise<AdminTestTemplateRecord[]> {
    const snapshot = await this.firestore
      .collection(INSTITUTES_COLLECTION)
      .doc(request.instituteId)
      .collection(TESTS_COLLECTION)
      .limit(request.limit)
      .get();

    return snapshot.docs
      .map(toTemplateRecord)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  public async createTemplate(
    request: AdminTestsCreateRequest,
  ): Promise<AdminTestsCreateResult> {
    const templatesCollection = this.firestore
      .collection(INSTITUTES_COLLECTION)
      .doc(request.instituteId)
      .collection(TESTS_COLLECTION);
    const templateReference = templatesCollection.doc();
    const status: AdminTestTemplateStatus = request.publish ? "ready" : "draft";

    await templateReference.set({
      academicYear: null,
      canonicalId: request.canonicalId,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: request.actorId,
      createdByRole: request.actorRole,
      createdFromIp: request.ipAddress,
      createdFromUserAgent: request.userAgent,
      difficultyDistribution: request.difficultyDistribution,
      examType: request.examType,
      questionIds: request.questionIds,
      selectionMethod: request.selectionMethod,
      status,
      templateName: request.templateName,
      testId: templateReference.id,
      timingProfile: toFirestoreTimingProfile(request.timingProfile),
      totalDurationMinutes: request.totalDurationMinutes,
      totalQuestions: request.questionIds.length,
      totalRuns: 0,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const savedSnapshot = await templateReference.get();

    return {
      template: toTemplateRecord(
        savedSnapshot as FirebaseFirestore.QueryDocumentSnapshot,
      ),
    };
  }
}

export const adminTestsService = new AdminTestsService();
