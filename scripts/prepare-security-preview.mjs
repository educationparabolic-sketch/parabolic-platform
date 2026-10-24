import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {cpSync,existsSync,mkdirSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {withRestoredArtifacts} from './run-security-matrix.mjs';
import {securityHostingConfig} from './frontend-cicd/prepare-security-hosting.mjs';
import {scanReleaseArtifacts} from './frontend-cicd/scan-release-artifacts.mjs';
import {securitySourceInventory} from './security-source-inventory.mjs';
// Intentionally review-only. This command cannot authorize, contact or deploy to cloud.
assert.deepEqual(process.argv.slice(2),['--review']);
const root=fileURLToPath(new URL('../',import.meta.url));process.chdir(root);
const out=resolve('test-results/bwm047-public');mkdirSync(out,{recursive:true});
const revision=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'});assert.equal(revision.status,0);const commit=revision.stdout.trim();
const builtAt=new Date().toISOString(),releaseId='bwm047-review-'+builtAt.replace(/\D/g,'').slice(0,14);
const snapshot=resolve(out,releaseId);mkdirSync(snapshot,{recursive:true});
const origins={portal:'https://parabolic-dev.web.app',exam:'https://parabolic-dev-40ec9.web.app',vendor:'https://parabolic-dev-vendor.web.app'};
const publicConfig=Object.fromEntries([...readFileSync('apps/student/.env.local','utf8').matchAll(/^(VITE_FIREBASE_[A-Z0-9_]+)=(.*)$/gm)].map(([,k,v])=>[k,v.trim().replace(/^['"]|['"]$/g,'')]));
assert.equal(publicConfig.VITE_FIREBASE_PROJECT_ID,'parabolic-dev');
assert.equal(publicConfig.VITE_FIREBASE_AUTH_DOMAIN,'parabolic-dev.firebaseapp.com');
const env={...process.env,...publicConfig,NODE_ENV:'production',VITE_DATA_MODE:'live',VITE_API_BASE_URL:'',VITE_EXAM_DEV_MOCK_ENTRY:'false',VITE_FIREBASE_AUTH_EMULATOR_URL:'',VITE_APP_CHECK_MODE:'pending_provisioning',VITE_APP_CHECK_PROVIDER_KEY:'',
 VITE_CDN_BASE_URL:'https://cdn.review.invalid/published',CDN_BASE_URL:'https://cdn.review.invalid/published',VITE_PORTAL_BASE_URL:origins.portal,VITE_EXAM_BASE_URL:origins.exam,VITE_VENDOR_BASE_URL:origins.vendor,VITE_RELEASE_ID:releaseId,VITE_RELEASE_COMMIT_SHA:commit,VITE_RELEASE_BUILT_AT:builtAt};
const run=(cmd,args,extra={})=>{const r=spawnSync(cmd,args,{cwd:root,env:{...env,...extra},stdio:'inherit'});if(r.error)throw r.error;assert.equal(r.status,0,cmd+' failed');};
const below=dir=>readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(e=>{assert.ok(!e.isSymbolicLink());const p=dir+'/'+e.name;return e.isDirectory()?below(p):[p];});
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
let receipt;
await withRestoredArtifacts(root,async()=>{
 for(const app of ['admin','student','exam','vendor'])run('npm',['--prefix','apps/'+app,'run','build'],{VITE_BASE_PATH:['admin','student'].includes(app)?'/'+app+'/':'/'});
 run(process.execPath,['scripts/frontend-cicd/prepare-portal-hosting.mjs']);
 const scan=await scanReleaseArtifacts();
 const config=await securityHostingConfig({environment:env,rootDirectory:root,config:JSON.parse(readFileSync('firebase.json','utf8'))});
 for(const h of config.hosting){cpSync(h.public,resolve(snapshot,h.target),{recursive:true});h.public=releaseId+'/'+h.target;}
 // Canonical base paths are supplied explicitly, including nested Portal entrypoints.
 const inventory=securitySourceInventory();const source=resolve(snapshot,'functions-source');mkdirSync(source,{recursive:true});
 const backend={};for(const p of [...below('functions/lib').filter(p=>!p.startsWith('functions/lib/tests/')),'functions/package.json','functions/package-lock.json']){const relative=p.slice(10),dest=resolve(source,relative);mkdirSync(resolve(dest,'..'),{recursive:true});cpSync(p,dest);backend[relative]=sha(dest);}
 const files=['portal','exam','vendor'].flatMap(target=>below(resolve(snapshot,target))).map(p=>({path:p.slice(snapshot.length+1),sha256:sha(p)}));
 const bootstrap={hosting:config.hosting.map(h=>{const publicPath='bootstrap/'+h.target;mkdirSync(resolve(out,publicPath),{recursive:true});writeFileSync(resolve(out,publicPath,'index.html'),'<!doctype html><title>Security qualification pending</title>');return {target:h.target,public:publicPath,headers:[{source:'**',headers:[{key:'Cache-Control',value:'no-store'}]}]};})};
 receipt={project:'parabolic-dev',releaseId,builtAt,commit,dirtyWorkspace:true,reviewOnly:true,deploymentAuthorized:false,backendCompatibilityVerified:false,publicQualified:false,providerQualified:false,origins,cdnBase:env.CDN_BASE_URL,cdnPlaceholder:true,snapshot,files,backendFiles:backend,maximumHttpExports:inventory.exports,scan,
 limitation:'Do not upload: canonical review origins and placeholder CDN. Approved remote preflight, existing-export reconciliation, reviewed runtime inputs, actual preview origins/CDN, fresh rebuild/hashes and genuine HTTPS proof required. No environment files or installed dependencies included.'};
 for(const [name,data]of Object.entries({'preview-candidate.json':receipt,'firebase.preview.json':{hosting:config.hosting},'firebase.bootstrap.json':bootstrap,'firebase.backend.json':{functions:[{source:releaseId+'/functions-source',codebase:'default',disallowLegacyRuntimeConfig:true,ignore:['node_modules','.git','*.local']}]},'.firebaserc':{targets:{'parabolic-dev':JSON.parse(readFileSync('.firebaserc','utf8')).targets['parabolic-dev']}}}))writeFileSync(resolve(out,name),JSON.stringify(data,null,2)+'\n');
 assert.ok(!existsSync(source+'/.env.parabolic-dev'));console.log('REVIEW ONLY:',files.length,'frontend files;',Object.keys(backend).length,'backend files;',inventory.exports.length,'maximum HTTP exports; no cloud action.');
});
writeFileSync(resolve(out,'review-restoration.json'),JSON.stringify({restored:true,releaseId},null,2)+'\n');
