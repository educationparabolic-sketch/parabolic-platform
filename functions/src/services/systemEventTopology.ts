import {createLogger} from "./logging";
import {
  SystemEventDefinition,
  SystemEventDispatchContext,
  SystemEventName,
} from "../types/systemEventTopology";

/**
 * Raised when the event-topology graph violates architecture invariants.
 */
class SystemEventTopologyValidationError extends Error {
  /**
   * Creates a topology validation error.
   * @param {string} message Validation failure detail.
   */
  constructor(message: string) {
    super(message);
    this.name = "SystemEventTopologyValidationError";
  }
}

const SYSTEM_EVENT_DEFINITIONS: readonly SystemEventDefinition[] = [
  {
    description:
      "Question ingestion begins from a deterministic institute-scoped " +
      "question-bank create trigger.",
    domain: "content",
    downstreamEvents: [],
    executionMode: "asynchronous",
    name: "QuestionCreated",
    primaryHandler: "questionBankOnCreate",
    source: "institutes/{instituteId}/questionBank/{questionId}",
    sourceKind: "firestore.onCreate",
  },
  {
    description:
      "Template processing starts after an institute template document is " +
      "created.",
    domain: "template",
    downstreamEvents: [],
    executionMode: "asynchronous",
    name: "TemplateCreated",
    primaryHandler: "testTemplateOnCreate",
    source: "institutes/{instituteId}/tests/{testId}",
    sourceKind: "firestore.onCreate",
  },
  {
    description:
      "Assignment initialization starts after a run document is created.",
    domain: "assignment",
    downstreamEvents: ["UsageUpdated"],
    executionMode: "asynchronous",
    name: "AssignmentCreated",
    primaryHandler: "runAssignmentOnCreate",
    source: "institutes/{instituteId}/academicYears/{yearId}/runs/{runId}",
    sourceKind: "firestore.onCreate",
  },
  {
    description:
      "Exam execution begins through the authenticated exam start API.",
    domain: "sessionExecution",
    downstreamEvents: [],
    executionMode: "synchronous",
    name: "SessionStarted",
    primaryHandler: "examStart",
    source: "POST /exam/start",
    sourceKind: "https.onRequest",
  },
  {
    description:
      "Active session answer batching is accepted only through the exam " +
      "answer-write API.",
    domain: "sessionExecution",
    downstreamEvents: [],
    executionMode: "synchronous",
    name: "AnswerBatchReceived",
    primaryHandler: "examSessionAnswers",
    source: "POST /exam/session/{sessionId}/answers",
    sourceKind: "https.onRequest",
  },
  {
    description:
      "Session submission transitions the platform into asynchronous " +
      "post-submission processing.",
    domain: "postSubmission",
    downstreamEvents: ["AnalyticsGenerated", "UsageUpdated"],
    executionMode: "asynchronous",
    name: "SessionSubmitted",
    primaryHandler: "examSessionOnUpdate",
    source:
      "institutes/{instituteId}/academicYears/{yearId}/runs/{runId}/" +
      "sessions/{sessionId}",
    sourceKind: "firestore.onUpdate",
  },
  {
    description:
      "Submitted-session analytics update run, question, student, and " +
      "insight summaries without scanning raw sessions downstream.",
    domain: "postSubmission",
    downstreamEvents: ["StudentYearMetricsUpdated"],
    executionMode: "asynchronous",
    name: "AnalyticsGenerated",
    primaryHandler: "submissionAnalyticsPipeline",
    source:
      "Triggered from SessionSubmitted within the session submission " +
      "topology boundary",
    sourceKind: "firestore.onUpdate",
  },
  {
    description:
      "Student metrics updates feed risk and pattern engines through a " +
      "single Firestore write boundary.",
    domain: "postSubmission",
    downstreamEvents: [],
    executionMode: "asynchronous",
    name: "StudentYearMetricsUpdated",
    primaryHandler: "studentYearMetricsOnWrite",
    source:
      "institutes/{instituteId}/academicYears/{yearId}/" +
      "studentYearMetrics/{studentId}",
    sourceKind: "firestore.onWrite",
  },
  {
    description:
      "Vendor billing changes enter the platform through the Stripe webhook " +
      "boundary.",
    domain: "vendorIntelligence",
    downstreamEvents: [],
    executionMode: "synchronous",
    name: "BillingWebhookReceived",
    primaryHandler: "stripeWebhook",
    source: "POST /api/stripe/webhook",
    sourceKind: "https.onRequest",
  },
  {
    description:
      "Usage metering reacts to deterministic student, assignment, and " +
      "submission lifecycle changes.",
    domain: "vendorIntelligence",
    downstreamEvents: [],
    executionMode: "asynchronous",
    name: "UsageUpdated",
    primaryHandler: "instituteStudentOnWrite",
    source: "institutes/{instituteId}/students/{studentId}",
    sourceKind: "firestore.onWrite",
  },
  {
    description:
      "Monthly governance snapshots summarize academic-year analytics on a " +
      "scheduled cadence.",
    domain: "archiveLifecycle",
    downstreamEvents: [],
    executionMode: "scheduled",
    name: "GovernanceSnapshotScheduled",
    primaryHandler: "governanceSnapshotMonthly",
    source: "Monthly schedule",
    sourceKind: "scheduled",
  },
  {
    description:
      "Academic-year archival starts from the admin archive endpoint and " +
      "remains isolated from live execution paths.",
    domain: "archiveLifecycle",
    downstreamEvents: [],
    executionMode: "synchronous",
    name: "ArchiveTriggered",
    primaryHandler: "adminAcademicYearArchive",
    source: "POST /admin/academicYear/archive",
    sourceKind: "https.onRequest",
  },
] as const;

const definitionsByEvent = new Map<SystemEventName, SystemEventDefinition>(
  SYSTEM_EVENT_DEFINITIONS.map((definition) => [definition.name, definition]),
);

const logger = createLogger("SystemEventTopologyService");

const sortNames = (values: Iterable<string>): string[] =>
  Array.from(values).sort((left, right) => left.localeCompare(right));

const assertNonEmptyValue = (value: string, fieldName: string): void => {
  if (!value.trim()) {
    throw new SystemEventTopologyValidationError(
      `System event definition field "${fieldName}" must be non-empty.`,
    );
  }
};

/**
 * Coordinates deterministic system event topology validation and dispatch.
 */
export class SystemEventTopologyService {
  /**
   * Returns the static system event topology definitions.
   * @return {SystemEventDefinition[]} Registered event definitions.
   */
  public listEventDefinitions(): readonly SystemEventDefinition[] {
    return SYSTEM_EVENT_DEFINITIONS;
  }

  /**
   * Resolves a registered event definition by name.
   * @param {string} eventName Event identifier.
   * @return {SystemEventDefinition} Matching event definition.
   */
  public getEventDefinition(eventName: SystemEventName): SystemEventDefinition {
    const definition = definitionsByEvent.get(eventName);

    if (!definition) {
      throw new SystemEventTopologyValidationError(
        `Unknown system event "${eventName}".`,
      );
    }

    return definition;
  }

  /**
   * Validates deterministic topology invariants and fails on drift.
   */
  public assertTopologyInvariants(): void {
    const seenNames = new Set<string>();

    for (const definition of SYSTEM_EVENT_DEFINITIONS) {
      assertNonEmptyValue(definition.name, "name");
      assertNonEmptyValue(definition.primaryHandler, "primaryHandler");
      assertNonEmptyValue(definition.source, "source");
      assertNonEmptyValue(definition.description, "description");

      if (seenNames.has(definition.name)) {
        throw new SystemEventTopologyValidationError(
          `Duplicate system event definition "${definition.name}" found.`,
        );
      }

      seenNames.add(definition.name);

      for (const downstreamEvent of definition.downstreamEvents) {
        if (!definitionsByEvent.has(downstreamEvent)) {
          throw new SystemEventTopologyValidationError(
            `System event "${definition.name}" references unknown ` +
            `downstream event "${downstreamEvent}".`,
          );
        }
      }
    }

    const visited = new Set<SystemEventName>();
    const activePath = new Set<SystemEventName>();

    const visit = (eventName: SystemEventName): void => {
      if (activePath.has(eventName)) {
        throw new SystemEventTopologyValidationError(
          `Circular dependency detected for system event "${eventName}".`,
        );
      }

      if (visited.has(eventName)) {
        return;
      }

      activePath.add(eventName);

      for (const downstreamEvent of this.getEventDefinition(eventName)
        .downstreamEvents) {
        visit(downstreamEvent);
      }

      activePath.delete(eventName);
      visited.add(eventName);
    };

    for (const definition of SYSTEM_EVENT_DEFINITIONS) {
      visit(definition.name);
    }
  }

  /**
   * Executes a deterministic event handler with ownership validation.
   * @param {string} eventName Registered event identifier.
   * @param {string} handlerName Current handler function name.
   * @param {SystemEventDispatchContext} context Dispatch metadata.
   * @param {Function} operation Handler operation callback.
   * @return {Promise<unknown>} Operation result.
   */
  public async executeEventHandler<T>(
    eventName: SystemEventName,
    handlerName: string,
    context: SystemEventDispatchContext,
    operation: () => Promise<T>,
  ): Promise<T> {
    const definition = this.getEventDefinition(eventName);

    if (definition.primaryHandler !== handlerName) {
      throw new SystemEventTopologyValidationError(
        `Handler "${handlerName}" is not the primary handler for ` +
        `system event "${eventName}". Expected ` +
        `"${definition.primaryHandler}".`,
      );
    }

    const startedAt = Date.now();

    logger.info("Executing deterministic system event handler.", {
      ...context,
      downstreamEvents: definition.downstreamEvents,
      eventName,
      executionMode: definition.executionMode,
      handlerName,
      source: definition.source,
      sourceKind: definition.sourceKind,
    });

    try {
      const result = await operation();

      logger.info("Completed deterministic system event handler.", {
        ...context,
        durationMs: Date.now() - startedAt,
        eventName,
        handlerName,
      });

      return result;
    } catch (error) {
      logger.error("Deterministic system event handler failed.", {
        ...context,
        durationMs: Date.now() - startedAt,
        error,
        eventName,
        handlerName,
      });
      throw error;
    }
  }

  /**
   * Returns a compact topology summary for diagnostics and tests.
   * @return {object} Topology summary.
   */
  public getTopologySummary(): {
    domains: string[];
    eventCount: number;
    rootEvents: SystemEventName[];
    } {
    const downstreamEventNames = new Set<SystemEventName>();

    for (const definition of SYSTEM_EVENT_DEFINITIONS) {
      for (const downstreamEvent of definition.downstreamEvents) {
        downstreamEventNames.add(downstreamEvent);
      }
    }

    const rootEvents = SYSTEM_EVENT_DEFINITIONS
      .filter((definition) => !downstreamEventNames.has(definition.name))
      .map((definition) => definition.name);
    const domains = sortNames(
      new Set(SYSTEM_EVENT_DEFINITIONS.map((definition) => definition.domain)),
    );

    return {
      domains,
      eventCount: SYSTEM_EVENT_DEFINITIONS.length,
      rootEvents,
    };
  }
}

export const systemEventTopologyService = new SystemEventTopologyService();
