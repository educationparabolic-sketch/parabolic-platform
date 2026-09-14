import assert from "node:assert/strict";
import test from "node:test";
import * as gcpMetadata from "gcp-metadata";
import {Timestamp} from "firebase-admin/firestore";
import {
  AdminQuestionPackagesService,
  PackageStorageAdapter,
} from "../services/adminQuestionPackages";
import {StorageObjectTarget} from "../types/storageBucketArchitecture";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";

process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= "127.0.0.1:9199";
process.env.GCLOUD_PROJECT ??= "demo-parabolic-test";
process.env.GOOGLE_CLOUD_PROJECT ??= process.env.GCLOUD_PROJECT;
process.env.QUESTION_ASSETS_BUCKET ??= "demo-parabolic-test.appspot.com";
process.env.NO_GCE_CHECK ??= "true";
process.env.METADATA_SERVER_DETECTION ??= "none";
gcpMetadata.setGCPResidency(false);

const firestore = getFirestore();
const NOW = Timestamp.fromDate(new Date("2026-09-10T12:00:00.000Z"));
const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);

interface StoredObject {
  bytes: Buffer;
  contentSha256: string;
}

class MemoryPackageStorage implements PackageStorageAdapter {
  public readonly objects = new Map<string, StoredObject>();
  public canonicalPutCount = 0;
  public failCanonicalDeleteOnce = false;
  public failCanonicalPutAt: number | null = null;
  public failStagingDeleteOnce = false;

  public async deleteObject(objectPath: string): Promise<void> {
    if (objectPath.includes("/question-packages/") && this.failStagingDeleteOnce) {
      this.failStagingDeleteOnce = false;
      throw new Error("injected staging cleanup failure");
    }
    if (!objectPath.includes("/question-packages/") &&
      this.failCanonicalDeleteOnce) {
      this.failCanonicalDeleteOnce = false;
      throw new Error("injected rollback asset cleanup failure");
    }
    this.objects.delete(objectPath);
  }

  public async putObject(input: {
    bytes: Buffer;
    contentType: string;
    metadata: {contentSha256: string; packageId: string};
    objectPath: string;
  }): Promise<"created" | "replayed"> {
    if (!input.objectPath.includes("/question-packages/")) {
      this.canonicalPutCount += 1;
      if (this.canonicalPutCount === this.failCanonicalPutAt) {
        throw new Error("injected canonical upload failure");
      }
    }
    const existing = this.objects.get(input.objectPath);
    if (existing) {
      if (existing.contentSha256 !== input.metadata.contentSha256) {
        throw new Error("conflicting content");
      }
      return "replayed";
    }
    this.objects.set(input.objectPath, {
      bytes: Buffer.from(input.bytes),
      contentSha256: input.metadata.contentSha256,
    });
    return "created";
  }

  public async readObject(objectPath: string): Promise<Buffer> {
    const object = this.objects.get(objectPath);
    if (!object) throw new Error(`missing object ${objectPath}`);
    return Buffer.from(object.bytes);
  }

  public async verifyObject(
    objectPath: string,
    contentSha256: string,
  ): Promise<void> {
    const object = this.objects.get(objectPath);
    if (!object || object.contentSha256 !== contentSha256) {
      throw new Error(`invalid object ${objectPath}`);
    }
  }
}

function writeUInt16(output: number[], value: number): void {
  output.push(value & 0xff, (value >>> 8) & 0xff);
}

function writeUInt32(output: number[], value: number): void {
  output.push(
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  );
}

function crc32(bytes: Buffer): number {
  let value = 0xffffffff;
  bytes.forEach((byte) => {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    }
  });
  return (value ^ 0xffffffff) >>> 0;
}

function storedZip(files: Array<{content: Buffer | string; name: string}>): Buffer {
  const output: number[] = [];
  const directory: number[] = [];
  files.forEach((file) => {
    const name = Buffer.from(file.name);
    const content = typeof file.content === "string" ?
      Buffer.from(file.content) : file.content;
    const checksum = crc32(content);
    const localOffset = output.length;
    writeUInt32(output, 0x04034b50);
    writeUInt16(output, 20);
    writeUInt16(output, 0);
    writeUInt16(output, 0);
    writeUInt16(output, 0);
    writeUInt16(output, 0);
    writeUInt32(output, checksum);
    writeUInt32(output, content.length);
    writeUInt32(output, content.length);
    writeUInt16(output, name.length);
    writeUInt16(output, 0);
    output.push(...name, ...content);

    writeUInt32(directory, 0x02014b50);
    writeUInt16(directory, 20);
    writeUInt16(directory, 20);
    writeUInt16(directory, 0);
    writeUInt16(directory, 0);
    writeUInt16(directory, 0);
    writeUInt16(directory, 0);
    writeUInt32(directory, checksum);
    writeUInt32(directory, content.length);
    writeUInt32(directory, content.length);
    writeUInt16(directory, name.length);
    writeUInt16(directory, 0);
    writeUInt16(directory, 0);
    writeUInt16(directory, 0);
    writeUInt16(directory, 0);
    writeUInt32(directory, 0);
    writeUInt32(directory, localOffset);
    directory.push(...name);
  });
  const directoryOffset = output.length;
  output.push(...directory);
  writeUInt32(output, 0x06054b50);
  writeUInt16(output, 0);
  writeUInt16(output, 0);
  writeUInt16(output, files.length);
  writeUInt16(output, files.length);
  writeUInt32(output, directory.length);
  writeUInt32(output, directoryOffset);
  writeUInt16(output, 0);
  return Buffer.from(output);
}

function xml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function columnName(index: number): string {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    result = String.fromCharCode(65 + ((value - 1) % 26)) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function worksheet(rows: string[][]): string {
  return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>" +
    "<worksheet><sheetData>" + rows.map((row, rowIndex) =>
    `<row r="${rowIndex + 1}">` + row.map((value, columnIndex) =>
      `<c r="${columnName(columnIndex)}${rowIndex + 1}" t="inlineStr">` +
        `<is><t>${xml(value)}</t></is></c>`).join("") + "</row>").join("") +
    "</sheetData></worksheet>";
}

const HEADERS = [
  "UniqueKey", "Marks", "NegativeMarks", "ChapterName", "Difficulty",
  "QuestionType", "QuestionNo", "QuestionImageFile", "SolutionImageFile",
  "CorrectAnswer", "PrimaryTag", "SecondaryTag", "Topic", "AdditionalTag",
  "InternalNotes", "AcademicYear", "QuestionText", "TutorialVideoLink",
  "SimulationLink", "Version",
];

function workbook(rows: string[][]): Buffer {
  const workbookXml = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>" +
    "<workbook xmlns:r=\"relationships\"><sheets>" +
    "<sheet name=\"questions\" r:id=\"rId1\"/>" +
    "<sheet name=\"Exam Summary\" r:id=\"rId2\"/>" +
    "<sheet name=\"INSTRUCTIONS\" r:id=\"rId3\"/>" +
    "</sheets></workbook>";
  const relationships = "<Relationships>" +
    "<Relationship Id=\"rId1\" Target=\"worksheets/sheet1.xml\"/>" +
    "<Relationship Id=\"rId2\" Target=\"worksheets/sheet2.xml\"/>" +
    "<Relationship Id=\"rId3\" Target=\"worksheets/sheet3.xml\"/>" +
    "</Relationships>";
  return storedZip([
    {content: workbookXml, name: "xl/workbook.xml"},
    {content: relationships, name: "xl/_rels/workbook.xml.rels"},
    {content: worksheet([HEADERS, ...rows]), name: "xl/worksheets/sheet1.xml"},
    {content: worksheet([["Field", "Value"]]), name: "xl/worksheets/sheet2.xml"},
    {content: worksheet([["Topic", "Instruction"]]), name: "xl/worksheets/sheet3.xml"},
  ]);
}

function validRow(uniqueKey = "PKG-FULL-001"): string[] {
  return [
    uniqueKey,
    "4",
    "-1",
    "Motion",
    "Medium",
    "single_correct",
    "17",
    "question.png",
    "solution.png",
    "B",
    "Kinematics",
    "Velocity",
    "Uniform motion",
    "Mechanics",
    "Preserved reviewer note",
    "2026-2027",
    "What is the final velocity?",
    "https://example.test/tutorial",
    "https://example.test/simulation",
    "1",
  ];
}

function packageBytes(rows: string[][], extras: Array<{
  content: Buffer | string;
  name: string;
}> = []): Buffer {
  return storedZip([
    {content: workbook(rows), name: "questions.xlsx"},
    {content: PNG, name: "question.png"},
    {content: PNG, name: "solution.png"},
    ...extras,
  ]);
}

function authority(instituteId: string) {
  return {
    actorId: "teacher-package-test",
    actorRole: "teacher",
    instituteId,
    ipAddress: "127.0.0.1",
    userAgent: "BWM-027-package-test",
  };
}

function resolveTarget(input: {
  assetKind: "questionImage" | "solutionImage" | "solutionPdf";
  extension?: "png" | "webp" | "pdf";
  instituteId: string;
  questionId: string;
  version: number;
}): StorageObjectTarget {
  const extension = input.extension ?? "png";
  const name = input.assetKind === "questionImage" ? "question" : "solution";
  const objectPath = `${input.instituteId}/questions/${input.questionId}/` +
    `v${input.version}/${name}.${extension}`;
  return {
    bucketKey: "questionAssets",
    bucketName: "memory",
    cdnBaseUrl: "https://cdn.example.test",
    cdnPath: objectPath,
    contentType: extension === "webp" ? "image/webp" : "image/png",
    directoryPath: objectPath.split("/").slice(0, -1).join("/"),
    gsUri: `gs://memory/${objectPath}`,
    objectPath,
    requiresSignedUrl: true,
  };
}

function memoryService(storage: MemoryPackageStorage): AdminQuestionPackagesService {
  return new AdminQuestionPackagesService({
    firestore,
    now: () => NOW,
    resolveStorageTarget: resolveTarget,
    storage,
  });
}

async function clearInstitute(instituteId: string): Promise<void> {
  const institute = firestore.collection("institutes").doc(instituteId);
  for (const collection of [
    "auditLogs",
    "questionBank",
    "questionPackages",
    "questionUploadLogs",
    "tests",
  ]) {
    const snapshot = await institute.collection(collection).get();
    await Promise.all(snapshot.docs.map((document) => document.ref.delete()));
  }
  await institute.delete();
}

function validateRequest(
  service: AdminQuestionPackagesService,
  instituteId: string,
  content: Buffer,
  idempotencyKey: string,
) {
  return service.normalizeValidateRequest({
    ...authority(instituteId),
    body: {
      contentBase64: content.toString("base64"),
      examType: "JEEMains",
      fileName: "physics-package.zip",
      idempotencyKey,
      subject: "Physics",
    },
  });
}

test.after(async () => {
  await getFirebaseAdminApp().delete();
});

test("validation preserves good rows and persists bad row outcomes", async () => {
  const instituteId = "inst-bwm-027-package-invalid";
  const storage = new MemoryPackageStorage();
  const service = memoryService(storage);
  await clearInstitute(instituteId);
  try {
    const invalid = validRow("PKG-BAD-002");
    invalid[4] = "Impossible";
    invalid[7] = "missing.png";
    const request = validateRequest(
      service,
      instituteId,
      packageBytes([validRow("PKG-GOOD-001"), invalid]),
      "package-invalid-key",
    );
    const result = await service.validatePackage(request);
    assert.equal(result.state, "validation_failed");
    assert.equal(result.summary.received, 2);
    assert.equal(result.summary.valid, 1);
    assert.equal(result.summary.invalid, 1);
    assert.equal(result.rows[0]?.action, "create");
    assert.equal(result.rows[1]?.action, "none");
    assert.match(result.rows[1]?.errors.join(" ") ?? "", /Difficulty/);
    assert.match(result.rows[1]?.errors.join(" ") ?? "", /missing\.png/);
    assert.equal(storage.objects.size, 0);

    const log = await firestore.doc(
      `institutes/${instituteId}/questionUploadLogs/${result.uploadLogId}`,
    ).get();
    assert.equal(log.get("state"), "validation_failed");
    assert.equal(log.get("rows").length, 2);
    assert.equal((await service.validatePackage(request)).disposition, "replayed");
  } finally {
    await clearInstitute(instituteId);
  }
});

test("validation rejects normalized identity collisions and oversized fields", async () => {
  const instituteId = "inst-bwm-027-package-row-identity";
  const storage = new MemoryPackageStorage();
  const service = memoryService(storage);
  await clearInstitute(instituteId);
  try {
    const oversized = validRow("PKG-OVERSIZED");
    oversized[10] = "T".repeat(513);
    const result = await service.validatePackage(validateRequest(
      service,
      instituteId,
      packageBytes([
        validRow("PKG COLLIDE"),
        validRow("PKG-COLLIDE"),
        oversized,
      ]),
      "package-row-identity-validation",
    ));
    assert.equal(result.state, "validation_failed");
    assert.equal(result.summary.received, 3);
    assert.equal(result.summary.valid, 1);
    assert.equal(result.summary.invalid, 2);
    assert.match(result.rows[1]?.errors.join(" ") ?? "", /normalization/);
    assert.match(result.rows[2]?.errors.join(" ") ?? "", /512 characters/);
    assert.equal(storage.objects.size, 0);
  } finally {
    await clearInstitute(instituteId);
  }
});

test("commit preserves full schema, assets, audit, cleanup, and replay", async () => {
  const instituteId = "inst-bwm-027-package-success";
  const service = new AdminQuestionPackagesService();
  const bucket = getFirebaseAdminApp().storage().bucket(
    process.env.QUESTION_ASSETS_BUCKET,
  );
  const cleanupPaths: string[] = [];
  await clearInstitute(instituteId);
  try {
    const validation = await service.validatePackage(validateRequest(
      service,
      instituteId,
      packageBytes([validRow()]),
      "package-success-validation",
    ));
    assert.equal(validation.state, "validated");
    const stagingPath = `${instituteId}/question-packages/` +
      `${validation.packageId}/${validation.contentSha256}.zip`;
    cleanupPaths.push(stagingPath);
    assert.equal((await bucket.file(stagingPath).exists())[0], true);

    const commitRequest = service.normalizeCommitRequest({
      ...authority(instituteId),
      body: {
        expectedPackageRevision: 1,
        idempotencyKey: "package-success-commit",
      },
      packageId: validation.packageId,
    });
    const committed = await service.commitPackage(commitRequest);
    assert.equal(committed.disposition, "applied");
    assert.equal(committed.packageRevision, 2);
    assert.equal(committed.assetCount, 2);
    assert.equal(committed.questions[0]?.revision, 1);

    const questionId = "pkg-full-001-v1";
    const question = await firestore.doc(
      `institutes/${instituteId}/questionBank/${questionId}`,
    ).get();
    assert.equal(question.get("academicYear"), "2026-2027");
    assert.equal(question.get("additionalTag"), "Mechanics");
    assert.equal(question.get("internalNotes"), "Preserved reviewer note");
    assert.equal(question.get("primaryTag"), "Kinematics");
    assert.equal(question.get("questionNo"), "17");
    assert.equal(question.get("questionText"), "What is the final velocity?");
    assert.equal(question.get("secondaryTag"), "Velocity");
    assert.equal(question.get("topic"), "Uniform motion");
    assert.deepEqual(question.get("tags"), [
      "Kinematics", "Velocity", "Mechanics",
    ]);
    assert.match(question.get("questionImageUrl"), /\/v1\/question\.png$/);
    assert.match(question.get("solutionImageUrl"), /\/v1\/solution\.png$/);
    cleanupPaths.push(
      question.get("questionImageUrl"),
      question.get("solutionImageUrl"),
    );
    assert.equal((await bucket.file(stagingPath).exists())[0], false);
    for (const assetPath of cleanupPaths.slice(1)) {
      const [metadata] = await bucket.file(assetPath).getMetadata();
      assert.equal(metadata.metadata?.contentSha256.length, 64);
      assert.equal(metadata.metadata?.packageId, validation.packageId);
    }

    const audit = await firestore.doc(
      `institutes/${instituteId}/auditLogs/${committed.auditId}`,
    ).get();
    const log = await firestore.doc(
      `institutes/${instituteId}/questionUploadLogs/${validation.uploadLogId}`,
    ).get();
    const packageSnapshot = await firestore.doc(
      `institutes/${instituteId}/questionPackages/${validation.packageId}`,
    ).get();
    assert.equal(audit.get("actionType"), "IMPORT_QUESTION_PACKAGE");
    assert.equal(log.get("state"), "committed");
    assert.equal(packageSnapshot.get("state"), "committed");
    assert.equal(packageSnapshot.get("stagingPath"), undefined);
    assert.equal((await service.commitPackage(commitRequest)).disposition, "replayed");
    assert.equal((await firestore.collection(
      `institutes/${instituteId}/auditLogs`,
    ).get()).size, 1);
  } finally {
    await Promise.all(cleanupPaths.map(async (objectPath) => {
      try {
        await bucket.file(objectPath).delete();
      } catch {
        // The staging object must already be absent after a successful commit.
      }
    }));
    await clearInstitute(instituteId);
  }
});

test("canonical upload failure removes partial assets and writes no question", async () => {
  const instituteId = "inst-bwm-027-package-upload-failure";
  const storage = new MemoryPackageStorage();
  const service = memoryService(storage);
  await clearInstitute(instituteId);
  try {
    const validation = await service.validatePackage(validateRequest(
      service,
      instituteId,
      packageBytes([validRow("PKG-UPLOAD-FAIL")]),
      "package-upload-failure-validation",
    ));
    storage.failCanonicalPutAt = 2;
    const commitRequest = service.normalizeCommitRequest({
      ...authority(instituteId),
      body: {
        expectedPackageRevision: 1,
        idempotencyKey: "package-upload-failure-commit",
      },
      packageId: validation.packageId,
    });
    await assert.rejects(service.commitPackage(commitRequest), /injected/);
    assert.equal(storage.objects.size, 1);
    assert.equal((await firestore.collection(
      `institutes/${instituteId}/questionBank`,
    ).get()).empty, true);
    assert.equal((await firestore.collection(
      `institutes/${instituteId}/auditLogs`,
    ).get()).empty, true);
    assert.equal((await firestore.doc(
      `institutes/${instituteId}/questionPackages/${validation.packageId}`,
    ).get()).get("state"), "validated");
  } finally {
    await clearInstitute(instituteId);
  }
});

test("commit rejects a missing staged package without partial authority", async () => {
  const instituteId = "inst-bwm-027-package-missing-stage";
  const storage = new MemoryPackageStorage();
  const service = memoryService(storage);
  await clearInstitute(instituteId);
  try {
    const validation = await service.validatePackage(validateRequest(
      service,
      instituteId,
      packageBytes([validRow("PKG-MISSING-STAGE")]),
      "package-missing-stage-validation",
    ));
    storage.objects.clear();
    const commitRequest = service.normalizeCommitRequest({
      ...authority(instituteId),
      body: {
        expectedPackageRevision: 1,
        idempotencyKey: "package-missing-stage-commit",
      },
      packageId: validation.packageId,
    });
    await assert.rejects(service.commitPackage(commitRequest), /missing object/);
    const packageSnapshot = await firestore.doc(
      `institutes/${instituteId}/questionPackages/${validation.packageId}`,
    ).get();
    assert.equal(packageSnapshot.get("state"), "failed_recoverable");
    assert.equal(packageSnapshot.get("recoveryPhase"), "staging_read");
    assert.equal((await firestore.collection(
      `institutes/${instituteId}/questionBank`,
    ).get()).empty, true);
    assert.equal((await firestore.collection(
      `institutes/${instituteId}/auditLogs`,
    ).get()).empty, true);
  } finally {
    await clearInstitute(instituteId);
  }
});

test("validation rejects workbooks above the 100-row package bound", async () => {
  const instituteId = "inst-bwm-027-package-row-bound";
  const storage = new MemoryPackageStorage();
  const service = memoryService(storage);
  await clearInstitute(instituteId);
  try {
    const rows = Array.from({length: 101}, (_, index) =>
      validRow(`PKG-BOUND-${index + 1}`));
    await assert.rejects(
      service.validatePackage(validateRequest(
        service,
        instituteId,
        packageBytes(rows),
        "package-row-bound-validation",
      )),
      /100-row bound/,
    );
    assert.equal(storage.objects.size, 0);
    assert.equal((await firestore.collection(
      `institutes/${instituteId}/questionPackages`,
    ).get()).empty, true);
  } finally {
    await clearInstitute(instituteId);
  }
});

test("staging cleanup failure stays recoverable and exact retry finalizes", async () => {
  const instituteId = "inst-bwm-027-package-cleanup-recovery";
  const storage = new MemoryPackageStorage();
  const service = memoryService(storage);
  await clearInstitute(instituteId);
  try {
    const validation = await service.validatePackage(validateRequest(
      service,
      instituteId,
      packageBytes([validRow("PKG-CLEANUP-RECOVERY")]),
      "package-cleanup-validation",
    ));
    storage.failStagingDeleteOnce = true;
    const commitRequest = service.normalizeCommitRequest({
      ...authority(instituteId),
      body: {
        expectedPackageRevision: 1,
        idempotencyKey: "package-cleanup-commit",
      },
      packageId: validation.packageId,
    });
    await assert.rejects(service.commitPackage(commitRequest), /cleanup/);
    const failed = await firestore.doc(
      `institutes/${instituteId}/questionPackages/${validation.packageId}`,
    ).get();
    assert.equal(failed.get("state"), "failed_recoverable");
    assert.equal(failed.get("recoveryPhase"), "staging_cleanup");
    assert.equal((await firestore.doc(
      `institutes/${instituteId}/questionBank/pkg-cleanup-recovery-v1`,
    ).get()).exists, true);

    const recovered = await service.commitPackage(commitRequest);
    assert.equal(recovered.disposition, "replayed");
    assert.equal((await firestore.doc(
      `institutes/${instituteId}/questionPackages/${validation.packageId}`,
    ).get()).get("state"), "committed");
    assert.equal(storage.objects.size, 2);
  } finally {
    await clearInstitute(instituteId);
  }
});

test("rollback removes an unchanged create-only package and replays exactly", async () => {
  const instituteId = "inst-bwm-027-package-rollback";
  const storage = new MemoryPackageStorage();
  const service = memoryService(storage);
  await clearInstitute(instituteId);
  try {
    const validation = await service.validatePackage(validateRequest(
      service,
      instituteId,
      packageBytes([validRow("PKG-ROLLBACK")]),
      "package-rollback-validation",
    ));
    const committed = await service.commitPackage(service.normalizeCommitRequest({
      ...authority(instituteId),
      body: {
        expectedPackageRevision: validation.packageRevision,
        idempotencyKey: "package-rollback-commit",
      },
      packageId: validation.packageId,
    }));
    assert.equal(committed.packageRevision, 2);
    assert.equal(storage.objects.size, 2);

    const rollbackRequest = service.normalizeRollbackRequest({
      ...authority(instituteId),
      body: {
        expectedPackageRevision: committed.packageRevision,
        idempotencyKey: "package-rollback-command",
        reason: "Undo the verified test package.",
      },
      uploadLogId: validation.uploadLogId,
    });
    const rolledBack = await service.rollbackPackage(rollbackRequest);
    assert.equal(rolledBack.disposition, "applied");
    assert.equal(rolledBack.packageRevision, 3);
    assert.equal(rolledBack.removedAssetCount, 2);
    assert.equal(rolledBack.removedQuestionCount, 1);
    assert.equal(storage.objects.size, 0);
    assert.equal((await firestore.doc(
      `institutes/${instituteId}/questionBank/pkg-rollback-v1`,
    ).get()).exists, false);
    assert.equal((await firestore.doc(
      `institutes/${instituteId}/questionPackages/${validation.packageId}`,
    ).get()).get("state"), "rolled_back");
    assert.equal((await firestore.doc(
      `institutes/${instituteId}/questionUploadLogs/${validation.uploadLogId}`,
    ).get()).get("state"), "rolled_back");

    const replayed = await service.rollbackPackage(rollbackRequest);
    assert.equal(replayed.disposition, "replayed");
    assert.equal(replayed.auditId, rolledBack.auditId);
    assert.equal((await firestore.collection(
      `institutes/${instituteId}/auditLogs`,
    ).get()).size, 2);
  } finally {
    await clearInstitute(instituteId);
  }
});

test("rollback asset cleanup failure is recoverable by exact retry", async () => {
  const instituteId = "inst-bwm-027-package-rollback-recovery";
  const storage = new MemoryPackageStorage();
  const service = memoryService(storage);
  await clearInstitute(instituteId);
  try {
    const validation = await service.validatePackage(validateRequest(
      service,
      instituteId,
      packageBytes([validRow("PKG-ROLLBACK-RECOVERY")]),
      "package-rollback-recovery-validation",
    ));
    const committed = await service.commitPackage(service.normalizeCommitRequest({
      ...authority(instituteId),
      body: {
        expectedPackageRevision: validation.packageRevision,
        idempotencyKey: "package-rollback-recovery-commit",
      },
      packageId: validation.packageId,
    }));
    const rollbackRequest = service.normalizeRollbackRequest({
      ...authority(instituteId),
      body: {
        expectedPackageRevision: committed.packageRevision,
        idempotencyKey: "package-rollback-recovery-command",
        reason: "Exercise recoverable asset cleanup.",
      },
      uploadLogId: validation.uploadLogId,
    });
    storage.failCanonicalDeleteOnce = true;
    await assert.rejects(
      service.rollbackPackage(rollbackRequest),
      /recoverable.*cleanup/iu,
    );
    const failed = await firestore.doc(
      `institutes/${instituteId}/questionPackages/${validation.packageId}`,
    ).get();
    assert.equal(failed.get("state"), "failed_recoverable");
    assert.equal(failed.get("recoveryPhase"), "rollback_asset_cleanup");
    assert.equal((await firestore.doc(
      `institutes/${instituteId}/questionBank/pkg-rollback-recovery-v1`,
    ).get()).exists, false);
    assert.equal((await firestore.collection(
      `institutes/${instituteId}/auditLogs`,
    ).get()).size, 2);
    assert.equal(storage.objects.size, 1);

    const recovered = await service.rollbackPackage(rollbackRequest);
    assert.equal(recovered.disposition, "applied");
    assert.equal(storage.objects.size, 0);
    assert.equal((await firestore.doc(
      `institutes/${instituteId}/questionPackages/${validation.packageId}`,
    ).get()).get("state"), "rolled_back");
    assert.equal((await firestore.collection(
      `institutes/${instituteId}/auditLogs`,
    ).get()).size, 2);
    const replay = await service.rollbackPackage(rollbackRequest);
    assert.equal(replay.disposition, "replayed");
  } finally {
    await clearInstitute(instituteId);
  }
});
