import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile, mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SECURITY_MATRIX,SECURITY_PHASES,SECURITY_UNIT_FILES} from '../scripts/security-matrix-contract.mjs';
import {artifactHashes,withRestoredArtifacts} from '../scripts/run-security-matrix.mjs';
test('all frozen acceptance rows, findings, live test owners and deferred public gates are accounted without a phase omission',async()=>{
  assert.deepEqual(SECURITY_MATRIX.map(row=>row.id),Array.from({length:9},(_,i)=>`SEC-A0${i+1}`));
  assert.equal(new Set(SECURITY_MATRIX.flatMap(row=>row.findings)).size,8);
  assert.deepEqual(SECURITY_PHASES.map(row=>row.id),['build','contracts','authorization','disclosure','admission','browser','release']);
  const contract=await readFile('docs/CROSS_PORTAL_SECURITY_CONTRACT.md','utf8');
  for(const row of SECURITY_MATRIX){assert.ok(contract.includes(row.id));for(const phase of row.phases)assert.ok(SECURITY_PHASES.some(p=>p.id===phase));}
  for(const path of SECURITY_UNIT_FILES)assert.ok((await readFile(path,'utf8')).length>0,path);
  const workflow=await readFile('.github/workflows/frontend-ci-cd.yml','utf8');
  assert.match(workflow,/npm run test:security-matrix/u);assert.match(workflow,/needs: \[frontend-ci, backend-ci\]/u);
  for(const path of ['tests/security/**','tests/e2e/**','tests/*security*.test.mjs','scripts/run-*.mjs','scripts/security-matrix-contract.mjs','docs/CROSS_PORTAL_SECURITY_CONTRACT.md'])assert.equal(workflow.split(`- "${path}"`).length-1,2,path);
  const runner=await readFile('scripts/run-security-matrix.mjs','utf8');assert.doesNotMatch(runner,/firebase deploy|continue-on-error|bypassCSP: true/u);
});
for(const fail of [false,true])test(`generated artifacts restore exactly after ${fail?'failure':'success'}, including originally absent roots`,async()=>{
  const root=await mkdtemp(join(tmpdir(),'security-matrix-test-'));
  try {
    await mkdir(join(root,'apps/admin/dist'),{recursive:true});await writeFile(join(root,'apps/admin/dist/original.js'),'original');
    const before=await artifactHashes(root);
    const operation=()=>withRestoredArtifacts(root,async()=>{
      await writeFile(join(root,'apps/admin/dist/original.js'),'changed');await mkdir(join(root,'apps/exam/dist'),{recursive:true});await writeFile(join(root,'apps/exam/dist/new.js'),'new');
      if(fail)throw Error('simulated phase failure');
    });
    if(fail)await assert.rejects(operation,/simulated phase failure/u);else await operation();
    assert.deepEqual(await artifactHashes(root),before);
  } finally {await rm(root,{recursive:true,force:true});}
});

test('AST accounts for every guarded export and verifier binding through revoked-token/current-account delegates',async()=>{
  const {securitySourceInventory}=await import('../scripts/security-source-inventory.mjs');
  const inventory=securitySourceInventory();assert.equal(inventory.routes.length,121);assert.equal(inventory.exports.length,64);
  if(process.env.SECURITY_EVIDENCE_DIRECTORY){const {writeFile}=await import('node:fs/promises');await writeFile(join(process.env.SECURITY_EVIDENCE_DIRECTORY,'source-inventory.json'),JSON.stringify(inventory,null,2)+'\n');}
});

test('verifier AST rejects unchecked calls, copied methods, computed-property references and destructured aliases',async()=>{
  const {assertVerifierReferences}=await import('../scripts/security-source-inventory.mjs');
  for(const source of ['auth.verifyIdToken(token);','auth["verifyIdToken"](renamed, false);','const renamed=auth.verifyIdToken;','const {verifyIdToken: renamed}=auth;'])assert.throws(()=>assertVerifierReferences(source));
  assertVerifierReferences('auth.verifyIdToken(renamedToken, true); auth["verifyIdToken"](differentToken, true);');
});

test('every selected test and critical runner configuration triggers both CI events; old emulator aggregate has explicit provisional mode',async()=>{
  const source=await readFile('.github/workflows/frontend-ci-cd.yml','utf8');
  for(const event of ['pull_request','push']){
    const block=source.split(`  ${event}:`)[1].split(/^ {2}\S/m)[0];
    const paths=[...block.matchAll(/^ {6}- "([^"]+)"$/gm)].map(match=>match[1]);
    const matches=(path,glob)=>new RegExp('^'+glob.replaceAll('**','ZZDOUBLEZZ').replace(/[.+?^${}()|[\]\\]/g,'\\$&').replaceAll('*','[^/]*').replaceAll('ZZDOUBLEZZ','.*')+'$').test(path);
    for(const path of [...SECURITY_UNIT_FILES,'playwright.config.mjs','package-lock.json','.firebaserc','scripts/security-source-inventory.mjs'])assert.ok(paths.some(pattern=>matches(path,pattern)),`${event}: ${path}`);
  }
  const backend=source.split('  backend-ci:')[1].split('  staging-deploy:')[0];
  assert.match(backend,/APP_CHECK_MODE: "pending_provisioning"/u);
  assert.match(backend,/npm ci --prefix apps\/exam/u);assert.match(backend,/npm ci --prefix apps\/vendor/u);
  assert.ok(backend.indexOf('npm run test:security-matrix')>backend.indexOf('npm run test:emulators:ci'));
});
