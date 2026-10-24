import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,readdirSync} from 'node:fs';
const require=createRequire(import.meta.url),ts=require('../functions/node_modules/typescript');
const {API_ROUTE_MANIFEST,BACKEND_HTTP_EXPORT_MANIFEST}=require('../functions/lib/apiRouteManifest');
export function assertVerifierReferences(source, path = "synthetic.ts") {
  const file=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true);
  function visit(node) {
    const name=ts.isPropertyAccessExpression(node)?node.name.text:ts.isElementAccessExpression(node)&&ts.isStringLiteral(node.argumentExpression)?node.argumentExpression.text:undefined;
    if(name === "verifyIdToken" && node.expression.getText(file) === "dependencies" && ts.isCallExpression(node.parent) && node.parent.expression.getText(file) === "createStudentSummaryHandler" && node.parent.arguments[2] === node) return;
    if(name === "verifyIdToken") {assert.ok(ts.isCallExpression(node.parent) && node.parent.expression === node, "Unclassified SDK verifier reference/alias");if(node.expression.getText(file) !== "dependencies")assert.equal(node.parent.arguments[1]?.kind,ts.SyntaxKind.TrueKeyword,"SDK verifier must check revocation");}
    if(ts.isBindingElement(node) && (node.propertyName?.getText(file) ?? node.name.getText(file)) === "verifyIdToken")throw Error("Unclassified SDK verifier destructuring");
    ts.forEachChild(node,visit);
  } visit(file);
}
export function securitySourceInventory(){
  const exports=[],verifiers=[],bindings=[];
  const walkFiles=path=>readdirSync(path,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()&&entry.name!=='tests'?walkFiles(path+'/'+entry.name):entry.isFile()&&entry.name.endsWith('.ts')&&!entry.name.endsWith('.d.ts')?[path+'/'+entry.name]:[]);
  const member=node=>ts.isPropertyAccessExpression(node)?node.name.text:ts.isElementAccessExpression(node)&&ts.isStringLiteral(node.argumentExpression)?node.argumentExpression.text:undefined;
  for(const path of walkFiles('functions/src')){
    const source=readFileSync(path,'utf8');assertVerifierReferences(source,path);const file=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true),delegates=new Set();
    for(const node of file.statements)if(ts.isImportDeclaration(node)&&/\/(?:instituteAuthorityEnforcement|currentAccountIdentity)$/u.test(node.moduleSpecifier.text)){
      const imports=node.importClause?.namedBindings;
      if(imports&&ts.isNamedImports(imports))for(const item of imports.elements)if(['verifyCurrentAuthorityIdToken','verifyCurrentAccountIdentity'].includes(item.propertyName?.text??item.name.text))delegates.add(item.name.text);
    }
    const record=node=>({path,line:file.getLineAndCharacterOfPosition(node.getStart(file)).line+1,expression:node.getText(file)});
    function visit(node){
      if(ts.isCallExpression(node)&&member(node.expression)==='onRequest'){
        const guard=node.arguments[0];assert.ok(guard&&ts.isCallExpression(guard)&&guard.expression.getText(file)==='guardHttpExport',path);
        assert.equal(guard.arguments.length,2,'Production HTTP exports may not inject test admission');
        const name=guard.arguments[0];assert.ok(ts.isStringLiteral(name));exports.push(name.text);
        assert.equal(node.parent.name?.text,name.text,'Export identity must match its guard');
      }
      if(ts.isCallExpression(node)&&member(node.expression)==='verifyIdToken'){
        const injected=node.expression.expression.getText(file)==='dependencies';
        if(injected)assert.equal(path,'functions/src/middleware/auth.ts');
        else {assert.equal(node.arguments[1]?.kind,ts.SyntaxKind.TrueKeyword,`${path}: revocation required`);assert.match(source,/\.getUser\(/u,`${path}: current-account delegate required`);}
        verifiers.push({...record(node),owner:injected?'injected middleware':'revoked-token/current-account service'});
      }
      if(ts.isPropertyAssignment(node)&&node.name.getText(file).replaceAll('"','')==='verifyIdToken'){
        const init=node.initializer;
        if(ts.isIdentifier(init))assert.ok(delegates.has(init.text),`${path}: unknown verifier binding`);
        else {assert.ok(ts.isArrowFunction(init),`${path}: unclassified verifier binding`);const body=init.body;assert.ok(ts.isCallExpression(body)&&ts.isIdentifier(body.expression)&&delegates.has(body.expression.text),`${path}: delegation must reach current-account owner`);}
        bindings.push(record(node));
      }
      ts.forEachChild(node,visit);
    }visit(file);
  }
  assert.deepEqual(exports.sort(),BACKEND_HTTP_EXPORT_MANIFEST.map(item=>item.functionExport).sort());assert.equal(exports.length,64);
  assert.equal(verifiers.filter(item=>item.owner==='injected middleware').length,1);
  assert.equal(verifiers.filter(item=>item.owner!=='injected middleware').length,4,'New SDK verifier requires explicit review');
  assert.ok(bindings.length>=42);
  const authority=readFileSync('functions/src/services/instituteAuthorityEnforcement.ts','utf8');assert.match(authority,/await verifyCurrentAccountIdentity\(getFirebaseAdminApp\(\)\.auth\(\), idToken\)/u);
  const admission=readFileSync('functions/src/services/applicationAdmission.ts','utf8');assert.match(admission,/await verifyCurrentAccountIdentity\(getFirebaseAdminApp\(\)\.auth\(\), authorization.slice\(7\)\)/u);
  return {routes:API_ROUTE_MANIFEST.map(route=>({id:route.id,method:route.method,path:route.canonicalPath,status:route.status,export:route.functionExport,
    admission:route.functionExport?'guardHttpExport/currentAccountIdentity':'closed retired route',
    negativeOwner:'tests/security/cross-portal-authorization.emulator.cjs',
    positiveOwner:route.portal==='exam'?'tests/e2e/exam-launch-auth.spec.mjs':route.portal==='vendor'?'functions/tests/vendorAuditHealthApi.emulator.test.js':'tests/security/cross-portal-authorization.emulator.cjs',
    scope:'Boundary family control; not an individual successful domain execution claim'})),exports,verifiers,bindings};
}
