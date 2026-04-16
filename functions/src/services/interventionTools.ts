import {Timestamp} from "firebase-admin/firestore";
import {createLogger} from "./logging";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  administrativeActionLoggingService,
} from "./administrativeActionLogging";
import {
  AdminInterventionRequest,
  AdminInterventionResult,
  AdminInterventionValidatedRequest,
  AdminInterventionValidationError,
  InterventionActionRecord,
  InterventionActionType,
  InterventionOutcomeStatus,
} from "../types/interventionTools";

const INSTITUTES_COLLECTION = "institutes";
const STUDENTS_COLLECTION = "students";
const ACADEMIC_YEARS_COLLECTION = "academicYears";
const STUDENT_YEAR_METRICS_COLLECTION = "studentYearMetrics";
const AUDIT_LOGS_COLLECTION = "auditLogs";
const INTERVENTION_RECOMMENDATIONS_COLLECTION = "interventionRecommendations";
const INTERVENTION_ACTIONS_COLLECTION = "actions";
const ACTION_TYPES = [
  "ASSIGN_REMEDIAL_TEST",
  "SEND_INTERVENTION_ALERT",
  "UPDATE_INTERVENTION_OUTCOME",
] as const;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

interface InterventionToolsDependencies {
  firestore: FirebaseFirestore.Firestore;
  logInterventionRemedialAssignment:
    typeof administrativeActionLoggingService.logInterventionRemedialAssignment;
  logInterventionStudentAlert:
    typeof administrativeActionLoggingService.logInterventionStudentAlert;
  logInterventionOutcomeUpdate:
    typeof administrativeActionLoggingService.logInterventionOutcomeUpdate;
}

interface StudentSummary {
  studentId: string;
  studentName?: string;
  riskCluster?: string;
}

interface AuditInterventionDocument {
  actionType?: unknown;
  actorId?: unknown;
  metadata?: unknown;
  targetId?: unknown;
  timestamp?: unknown;
}

interface InterventionMetadata {
  actionType?: unknown;
  alertMessage?: unknown;
  interventionId?: unknown;
  outcomeNotes?: unknown;
  outcomeStatus?: unknown;
  remedialTestId?: unknown;
  riskCluster?: unknown;
  studentId?: unknown;
  studentName?: unknown;
  yearId?: unknown;
}

const normalizeRequiredString = (value: unknown, fieldName: string): string => {
  if (typeof value !== "string") {
    throw new AdminInterventionValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new AdminInterventionValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a non-empty string.`,
    );
  }

  return normalizedValue;
};

const normalizeOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalizedValue = value.trim();
  return normalizedValue || undefined;
};

const normalizeActionType = (value: unknown): InterventionActionType => {
  const normalizedValue = normalizeRequiredString(value, "actionType");
  const supportedTypes: InterventionActionType[] = [
    "ASSIGN_REMEDIAL_TEST",
    "SEND_ALERT",
    "TRACK_OUTCOME",
    "LIST_ACTIONS",
  ];

  if (!supportedTypes.includes(normalizedValue as InterventionActionType)) {
    throw new AdminInterventionValidationError(
      "VALIDATION_ERROR",
      "Field \"actionType\" is not supported.",
    );
  }

  return normalizedValue as InterventionActionType;
};

const normalizeLimit = (value: unknown): number => {
  if (typeof value === "undefined") {
    return DEFAULT_LIMIT;
  }

  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_LIMIT
  ) {
    throw new AdminInterventionValidationError(
      "VALIDATION_ERROR",
      `Field "limit" must be an integer between 1 and ${MAX_LIMIT}.`,
    );
  }

  return value;
};

const normalizeOutcomeStatus = (
  value: unknown,
): InterventionOutcomeStatus | undefined => {
  if (typeof value === "undefined") {
    return undefined;
  }

  const normalizedValue = normalizeRequiredString(value, "outcomeStatus")
    .toLowerCase() as InterventionOutcomeStatus;
  const allowedStatuses: InterventionOutcomeStatus[] = [
    "pending",
    "improving",
    "no_change",
    "escalated",
    "resolved",
  ];

  if (!allowedStatuses.includes(normalizedValue)) {
    throw new AdminInterventionValidationError(
      "VALIDATION_ERROR",
      "Field \"outcomeStatus\" is not supported.",
    );
  }

  return normalizedValue;
};

const toIsoString = (value: unknown): string => {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string" && value.trim()) {
    return value;
  }

  return new Date(0).toISOString();
};

const createInterventionId = (): string =>
  `intervention_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Build 124 intervention tools service backed by immutable audit logs.
 */
export class InterventionToolsService {
  private readonly logger = createLogger("InterventionToolsService");

  /**
   * @param {InterventionToolsDependencies} dependencies Runtime collaborators.
   */
  constructor(
    private readonly dependencies: InterventionToolsDependencies = {
      firestore: getFirestore(),
      logInterventionOutcomeUpdate:
        administrativeActionLoggingService.logInterventionOutcomeUpdate.bind(
          administrativeActionLoggingService,
        ),
      logInterventionRemedialAssignment:
        administrativeActionLoggingService
          .logInterventionRemedialAssignment
          .bind(administrativeActionLoggingService),
      logInterventionStudentAlert:
        administrativeActionLoggingService.logInterventionStudentAlert.bind(
          administrativeActionLoggingService,
        ),
    },
  ) {}

  /**
   * Validates and normalizes intervention request payloads.
   * @param {*} input Raw request payload.
   * @return {*} Typed validated intervention request.
   */
  public normalizeRequest(
    input: Partial<AdminInterventionRequest> & {
      actorId?: unknown;
      actorRole?: unknown;
      ipAddress?: unknown;
      userAgent?: unknown;
    },
  ): AdminInterventionValidatedRequest {
    const actionType = normalizeActionType(input.actionType);

    const validatedRequest: AdminInterventionValidatedRequest = {
      actionType,
      actorId: normalizeRequiredString(input.actorId, "actorId"),
      actorRole: normalizeRequiredString(input.actorRole, "actorRole"),
      instituteId: normalizeRequiredString(input.instituteId, "instituteId"),
      ipAddress: normalizeOptionalString(input.ipAddress),
      limit: normalizeLimit(input.limit),
      yearId: normalizeRequiredString(input.yearId, "yearId"),
      userAgent: normalizeOptionalString(input.userAgent),
    };

    if (actionType === "LIST_ACTIONS") {
      const listedStudentId = normalizeOptionalString(input.studentId);
      if (listedStudentId) {
        validatedRequest.studentId = listedStudentId;
      }

      return validatedRequest;
    }

    validatedRequest.studentId = normalizeRequiredString(
      input.studentId,
      "studentId",
    );

    if (actionType === "ASSIGN_REMEDIAL_TEST") {
      validatedRequest.remedialTestId = normalizeRequiredString(
        input.remedialTestId,
        "remedialTestId",
      );
    }

    if (actionType === "SEND_ALERT") {
      validatedRequest.alertMessage = normalizeRequiredString(
        input.alertMessage,
        "alertMessage",
      );
    }

    if (actionType === "TRACK_OUTCOME") {
      validatedRequest.outcomeStatus = normalizeOutcomeStatus(
        input.outcomeStatus,
      );

      if (!validatedRequest.outcomeStatus) {
        throw new AdminInterventionValidationError(
          "VALIDATION_ERROR",
          "Field \"outcomeStatus\" is required for TRACK_OUTCOME.",
        );
      }

      validatedRequest.outcomeNotes = normalizeOptionalString(
        input.outcomeNotes,
      );
    }

    return validatedRequest;
  }

  /**
   * Executes intervention action or action-history retrieval.
   * @param {*} rawInput Raw request payload.
   * @return {*} Action result or list output.
   */
  public async executeRequest(
    rawInput: Partial<AdminInterventionRequest> & {
      actorId?: unknown;
      actorRole?: unknown;
      ipAddress?: unknown;
      userAgent?: unknown;
    },
  ): Promise<AdminInterventionResult> {
    const input = this.normalizeRequest(rawInput);

    if (input.actionType === "LIST_ACTIONS") {
      const actions = await this.listInterventionActions(input);
      return {
        actions,
        mode: "list",
      };
    }

    const studentSummary = await this.loadStudentSummary(input);

    switch (input.actionType) {
    case "ASSIGN_REMEDIAL_TEST":
      return {
        action: await this.assignRemedialTest(input, studentSummary),
        actions: [],
        mode: "action",
      };
    case "SEND_ALERT":
      return {
        action: await this.sendStudentAlert(input, studentSummary),
        actions: [],
        mode: "action",
      };
    case "TRACK_OUTCOME":
      return {
        action: await this.trackInterventionOutcome(input, studentSummary),
        actions: [],
        mode: "action",
      };
    default: {
      const exhaustiveType: never = input.actionType;
      throw new AdminInterventionValidationError(
        "VALIDATION_ERROR",
        `Unsupported intervention action: ${exhaustiveType}`,
      );
    }
    }
  }

  /**
   * Loads student identity and summary risk information.
   * @param {*} input Validated intervention request.
   * @return {*} Student summary record.
   */
  private async loadStudentSummary(
    input: AdminInterventionValidatedRequest,
  ): Promise<StudentSummary> {
    const studentId = input.studentId ?? "";
    const institutePath =
      [INSTITUTES_COLLECTION, input.instituteId].join("/");
    const studentPath =
      [institutePath, STUDENTS_COLLECTION, studentId].join("/");
    const metricsPath = [
      institutePath,
      ACADEMIC_YEARS_COLLECTION,
      input.yearId,
      STUDENT_YEAR_METRICS_COLLECTION,
      studentId,
    ].join("/");

    const [studentSnapshot, metricsSnapshot] = await Promise.all([
      this.dependencies.firestore.doc(studentPath).get(),
      this.dependencies.firestore.doc(metricsPath).get(),
    ]);

    if (!studentSnapshot.exists) {
      throw new AdminInterventionValidationError(
        "NOT_FOUND",
        "Target student was not found for intervention.",
      );
    }

    const studentData = studentSnapshot.data() ?? {};
    const metricsData = metricsSnapshot.data() ?? {};

    const studentName = normalizeOptionalString(
      (studentData as {name?: unknown}).name ??
        (studentData as {studentName?: unknown}).studentName,
    );

    const riskCluster = normalizeOptionalString(
      (metricsData as {rollingRiskCluster?: unknown}).rollingRiskCluster ??
        (metricsData as {riskState?: unknown}).riskState,
    );

    return {
      riskCluster,
      studentId,
      studentName,
    };
  }

  /**
   * Logs remedial assignment intervention in immutable audit storage.
   * @param {*} input Validated intervention request.
   * @param {StudentSummary} studentSummary Student identity/risk details.
   * @return {Promise<InterventionActionRecord>} Action record.
   */
  private async assignRemedialTest(
    input: AdminInterventionValidatedRequest,
    studentSummary: StudentSummary,
  ): Promise<InterventionActionRecord> {
    const interventionId = createInterventionId();
    const timestamp = new Date().toISOString();
    const remedialTestId = input.remedialTestId ?? "";

    const auditResult =
      await this.dependencies.logInterventionRemedialAssignment({
        actorId: input.actorId,
        actorRole: input.actorRole,
        entityId: `${studentSummary.studentId}:${remedialTestId}`,
        instituteId: input.instituteId,
        ipAddress: input.ipAddress,
        metadata: {
          actionType: input.actionType,
          interventionId,
          remedialTestId,
          riskCluster: studentSummary.riskCluster ?? null,
          studentId: studentSummary.studentId,
          studentName: studentSummary.studentName ?? null,
          yearId: input.yearId,
        },
        userAgent: input.userAgent,
      });

    this.logger.info("Remedial intervention logged.", {
      actorId: input.actorId,
      instituteId: input.instituteId,
      interventionId,
      remedialTestId,
      studentId: studentSummary.studentId,
      yearId: input.yearId,
    });

    const actionRecord: InterventionActionRecord = {
      actionType: input.actionType,
      alertMessage: undefined,
      auditId: auditResult.auditId,
      auditPath: auditResult.path,
      instituteId: input.instituteId,
      interventionId,
      outcomeNotes: undefined,
      outcomeStatus: undefined,
      remedialTestId,
      riskCluster: studentSummary.riskCluster,
      studentId: studentSummary.studentId,
      studentName: studentSummary.studentName,
      timestamp,
      yearId: input.yearId,
    };

    await this.persistInterventionRecommendation(input, actionRecord);
    return actionRecord;
  }

  /**
   * Logs student alert intervention in immutable audit storage.
   * @param {*} input Validated intervention request.
   * @param {StudentSummary} studentSummary Student identity/risk details.
   * @return {Promise<InterventionActionRecord>} Action record.
   */
  private async sendStudentAlert(
    input: AdminInterventionValidatedRequest,
    studentSummary: StudentSummary,
  ): Promise<InterventionActionRecord> {
    const interventionId = createInterventionId();
    const timestamp = new Date().toISOString();
    const alertMessage = input.alertMessage ?? "";

    const auditResult = await this.dependencies.logInterventionStudentAlert({
      actorId: input.actorId,
      actorRole: input.actorRole,
      entityId: studentSummary.studentId,
      instituteId: input.instituteId,
      ipAddress: input.ipAddress,
      metadata: {
        actionType: input.actionType,
        alertMessage,
        interventionId,
        riskCluster: studentSummary.riskCluster ?? null,
        studentId: studentSummary.studentId,
        studentName: studentSummary.studentName ?? null,
        yearId: input.yearId,
      },
      userAgent: input.userAgent,
    });

    this.logger.info("Student intervention alert logged.", {
      actorId: input.actorId,
      instituteId: input.instituteId,
      interventionId,
      studentId: studentSummary.studentId,
      yearId: input.yearId,
    });

    const actionRecord: InterventionActionRecord = {
      actionType: input.actionType,
      alertMessage,
      auditId: auditResult.auditId,
      auditPath: auditResult.path,
      instituteId: input.instituteId,
      interventionId,
      outcomeNotes: undefined,
      outcomeStatus: undefined,
      remedialTestId: undefined,
      riskCluster: studentSummary.riskCluster,
      studentId: studentSummary.studentId,
      studentName: studentSummary.studentName,
      timestamp,
      yearId: input.yearId,
    };

    await this.persistInterventionRecommendation(input, actionRecord);
    return actionRecord;
  }

  /**
   * Logs intervention outcome tracking updates in immutable audit storage.
   * @param {*} input Validated intervention request.
   * @param {StudentSummary} studentSummary Student identity/risk details.
   * @return {Promise<InterventionActionRecord>} Action record.
   */
  private async trackInterventionOutcome(
    input: AdminInterventionValidatedRequest,
    studentSummary: StudentSummary,
  ): Promise<InterventionActionRecord> {
    const interventionId = createInterventionId();
    const timestamp = new Date().toISOString();
    const outcomeStatus = input.outcomeStatus;
    const outcomeNotes = input.outcomeNotes;

    const auditResult = await this.dependencies.logInterventionOutcomeUpdate({
      actorId: input.actorId,
      actorRole: input.actorRole,
      afterState: {
        outcomeNotes: outcomeNotes ?? null,
        outcomeStatus,
      },
      beforeState: {
        outcomeStatus: "pending",
      },
      entityId: studentSummary.studentId,
      instituteId: input.instituteId,
      ipAddress: input.ipAddress,
      metadata: {
        actionType: input.actionType,
        interventionId,
        outcomeNotes: outcomeNotes ?? null,
        outcomeStatus,
        riskCluster: studentSummary.riskCluster ?? null,
        studentId: studentSummary.studentId,
        studentName: studentSummary.studentName ?? null,
        yearId: input.yearId,
      },
      userAgent: input.userAgent,
    });

    this.logger.info("Intervention outcome logged.", {
      actorId: input.actorId,
      instituteId: input.instituteId,
      interventionId,
      outcomeStatus,
      studentId: studentSummary.studentId,
      yearId: input.yearId,
    });

    const actionRecord: InterventionActionRecord = {
      actionType: input.actionType,
      alertMessage: undefined,
      auditId: auditResult.auditId,
      auditPath: auditResult.path,
      instituteId: input.instituteId,
      interventionId,
      outcomeNotes,
      outcomeStatus,
      remedialTestId: undefined,
      riskCluster: studentSummary.riskCluster,
      studentId: studentSummary.studentId,
      studentName: studentSummary.studentName,
      timestamp,
      yearId: input.yearId,
    };

    await this.persistInterventionRecommendation(input, actionRecord);
    return actionRecord;
  }

  /**
   * Persists advisory intervention records in architecture-mapped storage.
   * Stored at interventionRecommendations/{academicYear}/institutes/{instituteId}/actions/{interventionId}.
   * @param {AdminInterventionValidatedRequest} input Validated intervention request.
   * @param {InterventionActionRecord} actionRecord Action record.
   * @return {Promise<void>} Promise that resolves when persisted.
   */
  private async persistInterventionRecommendation(
    input: AdminInterventionValidatedRequest,
    actionRecord: InterventionActionRecord,
  ): Promise<void> {
    const collectionPath = [
      INTERVENTION_RECOMMENDATIONS_COLLECTION,
      input.yearId,
      INSTITUTES_COLLECTION,
      input.instituteId,
      INTERVENTION_ACTIONS_COLLECTION,
    ].join("/");

    await this.dependencies.firestore
      .collection(collectionPath)
      .doc(actionRecord.interventionId)
      .set({
        actionType: actionRecord.actionType,
        advisoryOnly: true,
        alertMessage: actionRecord.alertMessage ?? null,
        auditId: actionRecord.auditId ?? null,
        auditPath: actionRecord.auditPath ?? null,
        createdAt: actionRecord.timestamp,
        instituteId: actionRecord.instituteId,
        interventionId: actionRecord.interventionId,
        outcomeNotes: actionRecord.outcomeNotes ?? null,
        outcomeStatus: actionRecord.outcomeStatus ?? null,
        remedialTestId: actionRecord.remedialTestId ?? null,
        riskCluster: actionRecord.riskCluster ?? null,
        studentId: actionRecord.studentId ?? null,
        studentName: actionRecord.studentName ?? null,
        yearId: actionRecord.yearId,
      });
  }

  /**
   * Lists intervention history from institute audit logs by year.
   * @param {*} input Validated request for history lookup.
   * @return {Promise<InterventionActionRecord[]>} Intervention action history.
   */
  private async listInterventionActions(
    input: AdminInterventionValidatedRequest,
  ): Promise<InterventionActionRecord[]> {
    const snapshot = await this.dependencies.firestore
      .collection(
        [
          INSTITUTES_COLLECTION,
          input.instituteId,
          AUDIT_LOGS_COLLECTION,
        ].join("/"),
      )
      .orderBy("timestamp", "desc")
      .limit(input.limit)
      .get();

    const records = snapshot.docs
      .map((documentSnapshot): InterventionActionRecord | null => {
        const data = documentSnapshot.data() as AuditInterventionDocument;
        const actionType = normalizeOptionalString(data.actionType);

        if (
          !actionType ||
          !ACTION_TYPES.includes(actionType as typeof ACTION_TYPES[number])
        ) {
          return null;
        }

        const metadata = isPlainObject(data.metadata) ?
          (data.metadata as InterventionMetadata) :
          {};
        const metadataYearId = normalizeOptionalString(metadata.yearId);

        if (metadataYearId !== input.yearId) {
          return null;
        }

        const studentId = normalizeOptionalString(metadata.studentId);
        if (input.studentId && input.studentId !== studentId) {
          return null;
        }

        const record: InterventionActionRecord = {
          actionType: (
            normalizeOptionalString(metadata.actionType) ??
            this.mapAuditActionToInterventionType(actionType)
          ) as InterventionActionType,
          alertMessage: normalizeOptionalString(metadata.alertMessage),
          auditId: documentSnapshot.id,
          auditPath: documentSnapshot.ref.path,
          instituteId: input.instituteId,
          interventionId:
            normalizeOptionalString(metadata.interventionId) ??
            documentSnapshot.id,
          outcomeNotes: normalizeOptionalString(metadata.outcomeNotes),
          outcomeStatus: normalizeOutcomeStatus(metadata.outcomeStatus),
          remedialTestId: normalizeOptionalString(metadata.remedialTestId),
          riskCluster: normalizeOptionalString(metadata.riskCluster),
          studentId,
          studentName: normalizeOptionalString(metadata.studentName),
          timestamp: toIsoString(data.timestamp),
          yearId: input.yearId,
        };

        return record;
      })
      .filter((record): record is InterventionActionRecord => Boolean(record));

    this.logger.info("Intervention actions listed.", {
      instituteId: input.instituteId,
      requestedLimit: input.limit,
      resultCount: records.length,
      yearId: input.yearId,
    });

    return records;
  }

  /**
   * Maps audit action types to API response intervention action types.
   * @param {string} actionType Stored audit action type.
   * @return {InterventionActionType} API response action type.
   */
  private mapAuditActionToInterventionType(
    actionType: string,
  ): InterventionActionType {
    switch (actionType) {
    case "ASSIGN_REMEDIAL_TEST":
      return "ASSIGN_REMEDIAL_TEST";
    case "SEND_INTERVENTION_ALERT":
      return "SEND_ALERT";
    case "UPDATE_INTERVENTION_OUTCOME":
      return "TRACK_OUTCOME";
    default:
      return "LIST_ACTIONS";
    }
  }
}

export const interventionToolsService = new InterventionToolsService();
