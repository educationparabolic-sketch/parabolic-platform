/* eslint-disable require-jsdoc */
import {createHash} from "node:crypto";
import {Timestamp} from "firebase-admin/firestore";
import {getFirestore} from "../utils/firebaseAdmin";
import {StorageObjectTarget} from "../types/storageBucketArchitecture";
import {cdnArchitectureService} from "./cdnArchitecture";
import {storageBucketArchitectureService} from "./storageBucketArchitecture";
import {
  AdminQuestionBankRequestContext,
  AdminQuestionBankValidationError,
  AdminQuestionImageAssetMutation,
  AdminQuestionLifecycleResult,
  AdminQuestionLifecycleStatus,
  AdminQuestionLifecycleValidatedRequest,
  AdminQuestionMetadataUpdateValidatedRequest,
  AdminQuestionStructureUpdateValidatedRequest,
  AdminQuestionUpdateResult,
  AdminQuestionVersionCreateResult,
  AdminQuestionVersionCreateValidatedRequest,
} from "../types/adminQuestionBank";

const INSTITUTES_COLLECTION = "institutes";
const QUESTION_BANK_COLLECTION = "questionBank";
const TESTS_COLLECTION = "tests";
const AUDIT_LOGS_COLLECTION = "auditLogs";
const MAX_USAGE_TEMPLATES = 100;
const TWO_YEARS_MS = 730 * 24 * 60 * 60 * 1000;
const ALLOWED_ROLES = new Set(["admin", "teacher"]);

interface AdminQuestionMutationDependencies {
  firestore: FirebaseFirestore.Firestore;
  now: () => Timestamp;
  resolveStorageTarget?: (
    input: Parameters<typeof storageBucketArchitectureService.resolveQuestionAssetStorageTarget>[0],
  ) => StorageObjectTarget;
  storage?: QuestionEditAssetStorageAdapter;
}

interface QuestionEditAssetStorageAdapter {
  deleteObject: (objectPath: string) => Promise<void>;
  putObject: (input: {
    bytes: Buffer;
    contentSha256: string;
    contentType: string;
    objectPath: string;
  }) => Promise<"created" | "replayed">;
}

interface PreparedQuestionEditAsset {
  contentSha256: string;
  disposition: "created" | "replayed";
  objectPath: string;
  revision: number;
}

interface QuestionUsageAuthority {
  assignedTemplateIds: string[];
  isUsed: boolean;
  runCount: number;
}

interface CommandAuthority {
  auditId: string;
  idempotencyKeyHash: string;
  requestFingerprint: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeRequiredString(
  value: unknown,
  fieldName: string,
  maximumLength = 256,
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new AdminQuestionBankValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a non-empty string.`,
    );
  }

  const normalized = value.trim();
  if (normalized.length > maximumLength) {
    throw new AdminQuestionBankValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be at most ${maximumLength} characters.`,
    );
  }

  return normalized;
}

function normalizeOptionalContextString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeNullableString(
  value: unknown,
  fieldName: string,
  maximumLength = 512,
): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return normalizeRequiredString(value, fieldName, maximumLength);
}

function normalizeNullableLink(value: unknown, fieldName: string): string | null {
  const normalized = normalizeNullableString(value, fieldName, 2048);
  if (normalized === null) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new AdminQuestionBankValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be an absolute HTTP(S) URL or null.`,
    );
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new AdminQuestionBankValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be an absolute HTTP(S) URL or null.`,
    );
  }

  return parsed.toString();
}

function normalizePositiveInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new AdminQuestionBankValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a positive integer.`,
    );
  }

  return value;
}

function normalizeFiniteNumber(
  value: unknown,
  fieldName: string,
  minimum: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    throw new AdminQuestionBankValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a finite number at least ${minimum}.`,
    );
  }

  return value;
}

function normalizeContext(input: {
  actorId?: unknown;
  actorRole?: unknown;
  instituteId?: unknown;
  ipAddress?: unknown;
  userAgent?: unknown;
}): AdminQuestionBankRequestContext {
  const actorRole = normalizeRequiredString(input.actorRole, "actorRole")
    .toLowerCase();
  if (!ALLOWED_ROLES.has(actorRole)) {
    throw new AdminQuestionBankValidationError(
      "FORBIDDEN",
      "Question Bank mutations require the teacher or admin role.",
    );
  }

  return {
    actorId: normalizeRequiredString(input.actorId, "actorId"),
    actorRole,
    instituteId: normalizeRequiredString(input.instituteId, "instituteId"),
    ipAddress: normalizeOptionalContextString(input.ipAddress),
    userAgent: normalizeOptionalContextString(input.userAgent),
  };
}

function normalizeImageMutation(
  value: unknown,
  fieldName: string,
): AdminQuestionImageAssetMutation {
  if (!isRecord(value)) {
    throw new AdminQuestionBankValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be an asset mutation object.`,
    );
  }
  if (value.action === "retain" || value.action === "remove") {
    return {action: value.action};
  }
  if (value.action !== "replace") {
    throw new AdminQuestionBankValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}.action" must be retain, remove, or replace.`,
    );
  }
  if (value.extension !== "png" && value.extension !== "webp") {
    throw new AdminQuestionBankValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}.extension" must be png or webp.`,
    );
  }

  return {
    action: "replace",
    contentBase64: normalizeRequiredString(
      value.contentBase64,
      `${fieldName}.contentBase64`,
      8_000_000,
    ),
    extension: value.extension,
  };
}

function decodeImageMutation(
  mutation: Extract<AdminQuestionImageAssetMutation, {action: "replace"}>,
): Buffer {
  const encoded = mutation.contentBase64.replace(/\s+/g, "");
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    throw new AdminQuestionBankValidationError(
      "VALIDATION_ERROR", "Managed question image content must be canonical base64.",
    );
  }
  const bytes = Buffer.from(encoded, "base64");
  const isPng = bytes.subarray(0, 8).equals(Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]));
  const isWebp = bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP";
  if (bytes.length === 0 || bytes.length > 6_000_000 ||
    (mutation.extension === "png" ? !isPng : !isWebp)) {
    throw new AdminQuestionBankValidationError(
      "VALIDATION_ERROR",
      `Managed question image content does not match .${mutation.extension} or exceeds 6 MB.`,
    );
  }
  return bytes;
}

function storageErrorCode(error: unknown): string {
  return isRecord(error) ? String(error.code ?? "") : "";
}

function createDefaultEditAssetStorageAdapter(): QuestionEditAssetStorageAdapter {
  const bucket = storageBucketArchitectureService.getBucket("questionAssets");
  const cacheControl = cdnArchitectureService.initializeArchitecture()
    .cachePolicies.hot.cacheControl;
  return {
    async deleteObject(objectPath) {
      try {
        await bucket.file(objectPath).delete();
      } catch (error) {
        if (!storageErrorCode(error).includes("404")) throw error;
      }
    },
    async putObject(input) {
      const file = bucket.file(input.objectPath);
      try {
        const [metadata] = await file.getMetadata();
        if (metadata.metadata?.contentSha256 !== input.contentSha256) {
          throw new AdminQuestionBankValidationError(
            "CONFLICT", "Another edit already owns the managed asset revision.",
          );
        }
        return "replayed";
      } catch (error) {
        if (!storageErrorCode(error).includes("404")) throw error;
      }
      try {
        await file.save(input.bytes, {
          contentType: input.contentType,
          metadata: {
            cacheControl,
            metadata: {contentSha256: input.contentSha256},
          },
          preconditionOpts: {ifGenerationMatch: 0},
          resumable: false,
        });
        return "created";
      } catch (error) {
        if (!storageErrorCode(error).includes("412")) throw error;
        const [metadata] = await file.getMetadata();
        if (metadata.metadata?.contentSha256 !== input.contentSha256) {
          throw new AdminQuestionBankValidationError(
            "CONFLICT", "Another edit won the managed asset upload.",
          );
        }
        return "replayed";
      }
    },
  };
}

function normalizeDifficulty(
  value: unknown,
): "Easy" | "Medium" | "Hard" {
  const normalized = normalizeRequiredString(value, "difficulty").toLowerCase();
  if (normalized === "easy") {
    return "Easy";
  }
  if (normalized === "medium") {
    return "Medium";
  }
  if (normalized === "hard") {
    return "Hard";
  }
  throw new AdminQuestionBankValidationError(
    "VALIDATION_ERROR",
    "Field \"difficulty\" must be Easy, Medium, or Hard.",
  );
}

function normalizeLifecycleAction(value: unknown): "archive" | "deprecate" {
  const normalized = normalizeRequiredString(value, "action").toLowerCase();
  if (normalized !== "archive" && normalized !== "deprecate") {
    throw new AdminQuestionBankValidationError(
      "VALIDATION_ERROR",
      "Field \"action\" must be archive or deprecate.",
    );
  }

  return normalized;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }

  return JSON.stringify(value);
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function buildCommandAuthority(input: {
  command: string;
  idempotencyKey: string;
  instituteId: string;
  semantics: Record<string, unknown>;
}): CommandAuthority {
  const idempotencyKeyHash = sha256(input.idempotencyKey);
  return {
    auditId: `question_mutation_${sha256(
      `${input.instituteId}:${input.command}:${idempotencyKeyHash}`,
    ).slice(0, 40)}`,
    idempotencyKeyHash,
    requestFingerprint: sha256(stableJson(input.semantics)),
  };
}

function readReplayResult<TResult extends {disposition: "applied" | "replayed"}>(
  snapshot: FirebaseFirestore.DocumentSnapshot,
  requestFingerprint: string,
): TResult | null {
  if (!snapshot.exists) {
    return null;
  }

  const metadata = snapshot.get("metadata");
  if (!isRecord(metadata) || metadata.requestFingerprint !== requestFingerprint) {
    throw new AdminQuestionBankValidationError(
      "CONFLICT",
      "Idempotency key has already been used with different semantics.",
    );
  }
  if (!isRecord(metadata.result)) {
    throw new AdminQuestionBankValidationError(
      "CONFLICT",
      "Question mutation audit is missing its immutable replay result.",
    );
  }

  return {...metadata.result, disposition: "replayed"} as TResult;
}

function requireQuestion(
  snapshot: FirebaseFirestore.DocumentSnapshot,
  questionId: string,
): Record<string, unknown> {
  if (!snapshot.exists) {
    throw new AdminQuestionBankValidationError(
      "NOT_FOUND",
      `Question "${questionId}" was not found.`,
    );
  }

  return snapshot.data() ?? {};
}

function toQuestionRevision(data: Record<string, unknown>): number {
  return typeof data.revision === "number" &&
    Number.isInteger(data.revision) && data.revision > 0 ? data.revision : 1;
}

function toQuestionVersion(data: Record<string, unknown>): number {
  if (
    typeof data.version !== "number" ||
    !Number.isInteger(data.version) ||
    data.version < 1
  ) {
    throw new AdminQuestionBankValidationError(
      "CONFLICT",
      "Question record has no valid immutable content version.",
    );
  }

  return data.version;
}

function toQuestionStatus(
  data: Record<string, unknown>,
): AdminQuestionLifecycleStatus {
  const status = data.status;
  if (
    status === "active" ||
    status === "used" ||
    status === "archived" ||
    status === "deprecated"
  ) {
    return status;
  }

  throw new AdminQuestionBankValidationError(
    "CONFLICT",
    "Question record has an unsupported lifecycle status.",
  );
}

function assertExpectedRevision(
  data: Record<string, unknown>,
  expectedRevision: number,
  questionId: string,
): number {
  const currentRevision = toQuestionRevision(data);
  if (currentRevision !== expectedRevision) {
    throw new AdminQuestionBankValidationError(
      "CONFLICT",
      `Question "${questionId}" revision conflict: expected ` +
        `${expectedRevision}, current revision is ${currentRevision}.`,
    );
  }

  return currentRevision;
}

function assertQuestionIsMutable(status: AdminQuestionLifecycleStatus): void {
  if (status === "archived" || status === "deprecated") {
    throw new AdminQuestionBankValidationError(
      "CONFLICT",
      `Question status "${status}" is immutable.`,
    );
  }
}

function toNonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ?
    value :
    0;
}

function resolveUsageAuthority(
  questionData: Record<string, unknown>,
  templates: FirebaseFirestore.QuerySnapshot,
): QuestionUsageAuthority {
  if (templates.size > MAX_USAGE_TEMPLATES) {
    throw new AdminQuestionBankValidationError(
      "CONFLICT",
      `Question usage exceeds the ${MAX_USAGE_TEMPLATES}-template guard bound.`,
    );
  }

  let runCount = 0;
  const assignedTemplateIds: string[] = [];
  templates.docs.forEach((document) => {
    const data = document.data();
    const totalRuns = toNonNegativeInteger(data.totalRuns);
    const assigned = totalRuns > 0 || data.status === "assigned";
    if (!assigned) {
      return;
    }
    assignedTemplateIds.push(document.id);
    runCount += totalRuns > 0 ? totalRuns : 1;
  });

  assignedTemplateIds.sort();
  const persistedUsageSignal = toNonNegativeInteger(questionData.usedCount) > 0 ||
    questionData.status === "used";
  return {
    assignedTemplateIds,
    isUsed: assignedTemplateIds.length > 0 || persistedUsageSignal,
    runCount,
  };
}

function buildAuditDocument(input: {
  actionType: string;
  authority: CommandAuthority;
  before: Record<string, unknown>;
  command: string;
  context: AdminQuestionBankRequestContext;
  questionId: string;
  result: object;
  timestamp: Timestamp;
  usage?: QuestionUsageAuthority;
}): Record<string, unknown> {
  return {
    actionType: input.actionType,
    actorId: input.context.actorId,
    actorRole: input.context.actorRole,
    actorUid: input.context.actorId,
    after: input.result,
    auditId: input.authority.auditId,
    before: input.before,
    entityId: input.questionId,
    entityType: "question",
    instituteId: input.context.instituteId,
    ...(input.context.ipAddress ? {ipAddress: input.context.ipAddress} : {}),
    layer: "L0",
    metadata: {
      command: input.command,
      idempotencyKeyHash: input.authority.idempotencyKeyHash,
      requestFingerprint: input.authority.requestFingerprint,
      result: input.result,
      source: "AdminQuestionMutationsService",
      ...(input.usage ? {usage: input.usage} : {}),
    },
    targetCollection: QUESTION_BANK_COLLECTION,
    targetId: input.questionId,
    tenantId: input.context.instituteId,
    timestamp: input.timestamp,
    ...(input.context.userAgent ? {userAgent: input.context.userAgent} : {}),
  };
}

function nextVersionIdentity(questionId: string, uniqueKey: string, version: number) {
  const questionRoot = questionId.replace(/-v\d+$/i, "");
  const uniqueKeyRoot = uniqueKey.replace(/-v\d+$/i, "");
  return {
    questionId: `${questionRoot}-v${version}`,
    uniqueKey: `${uniqueKeyRoot}-v${version}`,
  };
}

export class AdminQuestionMutationsService {
  constructor(
    private readonly dependencies: AdminQuestionMutationDependencies = {
      firestore: getFirestore(),
      now: () => Timestamp.now(),
    },
  ) {}

  public normalizeMetadataUpdateRequest(input: {
    actorId?: unknown;
    actorRole?: unknown;
    body?: unknown;
    instituteId?: unknown;
    ipAddress?: unknown;
    questionId?: unknown;
    userAgent?: unknown;
  }): AdminQuestionMetadataUpdateValidatedRequest {
    const body = isRecord(input.body) ? input.body : {};
    return {
      ...normalizeContext(input),
      additionalTag: normalizeNullableString(body.additionalTag, "additionalTag"),
      expectedRevision: normalizePositiveInteger(
        body.expectedRevision,
        "expectedRevision",
      ),
      idempotencyKey: normalizeRequiredString(
        body.idempotencyKey,
        "idempotencyKey",
        128,
      ),
      internalNotes: normalizeNullableString(
        body.internalNotes,
        "internalNotes",
        2000,
      ),
      primaryTag: normalizeNullableString(body.primaryTag, "primaryTag"),
      questionId: normalizeRequiredString(input.questionId, "questionId"),
      secondaryTag: normalizeNullableString(body.secondaryTag, "secondaryTag"),
      simulationLink: normalizeNullableLink(body.simulationLink, "simulationLink"),
      solutionImage: normalizeImageMutation(body.solutionImage, "solutionImage"),
      topic: normalizeNullableString(body.topic, "topic"),
      tutorialVideoLink: normalizeNullableLink(
        body.tutorialVideoLink,
        "tutorialVideoLink",
      ),
    };
  }

  public normalizeStructureUpdateRequest(input: {
    actorId?: unknown;
    actorRole?: unknown;
    body?: unknown;
    instituteId?: unknown;
    ipAddress?: unknown;
    questionId?: unknown;
    userAgent?: unknown;
  }): AdminQuestionStructureUpdateValidatedRequest {
    const body = isRecord(input.body) ? input.body : {};
    return {
      ...normalizeContext(input),
      academicYear: normalizeNullableString(body.academicYear, "academicYear", 32),
      chapter: normalizeRequiredString(body.chapter, "chapter"),
      correctAnswer: normalizeRequiredString(body.correctAnswer, "correctAnswer"),
      difficulty: normalizeDifficulty(body.difficulty),
      examType: normalizeRequiredString(body.examType, "examType"),
      expectedRevision: normalizePositiveInteger(
        body.expectedRevision,
        "expectedRevision",
      ),
      idempotencyKey: normalizeRequiredString(
        body.idempotencyKey,
        "idempotencyKey",
        128,
      ),
      marks: normalizeFiniteNumber(body.marks, "marks", 0),
      negativeMarks: normalizeFiniteNumber(
        body.negativeMarks,
        "negativeMarks",
        0,
      ),
      questionId: normalizeRequiredString(input.questionId, "questionId"),
      questionImage: normalizeImageMutation(body.questionImage, "questionImage"),
      questionType: normalizeRequiredString(body.questionType, "questionType"),
      subject: normalizeRequiredString(body.subject, "subject"),
      uniqueKey: normalizeRequiredString(body.uniqueKey, "uniqueKey"),
    };
  }

  public normalizeVersionCreateRequest(input: {
    actorId?: unknown;
    actorRole?: unknown;
    body?: unknown;
    instituteId?: unknown;
    ipAddress?: unknown;
    questionId?: unknown;
    userAgent?: unknown;
  }): AdminQuestionVersionCreateValidatedRequest {
    const body = isRecord(input.body) ? input.body : {};
    return {
      ...normalizeContext(input),
      expectedRevision: normalizePositiveInteger(
        body.expectedRevision,
        "expectedRevision",
      ),
      idempotencyKey: normalizeRequiredString(
        body.idempotencyKey,
        "idempotencyKey",
        128,
      ),
      questionId: normalizeRequiredString(input.questionId, "questionId"),
    };
  }

  public normalizeLifecycleRequest(input: {
    actorId?: unknown;
    actorRole?: unknown;
    body?: unknown;
    instituteId?: unknown;
    ipAddress?: unknown;
    questionId?: unknown;
    userAgent?: unknown;
  }): AdminQuestionLifecycleValidatedRequest {
    const body = isRecord(input.body) ? input.body : {};
    return {
      ...normalizeContext(input),
      action: normalizeLifecycleAction(body.action),
      expectedRevision: normalizePositiveInteger(
        body.expectedRevision,
        "expectedRevision",
      ),
      idempotencyKey: normalizeRequiredString(
        body.idempotencyKey,
        "idempotencyKey",
        128,
      ),
      questionId: normalizeRequiredString(input.questionId, "questionId"),
      reason: normalizeRequiredString(body.reason, "reason", 500),
    };
  }

  public async updateMetadata(
    request: AdminQuestionMetadataUpdateValidatedRequest,
  ): Promise<AdminQuestionUpdateResult> {
    const preparedAsset = await this.prepareEditAsset(
      request,
      "solutionImage",
      request.solutionImage,
    );
    const command = "metadata-update";
    const authority = buildCommandAuthority({
      command,
      idempotencyKey: request.idempotencyKey,
      instituteId: request.instituteId,
      semantics: {
        actorId: request.actorId,
        additionalTag: request.additionalTag,
        expectedRevision: request.expectedRevision,
        internalNotes: request.internalNotes,
        primaryTag: request.primaryTag,
        questionId: request.questionId,
        secondaryTag: request.secondaryTag,
        simulationLink: request.simulationLink,
        solutionImage: request.solutionImage,
        topic: request.topic,
        tutorialVideoLink: request.tutorialVideoLink,
      },
    });
    const {auditReference, questionReference} = this.references(
      request.instituteId,
      request.questionId,
      authority.auditId,
    );

    try {
      return await this.dependencies.firestore.runTransaction(async (transaction) => {
        const auditSnapshot = await transaction.get(auditReference);
        const replay = readReplayResult<AdminQuestionUpdateResult>(
          auditSnapshot,
          authority.requestFingerprint,
        );
        if (replay) {
          return replay;
        }
        const questionSnapshot = await transaction.get(questionReference);
        const data = requireQuestion(questionSnapshot, request.questionId);
        const currentRevision = assertExpectedRevision(
          data,
          request.expectedRevision,
          request.questionId,
        );
        const status = toQuestionStatus(data);
        assertQuestionIsMutable(status);
        const version = toQuestionVersion(data);
        const timestamp = this.dependencies.now();
        const result: AdminQuestionUpdateResult = {
          auditId: authority.auditId,
          disposition: "applied",
          questionId: request.questionId,
          revision: currentRevision + 1,
          updatedAt: timestamp.toDate().toISOString(),
          version,
        };
        const update: Record<string, unknown> = {
          additionalTag: request.additionalTag,
          internalNotes: request.internalNotes,
          primaryTag: request.primaryTag,
          revision: result.revision,
          secondaryTag: request.secondaryTag,
          simulationLink: request.simulationLink,
          topic: request.topic,
          tutorialVideoLink: request.tutorialVideoLink,
          updatedAt: timestamp,
          updatedBy: request.actorId,
        };
        if (request.solutionImage.action === "remove") {
          update.solutionImageUrl = "";
          update.solutionImageRevision = null;
          update.solutionImageSha256 = null;
        } else if (preparedAsset) {
          update.solutionImageUrl = preparedAsset.objectPath;
          update.solutionImageRevision = preparedAsset.revision;
          update.solutionImageSha256 = preparedAsset.contentSha256;
        }
        transaction.update(questionReference, update);
        transaction.create(auditReference, buildAuditDocument({
          actionType: "UPDATE_QUESTION_METADATA",
          authority,
          before: {
            additionalTag: data.additionalTag ?? null,
            internalNotes: data.internalNotes ?? null,
            primaryTag: data.primaryTag ?? null,
            revision: currentRevision,
            secondaryTag: data.secondaryTag ?? null,
            simulationLink: data.simulationLink ?? null,
            solutionImageUrl: data.solutionImageUrl ?? "",
            topic: data.topic ?? null,
            tutorialVideoLink: data.tutorialVideoLink ?? null,
          },
          command,
          context: request,
          questionId: request.questionId,
          result,
          timestamp,
        }));
        return result;
      });
    } catch (error) {
      await this.cleanupRejectedAsset(request, preparedAsset, error);
      throw error;
    }
  }

  public async updateStructure(
    request: AdminQuestionStructureUpdateValidatedRequest,
  ): Promise<AdminQuestionUpdateResult> {
    const preparedAsset = await this.prepareEditAsset(
      request,
      "questionImage",
      request.questionImage,
    );
    const command = "structure-update";
    const authority = buildCommandAuthority({
      command,
      idempotencyKey: request.idempotencyKey,
      instituteId: request.instituteId,
      semantics: {
        actorId: request.actorId,
        academicYear: request.academicYear,
        chapter: request.chapter,
        correctAnswer: request.correctAnswer,
        difficulty: request.difficulty,
        examType: request.examType,
        expectedRevision: request.expectedRevision,
        marks: request.marks,
        negativeMarks: request.negativeMarks,
        questionId: request.questionId,
        questionImage: request.questionImage,
        questionType: request.questionType,
        subject: request.subject,
        uniqueKey: request.uniqueKey,
      },
    });
    const {auditReference, instituteReference, questionReference} =
      this.references(request.instituteId, request.questionId, authority.auditId);

    try {
      return await this.dependencies.firestore.runTransaction(async (transaction) => {
        const auditSnapshot = await transaction.get(auditReference);
        const replay = readReplayResult<AdminQuestionUpdateResult>(
          auditSnapshot,
          authority.requestFingerprint,
        );
        if (replay) {
          return replay;
        }
        const questionSnapshot = await transaction.get(questionReference);
        const data = requireQuestion(questionSnapshot, request.questionId);
        const currentRevision = assertExpectedRevision(
          data,
          request.expectedRevision,
          request.questionId,
        );
        const status = toQuestionStatus(data);
        assertQuestionIsMutable(status);
        const usageQuery = instituteReference.collection(TESTS_COLLECTION)
          .where("questionIds", "array-contains", request.questionId)
          .limit(MAX_USAGE_TEMPLATES + 1);
        const uniqueKeyQuery = instituteReference.collection(QUESTION_BANK_COLLECTION)
          .where("uniqueKey", "==", request.uniqueKey)
          .limit(2);
        const [templates, uniqueKeys] = await Promise.all([
          transaction.get(usageQuery),
          transaction.get(uniqueKeyQuery),
        ]);
        const usage = resolveUsageAuthority(data, templates);
        if (usage.isUsed) {
          throw new AdminQuestionBankValidationError(
            "CONFLICT",
            "Question structure is locked by authoritative assignment usage; " +
            "create a successor version.",
          );
        }
        if (uniqueKeys.docs.some((document) => document.id !== request.questionId)) {
          throw new AdminQuestionBankValidationError(
            "CONFLICT",
            `Unique key "${request.uniqueKey}" belongs to another question.`,
          );
        }
        const version = toQuestionVersion(data);
        const timestamp = this.dependencies.now();
        const result: AdminQuestionUpdateResult = {
          auditId: authority.auditId,
          disposition: "applied",
          questionId: request.questionId,
          revision: currentRevision + 1,
          updatedAt: timestamp.toDate().toISOString(),
          version,
        };
        const update: Record<string, unknown> = {
          academicYear: request.academicYear,
          chapter: request.chapter,
          correctAnswer: request.correctAnswer,
          difficulty: request.difficulty,
          examType: request.examType,
          marks: request.marks,
          negativeMarks: request.negativeMarks,
          questionType: request.questionType,
          revision: result.revision,
          subject: request.subject,
          uniqueKey: request.uniqueKey,
          updatedAt: timestamp,
          updatedBy: request.actorId,
        };
        if (request.questionImage.action === "remove") {
          update.questionImageUrl = "";
          update.questionImageRevision = null;
          update.questionImageSha256 = null;
        } else if (preparedAsset) {
          update.questionImageUrl = preparedAsset.objectPath;
          update.questionImageRevision = preparedAsset.revision;
          update.questionImageSha256 = preparedAsset.contentSha256;
        }
        transaction.update(questionReference, update);
        transaction.create(auditReference, buildAuditDocument({
          actionType: "UPDATE_QUESTION_STRUCTURE",
          authority,
          before: {
            academicYear: data.academicYear ?? null,
            chapter: data.chapter ?? null,
            correctAnswer: data.correctAnswer ?? null,
            difficulty: data.difficulty ?? null,
            examType: data.examType ?? null,
            marks: data.marks ?? null,
            negativeMarks: data.negativeMarks ?? null,
            questionImageUrl: data.questionImageUrl ?? "",
            questionType: data.questionType ?? null,
            revision: currentRevision,
            subject: data.subject ?? null,
            uniqueKey: data.uniqueKey ?? null,
          },
          command,
          context: request,
          questionId: request.questionId,
          result,
          timestamp,
          usage,
        }));
        return result;
      });
    } catch (error) {
      await this.cleanupRejectedAsset(request, preparedAsset, error);
      throw error;
    }
  }

  public async createSuccessorVersion(
    request: AdminQuestionVersionCreateValidatedRequest,
  ): Promise<AdminQuestionVersionCreateResult> {
    const command = "create-successor-version";
    const authority = buildCommandAuthority({
      command,
      idempotencyKey: request.idempotencyKey,
      instituteId: request.instituteId,
      semantics: {
        actorId: request.actorId,
        expectedRevision: request.expectedRevision,
        questionId: request.questionId,
      },
    });
    const {auditReference, instituteReference, questionReference} =
      this.references(request.instituteId, request.questionId, authority.auditId);

    return this.dependencies.firestore.runTransaction(async (transaction) => {
      const auditSnapshot = await transaction.get(auditReference);
      const replay = readReplayResult<AdminQuestionVersionCreateResult>(
        auditSnapshot,
        authority.requestFingerprint,
      );
      if (replay) {
        return replay;
      }
      const sourceSnapshot = await transaction.get(questionReference);
      const source = requireQuestion(sourceSnapshot, request.questionId);
      const sourceRevision = assertExpectedRevision(
        source,
        request.expectedRevision,
        request.questionId,
      );
      const sourceStatus = toQuestionStatus(source);
      assertQuestionIsMutable(sourceStatus);
      const sourceVersion = toQuestionVersion(source);
      const uniqueKey = normalizeRequiredString(source.uniqueKey, "uniqueKey");
      const successorIdentity = nextVersionIdentity(
        request.questionId,
        uniqueKey,
        sourceVersion + 1,
      );
      const successorReference = instituteReference
        .collection(QUESTION_BANK_COLLECTION)
        .doc(successorIdentity.questionId);
      const usageQuery = instituteReference.collection(TESTS_COLLECTION)
        .where("questionIds", "array-contains", request.questionId)
        .limit(MAX_USAGE_TEMPLATES + 1);
      const uniqueKeyQuery = instituteReference.collection(QUESTION_BANK_COLLECTION)
        .where("uniqueKey", "==", successorIdentity.uniqueKey)
        .limit(1);
      const [successorSnapshot, templates, uniqueKeys] = await Promise.all([
        transaction.get(successorReference),
        transaction.get(usageQuery),
        transaction.get(uniqueKeyQuery),
      ]);
      const usage = resolveUsageAuthority(source, templates);
      if (!usage.isUsed) {
        throw new AdminQuestionBankValidationError(
          "CONFLICT",
          "An unused question must be edited in place instead of versioned.",
        );
      }
      if (successorSnapshot.exists || !uniqueKeys.empty) {
        throw new AdminQuestionBankValidationError(
          "CONFLICT",
          "The next question version identity already exists.",
        );
      }
      const timestamp = this.dependencies.now();
      const result: AdminQuestionVersionCreateResult = {
        auditId: authority.auditId,
        disposition: "applied",
        sourceQuestionId: request.questionId,
        sourceRevision: sourceRevision + 1,
        sourceStatus: "deprecated",
        sourceVersion,
        successorQuestionId: successorIdentity.questionId,
        successorRevision: 1,
        successorStatus: "active",
        successorVersion: sourceVersion + 1,
        updatedAt: timestamp.toDate().toISOString(),
      };
      const successorData: Record<string, unknown> = {...source};
      [
        "archivedAt",
        "archivedBy",
        "deprecatedAt",
        "deprecatedBy",
        "lifecycleReason",
        "successorQuestionId",
      ].forEach((field) => delete successorData[field]);
      transaction.create(successorReference, {
        ...successorData,
        createdAt: timestamp,
        createdBy: request.actorId,
        lastUsedAt: null,
        parentQuestionId: request.questionId,
        questionImageUrl: "",
        questionId: successorIdentity.questionId,
        revision: 1,
        solutionImageUrl: "",
        status: "active",
        uniqueKey: successorIdentity.uniqueKey,
        updatedAt: timestamp,
        updatedBy: request.actorId,
        usedCount: 0,
        version: sourceVersion + 1,
      });
      transaction.update(questionReference, {
        deprecatedAt: timestamp,
        deprecatedBy: request.actorId,
        lifecycleReason: `Superseded by ${successorIdentity.questionId}.`,
        revision: sourceRevision + 1,
        status: "deprecated",
        successorQuestionId: successorIdentity.questionId,
        updatedAt: timestamp,
        updatedBy: request.actorId,
      });
      transaction.create(auditReference, buildAuditDocument({
        actionType: "CREATE_QUESTION_VERSION",
        authority,
        before: {
          revision: sourceRevision,
          status: sourceStatus,
          version: sourceVersion,
        },
        command,
        context: request,
        questionId: request.questionId,
        result,
        timestamp,
        usage,
      }));
      return result;
    });
  }

  public async updateLifecycle(
    request: AdminQuestionLifecycleValidatedRequest,
  ): Promise<AdminQuestionLifecycleResult> {
    const command = `${request.action}-question`;
    const authority = buildCommandAuthority({
      command,
      idempotencyKey: request.idempotencyKey,
      instituteId: request.instituteId,
      semantics: {
        action: request.action,
        actorId: request.actorId,
        expectedRevision: request.expectedRevision,
        questionId: request.questionId,
        reason: request.reason,
      },
    });
    const {auditReference, instituteReference, questionReference} =
      this.references(request.instituteId, request.questionId, authority.auditId);

    return this.dependencies.firestore.runTransaction(async (transaction) => {
      const auditSnapshot = await transaction.get(auditReference);
      const replay = readReplayResult<AdminQuestionLifecycleResult>(
        auditSnapshot,
        authority.requestFingerprint,
      );
      if (replay) {
        return replay;
      }
      const questionSnapshot = await transaction.get(questionReference);
      const data = requireQuestion(questionSnapshot, request.questionId);
      const currentRevision = assertExpectedRevision(
        data,
        request.expectedRevision,
        request.questionId,
      );
      const previousStatus = toQuestionStatus(data);
      assertQuestionIsMutable(previousStatus);
      const usageQuery = instituteReference.collection(TESTS_COLLECTION)
        .where("questionIds", "array-contains", request.questionId)
        .limit(MAX_USAGE_TEMPLATES + 1);
      const templates = await transaction.get(usageQuery);
      const usage = resolveUsageAuthority(data, templates);
      if (usage.isUsed) {
        throw new AdminQuestionBankValidationError(
          "CONFLICT",
          "Questions used by assigned runs must be preserved through " +
            "successor versioning.",
        );
      }
      const timestamp = this.dependencies.now();
      if (request.action === "archive") {
        const activityTimestamp = data.lastUsedAt instanceof Timestamp ?
          data.lastUsedAt :
          data.createdAt instanceof Timestamp ? data.createdAt : null;
        if (
          activityTimestamp === null ||
          timestamp.toMillis() - activityTimestamp.toMillis() <= TWO_YEARS_MS
        ) {
          throw new AdminQuestionBankValidationError(
            "CONFLICT",
            "Question archive requires more than two years without use.",
          );
        }
      }
      const status = request.action === "archive" ? "archived" : "deprecated";
      const version = toQuestionVersion(data);
      const result: AdminQuestionLifecycleResult = {
        action: request.action,
        auditId: authority.auditId,
        disposition: "applied",
        previousStatus,
        questionId: request.questionId,
        revision: currentRevision + 1,
        status,
        thermalState: "cold",
        updatedAt: timestamp.toDate().toISOString(),
        version,
      };
      transaction.update(questionReference, {
        ...(request.action === "archive" ? {
          archivedAt: timestamp,
          archivedBy: request.actorId,
        } : {
          deprecatedAt: timestamp,
          deprecatedBy: request.actorId,
        }),
        lifecycleReason: request.reason,
        revision: result.revision,
        status,
        updatedAt: timestamp,
        updatedBy: request.actorId,
      });
      transaction.create(auditReference, buildAuditDocument({
        actionType: request.action === "archive" ?
          "ARCHIVE_QUESTION" :
          "DEPRECATE_QUESTION",
        authority,
        before: {
          revision: currentRevision,
          status: previousStatus,
          version,
        },
        command,
        context: request,
        questionId: request.questionId,
        result,
        timestamp,
        usage,
      }));
      return result;
    });
  }

  private references(instituteId: string, questionId: string, auditId: string) {
    const instituteReference = this.dependencies.firestore
      .collection(INSTITUTES_COLLECTION)
      .doc(instituteId);
    return {
      auditReference: instituteReference.collection(AUDIT_LOGS_COLLECTION)
        .doc(auditId),
      instituteReference,
      questionReference: instituteReference.collection(QUESTION_BANK_COLLECTION)
        .doc(questionId),
    };
  }

  private async prepareEditAsset(
    request: AdminQuestionBankRequestContext & {
      expectedRevision: number;
      questionId: string;
    },
    assetKind: "questionImage" | "solutionImage",
    mutation: AdminQuestionImageAssetMutation,
  ): Promise<PreparedQuestionEditAsset | null> {
    if (mutation.action !== "replace") return null;
    const reference = this.dependencies.firestore.collection(INSTITUTES_COLLECTION)
      .doc(request.instituteId).collection(QUESTION_BANK_COLLECTION)
      .doc(request.questionId);
    const snapshot = await reference.get();
    const question = requireQuestion(snapshot, request.questionId);
    assertExpectedRevision(question, request.expectedRevision, request.questionId);
    const revision = request.expectedRevision + 1;
    const bytes = decodeImageMutation(mutation);
    const contentSha256 = sha256(bytes);
    const resolveStorageTarget = this.dependencies.resolveStorageTarget ??
      ((input) => storageBucketArchitectureService
        .resolveQuestionAssetStorageTarget(input));
    const target = resolveStorageTarget({
      assetKind,
      extension: mutation.extension,
      instituteId: request.instituteId,
      questionId: request.questionId,
      revision,
      version: toQuestionVersion(question),
    });
    const storage = this.dependencies.storage ??
      createDefaultEditAssetStorageAdapter();
    const disposition = await storage.putObject({
      bytes,
      contentSha256,
      contentType: target.contentType,
      objectPath: target.objectPath,
    });
    return {contentSha256, disposition, objectPath: target.objectPath, revision};
  }

  private async cleanupRejectedAsset(
    request: AdminQuestionBankRequestContext & {questionId: string},
    asset: PreparedQuestionEditAsset | null,
    originalError: unknown,
  ): Promise<void> {
    if (!asset || asset.disposition !== "created") return;
    const storage = this.dependencies.storage ??
      createDefaultEditAssetStorageAdapter();
    try {
      await storage.deleteObject(asset.objectPath);
    } catch (cleanupError) {
      const recoveryId = `question_asset_recovery_${sha256(asset.objectPath).slice(0, 40)}`;
      await this.dependencies.firestore.collection(INSTITUTES_COLLECTION)
        .doc(request.instituteId).collection("questionAssetRecoveries")
        .doc(recoveryId).set({
          assetPath: asset.objectPath,
          cleanupError: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
          createdAt: this.dependencies.now(),
          originalError: originalError instanceof Error ? originalError.message : String(originalError),
          questionId: request.questionId,
          state: "cleanup_required",
        }, {merge: true});
      throw new AdminQuestionBankValidationError(
        "CONFLICT", "Question edit failed and managed asset cleanup requires recovery.",
      );
    }
  }
}

export const adminQuestionMutationsService =
  new AdminQuestionMutationsService();
