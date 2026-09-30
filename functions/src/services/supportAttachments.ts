/* eslint-disable max-len, require-jsdoc */
import {createHash, randomUUID} from "node:crypto";
import {FieldValue, Timestamp} from "firebase-admin/firestore";
import type {
  SupportAttachmentDownloadResult,
  SupportAttachmentMediaType,
  SupportAttachmentRecord,
  SupportMessageRecord,
} from "../../../shared/contracts/adminSupport";
import {
  AdminSupportAttachmentDownloadValidatedRequest,
  AdminSupportValidationError,
  NormalizedSupportAttachmentUpload,
  VendorSupportAttachmentDownloadValidatedRequest,
} from "../types/adminSupport";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {createLogger} from "./logging";

const ATTACHMENTS_COLLECTION = "supportAttachments";
const AUDIT_LOGS_COLLECTION = "auditLogs";
const MESSAGES_COLLECTION = "messages";
const TICKETS_COLLECTION = "supportTickets";
const SCHEMA_VERSION = 1;
const MAX_ATTACHMENT_COUNT = 5;
const MAX_ATTACHMENT_SIZE_BYTES = 1_048_576;
const MAX_TOTAL_ATTACHMENT_BYTES = 5_242_880;
const STAGING_TTL_MILLISECONDS = 24 * 60 * 60 * 1_000;
const RETENTION_MILLISECONDS = 365 * 24 * 60 * 60 * 1_000;
const DOWNLOAD_TTL_MILLISECONDS = 5 * 60 * 1_000;
const CLEANUP_BATCH_LIMIT = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ATTACHMENT_ID_PATTERN = /^support_attachment_[a-f0-9]{40}$/u;
const TICKET_ID_PATTERN = /^support_ticket_[a-f0-9]{40}$/u;
const MESSAGE_ID_PATTERN = /^support_message_[a-f0-9]{40}$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;

const MEDIA_TYPES: readonly SupportAttachmentMediaType[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

const EXTENSIONS_BY_MEDIA_TYPE: Record<SupportAttachmentMediaType, readonly string[]> = {
  "application/pdf": ["pdf"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
};

interface ObjectWriteRequest {
  bucketName: string;
  bytes: Buffer;
  fileName: string;
  mediaType: SupportAttachmentMediaType;
  metadata: Record<string, string>;
  objectPath: string;
  sha256: string;
}

interface ObjectDeleteRequest {
  bucketName: string;
  objectPath: string;
}

interface ObjectInspection {
  contentType: string | null;
  metadata: Record<string, string>;
  sha256: string;
  sizeBytes: number;
}

interface DownloadUrlRequest extends ObjectDeleteRequest {
  expiresAt: Date;
  fileName: string;
}

interface SupportAttachmentDependencies {
  deleteObject: (request: ObjectDeleteRequest) => Promise<void>;
  firestore: FirebaseFirestore.Firestore;
  generateDownloadUrl: (request: DownloadUrlRequest) => Promise<string>;
  inspectObject: (request: ObjectDeleteRequest) => Promise<ObjectInspection | null>;
  now: () => Timestamp;
  resolveBucketName: () => string;
  writeObject: (request: ObjectWriteRequest) => Promise<boolean>;
}

export interface PreparedSupportAttachment {
  attachmentId: string;
  bucketName: string;
  commandHash: string;
  fingerprint: string;
  messageId: string;
  objectCreated: boolean;
  objectPath: string;
  record: SupportAttachmentRecord;
  reference: FirebaseFirestore.DocumentReference;
  sha256: string;
  stagedDocumentCreated: boolean;
  ticketId: string;
  upload: NormalizedSupportAttachmentUpload;
}

export interface SupportAttachmentCleanupResult {
  committedDeleted: number;
  completedAt: string;
  stagingDeleted: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const sha256 = (value: string | Buffer): string =>
  createHash("sha256").update(value).digest("hex");

const validationError = (message: string): never => {
  throw new AdminSupportValidationError("VALIDATION_ERROR", message);
};

const internalError = (message: string): never => {
  throw new AdminSupportValidationError("INTERNAL_ERROR", message);
};

const requiredString = (
  value: unknown,
  field: string,
  maximum: number,
): string => {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maximum) {
    return validationError(`Field "${field}" must be a non-empty string of at most ${maximum} characters.`);
  }
  return value.trim();
};

const exactString = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !value) {
    return internalError(`Persisted support attachment field "${field}" is invalid.`);
  }
  return value;
};

const hasSignature = (
  bytes: Buffer,
  mediaType: SupportAttachmentMediaType,
): boolean => {
  if (mediaType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mediaType === "image/png") {
    return bytes.length >= 8 && bytes.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  }
  if (mediaType === "image/webp") {
    return bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
      bytes.subarray(8, 12).toString("ascii") === "WEBP";
  }
  return bytes.length >= 5 && bytes.subarray(0, 5).toString("ascii") === "%PDF-";
};

const normalizedFileName = (
  value: unknown,
  mediaType: SupportAttachmentMediaType,
  field: string,
): string => {
  const fileName = requiredString(value, field, 160);
  const hasUnsafeCharacter = [...fileName].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return character === "/" || character === "\\" || character === "\"" ||
      codePoint < 32 || codePoint === 127;
  });
  if (hasUnsafeCharacter || fileName === "." || fileName === "..") {
    return validationError(`Field "${field}" contains unsupported file-name characters.`);
  }
  const extension = fileName.includes(".") ? fileName.split(".").pop()?.toLowerCase() : undefined;
  if (!extension || !EXTENSIONS_BY_MEDIA_TYPE[mediaType].includes(extension)) {
    return validationError(`Field "${field}" extension does not match the declared media type.`);
  }
  return fileName;
};

const normalizeUpload = (
  value: unknown,
  index: number,
): NormalizedSupportAttachmentUpload => {
  const field = `attachments.${index}`;
  if (!isRecord(value)) return validationError(`Field "${field}" must be an object.`);
  const clientAttachmentId = requiredString(value.clientAttachmentId, `${field}.clientAttachmentId`, 36).toLowerCase();
  if (!UUID_PATTERN.test(clientAttachmentId)) {
    return validationError(`Field "${field}.clientAttachmentId" must be a UUID.`);
  }
  if (typeof value.mediaType !== "string" || !MEDIA_TYPES.includes(value.mediaType as SupportAttachmentMediaType)) {
    return validationError(`Field "${field}.mediaType" is not supported.`);
  }
  const mediaType = value.mediaType as SupportAttachmentMediaType;
  const fileName = normalizedFileName(value.fileName, mediaType, `${field}.fileName`);
  if (!Number.isInteger(value.sizeBytes) || Number(value.sizeBytes) < 1 ||
    Number(value.sizeBytes) > MAX_ATTACHMENT_SIZE_BYTES) {
    return validationError(`Field "${field}.sizeBytes" must be between 1 and ${MAX_ATTACHMENT_SIZE_BYTES}.`);
  }
  const contentSha256 = requiredString(value.contentSha256, `${field}.contentSha256`, 64).toLowerCase();
  if (!SHA256_PATTERN.test(contentSha256)) {
    return validationError(`Field "${field}.contentSha256" must be a lowercase SHA-256 digest.`);
  }
  const contentBase64 = requiredString(
    value.contentBase64,
    `${field}.contentBase64`,
    Math.ceil(MAX_ATTACHMENT_SIZE_BYTES / 3) * 4,
  );
  if (!BASE64_PATTERN.test(contentBase64)) {
    return validationError(`Field "${field}.contentBase64" must be canonical base64 without a data-URL prefix.`);
  }
  const bytes = Buffer.from(contentBase64, "base64");
  if (bytes.toString("base64") !== contentBase64 || bytes.length !== Number(value.sizeBytes)) {
    return validationError(`Field "${field}" byte length does not match its canonical base64 and size claims.`);
  }
  if (sha256(bytes) !== contentSha256) {
    return validationError(`Field "${field}.contentSha256" does not match the uploaded bytes.`);
  }
  if (!hasSignature(bytes, mediaType)) {
    return validationError(`Field "${field}" byte signature does not match the declared media type.`);
  }
  return {
    bytes,
    clientAttachmentId,
    contentBase64,
    contentSha256,
    fileName,
    mediaType,
    sizeBytes: bytes.length,
  };
};

const normalizeBucketName = (value: unknown): string => {
  const bucketName = requiredString(value, "SUPPORT_ATTACHMENTS_BUCKET", 222);
  if (bucketName.includes("/") || bucketName.includes(":") || /\s/u.test(bucketName)) {
    return internalError("Support attachment bucket configuration is invalid.");
  }
  return bucketName;
};

const defaultBucketName = (): string => {
  const configured = process.env.SUPPORT_ATTACHMENTS_BUCKET?.trim();
  if (configured) return normalizeBucketName(configured);
  return internalError("Support attachment bucket configuration is unavailable.");
};

const defaultInspectObject = async (
  request: ObjectDeleteRequest,
): Promise<ObjectInspection | null> => {
  const file = getFirebaseAdminApp().storage().bucket(request.bucketName).file(request.objectPath);
  const [exists] = await file.exists();
  if (!exists) return null;
  const [[bytes], [metadata]] = await Promise.all([file.download(), file.getMetadata()]);
  return {
    contentType: metadata.contentType ?? null,
    metadata: Object.fromEntries(Object.entries(metadata.metadata ?? {}).map(([key, value]) => [key, String(value)])),
    sha256: sha256(bytes),
    sizeBytes: bytes.length,
  };
};

const errorCode = (error: unknown): number | undefined =>
  isRecord(error) && typeof error.code === "number" ? error.code : undefined;

const defaultWriteObject = async (request: ObjectWriteRequest): Promise<boolean> => {
  const file = getFirebaseAdminApp().storage().bucket(request.bucketName).file(request.objectPath);
  try {
    await file.save(request.bytes, {
      contentType: request.mediaType,
      metadata: {
        cacheControl: "private, max-age=0, no-store",
        contentDisposition: `attachment; filename="${request.fileName}"`,
        metadata: request.metadata,
      },
      preconditionOpts: {ifGenerationMatch: 0},
      resumable: false,
      validation: "crc32c",
    });
    return true;
  } catch (error) {
    if (errorCode(error) !== 412) throw error;
    const existing = await defaultInspectObject(request);
    if (!existing || existing.contentType !== request.mediaType ||
      existing.sizeBytes !== request.bytes.length || existing.sha256 !== request.sha256 ||
      existing.metadata.attachmentFingerprint !== request.metadata.attachmentFingerprint) {
      throw new AdminSupportValidationError(
        "CONFLICT",
        "Support attachment object already exists with different authority.",
      );
    }
    return false;
  }
};

const defaultDeleteObject = async (request: ObjectDeleteRequest): Promise<void> => {
  const file = getFirebaseAdminApp().storage().bucket(request.bucketName).file(request.objectPath);
  try {
    await file.delete();
  } catch (error) {
    if (errorCode(error) !== 404) throw error;
  }
};

const defaultGenerateDownloadUrl = async (request: DownloadUrlRequest): Promise<string> => {
  const file = getFirebaseAdminApp().storage().bucket(request.bucketName).file(request.objectPath);
  const [url] = await file.getSignedUrl({
    action: "read",
    expires: request.expiresAt,
    responseDisposition: `attachment; filename="${request.fileName}"`,
    version: "v4",
  });
  if (!url.startsWith("https://")) return internalError("Support attachment signer returned an invalid URL.");
  return url;
};

const attachmentFingerprintInput = (upload: NormalizedSupportAttachmentUpload) => ({
  clientAttachmentId: upload.clientAttachmentId,
  contentSha256: upload.contentSha256,
  fileName: upload.fileName,
  mediaType: upload.mediaType,
  sizeBytes: upload.sizeBytes,
});

const verifyAttachmentDocument = (
  value: unknown,
  prepared: PreparedSupportAttachment,
  allowedStates: readonly string[],
): void => {
  if (!isRecord(value) || value.schemaVersion !== SCHEMA_VERSION ||
    !allowedStates.includes(String(value.state)) ||
    value.attachmentId !== prepared.attachmentId ||
    value.bucketName !== prepared.bucketName ||
    value.commandHash !== prepared.commandHash ||
    value.fingerprint !== prepared.fingerprint ||
    value.messageId !== prepared.messageId ||
    value.objectPath !== prepared.objectPath ||
    value.sha256 !== prepared.sha256 ||
    value.ticketId !== prepared.ticketId) {
    return internalError("Persisted support attachment authority is invalid.");
  }
};

const actorDisplayName = (
  institute: unknown,
  actorId: string,
  expectedRole: string,
): string => {
  if (!isRecord(institute) || !isRecord(institute.settingsUsers)) {
    throw new AdminSupportValidationError("FORBIDDEN", "Current institute staff authority does not permit support operations.");
  }
  const actor = institute.settingsUsers[actorId];
  if (!isRecord(actor) || actor.status !== "active" || String(actor.role).toLowerCase() !== expectedRole) {
    throw new AdminSupportValidationError("FORBIDDEN", "Current institute staff authority does not permit support operations.");
  }
  return exactString(actor.displayName, `settingsUsers.${actorId}.displayName`);
};

export class SupportAttachmentService {
  private readonly dependencies: SupportAttachmentDependencies;
  private readonly logger = createLogger("SupportAttachmentService");

  constructor(dependencies: Partial<SupportAttachmentDependencies> = {}) {
    this.dependencies = {
      deleteObject: dependencies.deleteObject ?? defaultDeleteObject,
      firestore: dependencies.firestore ?? getFirestore(),
      generateDownloadUrl: dependencies.generateDownloadUrl ?? defaultGenerateDownloadUrl,
      inspectObject: dependencies.inspectObject ?? defaultInspectObject,
      now: dependencies.now ?? (() => Timestamp.now()),
      resolveBucketName: dependencies.resolveBucketName ?? defaultBucketName,
      writeObject: dependencies.writeObject ?? defaultWriteObject,
    };
  }

  public normalizeUploads(value: unknown): NormalizedSupportAttachmentUpload[] {
    if (!Array.isArray(value)) return validationError("Field \"attachments\" must be an array.");
    if (value.length > MAX_ATTACHMENT_COUNT) {
      return validationError(`Field "attachments" must contain at most ${MAX_ATTACHMENT_COUNT} files.`);
    }
    const uploads = value.map(normalizeUpload);
    if (new Set(uploads.map((upload) => upload.clientAttachmentId)).size !== uploads.length) {
      return validationError("Field \"attachments\" contains duplicate clientAttachmentId values.");
    }
    const totalBytes = uploads.reduce((total, upload) => total + upload.sizeBytes, 0);
    if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
      return validationError(`Field "attachments" exceeds the ${MAX_TOTAL_ATTACHMENT_BYTES}-byte total limit.`);
    }
    return uploads;
  }

  public fingerprintInput(uploads: readonly NormalizedSupportAttachmentUpload[]): unknown[] {
    return uploads.map(attachmentFingerprintInput);
  }

  public async prepare(
    input: {
      commandHash: string;
      instituteId: string;
      messageId: string;
      ticketId: string;
      uploads: readonly NormalizedSupportAttachmentUpload[];
    },
  ): Promise<PreparedSupportAttachment[]> {
    if (input.uploads.length === 0) return [];
    const bucketName = this.dependencies.resolveBucketName();
    const stagedAt = this.dependencies.now();
    const cleanupAfter = Timestamp.fromMillis(stagedAt.toMillis() + STAGING_TTL_MILLISECONDS);
    const instituteHash = sha256(input.instituteId).slice(0, 40);
    const institute = this.dependencies.firestore.doc(`institutes/${input.instituteId}`);
    const collection = institute.collection(ATTACHMENTS_COLLECTION);
    const prepared = input.uploads.map((upload): PreparedSupportAttachment => {
      const attachmentId = `support_attachment_${sha256(`${input.commandHash}:${upload.clientAttachmentId}`).slice(0, 40)}`;
      const fingerprint = sha256(JSON.stringify(attachmentFingerprintInput(upload)));
      return {
        attachmentId,
        bucketName,
        commandHash: input.commandHash,
        fingerprint,
        messageId: input.messageId,
        objectCreated: false,
        objectPath: `institutes/${instituteHash}/support-attachments/${input.ticketId}/${input.messageId}/${attachmentId}`,
        record: {
          attachmentId,
          downloadAvailable: true,
          fileName: upload.fileName,
          mediaType: upload.mediaType,
          sizeBytes: upload.sizeBytes,
        },
        reference: collection.doc(attachmentId),
        sha256: upload.contentSha256,
        stagedDocumentCreated: false,
        ticketId: input.ticketId,
        upload,
      };
    });
    const createdFlags = await this.dependencies.firestore.runTransaction(async (transaction) => {
      const snapshots = await Promise.all(prepared.map((item) => transaction.get(item.reference)));
      return snapshots.map((snapshot, index) => {
        const item = prepared[index];
        if (snapshot.exists) {
          verifyAttachmentDocument(snapshot.data(), item, ["staging", "committed"]);
          return false;
        }
        transaction.create(item.reference, {
          attachmentId: item.attachmentId,
          bucketName: item.bucketName,
          cleanupAfter,
          commandHash: item.commandHash,
          createdAt: stagedAt,
          deleteAfter: null,
          fileName: item.record.fileName,
          fingerprint: item.fingerprint,
          instituteId: input.instituteId,
          mediaType: item.record.mediaType,
          messageId: item.messageId,
          objectPath: item.objectPath,
          schemaVersion: SCHEMA_VERSION,
          sha256: item.sha256,
          sizeBytes: item.record.sizeBytes,
          state: "staging",
          ticketId: item.ticketId,
        });
        return true;
      });
    });
    prepared.forEach((item, index) => {
      item.stagedDocumentCreated = createdFlags[index];
    });
    try {
      for (const item of prepared) {
        item.objectCreated = await this.dependencies.writeObject({
          bucketName: item.bucketName,
          bytes: item.upload.bytes,
          fileName: item.record.fileName,
          mediaType: item.record.mediaType,
          metadata: {
            attachmentFingerprint: item.fingerprint,
            attachmentId: item.attachmentId,
            commandHash: item.commandHash,
            instituteHash,
            messageId: item.messageId,
            sha256: item.sha256,
            ticketId: item.ticketId,
          },
          objectPath: item.objectPath,
          sha256: item.sha256,
        });
      }
      return prepared;
    } catch (error) {
      await this.cleanupFailed(prepared);
      throw error;
    }
  }

  public commitInTransaction(
    transaction: FirebaseFirestore.Transaction,
    prepared: readonly PreparedSupportAttachment[],
    snapshots: readonly FirebaseFirestore.DocumentSnapshot[],
    committedAt: Timestamp,
  ): SupportAttachmentRecord[] {
    if (prepared.length !== snapshots.length) {
      return internalError("Support attachment transaction authority is incomplete.");
    }
    const deleteAfter = Timestamp.fromMillis(committedAt.toMillis() + RETENTION_MILLISECONDS);
    prepared.forEach((item, index) => {
      const snapshot = snapshots[index];
      if (!snapshot.exists) return internalError("Support attachment staging authority is missing.");
      verifyAttachmentDocument(snapshot.data(), item, ["staging"]);
      transaction.update(item.reference, {
        cleanupAfter: null,
        committedAt,
        deleteAfter,
        state: "committed",
      });
    });
    return prepared.map((item) => item.record);
  }

  public async cleanupFailed(prepared: readonly PreparedSupportAttachment[]): Promise<void> {
    for (const item of prepared) {
      if (!item.objectCreated && !item.stagedDocumentCreated) continue;
      const authority = await this.claimCleanup(item.reference, "staging", item.fingerprint);
      if (!authority) continue;
      try {
        await this.dependencies.deleteObject({bucketName: authority.bucketName, objectPath: authority.objectPath});
        await item.reference.delete();
      } catch (error) {
        await item.reference.set({state: "staging"}, {merge: true});
        this.logger.error("Failed to compensate support attachment staging.", {
          attachmentId: item.attachmentId,
          error,
        });
      }
    }
  }

  public async resolveMessageAvailability(
    instituteId: string,
    messages: readonly SupportMessageRecord[],
  ): Promise<SupportMessageRecord[]> {
    const attachmentIds = [...new Set(messages.flatMap((message) =>
      message.attachments.map((attachment) => attachment.attachmentId)))];
    if (attachmentIds.length === 0) return [...messages];
    const collection = this.dependencies.firestore
      .doc(`institutes/${instituteId}`).collection(ATTACHMENTS_COLLECTION);
    const snapshots = await this.dependencies.firestore.getAll(
      ...attachmentIds.map((attachmentId) => collection.doc(attachmentId)),
    );
    const availability = new Map(snapshots.map((snapshot) => [
      snapshot.id,
      snapshot.exists && snapshot.get("state") === "committed",
    ]));
    return messages.map((message) => ({
      ...message,
      attachments: message.attachments.map((attachment) => ({
        ...attachment,
        downloadAvailable: availability.get(attachment.attachmentId) === true,
      })),
    }));
  }

  public async download(
    rawRequest: AdminSupportAttachmentDownloadValidatedRequest,
  ): Promise<SupportAttachmentDownloadResult> {
    const request = this.normalizeDownloadRequest(rawRequest);
    const institute = this.dependencies.firestore.doc(`institutes/${request.instituteId}`);
    const ticket = institute.collection(TICKETS_COLLECTION).doc(request.ticketId);
    const attachment = institute.collection(ATTACHMENTS_COLLECTION).doc(request.attachmentId);
    const [instituteSnapshot, ticketSnapshot, attachmentSnapshot] = await Promise.all([
      institute.get(),
      ticket.get(),
      attachment.get(),
    ]);
    actorDisplayName(instituteSnapshot.data(), request.actorId, request.actorRole);
    if (!ticketSnapshot.exists || ticketSnapshot.get("instituteId") !== request.instituteId ||
      ticketSnapshot.get("ticketId") !== request.ticketId) {
      throw new AdminSupportValidationError("NOT_FOUND", "Support ticket was not found.");
    }
    const authority = this.downloadAuthority(attachmentSnapshot, request.ticketId);
    const message = ticket.collection(MESSAGES_COLLECTION).doc(authority.messageId);
    const messageSnapshot = await message.get();
    if (!messageSnapshot.exists || messageSnapshot.get("ticketId") !== request.ticketId ||
      !Array.isArray(messageSnapshot.get("attachments")) ||
      !messageSnapshot.get("attachments").some((value: unknown) =>
        isRecord(value) && value.attachmentId === request.attachmentId)) {
      return internalError("Support attachment message authority is invalid.");
    }
    const inspection = await this.dependencies.inspectObject({
      bucketName: authority.bucketName,
      objectPath: authority.objectPath,
    });
    if (!inspection || inspection.contentType !== authority.mediaType ||
      inspection.sizeBytes !== authority.sizeBytes || inspection.sha256 !== authority.sha256 ||
      inspection.metadata.attachmentFingerprint !== authority.fingerprint) {
      return internalError("Support attachment object authority is unavailable or invalid.");
    }
    const now = this.dependencies.now();
    const expiresAt = new Date(now.toMillis() + DOWNLOAD_TTL_MILLISECONDS);
    const url = await this.dependencies.generateDownloadUrl({
      bucketName: authority.bucketName,
      expiresAt,
      fileName: authority.fileName,
      objectPath: authority.objectPath,
    });
    const eventId = `support_audit_${sha256(`${request.instituteId}:${request.attachmentId}:${randomUUID()}`).slice(0, 40)}`;
    const audit = institute.collection(AUDIT_LOGS_COLLECTION).doc(eventId);
    await this.dependencies.firestore.runTransaction(async (transaction) => {
      const [freshInstitute, freshTicket, freshAttachment] = await Promise.all([
        transaction.get(institute),
        transaction.get(ticket),
        transaction.get(attachment),
      ]);
      actorDisplayName(freshInstitute.data(), request.actorId, request.actorRole);
      if (!freshTicket.exists || freshTicket.get("instituteId") !== request.instituteId ||
        freshTicket.get("ticketId") !== request.ticketId) {
        throw new AdminSupportValidationError("NOT_FOUND", "Support ticket was not found.");
      }
      this.downloadAuthority(freshAttachment, request.ticketId);
      transaction.create(audit, {
        action: "ATTACHMENT_DOWNLOADED",
        actorRole: request.actorRole,
        actorUserId: request.actorId,
        attachmentCount: 1,
        eventId,
        fingerprint: sha256(`${request.instituteId}:${request.ticketId}:${request.attachmentId}:${request.actorId}`),
        idempotencyKeyHash: null,
        instituteId: request.instituteId,
        ipAddressHash: request.ipAddress ? sha256(request.ipAddress) : null,
        messageId: authority.messageId,
        occurredAt: now,
        revision: Number(freshTicket.get("revision")),
        schemaVersion: SCHEMA_VERSION,
        summary: "Institute support attachment download authorized.",
        ticketId: request.ticketId,
        userAgentHash: request.userAgent ? sha256(request.userAgent) : null,
      });
    });
    this.logger.info("Institute support attachment download authorized.", {
      attachmentId: request.attachmentId,
      instituteId: request.instituteId,
      ticketId: request.ticketId,
    });
    return {
      attachmentId: request.attachmentId,
      expiresAt: expiresAt.toISOString(),
      fileName: authority.fileName,
      mediaType: authority.mediaType,
      url,
    };
  }

  public async downloadForVendor(
    rawRequest: VendorSupportAttachmentDownloadValidatedRequest & {instituteId: string},
  ): Promise<SupportAttachmentDownloadResult> {
    const request = {
      actorDisplayName: requiredString(rawRequest.actorDisplayName, "actorDisplayName", 160),
      actorId: requiredString(rawRequest.actorId, "actorId", 128),
      actorRole: rawRequest.actorRole,
      attachmentId: requiredString(rawRequest.attachmentId, "attachmentId", 128),
      instituteId: requiredString(rawRequest.instituteId, "instituteId", 128),
      ipAddress: rawRequest.ipAddress,
      ticketId: requiredString(rawRequest.ticketId, "ticketId", 128),
      userAgent: rawRequest.userAgent,
    };
    if (request.actorRole !== "vendor") {
      throw new AdminSupportValidationError("FORBIDDEN", "Vendor support authority is required.");
    }
    if (!ATTACHMENT_ID_PATTERN.test(request.attachmentId)) return validationError("Field \"attachmentId\" is invalid.");
    if (!TICKET_ID_PATTERN.test(request.ticketId)) return validationError("Field \"ticketId\" is invalid.");
    const institute = this.dependencies.firestore.doc(`institutes/${request.instituteId}`);
    const ticket = institute.collection(TICKETS_COLLECTION).doc(request.ticketId);
    const attachment = institute.collection(ATTACHMENTS_COLLECTION).doc(request.attachmentId);
    const [ticketSnapshot, attachmentSnapshot] = await Promise.all([ticket.get(), attachment.get()]);
    if (!ticketSnapshot.exists || ticketSnapshot.get("instituteId") !== request.instituteId ||
      ticketSnapshot.get("ticketId") !== request.ticketId) {
      throw new AdminSupportValidationError("NOT_FOUND", "Support ticket was not found.");
    }
    const authority = this.downloadAuthority(attachmentSnapshot, request.ticketId);
    const message = ticket.collection(MESSAGES_COLLECTION).doc(authority.messageId);
    const messageSnapshot = await message.get();
    if (!messageSnapshot.exists || messageSnapshot.get("ticketId") !== request.ticketId ||
      !Array.isArray(messageSnapshot.get("attachments")) ||
      !messageSnapshot.get("attachments").some((value: unknown) =>
        isRecord(value) && value.attachmentId === request.attachmentId)) {
      return internalError("Support attachment message authority is invalid.");
    }
    const inspection = await this.dependencies.inspectObject({
      bucketName: authority.bucketName,
      objectPath: authority.objectPath,
    });
    if (!inspection || inspection.contentType !== authority.mediaType ||
      inspection.sizeBytes !== authority.sizeBytes || inspection.sha256 !== authority.sha256 ||
      inspection.metadata.attachmentFingerprint !== authority.fingerprint) {
      return internalError("Support attachment object authority is unavailable or invalid.");
    }
    const now = this.dependencies.now();
    const expiresAt = new Date(now.toMillis() + DOWNLOAD_TTL_MILLISECONDS);
    const url = await this.dependencies.generateDownloadUrl({
      bucketName: authority.bucketName,
      expiresAt,
      fileName: authority.fileName,
      objectPath: authority.objectPath,
    });
    const suffix = sha256(`${request.instituteId}:${request.attachmentId}:${randomUUID()}`).slice(0, 40);
    const audit = institute.collection(AUDIT_LOGS_COLLECTION).doc(`support_audit_${suffix}`);
    const vendorAudit = this.dependencies.firestore.collection("vendorAuditLogs").doc(`support_vendor_audit_${suffix}`);
    await this.dependencies.firestore.runTransaction(async (transaction) => {
      const [freshTicket, freshAttachment] = await Promise.all([
        transaction.get(ticket),
        transaction.get(attachment),
      ]);
      if (!freshTicket.exists || freshTicket.get("instituteId") !== request.instituteId ||
        freshTicket.get("ticketId") !== request.ticketId) {
        throw new AdminSupportValidationError("NOT_FOUND", "Support ticket was not found.");
      }
      this.downloadAuthority(freshAttachment, request.ticketId);
      const shared = {
        action: "ATTACHMENT_DOWNLOADED",
        actorRole: "vendor",
        actorUserId: request.actorId,
        attachmentCount: 1,
        instituteId: request.instituteId,
        messageId: authority.messageId,
        occurredAt: now,
        revision: Number(freshTicket.get("revision")),
        schemaVersion: SCHEMA_VERSION,
        summary: "Vendor support attachment download authorized.",
        ticketId: request.ticketId,
      };
      transaction.create(audit, {
        ...shared,
        eventId: audit.id,
        fingerprint: sha256(`${request.instituteId}:${request.ticketId}:${request.attachmentId}:${request.actorId}`),
        idempotencyKeyHash: null,
        ipAddressHash: request.ipAddress ? sha256(request.ipAddress) : null,
        userAgentHash: request.userAgent ? sha256(request.userAgent) : null,
      });
      transaction.create(vendorAudit, {
        ...shared,
        eventId: vendorAudit.id,
        targetType: "support_attachment",
      });
    });
    return {
      attachmentId: request.attachmentId,
      expiresAt: expiresAt.toISOString(),
      fileName: authority.fileName,
      mediaType: authority.mediaType,
      url,
    };
  }

  public async cleanupExpired(): Promise<SupportAttachmentCleanupResult> {
    const now = this.dependencies.now();
    const [staging, committed] = await Promise.all([
      this.expiredDocuments("staging", "cleanupAfter", now),
      this.expiredDocuments("committed", "deleteAfter", now),
    ]);
    let stagingDeleted = 0;
    let committedDeleted = 0;
    for (const snapshot of staging) {
      if (await this.cleanupDocument(snapshot.ref, "staging")) stagingDeleted += 1;
    }
    for (const snapshot of committed) {
      if (await this.cleanupDocument(snapshot.ref, "committed")) committedDeleted += 1;
    }
    const result = {
      committedDeleted,
      completedAt: now.toDate().toISOString(),
      stagingDeleted,
    };
    this.logger.info("Support attachment retention cleanup completed.", result);
    return result;
  }

  private normalizeDownloadRequest(
    input: Partial<AdminSupportAttachmentDownloadValidatedRequest>,
  ): AdminSupportAttachmentDownloadValidatedRequest {
    const attachmentId = requiredString(input.attachmentId, "attachmentId", 128);
    const ticketId = requiredString(input.ticketId, "ticketId", 128);
    if (!ATTACHMENT_ID_PATTERN.test(attachmentId)) return validationError("Field \"attachmentId\" is invalid.");
    if (!TICKET_ID_PATTERN.test(ticketId)) return validationError("Field \"ticketId\" is invalid.");
    const actorRole = requiredString(input.actorRole, "actorRole", 64).toLowerCase();
    if (!new Set(["admin", "director", "teacher"]).has(actorRole)) {
      throw new AdminSupportValidationError("FORBIDDEN", "Actor role is not permitted for institute support.");
    }
    return {
      actorId: requiredString(input.actorId, "actorId", 128),
      actorRole: actorRole as "admin" | "director" | "teacher",
      attachmentId,
      instituteId: requiredString(input.instituteId, "instituteId", 128),
      ipAddress: typeof input.ipAddress === "string" ? input.ipAddress.slice(0, 128) : undefined,
      ticketId,
      userAgent: typeof input.userAgent === "string" ? input.userAgent.slice(0, 1_000) : undefined,
    };
  }

  private downloadAuthority(
    snapshot: FirebaseFirestore.DocumentSnapshot,
    expectedTicketId: string,
  ) {
    const value = snapshot.data();
    if (!snapshot.exists || !isRecord(value) || value.schemaVersion !== SCHEMA_VERSION ||
      value.state !== "committed" || value.attachmentId !== snapshot.id ||
      value.ticketId !== expectedTicketId) {
      throw new AdminSupportValidationError("NOT_FOUND", "Support attachment was not found or is unavailable.");
    }
    const mediaType = exactString(value.mediaType, "mediaType") as SupportAttachmentMediaType;
    if (!MEDIA_TYPES.includes(mediaType)) return internalError("Persisted support attachment media type is invalid.");
    const sizeBytes = Number(value.sizeBytes);
    if (!Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > MAX_ATTACHMENT_SIZE_BYTES) {
      return internalError("Persisted support attachment size is invalid.");
    }
    const messageId = exactString(value.messageId, "messageId");
    if (!MESSAGE_ID_PATTERN.test(messageId)) return internalError("Persisted support attachment message is invalid.");
    return {
      bucketName: normalizeBucketName(value.bucketName),
      fileName: exactString(value.fileName, "fileName"),
      fingerprint: exactString(value.fingerprint, "fingerprint"),
      mediaType,
      messageId,
      objectPath: exactString(value.objectPath, "objectPath"),
      sha256: exactString(value.sha256, "sha256"),
      sizeBytes,
    };
  }

  private async expiredDocuments(
    state: "committed" | "staging",
    field: "cleanupAfter" | "deleteAfter",
    now: Timestamp,
  ): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
    const snapshot = await this.dependencies.firestore.collectionGroup(ATTACHMENTS_COLLECTION)
      .where("state", "==", state)
      .where(field, "<=", now)
      .orderBy(field, "asc")
      .limit(CLEANUP_BATCH_LIMIT)
      .get();
    return snapshot.docs;
  }

  private async claimCleanup(
    reference: FirebaseFirestore.DocumentReference,
    expectedState: "committed" | "staging",
    expectedFingerprint?: string,
  ): Promise<{bucketName: string; objectPath: string} | null> {
    return this.dependencies.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists || snapshot.get("state") !== expectedState ||
        (expectedFingerprint && snapshot.get("fingerprint") !== expectedFingerprint)) {
        return null;
      }
      const bucketName = normalizeBucketName(snapshot.get("bucketName"));
      const objectPath = exactString(snapshot.get("objectPath"), "objectPath");
      transaction.update(reference, {
        deletionLeaseAt: this.dependencies.now(),
        state: "deleting",
      });
      return {bucketName, objectPath};
    });
  }

  private async cleanupDocument(
    reference: FirebaseFirestore.DocumentReference,
    state: "committed" | "staging",
  ): Promise<boolean> {
    const authority = await this.claimCleanup(reference, state);
    if (!authority) return false;
    try {
      await this.dependencies.deleteObject(authority);
      if (state === "staging") {
        await reference.delete();
      } else {
        await reference.update({
          bucketName: FieldValue.delete(),
          deletedAt: this.dependencies.now(),
          deletionLeaseAt: FieldValue.delete(),
          deleteReason: "retention_expired",
          objectPath: FieldValue.delete(),
          state: "deleted",
        });
      }
      return true;
    } catch (error) {
      await reference.set({deletionLeaseAt: FieldValue.delete(), state}, {merge: true});
      throw error;
    }
  }
}

export const supportAttachmentService = new SupportAttachmentService();
