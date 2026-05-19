import { useEffect, useState, type FormEvent } from "react";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { getPortalApiClient } from "../../../../../shared/services/portalIntegration";
import {
  UiForm,
  UiFormField,
  UiTable,
} from "../../../../../shared/ui/components";
import {
  EXAM_TYPES,
  type ExamType,
} from "./testTemplateFixtures";
import QuestionBankWorkspaceNav from "./QuestionBankWorkspaceNav";

const apiClient = getPortalApiClient("admin");
const EXAM_SUBJECTS: Record<ExamType, string[]> = {
  JEEMains: ["Physics", "Chemistry", "Mathematics"],
  NEET: ["Physics", "Chemistry", "Biology"],
};
const SAMPLE_EXAM_TYPES = [...EXAM_TYPES, "Other"] as const;
const SAMPLE_OTHER_SUBJECT = "No subject lock";

type UploadLogRecord = {
  id: string;
  uploadedBy: string;
  timestamp: string;
  totalRows: number;
  errors: number;
  warnings: number;
  versionCreated: number;
};

interface ZipEntryMetadata {
  compressedSize: number;
  compressionMethod: number;
  localHeaderOffset: number;
  name: string;
  uncompressedSize: number;
}

interface QuestionPackageValidationRow {
  errors: string[];
  rowNumber: number;
  uniqueKey: string;
}

interface QuestionUploadWorkbookRow {
  additionalTag: string;
  chapter: string;
  correctAnswer: string;
  difficulty: string;
  internalNotes: string;
  marks: number;
  negativeMarks: number;
  primaryTag: string;
  questionImageFile: string;
  questionNo: string;
  questionType: string;
  secondaryTag: string;
  simulationLink: string;
  solutionImageFile: string;
  topic: string;
  tutorialVideoLink: string;
  uniqueKey: string;
}

interface AdminQuestionsBulkRequestRow {
  chapter: string;
  correctAnswer: string;
  difficulty: "Easy" | "Medium" | "Hard";
  examType: ExamType;
  marks: number;
  negativeMarks: number;
  questionTextKeywords?: string[];
  questionType: string;
  simulationLink?: string | null;
  status: "active";
  subject: string;
  tags: string[];
  tutorialVideoLink?: string | null;
  uniqueKey: string;
  version: number;
}

interface AdminQuestionsBulkValidationResult {
  commitRequested: boolean;
  committed: boolean;
  rows: Array<{
    action: "create" | "update" | "none";
    errors: string[];
    questionId: string | null;
    rowNumber: number;
    uniqueKey: string | null;
    warnings: string[];
  }>;
  summary: {
    created: number;
    invalid: number;
    received: number;
    updated: number;
    valid: number;
    warnings: number;
  };
  uploadLogId: string | null;
  uploadLogPath: string | null;
}

type SampleExamType = (typeof SAMPLE_EXAM_TYPES)[number];

interface SampleWorkbookProfile {
  columns: string[];
  fileName: string;
  markingScheme: string;
  sampleRow: Record<string, string>;
  subjectLabel: string;
}

interface QuestionPackageValidationResult {
  archiveEntries: string[];
  errors: string[];
  imageAssetCount: number;
  nestedFolderEntries: string[];
  rowErrors: QuestionPackageValidationRow[];
  sheetNames: string[];
  serverValidation: AdminQuestionsBulkValidationResult | null;
  totalRows: number;
  warnings: string[];
  workbookRows: QuestionUploadWorkbookRow[];
}

interface DistributionPreviewBucket {
  count: number;
  label: string;
  marks: number;
  percent: number;
}

interface DistributionPreview {
  chapterBuckets: DistributionPreviewBucket[];
  difficultyBuckets: DistributionPreviewBucket[];
  marksBuckets: DistributionPreviewBucket[];
  totalMarks: number;
  totalRows: number;
  warnings: string[];
}

function formatIsoDate(value: string): string {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString().slice(0, 10);
}

function formatExamTypeLabel(value: SampleExamType): string {
  if (value === "JEEMains") {
    return "JEE Mains";
  }

  return value;
}

function toUint16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function toUint32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

function decodeBytes(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes);
}

function toArrayBuffer(bufferLike: ArrayBuffer | SharedArrayBuffer): ArrayBuffer {
  if (bufferLike instanceof ArrayBuffer) {
    return bufferLike;
  }

  return new Uint8Array(bufferLike).slice().buffer;
}

function toFiniteNumber(value: string, fallback: number): number {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

function encodeCsvCell(value: string): string {
  if (/[,"\n]/.test(value)) {
    return `"${value.replace(/"/g, "\"\"")}"`;
  }

  return value;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getExcelColumnName(columnIndex: number): string {
  let current = columnIndex + 1;
  let columnName = "";

  while (current > 0) {
    const remainder = (current - 1) % 26;
    columnName = String.fromCharCode(65 + remainder) + columnName;
    current = Math.floor((current - 1) / 26);
  }

  return columnName;
}

function buildWorksheetXml(rows: string[][]): string {
  const rowXml = rows
    .map((row, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const cellXml = row
        .map((value, columnIndex) => {
          const cellReference = `${getExcelColumnName(columnIndex)}${rowNumber}`;
          return `<c r="${cellReference}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
        })
        .join("");
      return `<row r="${rowNumber}">${cellXml}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowXml}</sheetData></worksheet>`;
}

function buildCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;

  bytes.forEach((byte) => {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  });

  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(output: number[], value: number): void {
  output.push(value & 0xff, (value >>> 8) & 0xff);
}

function writeUint32(output: number[], value: number): void {
  output.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function createStoredZip(files: Array<{ name: string; content: string }>): Uint8Array {
  const encoder = new TextEncoder();
  const output: number[] = [];
  const centralDirectory: number[] = [];

  files.forEach((file) => {
    const nameBytes = encoder.encode(file.name);
    const contentBytes = encoder.encode(file.content);
    const crc32 = buildCrc32(contentBytes);
    const localHeaderOffset = output.length;

    writeUint32(output, 0x04034b50);
    writeUint16(output, 20);
    writeUint16(output, 0);
    writeUint16(output, 0);
    writeUint16(output, 0);
    writeUint16(output, 0);
    writeUint32(output, crc32);
    writeUint32(output, contentBytes.length);
    writeUint32(output, contentBytes.length);
    writeUint16(output, nameBytes.length);
    writeUint16(output, 0);
    output.push(...nameBytes, ...contentBytes);

    writeUint32(centralDirectory, 0x02014b50);
    writeUint16(centralDirectory, 20);
    writeUint16(centralDirectory, 20);
    writeUint16(centralDirectory, 0);
    writeUint16(centralDirectory, 0);
    writeUint16(centralDirectory, 0);
    writeUint16(centralDirectory, 0);
    writeUint32(centralDirectory, crc32);
    writeUint32(centralDirectory, contentBytes.length);
    writeUint32(centralDirectory, contentBytes.length);
    writeUint16(centralDirectory, nameBytes.length);
    writeUint16(centralDirectory, 0);
    writeUint16(centralDirectory, 0);
    writeUint16(centralDirectory, 0);
    writeUint16(centralDirectory, 0);
    writeUint32(centralDirectory, 0);
    writeUint32(centralDirectory, localHeaderOffset);
    centralDirectory.push(...nameBytes);
  });

  const centralDirectoryOffset = output.length;
  output.push(...centralDirectory);
  writeUint32(output, 0x06054b50);
  writeUint16(output, 0);
  writeUint16(output, 0);
  writeUint16(output, files.length);
  writeUint16(output, files.length);
  writeUint32(output, centralDirectory.length);
  writeUint32(output, centralDirectoryOffset);
  writeUint16(output, 0);

  return new Uint8Array(output);
}

function getWorkbookRequiredColumns(): string[] {
  return [
    "UniqueKey",
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
}

function getSimplifiedSampleColumns(): string[] {
  return [
    ...getWorkbookRequiredColumns(),
    "Topic",
    "TutorialVideoLink",
    "SimulationLink",
    "AdditionalTag",
    "InternalNotes",
  ];
}

function getFullSampleColumns(): string[] {
  return [
    "Exam",
    "Subject",
    "Marks",
    "NegativeMarks",
    ...getSimplifiedSampleColumns(),
  ];
}

function buildSampleWorkbookProfile(examType: SampleExamType, subject: string): SampleWorkbookProfile {
  const simplified = examType !== "Other";
  const subjectLabel = simplified ? subject : SAMPLE_OTHER_SUBJECT;
  const columns = simplified ? getSimplifiedSampleColumns() : getFullSampleColumns();
  const baseRow: Record<string, string> = {
    AdditionalTag: "formula-application",
    ChapterName: examType === "NEET" && subject === "Biology" ? "Cell Structure" : "Kinematics",
    CorrectAnswer: "A",
    Difficulty: "Medium",
    InternalNotes: "Optional reviewer note",
    PrimaryTag: "conceptual",
    QuestionImageFile: "question-001.png",
    QuestionNo: "1",
    QuestionType: "single_correct",
    SecondaryTag: "moderate-time",
    SimulationLink: "",
    SolutionImageFile: "solution-001.png",
    Topic: examType === "NEET" && subject === "Biology" ? "Cell organelles" : "Projectile motion",
    TutorialVideoLink: "",
    UniqueKey: `${examType.toLowerCase()}-${subjectLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-001`,
  };

  if (!simplified) {
    baseRow.Exam = "Custom Exam";
    baseRow.Subject = "Custom Subject";
    baseRow.Marks = "4";
    baseRow.NegativeMarks = "-1";
  }

  return {
    columns,
    fileName: `question-bank-sample-${examType.toLowerCase()}-${subjectLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`,
    markingScheme: simplified ? "Auto-applied during upload: correct +4, incorrect -1" : "Provided per row using Marks and NegativeMarks",
    sampleRow: baseRow,
    subjectLabel,
  };
}

function buildSampleWorkbookXlsx(profile: SampleWorkbookProfile, examType: SampleExamType): Uint8Array {
  const questionRows = [
    profile.columns,
    profile.columns.map((columnName) => profile.sampleRow[columnName] ?? ""),
  ];
  const summaryRows = [
    ["Field", "Value"],
    ["Selected Exam", formatExamTypeLabel(examType)],
    ["Selected Subject", profile.subjectLabel],
    ["Marking Scheme", profile.markingScheme],
    ["Difficulty Definitions", "Easy = direct recall; Medium = standard application; Hard = multi-step or high discrimination"],
    ["ZIP Creation", "Place this workbook as questions.xlsx at ZIP root with referenced image files beside it."],
  ];
  const instructionRows = [
    ["Topic", "Instruction"],
    ["Required columns", getWorkbookRequiredColumns().join(", ")],
    ["Allowed Difficulty", "Easy, Medium, Hard"],
    ["QuestionType examples", "single_correct, multiple_correct, integer, numerical"],
    ["Image naming rules", "Use flat root-level file names such as question-001.png and solution-001.png. No folders or external URLs."],
    ["ZIP packaging steps", "Rename this workbook to questions.xlsx, add referenced images at ZIP root, then upload the flat ZIP package."],
    ["Common errors", "Missing UniqueKey, missing image file, invalid difficulty, nested folder, external image URL."],
  ];

  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    "</Types>";
  const rootRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    "</Relationships>";
  const workbook =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets><sheet name="questions" sheetId="1" r:id="rId1"/><sheet name="Exam Summary" sheetId="2" r:id="rId2"/><sheet name="INSTRUCTIONS" sheetId="3" r:id="rId3"/></sheets>' +
    "</workbook>";
  const workbookRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>' +
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>' +
    "</Relationships>";

  return createStoredZip([
    { name: "[Content_Types].xml", content: contentTypes },
    { name: "_rels/.rels", content: rootRels },
    { name: "xl/workbook.xml", content: workbook },
    { name: "xl/_rels/workbook.xml.rels", content: workbookRels },
    { name: "xl/worksheets/sheet1.xml", content: buildWorksheetXml(questionRows) },
    { name: "xl/worksheets/sheet2.xml", content: buildWorksheetXml(summaryRows) },
    { name: "xl/worksheets/sheet3.xml", content: buildWorksheetXml(instructionRows) },
  ]);
}

function normalizeColumnName(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function isExternalAssetReference(value: string): boolean {
  return /^(?:https?:)?\/\//i.test(value) || /^data:/i.test(value);
}

function getColumnLetters(cellReference: string): string {
  const match = /^([A-Z]+)/i.exec(cellReference.trim());
  return match?.[1]?.toUpperCase() ?? "";
}

function readXmlDocument(xmlContent: string): Document {
  return new DOMParser().parseFromString(xmlContent, "application/xml");
}

function readXmlText(node: Element | null): string {
  if (!node) {
    return "";
  }

  return Array.from(node.childNodes)
    .map((child) => child.textContent ?? "")
    .join("")
    .trim();
}

function shouldUseLiveApi(): boolean {
  const host = window.location.hostname.toLowerCase();
  return host !== "127.0.0.1" && host !== "localhost";
}

function decodeIdTokenClaims(idToken: string | null): Record<string, unknown> | null {
  if (!idToken) {
    return null;
  }

  const segments = idToken.split(".");
  if (segments.length !== 3) {
    return null;
  }

  try {
    const payloadSegment = segments[1].replace(/-/g, "+").replace(/_/g, "/");
    const paddedPayload = payloadSegment.padEnd(Math.ceil(payloadSegment.length / 4) * 4, "=");
    const payload = atob(paddedPayload);
    const claims = JSON.parse(payload);
    return claims && typeof claims === "object" ? (claims as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function normalizeWorkbookRow(row: Record<string, string>): QuestionUploadWorkbookRow {
  return {
    additionalTag: (row.AdditionalTag ?? "").trim(),
    chapter: (row.ChapterName ?? "").trim(),
    correctAnswer: (row.CorrectAnswer ?? "").trim(),
    difficulty: (row.Difficulty ?? "").trim(),
    internalNotes: (row.InternalNotes ?? "").trim(),
    marks: toFiniteNumber(row.Marks ?? "", 4),
    negativeMarks: toFiniteNumber(row.NegativeMarks ?? "", -1),
    primaryTag: (row.PrimaryTag ?? "").trim(),
    questionImageFile: (row.QuestionImageFile ?? "").trim(),
    questionNo: (row.QuestionNo ?? "").trim(),
    questionType: (row.QuestionType ?? "").trim(),
    secondaryTag: (row.SecondaryTag ?? "").trim(),
    simulationLink: (row.SimulationLink ?? "").trim(),
    solutionImageFile: (row.SolutionImageFile ?? "").trim(),
    topic: (row.Topic ?? "").trim(),
    tutorialVideoLink: (row.TutorialVideoLink ?? "").trim(),
    uniqueKey: (row.UniqueKey ?? "").trim(),
  };
}

function buildDistributionBuckets(
  rows: QuestionUploadWorkbookRow[],
  readLabel: (row: QuestionUploadWorkbookRow) => string,
): DistributionPreviewBucket[] {
  const buckets = new Map<string, { count: number; marks: number }>();
  const totalRows = rows.length;

  rows.forEach((row) => {
    const label = readLabel(row).trim() || "Missing";
    const current = buckets.get(label) ?? { count: 0, marks: 0 };
    current.count += 1;
    current.marks += row.marks;
    buckets.set(label, current);
  });

  return Array.from(buckets.entries())
    .map(([label, bucket]) => ({
      count: bucket.count,
      label,
      marks: bucket.marks,
      percent: totalRows > 0 ? (bucket.count / totalRows) * 100 : 0,
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function buildDistributionPreview(rows: QuestionUploadWorkbookRow[]): DistributionPreview {
  const difficultyBuckets = buildDistributionBuckets(rows, (row) => normalizeDifficultyForApi(row.difficulty));
  const chapterBuckets = buildDistributionBuckets(rows, (row) => row.chapter);
  const marksBuckets = buildDistributionBuckets(rows, (row) => `${row.marks} mark${row.marks === 1 ? "" : "s"}`);
  const totalMarks = rows.reduce((sum, row) => sum + row.marks, 0);
  const warnings: string[] = [];
  const expectedDifficulties = ["Easy", "Medium", "Hard"];
  const presentDifficulties = new Set(difficultyBuckets.map((bucket) => bucket.label));

  expectedDifficulties.forEach((difficulty) => {
    if (!presentDifficulties.has(difficulty)) {
      warnings.push(`${difficulty} questions are missing from this package.`);
    }
  });

  const dominantDifficulty = difficultyBuckets.find((bucket) => bucket.percent >= 70);
  if (dominantDifficulty) {
    warnings.push(`${dominantDifficulty.label} questions make up ${Math.round(dominantDifficulty.percent)}% of the package.`);
  }

  const dominantChapter = chapterBuckets.find((bucket) => bucket.percent >= 50);
  if (dominantChapter && rows.length > 1) {
    warnings.push(`${dominantChapter.label} covers ${Math.round(dominantChapter.percent)}% of rows; review chapter balance before import.`);
  }

  if (marksBuckets.length > 1) {
    warnings.push("Multiple marks values are present; confirm the marks balance before import.");
  }

  return {
    chapterBuckets,
    difficultyBuckets,
    marksBuckets,
    totalMarks,
    totalRows: rows.length,
    warnings,
  };
}

function normalizeDifficultyForApi(value: string): "Easy" | "Medium" | "Hard" {
  const normalized = value.trim().toLowerCase();
  if (normalized === "hard") {
    return "Hard";
  }
  if (normalized === "medium") {
    return "Medium";
  }
  return "Easy";
}

function buildTags(row: QuestionUploadWorkbookRow): string[] {
  return [row.primaryTag, row.secondaryTag, row.additionalTag]
    .map((value) => value.trim())
    .filter((value, index, values) => value.length > 0 && values.indexOf(value) === index);
}

function buildKeywordHints(row: QuestionUploadWorkbookRow): string[] {
  return [row.chapter, row.topic, row.questionType]
    .map((value) => value.trim())
    .filter((value, index, values) => value.length > 0 && values.indexOf(value) === index);
}

function normalizeQuestionsBulkResponse(payload: unknown): AdminQuestionsBulkValidationResult {
  if (!payload || typeof payload !== "object") {
    throw new Error("POST /admin/questions/bulk returned an invalid response.");
  }

  const response = payload as {
    data?: {
      committed?: unknown;
      commitRequested?: unknown;
      rows?: unknown;
      summary?: unknown;
      uploadLogId?: unknown;
      uploadLogPath?: unknown;
    };
  };
  const data = response.data;
  if (!data || typeof data !== "object") {
    throw new Error("POST /admin/questions/bulk did not include validation data.");
  }

  const rows = Array.isArray(data.rows) ? data.rows : [];
  const summary = data.summary && typeof data.summary === "object" ? data.summary as Record<string, unknown> : {};

  return {
    commitRequested: data.commitRequested === true,
    committed: data.committed === true,
    rows: rows.map((row, index) => {
      const record = row && typeof row === "object" ? row as Record<string, unknown> : {};
      return {
        action:
          record.action === "create" || record.action === "update" || record.action === "none" ?
            record.action :
            "none",
        errors: Array.isArray(record.errors) ? record.errors.filter((value): value is string => typeof value === "string") : [],
        questionId: typeof record.questionId === "string" ? record.questionId : null,
        rowNumber: typeof record.rowNumber === "number" ? record.rowNumber : index + 1,
        uniqueKey: typeof record.uniqueKey === "string" ? record.uniqueKey : null,
        warnings: Array.isArray(record.warnings) ? record.warnings.filter((value): value is string => typeof value === "string") : [],
      };
    }),
    summary: {
      created: typeof summary.created === "number" ? summary.created : 0,
      invalid: typeof summary.invalid === "number" ? summary.invalid : 0,
      received: typeof summary.received === "number" ? summary.received : 0,
      updated: typeof summary.updated === "number" ? summary.updated : 0,
      valid: typeof summary.valid === "number" ? summary.valid : 0,
      warnings: typeof summary.warnings === "number" ? summary.warnings : 0,
    },
    uploadLogId: typeof data.uploadLogId === "string" ? data.uploadLogId : null,
    uploadLogPath: typeof data.uploadLogPath === "string" ? data.uploadLogPath : null,
  };
}

async function validateQuestionsWithApi(input: {
  examType: ExamType;
  instituteId: string;
  subject: string;
  workbookRows: QuestionUploadWorkbookRow[];
}): Promise<AdminQuestionsBulkValidationResult> {
  const questions: AdminQuestionsBulkRequestRow[] = input.workbookRows.map((row) => ({
    chapter: row.chapter,
    correctAnswer: row.correctAnswer,
    difficulty: normalizeDifficultyForApi(row.difficulty),
    examType: input.examType,
    marks: row.marks,
    negativeMarks: Math.abs(row.negativeMarks),
    questionTextKeywords: buildKeywordHints(row),
    questionType: row.questionType,
    simulationLink: row.simulationLink || null,
    status: "active",
    subject: input.subject,
    tags: buildTags(row),
    tutorialVideoLink: row.tutorialVideoLink || null,
    uniqueKey: row.uniqueKey,
    version: 1,
  }));
  const response = await apiClient.post<unknown, { commit: boolean; instituteId: string; questions: AdminQuestionsBulkRequestRow[] }>(
    "/admin/questions/bulk",
    {
      body: {
        commit: false,
        instituteId: input.instituteId,
        questions,
      },
    },
  );

  return normalizeQuestionsBulkResponse(response);
}

function normalizeWorkbookPath(target: string): string {
  const trimmed = target.trim();
  if (trimmed.startsWith("/")) {
    return trimmed.slice(1);
  }

  if (trimmed.startsWith("xl/")) {
    return trimmed;
  }

  return `xl/${trimmed.replace(/^\.\//, "")}`;
}

function parseZipEntries(buffer: ArrayBuffer): ZipEntryMetadata[] {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const eocdSignature = 0x06054b50;
  const centralDirectorySignature = 0x02014b50;
  const eocdSearchStart = Math.max(0, bytes.length - 22 - 65535);
  let eocdOffset = -1;

  for (let offset = bytes.length - 22; offset >= eocdSearchStart; offset -= 1) {
    if (view.getUint32(offset, true) === eocdSignature) {
      eocdOffset = offset;
      break;
    }
  }

  if (eocdOffset === -1) {
    throw new Error("ZIP end-of-central-directory record was not found.");
  }

  const totalEntries = toUint16(view, eocdOffset + 10);
  let directoryOffset = toUint32(view, eocdOffset + 16);
  const entries: ZipEntryMetadata[] = [];

  for (let index = 0; index < totalEntries; index += 1) {
    if (view.getUint32(directoryOffset, true) !== centralDirectorySignature) {
      throw new Error("ZIP central directory is malformed.");
    }

    const compressionMethod = toUint16(view, directoryOffset + 10);
    const compressedSize = toUint32(view, directoryOffset + 20);
    const uncompressedSize = toUint32(view, directoryOffset + 24);
    const fileNameLength = toUint16(view, directoryOffset + 28);
    const extraLength = toUint16(view, directoryOffset + 30);
    const commentLength = toUint16(view, directoryOffset + 32);
    const localHeaderOffset = toUint32(view, directoryOffset + 42);
    const nameStart = directoryOffset + 46;
    const nameBytes = bytes.slice(nameStart, nameStart + fileNameLength);

    entries.push({
      compressedSize,
      compressionMethod,
      localHeaderOffset,
      name: decodeBytes(nameBytes),
      uncompressedSize,
    });

    directoryOffset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

async function inflateZipEntry(buffer: ArrayBuffer, entry: ZipEntryMetadata): Promise<Uint8Array> {
  const view = new DataView(buffer);
  const localHeaderSignature = 0x04034b50;

  if (view.getUint32(entry.localHeaderOffset, true) !== localHeaderSignature) {
    throw new Error(`ZIP local header for ${entry.name} is malformed.`);
  }

  const fileNameLength = toUint16(view, entry.localHeaderOffset + 26);
  const extraLength = toUint16(view, entry.localHeaderOffset + 28);
  const compressedStart = entry.localHeaderOffset + 30 + fileNameLength + extraLength;
  const compressedBytes = new Uint8Array(buffer.slice(compressedStart, compressedStart + entry.compressedSize));

  if (entry.compressionMethod === 0) {
    return compressedBytes;
  }

  if (entry.compressionMethod !== 8) {
    throw new Error(`ZIP compression method ${entry.compressionMethod} is not supported for ${entry.name}.`);
  }

  const decompressed = await new Response(
    new Blob([compressedBytes]).stream().pipeThrough(new DecompressionStream("deflate-raw")),
  ).arrayBuffer();

  return new Uint8Array(decompressed);
}

async function readZipEntryText(buffer: ArrayBuffer, entry: ZipEntryMetadata): Promise<string> {
  const bytes = await inflateZipEntry(buffer, entry);
  return decodeBytes(bytes);
}

function readSpreadsheetCell(
  cell: Element,
  sharedStrings: string[],
): string {
  const cellType = cell.getAttribute("t");
  const valueNode = cell.querySelector("v");

  if (cellType === "inlineStr") {
    return readXmlText(cell.querySelector("is"));
  }

  if (!valueNode) {
    return "";
  }

  const value = readXmlText(valueNode);

  if (cellType === "s") {
    const sharedIndex = Number(value);
    return Number.isFinite(sharedIndex) ? (sharedStrings[sharedIndex] ?? "") : "";
  }

  return value;
}

async function parseWorkbookQuestionsSheet(xlsxBytes: Uint8Array): Promise<{
  rows: Array<Record<string, string>>;
  sheetNames: string[];
}> {
  const workbookBuffer = toArrayBuffer(xlsxBytes.buffer).slice(
    xlsxBytes.byteOffset,
    xlsxBytes.byteOffset + xlsxBytes.byteLength,
  );
  const workbookEntries = parseZipEntries(workbookBuffer);
  const entryMap = new Map(workbookEntries.map((entry) => [entry.name, entry]));
  const workbookEntry = entryMap.get("xl/workbook.xml");
  const relsEntry = entryMap.get("xl/_rels/workbook.xml.rels");

  if (!workbookEntry || !relsEntry) {
    throw new Error("questions.xlsx must contain workbook metadata.");
  }

  const workbookXml = readXmlDocument(await readZipEntryText(workbookBuffer, workbookEntry));
  const relsXml = readXmlDocument(await readZipEntryText(workbookBuffer, relsEntry));
  const relationshipMap = new Map<string, string>();

  Array.from(relsXml.getElementsByTagName("Relationship")).forEach((relationship) => {
    const relationshipId = relationship.getAttribute("Id");
    const target = relationship.getAttribute("Target");
    if (relationshipId && target) {
      relationshipMap.set(relationshipId, normalizeWorkbookPath(target));
    }
  });

  const sheetNames: string[] = [];
  let questionsSheetPath: string | null = null;

  Array.from(workbookXml.getElementsByTagName("sheet")).forEach((sheet) => {
    const name = sheet.getAttribute("name") ?? "";
    const relationshipId =
      sheet.getAttribute("r:id") ??
      sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    sheetNames.push(name);

    if (name === "questions" && relationshipId) {
      questionsSheetPath = relationshipMap.get(relationshipId) ?? null;
    }
  });

  if (!questionsSheetPath) {
    throw new Error("questions.xlsx must contain a sheet named \"questions\".");
  }

  const questionsSheetEntry = entryMap.get(questionsSheetPath);
  if (!questionsSheetEntry) {
    throw new Error("The workbook questions sheet could not be loaded from questions.xlsx.");
  }

  const sharedStringsEntry = entryMap.get("xl/sharedStrings.xml");
  const sharedStrings =
    sharedStringsEntry ?
      Array.from(
        readXmlDocument(await readZipEntryText(workbookBuffer, sharedStringsEntry)).getElementsByTagName("si"),
      ).map((item) => readXmlText(item)) :
      [];

  const sheetXml = readXmlDocument(await readZipEntryText(workbookBuffer, questionsSheetEntry));
  const rowNodes = Array.from(sheetXml.getElementsByTagName("row"));

  if (rowNodes.length === 0) {
    throw new Error("The questions sheet is empty.");
  }

  const headerMap = new Map<string, string>();
  const headerRow = rowNodes[0];
  Array.from(headerRow?.getElementsByTagName("c") ?? []).forEach((cell) => {
    const columnLetters = getColumnLetters(cell.getAttribute("r") ?? "");
    const headerValue = readSpreadsheetCell(cell, sharedStrings);
    if (columnLetters && headerValue) {
      headerMap.set(columnLetters, headerValue.trim());
    }
  });

  const rows = rowNodes.slice(1).map((rowNode) => {
    const rowRecord: Record<string, string> = {};

    Array.from(rowNode.getElementsByTagName("c")).forEach((cell) => {
      const columnLetters = getColumnLetters(cell.getAttribute("r") ?? "");
      const header = headerMap.get(columnLetters);
      if (!header) {
        return;
      }

      rowRecord[header] = readSpreadsheetCell(cell, sharedStrings);
    });

    return rowRecord;
  }).filter((row) => Object.values(row).some((value) => value.trim().length > 0));

  return {
    rows,
    sheetNames,
  };
}

async function validateQuestionPackage(
  zipFile: File,
): Promise<QuestionPackageValidationResult> {
  const archiveBuffer = await zipFile.arrayBuffer();
  const parsedEntries = parseZipEntries(archiveBuffer);
  const archiveEntries = parsedEntries
    .map((entry) => entry.name)
    .filter((entryName) => !entryName.endsWith("/"));
  const nestedFolderEntries = archiveEntries.filter((entryName) => entryName.includes("/") || entryName.includes("\\"));
  const errors: string[] = [];
  const warnings: string[] = [];
  const rootAssetEntries = archiveEntries.filter((entryName) => entryName !== "questions.xlsx");
  const rootAssetNames = new Set(rootAssetEntries);

  if (nestedFolderEntries.length > 0) {
    errors.push("Nested folders are not allowed inside the ZIP package.");
  }

  const workbookEntry = parsedEntries.find((entry) => entry.name === "questions.xlsx");
  if (!workbookEntry) {
    errors.push("questions.xlsx is required at the ZIP root.");
    return {
      archiveEntries,
      errors,
      imageAssetCount: rootAssetEntries.length,
      nestedFolderEntries,
      rowErrors: [],
      serverValidation: null,
      sheetNames: [],
      totalRows: 0,
      warnings,
      workbookRows: [],
    };
  }

  const workbookBytes = await inflateZipEntry(archiveBuffer, workbookEntry);
  const workbook = await parseWorkbookQuestionsSheet(workbookBytes);
  const requiredSheets = ["questions", "Exam Summary", "INSTRUCTIONS"];

  requiredSheets.forEach((sheetName) => {
    if (!workbook.sheetNames.includes(sheetName)) {
      errors.push(`questions.xlsx is missing the required sheet "${sheetName}".`);
    }
  });

  const rows = workbook.rows;
  const workbookRows = rows.map(normalizeWorkbookRow);
  const normalizedHeaders = new Set(
    Object.keys(rows[0] ?? {}).map((header) => normalizeColumnName(header)),
  );

  getWorkbookRequiredColumns().forEach((columnName) => {
    if (!normalizedHeaders.has(normalizeColumnName(columnName))) {
      errors.push(`questions.xlsx is missing required column "${columnName}".`);
    }
  });

  const validDifficultyValues = new Set(["easy", "medium", "hard"]);
  const answerPattern = /^[A-D](\s*,\s*[A-D])*$/i;
  const rowErrors: QuestionPackageValidationRow[] = rows.flatMap((row, index) => {
    const currentErrors: string[] = [];
    const uniqueKey = (row.UniqueKey ?? "").trim();
    const chapterName = (row.ChapterName ?? "").trim();
    const difficulty = (row.Difficulty ?? "").trim().toLowerCase();
    const questionType = (row.QuestionType ?? "").trim();
    const questionNo = (row.QuestionNo ?? "").trim();
    const questionImageFile = (row.QuestionImageFile ?? "").trim();
    const solutionImageFile = (row.SolutionImageFile ?? "").trim();
    const correctAnswer = (row.CorrectAnswer ?? "").trim();
    const primaryTag = (row.PrimaryTag ?? "").trim();
    const secondaryTag = (row.SecondaryTag ?? "").trim();

    if (!uniqueKey) {
      currentErrors.push("UniqueKey is required.");
    }
    if (!chapterName) {
      currentErrors.push("ChapterName is required.");
    }
    if (!difficulty) {
      currentErrors.push("Difficulty is required.");
    } else if (!validDifficultyValues.has(difficulty)) {
      currentErrors.push("Difficulty must be Easy, Medium, or Hard.");
    }
    if (!questionType) {
      currentErrors.push("QuestionType is required.");
    }
    if (!questionNo) {
      currentErrors.push("QuestionNo is required.");
    }
    if (!questionImageFile) {
      currentErrors.push("QuestionImageFile is required.");
    } else {
      if (isExternalAssetReference(questionImageFile)) {
        currentErrors.push("QuestionImageFile must reference a ZIP asset file name, not an external URL.");
      } else if (questionImageFile.includes("/") || questionImageFile.includes("\\")) {
        currentErrors.push("QuestionImageFile must reference a ZIP root file name without folders.");
      } else if (!rootAssetNames.has(questionImageFile)) {
        currentErrors.push(`QuestionImageFile "${questionImageFile}" was not found at the ZIP root.`);
      }
    }
    if (!solutionImageFile) {
      currentErrors.push("SolutionImageFile is required.");
    } else {
      if (isExternalAssetReference(solutionImageFile)) {
        currentErrors.push("SolutionImageFile must reference a ZIP asset file name, not an external URL.");
      } else if (solutionImageFile.includes("/") || solutionImageFile.includes("\\")) {
        currentErrors.push("SolutionImageFile must reference a ZIP root file name without folders.");
      } else if (!rootAssetNames.has(solutionImageFile)) {
        currentErrors.push(`SolutionImageFile "${solutionImageFile}" was not found at the ZIP root.`);
      }
    }
    if (!correctAnswer) {
      currentErrors.push("CorrectAnswer is required.");
    } else if (!answerPattern.test(correctAnswer)) {
      currentErrors.push("CorrectAnswer must use A-D answer codes.");
    }
    if (!primaryTag) {
      currentErrors.push("PrimaryTag is required.");
    }
    if (!secondaryTag) {
      currentErrors.push("SecondaryTag is required.");
    }

    return currentErrors.length > 0 ? [{
      errors: currentErrors,
      rowNumber: index + 2,
      uniqueKey,
    }] : [];
  });

  if (rows.length === 0) {
    warnings.push("questions.xlsx contains no question rows.");
  }

  return {
    archiveEntries,
    errors,
    imageAssetCount: rootAssetEntries.length,
    nestedFolderEntries,
    rowErrors,
    sheetNames: workbook.sheetNames,
    serverValidation: null,
    totalRows: rows.length,
    warnings,
    workbookRows,
  };
}

function QuestionBankManagementPage() {
  const { session } = useAuthProvider();
  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null);
  const [uploadExamType, setUploadExamType] = useState<ExamType>("JEEMains");
  const [uploadSubject, setUploadSubject] = useState<string>(EXAM_SUBJECTS.JEEMains[0]);
  const [sampleExamType, setSampleExamType] = useState<SampleExamType>("JEEMains");
  const [sampleSubject, setSampleSubject] = useState<string>(EXAM_SUBJECTS.JEEMains[0]);
  const [uploadLogs, setUploadLogs] = useState<UploadLogRecord[]>([]);
  const [uploadValidation, setUploadValidation] = useState<QuestionPackageValidationResult | null>(null);
  const [isValidatingUpload, setIsValidatingUpload] = useState(false);
  const [inlineMessage, setInlineMessage] = useState(
    "Upload Package now runs as its own workspace with navigation back to the other Question Bank routes.",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const nextSubject = EXAM_SUBJECTS[uploadExamType][0];
    setUploadSubject((current) => (EXAM_SUBJECTS[uploadExamType].includes(current) ? current : nextSubject));
  }, [uploadExamType]);

  useEffect(() => {
    if (sampleExamType === "Other") {
      setSampleSubject(SAMPLE_OTHER_SUBJECT);
      return;
    }

    const nextSubject = EXAM_SUBJECTS[sampleExamType][0];
    setSampleSubject((current) => (EXAM_SUBJECTS[sampleExamType].includes(current) ? current : nextSubject));
  }, [sampleExamType]);

  const sampleWorkbookProfile = buildSampleWorkbookProfile(sampleExamType, sampleSubject);

  async function handleUploadSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedUploadFile) {
      setErrorMessage("Select a ZIP package before validation/upload.");
      return;
    }

    setIsValidatingUpload(true);
    setUploadValidation(null);
    setErrorMessage(null);

    try {
      const validation = await validateQuestionPackage(selectedUploadFile);
      const hasLocalErrors = validation.errors.length > 0 || validation.rowErrors.length > 0;
      let serverValidation: AdminQuestionsBulkValidationResult | null = null;
      const claims = decodeIdTokenClaims(session.idToken);

      if (!hasLocalErrors && shouldUseLiveApi()) {
        const instituteId =
          typeof claims?.instituteId === "string" && claims.instituteId.trim().length > 0 ?
            claims.instituteId :
            "inst-build-125";
        serverValidation = await validateQuestionsWithApi({
          examType: uploadExamType,
          instituteId,
          subject: uploadSubject,
          workbookRows: validation.workbookRows,
        });
      }

      const finalValidation: QuestionPackageValidationResult = {
        ...validation,
        serverValidation,
      };
      setUploadValidation(finalValidation);
      const actorEmail =
        session.user?.email ??
        (typeof claims?.sub === "string" ? claims.sub : "admin@parabolic.local");

      const nextLog: UploadLogRecord = {
        errors:
          validation.errors.length +
          validation.rowErrors.length +
          (serverValidation?.summary.invalid ?? 0),
        id: `upl-${Date.now()}`,
        timestamp: new Date().toISOString(),
        totalRows: finalValidation.totalRows,
        uploadedBy: actorEmail,
        versionCreated: serverValidation?.summary.updated ?? 0,
        warnings: validation.warnings.length + (serverValidation?.summary.warnings ?? 0),
      };

      setUploadLogs((current) => [nextLog, ...current]);
      setInlineMessage(
        validation.errors.length > 0 || validation.rowErrors.length > 0 ?
          `Validated ${selectedUploadFile.name}. Package-level issues: ${validation.errors.length}; row-level issues: ${validation.rowErrors.length}. Download the CSV to resolve before any import.` :
        serverValidation ?
          `Validated ${selectedUploadFile.name}. Local ZIP checks passed, then live validate-only ingestion checked ${serverValidation.summary.received} rows with ${serverValidation.summary.invalid} invalid rows.` :
          `Validated ${selectedUploadFile.name}. Workbook image references matched ${validation.imageAssetCount} ZIP root assets with no external URLs.`,
      );
      setSelectedUploadFile(null);
    } catch (error) {
      setUploadValidation(null);
      setErrorMessage(error instanceof Error ? error.message : "Question package validation failed.");
      return;
    } finally {
      setIsValidatingUpload(false);
    }
  }

  function downloadRowErrorsCsv() {
    if (!uploadValidation || uploadValidation.rowErrors.length === 0) {
      return;
    }

    const lines = [
      "RowNumber,UniqueKey,Errors",
      ...uploadValidation.rowErrors.map((row) =>
        [
          String(row.rowNumber),
          encodeCsvCell(row.uniqueKey),
          encodeCsvCell(row.errors.join(" | ")),
        ].join(","),
      ),
    ];
    const csvBlob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const downloadUrl = URL.createObjectURL(csvBlob);
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = "question-upload-validation-errors.csv";
    anchor.click();
    URL.revokeObjectURL(downloadUrl);
  }

  function downloadSampleWorkbookCsv() {
    const lines = [
      sampleWorkbookProfile.columns.join(","),
      sampleWorkbookProfile.columns.map((columnName) => encodeCsvCell(sampleWorkbookProfile.sampleRow[columnName] ?? "")).join(","),
    ];
    const csvBlob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const downloadUrl = URL.createObjectURL(csvBlob);
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = sampleWorkbookProfile.fileName;
    anchor.click();
    URL.revokeObjectURL(downloadUrl);
    setInlineMessage(
      `Downloaded ${formatExamTypeLabel(sampleExamType)} sample schema for ${sampleWorkbookProfile.subjectLabel}. ${sampleWorkbookProfile.markingScheme}.`,
    );
  }

  function downloadSampleWorkbookXlsx() {
    const xlsxBytes = buildSampleWorkbookXlsx(sampleWorkbookProfile, sampleExamType);
    const xlsxBuffer = toArrayBuffer(xlsxBytes.buffer).slice(
      xlsxBytes.byteOffset,
      xlsxBytes.byteOffset + xlsxBytes.byteLength,
    );
    const xlsxBlob = new Blob([xlsxBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const downloadUrl = URL.createObjectURL(xlsxBlob);
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = sampleWorkbookProfile.fileName.replace(/\.csv$/, ".xlsx");
    anchor.click();
    URL.revokeObjectURL(downloadUrl);
    setInlineMessage(
      `Downloaded workbook sample with questions, Exam Summary, and INSTRUCTIONS sheets for ${formatExamTypeLabel(sampleExamType)}.`,
    );
  }

  function renderDistributionPreview(validation: QuestionPackageValidationResult) {
    const preview = buildDistributionPreview(validation.workbookRows);

    return (
      <div className="admin-question-validation-block">
        <h3>Pre-Import Distribution Preview</h3>
        <div className="admin-question-validation-grid">
          <article className="admin-question-validation-card">
            <h3>{preview.totalRows}</h3>
            <p>Rows included in the distribution preview.</p>
          </article>
          <article className="admin-question-validation-card">
            <h3>{preview.totalMarks}</h3>
            <p>Total marks represented by this upload package.</p>
          </article>
          <article className="admin-question-validation-card">
            <h3>{preview.warnings.length}</h3>
            <p>Balance warnings to review before import confirmation.</p>
          </article>
        </div>
        {preview.warnings.length > 0 ? (
          <ul className="admin-question-validation-list">
            {preview.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : (
          <p className="admin-tests-inline-note">No difficulty, chapter, or marks imbalance warnings were detected.</p>
        )}
        <UiTable
          caption="Difficulty distribution preview"
          columns={[
            { id: "difficulty", header: "Difficulty", render: (bucket) => bucket.label },
            { id: "count", header: "Rows", render: (bucket) => bucket.count },
            { id: "percent", header: "Share", render: (bucket) => `${bucket.percent.toFixed(1)}%` },
            { id: "marks", header: "Marks", render: (bucket) => bucket.marks },
          ]}
          rows={preview.difficultyBuckets}
          rowKey={(bucket) => bucket.label}
          emptyStateText="No difficulty rows are available for preview."
        />
        <UiTable
          caption="Chapter balance preview"
          columns={[
            { id: "chapter", header: "Chapter", render: (bucket) => bucket.label },
            { id: "count", header: "Rows", render: (bucket) => bucket.count },
            { id: "percent", header: "Share", render: (bucket) => `${bucket.percent.toFixed(1)}%` },
            { id: "marks", header: "Marks", render: (bucket) => bucket.marks },
          ]}
          rows={preview.chapterBuckets}
          rowKey={(bucket) => bucket.label}
          emptyStateText="No chapter rows are available for preview."
        />
        <UiTable
          caption="Marks balance preview"
          columns={[
            { id: "marks", header: "Marks Bucket", render: (bucket) => bucket.label },
            { id: "count", header: "Rows", render: (bucket) => bucket.count },
            { id: "percent", header: "Share", render: (bucket) => `${bucket.percent.toFixed(1)}%` },
            { id: "totalMarks", header: "Total Marks", render: (bucket) => bucket.marks },
          ]}
          rows={preview.marksBuckets}
          rowKey={(bucket) => bucket.label}
          emptyStateText="No marks rows are available for preview."
        />
      </div>
    );
  }

  function clearUploadValidation() {
    setSelectedUploadFile(null);
    setUploadValidation(null);
    setErrorMessage(null);
    setInlineMessage("Upload Package now runs as its own workspace with navigation back to the other Question Bank routes.");
  }

  return (
    <section className="admin-content-card" aria-labelledby="admin-question-bank-title">
      <p className="admin-content-eyebrow">Question Bank Upload</p>
      <h2 id="admin-question-bank-title">Dedicated Upload Package Workspace</h2>
      <p className="admin-content-copy">
        This route keeps <code>/admin/question-bank/upload-package</code> focused on ZIP intake, workbook validation,
        and import preparation instead of mixing upload controls with library, tags, or archive workflows.
      </p>

      <QuestionBankWorkspaceNav />

      <p className="admin-tests-inline-note">{inlineMessage}</p>
      {errorMessage ? <p className="admin-tests-inline-error">{errorMessage}</p> : null}

      <div className="admin-analytics-kpi-grid">
        <article className="admin-analytics-kpi-card">
          <p>Required Sheets</p>
          <h3>3</h3>
          <small>questions, Exam Summary, INSTRUCTIONS</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Required Root File</p>
          <h3>questions.xlsx</h3>
          <small>must live at ZIP root</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Nested Folders</p>
          <h3>Blocked</h3>
          <small>flat ZIP packages only</small>
        </article>
        <article className="admin-analytics-kpi-card">
          <p>Commit Mode</p>
          <h3>Atomic</h3>
          <small>no partial import after validation</small>
        </article>
      </div>

      <div className="admin-analytics-compliance-panel">
        <article className="admin-risk-summary-card">
          <h4>Upload Scope</h4>
          <p>This workspace is now intentionally limited to upload and validation. Tag governance, archive controls, and library operations live in their own dedicated routes.</p>
          <small>Prevents cross-workflow confusion.</small>
        </article>
        <article className="admin-risk-summary-card">
          <h4>Validation Guarantees</h4>
          <p>ZIP inspection rejects nested folders, checks workbook sheets and required columns, validates image references, and produces row-level CSV errors before any import step.</p>
          <small>No partial commit path is exposed here.</small>
        </article>
      </div>

      <section className="admin-question-validation-shell" aria-label="Exam-aware sample download wizard">
        <div className="admin-student-bulk-review-header">
          <div>
            <h3>Download Sample Wizard</h3>
            <p>
              Choose the exam context first. JEE Mains and NEET samples omit Exam, Subject, Marks, and NegativeMarks
              because the upload flow applies the fixed marking scheme from this selection.
            </p>
          </div>
          <div className="admin-student-bulk-actions">
            <button type="button" onClick={downloadSampleWorkbookCsv}>
              Download CSV
            </button>
            <button type="button" onClick={downloadSampleWorkbookXlsx}>
              Download Workbook
            </button>
          </div>
        </div>
        <div className="admin-student-bulk-stage-row" aria-label="Sample download wizard steps">
          <article className="admin-student-bulk-stage admin-student-bulk-stage-active">
            <span>1</span>
            <strong>Choose Exam Type</strong>
          </article>
          <article className={`admin-student-bulk-stage ${sampleExamType === "Other" ? "" : "admin-student-bulk-stage-active"}`}>
            <span>2</span>
            <strong>{sampleExamType === "Other" ? "No Subject Lock" : "Choose Subject"}</strong>
          </article>
          <article className="admin-student-bulk-stage admin-student-bulk-stage-complete">
            <span>3</span>
            <strong>Download Sample</strong>
          </article>
        </div>
        <div className="admin-student-grid">
          <UiForm
            title="Sample Context"
            description="Generate the sample schema from the same exam context admins will use during upload validation."
            submitLabel="Download Workbook"
            onSubmit={(event) => {
              event.preventDefault();
              downloadSampleWorkbookXlsx();
            }}
            footer={<span className="admin-tests-form-footnote">{sampleWorkbookProfile.markingScheme}</span>}
          >
            <UiFormField label="Exam Type" htmlFor="admin-question-sample-exam-type">
              <select
                id="admin-question-sample-exam-type"
                value={sampleExamType}
                onChange={(event) => setSampleExamType(event.target.value as SampleExamType)}
              >
                {SAMPLE_EXAM_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {formatExamTypeLabel(type)}
                  </option>
                ))}
              </select>
            </UiFormField>
            {sampleExamType === "Other" ? (
              <UiFormField label="Subject" htmlFor="admin-question-sample-subject-unlocked" helper="Other exam samples include Subject as a workbook column.">
                <input id="admin-question-sample-subject-unlocked" type="text" value={SAMPLE_OTHER_SUBJECT} readOnly />
              </UiFormField>
            ) : (
              <UiFormField label="Subject" htmlFor="admin-question-sample-subject">
                <select
                  id="admin-question-sample-subject"
                  value={sampleSubject}
                  onChange={(event) => setSampleSubject(event.target.value)}
                >
                  {EXAM_SUBJECTS[sampleExamType].map((subject) => (
                    <option key={subject} value={subject}>
                      {subject}
                    </option>
                  ))}
                </select>
              </UiFormField>
            )}
          </UiForm>
          <article className="admin-question-validation-card">
            <h3>Sample Preview</h3>
            <p>{formatExamTypeLabel(sampleExamType)} · {sampleWorkbookProfile.subjectLabel}</p>
            <p>{sampleWorkbookProfile.columns.length} columns generated for this sample.</p>
            <small>{sampleWorkbookProfile.fileName.replace(/\.csv$/, ".xlsx")} includes questions, Exam Summary, and INSTRUCTIONS sheets.</small>
          </article>
        </div>
        <UiTable
          caption="Sample workbook columns"
          columns={[
            { id: "column", header: "Column", render: (columnName) => columnName },
            {
              id: "treatment",
              header: "Treatment",
              render: (columnName) =>
                getWorkbookRequiredColumns().includes(columnName) ||
                (sampleExamType === "Other" && ["Exam", "Subject", "Marks", "NegativeMarks"].includes(columnName)) ?
                  "Required" :
                  "Optional",
            },
          ]}
          rows={sampleWorkbookProfile.columns}
          rowKey={(columnName) => columnName}
          emptyStateText="Choose an exam type to preview sample columns."
        />
      </section>

      <UiForm
        title="Upload Question Package"
        description="ZIP upload now validates root packaging, workbook sheets, workbook image references, and row-level schema errors before any import can proceed. Live mode also runs validate-only backend ingestion checks."
        submitLabel={isValidatingUpload ? "Validating..." : "Validate ZIP Package"}
        onSubmit={handleUploadSubmit}
        footer={
          <span className="admin-tests-form-footnote">
            Validation rejects nested folders, blocks external image URLs, generates a downloadable row-level CSV error report, and in live mode also verifies duplicate/ingestion readiness against the admin bulk API. No partial commit.
          </span>
        }
      >
        <UiFormField label="Exam Type" htmlFor="admin-question-upload-exam-type">
          <select
            id="admin-question-upload-exam-type"
            value={uploadExamType}
            onChange={(event) => setUploadExamType(event.target.value as ExamType)}
          >
            {EXAM_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </UiFormField>
        <UiFormField label="Subject" htmlFor="admin-question-upload-subject">
          <select
            id="admin-question-upload-subject"
            value={uploadSubject}
            onChange={(event) => setUploadSubject(event.target.value)}
          >
            {EXAM_SUBJECTS[uploadExamType].map((subject) => (
              <option key={subject} value={subject}>
                {subject}
              </option>
            ))}
          </select>
        </UiFormField>
        <UiFormField label="Question Package (.zip)" htmlFor="admin-question-upload-file">
          <input
            key={selectedUploadFile?.name ?? "question-upload"}
            id="admin-question-upload-file"
            type="file"
            accept=".zip"
            onChange={(event) => setSelectedUploadFile(event.target.files?.[0] ?? null)}
          />
        </UiFormField>
        <UiFormField label="Sample Workbook Schema" htmlFor="admin-question-upload-schema">
          <textarea
            id="admin-question-upload-schema"
            rows={4}
            value="UniqueKey, ChapterName, Difficulty, QuestionType, QuestionNo, QuestionImageFile, SolutionImageFile, CorrectAnswer, PrimaryTag, SecondaryTag"
            readOnly
          />
        </UiFormField>
      </UiForm>

      {uploadValidation ? (
        <section className="admin-question-validation-shell" aria-label="Question upload validation">
          <div className="admin-question-validation-grid">
            <article className="admin-question-validation-card">
              <h3>Package Status</h3>
              <p>
                {uploadValidation.errors.length > 0 || uploadValidation.rowErrors.length > 0 || (uploadValidation.serverValidation?.summary.invalid ?? 0) > 0 ?
                  "Blocked" :
                  "Ready for next validation stage"}
              </p>
              <p>{uploadValidation.totalRows} workbook rows checked.</p>
            </article>
            <article className="admin-question-validation-card">
              <h3>Workbook Sheets</h3>
              <p>{uploadValidation.sheetNames.length > 0 ? uploadValidation.sheetNames.join(", ") : "Workbook sheets unavailable."}</p>
            </article>
            <article className="admin-question-validation-card">
              <h3>Archive Structure</h3>
              <p>{uploadValidation.nestedFolderEntries.length === 0 ? "ZIP root is flat." : `${uploadValidation.nestedFolderEntries.length} nested entries rejected.`}</p>
            </article>
            <article className="admin-question-validation-card">
              <h3>Image Assets</h3>
              <p>{uploadValidation.imageAssetCount} ZIP root asset files available for workbook references.</p>
            </article>
          </div>

          {renderDistributionPreview(uploadValidation)}

          {uploadValidation.serverValidation ? (
            <div className="admin-question-validation-block">
              <h3>Live Validate-Only Ingestion</h3>
              <ul className="admin-question-validation-list">
                <li>{uploadValidation.serverValidation.summary.received} rows submitted to `POST /admin/questions/bulk`.</li>
                <li>{uploadValidation.serverValidation.summary.valid} rows passed backend ingestion validation.</li>
                <li>{uploadValidation.serverValidation.summary.invalid} rows were rejected by backend duplicate/schema checks.</li>
                <li>{uploadValidation.serverValidation.summary.warnings} backend warnings returned.</li>
              </ul>
            </div>
          ) : null}

          {uploadValidation.errors.length > 0 ? (
            <div className="admin-question-validation-block">
              <h3>Package-Level Errors</h3>
              <ul className="admin-question-validation-list">
                {uploadValidation.errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {uploadValidation.nestedFolderEntries.length > 0 ? (
            <div className="admin-question-validation-block">
              <h3>Rejected Nested Entries</h3>
              <ul className="admin-question-validation-list">
                {uploadValidation.nestedFolderEntries.map((entryName) => (
                  <li key={entryName}>{entryName}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="admin-question-validation-actions">
            <button type="button" onClick={clearUploadValidation}>
              Clear Validation
            </button>
            <button type="button" onClick={downloadRowErrorsCsv} disabled={uploadValidation.rowErrors.length === 0}>
              Download Row Errors CSV
            </button>
          </div>

          <UiTable
            caption="Question upload row-level validation"
            columns={[
              { id: "row", header: "Row", render: (row) => row.rowNumber },
              { id: "uniqueKey", header: "UniqueKey", render: (row) => row.uniqueKey || "Missing" },
              { id: "errors", header: "Errors", render: (row) => row.errors.join(" ") },
            ]}
            rows={uploadValidation.rowErrors}
            rowKey={(row) => `${row.rowNumber}-${row.uniqueKey || "missing"}`}
            emptyStateText="No row-level schema or image-reference errors were found."
          />

          {uploadValidation.serverValidation ? (
            <UiTable
              caption="Question upload backend validate-only results"
              columns={[
                { id: "row", header: "Row", render: (row) => row.rowNumber },
                { id: "uniqueKey", header: "UniqueKey", render: (row) => row.uniqueKey ?? "Missing" },
                { id: "action", header: "Action", render: (row) => row.action },
                { id: "errors", header: "Errors", render: (row) => row.errors.join(" ") || "None" },
                { id: "warnings", header: "Warnings", render: (row) => row.warnings.join(" ") || "None" },
              ]}
              rows={uploadValidation.serverValidation.rows}
              rowKey={(row) => `${row.rowNumber}-${row.questionId ?? row.uniqueKey ?? "pending"}`}
              emptyStateText="No backend validate-only results were returned."
            />
          ) : null}
        </section>
      ) : null}
      {uploadLogs.length > 0 ? (
        <UiTable
          caption="Question upload logs from this workspace session"
          columns={[
            { id: "id", header: "Upload ID", render: (log) => log.id },
            { id: "uploadedBy", header: "Uploaded By", render: (log) => log.uploadedBy },
            { id: "timestamp", header: "Date", render: (log) => formatIsoDate(log.timestamp) },
            { id: "totalRows", header: "Rows", render: (log) => log.totalRows },
            { id: "issues", header: "Errors / Warnings", render: (log) => `${log.errors} / ${log.warnings}` },
            { id: "versionCreated", header: "Version", render: (log) => log.versionCreated },
          ]}
          rows={uploadLogs}
          rowKey={(row) => row.id}
          emptyStateText="No package uploads yet."
        />
      ) : null}
    </section>
  );
}

export default QuestionBankManagementPage;
