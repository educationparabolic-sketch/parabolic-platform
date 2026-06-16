import { useEffect, useMemo, useState } from "react";
import { NavLink, useParams } from "react-router-dom";
import { useAuthProvider } from "../../../../../shared/services/authProvider";
import type { LicenseLayer } from "../../../../../shared/types/portalRouting";
import {
  ApiClientError,
  FALLBACK_DATASET,
  fetchDashboardDataset,
  shouldUseLiveApi,
  type DashboardDataset,
  type RunAnalyticsRecord,
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

  const setupRows = useMemo(
    () => selectedRun ? [
      { label: "Selected Test", value: selectedRun.templateName },
      { label: "Assignment ID", value: selectedRun.runId },
      { label: "Template Reference", value: selectedRun.canonicalId },
      { label: "Assigned Mode", value: selectedRun.mode },
      { label: "Attempt Limit", value: String(selectedRun.attemptLimit) },
      { label: "Question Shuffle", value: selectedRun.shuffleEnabled ? "Enabled for this assignment" : "Fixed order" },
    ] : [],
    [selectedRun],
  );

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
            <p>The core assignment facts and teacher-facing results are grouped here first.</p>
            <div className="admin-assignments-detail-summary">
              <div>
                <span>Avg Raw %</span>
                <strong>{selectedRun.analytics.avgRawScorePercent}%</strong>
              </div>
              <div>
                <span>Avg Accuracy %</span>
                <strong>{selectedRun.analytics.avgAccuracyPercent}%</strong>
              </div>
              <div>
                <span>Selected Test</span>
                <strong>{selectedRun.templateName}</strong>
              </div>
              <div>
                <span>Assignment ID</span>
                <strong>{selectedRun.runId}</strong>
              </div>
              <div>
                <span>Template Reference</span>
                <strong>{selectedRun.canonicalId}</strong>
              </div>
              <div>
                <span>Attempt Limit</span>
                <strong>{selectedRun.attemptLimit}</strong>
              </div>
              <div>
                <span>Phase Plan</span>
                <strong>{selectedRun.phaseConfigSnapshot}</strong>
              </div>
              <div>
                <span>Difficulty Timing Plan</span>
                <strong>{selectedRun.timingProfileSnapshot}</strong>
              </div>
              <div>
                <span>Grace Period</span>
                <strong>{selectedRun.gracePeriodMinutes} minutes</strong>
              </div>
              <div>
                <span>Question Order</span>
                <strong>{selectedRun.shuffleEnabled ? "Shuffled for this assignment" : "Fixed order"}</strong>
              </div>
            </div>
            <div className="admin-assignments-detail-record-list">
              {setupRows.map((row) => (
                <div key={row.label} className="admin-assignments-detail-record-item">
                  <span>{row.label}</span>
                  <strong>{row.value}</strong>
                </div>
              ))}
            </div>
          </section>

          <details className="admin-assignments-detail-panel">
            <summary>L1 Teaching Signals</summary>
            <div className="admin-assignments-detail-summary">
              <div>
                <span>Phase Adherence</span>
                <strong>{selectedRun.analytics.avgPhaseAdherencePercent}%</strong>
              </div>
              <div>
                <span>Easy Neglect</span>
                <strong>{selectedRun.analytics.easyNeglectPercent}%</strong>
              </div>
              <div>
                <span>Hard Bias</span>
                <strong>{selectedRun.analytics.hardBiasPercent}%</strong>
              </div>
              <div>
                <span>Teacher Read</span>
                <strong>
                  {selectedRun.analytics.avgPhaseAdherencePercent === 0 ? "Not available yet" : selectedRun.analytics.avgPhaseAdherencePercent >= 70 ? "Fairly disciplined paper flow" : "Needs pacing support"}
                </strong>
              </div>
            </div>
          </details>

          <details className="admin-assignments-detail-panel">
            <summary>L2 Execution Signals</summary>
            <div className="admin-assignments-detail-summary">
              <div>
                <span>Risk Distribution</span>
                <strong>{selectedRun.analytics.riskDistributionSummary}</strong>
              </div>
              <div>
                <span>Discipline Index</span>
                <strong>{selectedRun.analytics.avgDisciplineIndex}</strong>
              </div>
              <div>
                <span>Controlled Compliance</span>
                <strong>{selectedRun.analytics.controlledCompliancePercent}%</strong>
              </div>
              <div>
                <span>Guess Rate</span>
                <strong>{selectedRun.analytics.guessRatePercent}%</strong>
              </div>
              <div>
                <span>Stability Index</span>
                <strong>{selectedRun.analytics.executionStabilityIndex}</strong>
              </div>
              <div>
                <span>Override Count</span>
                <strong>{selectedRun.analytics.overrideCount}</strong>
              </div>
            </div>
          </details>
        </>
      ) : null}
    </section>
  );
}

export default AdminAssignmentDetailPage;
