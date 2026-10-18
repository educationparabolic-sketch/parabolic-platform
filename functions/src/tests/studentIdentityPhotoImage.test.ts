import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import test from "node:test";
import sharp from "sharp";
import {Storage} from "@google-cloud/storage";
import {
  normalizeIdentityPhotoEnrollment,
  normalizeIdentityPhotoImage,
} from "../services/studentIdentityPhotoImage";
import {
  resolveIdentityPhotosBucket,
  PrivateIdentityPhotoDeletionStore,
  checkedIdentityPhotoReadGeneration,
} from "../services/studentIdentityPhotoStorage";
import {StudentProfileValidationError} from "../types/studentProfile";

function invalid(error: unknown): boolean {
  assert.ok(error instanceof StudentProfileValidationError);
  assert.equal(error.code, "VALIDATION_ERROR");
  return true;
}
async function jpeg(width = 320, height = 240): Promise<Buffer> {
  return sharp({create: {width, height, channels: 3, background: "#507080"}})
    .jpeg()
    .toBuffer();
}
function request(bytes: Buffer) {
  return {
    expectedVersion: 1,
    expectedPhotoId: null,
    idempotencyKey: randomUUID(),
    consent: {accepted: true, policyVersion: "student-identity-photo-v1"},
    mediaType: "image/jpeg",
    contentBase64: bytes.toString("base64"),
  };
}
test("closed enrollment intent enforces version/pointer/consent/UUID/base64/size before allocation", async () => {
  const body = request(await jpeg());
  for (const value of [
    null,
    {...body, actorId: "spoof"},
    {...body, instituteId: "other"},
    {...body, capturedAt: "now"},
    {...body, verificationStatus: "verified"},
    {...body, expectedVersion: "1"},
    {...body, expectedVersion: Number.MAX_SAFE_INTEGER},
    {...body, expectedPhotoId: "path/other"},
    {...body, idempotencyKey: "bad"},
    {...body, consent: {accepted: false, policyVersion: "student-identity-photo-v1"}},
    {...body, consent: {...body.consent, policyVersion: "old"}},
    {...body, consent: {...body.consent, extra: true}},
    {...body, mediaType: "image/png"},
    {...body, contentBase64: "data:image/jpeg;base64,AAAA"},
    {...body, contentBase64: "AAAA\n"},
    {...body, contentBase64: "AB=="},
    {...body, contentBase64: "A".repeat(1398108)},
  ]) {
    assert.throws(() => normalizeIdentityPhotoEnrollment(value), invalid);
  }
  assert.equal(normalizeIdentityPhotoEnrollment(request(Buffer.alloc(1048576))).input.length, 1048576);
  const normalized = normalizeIdentityPhotoEnrollment(body);
  body.consent.accepted = false;
  body.expectedVersion = 9;
  assert.equal(normalized.request.consent.accepted, true);
  assert.equal(normalized.request.expectedVersion, 1);
});
test("actual decoder normalizes a single JPEG and strips EXIF/XMP/private metadata", async () => {
  const input = await sharp(await jpeg())
    .withExif({IFD0: {Copyright: "private-student-location"}})
    .withXmp("<x:xmpmeta xmlns:x=\"adobe:ns:meta/\">private-student-location</x:xmpmeta>")
    .toBuffer();
  const normalized = await normalizeIdentityPhotoImage(input);
  assert.equal(normalized.width, 320);
  assert.equal(normalized.height, 240);
  assert.equal(normalized.sha256.length, 64);
  const metadata = await sharp(normalized.bytes).metadata();
  assert.equal(metadata.format, "jpeg");
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.xmp, undefined);
  assert.equal(metadata.icc, undefined);
  assert.ok(!normalized.bytes.includes(Buffer.from("private-student-location")));
  const repeat = await normalizeIdentityPhotoImage(input);
  assert.deepEqual(repeat.bytes, normalized.bytes);
});
test("container and decoder reject malformed, multiple and oversized JPEGs", async () => {
  const input = await jpeg();
  const png = await sharp(input).png().toBuffer();
  const mpf = Buffer.concat([
    input.subarray(0, 2),
    Buffer.from([0xff, 0xe2, 0, 6, 77, 80, 70, 0]),
    input.subarray(2),
  ]);
  for (const bytes of [
    png,
    Buffer.from([255, 216, 255, 217]),
    input.subarray(0, input.length - 10),
    Buffer.concat([input, input]),
    Buffer.concat([input, Buffer.from("trailer")]),
    mpf,
    await jpeg(159, 240),
    await jpeg(1921, 160),
    await jpeg(1920, 1200),
  ]) {
    await assert.rejects(normalizeIdentityPhotoImage(bytes), invalid);
  }
});
test("private bucket configuration is explicit and rejects shared buckets", () => {
  const original = process.env.IDENTITY_PHOTOS_BUCKET;
  const originalQuestion = process.env.QUESTION_ASSETS_BUCKET;
  try {
    for (const value of [undefined, "", "gs://photos", "wrong bucket", "UPPER-bucket"]) {
      if (value === undefined) delete process.env.IDENTITY_PHOTOS_BUCKET;
      else process.env.IDENTITY_PHOTOS_BUCKET = value;
      assert.throws(
        resolveIdentityPhotosBucket,
        (error: unknown) => error instanceof StudentProfileValidationError && error.code === "INTERNAL_ERROR",
      );
    }
    process.env.IDENTITY_PHOTOS_BUCKET = "demo-identity-photos";
    assert.equal(resolveIdentityPhotosBucket(), "demo-identity-photos");
    process.env.QUESTION_ASSETS_BUCKET = "demo-identity-photos";
    assert.throws(resolveIdentityPhotosBucket);
  } finally {
    if (original === undefined) delete process.env.IDENTITY_PHOTOS_BUCKET;
    else process.env.IDENTITY_PHOTOS_BUCKET = original;
    if (originalQuestion === undefined) delete process.env.QUESTION_ASSETS_BUCKET;
    else process.env.QUESTION_ASSETS_BUCKET = originalQuestion;
  }
});

test("deletion serializes an exact uint64 generation precondition without an unsafe numeric selector", async () => {
  const requests: { method: string; qs?: Record<string, unknown> }[] = [];
  const storage = new Storage({projectId: "demo-parabolic-test"});
  // Intercept the actual SDK's final transport boundary; File.delete delegates
  // through the parent ServiceObject and deliberately bypasses File.request.
  Object.defineProperty(storage, "request", {
    value: (
      request: {method: string; qs?: Record<string, unknown>},
      callback: (error: Error | null, response?: object) => void,
    ) => {
      requests.push(request);
      if (request.method === "DELETE") callback(null, {});
      else callback(Object.assign(new Error("absent"), {code: 404}));
    },
  });
  const store = new PrivateIdentityPhotoDeletionStore((bucket, path, options) =>
    storage.bucket(bucket).file(path, options));
  await store.remove({
    bucketName: "demo-private-photos",
    objectPath: "opaque/photo.jpg",
    generation: "9007199254740993",
    sizeBytes: 3,
    metadata: {
      photoId: "photo_a",
      instituteId: "institute",
      studentId: "student",
      studentUid: "student",
      idempotencyKeyHash: "a",
      requestFingerprint: "b",
      sha256: "c",
    },
  });
  assert.equal(requests.length, 2);
  assert.equal(requests[0].method, "DELETE");
  assert.equal(requests[0].qs?.ifGenerationMatch, "9007199254740993");
  assert.equal(requests[0].qs?.generation, undefined);
  assert.equal(checkedIdentityPhotoReadGeneration("1234567890123456"), 1234567890123456);
  assert.throws(() => checkedIdentityPhotoReadGeneration("9007199254740993"));
});

test("upload closure sends only a private zero-byte create-only non-image fence", async () => {
  const storage = new Storage({projectId: "demo-parabolic-test"});
  const metadata = {
    photoId: "photo_a",
    instituteId: "institute",
    studentId: "student",
    studentUid: "student",
    idempotencyKeyHash: "a",
    requestFingerprint: "b",
    sha256: "private-image-hash",
  };
  const owner = Object.fromEntries(Object.entries(metadata).filter(([key]) => key !== "sha256"));
  let sent: { bytes: Buffer; options: Record<string, unknown> } | undefined;
  const store = new PrivateIdentityPhotoDeletionStore((bucket, path) => {
    const file = storage.bucket(bucket).file(path);
    Object.defineProperty(file, "save", {
      value: async (bytes: Buffer, options: Record<string, unknown>) => {
        sent = {bytes, options};
      },
    });
    Object.defineProperty(file, "getMetadata", {
      value: async () => [
        {
          contentType: "application/octet-stream",
          size: "0",
          metadata: {...owner, identityPhotoUploadClosed: "v1"},
        },
      ],
    });
    return file;
  });
  await store.closeUpload({
    bucketName: "demo-private-photos",
    objectPath: "opaque/photo.jpg",
    generation: null,
    sizeBytes: 3,
    metadata,
  });
  assert.ok(sent);
  assert.equal(sent.bytes.length, 0);
  assert.equal(sent.options.contentType, "application/octet-stream");
  assert.deepEqual(sent.options.preconditionOpts, {ifGenerationMatch: 0});
  assert.deepEqual(sent.options.metadata, {
    cacheControl: "private, max-age=0, no-store",
    metadata: {...owner, identityPhotoUploadClosed: "v1"},
  });
});
