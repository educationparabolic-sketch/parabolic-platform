import { useMemo, useState, type FormEvent } from "react";
import {
  UiForm,
  UiFormField,
  UiPagination,
  UiTable,
  type UiTableColumn,
} from "../../../../../shared/ui/components";
import {
  DIFFICULTY_LEVELS,
  EXAM_TYPES,
  QUESTION_BANK,
  type DifficultyLevel,
  type ExamType,
  type QuestionBankRecord,
} from "./testTemplateFixtures";

type UploadLogRecord = {
  id: string;
  uploadedBy: string;
  timestamp: string;
  totalRows: number;
  errors: number;
  warnings: number;
  versionCreated: number;
};

type TagOperation = "create" | "rename" | "merge" | "deprecate";

interface TagRecord {
  id: string;
  name: string;
  status: "active" | "deprecated";
  usedInActiveTemplate: boolean;
}

interface QuestionFilterDraft {
  query: string;
  subject: string;
  chapter: string;
  difficulty: "all" | DifficultyLevel;
  tag: string;
  thermalState: "all" | "hot" | "warm" | "cold";
}

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

interface QuestionPackageValidationResult {
  archiveEntries: string[];
  errors: string[];
  imageAssetCount: number;
  nestedFolderEntries: string[];
  rowErrors: QuestionPackageValidationRow[];
  sheetNames: string[];
  totalRows: number;
  warnings: string[];
}

const PAGE_SIZE = 6;

const INITIAL_FILTERS: QuestionFilterDraft = {
  query: "",
  subject: "all",
  chapter: "all",
  difficulty: "all",
  tag: "all",
  thermalState: "all",
};

const INITIAL_TAGS: TagRecord[] = [
  { id: "tag-1", name: "motion", status: "active", usedInActiveTemplate: true },
  { id: "tag-2", name: "thermo", status: "active", usedInActiveTemplate: false },
  { id: "tag-3", name: "advanced", status: "active", usedInActiveTemplate: true },
  { id: "tag-4", name: "foundation", status: "active", usedInActiveTemplate: false },
];

function formatIsoDate(value: string): string {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? value : new Date(parsed).toISOString().slice(0, 10);
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

function encodeCsvCell(value: string): string {
  if (/[,"\n]/.test(value)) {
    return `"${value.replace(/"/g, "\"\"")}"`;
  }

  return value;
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
      sheetNames: [],
      totalRows: 0,
      warnings,
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
    totalRows: rows.length,
    warnings,
  };
}

function QuestionBankManagementPage() {
  const [questions, setQuestions] = useState<QuestionBankRecord[]>(QUESTION_BANK);
  const [filters, setFilters] = useState<QuestionFilterDraft>(INITIAL_FILTERS);
  const [page, setPage] = useState(1);
  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null);
  const [uploadExamType, setUploadExamType] = useState<ExamType>("JEEMains");
  const [uploadLogs, setUploadLogs] = useState<UploadLogRecord[]>([]);
  const [tagRecords, setTagRecords] = useState<TagRecord[]>(INITIAL_TAGS);
  const [tagOperation, setTagOperation] = useState<TagOperation>("create");
  const [tagPrimaryValue, setTagPrimaryValue] = useState("");
  const [tagSecondaryValue, setTagSecondaryValue] = useState("");
  const [uploadValidation, setUploadValidation] = useState<QuestionPackageValidationResult | null>(null);
  const [isValidatingUpload, setIsValidatingUpload] = useState(false);
  const [inlineMessage, setInlineMessage] = useState(
    "Question library uses indexed filter inputs with paginated results and immutable structural lock cues.",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const subjects = useMemo(() => {
    return ["all", ...new Set(questions.map((question) => question.subject))];
  }, [questions]);

  const chapters = useMemo(() => {
    return ["all", ...new Set(questions.map((question) => question.chapter))];
  }, [questions]);

  const tags = useMemo(() => {
    return ["all", ...new Set(questions.flatMap((question) => [question.primaryTag, question.secondaryTag]))];
  }, [questions]);

  const filteredQuestions = useMemo(() => {
    const query = filters.query.trim().toLowerCase();

    return questions.filter((question) => {
      const queryMatches =
        query.length === 0 ||
        question.id.toLowerCase().includes(query) ||
        question.uniqueKey.toLowerCase().includes(query) ||
        question.subject.toLowerCase().includes(query) ||
        question.chapter.toLowerCase().includes(query) ||
        question.prompt.toLowerCase().includes(query) ||
        question.primaryTag.toLowerCase().includes(query) ||
        question.secondaryTag.toLowerCase().includes(query);

      const subjectMatches = filters.subject === "all" || question.subject === filters.subject;
      const chapterMatches = filters.chapter === "all" || question.chapter === filters.chapter;
      const difficultyMatches = filters.difficulty === "all" || question.difficulty === filters.difficulty;
      const tagMatches =
        filters.tag === "all" ||
        question.primaryTag === filters.tag ||
        question.secondaryTag === filters.tag;
      const thermalMatches = filters.thermalState === "all" || question.thermalState === filters.thermalState;

      return queryMatches && subjectMatches && chapterMatches && difficultyMatches && tagMatches && thermalMatches;
    });
  }, [filters, questions]);

  const paginatedQuestions = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredQuestions.slice(start, start + PAGE_SIZE);
  }, [filteredQuestions, page]);

  function handleIndexedFiltersSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setInlineMessage("Indexed filters applied with paginated question library view.");
    setErrorMessage(null);
  }

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
      setUploadValidation(validation);

      const nextLog: UploadLogRecord = {
        errors: validation.errors.length + validation.rowErrors.length,
        id: `upl-${Date.now()}`,
        timestamp: new Date().toISOString(),
        totalRows: validation.totalRows,
        uploadedBy: "admin@parabolic.local",
        versionCreated: 0,
        warnings: validation.warnings.length,
      };

      setUploadLogs((current) => [nextLog, ...current]);
      setInlineMessage(
        validation.errors.length > 0 || validation.rowErrors.length > 0 ?
          `Validated ${selectedUploadFile.name}. Package-level issues: ${validation.errors.length}; row-level issues: ${validation.rowErrors.length}. Download the CSV to resolve before any import.` :
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

  function clearUploadValidation() {
    setSelectedUploadFile(null);
    setUploadValidation(null);
    setErrorMessage(null);
    setInlineMessage("Question library uses indexed filter inputs with paginated results and immutable structural lock cues.");
  }

  function createQuestionVersion(questionId: string) {
    const target = questions.find((question) => question.id === questionId);
    if (!target) {
      return;
    }

    if (target.usedCount === 0) {
      setInlineMessage("Versioning is required only for structural changes on questions used in assigned runs.");
      setErrorMessage(null);
      return;
    }

    const newVersionId = `${target.id}-v${target.version + 1}`;
    const nextQuestion: QuestionBankRecord = {
      ...target,
      id: newVersionId,
      uniqueKey: `${target.uniqueKey}-v${target.version + 1}`,
      version: target.version + 1,
      usedCount: 0,
      thermalState: "warm",
      status: "active",
    };

    setQuestions((current) => [
      nextQuestion,
      ...current.map((question): QuestionBankRecord => (
        question.id === target.id ? { ...question, status: "deprecated" as const } : question
      )),
    ]);
    setInlineMessage(`Created version ${nextQuestion.version} for ${target.id}. Previous version marked deprecated.`);
    setErrorMessage(null);
  }

  function requestStructuralEdit(question: QuestionBankRecord) {
    if (question.usedCount > 0) {
      setErrorMessage("Structural fields are locked once a question is used in assigned runs. Use Create Version instead.");
      return;
    }

    setInlineMessage(`Structural edit allowed for ${question.id}; no assigned-run linkage detected.`);
    setErrorMessage(null);
  }

  function applyTagOperation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const primary = tagPrimaryValue.trim().toLowerCase();
    const secondary = tagSecondaryValue.trim().toLowerCase();

    if (primary.length === 0) {
      setErrorMessage("Provide at least one tag value to perform tag management operations.");
      return;
    }

    if (tagOperation === "create") {
      if (tagRecords.some((tag) => tag.name.toLowerCase() === primary)) {
        setErrorMessage("Tag already exists.");
        return;
      }

      setTagRecords((current) => [
        ...current,
        {
          id: `tag-${Date.now()}`,
          name: primary,
          status: "active",
          usedInActiveTemplate: false,
        },
      ]);
      setInlineMessage(`Tag ${primary} created for future question and analytics usage.`);
      setErrorMessage(null);
      setTagPrimaryValue("");
      return;
    }

    const target = tagRecords.find((tag) => tag.name.toLowerCase() === primary);
    if (!target) {
      setErrorMessage("Primary tag not found.");
      return;
    }

    if (tagOperation === "rename") {
      if (secondary.length === 0) {
        setErrorMessage("Provide the new tag name for rename.");
        return;
      }

      setTagRecords((current) => current.map((tag) => (
        tag.id === target.id ? { ...tag, name: secondary } : tag
      )));
      setInlineMessage(`Tag ${primary} renamed to ${secondary}.`);
      setErrorMessage(null);
      setTagPrimaryValue("");
      setTagSecondaryValue("");
      return;
    }

    if (tagOperation === "merge") {
      if (secondary.length === 0) {
        setErrorMessage("Provide destination tag for merge.");
        return;
      }

      if (!tagRecords.some((tag) => tag.name.toLowerCase() === secondary)) {
        setErrorMessage("Destination tag does not exist.");
        return;
      }

      setTagRecords((current) => current.map((tag) => (
        tag.id === target.id ? { ...tag, status: "deprecated" } : tag
      )));
      setInlineMessage(`Merged ${primary} into ${secondary}. Source tag marked deprecated for future use.`);
      setErrorMessage(null);
      setTagPrimaryValue("");
      setTagSecondaryValue("");
      return;
    }

    if (target.usedInActiveTemplate) {
      setErrorMessage("Cannot deprecate a tag referenced by active templates.");
      return;
    }

    setTagRecords((current) => current.map((tag) => (
      tag.id === target.id ? { ...tag, status: "deprecated" } : tag
    )));
    setInlineMessage(`Tag ${primary} deprecated. Future templates can exclude this tag.`);
    setErrorMessage(null);
    setTagPrimaryValue("");
    setTagSecondaryValue("");
  }

  const questionColumns: UiTableColumn<QuestionBankRecord>[] = [
    {
      id: "uniqueKey",
      header: "UniqueKey",
      render: (question) => (
        <div className="admin-tests-template-cell">
          <strong>{question.id}</strong>
          <small>{question.uniqueKey}</small>
        </div>
      ),
    },
    {
      id: "subject",
      header: "Subject / Chapter",
      render: (question) => `${question.subject} / ${question.chapter}`,
    },
    {
      id: "difficulty",
      header: "Difficulty",
      render: (question) => question.difficulty,
    },
    {
      id: "tags",
      header: "Tags",
      render: (question) => `${question.primaryTag}, ${question.secondaryTag}`,
    },
    {
      id: "usage",
      header: "Used / Version / Tier",
      render: (question) => `${question.usedCount} / v${question.version} / ${question.thermalState}`,
    },
    {
      id: "status",
      header: "Status",
      render: (question) => (
        <span className={`admin-tests-status admin-tests-status-${question.status}`}>{question.status}</span>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      className: "admin-tests-actions-col",
      render: (question) => {
        const structuralLocked = question.usedCount > 0;
        return (
          <div className="admin-tests-row-actions">
            <button type="button" onClick={() => requestStructuralEdit(question)}>
              {structuralLocked ? "Structure Locked" : "Edit Structure"}
            </button>
            <button
              type="button"
              onClick={() => {
                setInlineMessage(
                  `Metadata warning: edits to tags/notes for ${question.id} affect future solution view only.`,
                );
                setErrorMessage(null);
              }}
            >
              Edit Metadata
            </button>
            <button type="button" onClick={() => createQuestionVersion(question.id)} disabled={!structuralLocked}>
              Create Version
            </button>
          </div>
        );
      },
    },
  ];

  const uploadLogColumns: UiTableColumn<UploadLogRecord>[] = [
    { id: "id", header: "Upload ID", render: (log) => log.id },
    { id: "uploadedBy", header: "Uploaded By", render: (log) => log.uploadedBy },
    { id: "timestamp", header: "Date", render: (log) => formatIsoDate(log.timestamp) },
    { id: "totalRows", header: "Rows", render: (log) => log.totalRows },
    { id: "issues", header: "Errors / Warnings", render: (log) => `${log.errors} / ${log.warnings}` },
    { id: "versionCreated", header: "Version", render: (log) => log.versionCreated },
  ];

  return (
    <section className="admin-content-card" aria-labelledby="admin-question-bank-title">
      <p className="admin-content-eyebrow">Build 118</p>
      <h2 id="admin-question-bank-title">Question Bank Management UI</h2>
      <p className="admin-content-copy">
        Upload question packages, manage indexed library filters, enforce structural immutability rules, and maintain
        governed tags.
      </p>

      <p className="admin-tests-inline-note">{inlineMessage}</p>
      {errorMessage ? <p className="admin-tests-inline-error">{errorMessage}</p> : null}

      <div className="admin-tests-grid">
        <UiForm
          title="Upload Question Package"
          description="ZIP upload now validates root packaging, workbook sheets, workbook image references, and row-level schema errors before any import can proceed."
          submitLabel={isValidatingUpload ? "Validating..." : "Validate ZIP Package"}
          onSubmit={handleUploadSubmit}
          footer={
            <span className="admin-tests-form-footnote">
              Validation rejects nested folders, blocks external image URLs, and generates a downloadable row-level CSV error report. No partial commit.
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

        <UiForm
          title="Tag Management"
          description="Supported operations: Create, Rename, Merge, Deprecate."
          submitLabel="Apply Tag Operation"
          onSubmit={applyTagOperation}
          footer={<span className="admin-tests-form-footnote">Delete is blocked when tag is used in active templates.</span>}
        >
          <UiFormField label="Operation" htmlFor="admin-tag-operation">
            <select
              id="admin-tag-operation"
              value={tagOperation}
              onChange={(event) => setTagOperation(event.target.value as TagOperation)}
            >
              <option value="create">Create</option>
              <option value="rename">Rename</option>
              <option value="merge">Merge</option>
              <option value="deprecate">Deprecate</option>
            </select>
          </UiFormField>
          <UiFormField label="Primary Tag" htmlFor="admin-tag-primary">
            <input
              id="admin-tag-primary"
              type="text"
              value={tagPrimaryValue}
              onChange={(event) => setTagPrimaryValue(event.target.value)}
              placeholder="motion"
            />
          </UiFormField>
          <UiFormField label="Secondary Tag" htmlFor="admin-tag-secondary">
            <input
              id="admin-tag-secondary"
              type="text"
              value={tagSecondaryValue}
              onChange={(event) => setTagSecondaryValue(event.target.value)}
              placeholder="Required for rename/merge"
            />
          </UiFormField>
          <div className="admin-question-tag-chips" role="list" aria-label="Existing tags">
            {tagRecords.map((tag) => (
              <span key={tag.id} role="listitem" className={`admin-question-tag-chip admin-question-tag-chip-${tag.status}`}>
                {tag.name} ({tag.status})
              </span>
            ))}
          </div>
        </UiForm>
      </div>

      {uploadValidation ? (
        <section className="admin-question-validation-shell" aria-label="Question upload validation">
          <div className="admin-question-validation-grid">
            <article className="admin-question-validation-card">
              <h3>Package Status</h3>
              <p>{uploadValidation.errors.length > 0 || uploadValidation.rowErrors.length > 0 ? "Blocked" : "Ready for next validation stage"}</p>
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
        </section>
      ) : null}

      <UiForm
        title="Question Library (Indexed Filters)"
        description="Filter by indexed fields only: subject, chapter, difficulty, tag, thermal state and text query."
        submitLabel="Apply Filters"
        onSubmit={handleIndexedFiltersSubmit}
      >
        <div className="admin-tests-grid">
          <UiFormField label="Search" htmlFor="admin-question-filter-search">
            <input
              id="admin-question-filter-search"
              type="search"
              value={filters.query}
              onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
              placeholder="id, key, subject, chapter, prompt"
            />
          </UiFormField>
          <UiFormField label="Subject" htmlFor="admin-question-filter-subject">
            <select
              id="admin-question-filter-subject"
              value={filters.subject}
              onChange={(event) => setFilters((current) => ({ ...current, subject: event.target.value }))}
            >
              {subjects.map((subject) => (
                <option key={subject} value={subject}>
                  {subject}
                </option>
              ))}
            </select>
          </UiFormField>
          <UiFormField label="Chapter" htmlFor="admin-question-filter-chapter">
            <select
              id="admin-question-filter-chapter"
              value={filters.chapter}
              onChange={(event) => setFilters((current) => ({ ...current, chapter: event.target.value }))}
            >
              {chapters.map((chapter) => (
                <option key={chapter} value={chapter}>
                  {chapter}
                </option>
              ))}
            </select>
          </UiFormField>
          <UiFormField label="Difficulty" htmlFor="admin-question-filter-difficulty">
            <select
              id="admin-question-filter-difficulty"
              value={filters.difficulty}
              onChange={(event) => setFilters((current) => ({
                ...current,
                difficulty: event.target.value as "all" | DifficultyLevel,
              }))}
            >
              <option value="all">all</option>
              {DIFFICULTY_LEVELS.map((difficulty) => (
                <option key={difficulty} value={difficulty}>
                  {difficulty}
                </option>
              ))}
            </select>
          </UiFormField>
          <UiFormField label="Tag" htmlFor="admin-question-filter-tag">
            <select
              id="admin-question-filter-tag"
              value={filters.tag}
              onChange={(event) => setFilters((current) => ({ ...current, tag: event.target.value }))}
            >
              {tags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </UiFormField>
          <UiFormField label="HOT/WARM/COLD" htmlFor="admin-question-filter-thermal">
            <select
              id="admin-question-filter-thermal"
              value={filters.thermalState}
              onChange={(event) => setFilters((current) => ({
                ...current,
                thermalState: event.target.value as "all" | "hot" | "warm" | "cold",
              }))}
            >
              <option value="all">all</option>
              <option value="hot">hot</option>
              <option value="warm">warm</option>
              <option value="cold">cold</option>
            </select>
          </UiFormField>
        </div>
      </UiForm>

      <UiTable
        caption="Question Library"
        columns={questionColumns}
        rows={paginatedQuestions}
        rowKey={(row) => row.id}
        emptyStateText="No questions match the indexed filters."
      />
      <UiPagination
        page={page}
        pageSize={PAGE_SIZE}
        totalItems={filteredQuestions.length}
        onPageChange={setPage}
      />

      <UiTable
        caption="Question Upload Logs"
        columns={uploadLogColumns}
        rows={uploadLogs}
        rowKey={(row) => row.id}
        emptyStateText="No package uploads yet."
      />
    </section>
  );
}

export default QuestionBankManagementPage;
