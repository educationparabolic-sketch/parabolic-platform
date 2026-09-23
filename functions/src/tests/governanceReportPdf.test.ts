import assert from "node:assert/strict";
import test from "node:test";
import {renderGovernanceReportPdf} from "../services/governanceReportPdf";
import {GovernanceReportingResult} from "../types/governanceReporting";

const report: GovernanceReportingResult = {
  disciplineDeviation: {
    deviationLevel: "watch",
    disciplineMean: 70,
    disciplineTrend: -2,
    disciplineVariance: 9,
    summary: "Discipline requires review.",
  },
  governanceIndicators: {
    executionIntegrityScore: 74,
    overrideFrequency: 3,
    phaseCompliancePercent: 68,
    stabilityIndex: 72,
  },
  header: {
    academicYear: "2026",
    calibrationVersion: "cal-v4",
    eventCutoffAt: "2026-04-01T00:00:00.000Z",
    eventRecordCount: 2,
    instituteId: "inst_pdf",
    month: "2026-03",
    reportPreparedAt: "2026-04-02T00:00:00.000Z",
    riskModelVersion: "risk-v3",
    schemaVersion: 1,
    snapshotGeneratedAt: "2026-04-01T00:00:00.000Z",
    snapshotId: "2026_03",
    templateVersionRange: "v2-v5",
  },
  incidentTimeline: [
    {
      at: "2026-03-20T10:00:00.000Z",
      runId: "run-1",
      source: "overrideLog",
      summary: "Execution override recorded.",
    },
  ],
  majorIncidentAlerts: [
    {
      affectedRunIds: ["run-1"],
      calibrationVersion: "cal-v4",
      recoveryActions: ["Review override"],
      severity: "high",
      summary: "Override activity exceeded the threshold.",
      timeline: [],
      title: "Override Spike",
      type: "override_spike",
      userActionsInvolved: ["minimum_time_bypass"],
    },
  ],
  performance: {
    avgAccuracyPercent: 76,
    avgRawScorePercent: 64,
    disciplineMean: 70,
    stabilityIndex: 72,
    templateVarianceMean: 5,
  },
  requestedMonth: "2026-03",
  riskDistribution: {
    driftProne: 15,
    impulsive: 10,
    overextended: 5,
    stable: 60,
    volatile: 10,
  },
  summary: {
    affectedRunCount: 1,
    incidentCount: 1,
    recoveryActionCount: 1,
  },
  yearId: "2026",
};

test("renderGovernanceReportPdf returns deterministic real PDF bytes", () => {
  const first = renderGovernanceReportPdf(report);
  const second = renderGovernanceReportPdf(report);
  const text = first.toString("ascii");

  assert.deepEqual(first, second);
  assert.equal(first.subarray(0, 8).toString("ascii"), "%PDF-1.4");
  assert.match(text, /PARABOLIC PLATFORM GOVERNANCE REPORT/u);
  assert.match(text, /Snapshot ID: 2026_03/u);
  assert.match(text, /xref\n/u);
  assert.match(text, /trailer\n/u);
  assert.match(text, /%%EOF\n$/u);
  assert.ok(first.length > 1_000);
});
