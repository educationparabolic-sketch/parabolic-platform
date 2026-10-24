import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {test,expect} from 'playwright/test';
const out='test-results/bwm047-public';
let release,fixture;
test.use({bypassCSP:false,trace:'off',screenshot:'off',video:'off'});
test.setTimeout(180000);
test.beforeAll(()=>{
 assert.equal(process.env.BWM047_APPROVED_STAGING,'parabolic-dev');
 release=JSON.parse(readFileSync(out+'/preview-candidate.json','utf8'));
 fixture=JSON.parse(readFileSync(out+'/fixture.private.json','utf8'));
 assert.ok(release.deploymentAuthorized&&release.backendCompatibilityVerified&&!release.reviewOnly&&!release.cdnPlaceholder);
 assert.equal(release.project,'parabolic-dev');assert.equal(fixture.project,'parabolic-dev');
 for(const [target,site]of Object.entries({portal:'parabolic-dev',exam:'parabolic-dev-40ec9',vendor:'parabolic-dev-vendor'})){
  const url=new URL(release.origins[target]);assert.equal(url.origin,release.origins[target]);assert.equal(url.protocol,'https:');
  assert.match(url.hostname,new RegExp('^'+site+'--bwm047-security-[0-9]{8}-[a-z0-9-]+\\.web\\.app$'));
 }
 for(const role of ['admin','student','vendor'])assert.ok(fixture[role].uid.startsWith('bwm047-public-'));
});
const revalidate='no-cache, max-age=0, must-revalidate';
function headers(response,camera){const h=response.headers();expect(h['x-frame-options']).toBe('DENY');expect(h['x-content-type-options']).toBe('nosniff');expect(h['referrer-policy']).toBe('no-referrer');expect(h['content-security-policy']).toContain("script-src 'self'");expect(h['content-security-policy']).toContain("frame-ancestors 'none'");expect(h['content-security-policy']).not.toMatch(/https:\*|https:;/u);expect(h['permissions-policy']).toContain(camera?'camera=(self)':'camera=()');}
test('approved security preview serves exact scanned bytes with public cache and header policy',async({request})=>{
 for(const f of release.files){const [target,...parts]=f.path.split('/');const r=await request.get(release.origins[target]+'/'+parts.join('/'));expect(r.status()).toBe(200);expect(createHash('sha256').update(await r.body()).digest('hex')).toBe(f.sha256);
  if(/\/assets\/.*-[A-Za-z0-9_-]{8,}\.(?:js|css|png|webp|svg|woff2?)$/u.test('/'+f.path))expect(r.headers()['cache-control']).toBe('public, max-age=31536000, immutable');
 }
 for(const [target,path,camera]of [['portal','/admin/students',false],['portal','/student/profile',true],['exam','/session/missing',true],['vendor','/vendor/system-health',false]]){
  const r=await request.get(release.origins[target]+path);expect(r.status()).toBe(200);headers(r,camera);expect(r.headers()['cache-control']).toBe(revalidate);
 }
 for(const target of ['portal','exam','vendor']){
  for(const path of ['/assets/missing123.js.map','/assets/missing123.js']){const r=await request.get(release.origins[target]+path);expect(r.headers()['cache-control']).toBe(revalidate);expect(await r.text()).not.toMatch(/"sourcesContent"\s*:|sourceMappingURL\s*=/u);}
  const r=await request.get(release.origins[target]+'/api/v1/student/profile');expect(r.status()).toBe(401);expect(r.headers()['cache-control']).toBe('private, max-age=0, no-store');expect((await r.json()).data).toBeUndefined();
 }
 writeFileSync(out+'/public-artifacts-receipt.json',JSON.stringify({releaseId:release.releaseId,matchedFiles:release.files.length,targets:3,cspBypass:false,providerQualified:false},null,2));
});
test('approved Exam preview rejects URL credentials before authentication under enforced CSP',async({page})=>{
 let authCalls=0;page.on('request',r=>{if(/identitytoolkit|\/entry$/u.test(r.url()))authCalls++;});
 const r=await page.goto(release.origins.exam+'/session/invalid?token=dev&faceGaze=off');headers(r,true);
 await expect(page.getByRole('heading',{name:'Session Access Blocked',exact:true})).toBeVisible();
 expect(new URL(page.url()).search).toBe('');expect(new URL(page.url()).hash).toBe('');expect(authCalls).toBe(0);
});
for(const entry of [{role:'admin',target:'portal',path:'/admin/students',api:'/api/v1/admin/students'},{role:'student',target:'portal',path:'/student/profile',api:'/api/v1/student/profile'},{role:'vendor',target:'vendor',path:'/vendor/system-health',api:'/api/v1/vendor/system-health'}]){
 test(`approved ${entry.role} preview uses native login, rejects wrong role and clears cross-tab identity`,async({context,page})=>{
  const origin=release.origins[entry.target],actor=fixture[entry.role];
  await page.goto(origin+entry.path);await page.getByLabel('Email',{exact:true}).fill(actor.email);await page.getByLabel('Password',{exact:true}).fill(actor.password);
  const pending=page.waitForResponse(r=>new URL(r.url()).pathname===entry.api&&r.status()===200);
  await page.getByRole('button',{name:'Login',exact:true}).click();const positive=await pending;expect(positive.headers()['cache-control']).toBe('private, max-age=0, no-store');
  const authorization=(await positive.request().allHeaders()).authorization;expect(authorization).toBeTruthy();
  const denied=await page.evaluate(async({path,authorization})=>{const r=await fetch(path,{headers:{authorization}});return {status:r.status,body:await r.json()};},{path:entry.role==='admin'?'/api/v1/student/profile':'/api/v1/admin/students',authorization});
  expect(denied.status).toBe(403);expect(denied.body.data).toBeUndefined();
  const second=await context.newPage();const shared=second.waitForResponse(r=>new URL(r.url()).pathname===entry.api&&r.status()===200);await second.goto(origin+entry.path);await shared;
  await second.getByRole('button',{name:'Sign out',exact:true}).first().click();await expect(page).toHaveURL(/\/login$/u);await page.reload();await expect(page.getByLabel('Password',{exact:true})).toBeVisible();
  writeFileSync(out+'/public-'+entry.role+'-receipt.json',JSON.stringify({releaseId:release.releaseId,positive:true,wrongRoleDenied:true,crossTabLogout:true,cspBypass:false,providerQualified:false},null,2));
 });
}

async function recoveryRecord(page, id) {
  return page.evaluate(async sessionId => {
    const db = await new Promise((resolve, reject) => {const r = indexedDB.open("parabolic-exam-runtime", 1);
      r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);});
    try {return await new Promise((resolve, reject) => {const r = db.transaction("sessionRecovery", "readonly").objectStore("sessionRecovery").get(sessionId);
      r.onsuccess = () => resolve(r.result ?? null); r.onerror = () => reject(r.error);});}
    finally {db.close();}
  }, id);
}

test("approved security preview completes native Student to Exam recovery and one canonical result through real HTTPS", async ({page, context}) => {
  const portal = release.origins.portal, exam = release.origins.exam;
  let observed;
  await context.exposeBinding("__observeResilienceLaunch", (_source, value) => {observed = value;});
  await context.addInitScript(() => {
    const native = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await native(...args);
      if (new URL(response.url).pathname === "/api/v1/exam/start" && response.ok) {
        const {data} = await response.clone().json(); const url = new URL(data.examUrl);
        await window.__observeResilienceLaunch({sessionId: data.sessionId, origin: url.origin,
          fragmentOnly: url.hash === `#launch=${encodeURIComponent(data.launchCredential)}`, search: url.search});
      }
      return response;
    };
  });
  await page.goto(`${portal}/student/my-tests`);
  await page.getByLabel("Email", {exact: true}).fill(fixture.student.email);
  await page.getByLabel("Password", {exact: true}).fill(fixture.student.password);
  const tests = page.waitForResponse(r => r.url().startsWith(`${portal}/api/v1/student/tests`));
  await page.getByRole("button", {name: "Login", exact: true}).click();
  expect((await tests).status()).toBe(200);
  const entered = page.waitForResponse(r => r.url().endsWith("/entry") && r.request().postDataJSON()?.operation === "launch");
  await page.getByRole("article").filter({has: page.getByRole("heading", {
    name: "BWM047 isolated security qualification", exact: true})}).getByRole("button", {name: /Start Test|Resume/u}).click();
  expect((await entered).status()).toBe(200);
  await expect.poll(() => Boolean(observed)).toBe(true);
  expect(observed.origin).toBe(exam); expect(observed.search).toBe(""); expect(observed.fragmentOnly).toBe(true);
  const document = await page.request.get(`${exam}/session/${observed.sessionId}`);
  expect(document.status()).toBe(200); headers(document, true);
  await page.getByRole("button", {name: "Check Internet"}).click();
  await page.getByRole("button", {name: "Continue to Instructions"}).click();
  const activated = page.waitForResponse(r => r.url().endsWith("/activate") && r.status() === 200);
  await page.getByLabel(/I have read and understood the instructions/u).click({noWaitAfter: true});
  const authority = (await (await activated).json()).data;
  await expect(page.getByText("BWM047 public security question", {exact: true})).toBeVisible();
  const saved = page.waitForResponse(r => r.url().endsWith("/answers") && r.status() === 200);
  await page.getByRole("radio").nth(1).check(); await saved;
  await expect.poll(async () => (await recoveryRecord(page, observed.sessionId))?.pendingAnswerMap).toEqual({});
  await context.setOffline(true);
  try {
    await page.getByRole("radio").nth(0).check();
    await expect.poll(async () => Object.values((await recoveryRecord(page, observed.sessionId))?.pendingAnswerMap ?? {})
      .map(v => v.response.optionId)).toEqual(["A"]);
    await expect(page.getByRole("region", {name: "Answer recovery status"})).toContainText("Saved on this device");
  } finally {await context.setOffline(false);}
  const recover = page.waitForResponse(r => r.url().endsWith("/entry") && r.request().postDataJSON()?.operation === "recover");
  await page.reload();
  const recovered = await recover; expect(recovered.status()).toBe(200);
  const recoveredAuthority = (await recovered.json()).data.entry;
  expect(recoveredAuthority.startedAt).toBe(authority.startedAt);
  expect(recoveredAuthority.deadlineAt).toBe(authority.deadlineAt);
  await expect(page.getByRole("radio").nth(0)).toBeChecked();
  await expect.poll(async () => (await recoveryRecord(page, observed.sessionId))?.pendingAnswerMap).toEqual({});
  await page.getByRole("button", {name: "Submit Test", exact: true}).click();
  await page.getByRole("dialog", {name: "Confirm exam submission"}).getByLabel(/I understand.*will remain unanswered/u).check();
  const submitted = page.waitForResponse(r => r.url().endsWith("/submit") && r.status() === 200);
  await page.getByRole("button", {name: "Confirm Final Submit", exact: true}).click();
  const receipt = (await (await submitted).json()).data;
  await expect(page.getByRole("heading", {name: "Exam Submitted", exact: true})).toBeVisible();
  const replay = page.waitForResponse(r => r.url().endsWith("/entry") && r.request().postDataJSON()?.operation === "reconcile");
  await page.reload();
  const terminal = (await (await replay).json()).data;
  expect(terminal.status).toBe("submitted");
  expect(terminal.submission).toEqual({...receipt, alreadySubmitted: true});
  await expect(page.getByRole("heading", {name: "Exam Submitted", exact: true})).toBeVisible();
  expect(new URL(page.url()).search).toBe(""); expect(new URL(page.url()).hash).toBe("");
  await expect.poll(async () => (await recoveryRecord(page, observed.sessionId))?.closed).toBe(true);
  const closedGeneration = (await recoveryRecord(page, observed.sessionId)).runtimeGeneration;
  const returned = page.waitForResponse(r => r.url().startsWith(`${portal}/api/v1/student/tests`) && r.status() === 200);
  await page.getByRole("button", {name: "Return to Student Portal", exact: true}).click();
  expect((await (await returned).json()).data.contractVersion).toBe(2);
  const dashboard = page.waitForResponse(r => r.url() === `${portal}/api/v1/student/dashboard` && r.status() === 200);
  await page.goto(`${portal}/student/dashboard`);
  const readiness = (await (await dashboard).json()).data.resultReadiness;
  expect(["unknown", "processing", "available"]).toContain(readiness.state);
  writeFileSync(`${out}/public-exam-receipt.json`, JSON.stringify({project: "parabolic-dev",
    releaseId: release.releaseId, sessionId: observed.sessionId, canonicalReceipt: receipt,
    canonicalReload: true, offlineDraftRecovered: true, independentStudentReturn: true,
    authoritativeTimes: {startedAt: authority.startedAt, deadlineAt: authority.deadlineAt},
    closedGeneration,
    resultReadiness: readiness, cspBypass: false}, null, 2));
});
