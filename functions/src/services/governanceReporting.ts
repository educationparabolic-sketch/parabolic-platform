import {Timestamp} from "firebase-admin/firestore";
import {createLogger} from "./logging";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  governanceSnapshotAccessService,
} from "./governanceSnapshotAccess";
import {
  storageBucketArchitectureService,
} from "./storageBucketArchitecture";
import {
  GovernanceSnapshotAccessRecord,
} from "../types/governanceAccess";
import {
  GovernanceDisciplineDeviation,
  GovernanceReportIncident,
  GovernanceReportPdfExport,
  GovernanceReportTimelineEntry,
  GovernanceReportingRequest,
  GovernanceReportingResult,
  GovernanceReportingValidatedRequest,
  GovernanceReportingValidationError,
} from "../types/governanceReporting";

const INSTITUTES_COLLECTION = "institutes";
const AUDIT_LOGS_COLLECTION = "auditLogs";
const OVERRIDE_LOGS_COLLECTION = "overrideLogs";
const MAX_EVENT_DOCUMENTS = 200;

interface InstituteAuditEvent {
  actionType?: string;
  actorId?: string;
  at: string;
  runId?: string;
}

interface InstituteOverrideEvent {
  at: string;
  overrideType: string;
  performedBy: string;
  runId: string;
}

const normalizeRequiredString = (
  value: unknown,
  fieldName: string,
): string => {
  if (typeof value !== "string") {
    throw new GovernanceReportingValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new GovernanceReportingValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a non-empty string.`,
    );
  }

  return normalizedValue;
};

const normalizeOptionalMonth = (
  value: unknown,
): string | undefined => {
  if (typeof value === "undefined") {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new GovernanceReportingValidationError(
      "VALIDATION_ERROR",
      "Field \"month\" must be a string.",
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return undefined;
  }

  if (!/^\d{4}-\d{2}$/.test(normalizedValue)) {
    throw new GovernanceReportingValidationError(
      "VALIDATION_ERROR",
      "Field \"month\" must match the YYYY-MM format.",
    );
  }

  return normalizedValue;
};

const normalizeIncludePdfExport = (value: unknown): boolean => {
  if (typeof value === "undefined") {
    return true;
  }

  if (typeof value !== "boolean") {
    throw new GovernanceReportingValidationError(
      "VALIDATION_ERROR",
      "Field \"includePdfExport\" must be a boolean.",
    );
  }

  return value;
};

const toIsoString = (value: unknown): string | null => {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string" && value.trim()) {
    return value;
  }

  return null;
};

const buildMonthRange = (
  snapshotMonth: string,
): {start: Date; end: Date} => {
  const [year, month] = snapshotMonth.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));

  return {end, start};
};

const uniqueSortedValues = (values: Array<string | undefined>): string[] =>
  Array.from(new Set(values.filter((value): value is string => Boolean(value))))
    .sort((left, right) => left.localeCompare(right));

const buildPdfExport = (
  instituteId: string,
  snapshotMonth: string,
): GovernanceReportPdfExport => {
  const [yearValue, monthValue] = snapshotMonth.split("-").map(Number);
  const target = storageBucketArchitectureService
    .resolveReportAssetStorageTarget({
      extension: "pdf",
      instituteId,
      month: monthValue,
      reportKind: "governanceReport",
      year: yearValue,
    });

  return {
    bucketName: target.bucketName,
    cdnPath: target.cdnPath,
    contentType: target.contentType,
    fileName: target.objectPath.split("/").pop() ?? "governance.pdf",
    gsUri: target.gsUri,
    objectPath: target.objectPath,
  };
};

const buildSnapshotTimelineEntry = (
  snapshot: GovernanceSnapshotAccessRecord,
): GovernanceReportTimelineEntry => ({
  at: snapshot.generatedAt,
  source: "snapshot",
  summary:
    "Monthly governance snapshot sealed with " +
    `stabilityIndex=${snapshot.stabilityIndex} and ` +
    `executionIntegrityScore=${snapshot.executionIntegrityScore}.`,
});

const buildDisciplineDeviation = (
  snapshot: GovernanceSnapshotAccessRecord,
): GovernanceDisciplineDeviation => {
  if (snapshot.disciplineTrend <= -5 || snapshot.disciplineVariance >= 12) {
    return {
      deviationLevel: "major",
      disciplineMean: snapshot.disciplineMean,
      disciplineTrend: snapshot.disciplineTrend,
      disciplineVariance: snapshot.disciplineVariance,
      summary:
        "Material discipline deviation detected from the monthly " +
        "governance indicators.",
    };
  }

  if (snapshot.disciplineTrend < 0 || snapshot.disciplineVariance >= 8) {
    return {
      deviationLevel: "watch",
      disciplineMean: snapshot.disciplineMean,
      disciplineTrend: snapshot.disciplineTrend,
      disciplineVariance: snapshot.disciplineVariance,
      summary:
        "Discipline indicators show elevated variance and should be " +
        "reviewed by governance stakeholders.",
    };
  }

  return {
    deviationLevel: "none",
    disciplineMean: snapshot.disciplineMean,
    disciplineTrend: snapshot.disciplineTrend,
    disciplineVariance: snapshot.disciplineVariance,
    summary: "No material discipline deviation detected for the month.",
  };
};

const buildIncident = (
  input: {
    auditEvents: InstituteAuditEvent[];
    calibrationVersion: string | null;
    overrideEvents: InstituteOverrideEvent[];
    severity: GovernanceReportIncident["severity"];
    summary: string;
    timeline: GovernanceReportTimelineEntry[];
    title: string;
    type: GovernanceReportIncident["type"];
  },
): GovernanceReportIncident => ({
  affectedRunIds: uniqueSortedValues([
    ...input.overrideEvents.map((event) => event.runId),
    ...input.auditEvents.map((event) => event.runId),
  ]),
  calibrationVersion: input.calibrationVersion,
  recoveryActions: uniqueSortedValues([
    ...input.overrideEvents.map((event) =>
      "Review override " +
      `${event.overrideType} performed by ${event.performedBy}`),
    ...input.auditEvents.map((event) =>
      event.actionType ? `Review administrative action ${event.actionType}` :
        undefined),
  ]),
  severity: input.severity,
  summary: input.summary,
  timeline: input.timeline,
  title: input.title,
  type: input.type,
  userActionsInvolved: uniqueSortedValues([
    ...input.overrideEvents.map((event) => event.overrideType),
    ...input.auditEvents.map((event) => event.actionType),
  ]),
});

const compareTimelineEntries = (
  left: GovernanceReportTimelineEntry,
  right: GovernanceReportTimelineEntry,
): number => left.at.localeCompare(right.at);

const buildIncidentTimeline = (
  snapshot: GovernanceSnapshotAccessRecord,
  overrideEvents: InstituteOverrideEvent[],
  auditEvents: InstituteAuditEvent[],
): GovernanceReportTimelineEntry[] => {
  const timeline: GovernanceReportTimelineEntry[] = [
    buildSnapshotTimelineEntry(snapshot),
    ...overrideEvents.map((event) => ({
      actorId: event.performedBy,
      at: event.at,
      runId: event.runId,
      source: "overrideLog" as const,
      summary: `Execution override ${event.overrideType} recorded.`,
    })),
    ...auditEvents.map((event) => ({
      actionType: event.actionType,
      actorId: event.actorId,
      at: event.at,
      runId: event.runId,
      source: "auditLog" as const,
      summary:
        event.actionType ?
          `Administrative action ${event.actionType} recorded.` :
          "Administrative governance action recorded.",
    })),
  ];

  return timeline.sort(compareTimelineEntries);
};

const buildMajorIncidents = (
  snapshot: GovernanceSnapshotAccessRecord,
  timeline: GovernanceReportTimelineEntry[],
  overrideEvents: InstituteOverrideEvent[],
  auditEvents: InstituteAuditEvent[],
  calibrationVersion: string | null,
): GovernanceReportIncident[] => {
  const incidents: GovernanceReportIncident[] = [];
  const riskEscalationPercent =
    snapshot.riskClusterDistribution.volatile +
    snapshot.riskClusterDistribution.overextended;

  if (snapshot.stabilityIndex < 65) {
    incidents.push(buildIncident({
      auditEvents,
      calibrationVersion,
      overrideEvents,
      severity: snapshot.stabilityIndex < 50 ? "critical" : "high",
      summary:
        "Institutional stability fell below the governance threshold for " +
        "the reporting month.",
      timeline,
      title: "Institution Stability Drop",
      type: "stability_drop",
    }));
  }

  if (snapshot.executionIntegrityScore < 70) {
    incidents.push(buildIncident({
      auditEvents,
      calibrationVersion,
      overrideEvents,
      severity: snapshot.executionIntegrityScore < 55 ? "critical" : "high",
      summary:
        "Execution integrity dropped below the acceptable governance band.",
      timeline,
      title: "Execution Integrity Incident",
      type: "execution_integrity",
    }));
  }

  if (snapshot.overrideFrequency >= 5 || overrideEvents.length >= 3) {
    incidents.push(buildIncident({
      auditEvents,
      calibrationVersion,
      overrideEvents,
      severity:
        snapshot.overrideFrequency >= 10 || overrideEvents.length >= 6 ?
          "critical" :
          "high",
      summary:
        "Override activity exceeded the monthly governance reporting " +
        "threshold.",
      timeline,
      title: "Override Spike",
      type: "override_spike",
    }));
  }

  if (riskEscalationPercent >= 20) {
    incidents.push(buildIncident({
      auditEvents,
      calibrationVersion,
      overrideEvents,
      severity: riskEscalationPercent >= 30 ? "critical" : "high",
      summary:
        "Volatile and overextended risk clusters exceeded the governance " +
        "alert threshold.",
      timeline,
      title: "Risk Escalation",
      type: "risk_escalation",
    }));
  }

  if (snapshot.disciplineTrend <= -5 || snapshot.disciplineVariance >= 12) {
    incidents.push(buildIncident({
      auditEvents,
      calibrationVersion,
      overrideEvents,
      severity:
        snapshot.disciplineTrend <= -8 || snapshot.disciplineVariance >= 15 ?
          "critical" :
          "high",
      summary:
        "Discipline variance and trend indicate a reportable governance " +
        "deviation.",
      timeline,
      title: "Discipline Deviation",
      type: "discipline_deviation",
    }));
  }

  return incidents;
};

/**
 * Generates governance-ready monthly reports from immutable summaries.
 */
export class GovernanceReportingService {
  private readonly firestore = getFirestore();
  private readonly logger = createLogger("GovernanceReportingService");

  /**
   * Validates and normalizes a governance reporting request payload.
   * @param {Partial<GovernanceReportingRequest>} input Raw request payload.
   * @return {GovernanceReportingValidatedRequest} Validated request.
   */
  public normalizeRequest(
    input: Partial<GovernanceReportingRequest>,
  ): GovernanceReportingValidatedRequest {
    return {
      includePdfExport: normalizeIncludePdfExport(input.includePdfExport),
      instituteId: normalizeRequiredString(input.instituteId, "instituteId"),
      month: normalizeOptionalMonth(input.month),
      yearId: normalizeRequiredString(input.yearId, "yearId"),
    };
  }

  /**
   * Generates one governance report from immutable monthly summary inputs.
   * @param {Partial<GovernanceReportingRequest>} rawInput Raw request payload.
   * @return {Promise<GovernanceReportingResult>} Report output.
   */
  public async generateReport(
    rawInput: Partial<GovernanceReportingRequest>,
  ): Promise<GovernanceReportingResult> {
    const input = this.normalizeRequest(rawInput);
    const snapshotResult = await governanceSnapshotAccessService
      .readSnapshots({
        instituteId: input.instituteId,
        limit: 1,
        month: input.month,
        yearId: input.yearId,
      });
    const snapshot = snapshotResult.snapshots[0];

    if (!snapshot) {
      throw new GovernanceReportingValidationError(
        "NOT_FOUND",
        "Governance snapshot not found for report generation.",
      );
    }

    const [calibrationVersion, overrideEvents, auditEvents] = await Promise.all(
      [
        this.readCalibrationVersion(input.instituteId),
        this.readOverrideEvents(input.instituteId, snapshot.month),
        this.readAuditEvents(input.instituteId, snapshot.month),
      ],
    );
    const incidentTimeline = buildIncidentTimeline(
      snapshot,
      overrideEvents,
      auditEvents,
    );
    const majorIncidentAlerts = buildMajorIncidents(
      snapshot,
      incidentTimeline,
      overrideEvents,
      auditEvents,
      calibrationVersion,
    );
    const recoveryActions = uniqueSortedValues(
      majorIncidentAlerts.flatMap((incident) => incident.recoveryActions),
    );
    const affectedRuns = uniqueSortedValues(
      majorIncidentAlerts.flatMap((incident) => incident.affectedRunIds),
    );
    const result: GovernanceReportingResult = {
      disciplineDeviation: buildDisciplineDeviation(snapshot),
      governanceIndicators: {
        executionIntegrityScore: snapshot.executionIntegrityScore,
        overrideFrequency: snapshot.overrideFrequency,
        phaseCompliancePercent: snapshot.phaseCompliancePercent,
        stabilityIndex: snapshot.stabilityIndex,
      },
      header: {
        academicYear: snapshot.academicYear,
        calibrationVersion,
        generatedAt: new Date().toISOString(),
        instituteId: snapshot.instituteId,
        month: snapshot.month,
        schemaVersion: 1,
        snapshotDocumentPath: snapshot.documentPath,
      },
      incidentTimeline,
      majorIncidentAlerts,
      performance: {
        avgAccuracyPercent: snapshot.avgAccuracyPercent,
        avgRawScorePercent: snapshot.avgRawScorePercent,
        disciplineMean: snapshot.disciplineMean,
        stabilityIndex: snapshot.stabilityIndex,
        templateVarianceMean: snapshot.templateVarianceMean,
      },
      requestedMonth: snapshotResult.requestedMonth,
      riskDistribution: snapshot.riskClusterDistribution,
      summary: {
        affectedRunCount: affectedRuns.length,
        incidentCount: majorIncidentAlerts.length,
        recoveryActionCount: recoveryActions.length,
      },
      yearId: snapshotResult.yearId,
    };

    if (input.includePdfExport) {
      result.pdfExport = buildPdfExport(input.instituteId, snapshot.month);
    }

    this.logger.info("Governance report generated.", {
      affectedRunCount: result.summary.affectedRunCount,
      incidentCount: result.summary.incidentCount,
      instituteId: input.instituteId,
      month: snapshot.month,
      yearId: input.yearId,
    });

    return result;
  }

  /**
   * Reads the institute calibration version used for report metadata.
   * @param {string} instituteId Institute identifier.
   * @return {Promise<string | null>} Calibration version or null.
   */
  private async readCalibrationVersion(
    instituteId: string,
  ): Promise<string | null> {
    const instituteSnapshot = await this.firestore
      .collection(INSTITUTES_COLLECTION)
      .doc(instituteId)
      .get();

    if (!instituteSnapshot.exists) {
      return null;
    }

    const calibrationVersion = instituteSnapshot.get("calibrationVersion");
    return typeof calibrationVersion === "string" && calibrationVersion.trim() ?
      calibrationVersion.trim() :
      null;
  }

  /**
   * Reads bounded month-specific institute override events.
   * @param {string} instituteId Institute identifier.
   * @param {string} snapshotMonth Governance report month.
   * @return {Promise<InstituteOverrideEvent[]>} Matching override events.
   */
  private async readOverrideEvents(
    instituteId: string,
    snapshotMonth: string,
  ): Promise<InstituteOverrideEvent[]> {
    const range = buildMonthRange(snapshotMonth);
    const querySnapshot = await this.firestore
      .collection(
        `${INSTITUTES_COLLECTION}/${instituteId}/${OVERRIDE_LOGS_COLLECTION}`,
      )
      .where("timestamp", ">=", range.start)
      .where("timestamp", "<", range.end)
      .orderBy("timestamp", "asc")
      .limit(MAX_EVENT_DOCUMENTS)
      .get();

    return querySnapshot.docs.flatMap((document) => {
      const timestamp = toIsoString(document.get("timestamp"));
      const overrideType = document.get("overrideType");
      const performedBy = document.get("performedBy");
      const runId = document.get("runId");

      if (
        !timestamp ||
        typeof overrideType !== "string" ||
        typeof performedBy !== "string" ||
        typeof runId !== "string"
      ) {
        return [];
      }

      return [{
        at: timestamp,
        overrideType,
        performedBy,
        runId,
      }];
    });
  }

  /**
   * Reads bounded month-specific institute audit events.
   * @param {string} instituteId Institute identifier.
   * @param {string} snapshotMonth Governance report month.
   * @return {Promise<InstituteAuditEvent[]>} Matching audit events.
   */
  private async readAuditEvents(
    instituteId: string,
    snapshotMonth: string,
  ): Promise<InstituteAuditEvent[]> {
    const range = buildMonthRange(snapshotMonth);
    const querySnapshot = await this.firestore
      .collection(
        `${INSTITUTES_COLLECTION}/${instituteId}/${AUDIT_LOGS_COLLECTION}`,
      )
      .where("timestamp", ">=", range.start)
      .where("timestamp", "<", range.end)
      .orderBy("timestamp", "asc")
      .limit(MAX_EVENT_DOCUMENTS)
      .get();

    return querySnapshot.docs.flatMap((document) => {
      const timestamp = toIsoString(document.get("timestamp"));
      const actionType = document.get("actionType");
      const actorId =
        document.get("actorId") ??
        document.get("actorUid");
      const additionalFields = document.get("additionalFields");
      const runId =
        typeof additionalFields === "object" &&
        additionalFields !== null &&
        typeof (additionalFields as Record<string, unknown>).runId ===
          "string" ?
          (additionalFields as Record<string, string>).runId :
          undefined;

      if (!timestamp) {
        return [];
      }

      return [{
        actionType: typeof actionType === "string" ? actionType : undefined,
        actorId: typeof actorId === "string" ? actorId : undefined,
        at: timestamp,
        runId,
      }];
    });
  }
}

export const governanceReportingService = new GovernanceReportingService();
