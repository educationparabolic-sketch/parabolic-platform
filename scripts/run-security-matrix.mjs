import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {openSync, closeSync, readFileSync, existsSync} from 'node:fs';
import {cp, mkdir, mkdtemp, readdir, rm, lstat, writeFile, rename} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve, dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {SECURITY_MATRIX, SECURITY_PHASES} from './security-matrix-contract.mjs';
export const ARTIFACT_ROOTS = ['apps/admin/dist','apps/student/dist','apps/exam/dist','apps/vendor/dist','.firebase/hosting/portal'];
export async function artifactHashes(root) {
  const hashes = {};
  async function visit(relative) {
    if (!existsSync(resolve(root, relative))) return;
    const stat = await lstat(resolve(root, relative));
    assert.equal(stat.isSymbolicLink(), false, 'Artifact symlinks are not supported');
    if (stat.isDirectory()) for (const name of (await readdir(resolve(root,relative))).sort()) await visit(`${relative}/${name}`);
    else hashes[relative] = createHash('sha256').update(readFileSync(resolve(root,relative))).digest('hex');
  }
  for (const path of ARTIFACT_ROOTS) await visit(path);
  return hashes;
}
export async function withRestoredArtifacts(root, operation) {
  const initial = await artifactHashes(root), backup = await mkdtemp(join(tmpdir(),'bwm047-matrix-'));
  const present = ARTIFACT_ROOTS.filter(path => existsSync(resolve(root,path)));
  try {
    for (const path of present) {await mkdir(dirname(resolve(backup,path)),{recursive:true});await cp(resolve(root,path),resolve(backup,path),{recursive:true});}
    try {return await operation();}
    finally {
      for (const path of ARTIFACT_ROOTS) {
        await rm(resolve(root,path),{recursive:true,force:true});
        if (present.includes(path)) {await mkdir(dirname(resolve(root,path)),{recursive:true});await cp(resolve(backup,path),resolve(root,path),{recursive:true});}
      }
      assert.deepEqual(await artifactHashes(root), initial, 'Artifact restoration failed');
    }
  } finally {await rm(backup,{recursive:true,force:true});}
}
function sourceHashes(root) {
  const git=spawnSync('git',['ls-files','-c','-o','--exclude-standard'],{cwd:root,encoding:'utf8'});
  assert.equal(git.status,0);
  return Object.fromEntries([...new Set(git.stdout.trim().split('\n'))].filter(path=>path && !path.startsWith('.firebase-bwm047-') && existsSync(resolve(root,path))).sort()
    .map(path=>[path,createHash('sha256').update(readFileSync(resolve(root,path))).digest('hex')]));
}
export async function runMatrix(root) {
  const out=resolve(root,'test-results/bwm047-matrix/run');await mkdir(dirname(out),{recursive:true});
  if(existsSync(out))await rename(out,`${out}-previous-${Date.now()}-${process.pid}`);
  await mkdir(out,{recursive:true});
  const receipt={result:'RUNNING',project:'demo-parabolic-test',publicQualified:false,providerQualified:false,restored:false,phases:[],acceptance:SECURITY_MATRIX};
  const save=()=>writeFile(join(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
  const initialArtifacts=await artifactHashes(root);
  const before=sourceHashes(root);await writeFile(join(out,'source-candidate.json'),JSON.stringify(before,null,2)+'\n');await save();
  let active, interrupted=false;
  const interrupt=()=>{interrupted=true;if(active)try{process.kill(-active.pid,'SIGINT');}catch(error){if(error.code!=='ESRCH')throw error;}};
  process.on('SIGINT',interrupt);process.on('SIGTERM',interrupt);
  try {
    await withRestoredArtifacts(root,async()=>{
      for(const phase of SECURITY_PHASES){
        if(interrupted)throw Error('Matrix interrupted');
        const directory=join(out,phase.id);await mkdir(directory,{recursive:true});
        const env={...process.env,DEBUG:'',CI:'true',SECURITY_MATRIX_RUN:'1',SECURITY_EVIDENCE_DIRECTORY:directory,
          NODE_ENV:phase.id==='release'?'production':'test',PROJECT_ID:'demo-parabolic-test',GCLOUD_PROJECT:'demo-parabolic-test',GOOGLE_CLOUD_PROJECT:'demo-parabolic-test'};
        const entry={id:phase.id,result:'RUNNING',command:[phase.command,...phase.args]};receipt.phases.push(entry);await save();
        console.log(`[security-matrix] ${phase.id}; isolated demo project only`);
        const log=openSync(join(directory,'output.log'),'w');
        let status;
        try {status=await new Promise((resolve,reject)=>{
          active=spawn(phase.command,phase.args,{cwd:root,env,detached:true,stdio:['ignore',log,log]});
active.once('error',reject);active.once('close',(code,signal)=>resolve({code,signal}));
        });}finally{active=undefined;closeSync(log);}
        entry.exitCode=status.code;entry.signal=status.signal;entry.result=status.code===0&&!interrupted?'PASS':'FAIL';await save();
        assert.equal(entry.result,'PASS',`${phase.id} failed; see ${directory}/output.log`);
        if(['browser','release'].includes(phase.id))await writeFile(join(directory,'artifacts.json'),JSON.stringify(await artifactHashes(root),null,2)+'\n');
      }
    });
    receipt.restored=true;assert.deepEqual(sourceHashes(root),before,'Source changed during matrix execution');
    receipt.result='PASS';
  } catch(error){receipt.result='FAIL';receipt.restored=JSON.stringify(await artifactHashes(root))===JSON.stringify(initialArtifacts);receipt.failure=error.message;throw error;}
  finally{process.off('SIGINT',interrupt);process.off('SIGTERM',interrupt);await save();}
  console.log('[security-matrix] PASS; local only; generated artifacts restored; public/provider gates remain open');
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  assert.equal(process.argv.length,2,'The full matrix cannot omit a phase');
  await runMatrix(resolve(import.meta.dirname,'..'));
}
