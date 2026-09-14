/* eslint-disable require-jsdoc */
import {createHash} from "node:crypto";
import {inflateRawSync} from "node:zlib";

export const QUESTION_PACKAGE_LIMITS = {
  maxArchiveBytes: 12 * 1024 * 1024,
  maxAssetBytes: 4 * 1024 * 1024,
  maxEntries: 256,
  maxEntryBytes: 12 * 1024 * 1024,
  maxRows: 100,
  maxTotalUncompressedBytes: 40 * 1024 * 1024,
  maxWorkbookBytes: 8 * 1024 * 1024,
} as const;

const REQUIRED_SHEETS = ["questions", "Exam Summary", "INSTRUCTIONS"];
const REQUIRED_COLUMNS = [
  "UniqueKey",
  "Marks",
  "NegativeMarks",
  "ChapterName",
  "Difficulty",
  "QuestionType",
  "QuestionNo",
  "QuestionImageFile",
  "SolutionImageFile",
  "CorrectAnswer",
  "PrimaryTag",
  "SecondaryTag",
];
const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const RIFF_SIGNATURE = Buffer.from("RIFF");
const WEBP_SIGNATURE = Buffer.from("WEBP");

interface ZipEntry {
  compressedSize: number;
  compressionMethod: number;
  flags: number;
  localHeaderOffset: number;
  name: string;
  uncompressedSize: number;
}

export interface ParsedQuestionPackageAsset {
  bytes: Buffer;
  contentSha256: string;
  extension: "png" | "webp";
  fileName: string;
}

export interface ParsedQuestionPackageRow {
  academicYear: string | null;
  additionalTag: string | null;
  chapter: string;
  correctAnswer: string;
  difficulty: "Easy" | "Medium" | "Hard" | null;
  errors: string[];
  internalNotes: string | null;
  marks: number | null;
  negativeMarks: number | null;
  primaryTag: string | null;
  questionImageFile: string;
  questionNo: string;
  questionText: string | null;
  questionType: string;
  rowNumber: number;
  secondaryTag: string | null;
  simulationLink: string | null;
  solutionImageFile: string;
  topic: string | null;
  tutorialVideoLink: string | null;
  uniqueKey: string | null;
  version: number | null;
  warnings: string[];
}

export interface ParsedQuestionPackage {
  assets: Map<string, ParsedQuestionPackageAsset>;
  contentSha256: string;
  globalErrors: string[];
  rows: ParsedQuestionPackageRow[];
  warnings: string[];
}

export class QuestionPackageParserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuestionPackageParserError";
  }
}

class QuestionPackageLimitError extends QuestionPackageParserError {
  constructor(message: string) {
    super(message);
    this.name = "QuestionPackageLimitError";
  }
}

function readUInt16(buffer: Buffer, offset: number): number {
  if (offset < 0 || offset + 2 > buffer.length) {
    throw new QuestionPackageParserError("ZIP structure is truncated.");
  }
  return buffer.readUInt16LE(offset);
}

function readUInt32(buffer: Buffer, offset: number): number {
  if (offset < 0 || offset + 4 > buffer.length) {
    throw new QuestionPackageParserError("ZIP structure is truncated.");
  }
  return buffer.readUInt32LE(offset);
}

function assertSafeEntryName(name: string): void {
  if (
    !name ||
    name.includes("\0") ||
    name.startsWith("/") ||
    name.startsWith("\\") ||
    /(^|[\\/])\.\.([\\/]|$)/.test(name)
  ) {
    throw new QuestionPackageParserError(
      `ZIP entry "${name || "<empty>"}" has an unsafe path.`,
    );
  }
}

function parseZipDirectory(buffer: Buffer): ZipEntry[] {
  if (buffer.length < 22) {
    throw new QuestionPackageParserError("ZIP archive is truncated.");
  }
  const searchStart = Math.max(0, buffer.length - 22 - 65_535);
  let eocdOffset = -1;
  for (let offset = buffer.length - 22; offset >= searchStart; offset -= 1) {
    if (readUInt32(buffer, offset) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) {
    throw new QuestionPackageParserError(
      "ZIP end-of-central-directory record was not found.",
    );
  }

  const diskNumber = readUInt16(buffer, eocdOffset + 4);
  const directoryDisk = readUInt16(buffer, eocdOffset + 6);
  const diskEntries = readUInt16(buffer, eocdOffset + 8);
  const totalEntries = readUInt16(buffer, eocdOffset + 10);
  const directorySize = readUInt32(buffer, eocdOffset + 12);
  const directoryOffset = readUInt32(buffer, eocdOffset + 16);
  if (
    diskNumber !== 0 ||
    directoryDisk !== 0 ||
    diskEntries !== totalEntries ||
    totalEntries === 0 ||
    totalEntries > QUESTION_PACKAGE_LIMITS.maxEntries ||
    directoryOffset + directorySize > eocdOffset
  ) {
    throw new QuestionPackageParserError(
      "ZIP archive is split, ZIP64, empty, over the entry bound, or malformed.",
    );
  }

  const entries: ZipEntry[] = [];
  const names = new Set<string>();
  let cursor = directoryOffset;
  let totalUncompressedBytes = 0;
  for (let index = 0; index < totalEntries; index += 1) {
    if (readUInt32(buffer, cursor) !== 0x02014b50) {
      throw new QuestionPackageParserError("ZIP central directory is malformed.");
    }
    const flags = readUInt16(buffer, cursor + 8);
    const compressionMethod = readUInt16(buffer, cursor + 10);
    const compressedSize = readUInt32(buffer, cursor + 20);
    const uncompressedSize = readUInt32(buffer, cursor + 24);
    const nameLength = readUInt16(buffer, cursor + 28);
    const extraLength = readUInt16(buffer, cursor + 30);
    const commentLength = readUInt16(buffer, cursor + 32);
    const localHeaderOffset = readUInt32(buffer, cursor + 42);
    const entryEnd = cursor + 46 + nameLength + extraLength + commentLength;
    if (entryEnd > directoryOffset + directorySize) {
      throw new QuestionPackageParserError("ZIP central directory is truncated.");
    }
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength)
      .toString("utf8");
    assertSafeEntryName(name);
    if (names.has(name)) {
      throw new QuestionPackageParserError(`ZIP entry "${name}" is duplicated.`);
    }
    names.add(name);
    if ((flags & 0x1) !== 0) {
      throw new QuestionPackageParserError("Encrypted ZIP entries are not supported.");
    }
    if (compressionMethod !== 0 && compressionMethod !== 8) {
      throw new QuestionPackageParserError(
        `ZIP compression method ${compressionMethod} is not supported.`,
      );
    }
    if (
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      uncompressedSize > QUESTION_PACKAGE_LIMITS.maxEntryBytes
    ) {
      throw new QuestionPackageParserError("ZIP64 or oversized entries are not supported.");
    }
    totalUncompressedBytes += uncompressedSize;
    if (totalUncompressedBytes > QUESTION_PACKAGE_LIMITS.maxTotalUncompressedBytes) {
      throw new QuestionPackageParserError(
        "ZIP archive exceeds the total uncompressed-size bound.",
      );
    }
    entries.push({
      compressedSize,
      compressionMethod,
      flags,
      localHeaderOffset,
      name,
      uncompressedSize,
    });
    cursor = entryEnd;
  }
  if (cursor !== directoryOffset + directorySize) {
    throw new QuestionPackageParserError("ZIP central directory size is invalid.");
  }
  return entries;
}

function inflateEntry(buffer: Buffer, entry: ZipEntry): Buffer {
  if (readUInt32(buffer, entry.localHeaderOffset) !== 0x04034b50) {
    throw new QuestionPackageParserError(
      `ZIP local header for "${entry.name}" is malformed.`,
    );
  }
  const nameLength = readUInt16(buffer, entry.localHeaderOffset + 26);
  const extraLength = readUInt16(buffer, entry.localHeaderOffset + 28);
  const start = entry.localHeaderOffset + 30 + nameLength + extraLength;
  const end = start + entry.compressedSize;
  if (start < 0 || end > buffer.length) {
    throw new QuestionPackageParserError(
      `ZIP payload for "${entry.name}" is truncated.`,
    );
  }
  const compressed = buffer.subarray(start, end);
  let content: Buffer;
  try {
    content = entry.compressionMethod === 0 ?
      Buffer.from(compressed) :
      inflateRawSync(compressed, {maxOutputLength: entry.uncompressedSize});
  } catch {
    throw new QuestionPackageParserError(
      `ZIP payload for "${entry.name}" could not be decompressed safely.`,
    );
  }
  if (content.length !== entry.uncompressedSize) {
    throw new QuestionPackageParserError(
      `ZIP payload size for "${entry.name}" does not match its directory.`,
    );
  }
  return content;
}

function decodeXml(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function readAttribute(attributes: string, name: string): string | null {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(
    `(?:^|\\s)${escapedName}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`,
    "i",
  ).exec(attributes);
  return match ? decodeXml(match[1] ?? match[2] ?? "") : null;
}

function readTextNodes(xml: string): string {
  const values: string[] = [];
  const pattern = /<t\b[^>]*>([\s\S]*?)<\/t>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) !== null) {
    values.push(decodeXml((match[1] ?? "").replace(/<[^>]+>/g, "")));
  }
  return values.join("").trim();
}

function normalizeWorkbookPath(target: string): string {
  const trimmed = target.trim().replace(/^\/+/, "");
  const normalized = trimmed.startsWith("xl/") ? trimmed :
    `xl/${trimmed.replace(/^\.\//, "")}`;
  assertSafeEntryName(normalized);
  return normalized;
}

function getColumnLetters(cellReference: string): string {
  return /^([A-Z]+)/i.exec(cellReference.trim())?.[1]?.toUpperCase() ?? "";
}

function parseWorkbook(workbookBytes: Buffer): {
  rows: Array<Record<string, string>>;
  sheetNames: string[];
} {
  if (workbookBytes.length > QUESTION_PACKAGE_LIMITS.maxWorkbookBytes) {
    throw new QuestionPackageLimitError("questions.xlsx exceeds the workbook bound.");
  }
  const entries = parseZipDirectory(workbookBytes);
  const entryMap = new Map(entries.map((entry) => [entry.name, entry]));
  const workbookEntry = entryMap.get("xl/workbook.xml");
  const relationshipsEntry = entryMap.get("xl/_rels/workbook.xml.rels");
  if (!workbookEntry || !relationshipsEntry) {
    throw new QuestionPackageParserError(
      "questions.xlsx must contain workbook metadata.",
    );
  }
  const workbookXml = inflateEntry(workbookBytes, workbookEntry).toString("utf8");
  const relationshipsXml = inflateEntry(workbookBytes, relationshipsEntry)
    .toString("utf8");
  const relationshipPaths = new Map<string, string>();
  const relationshipPattern = /<Relationship\b([^>]*)\/?\s*>/gi;
  let relationshipMatch: RegExpExecArray | null;
  while ((relationshipMatch = relationshipPattern.exec(relationshipsXml)) !== null) {
    const id = readAttribute(relationshipMatch[1] ?? "", "Id");
    const target = readAttribute(relationshipMatch[1] ?? "", "Target");
    if (id && target) {
      relationshipPaths.set(id, normalizeWorkbookPath(target));
    }
  }

  const sheetNames: string[] = [];
  let questionsPath: string | null = null;
  const sheetPattern = /<sheet\b([^>]*)\/?\s*>/gi;
  let sheetMatch: RegExpExecArray | null;
  while ((sheetMatch = sheetPattern.exec(workbookXml)) !== null) {
    const attributes = sheetMatch[1] ?? "";
    const name = readAttribute(attributes, "name") ?? "";
    const relationshipId = readAttribute(attributes, "r:id");
    sheetNames.push(name);
    if (name === "questions" && relationshipId) {
      questionsPath = relationshipPaths.get(relationshipId) ?? null;
    }
  }
  if (!questionsPath) {
    throw new QuestionPackageParserError(
      "questions.xlsx must contain a sheet named \"questions\".",
    );
  }
  const questionsEntry = entryMap.get(questionsPath);
  if (!questionsEntry) {
    throw new QuestionPackageParserError(
      "The workbook questions sheet could not be loaded.",
    );
  }

  const sharedStrings: string[] = [];
  const sharedEntry = entryMap.get("xl/sharedStrings.xml");
  if (sharedEntry) {
    const sharedXml = inflateEntry(workbookBytes, sharedEntry).toString("utf8");
    const itemPattern = /<si\b[^>]*>([\s\S]*?)<\/si>/gi;
    let itemMatch: RegExpExecArray | null;
    while ((itemMatch = itemPattern.exec(sharedXml)) !== null) {
      sharedStrings.push(readTextNodes(itemMatch[1] ?? ""));
    }
  }

  const sheetXml = inflateEntry(workbookBytes, questionsEntry).toString("utf8");
  const rawRows: Array<Array<{column: string; value: string}>> = [];
  const rowPattern = /<row\b[^>]*>([\s\S]*?)<\/row>/gi;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowPattern.exec(sheetXml)) !== null) {
    const cells: Array<{column: string; value: string}> = [];
    const cellPattern = /<c\b([^>]*)>([\s\S]*?)<\/c>/gi;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellPattern.exec(rowMatch[1] ?? "")) !== null) {
      const attributes = cellMatch[1] ?? "";
      const body = cellMatch[2] ?? "";
      const cellType = readAttribute(attributes, "t");
      const column = getColumnLetters(readAttribute(attributes, "r") ?? "");
      const valueMatch = /<v\b[^>]*>([\s\S]*?)<\/v>/i.exec(body);
      let value = "";
      if (cellType === "inlineStr") {
        value = readTextNodes(body);
      } else if (valueMatch) {
        value = decodeXml((valueMatch[1] ?? "").replace(/<[^>]+>/g, "")).trim();
        if (cellType === "s") {
          const index = Number(value);
          value = Number.isInteger(index) ? sharedStrings[index] ?? "" : "";
        }
      }
      if (column) {
        cells.push({column, value});
      }
    }
    rawRows.push(cells);
    if (rawRows.length > QUESTION_PACKAGE_LIMITS.maxRows + 1) {
      throw new QuestionPackageLimitError(
        `questions.xlsx exceeds the ${QUESTION_PACKAGE_LIMITS.maxRows}-row bound.`,
      );
    }
  }
  if (rawRows.length === 0) {
    throw new QuestionPackageParserError("The questions sheet is empty.");
  }
  const headers = new Map(rawRows[0]?.map((cell) => [cell.column, cell.value]) ?? []);
  const rows = rawRows.slice(1).map((cells) => {
    const result: Record<string, string> = {};
    cells.forEach((cell) => {
      const header = headers.get(cell.column)?.trim();
      if (header) {
        result[header] = cell.value;
      }
    });
    return result;
  }).filter((row) => Object.values(row).some((value) => value.trim()));
  return {rows, sheetNames};
}

function normalizeColumnName(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function readColumn(row: Record<string, string>, name: string): string {
  const normalizedName = normalizeColumnName(name);
  const match = Object.entries(row).find(([key]) =>
    normalizeColumnName(key) === normalizedName);
  return (match?.[1] ?? "").trim();
}

function nullable(value: string): string | null {
  return value.trim() || null;
}

function assertMaximumLength(
  value: string | null,
  fieldName: string,
  maximumLength: number,
  errors: string[],
): void {
  if (value !== null && value.length > maximumLength) {
    errors.push(`${fieldName} must be at most ${maximumLength} characters.`);
  }
}

function parseNumber(value: string, fieldName: string, errors: string[]): number | null {
  if (!value) {
    errors.push(`${fieldName} is required.`);
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    errors.push(`${fieldName} must be a finite number.`);
    return null;
  }
  return parsed;
}

function parseVersion(value: string, errors: string[]): number | null {
  if (!value) {
    return 1;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    errors.push("Version must be a positive integer.");
    return null;
  }
  return parsed;
}

function parseLink(value: string, fieldName: string, errors: string[]): string | null {
  if (!value) {
    return null;
  }
  if (value.length > 2048) {
    errors.push(`${fieldName} must be at most 2048 characters.`);
    return null;
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("protocol");
    }
    return parsed.toString();
  } catch {
    errors.push(`${fieldName} must be an absolute HTTP(S) URL.`);
    return null;
  }
}

function assertAssetReference(
  fileName: string,
  fieldName: string,
  rootFiles: Map<string, ZipEntry>,
  errors: string[],
): void {
  if (!fileName) {
    errors.push(`${fieldName} is required.`);
    return;
  }
  if (fileName.length > 256) {
    errors.push(`${fieldName} must be at most 256 characters.`);
    return;
  }
  if (/^(?:https?:)?\/\//i.test(fileName) || /^data:/i.test(fileName)) {
    errors.push(`${fieldName} must reference a ZIP root asset, not a URL.`);
    return;
  }
  if (fileName.includes("/") || fileName.includes("\\")) {
    errors.push(`${fieldName} must be a ZIP root file name without folders.`);
    return;
  }
  if (!/\.(?:png|webp)$/i.test(fileName)) {
    errors.push(`${fieldName} must use a .png or .webp extension.`);
    return;
  }
  if (!rootFiles.has(fileName)) {
    errors.push(`${fieldName} "${fileName}" was not found at the ZIP root.`);
  }
}

function normalizeRow(
  row: Record<string, string>,
  rowNumber: number,
  rootFiles: Map<string, ZipEntry>,
): ParsedQuestionPackageRow {
  const errors: string[] = [];
  const warnings: string[] = [];
  const uniqueKey = nullable(readColumn(row, "UniqueKey"));
  const chapter = readColumn(row, "ChapterName");
  const difficultyValue = readColumn(row, "Difficulty").toLowerCase();
  const difficulty = difficultyValue === "easy" ? "Easy" :
    difficultyValue === "medium" ? "Medium" :
      difficultyValue === "hard" ? "Hard" : null;
  const questionType = readColumn(row, "QuestionType");
  const questionNo = readColumn(row, "QuestionNo");
  const questionImageFile = readColumn(row, "QuestionImageFile");
  const solutionImageFile = readColumn(row, "SolutionImageFile");
  const correctAnswer = readColumn(row, "CorrectAnswer").toUpperCase();
  const primaryTag = nullable(readColumn(row, "PrimaryTag"));
  const secondaryTag = nullable(readColumn(row, "SecondaryTag"));
  const additionalTag = nullable(readColumn(row, "AdditionalTag"));
  const academicYear = nullable(readColumn(row, "AcademicYear"));
  const internalNotes = nullable(readColumn(row, "InternalNotes"));
  const questionText = nullable(
    readColumn(row, "QuestionText") || readColumn(row, "QuestionPrompt"),
  );
  const topic = nullable(readColumn(row, "Topic"));

  if (!uniqueKey) errors.push("UniqueKey is required.");
  if (uniqueKey && !/[a-z0-9]/i.test(uniqueKey)) {
    errors.push("UniqueKey must contain at least one letter or number.");
  }
  if (!chapter) errors.push("ChapterName is required.");
  if (!difficulty) errors.push("Difficulty must be Easy, Medium, or Hard.");
  if (!questionType) errors.push("QuestionType is required.");
  if (!questionNo) errors.push("QuestionNo is required.");
  if (!correctAnswer) {
    errors.push("CorrectAnswer is required.");
  } else if (!/^[A-D](\s*,\s*[A-D])*$/i.test(correctAnswer)) {
    errors.push("CorrectAnswer must use A-D answer codes.");
  }
  if (!primaryTag) errors.push("PrimaryTag is required.");
  if (!secondaryTag) errors.push("SecondaryTag is required.");
  assertMaximumLength(uniqueKey, "UniqueKey", 160, errors);
  assertMaximumLength(chapter, "ChapterName", 256, errors);
  assertMaximumLength(questionType, "QuestionType", 128, errors);
  assertMaximumLength(questionNo, "QuestionNo", 64, errors);
  assertMaximumLength(correctAnswer, "CorrectAnswer", 64, errors);
  assertMaximumLength(primaryTag, "PrimaryTag", 512, errors);
  assertMaximumLength(secondaryTag, "SecondaryTag", 512, errors);
  assertMaximumLength(additionalTag, "AdditionalTag", 512, errors);
  assertMaximumLength(academicYear, "AcademicYear", 32, errors);
  assertMaximumLength(internalNotes, "InternalNotes", 2000, errors);
  assertMaximumLength(questionText, "QuestionText", 20_000, errors);
  assertMaximumLength(topic, "Topic", 512, errors);
  assertAssetReference(questionImageFile, "QuestionImageFile", rootFiles, errors);
  assertAssetReference(solutionImageFile, "SolutionImageFile", rootFiles, errors);

  const marks = parseNumber(readColumn(row, "Marks"), "Marks", errors);
  const negativeMarksValue = parseNumber(
    readColumn(row, "NegativeMarks"),
    "NegativeMarks",
    errors,
  );
  if (marks !== null && marks < 0) errors.push("Marks must be non-negative.");
  const negativeMarks = negativeMarksValue === null ? null :
    Math.abs(negativeMarksValue);
  const version = parseVersion(readColumn(row, "Version"), errors);

  return {
    academicYear,
    additionalTag,
    chapter,
    correctAnswer,
    difficulty,
    errors,
    internalNotes,
    marks,
    negativeMarks,
    primaryTag,
    questionImageFile,
    questionNo,
    questionText,
    questionType,
    rowNumber,
    secondaryTag,
    simulationLink: parseLink(
      readColumn(row, "SimulationLink"),
      "SimulationLink",
      errors,
    ),
    solutionImageFile,
    topic,
    tutorialVideoLink: parseLink(
      readColumn(row, "TutorialVideoLink"),
      "TutorialVideoLink",
      errors,
    ),
    uniqueKey,
    version,
    warnings,
  };
}

function validateAssetContent(fileName: string, bytes: Buffer): ParsedQuestionPackageAsset {
  if (bytes.length === 0 || bytes.length > QUESTION_PACKAGE_LIMITS.maxAssetBytes) {
    throw new QuestionPackageParserError(
      `Asset "${fileName}" is empty or exceeds the asset-size bound.`,
    );
  }
  const extension = fileName.toLowerCase().endsWith(".webp") ? "webp" : "png";
  const valid = extension === "png" ?
    bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE) :
    bytes.subarray(0, RIFF_SIGNATURE.length).equals(RIFF_SIGNATURE) &&
      bytes.subarray(8, 12).equals(WEBP_SIGNATURE);
  if (!valid) {
    throw new QuestionPackageParserError(
      `Asset "${fileName}" content does not match its extension.`,
    );
  }
  return {
    bytes,
    contentSha256: createHash("sha256").update(bytes).digest("hex"),
    extension,
    fileName,
  };
}

export function parseQuestionPackage(content: Buffer): ParsedQuestionPackage {
  if (
    content.length === 0 ||
    content.length > QUESTION_PACKAGE_LIMITS.maxArchiveBytes
  ) {
    throw new QuestionPackageParserError(
      "Question package is empty or exceeds the 12 MiB compressed-size bound.",
    );
  }
  const contentSha256 = createHash("sha256").update(content).digest("hex");
  const entries = parseZipDirectory(content);
  const globalErrors: string[] = [];
  const warnings: string[] = [];
  const files = entries.filter((entry) => !entry.name.endsWith("/"));
  const nested = files.filter((entry) =>
    entry.name.includes("/") || entry.name.includes("\\"));
  if (nested.length > 0) {
    globalErrors.push("Nested folders are not allowed inside the ZIP package.");
  }
  const rootFiles = new Map(files.filter((entry) =>
    !entry.name.includes("/") && !entry.name.includes("\\"))
    .map((entry) => [entry.name, entry]));
  const workbookEntry = rootFiles.get("questions.xlsx");
  if (!workbookEntry) {
    globalErrors.push("questions.xlsx is required at the ZIP root.");
    return {assets: new Map(), contentSha256, globalErrors, rows: [], warnings};
  }

  let workbook: ReturnType<typeof parseWorkbook>;
  try {
    workbook = parseWorkbook(inflateEntry(content, workbookEntry));
  } catch (error) {
    if (error instanceof QuestionPackageLimitError) {
      throw error;
    }
    globalErrors.push(error instanceof Error ? error.message :
      "questions.xlsx could not be parsed.");
    return {assets: new Map(), contentSha256, globalErrors, rows: [], warnings};
  }
  REQUIRED_SHEETS.forEach((sheet) => {
    if (!workbook.sheetNames.includes(sheet)) {
      globalErrors.push(`questions.xlsx is missing required sheet "${sheet}".`);
    }
  });
  const availableColumns = new Set(
    Object.keys(workbook.rows[0] ?? {}).map(normalizeColumnName),
  );
  REQUIRED_COLUMNS.forEach((column) => {
    if (!availableColumns.has(normalizeColumnName(column))) {
      globalErrors.push(`questions.xlsx is missing required column "${column}".`);
    }
  });
  if (workbook.rows.length === 0) {
    globalErrors.push("questions.xlsx contains no question rows.");
  }

  const rows = workbook.rows.map((row, index) =>
    normalizeRow(row, index + 2, rootFiles));
  const seenKeys = new Set<string>();
  rows.forEach((row) => {
    if (row.uniqueKey) {
      const key = row.uniqueKey.toLowerCase();
      if (seenKeys.has(key)) {
        row.errors.push("Duplicate UniqueKey within package.");
      }
      seenKeys.add(key);
    }
  });

  const referencedNames = new Set(rows.flatMap((row) => [
    row.questionImageFile,
    row.solutionImageFile,
  ]).filter(Boolean));
  const assets = new Map<string, ParsedQuestionPackageAsset>();
  referencedNames.forEach((fileName) => {
    const entry = rootFiles.get(fileName);
    if (!entry || !/\.(?:png|webp)$/i.test(fileName)) {
      return;
    }
    try {
      assets.set(fileName, validateAssetContent(fileName, inflateEntry(content, entry)));
    } catch (error) {
      const message = error instanceof Error ? error.message :
        `Asset "${fileName}" is invalid.`;
      rows.filter((row) =>
        row.questionImageFile === fileName || row.solutionImageFile === fileName)
        .forEach((row) => row.errors.push(message));
    }
  });
  const unusedAssets = Array.from(rootFiles.keys()).filter((name) =>
    /\.(?:png|webp)$/i.test(name) && !referencedNames.has(name));
  if (unusedAssets.length > 0) {
    warnings.push(`${unusedAssets.length} unreferenced image asset(s) were ignored.`);
  }
  return {assets, contentSha256, globalErrors, rows, warnings};
}
