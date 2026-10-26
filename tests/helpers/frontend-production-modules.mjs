import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {root, ts} from './vendor-action-inventory.mjs';

// Executes production exports with explicit dependencies; no copied normalizer,
// HTTP client, state reducer or component implementation lives in this harness.
export function loadProduction(file, dependencies = {}, globals = {}) {
  const source = readFileSync(`${root}/${file}`, 'utf8').replaceAll('import.meta.env', 'testEnvironment');
  const output = ts.transpileModule(source, {fileName: file, compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  }}).outputText;
  const module = {exports: {}};
  const context = {testEnvironment: {}, ...globals};
  new Function('module', 'exports', 'require', ...Object.keys(context), output)(module, module.exports, name => {
    assert.ok(Object.hasOwn(dependencies, name), `${file}: unexpected dependency ${name}`);
    return dependencies[name];
  }, ...Object.values(context));
  return module.exports;
}

export const errors = loadProduction('shared/types/apiClient.ts');
export const envelopes = loadProduction('shared/types/apiResponse.ts');
export const adapters = loadProduction('shared/services/portalResponseAdapters.ts', {
  './examRecoveryValidation': loadProduction('shared/services/examRecoveryValidation.ts'),
});
export const stamp = '2026-10-24T09:00:00.000Z';
export const ok = data => new Response(JSON.stringify({success: true, code: 'OK', data,
  message: 'Confirmed', requestId: 'unit-request', timestamp: stamp}), {headers: {'Content-Type': 'application/json; charset=utf-8'}});
export const denied = (status, code, details, headers = {}) => new Response(JSON.stringify({success: false,
  error: {code, message: 'Authoritative denial', ...(details ? {details} : {})}, requestId: 'unit-denied', timestamp: stamp}),
{status, headers: {'Content-Type': 'application/json', ...headers}});

export function clientEnvironment(fetcher, {config = {}, timers = {}, getToken = async () => 'unit-token'} = {}) {
  const data = loadProduction('shared/services/frontendDataState.ts');
  const authority = loadProduction('shared/services/authSessionConvergence.ts');
  const signals = [], timings = [], failures = [], calls = [];
  const user = {uid: 'actor-a'};
  authority.subscribeToAuthAuthoritySignals(signal => signals.push(signal));
  const sdk = loadProduction('shared/services/apiClient.ts', {
    'firebase/auth': {getIdToken: getToken}, './firebaseClient': {getFirebaseAuth: () => ({currentUser: user})},
    './frontendEnvironment': {getFrontendEnvironment: () => ({apiBaseUrl: ''})},
    './authSessionConvergence': authority, './frontendDataState': data,
    './frontendMonitoring': {captureFrontendApiTiming: value => timings.push(value), captureFrontendApiFailure: value => failures.push(value)},
    '../types/apiClient': errors, '../types/apiResponse': envelopes,
  }, {window: undefined, fetch: async (url, options) => {calls.push({url, options}); return fetcher(url, options, calls.length);}, ...timers});
  return {api: sdk.createApiClient(config), data, calls, signals, timings, failures, user};
}

export function adminModule(file, api, fixture = false) {
  return loadProduction(`apps/admin/src/features/${file}`, {
    '../../../../../shared/services/apiClient': errors,
    '../../../../../shared/services/portalResponseAdapters': adapters,
    '../../../../../shared/services/frontendEnvironment': {shouldUseFixtureData: () => fixture, shouldUseLiveApi: () => !fixture},
    '../../../../../shared/services/portalIntegration': {getPortalApiClient: portal => {assert.equal(portal, 'admin'); return api;}},
  }, {globalThis: {crypto: {randomUUID}}});
}

export const flags = () => ({adaptivePhase: false, controlledMode: false, governanceAccess: false, hardMode: false, riskOverview: false});
export const plan = (planId, layer) => ({planId, layer, name: null, activeStudentLimit: null, basePriceMonthly: null,
  concurrencyLimit: null, currency: null, featureFlags: flags(), monthlySessionExecutionLimit: null, pricePerStudent: null});
export function licenseSnapshot() {
  return {asOf: stamp, billing: {items: [], nextCursor: null}, capabilities: [],
    currentLicense: {activeStudentLimit: null, billingCycle: 'monthly', concurrencyLimit: null, expiryDate: null,
      featureFlags: flags(), gracePeriodEndsAt: null, instituteId: 'tenant-a', instituteName: 'Unit institute', layer: 'L0',
      licenseVersion: 'version-1', planId: 'basic', planName: null, renewalDate: null, startDate: null, state: 'active'},
    externalActions: [], history: {items: [], nextCursor: null}, plans: [plan('basic', 'L0'), plan('growth', 'L1')],
    requests: {items: [], nextCursor: null, openRequestId: null}, usage: null};
}
export const licenseInput = () => ({expectedLicenseVersion: 'version-1', idempotencyKey: 'unit-intent-key',
  reason: 'More capacity for actual students', requestKind: 'upgrade', requestedPlanId: 'growth'});
export function licenseRequest() {
  return {currentLayer: 'L0', currentPlanId: 'basic', decidedAt: null, decidedByUserId: null, decisionNote: null,
    expectedLicenseVersion: 'version-1', reason: licenseInput().reason, requestId: 'request-a', requestKind: 'upgrade',
    requestedLayer: 'L1', requestedPlanId: 'growth', status: 'pending', submittedAt: stamp, submittedByUserId: 'actor-a'};
}
export const licenseReceipt = () => ({auditEventId: 'audit-a', disposition: 'applied', licenseVersion: 'version-1', request: licenseRequest()});
export const ticket = (id = 'ticket-a', revision = 1) => ({assignedTeam: 'platform_support', category: 'technical_issue',
  createdAt: stamp, displayId: id, lastMessageAt: stamp, messageCount: 1, priority: 'normal', revision, status: 'open',
  subject: `Subject ${id}`, ticketId: id, updatedAt: stamp});
export const ticketList = (items = [], nextCursor = null) => ({counts: {awaitingInstitute: 0, closed: 0, inProgress: 0,
  open: items.length, resolved: 0, urgentNotClosed: 0}, items, nextCursor});
