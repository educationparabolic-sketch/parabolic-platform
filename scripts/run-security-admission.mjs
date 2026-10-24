import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,unlinkSync,mkdirSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
const project='demo-parabolic-test';
const env={...process.env, DEBUG:'', CI:'true', NODE_ENV:'test', PROJECT_ID:project, GOOGLE_CLOUD_PROJECT:project, GCLOUD_PROJECT:project,
  NO_GCE_CHECK:'true',METADATA_SERVER_DETECTION:'none',FUNCTIONS_DISCOVERY_TIMEOUT:'120',
  FUNCTIONS_EMULATOR:'true', APP_CHECK_MODE:'enforced',APP_CHECK_ALLOWED_APP_IDS:'1:123:web:approved', SECURITY_TEST_APP_CHECK_KEY:randomBytes(32).toString('base64url')};
const run=(cmd,args)=>{const result=spawnSync(cmd,args,{env,stdio:'inherit'});assert.ifError(result.error);assert.equal(result.status,0,`${cmd} failed`);};
if(!process.argv.includes('--skip-build'))run('npm',['--prefix','functions','run','build']);
mkdirSync(process.env.SECURITY_EVIDENCE_DIRECTORY ?? 'test-results/bwm047-admission',{recursive:true});
const config=JSON.parse(readFileSync('firebase.json','utf8'));delete config.hosting;
const path=`.firebase-bwm047-admission-${process.pid}.json`;
writeFileSync(path,JSON.stringify(config),{flag:'wx'});
try{run('firebase',['emulators:exec','--project',project,'--config',path,'--only','auth,firestore,functions',
 'node --test --test-concurrency=1 tests/security-admission.test.mjs tests/security/admission.emulator.cjs']);}finally{unlinkSync(path);}
