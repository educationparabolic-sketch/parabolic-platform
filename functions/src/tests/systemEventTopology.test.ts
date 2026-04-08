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

    assert.equal(summary.eventCount, 15);
    assert.deepEqual(summary.domains, [
      "archiveLifecycle",
      "assignment",
      "content",
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
      "VendorAggregatesUpdated",
      "BillingMeterUpdated",
      "ArchiveTriggered",
    ]);
    assert.deepEqual(summary.rootEvents, [
      "QuestionCreated",
      "BillingWebhookReceived",
    ]);
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
