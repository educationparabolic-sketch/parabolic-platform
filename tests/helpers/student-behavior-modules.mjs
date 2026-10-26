import assert from 'node:assert/strict';
import {loadProduction, clientEnvironment} from './frontend-production-modules.mjs';
export const recovery = loadProduction('apps/student/src/services/studentResultRecovery.ts');
export const rawPolicy = loadProduction('apps/student/src/services/studentSummaryDataPolicy.ts');
export const profileContract = loadProduction('shared/services/studentProfileContract.ts');
export const photoId = 'photo_' + 'a'.repeat(40);
export const photo = {photoId, capturedAt: '2026-10-17T10:00:00.000Z', expiresAt: '2027-01-15T10:00:00.000Z', consentPolicyVersion: 'student-identity-photo-v1'};
export const profile = (version = 1) => ({studentId: 'student-a', version, fullName: 'Unit Student', email: 'unit@example.test', batch: null, academicYear: null,
  preferences: {sidebarCollapsed: false}, identityPhoto: {status: 'pending_review', photo, mediaAvailable: true},
  photoPolicy: loadProduction('functions/src/services/studentIdentityPhotoPolicy.ts').STUDENT_IDENTITY_PHOTO_POLICY});
export const access = (layer = 'L0') => ({policyVersion: 'student-entitlements-v1', licenseLayer: layer,
  metrics: {basic: true, execution: layer !== 'L0', insights: layer !== 'L0', advanced: layer === 'L2', controlledComparison: false, hardTiming: false}});
export const current = () => ({contractVersion: 2, scope: {kind: 'current', yearId: 'year-a', tier: 'HOT_WARM'}, access: access()});
export const history = () => ({contractVersion: 2, scope: {kind: 'history', yearId: 'year-old', tier: 'COLD_SUMMARY'}, access: access(), page: {items: [], nextCursor: 'position+/%2F', hasMore: true}});
export const solutions = () => ({...current(), testId: 'test-a', runId: 'run-a', releasedAt: '2026-10-17T10:00:00Z', page: {items: [], nextCursor: null, hasMore: false}});
export function studentEnvironment(fetcher) {
  const env = clientEnvironment(fetcher);
  const integration = {getPortalApiClient: portal => {assert.equal(portal, 'student'); return env.api;}};
  const summary = loadProduction('apps/student/src/services/studentSummaryApi.ts', {
    '../../../../shared/services/portalIntegration': integration,
    '../../../../shared/services/studentSummaryResponseAdapters': loadProduction('shared/services/studentSummaryResponseAdapters.ts', {
      './examRecoveryValidation': loadProduction('shared/services/examRecoveryValidation.ts')}),
    './studentSummaryDataPolicy': rawPolicy, './studentResultRecovery': recovery,
  });
  const tests = loadProduction('apps/student/src/features/my-tests/studentMyTestsDataset.ts', {
    '../../services/studentSummaryApi': summary,
    '../../../../../shared/services/portalResponseAdapters': {},
  });
  const {studentProfileApi} = loadProduction('apps/student/src/services/studentProfileApi.ts', {
    '../../../../shared/services/portalIntegration': integration,
    '../../../../shared/services/studentProfileContract': profileContract,
  });
  return {...env, summary, tests, profile: studentProfileApi};
}
