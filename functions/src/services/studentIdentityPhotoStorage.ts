import type {File, FileOptions} from "@google-cloud/storage";
import {getFirebaseAdminApp} from "../utils/firebaseAdmin";
import {StudentProfileValidationError} from "../types/studentProfile";
import {STUDENT_IDENTITY_PHOTO_POLICY as POLICY} from "./studentIdentityPhotoPolicy";
import {photoHash, photoRecord} from "./studentIdentityPhotoImage";

export interface IdentityPhotoObjectTarget {
  bucketName: string;
  objectPath: string;
  metadata: {
    photoId: string;
    instituteId: string;
    studentId: string;
    studentUid: string;
    idempotencyKeyHash: string;
    requestFingerprint: string;
    sha256: string;
  };
  generation: string | null;
  bytes: Buffer;
}
export interface IdentityPhotoObjectStore {
  ensure(target: IdentityPhotoObjectTarget): Promise<{ generation: string }>;
}
export function identityPhotoInternal(message: string): never {
  throw new StudentProfileValidationError("INTERNAL_ERROR", message);
}
export function identityPhotoConflict(message: string): never {
  throw new StudentProfileValidationError("CONFLICT", message);
}
export function resolveIdentityPhotosBucket(): string {
  const bucket = process.env.IDENTITY_PHOTOS_BUCKET;
  if (
    typeof bucket !== "string" ||
    !/^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/u.test(bucket) ||
    [process.env.QUESTION_ASSETS_BUCKET, process.env.REPORTS_BUCKET, process.env.SUPPORT_ATTACHMENTS_BUCKET]
      .filter(Boolean)
      .includes(bucket)
  ) {
    return identityPhotoInternal("Private identity-photo bucket is unavailable.");
  }
  return bucket;
}
function code(error: unknown): number | undefined {
  return photoRecord(error) ? Number(error.code) : undefined;
}
export function checkedIdentityPhotoReadGeneration(value: string): number {
  const generation = Number(value);
  if (!Number.isSafeInteger(generation) || generation < 1 || String(generation) !== value) {
    return identityPhotoInternal("Storage SDK cannot safely address this photo generation.");
  }
  return generation;
}
export class PrivateIdentityPhotoObjectStore implements IdentityPhotoObjectStore {
  private async inspect(target: IdentityPhotoObjectTarget): Promise<{ generation: string } | null> {
    const bucket = getFirebaseAdminApp().storage().bucket(target.bucketName);
    let metadata;
    try {
      [metadata] = await bucket.file(target.objectPath).getMetadata();
    } catch (error) {
      if (code(error) === 404) return null;
      return identityPhotoInternal("Photo object inspection failed.");
    }
    const custom = metadata.metadata ?? {};
    if (
      typeof metadata.generation !== "string" ||
      !/^[1-9][0-9]*$/u.test(metadata.generation) ||
      (target.generation !== null && target.generation !== metadata.generation) ||
      metadata.contentType !== POLICY.mediaType ||
      Number(metadata.size) !== target.bytes.length ||
      Number(metadata.size) > POLICY.maxUploadBytes ||
      custom.firebaseStorageDownloadTokens != null ||
      metadata.cacheControl !== "private, max-age=0, no-store" ||
      Object.entries(target.metadata).some(([key, value]) => custom[key] !== value)
    ) {
      return identityPhotoInternal("Photo object authority is inconsistent.");
    }
    const [bytes] = await bucket
      .file(target.objectPath, {generation: checkedIdentityPhotoReadGeneration(metadata.generation)})
      .download();
    if (bytes.length !== target.bytes.length || photoHash(bytes) !== target.metadata.sha256) {
      return identityPhotoInternal("Photo object integrity is inconsistent.");
    }
    return {generation: metadata.generation};
  }

  public async ensure(target: IdentityPhotoObjectTarget): Promise<{ generation: string }> {
    const existing = await this.inspect(target);
    if (existing) return existing;
    if (target.generation !== null) {
      return identityPhotoConflict("A previously bound photo object is missing.");
    }
    const file = getFirebaseAdminApp().storage().bucket(target.bucketName).file(target.objectPath);
    try {
      await file.save(target.bytes, {
        contentType: POLICY.mediaType,
        resumable: false,
        validation: "crc32c",
        preconditionOpts: {ifGenerationMatch: 0},
        metadata: {
          cacheControl: "private, max-age=0, no-store",
          contentDisposition: "inline; filename=\"identity-photo.jpg\"",
          metadata: target.metadata,
        },
      });
    } catch {
      // Includes create races and lost upload acknowledgements. Inspect before
      // deciding anything; never overwrite or blindly compensate an unknown save.
      const recovered = await this.inspect(target);
      if (recovered) return recovered;
      return identityPhotoInternal("Photo upload completion is unknown; retry the original command.");
    }
    return (await this.inspect(target)) ?? identityPhotoInternal("Photo upload could not be confirmed.");
  }
}

export interface IdentityPhotoDeletionTarget {
  bucketName: string;
  objectPath: string;
  generation: string | null;
  sizeBytes: number;
  metadata: IdentityPhotoObjectTarget["metadata"];
}
export interface IdentityPhotoDeletionStore {
  inspectForDeletion(target: IdentityPhotoDeletionTarget): Promise<string | null>;
  remove(target: IdentityPhotoDeletionTarget & { generation: string }): Promise<void>;
  closeUpload(target: IdentityPhotoDeletionTarget): Promise<void>;
}

export class PrivateIdentityPhotoDeletionStore implements IdentityPhotoDeletionStore {
  constructor(
    private readonly file: (bucket: string, path: string, options?: FileOptions) => File = (
      bucket,
      path,
      options,
    ) => getFirebaseAdminApp().storage().bucket(bucket).file(path, options),
  ) {}
  public async inspectForDeletion(target: IdentityPhotoDeletionTarget): Promise<string | null> {
    let metadata;
    try {
      [metadata] = await this.file(target.bucketName, target.objectPath).getMetadata();
    } catch (error) {
      if (code(error) === 404) return null;
      return identityPhotoInternal("Photo deletion inspection is unavailable.");
    }
    const custom = metadata.metadata ?? {};
    if (
      metadata.contentType === "application/octet-stream" &&
      Number(metadata.size) === 0 &&
      custom.identityPhotoUploadClosed === "v1" &&
      Object.entries(target.metadata)
        .filter(([key]) => key !== "sha256")
        .every(([key, value]) => custom[key] === value)
    ) {
      return null;
    }
    if (
      typeof metadata.generation !== "string" ||
      !/^[1-9][0-9]*$/u.test(metadata.generation) ||
      (target.generation !== null && metadata.generation !== target.generation) ||
      Number(metadata.size) !== target.sizeBytes ||
      metadata.contentType !== POLICY.mediaType ||
      Object.entries(target.metadata).some(([key, value]) => custom[key] !== value)
    ) {
      return identityPhotoInternal("Photo deletion object authority is inconsistent.");
    }
    const [bytes] = await this.file(target.bucketName, target.objectPath, {
      generation: checkedIdentityPhotoReadGeneration(metadata.generation),
    }).download();
    if (bytes.length !== target.sizeBytes || photoHash(bytes) !== target.metadata.sha256) {
      return identityPhotoInternal("Photo deletion integrity is inconsistent.");
    }
    return metadata.generation;
  }
  public async remove(target: IdentityPhotoDeletionTarget & { generation: string }): Promise<void> {
    const file = this.file(target.bucketName, target.objectPath, {
      // The older SDK read selector rounds strings. Use only the exact REST
      // generation-match precondition here; the SDK typing incorrectly requires a number.
      preconditionOpts: {ifGenerationMatch: target.generation as unknown as number},
    });
    try {
      await file.delete();
    } catch (error) {
      if (code(error) !== 404) return identityPhotoInternal("Photo object removal is unconfirmed.");
    }
    try {
      await file.getMetadata();
      return identityPhotoInternal("Photo generation absence is unconfirmed.");
    } catch (error) {
      if (code(error) !== 404) return identityPhotoInternal("Photo generation absence is unconfirmed.");
    }
  }
  public async closeUpload(target: IdentityPhotoDeletionTarget): Promise<void> {
    // A zero-byte, non-image fence permanently closes generation-zero writes.
    // Without this fence, an in-flight create could land after observed absence,
    // even if the original producer crashed before recording its result.
    const file = this.file(target.bucketName, target.objectPath);
    const owner = Object.fromEntries(Object.entries(target.metadata).filter(([key]) => key !== "sha256"));
    try {
      await file.save(Buffer.alloc(0), {
        resumable: false,
        contentType: "application/octet-stream",
        preconditionOpts: {ifGenerationMatch: 0},
        metadata: {
          cacheControl: "private, max-age=0, no-store",
          metadata: {...owner, identityPhotoUploadClosed: "v1"},
        },
      });
    } catch {
      // Create races and lost fence acknowledgements are reconciled by inspection.
    }
    if ((await this.inspectForDeletion({...target, generation: null})) !== null) {
      return identityPhotoInternal("Photo upload closure is unconfirmed.");
    }
    const [metadata] = await file.getMetadata();
    if (Number(metadata.size) !== 0 || metadata.metadata?.identityPhotoUploadClosed !== "v1") {
      return identityPhotoInternal("Photo upload closure is unconfirmed.");
    }
  }
}

/** Reads only a server-resolved immutable target, never caller coordinates. */
export class PrivateIdentityPhotoMediaStore {
  public async read(target: IdentityPhotoDeletionTarget & {generation: string}): Promise<Buffer> {
    const file = getFirebaseAdminApp().storage().bucket(target.bucketName).file(target.objectPath, {
      generation: checkedIdentityPhotoReadGeneration(target.generation),
    });
    let metadata;
    try {
      [metadata] = await file.getMetadata();
    } catch (error) {
      if (code(error) === 404) throw new StudentProfileValidationError("NOT_FOUND", "Photo is unavailable.");
      return identityPhotoInternal("Photo inspection failed.");
    }
    if (metadata.generation !== target.generation || Number(metadata.size) !== target.sizeBytes ||
        target.sizeBytes < 1 || target.sizeBytes > POLICY.maxUploadBytes ||
        metadata.contentType !== POLICY.mediaType || metadata.cacheControl !== "private, max-age=0, no-store" ||
        metadata.metadata?.firebaseStorageDownloadTokens != null ||
        Object.entries(target.metadata).some(([key, value]) => metadata.metadata?.[key] !== value)) {
      return identityPhotoInternal("Photo object authority is inconsistent.");
    }
    // The bounded range prevents a corrupt/provider object from causing an unbounded allocation.
    const [bytes] = await file.download({start: 0, end: POLICY.maxUploadBytes});
    if (bytes.length !== target.sizeBytes || photoHash(bytes) !== target.metadata.sha256) {
      return identityPhotoInternal("Photo integrity failed.");
    }
    return bytes;
  }
}
