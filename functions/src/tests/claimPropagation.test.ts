import assert from "node:assert/strict";
import test from "node:test";
import {
  buildClaimPropagationOperationRecord,
  CLAIM_PROPAGATION_BROWSER_SLA_SECONDS,
  CLAIM_PROPAGATION_LEASE_SECONDS,
  CLAIM_PROPAGATION_MAX_ATTEMPTS,
  CLAIM_PROPAGATION_PAGE_SIZE,
  CLAIM_PROPAGATION_RETRY_DELAYS_SECONDS,
  CLAIM_PROPAGATION_SCHEDULE_MINUTES,
  CLAIM_PROPAGATION_SERVER_SLA_SECONDS,
  CLAIM_PROPAGATION_SWEEP_MAX_OPERATIONS,
  ClaimPropagationScheduleService,
} from "../services/claimPropagation";

const desiredAuthority = {
  activeStudentLimit: 500,
  authorizationVersion: 7,
  concurrentSessionLimit: 120,
  expiryDate: "2099-10-03T00:00:00.000Z",
  featureFlags: {
    adaptivePhase: true,
    controlledMode: true,
    governanceAccess: false,
    hardMode: true,
    riskOverview: true,
  },
  gracePeriodEndsAt: null,
  instituteAccess: "active" as const,
  instituteId: "inst_claim_propagation",
  instituteRevision: 4,
  licenseLayer: "L2" as const,
  licenseState: "active" as const,
  licenseVersion: "license-v7",
};

test("operation builder freezes deterministic identity, bounds, and deadlines", () => {
  const createdAt = new Date("2026-10-03T10:00:00.000Z");
  const operation = buildClaimPropagationOperationRecord({
    createdAt,
    desiredAuthority,
    source: "license_changed",
  });

  assert.equal(operation.operationId, "v7");
  assert.equal(operation.auditEventId, "claim_propagation_v7");
  assert.equal(operation.serverDeadlineAt, "2026-10-03T10:04:00.000Z");
  assert.equal(operation.browserDeadlineAt, "2026-10-03T10:05:00.000Z");
  assert.equal(operation.nextAttemptAt, createdAt.toISOString());
  assert.equal(operation.enumeration.pageSize, 100);
  assert.equal(operation.maxAttempts, 5);
  assert.equal(operation.state, "pending");
  assert.deepEqual(operation.counts, {
    claimsChanged: 0,
    deadLettered: 0,
    discovered: 0,
    missing: 0,
    refreshTokensRevoked: 0,
    synchronized: 0,
  });
});

test("runtime constants remain aligned with the dependency-free contract", () => {
  assert.equal(CLAIM_PROPAGATION_PAGE_SIZE, 100);
  assert.equal(CLAIM_PROPAGATION_LEASE_SECONDS, 60);
  assert.equal(CLAIM_PROPAGATION_MAX_ATTEMPTS, 5);
  assert.deepEqual(CLAIM_PROPAGATION_RETRY_DELAYS_SECONDS, [5, 15, 30, 60]);
  assert.equal(CLAIM_PROPAGATION_SERVER_SLA_SECONDS, 240);
  assert.equal(CLAIM_PROPAGATION_BROWSER_SLA_SECONDS, 300);
  assert.equal(CLAIM_PROPAGATION_SCHEDULE_MINUTES, 1);
  assert.equal(CLAIM_PROPAGATION_SWEEP_MAX_OPERATIONS, 100);
});

test("schedule processes deadlines before draining bounded operations", async () => {
  const events: string[] = [];
  const service = new ClaimPropagationScheduleService(
    {
      processDueTransitions: async (maximumTransitions) => {
        events.push(`deadlines:${maximumTransitions}`);
        return {inspected: 3, transitioned: 2};
      },
    },
    {
      processDueOperations: async (workerId, maximumOperations) => {
        events.push(`operations:${workerId}:${maximumOperations}`);
        return {invoked: 9, processed: 9};
      },
    },
  );

  assert.deepEqual(await service.execute("schedule-event-1"), {
    deadlines: {inspected: 3, transitioned: 2},
    operations: {invoked: 9, processed: 9},
  });
  assert.deepEqual(events, [
    "deadlines:100",
    "operations:schedule-event-1:100",
  ]);
});

test("operation builder rejects incomplete limit and version authority", () => {
  assert.throws(
    () => buildClaimPropagationOperationRecord({
      createdAt: new Date(),
      desiredAuthority: {...desiredAuthority, authorizationVersion: 0},
      source: "license_changed",
    }),
    /authorizationVersion/u,
  );
  assert.throws(
    () => buildClaimPropagationOperationRecord({
      createdAt: new Date(),
      desiredAuthority: {...desiredAuthority, concurrentSessionLimit: 0},
      source: "license_changed",
    }),
    /concurrentSessionLimit/u,
  );
});
