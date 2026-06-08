import { useEffect, useState, type FormEvent } from "react";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import { getPortalApiClient } from "../../../../../shared/services/portalIntegration";
import {
  UiChartContainer,
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
const UPLOAD_EXAM_OPTIONS = [...EXAM_TYPES, "Other"] as const;
const OTHER_EXAM_SUBJECT_LABEL = "No subject lock";
type UploadExamOption = (typeof UPLOAD_EXAM_OPTIONS)[number];

type UploadLogRecord = {
  created: number;
  errorDetails: string[];
  id: string;
  rollbackEligibility: "eligible" | "blocked";
  rollbackReason: string;
  uploadedBy: string;
  timestamp: string;
  totalRows: number;
  errors: number;
  warnings: number;
  warningDetails: string[];
  versionCreated: number;
};

const FALLBACK_UPLOAD_LOGS: UploadLogRecord[] = [
  {
    created: 19,
    errorDetails: [],
    id: "upl-2026-0412-001",
    rollbackEligibility: "eligible",
    rollbackReason: "Created questions are unused in assigned templates.",
    uploadedBy: "admin@parabolic.local",
    timestamp: "2026-04-12T08:30:00.000Z",
    totalRows: 124,
    errors: 0,
    warnings: 2,
    warningDetails: ["Chapter balance skewed toward Mechanics.", "Two rows used optional InternalNotes only."],
    versionCreated: 19,
  },
  {
    created: 12,
    errorDetails: [
      "Row 18 missing QuestionImageFile asset.",
      "Row 29 has invalid Difficulty value.",
      "Row 44 duplicate UniqueKey in upload.",
    ],
    id: "upl-2026-0411-002",
    rollbackEligibility: "blocked",
    rollbackReason: "At least one created question is already used in an assigned template.",
    uploadedBy: "content.ops@parabolic.local",
    timestamp: "2026-04-11T11:15:00.000Z",
    totalRows: 86,
    errors: 4,
    warnings: 1,
    warningDetails: ["Hard questions exceed 50% of package rows."],
    versionCreated: 12,
  },
  {
    created: 8,
    errorDetails: [],
    id: "upl-2026-0409-004",
    rollbackEligibility: "eligible",
    rollbackReason: "No assigned-template usage detected for this upload batch.",
    uploadedBy: "admin@parabolic.local",
    timestamp: "2026-04-09T05:40:00.000Z",
    totalRows: 52,
    errors: 0,
    warnings: 0,
    warningDetails: [],
    versionCreated: 8,
  },
];

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
  examType: string;
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

function toNumberOrZero(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function formatExamTypeLabel(value: string): string {
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

function toNonEmptyString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function normalizeStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const normalized = value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);

  return normalized.length > 0 ? normalized : fallback;
}

function normalizeRollbackEligibility(value: unknown, fallback: "eligible" | "blocked"): "eligible" | "blocked" {
  return value === "eligible" || value === "blocked" ? value : fallback;
}

function normalizeUploadLogRecord(value: unknown, index: number): UploadLogRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const fallback = FALLBACK_UPLOAD_LOGS[index] ?? FALLBACK_UPLOAD_LOGS[0];

  return {
    created: Math.max(0, toNumberOrZero(record.created ?? fallback?.created ?? 0)),
    errorDetails: normalizeStringArray(record.errorDetails ?? record.errorMessages, fallback?.errorDetails ?? []),
    errors: Math.max(0, toNumberOrZero(record.errors ?? fallback?.errors ?? 0)),
    id: toNonEmptyString(record.id, fallback?.id ?? `upl-${index + 1}`),
    rollbackEligibility: normalizeRollbackEligibility(
      record.rollbackEligibility,
      fallback?.rollbackEligibility ?? "blocked",
    ),
    rollbackReason: toNonEmptyString(
      record.rollbackReason,
      fallback?.rollbackReason ?? "Rollback requires every created question to be unused in assigned templates.",
    ),
    timestamp: toNonEmptyString(record.timestamp, fallback?.timestamp ?? new Date(0).toISOString()),
    totalRows: Math.max(0, toNumberOrZero(record.totalRows ?? fallback?.totalRows ?? 0)),
    uploadedBy: toNonEmptyString(record.uploadedBy, fallback?.uploadedBy ?? "unknown"),
    versionCreated: Math.max(0, toNumberOrZero(record.versionCreated ?? fallback?.versionCreated ?? 0)),
    warningDetails: normalizeStringArray(
      record.warningDetails ?? record.warningMessages,
      fallback?.warningDetails ?? [],
    ),
    warnings: Math.max(0, toNumberOrZero(record.warnings ?? fallback?.warnings ?? 0)),
  };
}

async function fetchUploadLogsFromApi(): Promise<UploadLogRecord[]> {
  const payload = await apiClient.get<unknown>("/admin/questions/upload-logs");
  if (!payload || typeof payload !== "object") {
    throw new Error("GET /admin/questions/upload-logs returned an invalid payload.");
  }

  const response = payload as {
    data?: {
      logs?: unknown;
    };
  };
  const logs = Array.isArray(response.data?.logs) ? response.data?.logs : [];

  return logs
    .map((entry, index) => normalizeUploadLogRecord(entry, index))
    .filter((entry): entry is UploadLogRecord => Boolean(entry));
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

function createStoredZip(files: Array<{ name: string; content: string | Uint8Array }>): Uint8Array {
  const encoder = new TextEncoder();
  const output: number[] = [];
  const centralDirectory: number[] = [];

  files.forEach((file) => {
    const nameBytes = encoder.encode(file.name);
    const contentBytes = typeof file.content === "string" ? encoder.encode(file.content) : file.content;
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

function buildSampleWorkbookProfile(examLabel: string, subjectLabel: string): SampleWorkbookProfile {
  const columns = getSimplifiedSampleColumns();
  const baseRow: Record<string, string> = {
    AdditionalTag: "formula-application",
    ChapterName: examLabel === "NEET" && subjectLabel === "Biology" ? "Cell Structure" : "Kinematics",
    CorrectAnswer: "A",
    Difficulty: "Medium",
    InternalNotes: "Optional reviewer note",
    Marks: "4",
    NegativeMarks: "-1",
    PrimaryTag: "conceptual",
    QuestionImageFile: "question-001.png",
    QuestionNo: "1",
    QuestionType: "single_correct",
    SecondaryTag: "moderate-time",
    SimulationLink: "",
    SolutionImageFile: "solution-001.png",
    Topic: examLabel === "NEET" && subjectLabel === "Biology" ? "Cell organelles" : "Projectile motion",
    TutorialVideoLink: "",
    UniqueKey: `${examLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${subjectLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-001`,
  };

  return {
    columns,
    fileName: `question-bank-sample-${examLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${subjectLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`,
    markingScheme: "Sample workbook includes Marks and NegativeMarks for every question. Standard exams still default to +4 and -1 unless you choose to change them later.",
    sampleRow: baseRow,
    subjectLabel,
  };
}

function buildSampleWorkbookXlsx(profile: SampleWorkbookProfile, examLabel: string): Uint8Array {
  const questionRows = [
    profile.columns,
    profile.columns.map((columnName) => profile.sampleRow[columnName] ?? ""),
  ];
  const summaryRows = [
    ["Field", "Value"],
    ["Selected Exam", formatExamTypeLabel(examLabel)],
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

function buildSamplePackageZip(profile: SampleWorkbookProfile, examLabel: string): Uint8Array {
  const workbookBytes = buildSampleWorkbookXlsx(profile, examLabel);
  const placeholderImageBytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41,
    0x54, 0x78, 0x9c, 0x63, 0xf8, 0xcf, 0xc0, 0xf0,
    0x1f, 0x00, 0x05, 0x00, 0x01, 0xff, 0x89, 0x99,
    0x3d, 0x1d, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
    0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);
  const readme = [
    "Sample question upload package",
    "",
    "Contents:",
    "- questions.xlsx",
    "- question-001.png",
    "- solution-001.png",
    "",
    "Next steps:",
    "- Keep questions.xlsx at the ZIP root.",
    "- Replace questions.xlsx with your final workbook if you generated a fresh copy separately.",
    "- Replace question-001.png and solution-001.png with your real files while keeping the same file names or updating the workbook references to match your own names.",
    "- Do not create nested folders inside the ZIP.",
    "- Remove this README.txt file before uploading the final ZIP package.",
  ].join("\n");

  return createStoredZip([
    { name: "questions.xlsx", content: workbookBytes },
    { name: "question-001.png", content: placeholderImageBytes },
    { name: "solution-001.png", content: placeholderImageBytes },
    { name: "README.txt", content: readme },
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
  examType: string;
  instituteId: string;
  subject: string;
  workbookRows: QuestionUploadWorkbookRow[];
  commit?: boolean;
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
        commit: input.commit === true,
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
  const [uploadExamType, setUploadExamType] = useState<UploadExamOption>("JEEMains");
  const [customExamName, setCustomExamName] = useState("");
  const [customSubjectName, setCustomSubjectName] = useState("");
  const [uploadSubject, setUploadSubject] = useState<string>(EXAM_SUBJECTS.JEEMains[0]);
  const [uploadLogs, setUploadLogs] = useState<UploadLogRecord[]>([]);
  const [uploadValidation, setUploadValidation] = useState<QuestionPackageValidationResult | null>(null);
  const [isValidatingUpload, setIsValidatingUpload] = useState(false);
  const [isFinalUploading, setIsFinalUploading] = useState(false);
  const [inlineMessage, setInlineMessage] = useState(
    "Choose the exam details, download the sample if needed, and validate the ZIP package when you are ready.",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (uploadExamType === "Other") {
      setUploadSubject(customSubjectName.trim() || OTHER_EXAM_SUBJECT_LABEL);
      return;
    }

    const nextSubject = EXAM_SUBJECTS[uploadExamType][0];
    setUploadSubject((current) => (EXAM_SUBJECTS[uploadExamType].includes(current) ? current : nextSubject));
  }, [customSubjectName, uploadExamType]);

  useEffect(() => {
    let isActive = true;

    async function loadUploadLogs(): Promise<void> {
      if (!shouldUseLiveApi()) {
        setUploadLogs(FALLBACK_UPLOAD_LOGS);
        return;
      }

      try {
        const nextLogs = await fetchUploadLogsFromApi();
        if (!isActive) {
          return;
        }

        setUploadLogs(nextLogs.length > 0 ? nextLogs : FALLBACK_UPLOAD_LOGS);
      } catch {
        if (!isActive) {
          return;
        }

        setUploadLogs(FALLBACK_UPLOAD_LOGS);
      }
    }

    void loadUploadLogs();

    return () => {
      isActive = false;
    };
  }, []);

  const selectedExamLabel = uploadExamType === "Other" ? customExamName.trim() || "Custom Exam" : uploadExamType;
  const selectedSubjectLabel =
    uploadExamType === "Other" ? customSubjectName.trim() || OTHER_EXAM_SUBJECT_LABEL : uploadSubject;
  const sampleWorkbookProfile = buildSampleWorkbookProfile(selectedExamLabel, selectedSubjectLabel);
  const hasBlockingValidationIssues =
    uploadValidation ?
      uploadValidation.errors.length > 0 ||
      uploadValidation.rowErrors.length > 0 ||
      (uploadValidation.serverValidation?.summary.invalid ?? 0) > 0 :
      false;

  async function handleUploadSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (uploadExamType === "Other" && customExamName.trim().length === 0) {
      setErrorMessage("Enter the exam name before validating a custom exam package.");
      return;
    }

    if (uploadExamType === "Other" && customSubjectName.trim().length === 0) {
      setErrorMessage("Enter the subject name before validating a custom exam package.");
      return;
    }

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
          examType: selectedExamLabel,
          instituteId,
          subject: selectedSubjectLabel,
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
        created: serverValidation?.summary.created ?? 0,
        errorDetails: validation.errors.concat(validation.rowErrors.flatMap((row) => row.errors)),
        errors:
          validation.errors.length +
          validation.rowErrors.length +
          (serverValidation?.summary.invalid ?? 0),
        id: `upl-${Date.now()}`,
        rollbackEligibility: "blocked",
        rollbackReason: "Review assigned-template usage before any rollback decision.",
        timestamp: new Date().toISOString(),
        totalRows: finalValidation.totalRows,
        uploadedBy: actorEmail,
        versionCreated: serverValidation?.summary.updated ?? 0,
        warnings: validation.warnings.length + (serverValidation?.summary.warnings ?? 0),
        warningDetails: validation.warnings,
      };

      setUploadLogs((current) => [nextLog, ...current]);
      setInlineMessage(
        validation.errors.length > 0 || validation.rowErrors.length > 0 ?
          `Validation found issues in ${selectedUploadFile.name}. Download the error report, correct the workbook or ZIP contents, and upload the package again.` :
        serverValidation ?
          serverValidation.summary.invalid > 0 ?
            `Validation completed with issues for ${selectedUploadFile.name}. Review the blocked rows below, correct them, and upload the package again.` :
            `Validation successful for ${selectedUploadFile.name}. The package passed workbook, image, and row checks and is ready for final upload.` :
          `Validation successful for ${selectedUploadFile.name}. The workbook and image references are ready for final upload when live upload is available.`,
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

  async function handleFinalUpload(): Promise<void> {
    if (!uploadValidation || hasBlockingValidationIssues) {
      return;
    }

    setIsFinalUploading(true);
    setErrorMessage(null);

    try {
      if (!shouldUseLiveApi()) {
        setUploadValidation((current) =>
          current ?
            {
              ...current,
              serverValidation: {
                commitRequested: true,
                committed: true,
                rows: current.serverValidation?.rows ?? [],
                summary: current.serverValidation?.summary ?? {
                  created: current.workbookRows.length,
                  invalid: 0,
                  received: current.workbookRows.length,
                  updated: 0,
                  valid: current.workbookRows.length,
                  warnings: current.warnings.length,
                },
                uploadLogId: current.serverValidation?.uploadLogId ?? `upl-local-${Date.now()}`,
                uploadLogPath: current.serverValidation?.uploadLogPath ?? null,
              },
            } :
            current,
        );
        setInlineMessage(
          `Upload successful. Local mode simulated the final upload for ${uploadValidation.workbookRows.length} questions.`,
        );
        return;
      }

      const claims = decodeIdTokenClaims(session.idToken);
      const instituteId =
        typeof claims?.instituteId === "string" && claims.instituteId.trim().length > 0 ?
          claims.instituteId :
          "inst-build-125";

      const commitResponse = await validateQuestionsWithApi({
        commit: true,
        examType: selectedExamLabel,
        instituteId,
        subject: selectedSubjectLabel,
        workbookRows: uploadValidation.workbookRows,
      });

      setUploadValidation((current) =>
        current ?
          {
            ...current,
            serverValidation: commitResponse,
          } :
          current,
      );
      setUploadLogs((current) =>
        current.map((log, index) =>
          index === 0 ?
            {
              ...log,
              created: commitResponse.summary.created,
              errors: commitResponse.summary.invalid,
              versionCreated: commitResponse.summary.updated,
              warnings: commitResponse.summary.warnings,
            } :
            log,
        ),
      );
      setInlineMessage(
        commitResponse.committed ?
          `Upload successful. ${commitResponse.summary.created} questions were added and ${commitResponse.summary.updated} existing versions were updated.` :
          "Final upload was requested, but the system did not confirm a completed upload.",
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Final upload failed.");
    } finally {
      setIsFinalUploading(false);
    }
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
      `Downloaded ${formatExamTypeLabel(selectedExamLabel)} sample schema for ${sampleWorkbookProfile.subjectLabel}. ${sampleWorkbookProfile.markingScheme}.`,
    );
  }

  function downloadSampleWorkbookXlsx() {
    const xlsxBytes = buildSampleWorkbookXlsx(sampleWorkbookProfile, selectedExamLabel);
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
      `Downloaded workbook sample with questions, Exam Summary, and INSTRUCTIONS sheets for ${formatExamTypeLabel(selectedExamLabel)}.`,
    );
  }

  function downloadSamplePackageZip() {
    const zipBytes = buildSamplePackageZip(sampleWorkbookProfile, selectedExamLabel);
    const zipBuffer = toArrayBuffer(zipBytes.buffer).slice(zipBytes.byteOffset, zipBytes.byteOffset + zipBytes.byteLength);
    const zipBlob = new Blob([zipBuffer], { type: "application/zip" });
    const downloadUrl = URL.createObjectURL(zipBlob);
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = `question-upload-sample-${selectedExamLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${sampleWorkbookProfile.subjectLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.zip`;
    anchor.click();
    URL.revokeObjectURL(downloadUrl);
    setInlineMessage(
      `Downloaded sample ZIP package with questions.xlsx for ${formatExamTypeLabel(selectedExamLabel)} and ${sampleWorkbookProfile.subjectLabel}. Add the image files before uploading.`,
    );
  }

  function renderDistributionPreview(validation: QuestionPackageValidationResult) {
    const preview = buildDistributionPreview(validation.workbookRows);

    return (
      <div className="admin-question-validation-card admin-question-distribution-panel">
        <h3>Pre-Import Distribution Preview</h3>
        <p className="admin-question-distribution-summary">
          {preview.totalRows} question row{preview.totalRows === 1 ? "" : "s"} · {preview.totalMarks} total marks ·{" "}
          {preview.warnings.length} balance warning{preview.warnings.length === 1 ? "" : "s"}
        </p>
        {preview.warnings.length > 0 ? (
          <ul className="admin-question-validation-list">
            {preview.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : (
          <p className="admin-tests-inline-note">No difficulty, chapter, or marks balance warnings were found.</p>
        )}
        <div className="admin-question-distribution-charts">
          <UiChartContainer
            title="Difficulty Distribution"
            subtitle="How the uploaded questions are split by difficulty"
            data={preview.difficultyBuckets.map((bucket) => ({ label: bucket.label, value: bucket.count }))}
            variant="pie"
          />
          <UiChartContainer
            title="Chapter Distribution"
            subtitle="How the uploaded questions are spread across chapters"
            data={preview.chapterBuckets.map((bucket) => ({ label: bucket.label, value: bucket.count }))}
            variant="pie"
          />
          <UiChartContainer
            title="Marks Distribution"
            subtitle="How the uploaded questions are split by marks bucket"
            data={preview.marksBuckets.map((bucket) => ({ label: bucket.label, value: bucket.count }))}
            variant="pie"
          />
        </div>
      </div>
    );
  }

  function clearUploadValidation() {
    setSelectedUploadFile(null);
    setUploadValidation(null);
    setErrorMessage(null);
    setInlineMessage("Question upload wizard is ready for the next package.");
  }

  return (
    <section className="admin-content-card" aria-labelledby="admin-question-bank-title">
      <p className="admin-content-eyebrow">Question Bank Upload</p>
      <h2 id="admin-question-bank-title">Bulk Question Upload</h2>
      <p className="admin-content-copy">
        Upload a question package, validate the workbook and image files, and review issues before import.
      </p>

      <QuestionBankWorkspaceNav />

      <p className="admin-tests-inline-note">{inlineMessage}</p>
      {errorMessage ? <p className="admin-tests-inline-error">{errorMessage}</p> : null}

      <section className="admin-question-validation-shell" aria-labelledby="admin-question-upload-workflow-title">
        <div className="admin-student-bulk-review-header">
          <div>
            <h3 id="admin-question-upload-workflow-title">Question Package Workflow</h3>
            <p>
              Choose the exam context once, download a sample workbook if needed, and then upload the ZIP package for
              validation.
            </p>
          </div>
        </div>
        <div className="admin-student-bulk-stage-row" aria-label="Question package workflow steps">
          <article className="admin-student-bulk-stage admin-student-bulk-stage-active">
            <span>1</span>
            <strong>Choose Exam Type</strong>
          </article>
          <article className="admin-student-bulk-stage admin-student-bulk-stage-active">
            <span>2</span>
            <strong>Choose Subject</strong>
          </article>
          <article className="admin-student-bulk-stage admin-student-bulk-stage-active">
            <span>3</span>
            <strong>Download Sample</strong>
          </article>
          <article className="admin-student-bulk-stage admin-student-bulk-stage-complete">
            <span>4</span>
            <strong>Upload And Validate</strong>
          </article>
        </div>
        <div className="admin-question-upload-wizard-layout">
          <UiForm
            title="Question Upload Wizard"
            description="Choose the exam context, download the matching sample workbook if needed, then upload one ZIP package for validation."
            submitLabel={isValidatingUpload ? "Validating..." : "Validate ZIP Package"}
            onSubmit={handleUploadSubmit}
            footer={
              <span className="admin-tests-form-footnote">
                Validation checks ZIP structure, workbook references, and duplicate readiness. If issues are found, you
                can download the row-level error report and fix them before import.
              </span>
            }
          >
            <UiFormField label="Exam Type" htmlFor="admin-question-upload-exam-type">
              <select
                id="admin-question-upload-exam-type"
                value={uploadExamType}
                onChange={(event) => setUploadExamType(event.target.value as UploadExamOption)}
              >
                {UPLOAD_EXAM_OPTIONS.map((type) => (
                  <option key={type} value={type}>
                    {formatExamTypeLabel(type)}
                  </option>
                ))}
              </select>
            </UiFormField>
            {uploadExamType === "Other" ? (
              <>
                <UiFormField
                  label="Exam Name"
                  htmlFor="admin-question-upload-custom-exam"
                  helper="Use this when the package is for an exam outside JEE Mains or NEET."
                >
                  <input
                    id="admin-question-upload-custom-exam"
                    type="text"
                    value={customExamName}
                    onChange={(event) => setCustomExamName(event.target.value)}
                    placeholder="Enter exam name"
                  />
                </UiFormField>
                <UiFormField
                  label="Subject Name"
                  htmlFor="admin-question-upload-custom-subject"
                  helper="Enter the subject for this custom exam package."
                >
                  <input
                    id="admin-question-upload-custom-subject"
                    type="text"
                    value={customSubjectName}
                    onChange={(event) => setCustomSubjectName(event.target.value)}
                    placeholder="Enter subject name"
                  />
                </UiFormField>
              </>
            ) : (
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
            )}
            <div className="admin-question-upload-sample-panel">
              <div>
                <h3>Sample Workbook</h3>
                <p>{formatExamTypeLabel(selectedExamLabel)} · {sampleWorkbookProfile.subjectLabel}</p>
                <small>
                  {sampleWorkbookProfile.fileName.replace(/\.csv$/, ".xlsx")} includes questions, Exam Summary, and
                  INSTRUCTIONS sheets.
                </small>
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
            <UiFormField label="Question Package (.zip)" htmlFor="admin-question-upload-file">
              <input
                key={selectedUploadFile?.name ?? "question-upload"}
                id="admin-question-upload-file"
                type="file"
                accept=".zip"
                onChange={(event) => setSelectedUploadFile(event.target.files?.[0] ?? null)}
              />
            </UiFormField>
            <UiFormField label="Required Workbook Columns" htmlFor="admin-question-upload-schema">
              <textarea
                id="admin-question-upload-schema"
                rows={4}
                value="UniqueKey, Marks, NegativeMarks, ChapterName, Difficulty, QuestionType, QuestionNo, QuestionImageFile, SolutionImageFile, CorrectAnswer, PrimaryTag, SecondaryTag"
                readOnly
              />
            </UiFormField>
          </UiForm>
          <article className="admin-question-validation-card admin-question-upload-instructions">
            <h3>Instructions for Bulk Question Upload</h3>
            <p>Use this checklist before uploading the package.</p>
            <div className="admin-student-bulk-actions">
              <button type="button" onClick={downloadSamplePackageZip}>
                Download Sample ZIP
              </button>
            </div>
            <ul className="admin-question-validation-list">
              <li>Download the sample workbook for the selected exam and subject first.</li>
              <li>Keep the workbook file name as <code>questions.xlsx</code>.</li>
              <li>Make sure the workbook includes the required columns shown in the wizard.</li>
              <li>Place <code>questions.xlsx</code> and every referenced question and solution image at the ZIP root.</li>
              <li>
                Use clear file names such as <code>question-001.png</code> and <code>solution-001.png</code>. Keep
                the same names in the workbook, and use supported image files such as <code>.png</code>, <code>.jpg</code>,
                <code>.jpeg</code>, or <code>.webp</code>.
              </li>
              <li>Do not create folders inside the ZIP.</li>
              <li>Use one flat ZIP package only.</li>
              <li>For custom exams, enter both the exam name and subject name before validating.</li>
            </ul>
            <p>The validator checks workbook structure, image references, duplicate readiness, and row-level issues before the package can move forward.</p>
          </article>
        </div>
      </section>

      {uploadValidation ? (
        <section className="admin-question-validation-shell" aria-label="Question upload validation">
          <div className="admin-question-results-layout">
            <div className="admin-question-results-stack">
              <article className="admin-question-validation-card">
                <h3>
                  {uploadValidation.errors.length > 0 || uploadValidation.rowErrors.length > 0 || (uploadValidation.serverValidation?.summary.invalid ?? 0) > 0 ?
                    "Validation found issues" :
                  uploadValidation.serverValidation?.committed ?
                    "Upload successful" :
                    "Validation successful"}
                </h3>
                <p>
                  {uploadValidation.totalRows} question row{uploadValidation.totalRows === 1 ? "" : "s"} checked for{" "}
                  {formatExamTypeLabel(selectedExamLabel)} {sampleWorkbookProfile.subjectLabel}.
                </p>
                <small>
                  {uploadValidation.errors.length > 0 || uploadValidation.rowErrors.length > 0 || (uploadValidation.serverValidation?.summary.invalid ?? 0) > 0 ?
                    "Review the issues below, correct the workbook or ZIP package, and upload it again." :
                  uploadValidation.serverValidation?.committed ?
                    "Your package has been uploaded successfully." :
                    "Everything needed for upload is in place. You can continue with Final Upload."}
                </small>
                <ul className="admin-question-validation-list">
                  <li>
                    Workbook sheets found:{" "}
                    {uploadValidation.sheetNames.length > 0 ? uploadValidation.sheetNames.join(", ") : "not available"}
                  </li>
                  <li>
                    ZIP structure:{" "}
                    {uploadValidation.nestedFolderEntries.length === 0 ?
                      "flat and ready" :
                      `${uploadValidation.nestedFolderEntries.length} nested item${uploadValidation.nestedFolderEntries.length === 1 ? "" : "s"} need attention`}
                  </li>
                  <li>Image files found at ZIP root: {uploadValidation.imageAssetCount}</li>
                </ul>
              </article>

              {uploadValidation.serverValidation ? (
                <div className="admin-question-validation-block">
                  <h3>System Check</h3>
                  <ul className="admin-question-validation-list">
                    <li>{uploadValidation.serverValidation.summary.received} rows checked against the system.</li>
                    <li>{uploadValidation.serverValidation.summary.valid} rows are ready.</li>
                    <li>{uploadValidation.serverValidation.summary.invalid} rows need correction.</li>
                    <li>{uploadValidation.serverValidation.summary.warnings} warnings were returned.</li>
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

              <div className="admin-question-validation-block">
                <div className="admin-question-validation-actions">
                  <button type="button" onClick={clearUploadValidation}>
                    Clear Validation
                  </button>
                  {!hasBlockingValidationIssues && !uploadValidation.serverValidation?.committed ? (
                    <button type="button" onClick={() => void handleFinalUpload()} disabled={isFinalUploading}>
                      {isFinalUploading ? "Uploading..." : "Final Upload"}
                    </button>
                  ) : null}
                  <button type="button" onClick={downloadRowErrorsCsv} disabled={uploadValidation.rowErrors.length === 0}>
                    Download Row Errors CSV
                  </button>
                </div>

                <p className="admin-tests-inline-note">
                  {hasBlockingValidationIssues ?
                    "If validation finds errors, download the error report, correct the workbook or ZIP contents, and upload the package again." :
                  uploadValidation.serverValidation?.committed ?
                    "The package is already uploaded. You can clear this validation and start the next package when ready." :
                    "Validation passed. Use Final Upload to add the questions to the system."}
                </p>
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
            </div>

            {renderDistributionPreview(uploadValidation)}
          </div>
        </section>
      ) : null}
      <section className="admin-content-card" aria-labelledby="admin-question-upload-history-title">
        <div className="admin-section-header">
          <div>
            <p className="admin-eyebrow">Previous Uploads</p>
            <h2 id="admin-question-upload-history-title">Validation And Upload History</h2>
          </div>
          <p className="admin-section-copy">
            Review earlier question package uploads, see how many rows were checked, and spot any warnings or blocked
            validations before the next import.
          </p>
        </div>
        <UiTable
          caption="Previous question package uploads and validation history"
          columns={[
            { id: "id", header: "Upload ID", render: (log) => log.id },
            { id: "uploadedBy", header: "Uploaded By", render: (log) => log.uploadedBy },
            { id: "timestamp", header: "Date", render: (log) => formatIsoDate(log.timestamp) },
            { id: "totalRows", header: "Rows Checked", render: (log) => log.totalRows },
            { id: "created", header: "Created", render: (log) => log.created },
            { id: "issues", header: "Errors / Warnings", render: (log) => `${log.errors} / ${log.warnings}` },
            { id: "versionCreated", header: "Versions", render: (log) => log.versionCreated },
            {
              id: "status",
              header: "Status",
              render: (log) => (log.errors > 0 ? "Needs review" : log.warnings > 0 ? "Warnings" : "Clear"),
            },
          ]}
          rows={uploadLogs}
          rowKey={(row) => row.id}
          emptyStateText="No package uploads yet."
        />
      </section>
    </section>
  );
}

export default QuestionBankManagementPage;
