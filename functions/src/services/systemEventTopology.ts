import {createLogger} from "./logging";
import {
  SystemEventDefinition,
  SystemEventDispatchContext,
  SystemEventName,
  TopologyEngineDefinition,
  TopologyEngineName,
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
    downstreamEvents: ["TemplateCreated"],
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
    downstreamEvents: ["AssignmentCreated"],
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
    downstreamEvents: ["SessionStarted", "UsageUpdated"],
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
    downstreamEvents: ["AnswerBatchReceived"],
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
    downstreamEvents: ["SessionSubmitted"],
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
    downstreamEvents: ["StudentYearMetricsUpdated", "InsightsGenerated"],
    executionMode: "asynchronous",
    name: "AnalyticsGenerated",
    primaryHandler: "examSessionOnUpdate",
    source:
      "Triggered from SessionSubmitted within the session submission " +
      "topology boundary",
    sourceKind: "firestore.onUpdate",
  },
  {
    description:
      "Insight snapshots are generated after deterministic analytics writes " +
      "complete for a submitted session.",
    domain: "postSubmission",
    downstreamEvents: ["GovernanceSnapshotScheduled"],
    executionMode: "asynchronous",
    name: "InsightsGenerated",
    primaryHandler: "examSessionOnUpdate",
    source:
      "Triggered from AnalyticsGenerated within the session submission " +
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
    downstreamEvents: ["BillingMeterUpdated"],
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
    downstreamEvents: ["VendorAggregatesUpdated"],
    executionMode: "scheduled",
    name: "GovernanceSnapshotScheduled",
    primaryHandler: "governanceSnapshotMonthly",
    source: "Monthly schedule",
    sourceKind: "scheduled",
  },
  {
    description:
      "Vendor aggregate rollups are produced from monthly governance summary " +
      "boundaries.",
    domain: "vendorIntelligence",
    downstreamEvents: ["BillingMeterUpdated"],
    executionMode: "scheduled",
    name: "VendorAggregatesUpdated",
    primaryHandler: "governanceSnapshotMonthly",
    source: "Monthly governance aggregation rollup",
    sourceKind: "scheduled",
  },
  {
    description:
      "Billing meter snapshots are generated from deterministic lifecycle " +
      "events and monthly billing rollups.",
    domain: "vendorIntelligence",
    downstreamEvents: ["ArchiveTriggered"],
    executionMode: "scheduled",
    name: "BillingMeterUpdated",
    primaryHandler: "billingSnapshotMonthly",
    source: "Monthly billing snapshot schedule",
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

const MASTER_LIFECYCLE_SEQUENCE: readonly SystemEventName[] = [
  "QuestionCreated",
  "TemplateCreated",
  "AssignmentCreated",
  "SessionStarted",
  "AnswerBatchReceived",
  "SessionSubmitted",
  "AnalyticsGenerated",
  "InsightsGenerated",
  "GovernanceSnapshotScheduled",
  "VendorAggregatesUpdated",
  "BillingMeterUpdated",
  "ArchiveTriggered",
] as const;

const TOPOLOGY_ENGINE_DEFINITIONS: readonly TopologyEngineDefinition[] = [
  {
    dependsOn: [],
    drivenByEvents: ["SessionSubmitted"],
    engine: "SubmissionPipeline",
  },
  {
    dependsOn: ["SubmissionPipeline"],
    drivenByEvents: ["AnalyticsGenerated"],
    engine: "RunAnalyticsEngine",
  },
  {
    dependsOn: ["RunAnalyticsEngine"],
    drivenByEvents: ["AnalyticsGenerated"],
    engine: "QuestionAnalyticsEngine",
  },
  {
    dependsOn: ["QuestionAnalyticsEngine"],
    drivenByEvents: ["AnalyticsGenerated"],
    engine: "StudentMetricsEngine",
  },
  {
    dependsOn: ["StudentMetricsEngine"],
    drivenByEvents: ["StudentYearMetricsUpdated"],
    engine: "RiskEngine",
  },
  {
    dependsOn: ["RiskEngine"],
    drivenByEvents: ["StudentYearMetricsUpdated"],
    engine: "PatternEngine",
  },
  {
    dependsOn: ["PatternEngine"],
    drivenByEvents: ["InsightsGenerated"],
    engine: "InsightEngine",
  },
  {
    dependsOn: ["InsightEngine"],
    drivenByEvents: ["InsightsGenerated"],
    engine: "NotificationQueueEngine",
  },
  {
    dependsOn: ["NotificationQueueEngine"],
    drivenByEvents: ["GovernanceSnapshotScheduled"],
    engine: "GovernanceSnapshotEngine",
  },
  {
    dependsOn: ["GovernanceSnapshotEngine"],
    drivenByEvents: ["VendorAggregatesUpdated"],
    engine: "VendorAggregationEngine",
  },
  {
    dependsOn: ["VendorAggregationEngine"],
    drivenByEvents: ["BillingMeterUpdated", "BillingWebhookReceived"],
    engine: "BillingMeterEngine",
  },
  {
    dependsOn: ["BillingMeterEngine"],
    drivenByEvents: ["ArchiveTriggered"],
    engine: "ArchiveEngine",
  },
] as const;

const definitionsByEvent = new Map<SystemEventName, SystemEventDefinition>(
  SYSTEM_EVENT_DEFINITIONS.map((definition) => [definition.name, definition]),
);
const definitionsByEngine = new Map<
  TopologyEngineName,
  TopologyEngineDefinition
>(
  TOPOLOGY_ENGINE_DEFINITIONS.map(
    (definition) => [definition.engine, definition],
  ),
);

const logger = createLogger("SystemEventTopologyService");

const sortNames = (values: Iterable<string>): string[] =>
  Array.from(values).sort((left, right) => left.localeCompare(right));
const lifecycleIndexByEvent = new Map<SystemEventName, number>(
  MASTER_LIFECYCLE_SEQUENCE.map((eventName, index) => [eventName, index]),
);

const assertNonEmptyValue = (value: string, fieldName: string): void => {
  if (!value.trim()) {
    throw new SystemEventTopologyValidationError(
      `System event definition field "${fieldName}" must be non-empty.`,
    );
  }
};

const assertMasterLifecycleSequence = (): void => {
  for (
    let index = 0;
    index < MASTER_LIFECYCLE_SEQUENCE.length - 1;
    index += 1
  ) {
    const sourceEvent = MASTER_LIFECYCLE_SEQUENCE[index];
    const downstreamEvent = MASTER_LIFECYCLE_SEQUENCE[index + 1];

    const sourceDefinition = definitionsByEvent.get(sourceEvent);

    if (!sourceDefinition) {
      throw new SystemEventTopologyValidationError(
        `Master lifecycle event "${sourceEvent}" is not registered.`,
      );
    }

    if (!sourceDefinition.downstreamEvents.includes(downstreamEvent)) {
      throw new SystemEventTopologyValidationError(
        `Master lifecycle sequence is broken between "${sourceEvent}" and ` +
        `"${downstreamEvent}".`,
      );
    }
  }
};

const assertDownstreamOrdering = (): void => {
  for (const definition of SYSTEM_EVENT_DEFINITIONS) {
    const sourceIndex = lifecycleIndexByEvent.get(definition.name);

    for (const downstreamEvent of definition.downstreamEvents) {
      const downstreamIndex = lifecycleIndexByEvent.get(downstreamEvent);

      if (
        sourceIndex !== undefined &&
        downstreamIndex !== undefined &&
        sourceIndex >= downstreamIndex
      ) {
        throw new SystemEventTopologyValidationError(
          "Event ordering drift detected: " +
          `"${definition.name}" appears after "${downstreamEvent}" ` +
          "in the master topology sequence.",
        );
      }
    }
  }
};

const assertNoSelfReferentialLoopEdges = (): void => {
  for (const definition of SYSTEM_EVENT_DEFINITIONS) {
    for (const downstreamEventName of definition.downstreamEvents) {
      const downstreamDefinition = definitionsByEvent.get(downstreamEventName);

      if (!downstreamDefinition) {
        continue;
      }

      const isFirestoreTrigger =
        definition.sourceKind === "firestore.onCreate" ||
        definition.sourceKind === "firestore.onUpdate" ||
        definition.sourceKind === "firestore.onWrite";

      if (
        isFirestoreTrigger &&
        definition.primaryHandler === downstreamDefinition.primaryHandler &&
        definition.sourceKind === downstreamDefinition.sourceKind &&
        definition.source === downstreamDefinition.source
      ) {
        throw new SystemEventTopologyValidationError(
          "Potential infinite trigger loop detected between " +
          `"${definition.name}" and "${downstreamDefinition.name}".`,
        );
      }
    }
  }
};

const getFirstLifecycleIndex = (
  eventNames: readonly SystemEventName[],
): number | undefined => {
  const indexes = eventNames
    .map((eventName) => lifecycleIndexByEvent.get(eventName))
    .filter((index): index is number => index !== undefined);

  if (!indexes.length) {
    return undefined;
  }

  return Math.min(...indexes);
};

const assertEngineDependencyGraph = (): void => {
  const seenEngineNames = new Set<TopologyEngineName>();

  for (const definition of TOPOLOGY_ENGINE_DEFINITIONS) {
    if (seenEngineNames.has(definition.engine)) {
      throw new SystemEventTopologyValidationError(
        `Duplicate topology engine "${definition.engine}" found.`,
      );
    }

    seenEngineNames.add(definition.engine);

    for (const eventName of definition.drivenByEvents) {
      if (!definitionsByEvent.has(eventName)) {
        throw new SystemEventTopologyValidationError(
          `Topology engine "${definition.engine}" references unknown ` +
          `event "${eventName}".`,
        );
      }
    }

    for (const dependencyEngine of definition.dependsOn) {
      if (!definitionsByEngine.has(dependencyEngine)) {
        throw new SystemEventTopologyValidationError(
          `Topology engine "${definition.engine}" depends on unknown ` +
          `engine "${dependencyEngine}".`,
        );
      }
    }
  }

  const visited = new Set<TopologyEngineName>();
  const activePath = new Set<TopologyEngineName>();

  const visit = (engineName: TopologyEngineName): void => {
    if (activePath.has(engineName)) {
      throw new SystemEventTopologyValidationError(
        `Circular dependency detected for topology engine "${engineName}".`,
      );
    }

    if (visited.has(engineName)) {
      return;
    }

    const definition = definitionsByEngine.get(engineName);

    if (!definition) {
      throw new SystemEventTopologyValidationError(
        `Unknown topology engine "${engineName}".`,
      );
    }

    activePath.add(engineName);

    for (const dependencyEngine of definition.dependsOn) {
      visit(dependencyEngine);
    }

    activePath.delete(engineName);
    visited.add(engineName);
  };

  for (const definition of TOPOLOGY_ENGINE_DEFINITIONS) {
    visit(definition.engine);
  }

  for (const definition of TOPOLOGY_ENGINE_DEFINITIONS) {
    const engineOrder = getFirstLifecycleIndex(definition.drivenByEvents);

    if (engineOrder === undefined) {
      continue;
    }

    for (const dependencyEngineName of definition.dependsOn) {
      const dependencyDefinition = definitionsByEngine.get(
        dependencyEngineName,
      );

      if (!dependencyDefinition) {
        continue;
      }

      const dependencyOrder = getFirstLifecycleIndex(
        dependencyDefinition.drivenByEvents,
      );

      if (
        dependencyOrder !== undefined &&
        dependencyOrder > engineOrder
      ) {
        throw new SystemEventTopologyValidationError(
          `Topology engine ordering drift detected: "${definition.engine}" ` +
          `depends on "${dependencyEngineName}", but its driving events ` +
          "occur earlier in the master lifecycle sequence.",
        );
      }
    }
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
   * Returns the static engine dependency graph definitions.
   * @return {TopologyEngineDefinition[]} Registered engine definitions.
   */
  public listEngineDefinitions(): readonly TopologyEngineDefinition[] {
    return TOPOLOGY_ENGINE_DEFINITIONS;
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

    assertMasterLifecycleSequence();
    assertDownstreamOrdering();
    assertNoSelfReferentialLoopEdges();
    assertEngineDependencyGraph();
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
    engineCount: number;
    eventCount: number;
    masterLifecycleSequence: readonly SystemEventName[];
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
      engineCount: TOPOLOGY_ENGINE_DEFINITIONS.length,
      eventCount: SYSTEM_EVENT_DEFINITIONS.length,
      masterLifecycleSequence: MASTER_LIFECYCLE_SEQUENCE,
      rootEvents,
    };
  }
}

export const systemEventTopologyService = new SystemEventTopologyService();
