import { useState, type FormEvent } from "react";
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
  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null);
  const [uploadExamType, setUploadExamType] = useState<ExamType>("JEEMains");
  const [uploadLogs, setUploadLogs] = useState<UploadLogRecord[]>([]);
  const [uploadValidation, setUploadValidation] = useState<QuestionPackageValidationResult | null>(null);
  const [isValidatingUpload, setIsValidatingUpload] = useState(false);
  const [inlineMessage, setInlineMessage] = useState(
    "Upload Package now runs as its own workspace with navigation back to the other Question Bank routes.",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
