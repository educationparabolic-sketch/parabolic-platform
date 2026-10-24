// Frozen acceptance ownership. Local evidence never substitutes for retained public/provider gates.
export const SECURITY_MATRIX = Object.freeze([
  {id: 'SEC-A01', findings: ['F-047-04','F-047-05'], phases: ['contracts','authorization','browser'], deferred: []},
  {id: 'SEC-A02', findings: ['F-047-08'], phases: ['contracts','browser'], deferred: []},
  {id: 'SEC-A03', findings: ['F-047-03'], phases: ['contracts','disclosure'], deferred: ['cloud log transport']},
  {id: 'SEC-A04', findings: ['F-047-01'], phases: ['contracts','browser'], deferred: ['public CSP/CDN/hardware']},
  {id: 'SEC-A05', findings: ['F-047-02'], phases: ['contracts','browser'], deferred: ['public target headers']},
  {id: 'SEC-A06', findings: ['F-047-07'], phases: ['contracts','browser','release'], deferred: ['public served bytes']},
  {id: 'SEC-A07', findings: ['F-047-06'], phases: ['contracts','admission'], deferred: ['proxy/load/edge/TTL']},
  {id: 'SEC-A08', findings: ['F-047-06'], phases: ['contracts','admission'], deferred: ['genuine provider/CSP BWM-052/054/056']},
  {id: 'SEC-A09', findings: ['F-047-01','F-047-02','F-047-03','F-047-04','F-047-05','F-047-06','F-047-07','F-047-08'], phases: ['contracts','authorization','disclosure','admission','browser','release'], deferred: ['substep 8 aggregate and approved L5; L6 only BWM-057']},
]);
export const SECURITY_UNIT_FILES = Object.freeze([
  'tests/security-matrix.test.mjs', 'tests/backend-ci-trigger-coverage.test.mjs', 'tests/backend-ci-validation.test.mjs', 'tests/staging-deployment-pipeline.test.mjs', 'tests/current-account-identity.test.mjs', 'tests/auth-provider-persistence.test.mjs',
  'tests/api-auth-scope.test.mjs', 'tests/browser-authority-convergence.test.mjs', 'tests/browser-token-storage.test.mjs',
  'tests/per-origin-firebase-auth.test.mjs', 'tests/production-auth-hardening.test.mjs', 'tests/backend-disclosure.test.mjs',
  'tests/hosting-security-policy.test.mjs', 'tests/release-artifact-scan.test.mjs', 'tests/security-admission.test.mjs',
  'tests/api-envelope-contract.test.mjs', 'tests/build-environment-validation.test.mjs', 'tests/environment-matrix.test.mjs',
  'tests/exam-transport-ownership.test.mjs', 'tests/exam-proctoring-runtime.test.mjs', 'tests/exam-resilience-contract.test.mjs',
  'tests/capability-policy.test.mjs', 'functions/tests/apiRouteManifest.test.js', 'functions/tests/apiGateway.test.js',
]);
export const SECURITY_PHASES = Object.freeze([
  {id:'build', command:'npm', args:['--prefix','functions','run','build']},
  {id:'contracts', command:process.execPath, args:['--test','--test-concurrency=1',...SECURITY_UNIT_FILES]},
  {id:'authorization', command:process.execPath, args:['scripts/run-cross-portal-authorization.mjs','--phase','guards','--skip-functions-build']},
  {id:'disclosure', command:process.execPath, args:['scripts/run-backend-disclosure.mjs','--skip-build']},
  {id:'admission', command:process.execPath, args:['scripts/run-security-admission.mjs','--skip-build']},
  {id:'browser', command:process.execPath, args:['scripts/run-cross-portal-authorization.mjs','--phase','headers','--skip-functions-build','--security-matrix']},
  {id:'release', command:process.execPath, args:['scripts/verify-production-auth-artifacts.mjs']},
]);
