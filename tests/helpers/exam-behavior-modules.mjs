import {webcrypto} from 'node:crypto';
import {loadProduction, clientEnvironment, errors, adapters, ok} from './frontend-production-modules.mjs';
export const stamp = '2026-10-24T09:00:00.000Z';
export const claims = {role: 'student', instituteId: 'tenant-a', yearId: 'year-a', runId: 'run-a', sessionId: 'session-a', studentId: 'student-a', launchNonce: 'nonce-a'};
export const jwt = value => `header.${Buffer.from(JSON.stringify({sub: 'actor-a', ...value})).toString('base64url')}.signature`;
export const lease = () => ({contractVersion: 2, generation: 1, serverTime: stamp, expiresAt: '2026-10-24T09:01:30.000Z', renewAfterSeconds: 30});
export function entry() {
  const runtimeSnapshot = {sessionId: 'session-a', mode: 'Diagnostic', subjects: ['Physics'], questionSetVersion: 'unit-v1', hardModeRevisitRestricted: false,
    difficultyDistribution: {easyPercent: 100, mediumPercent: 0, hardPercent: 0}, phaseConfigSnapshot: {phase1Percent: 40, phase2Percent: 45, phase3Percent: 15, bufferPercent: 0},
    license: {currentLayer: 'L1', eligibilityFlags: {diagnosticEligible: true}, featureFlags: {}},
    proctoringPolicy: {contractVersion: 1, browserIntegrityGuardEnabled: false, cameraReadiness: 'off', identityPhotoReview: 'not_required', integrityReporting: 'off',
      capabilities: {automatedFaceMatching: 'unavailable', automatedGazeTracking: 'unavailable', cameraReadiness: 'browser_permission_only', browserIntegrity: 'browser_controls_only'}},
    questions: [{id: 'q', number: 1, type: 'mcq', difficulty: 'easy', section: 'Physics', text: 'Unit question', imageUrl: '', media: null,
      options: [{id: 'A', label: 'A', text: 'One'}, {id: 'B', label: 'B', text: 'Two'}], matrixRows: [], matrixColumns: []}],
    schedule: {durationMs: 3600000, earlyEntryBufferMinutes: 0, earlyEntryOpensAt: stamp, sessionStartsAt: stamp, sessionEndsAt: '2026-10-24T10:00:00.000Z', timezone: 'UTC'},
    timingProfile: {controlledSlowdownSeconds: 12, finalWindowMinutes: 10, hardModeRestrictSubmitUntilAllVisited: true, hardModeSequentialNavigation: true,
      maxTimeByDifficultySec: {easy: 60, medium: 150, hard: 210}, minTimeByDifficultySec: {easy: 30, medium: 60, hard: 150}, syncEveryMs: 10000}};
  return {allowed: true, sessionId: 'session-a', instituteId: 'tenant-a', yearId: 'year-a', runId: 'run-a', studentId: 'student-a', runtimeSnapshot,
    status: 'started', startedAt: null, deadlineAt: null, serverTime: stamp,
    recovery: {contractVersion: 1, maxAcceptedClientTimestamp: null, questions: [{questionId: 'q', answer: null, cumulativeTimeSpentSeconds: 0, maxTimeLocked: false}]}};
}
export const submission = (alreadySubmitted = true) => ({accuracyPercent: 0, alreadySubmitted, disciplineIndex: 0, guessRatePercent: 0, maxTimeViolationPercent: 0,
  minTimeViolationPercent: 0, operationalDataAccessPolicy: {}, phaseAdherencePercent: 0, rawScorePercent: 0, riskState: 'Stable', status: 'submitted', submissionReason: 'expiry', submittedAt: stamp});
export const reconciliation = (status = 'submitted') => ({operation: 'reconcile', contractVersion: 1, sessionId: 'session-a', generation: 1, serverTime: stamp, status,
  ...(status === 'submitted' ? {submission: submission()} : status === 'terminated' ? {} : {startedAt: null, deadlineAt: null, recovery: entry().recovery})});
export const validation = loadProduction('shared/services/examRecoveryValidation.ts');
export const answers = loadProduction('apps/exam/src/answerRecovery.ts', {'../../../shared/services/examRecoveryValidation': validation});
export const clock = loadProduction('apps/exam/src/runtimeClock.ts');

// Production ownership, transport, HTTP client, envelope and strict adapters.
// Auth, storage, transport responses and wait progression are controlled L2 inputs.
export function examEnvironment({request, storageFailure = false, apiBaseUrl = '', metadata = {}, tokenHook} = {}) {
  let now = 100, activeClaims = {...claims}, authCallback;
  const timers = new Map(), storage = new Map(), waits = [], tokens = []; let timerId = 0;
  const auth = {currentUser: {uid: 'actor-a'}, authStateReady: async () => {}};
  const env = clientEnvironment(async (url, options, number) => {
    const body = options.body === undefined ? undefined : JSON.parse(options.body);
    const result = await request?.(url, options, body, number);
    return result ?? ok({operation: 'launch', ownership: lease(), entry: entry()});
  }, {getToken: async () => jwt(activeClaims)});
  const transport = loadProduction('apps/exam/src/resilientTransport.ts', {'../../../shared/types/apiClient': errors});
  const top = {}, document = {visibilityState: 'visible'}, navigator = {onLine: true};
  const module = loadProduction('apps/exam/src/launchTransport.ts', {
    'firebase/auth': {getIdTokenResult: async (user, force) => {tokens.push({user, force}); await tokenHook?.(user, force); return {claims: activeClaims, token: jwt(activeClaims)};},
      signInWithCustomToken: async () => {}, signOut: async () => {auth.currentUser = null;}, onIdTokenChanged: (_auth, fn) => {authCallback = fn; return () => {}; }},
    '../../../shared/services/portalIntegration': {getPortalApiClient: () => env.api},
    '../../../shared/services/frontendEnvironment': {getFrontendEnvironment: () => ({apiBaseUrl})},
    '../../../shared/services/firebaseClient': {getFirebaseAuth: () => auth},
    '../../../shared/services/apiClient': {...errors, SAME_ORIGIN_API_BASE_URL: '/api/v1'},
    '../../../shared/services/portalResponseAdapters': adapters,
    './launchBootstrap': {getLaunchMetadata: () => ({status: 'valid', sessionId: 'session-a', devMock: false, ...metadata}), takeLaunchCredential: () => 'unit-custom-token'},
    './resilientTransport': {...transport, runRuntimeOperation: op => transport.runRuntimeOperation({...op, wait: async ms => {waits.push(ms);}})},
    './ownershipState': loadProduction('apps/exam/src/ownershipState.ts'),
  }, {crypto: webcrypto, BroadcastChannel: undefined, window: {location: {origin: 'https://exam.example.test'}, self: top, top,
      setTimeout: (fn, delay) => {timers.set(++timerId, {fn, delay}); return timerId;}, clearTimeout: id => timers.delete(id)},
    navigator, document, performance: {now: () => now}, sessionStorage: {getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => {if (storageFailure) throw new Error('Storage disabled'); storage.set(key, value);}, removeItem: key => storage.delete(key)}});
  return {...env, owner: new module.ExamRuntimeOwnership('session-a'), storage, timers, waits, tokens, auth, document, navigator,
    time: value => {now = value;}, replace: (patch, notify = false) => {activeClaims = {...activeClaims, ...patch}; if (notify) authCallback?.(auth.currentUser);}};
}

export function logicalClock() {
  let now = Date.parse(stamp), id = 0; const timers = new Map();
  const set = (fn, delay, repeat = false) => {timers.set(++id, {fn, at: now + delay, delay, repeat}); return id;};
  class LogicalDate extends Date {constructor(...args) {super(...(args.length ? args : [now]));} static now() {return now;}}
  return {timers, globals: {Date: LogicalDate, setTimeout: (fn, delay) => set(fn, delay), clearTimeout: key => timers.delete(key),
    setInterval: (fn, delay) => set(fn, delay, true), clearInterval: key => timers.delete(key)},
    async tick(ms) {const end = now + ms; for (;;) {const next = [...timers].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break; const [key, timer] = next; now = timer.at; if (timer.repeat) timer.at += timer.delay; else timers.delete(key);
      timer.fn(); for (let i = 0; i < 20; i++) await Promise.resolve();} now = end;}, now: () => now};
}
