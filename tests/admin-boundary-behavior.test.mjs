import assert from 'node:assert/strict';
import test from 'node:test';
import {adapters, adminModule, clientEnvironment, ok, licenseSnapshot, licenseInput, licenseRequest, licenseReceipt, ticket, ticketList, stamp} from './helpers/frontend-production-modules.mjs';

const zero = value => Array.isArray(value) ? [] : value && typeof value === 'object' ?
  Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, zero(entry)])) : typeof value === 'number' ? 0 : value;

test('Admin overview fetch validates before normalization and preserves real zero counts and empty summary arrays', async () => {
  let wire; const env = clientEnvironment(() => ok(wire));
  const module = adminModule('overview/adminOverviewDataset.ts', env.api);
  wire = zero(module.getFallbackOverviewSnapshot('L0'));
  wire.computedAt = stamp; wire.academicYear = 'unit-year';
  wire.performanceGuarantees.targetLoadTimeMs = 321; wire.performanceGuarantees.maxSummaryDocumentsPerLoad = 8;
  const result = await module.fetchOverviewSnapshot();
  assert.equal(result.computedAt, stamp); assert.equal(result.academicYear, 'unit-year');
  assert.equal(result.operationalSnapshot.activeStudents, 0); assert.equal(result.operationalSnapshot.billingCount, 0);
  assert.deepEqual(result.currentActivity.lastFiveSubmissions, []); assert.deepEqual(result.riskSnapshot.topFiveStudentsRequiringAttention, []);
  assert.deepEqual(result.performanceSummary.distributionHistogram, []);
  assert.equal(env.calls[0].url, '/api/v1/admin/overview');
  wire.operationalSnapshot.activeStudents = 137;
  wire.currentActivity.lastFiveSubmissions = [{studentName: 'API student', assessmentLabel: 'API run', submittedAt: stamp}];
  const populated = await module.fetchOverviewSnapshot();
  assert.equal(populated.operationalSnapshot.activeStudents, 137);
  assert.deepEqual(populated.currentActivity.lastFiveSubmissions, wire.currentActivity.lastFiveSubmissions);
  wire.operationalSnapshot.billingCount = null;
  for (const field of ['eligibilityL1Percentage', 'eligibilityL2Percentage', 'activeStudentCount', 'peakConcurrencyThisMonth']) wire.systemHealthAndLicensing[field] = null;
  const unavailable = await module.fetchOverviewSnapshot();
  assert.equal(unavailable.systemHealthAndLicensing.eligibilityL1Percentage, null);
  assert.equal(unavailable.systemHealthAndLicensing.eligibilityL2Percentage, null);
  assert.equal(unavailable.operationalSnapshot.billingCount, null);
  assert.equal(unavailable.systemHealthAndLicensing.activeStudentCount, null);
  assert.equal(unavailable.systemHealthAndLicensing.peakConcurrencyThisMonth, null);
  for (const [record, field] of [[wire.operationalSnapshot, 'billingCount'], ...['eligibilityL1Percentage', 'eligibilityL2Percentage', 'activeStudentCount', 'peakConcurrencyThisMonth'].map(field => [wire.systemHealthAndLicensing, field])]) {
    for (const malformed of [undefined, '0', Infinity]) {
      record[field] = malformed;
      assert.throws(() => adapters.adaptAdminOverviewResult(wire));
    }
    record[field] = null;
  }
  wire.operationalSnapshot.activeStudents = '137';
  await assert.rejects(module.fetchOverviewSnapshot(), error => error.code === 'INVALID_RESPONSE');
  assert.equal(env.data.getFrontendDataStateSnapshot().kind, 'validation');
});

test('Admin analytics fetch keeps authoritative empty/year summaries and rejects missing summaries or raw response leakage', async () => {
  let wire; const env = clientEnvironment(() => ok(wire));
  const module = adminModule('analytics/analyticsDataset.ts', env.api);
  wire = zero(module.FALLBACK_DATASET); delete wire.studentAnalytics;
  Object.assign(wire.yearBehaviorSummary, {academicYear: 'unit-year', computedAt: stamp, avgDisciplineIndex: 13});
  Object.assign(wire.yearBehaviorSummary.riskStateDistribution, {low: 0, medium: 0, high: 0, critical: 0});
  const result = await module.fetchDashboardDataset();
  for (const field of ['runAnalytics', 'studentYearMetrics', 'studentAnalytics', 'monthlySummary', 'templateAnalytics', 'yearSummarySnapshots']) assert.deepEqual(result[field], []);
  assert.equal(result.yearBehaviorSummary.avgDisciplineIndex, 13); assert.equal(result.yearBehaviorSummary.computedAt, stamp);
  wire.runAnalytics = [{...structuredClone(module.FALLBACK_DATASET.runAnalytics[0]), runId: 'api-run', runName: 'Actual API run', avgRawScorePercent: 17}];
  wire.studentYearMetrics = [{...structuredClone(module.FALLBACK_DATASET.studentYearMetrics[0]), studentId: 'api-student', studentName: 'Actual API student', avgRawScorePercent: 23}];
  const populated = await module.fetchDashboardDataset();
  assert.equal(populated.runAnalytics[0].runId, 'api-run'); assert.equal(populated.runAnalytics[0].avgRawScorePercent, 17);
  assert.equal(populated.studentYearMetrics[0].studentId, 'api-student'); assert.equal(populated.studentYearMetrics[0].avgRawScorePercent, 23);
  assert.equal(populated.yearBehaviorSummary.avgDisciplineIndex, 13);
  const original = structuredClone(wire); delete wire.yearBehaviorSummary;
  await assert.rejects(module.fetchDashboardDataset(), error => error.code === 'INVALID_RESPONSE');
  wire = {...original, rawAnswers: []};
  await assert.rejects(module.fetchDashboardDataset(), error => error.code === 'INVALID_RESPONSE');
  assert.equal(env.calls.length, 4);
});

test('licensing adapters preserve null authority and zero prices and reject malformed nested snapshots and absent open requests', async () => {
  let snapshot = licenseSnapshot(); snapshot.plans[1].basePriceMonthly = 0;
  const env = clientEnvironment(() => ok({actionType: 'GET_LICENSE_SNAPSHOT', snapshot}));
  const module = adminModule('licensing/licensingDataset.ts', env.api);
  const result = await module.fetchLicensingSnapshot();
  assert.equal(result.usage, null); assert.equal(result.currentLicense.activeStudentLimit, null);
  assert.equal(result.plans[1].basePriceMonthly, 0); assert.deepEqual(result.billing.items, []);
  for (const mutate of [s => s.currentLicense.layer = 'L4', s => s.plans.push(s.plans[0]),
    s => s.requests.openRequestId = 'missing', s => s.plans[0].activeStudentLimit = -1,
    s => delete s.currentLicense.expiryDate, s => s.currentLicense.featureFlags.controlledMode = 'false']) {
    snapshot = licenseSnapshot(); mutate(snapshot); await assert.rejects(module.fetchLicensingSnapshot());
  }
});

test('licensing mutation needs matching receipt and authoritative request reload before success', async () => {
  for (const mode of ['confirmed', 'missing', 'version', 'plan', 'reload-failed', 'receipt']) {
    const env = clientEnvironment((_url, _options, call) => {
      if (call === 1) {const receipt = licenseReceipt(); if (mode === 'receipt') receipt.request.requestedPlanId = 'other';
        return ok({actionType: 'REQUEST_LICENSE_UPGRADE', receipt});}
      if (mode === 'reload-failed') throw Error('read unavailable');
      const snapshot = licenseSnapshot(); snapshot.requests.items = mode === 'missing' ? [] : [licenseRequest()];
      if (mode === 'version') snapshot.currentLicense.licenseVersion = 'different';
      if (mode === 'plan') snapshot.requests.items[0].requestedPlanId = 'different';
      return ok({actionType: 'GET_LICENSE_SNAPSHOT', snapshot});
    });
    const module = adminModule('licensing/licensingDataset.ts', env.api);
    if (mode === 'confirmed') {
      const result = await module.submitLicenseUpgradeRequest(licenseInput());
      assert.equal(result.snapshot.requests.items[0].requestId, 'request-a');
    } else await assert.rejects(module.submitLicenseUpgradeRequest(licenseInput()));
    assert.equal(env.calls.length, mode === 'receipt' ? 1 : 2);
    const sent = JSON.parse(env.calls[0].options.body); assert.equal(sent.idempotencyKey, licenseInput().idempotencyKey);
    assert.equal(sent.instituteId, undefined); assert.equal(sent.actorId, undefined);
  }
});

test('fixture mode cannot dispatch licensing reads or mutations as live authority', async () => {
  const env = clientEnvironment(() => {throw Error('must not dispatch');});
  const module = adminModule('licensing/licensingDataset.ts', env.api, true);
  await assert.rejects(module.fetchLicensingSnapshot()); await assert.rejects(module.submitLicenseUpgradeRequest(licenseInput()));
  assert.equal(env.calls.length, 0);
});

test('settings mutation requires command, revision, immutable audit and reloaded profile agreement', async () => {
  for (const mode of ['confirmed', 'command', 'audit', 'revision', 'profile']) {
    let snapshot;
    const env = clientEnvironment((_url, _options, call) => {
      const next = structuredClone(snapshot); next.revision = 2; next.profile.timeZone = 'Asia/Kolkata';
      next.audit.items = [{actionType: 'UPDATE_INSTITUTE_PROFILE', actorUserId: 'actor-a', area: 'institute_profile',
        eventId: 'audit-a', occurredAt: stamp, revision: 2, summary: 'Updated profile', targetId: 'tenant-a'}];
      if (call > 1) {
        if (mode === 'audit') next.audit.items = [];
        if (mode === 'revision') next.revision = 1;
        if (mode === 'profile') next.profile.timeZone = 'UTC';
      }
      return ok({actionType: call === 1 ? 'UPDATE_INSTITUTE_PROFILE' : 'GET_SETTINGS_SNAPSHOT', snapshot: next,
        ...(call === 1 ? {receipt: {commandId: mode === 'command' ? 'wrong' : 'command-a', revision: 2,
          auditEventId: 'audit-a', completedAt: stamp, replayed: false}} : {})});
    });
    const module = adminModule('settings/settingsDataset.ts', env.api); snapshot = structuredClone(module.FALLBACK_SNAPSHOT);
    snapshot.revision = 1; snapshot.academicYears = []; snapshot.users = []; snapshot.audit.items = [];
    const input = {...snapshot.profile, timeZone: ' Asia/Kolkata '};
    if (mode === 'confirmed') assert.equal((await module.updateInstituteProfile(input, 1, 'command-a')).profile.timeZone, 'Asia/Kolkata');
    else await assert.rejects(module.updateInstituteProfile(input, 1, 'command-a'));
    assert.equal(env.calls.length, mode === 'command' ? 1 : 2);
    const sent = JSON.parse(env.calls[0].options.body); assert.equal(sent.profile.timeZone, 'Asia/Kolkata');
    assert.equal(sent.instituteId, undefined); assert.equal(sent.profile.instituteName, undefined);
  }
});

test('support reconciliation requires matching revision, status and a confirmed command message', async () => {
  for (const mode of ['confirmed', 'revision', 'status', 'missing-message', 'missing-list']) {
    const saved = ticket('ticket-a', 2);
    const env = clientEnvironment(url => {
      if (url.includes('/tickets/ticket-a')) {
        const reloaded = {...saved}; if (mode === 'revision') reloaded.revision = 1;
        if (mode === 'status') reloaded.status = 'closed';
        const message = {messageId: 'message-a', ticketId: 'ticket-a', authorType: 'institute', authorDisplayName: 'Unit admin',
          body: 'Unit message', attachments: [], createdAt: stamp, sequence: 1};
        return ok({ticket: reloaded, messages: {items: mode === 'missing-message' ? [] : [message], nextCursor: null}});
      }
      return ok(ticketList(mode === 'missing-list' ? [] : [saved]));
    });
    const module = adminModule('support/supportDataset.ts', env.api);
    const command = {ticket: saved, message: {messageId: 'message-a'}};
    if (mode === 'confirmed') assert.equal((await module.reconcileSupportMutation(command)).ticket.revision, 2);
    else await assert.rejects(module.reconcileSupportMutation(command));
    assert.equal(env.calls.length, 2);
  }
});
