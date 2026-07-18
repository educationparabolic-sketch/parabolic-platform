import { useEffect, useMemo, useState } from "react";
import { NavLink, useParams } from "react-router-dom";
import { UiChartContainer, UiTable, type UiChartPoint, type UiTableColumn } from "../../../../../shared/ui/components";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import type { LicenseLayer } from "../../../../../shared/types/portalRouting";
import {
  ApiClientError,
  FALLBACK_DATASET,
  fetchDashboardDataset,
  shouldUseLiveApi,
  type DashboardDataset,
  type RiskCluster,
  type RunAnalyticsRecord,
  type StudentAnalyticsRecord,
} from "../analytics/analyticsDataset";
import { resolveAdminAccessContext } from "../../portals/adminAccess";
import AssignmentsWorkspaceNav from "./AssignmentsWorkspaceNav";

type ExecutionMode = "Operational" | "Controlled" | "Focused" | "Hard";
type RunStatus = "Upcoming" | "Live" | "Completed" | "Stopped" | "Cancelled";

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

function downloadBlob(blob: Blob, fileName: string): void {
  const downloadUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = downloadUrl;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(downloadUrl);
}

function toArrayBufferSlice(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function toPdfText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function buildSimplePdf(lines: string[]): Uint8Array {
  const encoder = new TextEncoder();
  const contentLines = ["BT", "/F1 11 Tf", "50 790 Td", "14 TL"];
  lines.forEach((line, index) => {
    if (index === 0) {
      contentLines.push(`(${toPdfText(line)}) Tj`);
    } else {
      contentLines.push(`T* (${toPdfText(line)}) Tj`);
    }
  });
  contentLines.push("ET");
  const streamContent = contentLines.join("\n");

  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    `5 0 obj\n<< /Length ${encoder.encode(streamContent).length} >>\nstream\n${streamContent}\nendstream\nendobj\n`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object) => {
    offsets.push(pdf.length);
    pdf += object;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return encoder.encode(pdf);
}

function buildLayerAwareQuestionColumns(layer: LicenseLayer | null): string[] {
  const l0 = [
    "Assignment Name",
    "Run ID",
    "Student Name",
    "Student ID",
    "Batch",
    "Question ID",
    "Question No",
    "Subject",
    "Chapter",
    "Difficulty",
    "Correct Option",
    "Selected Option",
    "Is Correct",
    "Marks Awarded",
    "Skipped",
  ];
  const l1 = [
    "Time Spent Seconds",
    "Phase",
    "Final Answer Status",
  ];
  const l2 = [
    "Min Time Expected",
    "Max Time Expected",
    "Min Time Violation",
    "Max Time Violation",
  ];

  if (layer === "L0") {
    return l0;
  }
  if (layer === "L1") {
    return [...l0, ...l1];
  }
  return [...l0, ...l1, ...l2];
}

function buildLayerAwareSummaryColumns(layer: LicenseLayer | null): string[] {
  const l0 = [
    "Student Name",
    "Student ID",
    "Batch",
    "Attempted Questions",
    "Correct Questions",
    "Wrong Questions",
    "Skipped Questions",
    "Raw Score %",
    "Accuracy %",
  ];
  const l1 = [
    "Phase Adherence %",
    "Easy Neglect %",
    "Hard Bias %",
  ];
  const l2 = [
    "Discipline Index",
    "Guess Rate %",
    "Risk State",
  ];

  if (layer === "L0") {
    return l0;
  }
  if (layer === "L1") {
    return [...l0, ...l1];
  }
  return [...l0, ...l1, ...l2];
}

function buildConsolidatedResultWorkbookXlsx(
  run: AssignmentDetailRecord,
  layer: LicenseLayer | null,
): Uint8Array {
  const questionColumns = buildLayerAwareQuestionColumns(layer);
  const summaryColumns = buildLayerAwareSummaryColumns(layer);

  const questionRowsBase = [
    {
      "Assignment Name": run.runName,
      "Run ID": run.runId,
      "Student Name": "Aarav Shah",
      "Student ID": "STU-001",
      Batch: "Batch-A",
      "Question ID": "Q-101",
      "Question No": "1",
      Subject: "Physics",
      Chapter: "Electrostatics",
      Difficulty: "Medium",
      "Correct Option": "B",
      "Selected Option": "B",
      "Is Correct": "Yes",
      "Marks Awarded": "4",
      Skipped: "No",
      "Time Spent Seconds": "82",
      Phase: "P1",
      "Final Answer Status": "Submitted",
      "Min Time Expected": "45",
      "Max Time Expected": "120",
      "Min Time Violation": "No",
      "Max Time Violation": "No",
    },
    {
      "Assignment Name": run.runName,
      "Run ID": run.runId,
      "Student Name": "Aarav Shah",
      "Student ID": "STU-001",
      Batch: "Batch-A",
      "Question ID": "Q-102",
      "Question No": "2",
      Subject: "Chemistry",
      Chapter: "Organic Chemistry",
      Difficulty: "Hard",
      "Correct Option": "D",
      "Selected Option": "C",
      "Is Correct": "No",
      "Marks Awarded": "-1",
      Skipped: "No",
      "Time Spent Seconds": "136",
      Phase: "P2",
      "Final Answer Status": "Submitted",
      "Min Time Expected": "90",
      "Max Time Expected": "180",
      "Min Time Violation": "No",
      "Max Time Violation": "No",
    },
    {
      "Assignment Name": run.runName,
      "Run ID": run.runId,
      "Student Name": "Riya Patel",
      "Student ID": "STU-002",
      Batch: "Batch-A",
      "Question ID": "Q-101",
      "Question No": "1",
      Subject: "Physics",
      Chapter: "Electrostatics",
      Difficulty: "Medium",
      "Correct Option": "B",
      "Selected Option": "A",
      "Is Correct": "No",
      "Marks Awarded": "-1",
      Skipped: "No",
      "Time Spent Seconds": "61",
      Phase: "P1",
      "Final Answer Status": "Submitted",
      "Min Time Expected": "45",
      "Max Time Expected": "120",
      "Min Time Violation": "No",
      "Max Time Violation": "No",
    },
  ];

  const summaryRowsBase = [
    {
      "Student Name": "Aarav Shah",
      "Student ID": "STU-001",
      Batch: "Batch-A",
      "Attempted Questions": "90",
      "Correct Questions": "54",
      "Wrong Questions": "21",
      "Skipped Questions": "15",
      "Raw Score %": "61",
      "Accuracy %": "66",
      "Phase Adherence %": "69",
      "Easy Neglect %": "18",
      "Hard Bias %": "21",
      "Discipline Index": "62",
      "Guess Rate %": "16",
      "Risk State": "moderate",
    },
    {
      "Student Name": "Riya Patel",
      "Student ID": "STU-002",
      Batch: "Batch-A",
      "Attempted Questions": "90",
      "Correct Questions": "58",
      "Wrong Questions": "17",
      "Skipped Questions": "15",
      "Raw Score %": "65",
      "Accuracy %": "71",
      "Phase Adherence %": "73",
      "Easy Neglect %": "12",
      "Hard Bias %": "18",
      "Discipline Index": "68",
      "Guess Rate %": "11",
      "Risk State": "low",
    },
  ];

  const questionRows = [
    questionColumns,
    ...questionRowsBase.map((row) => questionColumns.map((column) => row[column as keyof typeof row] ?? "")),
  ];
  const summaryRows = [
    summaryColumns,
    ...summaryRowsBase.map((row) => summaryColumns.map((column) => row[column as keyof typeof row] ?? "")),
  ];
  const notesRows = [
    ["Topic", "Value"],
    ["Workbook Type", "Sample consolidated assignment result export"],
    ["Run ID", run.runId],
    ["Assignment Name", run.runName],
    ["License Layer", layer ?? "L0"],
    ["Rule", describeExcelScopeForLayer(layer)],
    ["Sheets", "Question Responses, Student Summary, Notes"],
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
    '<sheets><sheet name="Question Responses" sheetId="1" r:id="rId1"/><sheet name="Student Summary" sheetId="2" r:id="rId2"/><sheet name="Notes" sheetId="3" r:id="rId3"/></sheets>' +
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
    { name: "xl/worksheets/sheet3.xml", content: buildWorksheetXml(notesRows) },
  ]);
}

interface AssignmentDetailRecord {
  runId: string;
  runName: string;
  templateId: string;
  canonicalId: string;
  templateName: string;
  academicYear: string;
  mode: ExecutionMode;
  status: RunStatus;
  batchName: string;
  recipientCount: number;
  completionPercent: number;
  startWindowIso: string;
  endWindowIso: string;
  timezone: string;
  attemptLimit: number;
  gracePeriodMinutes: number;
  shuffleEnabled: boolean;
  phaseConfigSnapshot: string;
  timingProfileSnapshot: string;
  analytics: {
    avgRawScorePercent: number;
    avgAccuracyPercent: number;
    avgPhaseAdherencePercent: number;
    easyNeglectPercent: number;
    hardBiasPercent: number;
    riskDistributionSummary: string;
    avgDisciplineIndex: number;
    controlledCompliancePercent: number;
    guessRatePercent: number;
    executionStabilityIndex: number;
    executionStabilityBadge: string;
    overrideCount: number;
  };
}

interface AssignmentAttentionStudentRecord {
  runId: string;
  studentId: string;
  studentName: string;
  batchName: string;
  rawScorePercent: number;
  accuracyPercent: number;
  phaseAdherencePercent: number;
  riskState: RiskCluster;
  disciplineIndex: number;
}

type AssignmentPerformanceStudentRecord = AssignmentAttentionStudentRecord;

interface AssignmentAbsentStudentRecord {
  runId: string;
  studentId: string;
  studentName: string;
  batchName: string;
  attendanceState: "Absent";
}

const FALLBACK_ASSIGNMENT_DETAILS: AssignmentDetailRecord[] = [
  {
    runId: "run-2026-0416-003",
    runName: "Run 2026-0416-003",
    templateId: "tmpl-002",
    canonicalId: "canon-neet-2026-bio",
    templateName: "NEET Revision - Biology Focus",
    academicYear: "2026",
    mode: "Controlled",
    status: "Live",
    batchName: "Batch-C",
    recipientCount: 3,
    completionPercent: 64,
    startWindowIso: "2026-04-16T04:00:00.000Z",
    endWindowIso: "2026-04-16T07:00:00.000Z",
    timezone: "Asia/Kolkata",
    attemptLimit: 1,
    gracePeriodMinutes: 15,
    shuffleEnabled: true,
    phaseConfigSnapshot: "P1 30% | P2 35% | P3 35%",
    timingProfileSnapshot: "Easy 35-75s | Medium 65-105s | Hard 95-150s",
    analytics: {
      avgRawScorePercent: 63,
      avgAccuracyPercent: 68,
      avgPhaseAdherencePercent: 71,
      easyNeglectPercent: 14,
      hardBiasPercent: 23,
      riskDistributionSummary: "L 34% / M 40% / H 20% / C 6%",
      avgDisciplineIndex: 66,
      controlledCompliancePercent: 87,
      guessRatePercent: 12,
      executionStabilityIndex: 68,
      executionStabilityBadge: "Drift",
      overrideCount: 1,
    },
  },
  {
    runId: "run-2026-0411-001",
    runName: "Run 2026-0411-001",
    templateId: "tmpl-001",
    canonicalId: "canon-jee-2026-a",
    templateName: "JEE Mains Mock - Set A",
    academicYear: "2026",
    mode: "Controlled",
    status: "Completed",
    batchName: "Batch-A, Batch-B",
    recipientCount: 6,
    completionPercent: 100,
    startWindowIso: "2026-04-11T03:30:00.000Z",
    endWindowIso: "2026-04-11T06:30:00.000Z",
    timezone: "Asia/Kolkata",
    attemptLimit: 1,
    gracePeriodMinutes: 10,
    shuffleEnabled: false,
    phaseConfigSnapshot: "P1 34% | P2 33% | P3 33%",
    timingProfileSnapshot: "Easy 45-90s | Medium 75-120s | Hard 105-180s",
    analytics: {
      avgRawScorePercent: 61,
      avgAccuracyPercent: 66,
      avgPhaseAdherencePercent: 69,
      easyNeglectPercent: 18,
      hardBiasPercent: 21,
      riskDistributionSummary: "L 28% / M 42% / H 21% / C 9%",
      avgDisciplineIndex: 62,
      controlledCompliancePercent: 82,
      guessRatePercent: 16,
      executionStabilityIndex: 74,
      executionStabilityBadge: "Stable",
      overrideCount: 3,
    },
  },
  {
    runId: "run-2026-0408-009",
    runName: "Run 2026-0408-009",
    templateId: "tmpl-001",
    canonicalId: "canon-jee-2026-a",
    templateName: "JEE Mains Mock - Set A",
    academicYear: "2026",
    mode: "Operational",
    status: "Upcoming",
    batchName: "Batch-A",
    recipientCount: 4,
    completionPercent: 0,
    startWindowIso: "2026-04-18T03:30:00.000Z",
    endWindowIso: "2026-04-18T06:30:00.000Z",
    timezone: "Asia/Kolkata",
    attemptLimit: 1,
    gracePeriodMinutes: 10,
    shuffleEnabled: false,
    phaseConfigSnapshot: "P1 34% | P2 33% | P3 33%",
    timingProfileSnapshot: "Easy 45-90s | Medium 75-120s | Hard 105-180s",
    analytics: {
      avgRawScorePercent: 0,
      avgAccuracyPercent: 0,
      avgPhaseAdherencePercent: 0,
      easyNeglectPercent: 0,
      hardBiasPercent: 0,
      riskDistributionSummary: "Not available until completion",
      avgDisciplineIndex: 0,
      controlledCompliancePercent: 0,
      guessRatePercent: 0,
      executionStabilityIndex: 0,
      executionStabilityBadge: "Pending",
      overrideCount: 0,
    },
  },
];

const FALLBACK_ASSIGNMENT_ATTENTION_STUDENTS: AssignmentAttentionStudentRecord[] = [
  {
    runId: "run-2026-0411-001",
    studentId: "STU-011",
    studentName: "Riya Nair",
    batchName: "Batch-A",
    rawScorePercent: 48,
    accuracyPercent: 58,
    phaseAdherencePercent: 61,
    riskState: "high",
    disciplineIndex: 49,
  },
  {
    runId: "run-2026-0411-001",
    studentId: "STU-012",
    studentName: "Aditya Rao",
    batchName: "Batch-A",
    rawScorePercent: 56,
    accuracyPercent: 62,
    phaseAdherencePercent: 53,
    riskState: "critical",
    disciplineIndex: 42,
  },
  {
    runId: "run-2026-0411-001",
    studentId: "STU-013",
    studentName: "Mehul Jain",
    batchName: "Batch-B",
    rawScorePercent: 59,
    accuracyPercent: 67,
    phaseAdherencePercent: 57,
    riskState: "medium",
    disciplineIndex: 54,
  },
  {
    runId: "run-2026-0416-003",
    studentId: "STU-021",
    studentName: "Priya Menon",
    batchName: "Batch-C",
    rawScorePercent: 64,
    accuracyPercent: 71,
    phaseAdherencePercent: 73,
    riskState: "medium",
    disciplineIndex: 68,
  },
  {
    runId: "run-2026-0416-003",
    studentId: "STU-022",
    studentName: "Arjun Das",
    batchName: "Batch-C",
    rawScorePercent: 54,
    accuracyPercent: 63,
    phaseAdherencePercent: 58,
    riskState: "high",
    disciplineIndex: 57,
  },
  {
    runId: "run-2026-0416-003",
    studentId: "STU-023",
    studentName: "Sara Khan",
    batchName: "Batch-C",
    rawScorePercent: 46,
    accuracyPercent: 51,
    phaseAdherencePercent: 49,
    riskState: "critical",
    disciplineIndex: 41,
  },
];

const FALLBACK_ASSIGNMENT_PERFORMANCE_STUDENTS: AssignmentPerformanceStudentRecord[] = [
  {
    runId: "run-2026-0411-001",
    studentId: "STU-101",
    studentName: "Aarav Menon",
    batchName: "Batch-A",
    rawScorePercent: 86,
    accuracyPercent: 91,
    phaseAdherencePercent: 84,
    riskState: "low",
    disciplineIndex: 82,
  },
  {
    runId: "run-2026-0411-001",
    studentId: "STU-102",
    studentName: "Kabir Gupta",
    batchName: "Batch-A",
    rawScorePercent: 81,
    accuracyPercent: 86,
    phaseAdherencePercent: 79,
    riskState: "low",
    disciplineIndex: 78,
  },
  {
    runId: "run-2026-0411-001",
    studentId: "STU-103",
    studentName: "Mira Shah",
    batchName: "Batch-B",
    rawScorePercent: 74,
    accuracyPercent: 79,
    phaseAdherencePercent: 76,
    riskState: "medium",
    disciplineIndex: 72,
  },
  {
    runId: "run-2026-0411-001",
    studentId: "STU-104",
    studentName: "Diya Sharma",
    batchName: "Batch-B",
    rawScorePercent: 68,
    accuracyPercent: 73,
    phaseAdherencePercent: 71,
    riskState: "medium",
    disciplineIndex: 68,
  },
  {
    runId: "run-2026-0411-001",
    studentId: "STU-105",
    studentName: "Rahul Sethi",
    batchName: "Batch-B",
    rawScorePercent: 63,
    accuracyPercent: 70,
    phaseAdherencePercent: 66,
    riskState: "medium",
    disciplineIndex: 63,
  },
  {
    runId: "run-2026-0411-001",
    studentId: "STU-011",
    studentName: "Riya Nair",
    batchName: "Batch-A",
    rawScorePercent: 48,
    accuracyPercent: 58,
    phaseAdherencePercent: 61,
    riskState: "high",
    disciplineIndex: 49,
  },
  {
    runId: "run-2026-0411-001",
    studentId: "STU-012",
    studentName: "Aditya Rao",
    batchName: "Batch-A",
    rawScorePercent: 56,
    accuracyPercent: 62,
    phaseAdherencePercent: 53,
    riskState: "critical",
    disciplineIndex: 42,
  },
  {
    runId: "run-2026-0411-001",
    studentId: "STU-013",
    studentName: "Mehul Jain",
    batchName: "Batch-B",
    rawScorePercent: 59,
    accuracyPercent: 67,
    phaseAdherencePercent: 57,
    riskState: "medium",
    disciplineIndex: 54,
  },
  {
    runId: "run-2026-0416-003",
    studentId: "STU-201",
    studentName: "Priya Menon",
    batchName: "Batch-C",
    rawScorePercent: 72,
    accuracyPercent: 78,
    phaseAdherencePercent: 73,
    riskState: "medium",
    disciplineIndex: 68,
  },
  {
    runId: "run-2026-0416-003",
    studentId: "STU-202",
    studentName: "Arjun Das",
    batchName: "Batch-C",
    rawScorePercent: 54,
    accuracyPercent: 63,
    phaseAdherencePercent: 58,
    riskState: "high",
    disciplineIndex: 57,
  },
  {
    runId: "run-2026-0416-003",
    studentId: "STU-203",
    studentName: "Sara Khan",
    batchName: "Batch-C",
    rawScorePercent: 46,
    accuracyPercent: 51,
    phaseAdherencePercent: 49,
    riskState: "critical",
    disciplineIndex: 41,
  },
];

const FALLBACK_ASSIGNMENT_ABSENT_STUDENTS: AssignmentAbsentStudentRecord[] = [
  {
    runId: "run-2026-0411-001",
    studentId: "STU-106",
    studentName: "Neha Kulkarni",
    batchName: "Batch-A",
    attendanceState: "Absent",
  },
  {
    runId: "run-2026-0411-001",
    studentId: "STU-107",
    studentName: "Yash Verma",
    batchName: "Batch-B",
    attendanceState: "Absent",
  },
  {
    runId: "run-2026-0416-003",
    studentId: "STU-204",
    studentName: "Tanvi Joshi",
    batchName: "Batch-C",
    attendanceState: "Absent",
  },
];

function formatDateTime(value: string): string {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }

  const date = new Date(parsed);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function describeCompletionTone(value: number, status: RunStatus): string {
  if (status === "Upcoming") {
    return "Scheduled and waiting for students to begin.";
  }

  if (status === "Live") {
    if (value >= 75) {
      return "Most students are well into the paper.";
    }

    if (value >= 40) {
      return "The class is steadily moving through the paper.";
    }

    return "The run has started and early progress is still building.";
  }

  if (value >= 95) {
    return "Almost every assigned student completed the paper.";
  }

  if (value >= 70) {
    return "Completion is healthy, with a few students still missing.";
  }

  return "Completion is lower than expected and may need follow-up.";
}

function describeScoreTone(value: number): string {
  if (value >= 75) {
    return "Strong overall paper-level scoring.";
  }

  if (value >= 55) {
    return "A workable score range with room to improve.";
  }

  if (value > 0) {
    return "This paper likely felt demanding for the class.";
  }

  return "Scores will appear after attempts are submitted.";
}

function describeAccuracyTone(value: number): string {
  if (value >= 80) {
    return "Answer quality looks sharp and disciplined.";
  }

  if (value >= 65) {
    return "Accuracy is reasonably stable across the class.";
  }

  if (value > 0) {
    return "Accuracy suggests the class needs more checking discipline.";
  }

  return "Accuracy will appear after attempts are submitted.";
}

function describeDisciplineTone(value: number): string {
  if (value >= 75) {
    return "Students followed the expected execution rhythm well.";
  }

  if (value >= 55) {
    return "Execution discipline is acceptable but not yet tight.";
  }

  if (value > 0) {
    return "Execution drift is noticeable and may need intervention.";
  }

  return "Execution signals will appear once the assignment is attempted.";
}

function riskChipClass(riskState: RiskCluster): string {
  return `admin-risk-chip admin-risk-chip-${riskState}`;
}

function parsePhasePlanSnapshot(snapshot: string): UiChartPoint[] {
  return snapshot
    .split("|")
    .map((segment) => segment.trim())
    .map((segment) => {
      const match = segment.match(/^(P\d+)\s+(\d+)%$/i);
      if (!match) {
        return null;
      }

      return {
        label: match[1].toUpperCase(),
        value: Number(match[2]),
      } satisfies UiChartPoint;
    })
    .filter((point): point is UiChartPoint => point !== null);
}

function parseRiskDistributionSnapshot(snapshot: string): UiChartPoint[] {
  return snapshot
    .split("/")
    .map((segment) => segment.trim())
    .map((segment) => {
      const match = segment.match(/^([A-Z])\s+(\d+)%$/i);
      if (!match) {
        return null;
      }

      const labelMap: Record<string, string> = {
        L: "Low",
        M: "Medium",
        H: "High",
        C: "Critical",
      };

      return {
        label: labelMap[match[1].toUpperCase()] ?? match[1].toUpperCase(),
        value: Number(match[2]),
      } satisfies UiChartPoint;
    })
    .filter((point): point is UiChartPoint => point !== null);
}

function isAttentionStudent(runSummary: StudentAnalyticsRecord["runSummaries"][number], isL2: boolean): boolean {
  return (
    runSummary.rawScorePercent < 60 ||
    runSummary.accuracyPercent < 65 ||
    runSummary.phaseAdherencePercent < 60 ||
    runSummary.riskState === "high" ||
    runSummary.riskState === "critical" ||
    (isL2 && runSummary.disciplineIndex < 55)
  );
}

function toExecutionMode(mode: string): ExecutionMode {
  if (mode === "Operational" || mode === "Controlled" || mode === "Focused" || mode === "Hard") {
    return mode;
  }

  return "Operational";
}

function inferRunStatus(record: RunAnalyticsRecord): RunStatus {
  if (record.completionRatePercent >= 100) {
    return "Completed";
  }

  return "Live";
}

function toRiskDistributionSummary(record: RunAnalyticsRecord): string {
  return `L ${Math.round(record.riskDistribution.low)}% / M ${Math.round(record.riskDistribution.medium)}% / H ${Math.round(record.riskDistribution.high)}% / C ${Math.round(record.riskDistribution.critical)}%`;
}

function toExecutionStabilityBadge(record: RunAnalyticsRecord): string {
  if (record.controlledCompliancePercent >= 80 && record.pacingGuardrailViolationPercent <= 12) {
    return "Stable";
  }

  if (record.controlledCompliancePercent >= 55 && record.pacingGuardrailViolationPercent <= 22) {
    return "Drift";
  }

  return "Escalated";
}

function buildDetailRecord(record: RunAnalyticsRecord, fallback?: AssignmentDetailRecord): AssignmentDetailRecord {
  return {
    runId: record.runId,
    runName: record.runName,
    templateId: fallback?.templateId ?? record.runId,
    canonicalId: fallback?.canonicalId ?? `analytics-${record.runId}`,
    templateName: fallback?.templateName ?? record.runName,
    academicYear: record.academicYear,
    mode: toExecutionMode(record.mode),
    status: fallback?.status ?? inferRunStatus(record),
    batchName: record.batchName,
    recipientCount: record.participants,
    completionPercent: Math.round(record.completionRatePercent),
    startWindowIso: record.startedAt,
    endWindowIso: fallback?.endWindowIso ?? new Date(Date.parse(record.startedAt) + 3 * 60 * 60 * 1000).toISOString(),
    timezone: fallback?.timezone ?? "Asia/Kolkata",
    attemptLimit: fallback?.attemptLimit ?? 1,
    gracePeriodMinutes: fallback?.gracePeriodMinutes ?? 0,
    shuffleEnabled: fallback?.shuffleEnabled ?? false,
    phaseConfigSnapshot: fallback?.phaseConfigSnapshot ?? "Captured from assigned template at scheduling",
    timingProfileSnapshot: fallback?.timingProfileSnapshot ?? "Captured from assigned template at scheduling",
    analytics: {
      avgRawScorePercent: Math.round(record.avgRawScorePercent),
      avgAccuracyPercent: Math.round(record.avgAccuracyPercent),
      avgPhaseAdherencePercent: Math.round(record.avgPhaseAdherencePercent),
      easyNeglectPercent: Math.round(record.easyNeglectPercent),
      hardBiasPercent: Math.round(record.hardBiasPercent),
      riskDistributionSummary: toRiskDistributionSummary(record),
      avgDisciplineIndex: Math.round(record.disciplineIndexAverage),
      controlledCompliancePercent: Math.round(record.controlledCompliancePercent),
      guessRatePercent: Math.round(record.guessRatePercent),
      executionStabilityIndex: Math.round(Math.max(0, Math.min(100, record.disciplineIndexAverage - record.guessRatePercent * 0.35))),
      executionStabilityBadge: toExecutionStabilityBadge(record),
      overrideCount: Math.round(record.structuralOverridePercent),
    },
  };
}

function statusClassName(status: RunStatus): string {
  switch (status) {
    case "Upcoming":
      return "admin-assignments-status admin-assignments-status-upcoming";
    case "Live":
      return "admin-assignments-status admin-assignments-status-live";
    case "Completed":
      return "admin-assignments-status admin-assignments-status-completed";
    case "Stopped":
      return "admin-assignments-status admin-assignments-status-stopped";
    default:
      return "admin-assignments-status admin-assignments-status-cancelled";
  }
}

function describeExcelScopeForLayer(layer: LicenseLayer | null): string {
  if (layer === "L0") {
    return "Includes only L0-safe student, question, answer, and scoring columns. No L1 or L2 behavior metrics are included.";
  }

  if (layer === "L1") {
    return "Includes L0 columns plus L1 pacing and behavior summary fields. L2 enforcement metrics remain excluded.";
  }

  return "Includes L0, L1, and L2 columns allowed by the current institute plan for the completed assignment export.";
}

function parseBatchNames(batchName: string): string[] {
  return batchName
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function AdminAssignmentDetailPage() {
  const { session } = useAuthProvider();
  const accessContext = resolveAdminAccessContext(session);
  const { runId = "" } = useParams<{ runId: string }>();
  const [dataset, setDataset] = useState<DashboardDataset>(FALLBACK_DATASET);
  const [isLoading, setIsLoading] = useState(true);
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function hydrate(): Promise<void> {
      setIsLoading(true);
      setInlineMessage(null);

      if (!shouldUseLiveApi()) {
        setDataset(FALLBACK_DATASET);
        setInlineMessage("Local mode detected. Loaded deterministic assignment detail fixtures.");
        setIsLoading(false);
        return;
      }

      try {
        const nextDataset = await fetchDashboardDataset();
        if (!isMounted) {
          return;
        }

        setDataset(nextDataset);
        setInlineMessage("Live mode enabled: assignment detail hydrated from GET /admin/analytics.");
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const reason = error instanceof ApiClientError ? error.message : "Failed to load assignment detail.";
        setDataset(FALLBACK_DATASET);
        setInlineMessage(`${reason} Falling back to deterministic assignment detail fixtures.`);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void hydrate();

    return () => {
      isMounted = false;
    };
  }, []);

  const selectedRun = useMemo(() => {
    const fallbackById = new Map(FALLBACK_ASSIGNMENT_DETAILS.map((record) => [record.runId, record]));
    const liveMatch = dataset.runAnalytics.find((record) => record.runId === runId);
    if (liveMatch) {
      return buildDetailRecord(liveMatch, fallbackById.get(runId));
    }

    return fallbackById.get(runId) ?? null;
  }, [dataset.runAnalytics, runId]);

  const phasePlanPieData = useMemo(
    () => (selectedRun ? parsePhasePlanSnapshot(selectedRun.phaseConfigSnapshot) : []),
    [selectedRun],
  );

  const riskDistributionPieData = useMemo(
    () => (selectedRun ? parseRiskDistributionSnapshot(selectedRun.analytics.riskDistributionSummary) : []),
    [selectedRun],
  );

  const attentionStudentRows = useMemo<AssignmentAttentionStudentRecord[]>(() => {
    if (!selectedRun) {
      return [];
    }

    const isL2 = accessContext.licenseLayer === "L2" || accessContext.licenseLayer === "L3";
    const derivedRows = dataset.studentAnalytics
      .map((student) => ({
        student,
        runSummary: student.runSummaries.find((summary) => summary.runId === selectedRun.runId) ?? null,
      }))
      .filter(
        (
          entry,
        ): entry is {
          student: StudentAnalyticsRecord;
          runSummary: StudentAnalyticsRecord["runSummaries"][number];
        } => Boolean(entry.runSummary),
      )
      .filter(({ runSummary }) => isAttentionStudent(runSummary, isL2))
      .map(({ student, runSummary }) => ({
        runId: selectedRun.runId,
        studentId: student.studentId,
        studentName: student.studentName,
        batchName: student.batchName,
        rawScorePercent: runSummary.rawScorePercent,
        accuracyPercent: runSummary.accuracyPercent,
        phaseAdherencePercent: runSummary.phaseAdherencePercent,
        riskState: runSummary.riskState,
        disciplineIndex: runSummary.disciplineIndex,
      }))
      .sort((left, right) => {
        const leftSeverity =
          (100 - left.rawScorePercent) +
          (100 - left.accuracyPercent) +
          (left.riskState === "critical" ? 35 : left.riskState === "high" ? 20 : left.riskState === "medium" ? 8 : 0) +
          (isL2 ? Math.max(0, 60 - left.disciplineIndex) : 0);
        const rightSeverity =
          (100 - right.rawScorePercent) +
          (100 - right.accuracyPercent) +
          (right.riskState === "critical" ? 35 : right.riskState === "high" ? 20 : right.riskState === "medium" ? 8 : 0) +
          (isL2 ? Math.max(0, 60 - right.disciplineIndex) : 0);
        return rightSeverity - leftSeverity;
      });

    if (derivedRows.length > 0) {
      return derivedRows;
    }

    return FALLBACK_ASSIGNMENT_ATTENTION_STUDENTS.filter((row) => row.runId === selectedRun.runId);
  }, [accessContext.licenseLayer, dataset.studentAnalytics, selectedRun]);

  const performanceStudentRows = useMemo<AssignmentPerformanceStudentRecord[]>(() => {
    if (!selectedRun) {
      return [];
    }

    const derivedRows = dataset.studentAnalytics
      .map((student) => ({
        student,
        runSummary: student.runSummaries.find((summary) => summary.runId === selectedRun.runId) ?? null,
      }))
      .filter(
        (
          entry,
        ): entry is {
          student: StudentAnalyticsRecord;
          runSummary: StudentAnalyticsRecord["runSummaries"][number];
        } => Boolean(entry.runSummary),
      )
      .map(({ student, runSummary }) => ({
        runId: selectedRun.runId,
        studentId: student.studentId,
        studentName: student.studentName,
        batchName: student.batchName,
        rawScorePercent: runSummary.rawScorePercent,
        accuracyPercent: runSummary.accuracyPercent,
        phaseAdherencePercent: runSummary.phaseAdherencePercent,
        riskState: runSummary.riskState,
        disciplineIndex: runSummary.disciplineIndex,
      }));

    if (derivedRows.length > 0) {
      return derivedRows;
    }

    return FALLBACK_ASSIGNMENT_PERFORMANCE_STUDENTS.filter((row) => row.runId === selectedRun.runId);
  }, [dataset.studentAnalytics, selectedRun]);

  const topPerformerRows = useMemo(
    () =>
      [...performanceStudentRows]
        .sort((left, right) => {
          const leftScore = (left.rawScorePercent * 0.55) + (left.accuracyPercent * 0.3) + (left.phaseAdherencePercent * 0.15);
          const rightScore = (right.rawScorePercent * 0.55) + (right.accuracyPercent * 0.3) + (right.phaseAdherencePercent * 0.15);
          return rightScore - leftScore;
        })
        .slice(0, 5),
    [performanceStudentRows],
  );

  const bottomPerformerRows = useMemo(
    () =>
      [...performanceStudentRows]
        .sort((left, right) => {
          const leftScore = (left.rawScorePercent * 0.55) + (left.accuracyPercent * 0.3) + (left.phaseAdherencePercent * 0.15);
          const rightScore = (right.rawScorePercent * 0.55) + (right.accuracyPercent * 0.3) + (right.phaseAdherencePercent * 0.15);
          return leftScore - rightScore;
        })
        .slice(0, 5),
    [performanceStudentRows],
  );

  const absentStudentRows = useMemo<AssignmentAbsentStudentRecord[]>(() => {
    if (!selectedRun) {
      return [];
    }

    const batchNames = new Set(parseBatchNames(selectedRun.batchName));
    const derivedRows = dataset.studentAnalytics
      .filter((student) => batchNames.has(student.batchName))
      .filter((student) => !student.runSummaries.some((summary) => summary.runId === selectedRun.runId))
      .map((student) => ({
        runId: selectedRun.runId,
        studentId: student.studentId,
        studentName: student.studentName,
        batchName: student.batchName,
        attendanceState: "Absent" as const,
      }));

    if (derivedRows.length > 0) {
      return derivedRows;
    }

    return FALLBACK_ASSIGNMENT_ABSENT_STUDENTS.filter((row) => row.runId === selectedRun.runId);
  }, [dataset.studentAnalytics, selectedRun]);

  const attentionStudentColumns = useMemo<UiTableColumn<AssignmentAttentionStudentRecord>[]>(() => {
    const isL2 = accessContext.licenseLayer === "L2" || accessContext.licenseLayer === "L3";
    const columns: UiTableColumn<AssignmentAttentionStudentRecord>[] = [
      {
        id: "student",
        header: "Student",
        render: (row) => (
          <div className="admin-assignments-attention-student-cell">
            <strong>{row.studentName}</strong>
            <small>{row.studentId}</small>
          </div>
        ),
      },
      {
        id: "batch",
        header: "Batch",
        render: (row) => row.batchName,
      },
      {
        id: "raw",
        header: "Raw %",
        render: (row) => `${row.rawScorePercent}%`,
      },
      {
        id: "accuracy",
        header: "Accuracy %",
        render: (row) => `${row.accuracyPercent}%`,
      },
      {
        id: "phase",
        header: "Phase Adherence",
        render: (row) => `${row.phaseAdherencePercent}%`,
      },
    ];

    if (isL2) {
      columns.push(
        {
          id: "risk",
          header: "Risk",
          render: (row) => <span className={riskChipClass(row.riskState)}>{row.riskState}</span>,
        },
        {
          id: "discipline",
          header: "Discipline",
          render: (row) => row.disciplineIndex,
        },
      );
    }

    columns.push({
      id: "action",
      header: "Action",
      render: (row) => <NavLink to={`/admin/students/${row.studentId}`}>Open Student</NavLink>,
    });

    return columns;
  }, [accessContext.licenseLayer]);

  const performanceStudentColumns = useMemo<UiTableColumn<AssignmentPerformanceStudentRecord>[]>(() => {
    const isL2 = accessContext.licenseLayer === "L2" || accessContext.licenseLayer === "L3";
    const columns: UiTableColumn<AssignmentPerformanceStudentRecord>[] = [
      {
        id: "student",
        header: "Student",
        render: (row) => (
          <div className="admin-assignments-attention-student-cell">
            <strong>{row.studentName}</strong>
            <small>{row.studentId}</small>
          </div>
        ),
      },
      {
        id: "batch",
        header: "Batch",
        render: (row) => row.batchName,
      },
      {
        id: "raw",
        header: "Raw %",
        render: (row) => `${row.rawScorePercent}%`,
      },
      {
        id: "accuracy",
        header: "Accuracy %",
        render: (row) => `${row.accuracyPercent}%`,
      },
      {
        id: "phase",
        header: "Phase",
        render: (row) => `${row.phaseAdherencePercent}%`,
      },
    ];

    if (isL2) {
      columns.push(
        {
          id: "risk",
          header: "Risk",
          render: (row) => <span className={riskChipClass(row.riskState)}>{row.riskState}</span>,
        },
        {
          id: "discipline",
          header: "Discipline",
          render: (row) => row.disciplineIndex,
        },
      );
    }

    columns.push({
      id: "action",
      header: "Action",
      render: (row) => <NavLink to={`/admin/students/${row.studentId}`}>Open Student</NavLink>,
    });

    return columns;
  }, [accessContext.licenseLayer]);

  const absentStudentColumns = useMemo<UiTableColumn<AssignmentAbsentStudentRecord>[]>(() => [
    {
      id: "student",
      header: "Student",
      render: (row) => (
        <div className="admin-assignments-attention-student-cell">
          <strong>{row.studentName}</strong>
          <small>{row.studentId}</small>
        </div>
      ),
    },
    {
      id: "batch",
      header: "Batch",
      render: (row) => row.batchName,
    },
    {
      id: "status",
      header: "Attendance",
      render: (row) => row.attendanceState,
    },
    {
      id: "action",
      header: "Action",
      render: (row) => <NavLink to={`/admin/students/${row.studentId}`}>Open Student</NavLink>,
    },
  ], []);

  function downloadSampleExcel(run: AssignmentDetailRecord) {
    const workbookBytes = buildConsolidatedResultWorkbookXlsx(run, accessContext.licenseLayer);
    const workbookBlob = new Blob([toArrayBufferSlice(workbookBytes)], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    downloadBlob(workbookBlob, `${run.runId}-sample-consolidated-result.xlsx`);
    setInlineMessage(`Downloaded sample Excel for ${run.runId} with ${accessContext.licenseLayer ?? "current"} layer-aware columns.`);
  }

  function downloadSamplePdf(run: AssignmentDetailRecord) {
    const pdfLines = [
      `Assignment Result Summary`,
      `Run: ${run.runName}`,
      `Run ID: ${run.runId}`,
      `Template: ${run.templateName}`,
      `Batch: ${run.batchName}`,
      `Mode: ${run.mode}`,
      `Completion: ${run.completionPercent}%`,
      `Avg Raw: ${run.analytics.avgRawScorePercent}%`,
      `Avg Accuracy: ${run.analytics.avgAccuracyPercent}%`,
      `Risk Distribution: ${run.analytics.riskDistributionSummary}`,
      `Layer Rule: ${describeExcelScopeForLayer(accessContext.licenseLayer)}`,
      `Sample PDF generated for testing only.`,
    ];
    const pdfBytes = buildSimplePdf(pdfLines);
    const pdfBlob = new Blob([toArrayBufferSlice(pdfBytes)], { type: "application/pdf" });
    downloadBlob(pdfBlob, `${run.runId}-sample-result-summary.pdf`);
    setInlineMessage(`Downloaded sample PDF for ${run.runId}.`);
  }

  if (!selectedRun && !isLoading) {
    return (
      <section className="admin-content-card" aria-labelledby="admin-assignment-detail-title">
        <p className="admin-content-eyebrow">Assignment Details</p>
        <h2 id="admin-assignment-detail-title">Assignment not found</h2>
        <p className="admin-content-copy">
          The requested assignment could not be found in the current detail dataset.
        </p>
        <AssignmentsWorkspaceNav />
        <div className="admin-tests-row-actions" style={{ marginTop: 16 }}>
          <NavLink to="/admin/assignments/list">Back to Assignment List</NavLink>
        </div>
      </section>
    );
  }

  return (
    <section className="admin-content-card admin-assignments-detail-shell" aria-labelledby="admin-assignment-detail-title">
      <p className="admin-content-eyebrow">Assignment Details</p>
      <h2 id="admin-assignment-detail-title">Per Assignment Analytics Drill-Down</h2>
      <p className="admin-content-copy">
        This page keeps the assignment setup, delivery state, and teaching signals together so teachers can review one assignment without scanning the larger library table.
      </p>

      <AssignmentsWorkspaceNav />

      {inlineMessage ? <p className="admin-assignments-inline-note">{inlineMessage}</p> : null}
      {isLoading ? <p className="admin-assignments-inline-note">Loading assignment detail...</p> : null}

      {selectedRun ? (
        <>
          <section className="admin-assignments-detail-hero">
            <div className="admin-assignments-detail-hero-copy">
              <h3>{selectedRun.runName}</h3>
              <p>{selectedRun.templateName}</p>
              <small>{selectedRun.batchName} · {selectedRun.academicYear} · {selectedRun.mode}</small>
              <div className="admin-assignments-detail-hero-note">
                <span className={statusClassName(selectedRun.status)}>{selectedRun.status}</span>
                <strong>
                  {selectedRun.status === "Completed" ?
                    "Teacher summary for a completed assignment" :
                    selectedRun.status === "Live" ?
                      "Live assignment with active monitoring" :
                      "Assignment setup and outcome overview"}
                </strong>
              </div>
            </div>
            <div className="admin-assignments-detail-actions">
              <NavLink className="admin-primary-link" to="/admin/assignments/list">Back to List</NavLink>
              {selectedRun.status === "Live" ? (
                <NavLink className="admin-primary-link" to={`/admin/assignments/live/${selectedRun.runId}`}>Open Live Monitor</NavLink>
              ) : null}
            </div>
          </section>

          <div className="admin-assignments-detail-grid">
            <article className="admin-assignments-detail-card">
              <span>Assigned Students</span>
              <strong>{selectedRun.recipientCount}</strong>
              <small>Students included in this assignment run</small>
            </article>
            {selectedRun.status === "Completed" ? (
              <article className="admin-assignments-detail-card">
                <span>Participation</span>
                <strong>{selectedRun.completionPercent}%</strong>
                <small>{selectedRun.recipientCount} students were in scope for this completed assignment</small>
              </article>
            ) : null}
            <article className="admin-assignments-detail-card">
              <span>{selectedRun.status === "Completed" ? "Submission Completion" : "Progress"}</span>
              <strong>{selectedRun.completionPercent}%</strong>
              <small>{selectedRun.status === "Completed" ? "Final completion across assigned students" : "Current completion across assigned students"}</small>
            </article>
            <article className="admin-assignments-detail-card">
              <span>Window</span>
              <strong>{formatDateTime(selectedRun.startWindowIso)}</strong>
              <small>Ends {formatDateTime(selectedRun.endWindowIso)}</small>
            </article>
            <article className="admin-assignments-detail-card">
              <span>Teacher Snapshot</span>
              <strong>{selectedRun.analytics.executionStabilityBadge}</strong>
              <small>Quick read from the aggregated assignment summary</small>
            </article>
          </div>

          {selectedRun.status === "Completed" ? (
            <section className="admin-assignments-detail-panel admin-assignments-detail-panel-accent">
              <h3>Teacher Downloads</h3>
              <p>Download a testing copy of the completed assignment summary in the format you want to review or share.</p>
              <div className="admin-tests-row-actions">
                <button type="button" onClick={() => downloadSamplePdf(selectedRun)}>
                  Download PDF Summary
                </button>
                <button type="button" onClick={() => downloadSampleExcel(selectedRun)}>
                  Download Excel Sheet
                </button>
              </div>
            </section>
          ) : null}

          <section className="admin-assignments-detail-panel">
            <h3>L0 Essentials</h3>
            <p>The most important classroom-facing outcomes are shown first, with plain-language hints for quick review.</p>
            <div className="admin-assignments-detail-summary admin-assignments-detail-summary-compact">
              <div className="admin-assignments-detail-summary-highlight admin-assignments-detail-summary-score">
                <span>Average Raw Score</span>
                <strong>{selectedRun.analytics.avgRawScorePercent}%</strong>
                <small>{describeScoreTone(selectedRun.analytics.avgRawScorePercent)}</small>
              </div>
              <div className="admin-assignments-detail-summary-highlight admin-assignments-detail-summary-accuracy">
                <span>Average Accuracy</span>
                <strong>{selectedRun.analytics.avgAccuracyPercent}%</strong>
                <small>{describeAccuracyTone(selectedRun.analytics.avgAccuracyPercent)}</small>
              </div>
              <div>
                <span>Selected Test</span>
                <strong>{selectedRun.templateName}</strong>
                <small>The template locked into this assignment.</small>
              </div>
              <div>
                <span>Assignment Reference</span>
                <strong>{selectedRun.runId}</strong>
                <small>Useful when matching exports or support queries.</small>
              </div>
              <div>
                <span>Template Reference</span>
                <strong>{selectedRun.canonicalId}</strong>
                <small>The underlying template snapshot used for this run.</small>
              </div>
              <div>
                <span>Assigned Mode</span>
                <strong>{selectedRun.mode}</strong>
                <small>The exam mode chosen by the teacher for this assignment.</small>
              </div>
              <div>
                <span>Difficulty Timing Plan</span>
                <strong>{selectedRun.timingProfileSnapshot}</strong>
                <small>Teacher-facing timing guidance carried into this run.</small>
              </div>
              <div>
                <span>Question Order</span>
                <strong>{selectedRun.shuffleEnabled ? "Shuffled for this assignment" : "Fixed order"}</strong>
                <small>{selectedRun.shuffleEnabled ? "Students saw a shuffled question sequence." : "Students saw the template order as-is."}</small>
              </div>
              <div>
                <span>Grace Period</span>
                <strong>{selectedRun.gracePeriodMinutes} minutes</strong>
                <small>Extra closing window available after the main end time.</small>
              </div>
              <div className="admin-assignments-detail-summary-highlight admin-assignments-detail-summary-completion">
                <span>{selectedRun.status === "Completed" ? "Class Completion" : "Current Progress"}</span>
                <strong>{selectedRun.completionPercent}%</strong>
                <small>{describeCompletionTone(selectedRun.completionPercent, selectedRun.status)}</small>
              </div>
            </div>
          </section>

          <details className="admin-assignments-detail-panel">
            <summary>L1 Teaching Signals</summary>
            <p className="admin-assignments-detail-panel-note">These signals help a teacher understand pacing habits and paper navigation quality.</p>
            <div className="admin-assignments-detail-chart-grid">
              <UiChartContainer
                title="Phase Plan Split"
                subtitle="The intended phase-wise time share for this assignment"
                data={phasePlanPieData}
                variant="pie"
              />
            </div>
            <div className="admin-assignments-detail-summary">
              <div className="admin-assignments-detail-summary-highlight">
                <span>Phase Adherence</span>
                <strong>{selectedRun.analytics.avgPhaseAdherencePercent}%</strong>
                <small>How closely students stayed aligned with the intended phase flow.</small>
              </div>
              <div>
                <span>Easy Neglect</span>
                <strong>{selectedRun.analytics.easyNeglectPercent}%</strong>
                <small>Shows whether easier questions were left behind too often.</small>
              </div>
              <div>
                <span>Hard Bias</span>
                <strong>{selectedRun.analytics.hardBiasPercent}%</strong>
                <small>Shows whether students spent too much attention on hard questions.</small>
              </div>
            </div>
          </details>

          <details className="admin-assignments-detail-panel">
            <summary>L2 Execution Signals</summary>
            <p className="admin-assignments-detail-panel-note">These advanced signals help identify execution drift, risk patterns, and control quality.</p>
            <div className="admin-assignments-detail-chart-grid">
              <UiChartContainer
                title="Risk Distribution"
                subtitle="Class-wide split across low, medium, high, and critical execution risk"
                data={riskDistributionPieData}
                variant="pie"
              />
            </div>
            <div className="admin-assignments-detail-summary">
              <div className="admin-assignments-detail-summary-highlight">
                <span>Discipline Index</span>
                <strong>{selectedRun.analytics.avgDisciplineIndex}</strong>
                <small>{describeDisciplineTone(selectedRun.analytics.avgDisciplineIndex)}</small>
              </div>
              <div>
                <span>Controlled Compliance</span>
                <strong>{selectedRun.analytics.controlledCompliancePercent}%</strong>
                <small>How consistently students stayed within controlled-mode expectations.</small>
              </div>
              <div>
                <span>Guess Rate</span>
                <strong>{selectedRun.analytics.guessRatePercent}%</strong>
                <small>Higher values suggest more speculative answering behavior.</small>
              </div>
              <div>
                <span>Stability Index</span>
                <strong>{selectedRun.analytics.executionStabilityIndex}</strong>
                <small>Summarizes whether the class stayed steady throughout the run.</small>
              </div>
              <div>
                <span>Override Count</span>
                <strong>{selectedRun.analytics.overrideCount}</strong>
                <small>The number of structural or control exceptions seen in this run summary.</small>
              </div>
            </div>
          </details>

          <section className="admin-assignments-detail-panel">
            <h3>Students Needing Attention</h3>
            <p>
              This table highlights only the students who may need follow-up after the assignment. Risk and discipline appear only for L2+ plans.
            </p>
            <UiTable
              caption="Students needing attention in this assignment"
              columns={attentionStudentColumns}
              rows={attentionStudentRows}
              rowKey={(row) => `${row.runId}-${row.studentId}`}
              emptyStateText="No flagged students were found for this assignment."
            />
          </section>

          <section className="admin-assignments-detail-panel">
            <h3>Absent Students</h3>
            <p>
              This table lists the students from the assignment batches who did not appear in this assignment.
            </p>
            <UiTable
              caption="Absent students in this assignment"
              columns={absentStudentColumns}
              rows={absentStudentRows}
              rowKey={(row) => `${row.runId}-${row.studentId}`}
              emptyStateText="No absent students were found for this assignment."
            />
          </section>

          <section className="admin-assignments-detail-panel">
            <h3>Performance Snapshot</h3>
            <p>
              These two tables help teachers quickly spot the strongest and weakest student outcomes in this assignment.
            </p>
            <div className="admin-assignments-detail-table-grid">
              <div className="admin-assignments-detail-table-card">
                <h4>Top 5 Highest Performers</h4>
                <UiTable
                  caption="Top 5 highest performers in this assignment"
                  columns={performanceStudentColumns}
                  rows={topPerformerRows}
                  rowKey={(row) => `top-${row.runId}-${row.studentId}`}
                  emptyStateText="No performance data is available for this assignment."
                />
              </div>
              <div className="admin-assignments-detail-table-card">
                <h4>Bottom 5 Lowest Performers</h4>
                <UiTable
                  caption="Bottom 5 lowest performers in this assignment"
                  columns={performanceStudentColumns}
                  rows={bottomPerformerRows}
                  rowKey={(row) => `bottom-${row.runId}-${row.studentId}`}
                  emptyStateText="No performance data is available for this assignment."
                />
              </div>
            </div>
          </section>
        </>
      ) : null}
    </section>
  );
}

export default AdminAssignmentDetailPage;
