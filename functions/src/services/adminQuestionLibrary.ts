/* eslint-disable require-jsdoc */
import {createHash} from "node:crypto";
import {Timestamp} from "firebase-admin/firestore";
import {getFirestore} from "../utils/firebaseAdmin";
import {cdnArchitectureService} from "./cdnArchitecture";
import {signedUrlService} from "./signedUrl";
import {storageBucketArchitectureService} from "./storageBucketArchitecture";
import {
  AdminQuestionAnalyticsRecord,
  AdminQuestionAuthoritativeRecord,
  AdminQuestionDetailResult,
  AdminQuestionLifecycleStatus,
  AdminQuestionThermalState,
  AdminQuestionTemplateUsageRecord,
  AdminQuestionVersionSummary,
} from "../types/adminQuestionBank";
import {
  AdminQuestionDetailValidatedRequest,
  AdminQuestionLibraryValidatedRequest,
  AdminQuestionLibraryValidationError,
} from "../types/adminQuestionLibrary";
import {QuestionAssetExtension, QuestionAssetKind} from "../types/cdnArchitecture";

const INSTITUTES_COLLECTION = "institutes";
const ACADEMIC_YEARS_COLLECTION = "academicYears";
const QUESTION_BANK_COLLECTION = "questionBank";
const QUESTION_ANALYTICS_COLLECTION = "questionAnalytics";
const TESTS_COLLECTION = "tests";
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const MAX_THERMAL_SCAN = 500;
const MAX_USAGE_TEMPLATES = 100;
const MAX_VERSION_FAMILY = 20;
const TWO_YEARS_MS = 730 * 24 * 60 * 60 * 1000;
const ALLOWED_ROLES = new Set(["admin", "teacher"]);
const LIFECYCLE_STATUSES = new Set<AdminQuestionLifecycleStatus>([
  "active", "used", "archived", "deprecated",
]);

interface SafeQuestionAssetReference {
  cdnPath: string;
  previewSignedUrl: string;
}

interface LibraryCursor {
  createdAtMillis: number;
  fingerprint: string;
  questionId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, fieldName: string, max = 256): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new AdminQuestionLibraryValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a non-empty string.`,
    );
  }
  const normalized = value.trim();
  if (normalized.length > max) {
    throw new AdminQuestionLibraryValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be at most ${max} characters.`,
    );
  }
  return normalized;
}

function optionalString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return requiredString(value, fieldName);
}

function positiveLimit(value: unknown): number {
  if (value === undefined || value === null || value === "") return DEFAULT_LIMIT;
  const parsed = typeof value === "string" ? Number.parseInt(value, 10) : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
    throw new AdminQuestionLibraryValidationError(
      "VALIDATION_ERROR",
      `Field "limit" must be an integer between 1 and ${MAX_LIMIT}.`,
    );
  }
  return parsed;
}

function optionalBoolean(value: unknown, fieldName: string): boolean | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  throw new AdminQuestionLibraryValidationError(
    "VALIDATION_ERROR",
    `Field "${fieldName}" must be true or false.`,
  );
}

function optionalDifficulty(value: unknown): "Easy" | "Medium" | "Hard" | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const normalized = requiredString(value, "difficulty").toLowerCase();
  if (normalized === "easy") return "Easy";
  if (normalized === "medium") return "Medium";
  if (normalized === "hard") return "Hard";
  throw new AdminQuestionLibraryValidationError(
    "VALIDATION_ERROR",
    "Field \"difficulty\" must be Easy, Medium, or Hard.",
  );
}

function optionalStatus(value: unknown): AdminQuestionLifecycleStatus | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const normalized = requiredString(value, "status").toLowerCase() as
    AdminQuestionLifecycleStatus;
  if (!LIFECYCLE_STATUSES.has(normalized)) {
    throw new AdminQuestionLibraryValidationError(
      "VALIDATION_ERROR",
      "Field \"status\" has an unsupported lifecycle value.",
    );
  }
  return normalized;
}

function optionalThermalState(value: unknown): AdminQuestionThermalState | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const normalized = requiredString(value, "thermalState").toLowerCase();
  if (normalized !== "hot" && normalized !== "warm" && normalized !== "cold") {
    throw new AdminQuestionLibraryValidationError(
      "VALIDATION_ERROR",
      "Field \"thermalState\" must be hot, warm, or cold.",
    );
  }
  return normalized;
}

function normalizeSearchToken(value: unknown): string | undefined {
  const query = optionalString(value, "query");
  if (!query) return undefined;
  const tokens = query.toLowerCase().split(/[^a-z0-9]+/u).filter(Boolean);
  if (tokens.length !== 1) {
    throw new AdminQuestionLibraryValidationError(
      "VALIDATION_ERROR",
      "Field \"query\" must resolve to exactly one indexed search token.",
    );
  }
  return tokens[0];
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function queryFingerprint(request: AdminQuestionLibraryValidatedRequest, year: string): string {
  const entries = Object.entries(request)
    .filter(([key, value]) => !["actorId", "actorRole", "cursor"].includes(key) &&
      value !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return sha256(JSON.stringify({entries, year}));
}

function encodeCursor(cursor: LibraryCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(value: unknown, fingerprint: string): LibraryCursor | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const encoded = requiredString(value, "cursor", 1024);
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (!isRecord(parsed) || parsed.fingerprint !== fingerprint ||
      typeof parsed.createdAtMillis !== "number" ||
      !Number.isSafeInteger(parsed.createdAtMillis) || parsed.createdAtMillis < 0) {
      throw new Error("invalid cursor");
    }
    return {
      createdAtMillis: parsed.createdAtMillis,
      fingerprint,
      questionId: requiredString(parsed.questionId, "cursor.questionId"),
    };
  } catch (error) {
    if (error instanceof AdminQuestionLibraryValidationError) throw error;
    throw new AdminQuestionLibraryValidationError(
      "VALIDATION_ERROR",
      "Field \"cursor\" is invalid or does not match the active filters.",
    );
  }
}

function toString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function toNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function toPositiveInteger(value: unknown, fallback = 1): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

function toTimestamp(value: unknown, fallback?: Timestamp): Timestamp {
  if (value instanceof Timestamp) return value;
  if (fallback) return fallback;
  throw new AdminQuestionLibraryValidationError(
    "CONFLICT",
    "Question read authority is missing a required timestamp.",
  );
}

function toIso(value: unknown, fallback?: Timestamp): string {
  return toTimestamp(value, fallback).toDate().toISOString();
}

function toStatus(value: unknown): AdminQuestionLifecycleStatus {
  return LIFECYCLE_STATUSES.has(value as AdminQuestionLifecycleStatus) ?
    value as AdminQuestionLifecycleStatus : "active";
}

function thermalState(input: {
  currentAcademicYear: string;
  data: Record<string, unknown>;
  nowMillis: number;
}): AdminQuestionThermalState {
  const status = toStatus(input.data.status);
  if (status === "archived" || status === "deprecated") return "cold";
  if (toNullableString(input.data.lastUsedAcademicYear) === input.currentAcademicYear) {
    return "hot";
  }
  const used = toNumber(input.data.usedCount) > 0 ||
    input.data.usedInTemplate === true || status === "used";
  const activity = used && input.data.lastUsedAt instanceof Timestamp ?
    input.data.lastUsedAt : toTimestamp(input.data.createdAt);
  return input.nowMillis - activity.toMillis() > TWO_YEARS_MS ? "cold" : "warm";
}

function assetExtension(value: string): QuestionAssetExtension | null {
  const extension = value.split(".").pop()?.toLowerCase();
  return extension === "png" || extension === "webp" ? extension : null;
}

function safeAsset(
  storedPath: string,
  context: {
    assetKind: Extract<QuestionAssetKind, "questionImage" | "solutionImage">;
    instituteId: string;
    questionId: string;
    revision?: number;
    version: number;
  },
  generatePreviewUrl: typeof signedUrlService.generateQuestionAssetSignedUrl,
): SafeQuestionAssetReference {
  const candidatePath = storedPath.trim().replace(/^\/+/, "");
  const extension = assetExtension(candidatePath);
  if (!candidatePath || candidatePath.includes("://") || !extension) {
    return {cdnPath: "", previewSignedUrl: ""};
  }
  const target = storageBucketArchitectureService.resolveQuestionAssetStorageTarget({
    ...context,
    extension,
  });
  if (candidatePath !== target.cdnPath) return {cdnPath: "", previewSignedUrl: ""};
  const preview = generatePreviewUrl({...context, accessContext: "dashboardView", extension});
  try {
    const parsed = new URL(preview.signedUrl);
    if (preview.accessContext !== "dashboardView" || preview.cdnPath !== target.cdnPath ||
      preview.expiresInSeconds !== 1800 || parsed.protocol !== "https:" ||
      !parsed.searchParams.get("Expires") || !parsed.searchParams.get("KeyName") ||
      !parsed.searchParams.get("Signature")) {
      return {cdnPath: "", previewSignedUrl: ""};
    }
  } catch {
    return {cdnPath: "", previewSignedUrl: ""};
  }
  cdnArchitectureService.assertNoDirectBucketUrlExposure(preview.signedUrl);
  return {cdnPath: target.cdnPath, previewSignedUrl: preview.signedUrl};
}

function recordFromSnapshot(input: {
  currentAcademicYear: string;
  generatePreviewUrl: typeof signedUrlService.generateQuestionAssetSignedUrl;
  instituteId: string;
  nowMillis: number;
  snapshot: FirebaseFirestore.DocumentSnapshot;
}): AdminQuestionAuthoritativeRecord {
  const data = input.snapshot.data() ?? {};
  const questionId = toString(data.questionId, input.snapshot.id);
  const version = toPositiveInteger(data.version);
  const createdAt = toTimestamp(data.createdAt);
  const updatedAt = data.updatedAt instanceof Timestamp ? data.updatedAt : createdAt;
  const primaryTag = toNullableString(data.primaryTag) ?? "untagged";
  const secondaryTag = toNullableString(data.secondaryTag) ?? "none";
  const additionalTag = toNullableString(data.additionalTag) ?? "none";
  const questionImage = safeAsset(toString(data.questionImageUrl, ""), {
    assetKind: "questionImage", instituteId: input.instituteId, questionId,
    ...(typeof data.questionImageRevision === "number" ?
      {revision: toPositiveInteger(data.questionImageRevision)} : {}),
    version,
  }, input.generatePreviewUrl);
  const solutionImage = safeAsset(toString(data.solutionImageUrl, ""), {
    assetKind: "solutionImage", instituteId: input.instituteId, questionId,
    ...(typeof data.solutionImageRevision === "number" ?
      {revision: toPositiveInteger(data.solutionImageRevision)} : {}),
    version,
  }, input.generatePreviewUrl);
  const difficulty = toString(data.difficulty, "Medium").toLowerCase();
  const usedCount = toNumber(data.usedCount);
  return {
    academicYear: toNullableString(data.academicYear) ?? "unassigned",
    additionalTag,
    chapter: toString(data.chapter, "Unknown Chapter"),
    correctAnswer: toString(data.correctAnswer, ""),
    createdAt: createdAt.toDate().toISOString(),
    difficulty: difficulty === "easy" || difficulty === "hard" ? difficulty : "medium",
    examType: toString(data.examType, "General"),
    id: questionId,
    internalNotes: toNullableString(data.internalNotes) ?? "",
    lastUsedAcademicYear: toNullableString(data.lastUsedAcademicYear),
    lastUsedDate: data.lastUsedAt instanceof Timestamp ?
      data.lastUsedAt.toDate().toISOString().slice(0, 10) : null,
    marks: toNumber(data.marks),
    negativeMarks: toNumber(data.negativeMarks),
    parentQuestionId: toNullableString(data.parentQuestionId),
    primaryTag,
    prompt: toNullableString(data.questionText) ?? toNullableString(data.questionNo) ??
      `${toString(data.subject, "General")} ${toString(data.chapter, "Unknown Chapter")} ` +
      toString(data.questionType, "Question"),
    questionImageFile: questionImage.cdnPath,
    questionImagePreviewUrl: questionImage.previewSignedUrl,
    questionType: toString(data.questionType, "Question"),
    revision: toPositiveInteger(data.revision),
    secondaryTag,
    simulationLink: toNullableString(data.simulationLink) ?? "",
    solutionImageFile: solutionImage.cdnPath,
    solutionImagePreviewUrl: solutionImage.previewSignedUrl,
    status: toStatus(data.status),
    subject: toString(data.subject, "General"),
    thermalState: thermalState({
      currentAcademicYear: input.currentAcademicYear,
      data,
      nowMillis: input.nowMillis,
    }),
    topic: toNullableString(data.topic) ?? "",
    tutorialVideoLink: toNullableString(data.tutorialVideoLink) ?? "",
    uniqueKey: toString(data.uniqueKey, input.snapshot.id),
    updatedAt: updatedAt.toDate().toISOString(),
    usedCount,
    usedInTemplate: data.usedInTemplate === true || usedCount > 0 || data.status === "used",
    version,
  };
}

function analyticsFromSnapshot(
  snapshot: FirebaseFirestore.DocumentSnapshot,
): AdminQuestionAnalyticsRecord | null {
  if (!snapshot.exists) return null;
  const data = snapshot.data() ?? {};
  const marker = isRecord(data.processingMarkers) &&
    isRecord(data.processingMarkers.questionAnalyticsEngine) ?
    data.processingMarkers.questionAnalyticsEngine : {};
  const hasUsage = toNumber(marker.useCount) > 0 ||
    toNumber(data.correctAttemptCount) + toNumber(data.incorrectAttemptCount) > 0;
  if (!hasUsage) return null;
  return {
    avgAccuracyWhenUsed: toNumber(data.avgAccuracyWhenUsed),
    avgRawPercentWhenUsed: toNumber(data.avgRawPercentWhenUsed),
    averageResponseTimeMs: toNumber(data.averageResponseTimeMs),
    correctAttemptCount: toNumber(data.correctAttemptCount),
    disciplineStressIndex: toNumber(data.disciplineStressIndex),
    guessRate: toNumber(data.guessRate),
    incorrectAttemptCount: toNumber(data.incorrectAttemptCount),
    overstayRate: toNumber(data.overstayRate),
    riskImpactScore: toNumber(data.riskImpactScore),
  };
}

function versionSummary(snapshot: FirebaseFirestore.DocumentSnapshot): AdminQuestionVersionSummary {
  const data = snapshot.data() ?? {};
  return {
    createdAt: toIso(data.createdAt),
    parentQuestionId: toNullableString(data.parentQuestionId),
    questionId: toString(data.questionId, snapshot.id),
    revision: toPositiveInteger(data.revision),
    status: toStatus(data.status),
    version: toPositiveInteger(data.version),
  };
}

function usageRecord(snapshot: FirebaseFirestore.QueryDocumentSnapshot): AdminQuestionTemplateUsageRecord {
  const data = snapshot.data();
  const status = toString(data.status, "draft");
  return {
    lastUsedAt: data.lastUsedAt instanceof Timestamp ? data.lastUsedAt.toDate().toISOString() : null,
    runCount: toNumber(data.totalRuns),
    status: status === "ready" || status === "assigned" || status === "archived" ||
      status === "deprecated" ? status : "draft",
    testId: toString(data.testId, snapshot.id),
    testName: toString(data.templateName ?? data.name, snapshot.id),
    version: toPositiveInteger(data.version),
  };
}

export class AdminQuestionLibraryService {
  constructor(
    private readonly firestore: FirebaseFirestore.Firestore = getFirestore(),
    private readonly generatePreviewUrl:
      typeof signedUrlService.generateQuestionAssetSignedUrl =
    signedUrlService.generateQuestionAssetSignedUrl.bind(signedUrlService),
    private readonly now: () => Timestamp = () => Timestamp.now(),
  ) {}

  public normalizeRequest(input: Record<string, unknown>): AdminQuestionLibraryValidatedRequest {
    const actorRole = requiredString(input.actorRole, "actorRole").toLowerCase();
    if (!ALLOWED_ROLES.has(actorRole)) {
      throw new AdminQuestionLibraryValidationError(
        "FORBIDDEN", "Question Bank reads require the teacher or admin role.",
      );
    }
    const request: AdminQuestionLibraryValidatedRequest = {
      actorId: requiredString(input.actorId, "actorId"),
      actorRole,
      instituteId: requiredString(input.instituteId, "instituteId"),
      limit: positiveLimit(input.limit),
    };
    const strings = [
      "academicYear", "additionalTag", "chapter", "examType", "primaryTag",
      "questionType", "secondaryTag", "subject",
    ] as const;
    strings.forEach((field) => {
      const value = optionalString(input[field], field);
      if (value !== undefined) request[field] = value;
    });
    const difficulty = optionalDifficulty(input.difficulty);
    const status = optionalStatus(input.status);
    const thermal = optionalThermalState(input.thermalState);
    const used = optionalBoolean(input.usedInTemplate, "usedInTemplate");
    const query = normalizeSearchToken(input.query);
    if (difficulty) request.difficulty = difficulty;
    if (status) request.status = status;
    if (thermal) request.thermalState = thermal;
    if (used !== undefined) request.usedInTemplate = used;
    if (query) request.query = query;
    if (input.cursor !== undefined && input.cursor !== null && input.cursor !== "") {
      request.cursor = requiredString(input.cursor, "cursor", 1024);
    }
    const filterCount = [
      ...strings.map((field) => request[field]), difficulty, status, thermal,
      used, query,
    ].filter((value) => value !== undefined).length;
    const supportedPair = filterCount === 2 && (
      (request.examType !== undefined && request.subject !== undefined) ||
      (request.subject !== undefined && request.chapter !== undefined) ||
      (request.difficulty !== undefined && request.subject !== undefined)
    );
    if (filterCount > 1 && !supportedPair) {
      throw new AdminQuestionLibraryValidationError(
        "VALIDATION_ERROR",
        "Question library accepts one indexed filter, or examType+subject, " +
        "subject+chapter, or difficulty+subject.",
      );
    }
    return request;
  }

  public normalizeDetailRequest(input: Record<string, unknown>): AdminQuestionDetailValidatedRequest {
    const actorRole = requiredString(input.actorRole, "actorRole").toLowerCase();
    if (!ALLOWED_ROLES.has(actorRole)) {
      throw new AdminQuestionLibraryValidationError(
        "FORBIDDEN", "Question Bank reads require the teacher or admin role.",
      );
    }
    return {
      actorId: requiredString(input.actorId, "actorId"),
      actorRole,
      instituteId: requiredString(input.instituteId, "instituteId"),
      questionId: requiredString(input.questionId, "questionId"),
    };
  }

  private async currentAcademicYear(instituteId: string): Promise<string> {
    const years = await this.firestore.collection(INSTITUTES_COLLECTION).doc(instituteId)
      .collection(ACADEMIC_YEARS_COLLECTION)
      .where("status", "in", ["Active", "active"])
      .limit(2)
      .get();
    if (years.size !== 1) {
      throw new AdminQuestionLibraryValidationError(
        "CONFLICT",
        years.empty ? "The institute has no current active academic year." :
          "The institute has multiple active academic years.",
      );
    }
    return years.docs[0].id;
  }

  private buildQuery(
    request: AdminQuestionLibraryValidatedRequest,
  ): FirebaseFirestore.Query {
    let query: FirebaseFirestore.Query = this.firestore
      .collection(INSTITUTES_COLLECTION).doc(request.instituteId)
      .collection(QUESTION_BANK_COLLECTION);
    const equalityFields = [
      "academicYear", "additionalTag", "chapter", "difficulty", "examType",
      "primaryTag", "questionType", "secondaryTag", "status", "subject",
    ] as const;
    equalityFields.forEach((field) => {
      if (request[field] !== undefined) query = query.where(field, "==", request[field]);
    });
    if (request.usedInTemplate !== undefined) {
      query = query.where("usedInTemplate", "==", request.usedInTemplate);
    }
    if (request.query !== undefined) {
      query = query.where("searchTokens", "array-contains", request.query);
    }
    return query.orderBy("createdAt", "desc").orderBy("questionId", "asc");
  }

  public async getLibrary(
    request: AdminQuestionLibraryValidatedRequest,
  ): Promise<import("../../../shared/contracts/apiDtos").AdminQuestionLibraryPageResult> {
    const currentAcademicYear = await this.currentAcademicYear(request.instituteId);
    const fingerprint = queryFingerprint(request, currentAcademicYear);
    let cursor = decodeCursor(request.cursor, fingerprint);
    const matched: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    let scanned = 0;
    let hasMore = false;
    let lastScanned: FirebaseFirestore.QueryDocumentSnapshot | undefined;
    do {
      const remainingScan = request.thermalState ? MAX_THERMAL_SCAN - scanned : request.limit + 1;
      const window = Math.min(request.limit + 1, remainingScan);
      let query = this.buildQuery(request).limit(window);
      if (cursor) {
        query = query.startAfter(
          Timestamp.fromMillis(cursor.createdAtMillis),
          cursor.questionId,
        );
      }
      const snapshot = await query.get();
      scanned += snapshot.size;
      for (const document of snapshot.docs) {
        lastScanned = document;
        if (!request.thermalState || thermalState({
          currentAcademicYear,
          data: document.data(),
          nowMillis: this.now().toMillis(),
        }) === request.thermalState) {
          matched.push(document);
          if (matched.length > request.limit) break;
        }
      }
      hasMore = snapshot.size === window;
      if (!request.thermalState || matched.length > request.limit || !hasMore ||
        scanned >= MAX_THERMAL_SCAN || !lastScanned) break;
      const createdAt = toTimestamp(lastScanned.get("createdAt"));
      cursor = {
        createdAtMillis: createdAt.toMillis(),
        fingerprint,
        questionId: toString(lastScanned.get("questionId"), lastScanned.id),
      };
    } while (scanned < MAX_THERMAL_SCAN);

    const selected = matched.slice(0, request.limit);
    let nextCursor: string | null = null;
    if (matched.length > request.limit) {
      const last = selected[selected.length - 1];
      nextCursor = last ? encodeCursor({
        createdAtMillis: toTimestamp(last.get("createdAt")).toMillis(),
        fingerprint,
        questionId: toString(last.get("questionId"), last.id),
      }) : null;
    } else if (hasMore && lastScanned) {
      nextCursor = encodeCursor({
        createdAtMillis: toTimestamp(lastScanned.get("createdAt")).toMillis(),
        fingerprint,
        questionId: toString(lastScanned.get("questionId"), lastScanned.id),
      });
    }
    const nowMillis = this.now().toMillis();
    return {
      currentAcademicYear,
      nextCursor,
      questions: selected.map((snapshot) => recordFromSnapshot({
        currentAcademicYear,
        generatePreviewUrl: this.generatePreviewUrl,
        instituteId: request.instituteId,
        nowMillis,
        snapshot,
      })),
    };
  }

  private async versionFamily(
    institute: FirebaseFirestore.DocumentReference,
    source: FirebaseFirestore.DocumentSnapshot,
  ): Promise<AdminQuestionVersionSummary[]> {
    const collection = institute.collection(QUESTION_BANK_COLLECTION);
    const visited = new Set<string>([source.id]);
    const ancestors: FirebaseFirestore.DocumentSnapshot[] = [];
    let cursor = source;
    while (toNullableString(cursor.get("parentQuestionId"))) {
      if (visited.size >= MAX_VERSION_FAMILY) {
        throw new AdminQuestionLibraryValidationError(
          "CONFLICT", `Question version family exceeds ${MAX_VERSION_FAMILY} records.`,
        );
      }
      const parentId = toNullableString(cursor.get("parentQuestionId"));
      if (!parentId || visited.has(parentId)) {
        throw new AdminQuestionLibraryValidationError("CONFLICT", "Question version lineage is cyclic.");
      }
      const parent = await collection.doc(parentId).get();
      if (!parent.exists) {
        throw new AdminQuestionLibraryValidationError("CONFLICT", "Question version lineage is incomplete.");
      }
      visited.add(parentId);
      ancestors.unshift(parent);
      cursor = parent;
    }
    const family = [...ancestors, source];
    cursor = source;
    while (toNullableString(cursor.get("successorQuestionId"))) {
      if (visited.size >= MAX_VERSION_FAMILY) {
        throw new AdminQuestionLibraryValidationError(
          "CONFLICT", `Question version family exceeds ${MAX_VERSION_FAMILY} records.`,
        );
      }
      const successorId = toNullableString(cursor.get("successorQuestionId"));
      if (!successorId || visited.has(successorId)) {
        throw new AdminQuestionLibraryValidationError("CONFLICT", "Question version lineage is cyclic.");
      }
      const successor = await collection.doc(successorId).get();
      if (!successor.exists || successor.get("parentQuestionId") !== cursor.id) {
        throw new AdminQuestionLibraryValidationError("CONFLICT", "Question version lineage is incomplete.");
      }
      visited.add(successorId);
      family.push(successor);
      cursor = successor;
    }
    return family.map(versionSummary).sort((left, right) => left.version - right.version);
  }

  public async getQuestionDetail(
    request: AdminQuestionDetailValidatedRequest,
  ): Promise<AdminQuestionDetailResult> {
    const institute = this.firestore.collection(INSTITUTES_COLLECTION).doc(request.instituteId);
    const question = await institute.collection(QUESTION_BANK_COLLECTION).doc(request.questionId).get();
    if (!question.exists) {
      throw new AdminQuestionLibraryValidationError(
        "NOT_FOUND", `Question "${request.questionId}" was not found.`,
      );
    }
    const [currentAcademicYear, analytics, templates, versions] = await Promise.all([
      this.currentAcademicYear(request.instituteId),
      institute.collection(QUESTION_ANALYTICS_COLLECTION).doc(request.questionId).get(),
      institute.collection(TESTS_COLLECTION)
        .where("questionIds", "array-contains", request.questionId)
        .limit(MAX_USAGE_TEMPLATES + 1).get(),
      this.versionFamily(institute, question),
    ]);
    if (templates.size > MAX_USAGE_TEMPLATES) {
      throw new AdminQuestionLibraryValidationError(
        "CONFLICT", `Question usage exceeds the ${MAX_USAGE_TEMPLATES}-template read bound.`,
      );
    }
    const templateUsage = templates.docs.map(usageRecord)
      .sort((left, right) => right.runCount - left.runCount || left.testId.localeCompare(right.testId));
    const authoritativeQuestion = recordFromSnapshot({
      currentAcademicYear,
      generatePreviewUrl: this.generatePreviewUrl,
      instituteId: request.instituteId,
      nowMillis: this.now().toMillis(),
      snapshot: question,
    });
    const authoritativeRunCount = templateUsage.reduce((total, template) =>
      total + template.runCount, 0);
    authoritativeQuestion.usedCount = Math.max(
      authoritativeQuestion.usedCount,
      authoritativeRunCount,
    );
    authoritativeQuestion.usedInTemplate = templateUsage.some((template) =>
      template.status === "assigned" || template.runCount > 0);
    return {
      analytics: analyticsFromSnapshot(analytics),
      question: authoritativeQuestion,
      templateUsage,
      versions,
    };
  }
}

export const adminQuestionLibraryService = new AdminQuestionLibraryService();
