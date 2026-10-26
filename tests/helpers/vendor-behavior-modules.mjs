import assert from 'node:assert/strict';
import {loadProduction, clientEnvironment, errors, stamp} from './frontend-production-modules.mjs';
export {stamp};
export function vendorEnvironment(fetcher) {
  const env = clientEnvironment(fetcher), store = new Map();
  const recovery = loadProduction('apps/vendor/src/features/shared/vendorCommandRecovery.ts', {
    '../../../../../shared/services/firebaseClient': {getFirebaseAuth: () => ({currentUser: env.user})},
    '../../../../../shared/services/apiClient': errors,
  }, {window: {sessionStorage: {getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value), removeItem: key => store.delete(key)}}});
  const load = (file, extra = {}) => loadProduction(`apps/vendor/src/features/${file}`, {
    '../../../../../shared/services/apiClient': errors,
    '../../../../../shared/services/portalIntegration': {getPortalApiClient: portal => {assert.equal(portal, 'vendor'); return env.api;}},
    '../shared/vendorCommandRecovery': recovery, ...extra,
  });
  const intelligenceResponse = load('intelligence/vendorIntelligenceResponse.ts');
  const intelligence = load('intelligence/vendorIntelligenceApi.ts', {'./vendorIntelligenceResponse': intelligenceResponse});
  const auditResponse = load('audit/vendorAuditHealthResponse.ts');
  const audit = load('audit/vendorAuditHealthApi.ts', {'./vendorAuditHealthResponse': auditResponse});
  const calibration = load('calibration/vendorCalibrationApi.ts', {
    './vendorCalibrationResponse': load('calibration/vendorCalibrationResponse.ts'),
    './vendorCalibrationOperation': load('calibration/vendorCalibrationOperation.ts'),
  });
  return {...env, recovery, store, intelligence, intelligenceResponse, audit, auditResponse, calibration,
    institutes: load('institutes/vendorInstitutesApi.ts'), commercial: load('licensing/vendorCommercialApi.ts')};
}
export const list = () => ({items: [], nextCursor: null, totalMatching: 0});
export const deletion = () => ({eligibleAt: null, lastErrorCode: null, operationId: null, scheduledAt: null, stage: 'none'});
export function institute() {
  return {instituteId: 'tenant-a', registeredName: 'Unit institute', revision: 2, settingsRevision: 0, accessStatus: 'active', lifecycleState: 'active',
    aggregate: {activeStudentCount: 0, aggregateAsOf: null, lastActiveAt: null, monthlyTestRuns: null}, primaryAdministrator: null,
    commercial: {authorityState: 'not_configured', licenseLayer: null, licenseState: null, licenseVersion: null, planId: null},
    createdAt: stamp, updatedAt: stamp, administrators: [], deletion: deletion(), calibrationPointer: {present: true, value: null},
    profile: {registeredName: 'Unit institute', vendorAccountReference: null}};
}
export const instituteReceipt = () => ({auditEventId: 'audit-a', commandId: 'command-a', completedAt: stamp, deletion: deletion(), instituteId: 'tenant-a',
  lifecycleState: 'active', propagation: {authorizationVersion: 0, browserDeadlineAt: null, operationId: null, serverDeadlineAt: null, state: 'not_required'},
  propagationState: 'not_required', replayed: false, revision: 2});
export const providerReceipt = (state = 'failed_retryable') => ({auditEventId: 'audit-a', commandId: 'command-a', completedAt: stamp,
  processingState: 'failed_retryable', reconciliationState: 'pending', replayed: false, revision: 2,
  providerOperation: {attemptCount: 1, lastErrorCode: null, nextAttemptAt: null, operationId: 'provider-a', provider: 'stripe', state, updatedAt: stamp}});
export const metadata = (query = {}) => ({availability: 'empty', dataAsOfMonth: null, generatedAt: null, requestedAsOfMonth: query.asOfMonth ?? null, schemaVersion: 1,
  windowMonths: query.windowMonths ?? 6, windowStartMonth: null, windowEndMonth: null,
  sources: ['billingSnapshots', 'governanceSnapshots', 'licenseHistory', 'usageMeter', 'vendorAggregates', 'vendorIntelligenceSnapshots'].map(source => ({source, dataAsOfMonth: null, documentCount: 0, state: 'empty'}))});
const nulls = keys => Object.fromEntries(keys.split(' ').map(key => [key, null]));
export function intelligence(query = {}) {
  const m = metadata(query);
  return {readiness: {metadata: m, modules: Object.fromEntries(['aggregateRollup', 'churnTracking', 'layerDistribution', 'revenueForecasting', 'revenueIntelligence'].map(key => [key, 'empty'])),
    unavailablePanels: {calibrationImpact: {owner: 'BWM-038', reason: 'owned_by_bwm_038', status: 'unavailable'},
      studentBehaviorSignals: {owner: 'BWM-037', reason: 'no_authoritative_aggregate', status: 'unavailable'}, topicWeaknessClusters: {owner: 'BWM-037', reason: 'no_authoritative_aggregate', status: 'unavailable'}}},
    revenue: {metadata: m, current: null, monthlySnapshots: [], instituteRevenue: []},
    layers: {metadata: m, totalInstitutes: 0, instituteCountByLayer: {L0: 0, L1: 0, L2: 0, L3: 0}, currentLayerPercentages: {L0: null, L1: null, L2: null, L3: null}, averageTimeInLayerDays: [], migrationVelocity: [], upgradeFrequencyByInstituteSize: []},
    churn: {metadata: m, inactiveInstituteCount: null, inactiveInstitutes: [], monthlyChurn: null, churnByInstituteSize: [], churnByLayer: [], currentMonthDowngrades: [], engagementDeclines: []},
    forecast: {metadata: m, observedMonthCount: 0,
      revenueGrowthProjection: nulls('averageMonthlyGrowthRatePercent averageMonthlyRevenueDelta currentMRR projectedARR6Months projectedMRR3Months projectedMRR6Months'),
      instituteAcquisitionProjection: nulls('averageNetNewInstitutesPerMonth currentInstituteCount projectedAcquisitionRatePerMonth projectedInstituteCount3Months projectedInstituteCount6Months'),
      studentVolumeTrend: nulls('averageMonthlyGrowthRatePercent averageMonthlyStudentDelta currentActiveStudents projectedActiveStudents3Months projectedActiveStudents6Months source'),
      upgradeProbability: nulls('currentUpgradeableInstituteCount observedUpgradeCountTrailing6Months projectedUpgradeCountNext6Months trailing6MonthUpgradeProbabilityPercent'),
      infrastructureCostRevenueRatio: nulls('costModelVersion currentCostToRevenueRatioPercent currentEstimatedMonthlyCost projectedCostToRevenueRatioPercent3Months projectedCostToRevenueRatioPercent6Months projectedEstimatedMonthlyCost3Months projectedEstimatedMonthlyCost6Months')}};
}
export const intelligenceKey = url => ({'layer-distribution': 'layers', 'revenue-forecasting': 'forecast'}[url.split('?')[0].split('/').at(-1)] ?? url.split('?')[0].split('/').at(-1));
export function health() {
  const unavailable = reason => ({availability: 'unavailable', observedAt: stamp, reason});
  const queue = {availability: 'available', observedAt: stamp, data: {totalCount: 0, outstandingCount: 0, processingCount: 0, retryingCount: 0, succeededCount: 0, failedCount: 0, oldestOutstandingAt: null, newestActivityAt: null}};
  return {generatedAt: stamp, release: unavailable('not_configured'), failureRecovery: queue, emailDelivery: queue, stripeReconciliation: queue, calibrationOperations: queue,
    cloudMonitoring: unavailable('adapter_not_implemented'), errorReporting: unavailable('adapter_not_implemented'),
    costAndUsage: unavailable('no_durable_source'), latencyAndErrorMetrics: unavailable('no_durable_source'), frontendTelemetry: unavailable('no_durable_source'), deploymentHistory: unavailable('no_durable_source')};
}
export const settle = async h => {await new Promise(setImmediate); await h.flush(); await new Promise(setImmediate); await h.flush();};
