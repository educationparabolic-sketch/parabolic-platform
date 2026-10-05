import assert from "node:assert/strict";
import test from "node:test";
import {systemEventTopologyService} from "../services/systemEventTopology";

test(
  "assertTopologyInvariants validates a cycle-free deterministic graph",
  () => {
    assert.doesNotThrow(() => {
      systemEventTopologyService.assertTopologyInvariants();
    });
  },
);

test(
  "getTopologySummary exposes the registered event domains and roots",
  () => {
    const summary = systemEventTopologyService.getTopologySummary();

    assert.equal(summary.eventCount, 16);
    assert.equal(summary.engineCount, 12);
    assert.deepEqual(summary.domains, [
      "archiveLifecycle",
      "assignment",
      "content",
      "identityAuthority",
      "postSubmission",
      "sessionExecution",
      "template",
      "vendorIntelligence",
    ]);
    assert.deepEqual(summary.masterLifecycleSequence, [
      "QuestionCreated",
      "TemplateCreated",
      "AssignmentCreated",
      "SessionStarted",
      "AnswerBatchReceived",
      "SessionSubmitted",
      "AnalyticsGenerated",
      "InsightsGenerated",
      "GovernanceSnapshotScheduled",
      "BillingMeterUpdated",
      "VendorAggregatesUpdated",
      "ArchiveTriggered",
    ]);
    assert.deepEqual(summary.rootEvents, [
      "QuestionCreated",
      "BillingWebhookReceived",
      "ClaimPropagationSweepScheduled",
    ]);

    assert.deepEqual(
      systemEventTopologyService.getEventDefinition(
        "ClaimPropagationSweepScheduled",
      ),
      {
        description:
          "Institute authorization operations and elapsed license deadlines are " +
          "drained on a bounded one-minute schedule.",
        domain: "identityAuthority",
        downstreamEvents: [],
        executionMode: "scheduled",
        name: "ClaimPropagationSweepScheduled",
        primaryHandler: "claimPropagationSweepEveryMinute",
        source: "Every 1 minute schedule",
        sourceKind: "scheduled",
      },
    );
  },
);

test(
  "listEngineDefinitions exposes an acyclic dependency graph for topology " +
    "engines",
  () => {
    const definitions = systemEventTopologyService.listEngineDefinitions();
    const dependencyMap = new Map(
      definitions.map(
        (definition) => [definition.engine, definition.dependsOn],
      ),
    );

    assert.equal(definitions.length, 12);
    assert.deepEqual(
      dependencyMap.get("PatternEngine"),
      ["RiskEngine"],
    );
    assert.deepEqual(
      dependencyMap.get("ArchiveEngine"),
      ["VendorAggregationEngine"],
    );
  },
);

test(
  "executeEventHandler rejects non-primary handlers for registered events",
  async () => {
    await assert.rejects(
      systemEventTopologyService.executeEventHandler(
        "SessionSubmitted",
        "examSessionSubmit",
        {
          eventId: "evt_build_106_invalid_handler",
          instituteId: "inst_build_106",
          runId: "run_build_106",
          sessionId: "session_build_106",
          yearId: "2026",
        },
        async () => undefined,
      ),
      (error: unknown) => {
        assert.match(String(error), /not the primary handler/i);
        return true;
      },
    );
  },
);

test(
  "executeEventHandler runs registered handlers and returns the operation " +
    "result",
  async () => {
    const result = await systemEventTopologyService.executeEventHandler(
      "TemplateCreated",
      "testTemplateOnCreate",
      {
        eventId: "evt_build_106_success",
        instituteId: "inst_build_106",
        testId: "test_build_106",
      },
      async () => "topology-ok",
    );

    assert.equal(result, "topology-ok");
  },
);
