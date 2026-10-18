import {createHash} from "node:crypto";
import sharp from "sharp";
import type {StudentIdentityPhotoEnrollRequest} from "../../../shared/contracts/studentProfile";
import {StudentProfileValidationError} from "../types/studentProfile";
import {STUDENT_IDENTITY_PHOTO_POLICY as POLICY} from "./studentIdentityPhotoPolicy";

export interface NormalizedIdentityPhoto {
  bytes: Buffer;
  sha256: string;
  width: number;
  height: number;
}
export function photoHash(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
export function photoError(message: string): never {
  throw new StudentProfileValidationError("VALIDATION_ERROR", message);
}
export function photoRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function photoExactKeys(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  if (!photoRecord(value) || Object.keys(value).sort().join(",") !== [...keys].sort().join(",")) {
    photoError("Photo fields are missing or unsupported.");
  }
}
export function normalizeIdentityPhotoEnrollment(body: unknown): {
  request: StudentIdentityPhotoEnrollRequest;
  input: Buffer;
  inputSha256: string;
} {
  photoExactKeys(body, [
    "expectedVersion",
    "expectedPhotoId",
    "idempotencyKey",
    "consent",
    "contentBase64",
    "mediaType",
  ]);
  photoExactKeys(body.consent, ["accepted", "policyVersion"]);
  if (
    !Number.isSafeInteger(body.expectedVersion) ||
    Number(body.expectedVersion) < 1 ||
    Number(body.expectedVersion) >= Number.MAX_SAFE_INTEGER - 1 ||
    (body.expectedPhotoId !== null &&
      (typeof body.expectedPhotoId !== "string" || !/^photo_[a-f0-9]{40}$/u.test(body.expectedPhotoId))) ||
    typeof body.idempotencyKey !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(body.idempotencyKey) ||
    body.mediaType !== POLICY.mediaType ||
    body.consent.accepted !== true ||
    body.consent.policyVersion !== POLICY.policyVersion ||
    typeof body.contentBase64 !== "string" ||
    body.contentBase64.length === 0 ||
    body.contentBase64.length > POLICY.maxEncodedCharacters ||
    (body.contentBase64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(body.contentBase64))
  ) {
    return photoError("Photo consent or enrollment intent is invalid.");
  }
  const input = Buffer.from(body.contentBase64, "base64");
  if (
    input.length < 4 ||
    input.length > POLICY.maxUploadBytes ||
    input.toString("base64") !== body.contentBase64
  ) {
    return photoError("Photo byte encoding or size is invalid.");
  }
  return {
    request: {
      expectedVersion: Number(body.expectedVersion),
      expectedPhotoId: body.expectedPhotoId,
      idempotencyKey: body.idempotencyKey,
      consent: {accepted: true, policyVersion: POLICY.policyVersion},
      mediaType: POLICY.mediaType,
      contentBase64: body.contentBase64,
    },
    input,
    inputSha256: photoHash(input),
  };
}

// Validate container boundaries before handing bounded pixels to libvips.
function singleJpeg(bytes: Buffer): void {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return photoError("Only a complete single JPEG is supported.");
  let offset = 2;
  let entropy = false;
  let sawScan = false;
  while (offset < bytes.length) {
    if (entropy) {
      while (offset < bytes.length && bytes[offset] !== 0xff) offset++;
    }
    if (bytes[offset++] !== 0xff) return photoError("JPEG container is malformed.");
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (entropy && (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7))) continue;
    entropy = false;
    if (marker === 0xd9) {
      if (!sawScan || offset !== bytes.length) return photoError("JPEG has trailing or multiple images.");
      return;
    }
    if (
      marker === undefined ||
      marker === 0xd8 ||
      marker === 0x00 ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7) ||
      offset + 2 > bytes.length
    ) {
      return photoError("JPEG marker is invalid.");
    }
    const size = bytes.readUInt16BE(offset);
    if (size < 2 || offset + size > bytes.length) return photoError("JPEG segment is truncated.");
    if (marker === 0xe2 && bytes.subarray(offset + 2, offset + 6).equals(Buffer.from("MPF\0"))) {
      return photoError("Multi-picture JPEG is unsupported.");
    }
    offset += size;
    if (marker === 0xda) {
      entropy = true;
      sawScan = true;
    }
  }
  return photoError("JPEG is incomplete.");
}
function dimensions(width: number | undefined, height: number | undefined): void {
  if (
    !width ||
    !height ||
    width < POLICY.minimumImageDimension ||
    height < POLICY.minimumImageDimension ||
    width > POLICY.maxImageDimension ||
    height > POLICY.maxImageDimension ||
    width * height > POLICY.maxDecodedPixels
  ) {
    return photoError("Photo dimensions exceed the supported bounds.");
  }
}
export async function normalizeIdentityPhotoImage(input: Buffer): Promise<NormalizedIdentityPhoto> {
  if (input.length > POLICY.maxUploadBytes) return photoError("Photo exceeds the byte bound.");
  singleJpeg(input);
  try {
    const decoder = sharp(input, {
      failOn: "warning",
      limitInputPixels: POLICY.maxDecodedPixels,
      autoOrient: true,
    });
    const metadata = await decoder.metadata();
    if (metadata.format !== "jpeg" || (metadata.pages ?? 1) !== 1) {
      return photoError("Only single JPEG photos are supported.");
    }
    dimensions(metadata.width, metadata.height);
    const {data, info} = await decoder
      .jpeg({quality: 88, chromaSubsampling: "4:2:0"})
      .timeout({seconds: 5})
      .toBuffer({resolveWithObject: true});
    dimensions(info.width, info.height);
    if (data.length > POLICY.maxUploadBytes) return photoError("Normalized photo exceeds the byte bound.");
    return {bytes: data, sha256: photoHash(data), width: info.width, height: info.height};
  } catch (error) {
    if (error instanceof StudentProfileValidationError) throw error;
    return photoError("Photo could not be safely decoded.");
  }
}
