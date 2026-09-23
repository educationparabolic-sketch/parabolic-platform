import {GovernanceReportingResult} from "../types/governanceReporting";

const MAX_LINE_LENGTH = 92;
const LINES_PER_PAGE = 52;

const asciiText = (value: string): string =>
  value.replace(/[^\x20-\x7E]/gu, "?");

const escapePdfText = (value: string): string =>
  asciiText(value)
    .replace(/\\/gu, "\\\\")
    .replace(/\(/gu, "\\(")
    .replace(/\)/gu, "\\)");

const wrapLine = (value: string): string[] => {
  const words = asciiText(value).trim().split(/\s+/u);
  const lines: string[] = [];
  let current = "";

  words.forEach((word) => {
    if (!current) {
      current = word;
      return;
    }
    if (`${current} ${word}`.length <= MAX_LINE_LENGTH) {
      current += ` ${word}`;
      return;
    }
    lines.push(current);
    current = word;
  });

  if (current) {
    lines.push(current);
  }
  return lines.length > 0 ? lines : [""];
};

const nullableVersion = (value: string | null): string =>
  value ?? "not captured";

const buildReportLines = (report: GovernanceReportingResult): string[] => {
  const lines = [
    "PARABOLIC PLATFORM GOVERNANCE REPORT",
    "",
    `Institute: ${report.header.instituteId}`,
    `Academic year: ${report.header.academicYear}`,
    `Reporting month: ${report.header.month}`,
    `Snapshot ID: ${report.header.snapshotId}`,
    `Snapshot generated: ${report.header.snapshotGeneratedAt}`,
    `Event cutoff: ${report.header.eventCutoffAt}`,
    `Report prepared: ${report.header.reportPreparedAt}`,
    `Source event count: ${report.header.eventRecordCount}`,
    `Calibration version: ${nullableVersion(report.header.calibrationVersion)}`,
    `Risk model version: ${nullableVersion(report.header.riskModelVersion)}`,
    "Template version range: " +
      nullableVersion(report.header.templateVersionRange),
    "",
    "GOVERNANCE INDICATORS",
    `Stability index: ${report.governanceIndicators.stabilityIndex}`,
    "Execution integrity score: " +
      report.governanceIndicators.executionIntegrityScore,
    "Phase compliance percent: " +
      report.governanceIndicators.phaseCompliancePercent,
    `Override frequency: ${report.governanceIndicators.overrideFrequency}`,
    "",
    "PERFORMANCE",
    `Average accuracy percent: ${report.performance.avgAccuracyPercent}`,
    `Average raw score percent: ${report.performance.avgRawScorePercent}`,
    `Discipline mean: ${report.performance.disciplineMean}`,
    `Template variance mean: ${report.performance.templateVarianceMean}`,
    "",
    "DISCIPLINE DEVIATION",
    `Level: ${report.disciplineDeviation.deviationLevel}`,
    `Trend: ${report.disciplineDeviation.disciplineTrend}`,
    `Variance: ${report.disciplineDeviation.disciplineVariance}`,
    report.disciplineDeviation.summary,
    "",
    "RISK DISTRIBUTION",
    ...Object.entries(report.riskDistribution).map(
      ([key, value]) => `${key}: ${value}`,
    ),
    "",
    `MAJOR INCIDENTS (${report.majorIncidentAlerts.length})`,
  ];

  report.majorIncidentAlerts.forEach((incident, index) => {
    lines.push(
      `${index + 1}. [${incident.severity.toUpperCase()}] ${incident.title}`,
      incident.summary,
      `Affected runs: ${incident.affectedRunIds.join(", ") || "none"}`,
      `Recovery actions: ${incident.recoveryActions.join("; ") || "none"}`,
    );
  });

  lines.push("", `SOURCE TIMELINE (${report.incidentTimeline.length})`);
  report.incidentTimeline.forEach((entry) => {
    const identifiers = [
      entry.actionType ? `action=${entry.actionType}` : "",
      entry.actorId ? `actor=${entry.actorId}` : "",
      entry.runId ? `run=${entry.runId}` : "",
    ].filter(Boolean).join(" ");
    lines.push(
      `${entry.at} [${entry.source}] ${entry.summary}` +
        (identifiers ? ` (${identifiers})` : ""),
    );
  });

  return lines.flatMap(wrapLine);
};

const buildPageStream = (lines: string[]): string => {
  const commands = [
    "BT",
    "/F1 10 Tf",
    "48 750 Td",
    "13 TL",
    ...lines.flatMap((line) => [`(${escapePdfText(line)}) Tj`, "T*"]),
    "ET",
  ];
  return commands.join("\n");
};

/**
 * Renders a deterministic, readable PDF from one immutable report model.
 * @param {GovernanceReportingResult} report Source-faithful report model.
 * @return {Buffer} Complete PDF bytes.
 */
export const renderGovernanceReportPdf = (
  report: GovernanceReportingResult,
): Buffer => {
  const lines = buildReportLines(report);
  const pages: string[][] = [];

  for (let index = 0; index < lines.length; index += LINES_PER_PAGE) {
    pages.push(lines.slice(index, index + LINES_PER_PAGE));
  }

  const objects = new Map<number, string>();
  const fontObjectId = 3;
  const pageObjectIds = pages.map((_, index) => 4 + index * 2);
  objects.set(1, "<< /Type /Catalog /Pages 2 0 R >>");
  objects.set(
    2,
    `<< /Type /Pages /Count ${pages.length} /Kids [` +
      `${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] >>`,
  );
  objects.set(fontObjectId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  pages.forEach((pageLines, index) => {
    const pageObjectId = pageObjectIds[index];
    const contentObjectId = pageObjectId + 1;
    const stream = buildPageStream(pageLines);
    objects.set(
      pageObjectId,
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
        `/Resources << /Font << /F1 ${fontObjectId} 0 R >> >> ` +
        `/Contents ${contentObjectId} 0 R >>`,
    );
    objects.set(
      contentObjectId,
      `<< /Length ${Buffer.byteLength(stream, "ascii")} >>\n` +
        `stream\n${stream}\nendstream`,
    );
  });

  const objectCount = Math.max(...objects.keys());
  let document = "%PDF-1.4\n%Parabolic\n";
  const offsets = new Array<number>(objectCount + 1).fill(0);

  for (let objectId = 1; objectId <= objectCount; objectId += 1) {
    offsets[objectId] = Buffer.byteLength(document, "ascii");
    document += `${objectId} 0 obj\n${objects.get(objectId)}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(document, "ascii");
  document += `xref\n0 ${objectCount + 1}\n`;
  document += "0000000000 65535 f \n";
  for (let objectId = 1; objectId <= objectCount; objectId += 1) {
    document += `${String(offsets[objectId]).padStart(10, "0")} 00000 n \n`;
  }
  document +=
    `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(document, "ascii");
};
