import assert from "node:assert/strict";
import {readdir, readFile} from "node:fs/promises";
import {createRequire} from "node:module";
import path from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const ts = require(path.join(root, "functions/node_modules/typescript"));
const read = file => readFile(path.join(root, file), "utf8");
function parse(source, file = "source.ts") {
  return ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
}
function visit(node, callback) {
  callback(node);
  ts.forEachChild(node, child => visit(child, callback));
}
async function sources(directory) {
  const result = [];
  for (const entry of await readdir(path.join(root, directory), {withFileTypes: true})) {
    if (entry.name === "tests") continue;
    const file = `${directory}/${entry.name}`;
    if (entry.isDirectory()) result.push(...await sources(file));
    else if (file.endsWith(".ts")) result.push(file);
  }
  return result;
}
function rawVerifiers(source, file) {
  const ast = parse(source, file), sites = [];
  visit(ast, node => {
    if (!ts.isPropertyAccessExpression(node) || node.name.text !== "verifyIdToken") return;
    // Factory injection is accounted at each production export below, not treated as SDK authority.
    if (node.expression.getText(ast) === "dependencies") return;
    const call = node.parent;
    assert.ok(ts.isCallExpression(call) && call.expression === node,
      `${file}: an SDK verifier cannot be extracted without explicit coverage`);
    assert.equal(call.arguments.length, 2, `${file}: revocation argument must be explicit`);
    assert.equal(call.arguments[1].kind, ts.SyntaxKind.TrueKeyword, `${file}: revocation cannot be disabled`);
    sites.push(node.getText(ast));
  });
  return sites;
}

test("every raw SDK verifier, independent of parameter spelling, explicitly checks revocation and has current-account proof ownership", async () => {
  const expected = new Map([
    ["functions/src/services/currentAccountIdentity.ts", "verifyCurrentAccountIdentity"],
    ["functions/src/services/studentProfile.ts", "StudentProfileService"],
    ["functions/src/services/studentSummaryAuthority.ts", "StudentSummaryAuthorityService"],
    ["functions/src/services/studentIdentityPhotoAccess.ts", "IdentityPhotoAdminAuthority"],
  ]);
  const actual = [];
  for (const file of await sources("functions/src")) {
    const source = await read(file), sites = rawVerifiers(source, file);
    if (!sites.length) continue;
    actual.push(file);
    assert.ok(expected.has(file), `New verifier ${file} requires a current-account proof owner`);
    // The raw call must be in the named authority implementation, not an unused marker or an API callback.
    const ast = parse(source, file);
    const owner = ast.statements.find(node => (ts.isClassDeclaration(node) || ts.isVariableStatement(node)) &&
      (ts.isClassDeclaration(node) ? node.name?.text === expected.get(file) :
        node.declarationList.declarations.some(item => item.name.getText(ast) === expected.get(file))));
    assert.ok(owner && owner.getText(ast).includes("verifyIdToken"), file);
    assert.match(source, /(?:auth|this\.auth)\.getUser\(/u, `${file} must check a current Auth account`);
  }
  assert.deepEqual(actual.sort(), [...expected.keys()].sort());
  for (const source of ["auth.verifyIdToken(other)", "auth.verifyIdToken(other, false)", "const bypass = auth.verifyIdToken;"]) {
    assert.throws(() => rawVerifiers(source, "negative-control.ts"));
  }
  assert.equal(rawVerifiers("auth.verifyIdToken(unusualParameter, true)", "positive-control.ts").length, 1);
});

function moduleInfo(source, file) {
  const ast = parse(source, file), imports = new Map(), declarations = new Map();
  for (const node of ast.statements) {
    if (ts.isImportDeclaration(node) && node.importClause?.namedBindings &&
      ts.isNamedImports(node.importClause.namedBindings)) {
      for (const item of node.importClause.namedBindings.elements) imports.set(item.name.text, node.moduleSpecifier.text);
    }
    if (ts.isVariableStatement(node)) for (const item of node.declarationList.declarations) {
      declarations.set(item.name.getText(ast), item.initializer);
    }
  }
  return {ast, imports, declarations};
}
function verifierBindings(info, initializer, seen = new Set()) {
  const result = [];
  visit(initializer, node => {
    if (ts.isPropertyAssignment(node) && node.name.getText(info.ast) === "verifyIdToken") result.push(node.initializer);
    if (ts.isIdentifier(node) && info.declarations.has(node.text) && !seen.has(node.text)) {
      seen.add(node.text);
      result.push(...verifierBindings(info, info.declarations.get(node.text), seen));
    }
  });
  return result;
}

test("all HTTP exports are manifest-accounted, direct-path guarded, and resolve production verification to the shared authority or an explicit service boundary", async () => {
  const manifestModule = {exports: {}};
  new Function("exports", "module", ts.transpileModule(await read("functions/src/apiRouteManifest.ts"),
    {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText)(manifestModule.exports, manifestModule);
  const manifest = manifestModule.exports.BACKEND_HTTP_EXPORT_MANIFEST;
  const info = moduleInfo(await read("functions/src/index.ts"), "index.ts");
  const names = [], classifications = [];
  const closed = new Set(["vendorLicenseUpdate", "adminQuestionAssets", "adminQuestionsBulk"]);
  const privateBoundaries = new Set(["studentProfile", "adminStudentIdentityPhotoMedia", "examSessionIdentityStatus", "examSessionIntegrityEvents"]);
  for (const [name, initializer] of info.declarations) {
    if (!ts.isCallExpression(initializer) || initializer.expression.getText(info.ast) !== "functions.https.onRequest") continue;
    names.push(name);
    const disposition = manifest.find(item => item.functionExport === name);
    assert.ok(disposition, name);
    if (name === "helloWorld") {assert.equal(disposition.disposition, "healthcheck"); continue;}
    const guard = initializer.arguments[0];
    assert.ok(ts.isCallExpression(guard) && guard.expression.getText(info.ast) === "guardHttpExport", name);
    assert.equal(info.imports.get("guardHttpExport"), "./api/httpExportGuard");
    assert.equal(guard.arguments[0].text, name);
    const importedHandler = guard.arguments[1].text;
    const modulePath = path.posix.normalize(`functions/src/${info.imports.get(importedHandler)}.ts`);
    const handlerModule = moduleInfo(await read(modulePath), modulePath);
    const handler = handlerModule.declarations.get(importedHandler);
    assert.ok(handler, `${name}: missing handler declaration`);
    if (name === "apiV1" || name === "stripeWebhook") {
      assert.equal(disposition.disposition, name === "apiV1" ? "gateway" : "webhook");
      continue;
    }
    if (closed.has(name)) {
      assert.equal(handler.expression?.getText(handlerModule.ast), "createClosedLegacyHandler");
      assert.equal(handlerModule.imports.get("createClosedLegacyHandler"), "./closedLegacyHandler");
      classifications.push([name, "closed"]); continue;
    }
    if (privateBoundaries.has(name)) {
      assert.equal(handler.expression?.getText(handlerModule.ast),
        name === "examSessionIntegrityEvents" ? "createExamSessionIntegrityEventsHandler" : "createStudentIdentityBoundary");
      classifications.push([name, "transactional private identity authority"]); continue;
    }
    const bindings = verifierBindings(handlerModule, handler);
    assert.ok(bindings.length, `${name}: no production verifier binding`);
    for (const binding of bindings) {
      const call = ts.isArrowFunction(binding) ? binding.body : binding;
      const verifier = ts.isCallExpression(call) ? call.expression.getText(handlerModule.ast) : call.getText(handlerModule.ast);
      assert.equal(verifier, "verifyCurrentAuthorityIdToken", name);
      assert.equal(handlerModule.imports.get(verifier), "../services/instituteAuthorityEnforcement", name);
      if (ts.isCallExpression(call)) {
        assert.equal(call.arguments.length, 1);
        assert.equal(call.arguments[0].getText(handlerModule.ast), binding.parameters[0].name.getText(handlerModule.ast));
      }
    }
    classifications.push([name, "shared current-account/institute verifier"]);
  }
  assert.deepEqual(names.sort(), manifest.map(item => item.functionExport).sort());
  assert.equal(new Set(names).size, names.length);
  assert.equal(classifications.length, names.length - 3);
  const authority = await read("functions/src/services/instituteAuthorityEnforcement.ts");
  assert.match(authority, /await verifyCurrentAccountIdentity\(getFirebaseAdminApp\(\)\.auth\(\), idToken\)/u);
  assert.match(authority, /assertTokenAuthority\(authority, token\)/u);
  assert.match(authority, /assertTokenAuthority\(authority, user\.customClaims/u);
  assert.match(authority, /hasCurrentStaffMembership/u);
});
