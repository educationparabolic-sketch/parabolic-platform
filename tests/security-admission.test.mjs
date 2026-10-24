import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
const require = createRequire(import.meta.url);
const {IngressAdmission, securityOperation, retrySeconds, consumeSecurityRate, SECURITY_LIMITS} = require('../functions/lib/services/securityRateLimits');
const {admissionConfiguration, verifyApplicationToken, appCheckUnavailable, singleHeader} = require('../functions/lib/services/applicationAdmission');
const {guardHttpExport} = require('../functions/lib/api/httpExportGuard');
const {createMockRequest, createMockResponse} = require('../functions/lib/tests/helpers/http');
const {API_ROUTE_MANIFEST} = require('../functions/lib/apiRouteManifest');
const ts = require('../functions/node_modules/typescript');
const loaded = {exports: {}};
new Function('exports', ts.transpileModule(readFileSync('shared/services/securityApiRoutes.ts','utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText)(loaded.exports);
const {protectedApplicationRoute} = loaded.exports;
const local = {PROJECT_ID:'demo-parabolic-test', NODE_ENV:'test', FUNCTIONS_EMULATOR:'true', FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099', FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080', APP_CHECK_MODE:'enforced', APP_CHECK_ALLOWED_APP_IDS:'1:123:web:approved', SECURITY_TEST_APP_CHECK_KEY:'unit-private-key'};
const signed = fields => {const body=Buffer.from(JSON.stringify({appId:local.APP_CHECK_ALLOWED_APP_IDS,aud:['projects/demo-parabolic-test'],exp:Math.floor(Date.now()/1000)+600,...fields})).toString('base64url');return body+'.'+createHmac('sha256',local.SECURITY_TEST_APP_CHECK_KEY).update(body).digest('base64url');};
const code = expected => error => error.code === expected;
test('explicit process modes and local-only injection cannot become production bypasses', () => {
  assert.equal(admissionConfiguration(local).mode,'enforced');
  for (const update of [{APP_CHECK_MODE:''},{NODE_ENV:'production'},{PROJECT_ID:'live-project'},{FUNCTIONS_EMULATOR:'false'},{FIREBASE_AUTH_EMULATOR_HOST:'evil:9099'},{APP_CHECK_ALLOWED_APP_IDS:'wrong'}]) assert.throws(()=>admissionConfiguration({...local,...update}),code('INTERNAL_ERROR'));
  assert.equal(admissionConfiguration({...local, NODE_ENV:'staging', SECURITY_TEST_APP_CHECK_KEY:undefined, APP_CHECK_MODE:'pending_provisioning'}).mode,'pending_provisioning');
  assert.throws(()=>admissionConfiguration({...local,NODE_ENV:'production',SECURITY_TEST_APP_CHECK_KEY:undefined,APP_CHECK_MODE:'pending_provisioning'}),code('INTERNAL_ERROR'));
});
test('reusable approved tokens succeed; invalid, expired, wrong-project/app deny without 401; provider outage is 500',async()=>{
  const verify = value=>verifyApplicationToken(value,'demo-parabolic-test',[local.APP_CHECK_ALLOWED_APP_IDS],local.SECURITY_TEST_APP_CHECK_KEY);
  const valid=signed({});await verify(valid);await verify(valid);
  for(const value of ['',valid+'x',signed({exp:0}),signed({aud:['projects/wrong']}),signed({appId:'1:123:web:other'})]) await assert.rejects(verify(value),code('FORBIDDEN'));
  await assert.rejects(verify(signed({providerFailure:true})),code('INTERNAL_ERROR'));
  assert.equal(appCheckUnavailable({code:'app-check/invalid-argument',message:'bad signature'}),false);
  assert.equal(appCheckUnavailable({code:'app-check/app-check-token-expired'}),false);
  assert.equal(appCheckUnavailable({code:'app-check/invalid-argument',message:'error in secret or public key callback: Error fetching Json Web Keys'}),true);
});
test('exact protected route inventory matches every implemented canonical method and never external or unknown paths',()=>{
  assert.deepEqual(loaded.exports.SECURITY_API_ROUTES, API_ROUTE_MANIFEST.filter(r => r.status === "implemented" && r.functionExport).map(r => [r.method, r.canonicalPath]));
  for(const route of API_ROUTE_MANIFEST) {
    const url=new URL(route.canonicalPath.replace(/\{[^}]+\}/gu,'resource'),'https://portal.test');
    assert.equal(protectedApplicationRoute(route.method,url,'https://portal.test'),route.status==='implemented'&&!!route.functionExport,route.id);
    assert.equal(protectedApplicationRoute(route.method,url,'https://foreign.test'),false);
  }
  for(const path of ['/api/v1/unknown','/api/v1/student/profile/extra','/api/v1/internal/email/queue']) assert.equal(protectedApplicationRoute('POST',new URL(path,'https://portal.test'),'https://portal.test'),false);
  assert.equal(singleHeader({headers:{'x-firebase-appcheck':'valid'},rawHeaders:['X-Firebase-AppCheck','one','x-firebase-appcheck','two']},'x-firebase-appcheck'),undefined);
});
test('all operation classes preserve the frozen budgets independent of resource IDs',()=>{
  assert.deepEqual(SECURITY_LIMITS, {all:1200,read:600,mutation:60,expensive:10,examStart:20,examOwnership:120,examAnswers:600,examCommit:30,examIntegrity:120});
  for(const [name,method,expected] of [['examStart','POST','examStart'],['examSessionEntry','POST','examOwnership'],['examSessionAnswers','POST','examAnswers'],['examSessionActivate','POST','examCommit'],['examSessionSubmit','POST','examCommit'],['examSessionIntegrityEvents','POST','examIntegrity'],['vendorSimulationLoad','POST','expensive'],['adminGovernanceTransport','POST','expensive'],['adminQuestionPackages','POST','expensive'],['adminAcademicYearArchive','POST','expensive'],['adminStudents','GET','read'],['adminStudentMutations','PATCH','mutation']]) assert.equal(securityOperation(name,method),expected);
});
test('local ingress caps source, health and map capacity without active eviction; expires and rejects missing/rollback peer',()=>{
  const ingress=new IngressAdmission();const time=120000;
  for(let i=0;i<1200;i++) ingress.consume('demo','127.0.0.1',false,time);
  assert.throws(()=>ingress.consume('demo','127.0.0.1',false,time),code('RATE_LIMITED'));
  ingress.consume('demo','127.0.0.1',false,time+60000);
  assert.throws(()=>ingress.consume('demo','127.0.0.1',false,time),code('INTERNAL_ERROR'));
  assert.throws(()=>ingress.consume('demo',undefined,false,time),code('INTERNAL_ERROR'));
  for(let i=0;i<60;i++) ingress.consume('demo','127.0.0.2',true,time+60000);
  assert.throws(()=>ingress.consume('demo','127.0.0.2',true,time+60000),code('RATE_LIMITED'));
  const full=new IngressAdmission();for(let i=0;i<4096;i++)full.consume('demo',`10.0.${Math.floor(i/256)}.${i%256}`,false,time);
  assert.throws(()=>full.consume('demo','192.0.2.1',false,time),code('RATE_LIMITED'));
  full.consume('demo','192.0.2.1',false,time+60000);
  assert.equal(retrySeconds(time),60);assert.equal(retrySeconds(time+59999),1);
});
test('counter infrastructure fails closed and boundary rejection never invokes domain callback or writes business output',async()=>{
  await assert.rejects(consumeSecurityRate('demo','uid','tenant','read',{doc:()=>({}),runTransaction:async()=>{throw Error('private provider body');}}),code('INTERNAL_ERROR'));
  for(const [failure,status] of [['RATE_LIMITED',429],['FORBIDDEN',403],['INTERNAL_ERROR',500]]){
    const {AdmissionError}=require('../functions/lib/services/securityRateLimits');let domain=0;
    const req=createMockRequest({path:'/api/v1/admin/students',method:'GET'}),res=createMockResponse();
    await guardHttpExport('adminStudents',()=>{domain++;},{ingress:()=>{},admit:async()=>{throw new AdmissionError(failure,failure==='RATE_LIMITED'?10:undefined);}})(req,res);
    assert.equal(domain,0);assert.equal(res.statusCode,status);assert.equal(res.body.error.code,failure);assert.equal(res.body.data,undefined);
    if(status===429)assert.equal(res.headers['retry-after'],'10');
  }
});

test('browser provider is reusable, exact same-origin only and failures remain server errors without debug injection',async()=>{
  let initialized=0,acquired=0;const browser={location:{origin:'https://portal.test'}};
  function load(env, fail=false){const module={exports:{}};
    const source=readFileSync('shared/services/applicationAttestation.ts','utf8').replaceAll('import.meta.env','environment');
    const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    new Function('exports','require','window','environment',code)(module.exports,name=>{
      if(name==='./securityApiRoutes')return {protectedApplicationRoute};
      if(name==='../types/apiClient')return {ApiClientError: class extends Error {constructor(message,status,code){super(message);this.status=status;this.code=code;}}};
      if(name==='./firebaseClient')return {ensureFirebaseClient:()=>({app:{}})};
      if(name==='firebase/app-check')return {initializeAppCheck:(_app,options)=>{initialized++;assert.equal(options.isTokenAutoRefreshEnabled,true);return {};},ReCaptchaEnterpriseProvider:class {},getToken:async(_app,force)=>{acquired++;assert.equal(force,false);if(fail)throw Error('private token');return {token:'reusable'};}};
      throw Error(name);
    },browser,env);return module.exports.applicationAttestation;
  }
  const acquire=load({VITE_APP_CHECK_MODE:'enforced',VITE_APP_CHECK_PROVIDER_KEY:'public-key'});
  assert.equal(await acquire('GET','https://evil.test/api/v1/student/profile'),null);
  assert.equal(await acquire('POST','/api/v1/student/profile'),null);assert.equal(initialized,0);
  assert.equal(await acquire('GET','/api/v1/student/profile'),'reusable');assert.equal(await acquire('GET','/api/v1/student/profile'),'reusable');assert.equal(initialized,1);assert.equal(acquired,2);
  assert.equal(await load({VITE_APP_CHECK_MODE:'pending_provisioning'})('GET','/api/v1/student/profile'),null);
  await assert.rejects(load({})('GET','/api/v1/student/profile'),e=>e.status===500);
  await assert.rejects(load({VITE_APP_CHECK_MODE:'enforced',VITE_APP_CHECK_PROVIDER_KEY:'public-key'},true)('GET','/api/v1/student/profile'),e=>e.status===500&&!e.message.includes('private token'));
});

test('ingress uses transport peer, never forwarded identity; only isolated Unix emulator traffic has one shared fallback bucket',()=>{
  const {trustedIngressPeer}=require('../functions/lib/services/applicationAdmission');
  assert.equal(trustedIngressPeer({socket:{remoteAddress:'192.0.2.1'},headers:{'x-forwarded-for':'evil'}},{}),'192.0.2.1');
  assert.equal(trustedIngressPeer({headers:{'x-forwarded-for':'192.0.2.1'}},{}),undefined);
  assert.equal(trustedIngressPeer({headers:{'x-forwarded-for':'evil'}},{...local,PORT:'/tmp/emulator.sock'}),'127.0.0.1');
  assert.equal(trustedIngressPeer({headers:{}},{...local,PORT:'/tmp/emulator.sock',NODE_ENV:'production'}),undefined);
});

test('all protected outer exports, including direct legacy simulation, delegate admission before any business callback',async()=>{
  const {BACKEND_HTTP_EXPORT_MANIFEST}=require('../functions/lib/apiRouteManifest');
  for(const entry of BACKEND_HTTP_EXPORT_MANIFEST){
    if(['healthcheck','webhook'].includes(entry.disposition)||['adminQuestionAssets','adminQuestionsBulk','vendorLicenseUpdate'].includes(entry.functionExport))continue;
    const route=entry.disposition==='gateway'?API_ROUTE_MANIFEST.find(r=>r.functionExport==='adminStudents'):API_ROUTE_MANIFEST.find(r=>r.functionExport===entry.functionExport);
    const request=createMockRequest({path:route?.canonicalPath.replace(/\{[^}]+\}/gu,'resource')??'/',method:route?.method??'POST'}),response=createMockResponse();let domain=0,admissions=0;
    const {AdmissionError}=require('../functions/lib/services/securityRateLimits');
    await guardHttpExport(entry.functionExport,()=>{domain++;},{ingress:()=>{},admit:async()=>{admissions++;throw new AdmissionError('FORBIDDEN');}})(request,response);
    assert.equal(admissions,1,entry.functionExport);assert.equal(domain,0,entry.functionExport);assert.equal(response.statusCode,403,entry.functionExport);
  }
});
