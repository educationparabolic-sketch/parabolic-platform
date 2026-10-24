'use strict';
const assert=require('node:assert/strict');const test=require('node:test');const {randomUUID,createHmac}=require('node:crypto');
const {getFirebaseAdminApp,getFirestore}=require('../../functions/lib/utils/firebaseAdmin');
const {consumeSecurityRate,rateDigest,SECURITY_LIMITS}=require('../../functions/lib/services/securityRateLimits');
const {admitApplicationRequest}=require('../../functions/lib/services/applicationAdmission');
const {Timestamp}=require('../../functions/node_modules/firebase-admin').firestore;
const fixture=require('../../functions/tests/helpers/crossPortalSecurity');
assert.equal(process.env.GCLOUD_PROJECT,'demo-parabolic-test');assert.ok(process.env.FIREBASE_EMULATOR_HUB);assert.equal(process.env.APP_CHECK_MODE,'enforced');
const auth=getFirebaseAdminApp().auth(),db=getFirestore(),project=fixture.projectId,prefix='admission_'+randomUUID().replaceAll('-','').slice(0,8);
const tenants=[prefix+'_a',prefix+'_b'];const actors=[];
const token=fields=>{const body=Buffer.from(JSON.stringify({appId:process.env.APP_CHECK_ALLOWED_APP_IDS,aud:[`projects/${project}`],exp:Math.floor(Date.now()/1000)+600,...fields})).toString('base64url');return body+'.'+createHmac('sha256',process.env.SECURITY_TEST_APP_CHECK_KEY).update(body).digest('base64url');};
const ref=(uid,tenant,bucket)=>db.doc(`institutes/${tenant}/securityRateLimits/${rateDigest(project,uid,'institute:'+tenant,bucket)}`);
async function seed(uid,tenant,bucket,used,now=Date.now()) {const windowStartMs=Math.floor(now/60000)*60000;await ref(uid,tenant,bucket).set({version:1,windowStartMs,used,expiresAt:Timestamp.fromMillis(windowStartMs+86460000)});}
async function call(path,actor,app=token({}),method='GET',body) {
 const response=await fetch('http://127.0.0.1:5001/demo-parabolic-test/us-central1/'+path,{method,headers:{authorization:'Bearer '+actor.token,'content-type':'application/json',...(app?{'X-Firebase-AppCheck':app}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(60000)});
 const value=await response.json();assert.equal(response.headers.get('cache-control'),'private, max-age=0, no-store');return {status:response.status,headers:response.headers,body:value};
}
test.before(async()=>{for(const tenant of tenants)await fixture.seedInstitute(db,tenant);for(let i=0;i<2;i++)actors.push(await fixture.account(auth,db,prefix+'_user'+i,'admin',tenants[i]));});
test.after(async()=>fixture.cleanup(auth,db,actors.map(a=>a.uid),tenants));
test('real Auth + attestation positive controls and all denial classes on gateway/direct; denied mutations have zero business effects',async()=>{
 const actor=actors[0];
 for(const path of ['apiV1/api/v1/admin/students','adminStudents/api/v1/admin/students']){
  assert.equal((await call(path,actor)).status,200);
  for(const app of ['',token({exp:0}),token({appId:'1:123:web:other'}),token({aud:['projects/wrong']}),'invalid']){const result=await call(path,actor,app);assert.equal(result.status,403);assert.equal(result.body.error.code,'FORBIDDEN');assert.equal(result.body.error.details.reason,'app_check_denied');}
  assert.equal((await call(path,actor,token({providerFailure:true}))).status,500);
 }
 const target=db.doc(`institutes/${tenants[0]}/students/shared_resource`);const before=(await target.get()).data();
 const result=await call('apiV1/api/v1/admin/students/shared_resource/profile',actor,'','PATCH',{expectedVersion:1,idempotencyKey:randomUUID(),profile:{fullName:'must not save'}});
 assert.equal(result.status,403);assert.deepEqual((await target.get()).data(),before);
 const counter=(await ref(actor.uid,tenants[0],'all').get()).data();assert.equal(counter.used,2);
});
test('concurrent gateway/direct share the last read permit, canonical 429 and single charging; another actor remains isolated',async()=>{
 const actor=actors[0];await seed(actor.uid,tenants[0],'read',599);await seed(actor.uid,tenants[0],'all',599);
 const results=await Promise.all(['apiV1/api/v1/admin/students','adminStudents/api/v1/admin/students'].map(path=>call(path,actor)));
 assert.deepEqual(results.map(r=>r.status).sort(),[200,429]);const denied=results.find(r=>r.status===429);
 assert.equal(denied.body.error.code,'RATE_LIMITED');assert.match(denied.headers.get('retry-after'),/^(?:[1-9]|[1-5][0-9]|60)$/);
 assert.equal((await ref(actor.uid,tenants[0],'all').get()).data().used,600);
 assert.equal((await call('apiV1/api/v1/admin/students',actors[1])).status,200);
});
test('every class atomic boundary, aggregate across classes, fixed window/TTL and malformed counter fail-closed',async()=>{
 const now=Date.UTC(2030,0,1),uid=prefix+'_synthetic',tenant=tenants[0];
 for(const [bucket,limit]of Object.entries(SECURITY_LIMITS).filter(([b])=>b!=='all')){
  await seed(uid,tenant,bucket,limit-1,now);await seed(uid,tenant,'all',0,now);
  const outcomes=await Promise.allSettled([consumeSecurityRate(project,uid,tenant,bucket,db,now),consumeSecurityRate(project,uid,tenant,bucket,db,now)]);
  assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1,bucket);assert.equal(outcomes.find(r=>r.status==='rejected').reason.code,'RATE_LIMITED');
  assert.equal((await ref(uid,tenant,'all').get()).data().used,1,bucket);
 }
 await seed(uid,tenant,'all',1199,now);await seed(uid,tenant,'read',0,now);await seed(uid,tenant,'mutation',0,now);
 const aggregate=await Promise.allSettled(['read','mutation'].map(b=>consumeSecurityRate(project,uid,tenant,b,db,now)));
 assert.equal(aggregate.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(aggregate.find(r=>r.status==='rejected').reason.code,'RATE_LIMITED');
 await consumeSecurityRate(project,uid,tenant,'read',db,now+60000);assert.equal((await ref(uid,tenant,'all').get()).data().used,1);
 await ref(uid,tenant,'all').update({expiresAt:Timestamp.fromMillis(now+60000)}); // TTL cannot reset the still-live next window.
 await assert.rejects(consumeSecurityRate(project,uid,tenant,'read',db,now+60001),e=>e.code==='INTERNAL_ERROR');
 await seed(actors[1].uid,tenants[1],'all',0);await ref(actors[1].uid,tenants[1],'all').update({used:'malformed'});
 const unavailable=await call('apiV1/api/v1/admin/students',actors[1]);assert.equal(unavailable.status,500);assert.equal(unavailable.body.error.code,'INTERNAL_ERROR');
 const data=(await ref(uid,tenant,'read').get()).data();assert.deepEqual(Object.keys(data).sort(),['expiresAt','used','version','windowStartMs']);
});
test('same request object admitted once across delegated wrappers and forged bypass flags never select a mode',async()=>{
 const actor=actors[0];await seed(actor.uid,tenants[0],'read',0);await seed(actor.uid,tenants[0],'all',0);
 const request={method:'GET',headers:{authorization:'Bearer '+actor.token,'x-firebase-appcheck':token({})},rawHeaders:[]};
 await Promise.all([admitApplicationRequest('adminStudents',request),admitApplicationRequest('adminStudents',request)]);
 assert.equal((await ref(actor.uid,tenants[0],'all').get()).data().used,1);
 await assert.rejects(admitApplicationRequest('adminStudents',{method:'GET',headers:{authorization:'Bearer '+actor.token,'x-emulator-mode':'true','x-service':'true'},rawHeaders:[]}),e=>e.code==='FORBIDDEN');
});

test('only currently verified backend-service email queue has the service exception; global counters stay metadata-only and scope isolated',async()=>{
 const service=await fixture.account(auth,db,prefix+'_service','service',tenants[0]);actors.push(service);
 const serviceRequest={method:'POST',headers:{authorization:'Bearer '+service.token},rawHeaders:[]};
 await admitApplicationRequest('internalEmailQueue',serviceRequest);
 await assert.rejects(admitApplicationRequest('adminStudents',{...serviceRequest,headers:{...serviceRequest.headers}}),e=>e.code==='FORBIDDEN');
 await assert.rejects(admitApplicationRequest('internalEmailQueue',{method:'POST',headers:{authorization:'Bearer '+actors[0].token,'x-firebase-appcheck':token({})},rawHeaders:[]}),e=>e.code==='FORBIDDEN');
 const result=await call('internalEmailQueue/',service,'','POST',{});assert.equal(result.status,400);
 const body={templateType:'test_completed',recipientEmail:'synthetic@security.emulator.invalid',payload:{instituteId:tenants[0]}};
 const queued=await call('internalEmailQueue/',service,'','POST',body);assert.equal(queued.status,200,JSON.stringify(queued.body));
 assert.equal(queued.body.data.status,'pending');assert.equal(queued.body.data.jobPath,`emailQueue/${queued.body.data.jobId}`);
 const job=db.doc(queued.body.data.jobPath);
 try {
  const stored=(await job.get()).data();assert.equal(stored.status,'pending');assert.equal(stored.instituteId,tenants[0]);assert.equal(stored.recipientEmail,body.recipientEmail);
  const foreignBefore=(await db.collection('emailQueue').where('instituteId','==',tenants[1]).get()).size;
  const foreign=await call('internalEmailQueue/',service,'','POST',{...body,payload:{instituteId:tenants[1]}});
  assert.equal(foreign.status,403);assert.equal((await db.collection('emailQueue').where('instituteId','==',tenants[1]).get()).size,foreignBefore);
  assert.deepEqual((await job.get()).data(),stored);
 } finally {await job.delete();assert.equal((await job.get()).exists,false);} // No worker/delivery is invoked; only disposable local pending state.

 const uid=prefix+'_global',refs=['all','read'].map(b=>db.doc(`securityGlobalRateLimits/${rateDigest(project,uid,'global-vendor',b)}`));
 try{await consumeSecurityRate(project,uid,null,'read',db);for(const r of refs){const data=(await r.get()).data();assert.equal(data.used,1);assert.deepEqual(Object.keys(data).sort(),['expiresAt','used','version','windowStartMs']);}
  await consumeSecurityRate(project,uid,tenants[0],'read',db);await consumeSecurityRate(project,uid,tenants[1],'read',db);
  assert.equal((await ref(uid,tenants[0],'read').get()).data().used,1);assert.equal((await ref(uid,tenants[1],'read').get()).data().used,1);
 }finally{await Promise.all(refs.map(r=>r.delete()));}
});
