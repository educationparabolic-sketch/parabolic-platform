import {StandardApiErrorCode} from "./apiResponse";
import {GovernanceRiskDistribution} from "./governanceSnapshot";

export interface GovernanceReportingRequest {
  instituteId: string;
  month?: string;
  snapshotId?: string;
  yearId: string;
}

export interface GovernanceReportingValidatedRequest {
  instituteId: string;
  month?: string;
  snapshotId?: string;
  yearId: string;
}

export type GovernanceIncidentSeverity =
  "medium" |
  "high" |
  "critical";

export type GovernanceIncidentType =
  "discipline_deviation" |
  "execution_integrity" |
  "override_spike" |
  "risk_escalation" |
  "stability_drop";

export interface GovernanceReportTimelineEntry {
  actorId?: string;
  actionType?: string;
  at: string;
  runId?: string;
  source: "auditLog" | "overrideLog" | "snapshot";
  summary: string;
}

export interface GovernanceReportIncident {
  affectedRunIds: string[];
  calibrationVersion: string | null;
  recoveryActions: string[];
  severity: GovernanceIncidentSeverity;
  summary: string;
  timeline: GovernanceReportTimelineEntry[];
  title: string;
  type: GovernanceIncidentType;
  userActionsInvolved: string[];
}

export interface GovernanceDisciplineDeviation {
  deviationLevel: "none" | "watch" | "major";
  disciplineMean: number;
  disciplineTrend: number;
  disciplineVariance: number;
  summary: string;
}

export interface GovernanceReportHeader {
  academicYear: string;
  calibrationVersion: string | null;
  eventCutoffAt: string;
  eventRecordCount: number;
  instituteId: string;
  month: string;
  reportPreparedAt: string;
  riskModelVersion: string | null;
  schemaVersion: 1;
  snapshotGeneratedAt: string;
  snapshotId: string;
  templateVersionRange: string | null;
}

export interface GovernanceReportingResult {
  disciplineDeviation: GovernanceDisciplineDeviation;
  header: GovernanceReportHeader;
  incidentTimeline: GovernanceReportTimelineEntry[];
  majorIncidentAlerts: GovernanceReportIncident[];
  performance: {
    avgAccuracyPercent: number;
    avgRawScorePercent: number;
    disciplineMean: number;
    stabilityIndex: number;
    templateVarianceMean: number;
  };
  requestedMonth?: string;
  riskDistribution: GovernanceRiskDistribution;
  summary: {
    affectedRunCount: number;
    incidentCount: number;
    recoveryActionCount: number;
  };
  yearId: string;
  governanceIndicators: {
    executionIntegrityScore: number;
    overrideFrequency: number;
    phaseCompliancePercent: number;
    stabilityIndex: number;
  };
}

export interface GovernanceReportingSuccessResponse {
  code: "OK";
  data: GovernanceReportingResult;
  message: string;
  requestId: string;
  success: true;
  timestamp: string;
}

/**
 * Raised when governance reporting input or source reads are invalid.
 */
export class GovernanceReportingValidationError extends Error {
  public readonly code: StandardApiErrorCode;

  /**
   * @param {StandardApiErrorCode} code Stable API error code.
   * @param {string} message Safe validation failure detail.
   */
  constructor(code: StandardApiErrorCode, message: string) {
    super(message);
    this.name = "GovernanceReportingValidationError";
    this.code = code;
  }
}
