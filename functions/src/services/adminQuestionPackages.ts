/* eslint-disable require-jsdoc */
import {createHash} from "node:crypto";
import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  AdminQuestionBankRequestContext,
  AdminQuestionBankValidationError,
  AdminQuestionPackageCommitResult,
  AdminQuestionPackageCommitValidatedRequest,
  AdminQuestionPackageRollbackResult,
  AdminQuestionPackageRollbackValidatedRequest,
  AdminQuestionPackageRowResult,
  AdminQuestionPackageSummary,
  AdminQuestionPackageValidateValidatedRequest,
  AdminQuestionPackageValidationResult,
} from "../types/adminQuestionBank";
import {StorageObjectTarget} from "../types/storageBucketArchitecture";
import {storageBucketArchitectureService} from "./storageBucketArchitecture";
import {cdnArchitectureService} from "./cdnArchitecture";
import {
  parseQuestionPackage,
  ParsedQuestionPackage,
  ParsedQuestionPackageAsset,
  QUESTION_PACKAGE_LIMITS,
  QuestionPackageParserError,
} from "./questionPackageParser";

const INSTITUTES_COLLECTION = "institutes";
const PACKAGES_COLLECTION = "questionPackages";
const QUESTION_BANK_COLLECTION = "questionBank";
const TESTS_COLLECTION = "tests";
const UPLOAD_LOGS_COLLECTION = "questionUploadLogs";
const AUDIT_LOGS_COLLECTION = "auditLogs";
const ALLOWED_ROLES = new Set(["admin", "teacher"]);
const MAX_USAGE_TEMPLATES = 100;
const PACKAGE_TTL_MS = 24 * 60 * 60 * 1000;

interface PackageStorageObjectMetadata {
  contentSha256: string;
  packageId: string;
}

export interface PackageStorageAdapter {
  deleteObject: (objectPath: string) => Promise<void>;
  putObject: (input: {
    bytes: Buffer;
    contentType: string;
    metadata: PackageStorageObjectMetadata;
    objectPath: string;
  }) => Promise<"created" | "replayed">;
  readObject: (objectPath: string) => Promise<Buffer>;
  verifyObject: (
    objectPath: string,
    contentSha256: string,
  ) => Promise<void>;
}

export interface AdminQuestionPackageDependencies {
  firestore: FirebaseFirestore.Firestore;
  now: () => Timestamp;
  resolveStorageTarget: (
    input: Parameters<
      typeof storageBucketArchitectureService.resolveQuestionAssetStorageTarget
    >[0],
  ) => StorageObjectTarget;
  storage: PackageStorageAdapter;
}

interface StoredPackageAsset {
  contentSha256: string;
  extension: "png" | "webp";
  fileName: string;
}

interface StoredPackageRow {
  academicYear: string | null;
  action: "create" | "update";
  additionalTag: string | null;
  chapter: string;
  correctAnswer: string;
  difficulty: "Easy" | "Medium" | "Hard";
  internalNotes: string | null;
  marks: number;
  negativeMarks: number;
  primaryTag: string;
  questionId: string;
  questionImageFile: string;
  questionNo: string;
  questionText: string | null;
  questionType: string;
  rowNumber: number;
  secondaryTag: string;
  simulationLink: string | null;
  solutionImageFile: string;
  topic: string | null;
  tutorialVideoLink: string | null;
  uniqueKey: string;
  version: number;
  warnings: string[];
}

interface PackageAuthority {
  idempotencyKeyHash: string;
  packageId: string;
  requestFingerprint: string;
  uploadLogId: string;
}

interface CanonicalAssetPlan {
  asset: StoredPackageAsset;
  assetKind: "questionImage" | "solutionImage";
  objectPath: string;
  questionId: string;
  rowNumber: number;
  target: StorageObjectTarget;
  version: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(
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

function positiveInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new AdminQuestionBankValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a positive integer.`,
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
  const actorRole = requiredString(input.actorRole, "actorRole").toLowerCase();
  if (!ALLOWED_ROLES.has(actorRole)) {
    throw new AdminQuestionBankValidationError(
      "FORBIDDEN",
      "Question package operations require the teacher or admin role.",
    );
  }
  return {
    actorId: requiredString(input.actorId, "actorId"),
    actorRole,
    instituteId: requiredString(input.instituteId, "instituteId"),
    ...(typeof input.ipAddress === "string" && input.ipAddress.trim() ?
      {ipAddress: input.ipAddress.trim()} : {}),
    ...(typeof input.userAgent === "string" && input.userAgent.trim() ?
      {userAgent: input.userAgent.trim()} : {}),
  };
}

function decodeBase64(value: unknown): Buffer {
  const encoded = requiredString(
    value,
    "contentBase64",
    Math.ceil(QUESTION_PACKAGE_LIMITS.maxArchiveBytes * 4 / 3) + 8,
  ).replace(/\s+/g, "");
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    throw new AdminQuestionBankValidationError(
      "VALIDATION_ERROR",
      "Field \"contentBase64\" must be canonical base64.",
    );
  }
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length === 0 || bytes.length > QUESTION_PACKAGE_LIMITS.maxArchiveBytes) {
    throw new AdminQuestionBankValidationError(
      "VALIDATION_ERROR",
      "Question package is empty or exceeds the 12 MiB compressed-size bound.",
    );
  }
  return bytes;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
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

function buildPackageAuthority(input: {
  contentSha256: string;
  examType: string;
  fileName: string;
  idempotencyKey: string;
  instituteId: string;
  subject: string | null;
}): PackageAuthority {
  const idempotencyKeyHash = sha256(input.idempotencyKey);
  const packageId = `question_package_${sha256(
    `${input.instituteId}:${idempotencyKeyHash}`,
  ).slice(0, 40)}`;
  return {
    idempotencyKeyHash,
    packageId,
    requestFingerprint: sha256(stableJson({
      contentSha256: input.contentSha256,
      examType: input.examType,
      fileName: input.fileName,
      subject: input.subject,
    })),
    uploadLogId: packageId,
  };
}

function buildCommitAuthority(input: {
  actorId: string;
  expectedPackageRevision: number;
  idempotencyKey: string;
  instituteId: string;
  packageId: string;
}): {auditId: string; fingerprint: string; keyHash: string} {
  const keyHash = sha256(input.idempotencyKey);
  return {
    auditId: `question_package_commit_${sha256(
      `${input.instituteId}:${input.packageId}:${keyHash}`,
    ).slice(0, 40)}`,
    fingerprint: sha256(stableJson({
      actorId: input.actorId,
      expectedPackageRevision: input.expectedPackageRevision,
      packageId: input.packageId,
    })),
    keyHash,
  };
}

function buildRollbackAuthority(input: {
  actorId: string;
  expectedPackageRevision: number;
  idempotencyKey: string;
  instituteId: string;
  reason: string;
  uploadLogId: string;
}): {auditId: string; fingerprint: string; keyHash: string} {
  const keyHash = sha256(input.idempotencyKey);
  return {
    auditId: `question_package_rollback_${sha256(
      `${input.instituteId}:${input.uploadLogId}:${keyHash}`,
    ).slice(0, 40)}`,
    fingerprint: sha256(stableJson({
      actorId: input.actorId,
      expectedPackageRevision: input.expectedPackageRevision,
      reason: input.reason,
      uploadLogId: input.uploadLogId,
    })),
    keyHash,
  };
}

function buildQuestionId(uniqueKey: string, version: number): string {
  const slug = uniqueKey.toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug}-v${version}`;
}

function toTimestampIso(value: Timestamp): string {
  return value.toDate().toISOString();
}

function replayValidationResult(
  data: FirebaseFirestore.DocumentData,
  fingerprint: string,
): AdminQuestionPackageValidationResult | null {
  if (data.requestFingerprint !== fingerprint) {
    throw new AdminQuestionBankValidationError(
      "CONFLICT",
      "Idempotency key has already been used for another question package.",
    );
  }
  if (!isRecord(data.validationResult)) {
    return null;
  }
  return {
    ...data.validationResult,
    disposition: "replayed",
  } as AdminQuestionPackageValidationResult;
}

function asStoredAsset(value: ParsedQuestionPackageAsset): StoredPackageAsset {
  return {
    contentSha256: value.contentSha256,
    extension: value.extension,
    fileName: value.fileName,
  };
}

function structuralChanges(
  existing: FirebaseFirestore.DocumentData,
  row: StoredPackageRow,
  questionPath: string,
  solutionPath: string,
  examType: string,
  subject: string | null,
): string[] {
  const expected: Record<string, unknown> = {
    academicYear: row.academicYear,
    chapter: row.chapter,
    correctAnswer: row.correctAnswer,
    difficulty: row.difficulty,
    examType,
    marks: row.marks,
    negativeMarks: row.negativeMarks,
    questionImageUrl: questionPath,
    questionNo: row.questionNo,
    questionText: row.questionText,
    questionType: row.questionType,
    solutionImageUrl: solutionPath,
    subject,
    uniqueKey: row.uniqueKey,
    version: row.version,
  };
  return Object.entries(expected)
    .filter(([, value]) => value !== undefined)
    .filter(([field, value]) => (existing[field] ?? null) !== value)
    .map(([field]) => field);
}

function toUsage(
  existing: FirebaseFirestore.DocumentData,
  templates: FirebaseFirestore.QuerySnapshot | undefined,
): {isUsed: boolean; templateIds: string[]} {
  if (templates && templates.size > MAX_USAGE_TEMPLATES) {
    throw new AdminQuestionBankValidationError(
      "CONFLICT",
      `Question usage exceeds the ${MAX_USAGE_TEMPLATES}-template guard bound.`,
    );
  }
  const templateIds = (templates?.docs ?? []).filter((document) => {
    const data = document.data();
    return data.status === "assigned" ||
      (typeof data.totalRuns === "number" && data.totalRuns > 0);
  }).map((document) => document.id).sort();
  return {
    isUsed: templateIds.length > 0 ||
      existing.status === "used" ||
      (typeof existing.usedCount === "number" && existing.usedCount > 0),
    templateIds,
  };
}

function getStorageErrorCode(error: unknown): string {
  if (!isRecord(error)) return "";
  return String(error.code ?? "");
}

function createDefaultStorageAdapter(): PackageStorageAdapter {
  const bucket = storageBucketArchitectureService.getBucket("questionAssets");
  const cacheControl = cdnArchitectureService.initializeArchitecture()
    .cachePolicies.hot.cacheControl;
  return {
    async deleteObject(objectPath) {
      try {
        await bucket.file(objectPath).delete();
      } catch (error) {
        if (!getStorageErrorCode(error).includes("404")) throw error;
      }
    },
    async putObject(input) {
      const file = bucket.file(input.objectPath);
      try {
        const [metadata] = await file.getMetadata();
        if (metadata.metadata?.contentSha256 !== input.metadata.contentSha256) {
          throw new AdminQuestionBankValidationError(
            "CONFLICT",
            `Managed object "${input.objectPath}" already has different content.`,
          );
        }
        return "replayed";
      } catch (error) {
        if (!getStorageErrorCode(error).includes("404")) throw error;
      }
      try {
        await file.save(input.bytes, {
          contentType: input.contentType,
          metadata: {
            cacheControl: input.contentType === "application/zip" ?
              "private, no-store" : cacheControl,
            metadata: input.metadata,
          },
          preconditionOpts: {ifGenerationMatch: 0},
          resumable: false,
        });
        return "created";
      } catch (error) {
        if (!getStorageErrorCode(error).includes("412")) throw error;
        const [metadata] = await file.getMetadata();
        if (metadata.metadata?.contentSha256 !== input.metadata.contentSha256) {
          throw new AdminQuestionBankValidationError(
            "CONFLICT",
            `Managed object "${input.objectPath}" won a conflicting upload.`,
          );
        }
        return "replayed";
      }
    },
    async readObject(objectPath) {
      const [bytes] = await bucket.file(objectPath).download();
      return bytes;
    },
    async verifyObject(objectPath, contentSha256) {
      const [metadata] = await bucket.file(objectPath).getMetadata();
      if (metadata.metadata?.contentSha256 !== contentSha256) {
        throw new AdminQuestionBankValidationError(
          "CONFLICT",
          `Managed object "${objectPath}" is missing or has invalid authority.`,
        );
      }
    },
  };
}

export class AdminQuestionPackagesService {
  constructor(
    private readonly dependencies: AdminQuestionPackageDependencies = {
      firestore: getFirestore(),
      now: () => Timestamp.now(),
      resolveStorageTarget: (input) =>
        storageBucketArchitectureService.resolveQuestionAssetStorageTarget(input),
      storage: createDefaultStorageAdapter(),
    },
  ) {}

  public normalizeValidateRequest(input: {
    actorId?: unknown;
    actorRole?: unknown;
    body?: unknown;
    instituteId?: unknown;
    ipAddress?: unknown;
    userAgent?: unknown;
  }): AdminQuestionPackageValidateValidatedRequest {
    const body = isRecord(input.body) ? input.body : {};
    const subject = body.subject === null ? null :
      requiredString(body.subject, "subject");
    const fileName = requiredString(body.fileName, "fileName");
    if (!fileName.toLowerCase().endsWith(".zip") || fileName.includes("/") ||
      fileName.includes("\\")) {
      throw new AdminQuestionBankValidationError(
        "VALIDATION_ERROR",
        "Field \"fileName\" must be a root-safe .zip file name.",
      );
    }
    return {
      ...normalizeContext(input),
      contentBase64: requiredString(
        body.contentBase64,
        "contentBase64",
        Math.ceil(QUESTION_PACKAGE_LIMITS.maxArchiveBytes * 4 / 3) + 8,
      ),
      examType: requiredString(body.examType, "examType"),
      fileName,
      idempotencyKey: requiredString(body.idempotencyKey, "idempotencyKey", 128),
      subject,
    };
  }

  public normalizeCommitRequest(input: {
    actorId?: unknown;
    actorRole?: unknown;
    body?: unknown;
    instituteId?: unknown;
    ipAddress?: unknown;
    packageId?: unknown;
    userAgent?: unknown;
  }): AdminQuestionPackageCommitValidatedRequest {
    const body = isRecord(input.body) ? input.body : {};
    return {
      ...normalizeContext(input),
      expectedPackageRevision: positiveInteger(
        body.expectedPackageRevision,
        "expectedPackageRevision",
      ),
      idempotencyKey: requiredString(body.idempotencyKey, "idempotencyKey", 128),
      packageId: requiredString(input.packageId, "packageId"),
    };
  }

  public normalizeRollbackRequest(input: {
    actorId?: unknown;
    actorRole?: unknown;
    body?: unknown;
    instituteId?: unknown;
    ipAddress?: unknown;
    uploadLogId?: unknown;
    userAgent?: unknown;
  }): AdminQuestionPackageRollbackValidatedRequest {
    const body = isRecord(input.body) ? input.body : {};
    return {
      ...normalizeContext(input),
      expectedPackageRevision: positiveInteger(
        body.expectedPackageRevision,
        "expectedPackageRevision",
      ),
      idempotencyKey: requiredString(body.idempotencyKey, "idempotencyKey", 128),
      reason: requiredString(body.reason, "reason", 500),
      uploadLogId: requiredString(input.uploadLogId, "uploadLogId"),
    };
  }

  public async validatePackage(
    request: AdminQuestionPackageValidateValidatedRequest,
  ): Promise<AdminQuestionPackageValidationResult> {
    const content = decodeBase64(request.contentBase64);
    let parsed: ParsedQuestionPackage;
    try {
      parsed = parseQuestionPackage(content);
    } catch (error) {
      if (error instanceof QuestionPackageParserError) {
        throw new AdminQuestionBankValidationError("VALIDATION_ERROR", error.message);
      }
      throw error;
    }
    const authority = buildPackageAuthority({
      contentSha256: parsed.contentSha256,
      examType: request.examType,
      fileName: request.fileName,
      idempotencyKey: request.idempotencyKey,
      instituteId: request.instituteId,
      subject: request.subject,
    });
    const references = this.references(request.instituteId, authority.packageId);
    const prior = await references.packageReference.get();
    if (prior.exists) {
      const replay = replayValidationResult(
        prior.data() ?? {},
        authority.requestFingerprint,
      );
      if (replay) return replay;
    }

    const evaluated = await this.evaluateRows(request, parsed);
    const timestamp = this.dependencies.now();
    const expiresAt = Timestamp.fromMillis(timestamp.toMillis() + PACKAGE_TTL_MS);
    const invalid = evaluated.results.filter((row) => row.errors.length > 0).length;
    const summary: AdminQuestionPackageSummary = {
      assetCount: parsed.assets.size,
      created: evaluated.rows.filter((row) => row.action === "create").length,
      invalid,
      received: parsed.rows.length,
      updated: evaluated.rows.filter((row) => row.action === "update").length,
      valid: parsed.rows.length - invalid,
      warnings: parsed.warnings.length + evaluated.results.reduce(
        (total, row) => total + row.warnings.length,
        0,
      ),
    };
    const globalRows: AdminQuestionPackageRowResult[] = parsed.globalErrors.length ? [{
      action: "none",
      errors: parsed.globalErrors,
      questionId: null,
      rowNumber: 0,
      uniqueKey: null,
      version: null,
      warnings: parsed.warnings,
    }] : [];
    const validationResult: AdminQuestionPackageValidationResult = {
      contentSha256: parsed.contentSha256,
      disposition: "applied",
      expiresAt: toTimestampIso(expiresAt),
      packageId: authority.packageId,
      packageRevision: 1,
      rows: [...globalRows, ...evaluated.results],
      state: parsed.globalErrors.length || invalid > 0 ?
        "validation_failed" : "validated",
      summary: {
        ...summary,
        invalid: summary.invalid + globalRows.length,
      },
      uploadLogId: authority.uploadLogId,
      validatedAt: toTimestampIso(timestamp),
    };
    const packageData = {
      actorId: request.actorId,
      assetManifest: Array.from(parsed.assets.values()).map(asStoredAsset),
      contentSha256: parsed.contentSha256,
      createdAt: timestamp,
      examType: request.examType,
      expiresAt,
      fileName: request.fileName,
      idempotencyKeyHash: authority.idempotencyKeyHash,
      instituteId: request.instituteId,
      packageId: authority.packageId,
      packageRevision: 1,
      requestFingerprint: authority.requestFingerprint,
      rows: evaluated.rows,
      rowsFingerprint: sha256(stableJson(evaluated.rows)),
      state: validationResult.state,
      subject: request.subject,
      uploadLogId: authority.uploadLogId,
      validatedAt: timestamp,
      validationResult,
    };
    if (validationResult.state === "validation_failed") {
      const disposition = await this.createValidationAuthority(
        references,
        packageData,
        validationResult,
      );
      return disposition === "replayed" ?
        {...validationResult, disposition: "replayed"} : validationResult;
    }

    const stagingPath = this.stagingPath(
      request.instituteId,
      authority.packageId,
      parsed.contentSha256,
    );
    await this.dependencies.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(references.packageReference);
      if (snapshot.exists) {
        replayValidationResult(snapshot.data() ?? {}, authority.requestFingerprint);
        return;
      }
      transaction.create(references.packageReference, {
        ...packageData,
        stagingPath,
        state: "staging",
        validationResult: null,
      });
    });
    try {
      await this.dependencies.storage.putObject({
        bytes: content,
        contentType: "application/zip",
        metadata: {
          contentSha256: parsed.contentSha256,
          packageId: authority.packageId,
        },
        objectPath: stagingPath,
      });
      await this.dependencies.storage.verifyObject(stagingPath, parsed.contentSha256);
      const disposition = await this.createValidationAuthority(
        references,
        {...packageData, stagingPath},
        validationResult,
      );
      if (disposition === "replayed") {
        return {...validationResult, disposition: "replayed"};
      }
    } catch (error) {
      await this.recordValidationFailure(references, stagingPath, error);
      throw error;
    }
    return validationResult;
  }

  public async commitPackage(
    request: AdminQuestionPackageCommitValidatedRequest,
  ): Promise<AdminQuestionPackageCommitResult> {
    const authority = buildCommitAuthority({
      actorId: request.actorId,
      expectedPackageRevision: request.expectedPackageRevision,
      idempotencyKey: request.idempotencyKey,
      instituteId: request.instituteId,
      packageId: request.packageId,
    });
    const references = this.references(request.instituteId, request.packageId);
    let packageData = await this.claimCommit(request, authority, references);
    const replay = this.readCommitReplay(packageData, authority.fingerprint);
    if (replay) return replay;

    if (packageData.phase === "firestore_applied" ||
      packageData.recoveryPhase === "staging_cleanup") {
      await this.cleanupStagingAndFinalize(references, packageData, authority);
      const refreshed = await references.packageReference.get();
      const result = this.readCommitReplay(
        refreshed.data() ?? {},
        authority.fingerprint,
      );
      if (!result) {
        throw new AdminQuestionBankValidationError(
          "CONFLICT",
          "Question package commit could not finalize its stored result.",
        );
      }
      return result;
    }

    if (packageData.recoveryPhase === "canonical_cleanup") {
      await this.cleanupCanonicalObjects(packageData.createdCanonicalObjects);
      await references.packageReference.update({
        createdCanonicalObjects: FieldValue.delete(),
        recoveryPhase: FieldValue.delete(),
        state: "committing",
      });
      packageData = (await references.packageReference.get()).data() ?? {};
    }

    const stagingPath = requiredString(packageData.stagingPath, "stagingPath", 1024);
    let content: Buffer;
    let parsed: ParsedQuestionPackage;
    try {
      content = await this.dependencies.storage.readObject(stagingPath);
      if (sha256(content) !== packageData.contentSha256) {
        throw new AdminQuestionBankValidationError(
          "CONFLICT",
          "Staged package content no longer matches validation authority.",
        );
      }
      parsed = parseQuestionPackage(content);
    } catch (error) {
      await this.recordRecovery(references, "staging_read", [], error);
      throw error;
    }
    const storedRows = this.readStoredRows(packageData);
    if (sha256(stableJson(storedRows)) !== packageData.rowsFingerprint) {
      throw new AdminQuestionBankValidationError(
        "CONFLICT",
        "Stored package rows no longer match validation authority.",
      );
    }
    const assetPlans = this.buildAssetPlans(
      request.instituteId,
      storedRows,
      parsed.assets,
    );
    const createdCanonicalObjects: string[] = [];
    try {
      for (const plan of assetPlans) {
        const parsedAsset = parsed.assets.get(plan.asset.fileName);
        if (!parsedAsset || parsedAsset.contentSha256 !== plan.asset.contentSha256) {
          throw new AdminQuestionBankValidationError(
            "CONFLICT",
            `Package asset "${plan.asset.fileName}" no longer matches validation.`,
          );
        }
        const disposition = await this.dependencies.storage.putObject({
          bytes: parsedAsset.bytes,
          contentType: plan.target.contentType,
          metadata: {
            contentSha256: parsedAsset.contentSha256,
            packageId: request.packageId,
          },
          objectPath: plan.objectPath,
        });
        if (disposition === "created") createdCanonicalObjects.push(plan.objectPath);
      }
      for (const plan of assetPlans) {
        await this.dependencies.storage.verifyObject(
          plan.objectPath,
          plan.asset.contentSha256,
        );
      }
      const applied = await this.applyQuestionWrites(
        request,
        authority,
        references,
        storedRows,
        assetPlans,
      );
      packageData = applied.packageData;
      await this.cleanupStagingAndFinalize(references, packageData, authority);
      return {...applied.result, disposition: "applied"};
    } catch (error) {
      const current = await references.packageReference.get();
      if (current.data()?.phase === "firestore_applied") {
        await this.recordRecovery(
          references,
          "staging_cleanup",
          createdCanonicalObjects,
          error,
        );
      } else {
        try {
          await this.cleanupCanonicalObjects(createdCanonicalObjects);
          await references.packageReference.update({
            commitAuditId: FieldValue.delete(),
            commitFingerprint: FieldValue.delete(),
            commitIdempotencyKeyHash: FieldValue.delete(),
            phase: FieldValue.delete(),
            state: "validated",
          });
        } catch (cleanupError) {
          await this.recordRecovery(
            references,
            "canonical_cleanup",
            createdCanonicalObjects,
            cleanupError,
          );
        }
      }
      throw error;
    }
  }

  public async rollbackPackage(
    request: AdminQuestionPackageRollbackValidatedRequest,
  ): Promise<AdminQuestionPackageRollbackResult> {
    const authority = buildRollbackAuthority(request);
    const references = this.references(request.instituteId, request.uploadLogId);
    const claimed = await this.claimRollback(request, authority, references);
    const storedResult = claimed.rollbackResult;
    if (!isRecord(storedResult)) {
      throw new AdminQuestionBankValidationError(
        "CONFLICT", "Question package rollback result is missing.",
      );
    }
    const result = storedResult as unknown as AdminQuestionPackageRollbackResult;
    if (claimed.state === "rolled_back") {
      return {...result, disposition: "replayed"};
    }

    const assetPaths = Array.isArray(claimed.rollbackAssetPaths) ?
      claimed.rollbackAssetPaths.filter((value): value is string =>
        typeof value === "string") : [];
    try {
      await this.cleanupCanonicalObjects(assetPaths);
    } catch (error) {
      await references.packageReference.update({
        failureMessage: error instanceof Error ? error.message : String(error),
        recoveryPhase: "rollback_asset_cleanup",
        state: "failed_recoverable",
      });
      await references.uploadLogReference.update({
        rollbackEligible: false,
        rollbackReason: "Rollback asset cleanup must complete before finalization.",
        state: "failed_recoverable",
      });
      throw new AdminQuestionBankValidationError(
        "CONFLICT", "Question rollback is recoverable but asset cleanup is incomplete.",
      );
    }

    await this.dependencies.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(references.packageReference);
      const data = snapshot.data() ?? {};
      if (data.rollbackFingerprint !== authority.fingerprint) {
        throw new AdminQuestionBankValidationError(
          "CONFLICT", "Question package rollback authority changed during cleanup.",
        );
      }
      if (data.state === "rolled_back") return;
      transaction.update(references.packageReference, {
        recoveryPhase: FieldValue.delete(),
        rolledBackAt: result.rolledBackAt,
        state: "rolled_back",
      });
      transaction.update(references.uploadLogReference, {
        packageRevision: result.packageRevision,
        rollbackEligible: false,
        rollbackReason: "Package was rolled back.",
        state: "rolled_back",
      });
    });
    return result;
  }

  private async evaluateRows(
    request: AdminQuestionPackageValidateValidatedRequest,
    parsed: ParsedQuestionPackage,
  ): Promise<{results: AdminQuestionPackageRowResult[]; rows: StoredPackageRow[]}> {
    const institute = this.dependencies.firestore.collection(INSTITUTES_COLLECTION)
      .doc(request.instituteId);
    const questions = institute.collection(QUESTION_BANK_COLLECTION);
    const results: AdminQuestionPackageRowResult[] = [];
    const storedRows: StoredPackageRow[] = [];
    const claimedQuestionIds = new Map<string, string>();
    for (const row of parsed.rows) {
      const errors = [...row.errors];
      const warnings = [...row.warnings];
      const version = row.version;
      const questionId = row.uniqueKey && version ?
        buildQuestionId(row.uniqueKey, version) : null;
      if (questionId && row.uniqueKey) {
        const claimedKey = claimedQuestionIds.get(questionId);
        if (claimedKey && claimedKey !== row.uniqueKey) {
          errors.push(
            `UniqueKey conflicts with package key "${claimedKey}" after ` +
            "question identity normalization.",
          );
        } else {
          claimedQuestionIds.set(questionId, row.uniqueKey);
        }
      }
      let action: "create" | "update" | "none" = "none";
      let existing: FirebaseFirestore.DocumentSnapshot | null = null;
      if (questionId && row.uniqueKey && errors.length === 0) {
        [existing] = await Promise.all([
          questions.doc(questionId).get(),
        ]);
        const uniqueKeys = await questions.where("uniqueKey", "==", row.uniqueKey)
          .limit(2).get();
        if (existing.exists && existing.get("uniqueKey") !== row.uniqueKey) {
          errors.push("Question identity is already owned by another UniqueKey.");
        }
        if (uniqueKeys.docs.some((document) => document.id !== questionId)) {
          errors.push("UniqueKey is already assigned to another question.");
        }
        action = existing.exists ? "update" : "create";
      }
      if (
        errors.length === 0 &&
        questionId &&
        row.uniqueKey &&
        version &&
        row.difficulty &&
        row.marks !== null &&
        row.negativeMarks !== null &&
        row.primaryTag &&
        row.secondaryTag
      ) {
        const questionTarget = this.assetTarget(
          request.instituteId,
          questionId,
          version,
          "questionImage",
          parsed.assets.get(row.questionImageFile),
        );
        const solutionTarget = this.assetTarget(
          request.instituteId,
          questionId,
          version,
          "solutionImage",
          parsed.assets.get(row.solutionImageFile),
        );
        const storedRow: StoredPackageRow = {
          academicYear: row.academicYear,
          action: action as "create" | "update",
          additionalTag: row.additionalTag,
          chapter: row.chapter,
          correctAnswer: row.correctAnswer,
          difficulty: row.difficulty,
          internalNotes: row.internalNotes,
          marks: row.marks,
          negativeMarks: row.negativeMarks,
          primaryTag: row.primaryTag,
          questionId,
          questionImageFile: row.questionImageFile,
          questionNo: row.questionNo,
          questionText: row.questionText,
          questionType: row.questionType,
          rowNumber: row.rowNumber,
          secondaryTag: row.secondaryTag,
          simulationLink: row.simulationLink,
          solutionImageFile: row.solutionImageFile,
          topic: row.topic,
          tutorialVideoLink: row.tutorialVideoLink,
          uniqueKey: row.uniqueKey,
          version,
          warnings,
        };
        if (existing?.exists) {
          const data = existing.data() ?? {};
          const changes = structuralChanges(
            data,
            storedRow,
            questionTarget.objectPath,
            solutionTarget.objectPath,
            request.examType,
            request.subject,
          );
          if (changes.length > 0) {
            const templates = await institute.collection(TESTS_COLLECTION)
              .where("questionIds", "array-contains", questionId)
              .limit(MAX_USAGE_TEMPLATES + 1).get();
            if (toUsage(data, templates).isUsed) {
              errors.push(
                `Used question structure cannot change (${changes.join(", ")}); ` +
                "create a successor version.",
              );
            }
          }
        }
        if (errors.length === 0) {
          storedRows.push(storedRow);
        }
      }
      results.push({
        action: errors.length ? "none" : action,
        errors,
        questionId,
        rowNumber: row.rowNumber,
        uniqueKey: row.uniqueKey,
        version,
        warnings,
      });
    }
    return {results, rows: storedRows};
  }

  private assetTarget(
    instituteId: string,
    questionId: string,
    version: number,
    assetKind: "questionImage" | "solutionImage",
    asset: ParsedQuestionPackageAsset | undefined,
  ): StorageObjectTarget {
    if (!asset) {
      throw new AdminQuestionBankValidationError(
        "VALIDATION_ERROR",
        `Package is missing ${assetKind} bytes for row "${questionId}".`,
      );
    }
    return this.dependencies.resolveStorageTarget({
      assetKind,
      extension: asset.extension,
      instituteId,
      questionId,
      version,
    });
  }

  private async createValidationAuthority(
    references: ReturnType<AdminQuestionPackagesService["references"]>,
    packageData: Record<string, unknown>,
    result: AdminQuestionPackageValidationResult,
  ): Promise<"created" | "replayed"> {
    return this.dependencies.firestore.runTransaction(async (transaction) => {
      const [snapshot, uploadLogSnapshot] = await Promise.all([
        transaction.get(references.packageReference),
        transaction.get(references.uploadLogReference),
      ]);
      if (snapshot.exists && snapshot.data()?.requestFingerprint !==
        packageData.requestFingerprint) {
        throw new AdminQuestionBankValidationError(
          "CONFLICT",
          "Package validation authority conflicts with another command.",
        );
      }
      if (isRecord(snapshot.data()?.validationResult)) {
        if (!uploadLogSnapshot.exists) {
          throw new AdminQuestionBankValidationError(
            "CONFLICT",
            "Validated package is missing its immutable upload log.",
          );
        }
        return "replayed";
      }
      if (uploadLogSnapshot.exists) {
        throw new AdminQuestionBankValidationError(
          "CONFLICT",
          "Question package upload-log authority already exists.",
        );
      }
      transaction.set(references.packageReference, {
        ...packageData,
        state: result.state,
        validationResult: result,
      });
      transaction.create(references.uploadLogReference, {
        committedAt: null,
        contentSha256: result.contentSha256,
        packageId: result.packageId,
        packageRevision: result.packageRevision,
        rollbackEligible: false,
        rollbackReason: "Package has not been committed.",
        rows: result.rows,
        state: result.state,
        summary: result.summary,
        uploadLogId: result.uploadLogId,
        uploadedBy: packageData.actorId,
        validatedAt: packageData.validatedAt,
      });
      return "created";
    });
  }

  private async recordValidationFailure(
    references: ReturnType<AdminQuestionPackagesService["references"]>,
    stagingPath: string,
    error: unknown,
  ): Promise<void> {
    let cleanupFailed = false;
    try {
      await this.dependencies.storage.deleteObject(stagingPath);
    } catch {
      cleanupFailed = true;
    }
    await references.packageReference.set({
      failureMessage: error instanceof Error ? error.message : String(error),
      recoveryPhase: cleanupFailed ? "validation_staging_cleanup" : null,
      state: cleanupFailed ? "failed_recoverable" : "validation_failed",
    }, {merge: true});
  }

  private async claimRollback(
    request: AdminQuestionPackageRollbackValidatedRequest,
    authority: ReturnType<typeof buildRollbackAuthority>,
    references: ReturnType<AdminQuestionPackagesService["references"]>,
  ): Promise<FirebaseFirestore.DocumentData> {
    return this.dependencies.firestore.runTransaction(async (transaction) => {
      const [packageSnapshot, logSnapshot] = await Promise.all([
        transaction.get(references.packageReference),
        transaction.get(references.uploadLogReference),
      ]);
      if (!packageSnapshot.exists || !logSnapshot.exists) {
        throw new AdminQuestionBankValidationError(
          "NOT_FOUND", `Question upload log "${request.uploadLogId}" was not found.`,
        );
      }
      const data = packageSnapshot.data() ?? {};
      if (data.instituteId !== request.instituteId ||
        data.uploadLogId !== request.uploadLogId) {
        throw new AdminQuestionBankValidationError(
          "NOT_FOUND", "Question upload log was not found.",
        );
      }
      if (data.rollbackFingerprint) {
        if (data.rollbackFingerprint !== authority.fingerprint ||
          data.rollbackIdempotencyKeyHash !== authority.keyHash) {
          throw new AdminQuestionBankValidationError(
            "CONFLICT", "Question package rollback idempotency key has different semantics.",
          );
        }
        if (data.state === "rolled_back" || data.state === "rollback_pending" ||
          (data.state === "failed_recoverable" &&
            data.recoveryPhase === "rollback_asset_cleanup")) {
          return data;
        }
      }
      if (data.state !== "committed" || !isRecord(data.commitResult)) {
        throw new AdminQuestionBankValidationError(
          "CONFLICT", "Only a committed question package can be rolled back.",
        );
      }
      if (data.packageRevision !== request.expectedPackageRevision) {
        throw new AdminQuestionBankValidationError(
          "CONFLICT",
          `Package revision conflict: expected ${request.expectedPackageRevision}, ` +
            `current revision is ${String(data.packageRevision)}.`,
        );
      }
      const committed = Array.isArray(data.commitResult.questions) ?
        data.commitResult.questions : [];
      if (committed.length === 0 ||
        committed.length > QUESTION_PACKAGE_LIMITS.maxRows ||
        committed.some((value) => !isRecord(value) || value.action !== "create")) {
        throw new AdminQuestionBankValidationError(
          "CONFLICT", "Only create-only packages with bounded authority can be rolled back.",
        );
      }
      const institute = this.dependencies.firestore.collection(INSTITUTES_COLLECTION)
        .doc(request.instituteId);
      const questionReferences = committed.map((value) => institute
        .collection(QUESTION_BANK_COLLECTION).doc(requiredString(
          (value as Record<string, unknown>).questionId,
          "commitResult.questionId",
        )));
      const questionSnapshots = await Promise.all(questionReferences.map((reference) =>
        transaction.get(reference)));
      const usageSnapshots = await Promise.all(questionReferences.map((reference) =>
        transaction.get(institute.collection(TESTS_COLLECTION)
          .where("questionIds", "array-contains", reference.id)
          .limit(MAX_USAGE_TEMPLATES + 1))));
      const assetPaths = new Set<string>();
      questionSnapshots.forEach((snapshot, index) => {
        const committedQuestion = committed[index] as Record<string, unknown>;
        if (!snapshot.exists) {
          throw new AdminQuestionBankValidationError(
            "CONFLICT", `Committed question "${snapshot.id}" is missing.`,
          );
        }
        const question = snapshot.data() ?? {};
        if (question.revision !== committedQuestion.revision ||
          question.version !== committedQuestion.version ||
          (typeof question.usedCount === "number" && question.usedCount > 0) ||
          question.usedInTemplate === true || question.status === "used" ||
          usageSnapshots[index].docs.some((template) => {
            const templateData = template.data();
            return templateData.status === "assigned" ||
              (typeof templateData.totalRuns === "number" && templateData.totalRuns > 0);
          })) {
          throw new AdminQuestionBankValidationError(
            "CONFLICT",
            `Committed question "${snapshot.id}" changed or entered assigned use.`,
          );
        }
        [question.questionImageUrl, question.solutionImageUrl].forEach((value) => {
          if (typeof value !== "string" || !value) return;
          const prefix = `${request.instituteId}/questions/${snapshot.id}/`;
          if (!value.startsWith(prefix) || value.includes("..") ||
            (!value.endsWith(".png") && !value.endsWith(".webp"))) {
            throw new AdminQuestionBankValidationError(
              "CONFLICT", `Question "${snapshot.id}" has an unmanaged asset path.`,
            );
          }
          assetPaths.add(value);
        });
      });
      const timestamp = this.dependencies.now();
      const result: AdminQuestionPackageRollbackResult = {
        auditId: authority.auditId,
        disposition: "applied",
        packageId: request.uploadLogId,
        packageRevision: request.expectedPackageRevision + 1,
        removedAssetCount: assetPaths.size,
        removedQuestionCount: committed.length,
        rolledBackAt: toTimestampIso(timestamp),
        state: "rolled_back",
        uploadLogId: request.uploadLogId,
      };
      questionReferences.forEach((reference) => transaction.delete(reference));
      transaction.update(references.packageReference, {
        packageRevision: result.packageRevision,
        rollbackAssetPaths: Array.from(assetPaths).sort(),
        rollbackFingerprint: authority.fingerprint,
        rollbackIdempotencyKeyHash: authority.keyHash,
        rollbackResult: result,
        rollbackStartedAt: timestamp,
        state: "rollback_pending",
      });
      transaction.update(references.uploadLogReference, {
        packageRevision: result.packageRevision,
        rollbackEligible: false,
        rollbackReason: "Rollback is being finalized.",
        state: "rollback_pending",
      });
      transaction.create(references.auditReference(authority.auditId), {
        actionType: "ROLLBACK_QUESTION_PACKAGE",
        actorId: request.actorId,
        actorRole: request.actorRole,
        actorUid: request.actorId,
        auditId: authority.auditId,
        entityId: request.uploadLogId,
        entityType: "questionPackage",
        instituteId: request.instituteId,
        metadata: {
          idempotencyKeyHash: authority.keyHash,
          reason: request.reason,
          removedAssetCount: result.removedAssetCount,
          removedQuestionCount: result.removedQuestionCount,
          requestFingerprint: authority.fingerprint,
          source: "AdminQuestionPackagesService",
        },
        targetCollection: PACKAGES_COLLECTION,
        targetId: request.uploadLogId,
        tenantId: request.instituteId,
        timestamp,
      });
      return {
        ...data,
        packageRevision: result.packageRevision,
        rollbackAssetPaths: Array.from(assetPaths).sort(),
        rollbackFingerprint: authority.fingerprint,
        rollbackIdempotencyKeyHash: authority.keyHash,
        rollbackResult: result,
        state: "rollback_pending",
      };
    });
  }

  private async claimCommit(
    request: AdminQuestionPackageCommitValidatedRequest,
    authority: ReturnType<typeof buildCommitAuthority>,
    references: ReturnType<AdminQuestionPackagesService["references"]>,
  ): Promise<FirebaseFirestore.DocumentData> {
    return this.dependencies.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(references.packageReference);
      if (!snapshot.exists) {
        throw new AdminQuestionBankValidationError(
          "NOT_FOUND",
          `Question package "${request.packageId}" was not found.`,
        );
      }
      const data = snapshot.data() ?? {};
      if (data.instituteId !== request.instituteId) {
        throw new AdminQuestionBankValidationError("NOT_FOUND", "Question package was not found.");
      }
      if (data.state === "committed") {
        this.assertCommitFingerprint(data, authority.fingerprint);
        return data;
      }
      if (data.commitFingerprint) {
        this.assertCommitFingerprint(data, authority.fingerprint);
        return data;
      }
      if (data.state !== "validated") {
        throw new AdminQuestionBankValidationError(
          "CONFLICT",
          `Question package state "${String(data.state)}" cannot be committed.`,
        );
      }
      if (data.packageRevision !== request.expectedPackageRevision) {
        throw new AdminQuestionBankValidationError(
          "CONFLICT",
          `Package revision conflict: expected ${request.expectedPackageRevision}, ` +
          `current revision is ${String(data.packageRevision)}.`,
        );
      }
      if (!(data.expiresAt instanceof Timestamp) ||
        data.expiresAt.toMillis() <= this.dependencies.now().toMillis()) {
        throw new AdminQuestionBankValidationError(
          "CONFLICT",
          "Question package validation has expired.",
        );
      }
      const next = {
        ...data,
        commitAuditId: authority.auditId,
        commitFingerprint: authority.fingerprint,
        commitIdempotencyKeyHash: authority.keyHash,
        commitStartedAt: this.dependencies.now(),
        phase: "asset_upload",
        state: "committing",
      };
      transaction.update(references.packageReference, {
        commitAuditId: authority.auditId,
        commitFingerprint: authority.fingerprint,
        commitIdempotencyKeyHash: authority.keyHash,
        commitStartedAt: next.commitStartedAt,
        phase: next.phase,
        state: next.state,
      });
      return next;
    });
  }

  private assertCommitFingerprint(
    data: FirebaseFirestore.DocumentData,
    fingerprint: string,
  ): void {
    if (data.commitFingerprint !== fingerprint) {
      throw new AdminQuestionBankValidationError(
        "CONFLICT",
        "Question package commit idempotency key has different semantics.",
      );
    }
  }

  private readCommitReplay(
    data: FirebaseFirestore.DocumentData,
    fingerprint: string,
  ): AdminQuestionPackageCommitResult | null {
    if (data.state !== "committed" || !isRecord(data.commitResult)) return null;
    this.assertCommitFingerprint(data, fingerprint);
    return {
      ...data.commitResult,
      disposition: "replayed",
    } as AdminQuestionPackageCommitResult;
  }

  private readStoredRows(data: FirebaseFirestore.DocumentData): StoredPackageRow[] {
    if (!Array.isArray(data.rows) || data.rows.length === 0 ||
      data.rows.length > QUESTION_PACKAGE_LIMITS.maxRows) {
      throw new AdminQuestionBankValidationError(
        "CONFLICT",
        "Question package has no bounded validated rows.",
      );
    }
    return data.rows as StoredPackageRow[];
  }

  private buildAssetPlans(
    instituteId: string,
    rows: StoredPackageRow[],
    assets: Map<string, ParsedQuestionPackageAsset>,
  ): CanonicalAssetPlan[] {
    const plans: CanonicalAssetPlan[] = [];
    rows.forEach((row) => {
      ([
        ["questionImage", row.questionImageFile],
        ["solutionImage", row.solutionImageFile],
      ] as const).forEach(([assetKind, fileName]) => {
        const asset = assets.get(fileName);
        if (!asset) {
          throw new AdminQuestionBankValidationError(
            "CONFLICT",
            `Validated asset "${fileName}" is missing from the staged package.`,
          );
        }
        const target = this.dependencies.resolveStorageTarget({
          assetKind,
          extension: asset.extension,
          instituteId,
          questionId: row.questionId,
          version: row.version,
        });
        plans.push({
          asset: asStoredAsset(asset),
          assetKind,
          objectPath: target.objectPath,
          questionId: row.questionId,
          rowNumber: row.rowNumber,
          target,
          version: row.version,
        });
      });
    });
    return plans;
  }

  private async applyQuestionWrites(
    request: AdminQuestionPackageCommitValidatedRequest,
    authority: ReturnType<typeof buildCommitAuthority>,
    references: ReturnType<AdminQuestionPackagesService["references"]>,
    rows: StoredPackageRow[],
    assetPlans: CanonicalAssetPlan[],
  ): Promise<{
    packageData: FirebaseFirestore.DocumentData;
    result: AdminQuestionPackageCommitResult;
  }> {
    return this.dependencies.firestore.runTransaction(async (transaction) => {
      const packageSnapshot = await transaction.get(references.packageReference);
      const packageData = packageSnapshot.data() ?? {};
      this.assertCommitFingerprint(packageData, authority.fingerprint);
      if (packageData.phase === "firestore_applied" &&
        isRecord(packageData.commitResult)) {
        return {
          packageData,
          result: packageData.commitResult as unknown as AdminQuestionPackageCommitResult,
        };
      }
      if (packageData.state !== "committing" || packageData.phase !== "asset_upload") {
        throw new AdminQuestionBankValidationError(
          "CONFLICT",
          "Question package is not at the atomic Firestore commit boundary.",
        );
      }
      const institute = this.dependencies.firestore.collection(INSTITUTES_COLLECTION)
        .doc(request.instituteId);
      const questionReferences = rows.map((row) =>
        institute.collection(QUESTION_BANK_COLLECTION).doc(row.questionId));
      const questionSnapshots = await Promise.all(questionReferences.map((reference) =>
        transaction.get(reference)));
      const uniqueQueries = rows.map((row) => institute
        .collection(QUESTION_BANK_COLLECTION)
        .where("uniqueKey", "==", row.uniqueKey)
        .limit(2));
      const uniqueSnapshots = await Promise.all(uniqueQueries.map((query) =>
        transaction.get(query)));
      const usageSnapshots: Array<FirebaseFirestore.QuerySnapshot | undefined> = [];
      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const snapshot = questionSnapshots[index];
        const plans = assetPlans.filter((plan) => plan.rowNumber === row?.rowNumber);
        const questionPath = plans.find((plan) =>
          plan.assetKind === "questionImage")?.objectPath ?? "";
        const solutionPath = plans.find((plan) =>
          plan.assetKind === "solutionImage")?.objectPath ?? "";
        if (row && snapshot?.exists && structuralChanges(
          snapshot.data() ?? {},
          row,
          questionPath,
          solutionPath,
          String(packageData.examType),
          packageData.subject === null ? null : String(packageData.subject),
        ).length > 0) {
          usageSnapshots[index] = await transaction.get(institute
            .collection(TESTS_COLLECTION)
            .where("questionIds", "array-contains", row.questionId)
            .limit(MAX_USAGE_TEMPLATES + 1));
        }
      }

      const timestamp = this.dependencies.now();
      const committedQuestions: AdminQuestionPackageCommitResult["questions"] = [];
      rows.forEach((row, index) => {
        const snapshot = questionSnapshots[index];
        if (!snapshot) throw new Error("Question transaction read is missing.");
        if (row.action === "create" && snapshot.exists) {
          throw new AdminQuestionBankValidationError(
            "CONFLICT",
            `Question "${row.questionId}" was created after package validation.`,
          );
        }
        if (row.action === "update" && !snapshot.exists) {
          throw new AdminQuestionBankValidationError(
            "CONFLICT",
            `Question "${row.questionId}" was removed after package validation.`,
          );
        }
        if (uniqueSnapshots[index]?.docs.some((document) =>
          document.id !== row.questionId)) {
          throw new AdminQuestionBankValidationError(
            "CONFLICT",
            `UniqueKey "${row.uniqueKey}" changed ownership after validation.`,
          );
        }
        const existing = snapshot.data() ?? {};
        if (snapshot.exists && existing.uniqueKey !== row.uniqueKey) {
          throw new AdminQuestionBankValidationError(
            "CONFLICT",
            `Question identity "${row.questionId}" changed ownership after validation.`,
          );
        }
        const plans = assetPlans.filter((plan) => plan.rowNumber === row.rowNumber);
        const questionPlan = plans.find((plan) =>
          plan.assetKind === "questionImage");
        const solutionPlan = plans.find((plan) =>
          plan.assetKind === "solutionImage");
        if (!questionPlan || !solutionPlan) {
          throw new AdminQuestionBankValidationError(
            "CONFLICT",
            `Question "${row.questionId}" has an incomplete asset plan.`,
          );
        }
        const changes = snapshot.exists ? structuralChanges(
          existing,
          row,
          questionPlan.objectPath,
          solutionPlan.objectPath,
          String(packageData.examType),
          packageData.subject === null ? null : String(packageData.subject),
        ) : [];
        if (changes.length > 0 && toUsage(existing, usageSnapshots[index]).isUsed) {
          throw new AdminQuestionBankValidationError(
            "CONFLICT",
            `Used question "${row.questionId}" changed after validation ` +
              `(${changes.join(", ")}).`,
          );
        }
        if (snapshot.exists && existing.version !== row.version) {
          throw new AdminQuestionBankValidationError(
            "CONFLICT",
            `Question "${row.questionId}" content version changed after validation.`,
          );
        }
        const revision = snapshot.exists && typeof existing.revision === "number" &&
          Number.isInteger(existing.revision) && existing.revision > 0 ?
          existing.revision + 1 : 1;
        const tags = Array.from(new Set([
          row.primaryTag,
          row.secondaryTag,
          row.additionalTag,
        ].filter((value): value is string => Boolean(value))));
        const keywords = Array.from(new Set([
          row.questionText,
          row.chapter,
          row.topic,
          row.questionType,
        ].filter((value): value is string => Boolean(value))));
        transaction.set(questionReferences[index], {
          academicYear: row.academicYear,
          additionalTag: row.additionalTag,
          chapter: row.chapter,
          correctAnswer: row.correctAnswer,
          createdAt: existing.createdAt instanceof Timestamp ? existing.createdAt : timestamp,
          createdBy: existing.createdBy ?? request.actorId,
          difficulty: row.difficulty,
          examType: packageData.examType,
          internalNotes: row.internalNotes,
          lastUsedAt: existing.lastUsedAt instanceof Timestamp ? existing.lastUsedAt : null,
          marks: row.marks,
          negativeMarks: row.negativeMarks,
          parentQuestionId: existing.parentQuestionId ?? null,
          primaryTag: row.primaryTag,
          questionId: row.questionId,
          questionImageSha256: questionPlan.asset.contentSha256,
          questionImageUrl: questionPlan.objectPath,
          questionNo: row.questionNo,
          questionText: row.questionText,
          questionTextKeywords: keywords,
          questionType: row.questionType,
          revision,
          searchTokens: existing.searchTokens ?? [],
          secondaryTag: row.secondaryTag,
          simulationLink: row.simulationLink,
          solutionImageSha256: solutionPlan.asset.contentSha256,
          solutionImageUrl: solutionPlan.objectPath,
          status: existing.status === "used" ? "used" : "active",
          subject: packageData.subject,
          tags,
          topic: row.topic,
          tutorialVideoLink: row.tutorialVideoLink,
          uniqueKey: row.uniqueKey,
          updatedAt: timestamp,
          updatedBy: request.actorId,
          usedCount: typeof existing.usedCount === "number" ? existing.usedCount : 0,
          version: row.version,
        });
        committedQuestions.push({
          action: row.action,
          questionId: row.questionId,
          revision,
          version: row.version,
        });
      });
      const result: AdminQuestionPackageCommitResult = {
        assetCount: assetPlans.length,
        auditId: authority.auditId,
        committedAt: toTimestampIso(timestamp),
        disposition: "applied",
        packageId: request.packageId,
        packageRevision: request.expectedPackageRevision + 1,
        questions: committedQuestions,
        state: "committed",
        uploadLogId: String(packageData.uploadLogId),
      };
      transaction.update(references.packageReference, {
        commitResult: result,
        packageRevision: result.packageRevision,
        phase: "firestore_applied",
      });
      transaction.update(references.uploadLogReference, {
        packageRevision: result.packageRevision,
        state: "committing",
      });
      transaction.create(references.auditReference(authority.auditId), {
        actionType: "IMPORT_QUESTION_PACKAGE",
        actorId: request.actorId,
        actorRole: request.actorRole,
        actorUid: request.actorId,
        auditId: authority.auditId,
        entityId: request.packageId,
        entityType: "questionPackage",
        instituteId: request.instituteId,
        metadata: {
          assetCount: assetPlans.length,
          commitIdempotencyKeyHash: authority.keyHash,
          packageRevision: result.packageRevision,
          questionIds: committedQuestions.map((question) => question.questionId),
          requestFingerprint: authority.fingerprint,
          source: "AdminQuestionPackagesService",
        },
        targetCollection: PACKAGES_COLLECTION,
        targetId: request.packageId,
        tenantId: request.instituteId,
        timestamp,
      });
      return {
        packageData: {
          ...packageData,
          commitResult: result,
          packageRevision: result.packageRevision,
          phase: "firestore_applied",
        },
        result,
      };
    });
  }

  private async cleanupStagingAndFinalize(
    references: ReturnType<AdminQuestionPackagesService["references"]>,
    packageData: FirebaseFirestore.DocumentData,
    authority: ReturnType<typeof buildCommitAuthority>,
  ): Promise<void> {
    this.assertCommitFingerprint(packageData, authority.fingerprint);
    const stagingPath = requiredString(packageData.stagingPath, "stagingPath", 1024);
    try {
      await this.dependencies.storage.deleteObject(stagingPath);
    } catch (error) {
      await this.recordRecovery(references, "staging_cleanup", [], error);
      throw new AdminQuestionBankValidationError(
        "CONFLICT",
        "Question writes are recoverable but package staging cleanup is incomplete.",
      );
    }
    await this.dependencies.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(references.packageReference);
      const data = snapshot.data() ?? {};
      this.assertCommitFingerprint(data, authority.fingerprint);
      if (data.state === "committed") return;
      if (data.phase !== "firestore_applied" || !isRecord(data.commitResult)) {
        throw new AdminQuestionBankValidationError(
          "CONFLICT",
          "Package cannot finalize before its atomic question writes.",
        );
      }
      transaction.update(references.packageReference, {
        committedAt: this.dependencies.now(),
        recoveryPhase: FieldValue.delete(),
        state: "committed",
        stagingPath: FieldValue.delete(),
      });
      transaction.update(references.uploadLogReference, {
        committedAt: data.commitResult.committedAt,
        packageRevision: data.commitResult.packageRevision,
        rollbackEligible: true,
        rollbackReason: null,
        state: "committed",
      });
    });
  }

  private async cleanupCanonicalObjects(objectPaths: unknown): Promise<void> {
    if (!Array.isArray(objectPaths)) return;
    const failures: string[] = [];
    for (const path of objectPaths) {
      if (typeof path !== "string") continue;
      try {
        await this.dependencies.storage.deleteObject(path);
      } catch {
        failures.push(path);
      }
    }
    if (failures.length) {
      throw new Error(`Canonical cleanup failed for ${failures.join(", ")}.`);
    }
  }

  private async recordRecovery(
    references: ReturnType<AdminQuestionPackagesService["references"]>,
    recoveryPhase: string,
    createdCanonicalObjects: string[],
    error: unknown,
  ): Promise<void> {
    await references.packageReference.update({
      createdCanonicalObjects,
      failureMessage: error instanceof Error ? error.message : String(error),
      recoveryPhase,
      state: "failed_recoverable",
    });
    await references.uploadLogReference.set({
      rollbackEligible: false,
      rollbackReason: "Package recovery must complete before lifecycle actions.",
      state: "failed_recoverable",
    }, {merge: true});
  }

  private stagingPath(
    instituteId: string,
    packageId: string,
    contentSha256: string,
  ): string {
    return `${instituteId}/question-packages/${packageId}/${contentSha256}.zip`;
  }

  private references(instituteId: string, packageId: string) {
    const institute = this.dependencies.firestore.collection(INSTITUTES_COLLECTION)
      .doc(instituteId);
    return {
      auditReference: (auditId: string) =>
        institute.collection(AUDIT_LOGS_COLLECTION).doc(auditId),
      packageReference: institute.collection(PACKAGES_COLLECTION).doc(packageId),
      uploadLogReference: institute.collection(UPLOAD_LOGS_COLLECTION).doc(packageId),
    };
  }
}

export const adminQuestionPackagesService = new AdminQuestionPackagesService();
