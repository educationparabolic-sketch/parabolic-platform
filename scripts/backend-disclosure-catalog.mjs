import {createRequire} from "node:module";
import {readdirSync, readFileSync, writeFileSync} from "node:fs";
import {resolve} from "node:path";
const require = createRequire(import.meta.url);
const ts = require("../functions/node_modules/typescript");
const root = resolve(import.meta.dirname, "..");
const destination = "functions/src/policy/backendDisclosureCatalog.ts";
function files(dir) {
  return readdirSync(resolve(root, dir), {withFileTypes: true}).flatMap(item =>
    item.isDirectory() ? item.name === "tests" ? [] : files(`${dir}/${item.name}`) :
      item.name.endsWith(".ts") && `${dir}/${item.name}` !== destination ? [`${dir}/${item.name}`] : []);
}
function staticText(node) {
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = staticText(node.left), right = staticText(node.right);
    if (left !== undefined && right !== undefined) return left + right;
  }
  return undefined;
}
const messages = new Set(), symbols = new Set(), frames = new Set(), services = new Set(["parabolic-platform-functions", "unknown-service"]);
for (const path of [...files("functions/src"), ...files("shared/contracts"), ...files("shared/types")]) {
  const source = ts.createSourceFile(path, readFileSync(resolve(root, path), "utf8"), ts.ScriptTarget.Latest, true);
  if (path.startsWith("functions/src/")) frames.add(path.split("/").at(-1).replace(/\.ts$/u, ".js"));
  function visit(node) {
    const text = staticText(node);
    if (text !== undefined) {
      let parent = node.parent;
      // Static branches stay static even when the caller selects one at runtime.
      while (ts.isConditionalExpression(parent) || ts.isParenthesizedExpression(parent)) parent = parent.parent;
      const messageSlot = ((ts.isCallExpression(parent) || ts.isNewExpression(parent)) &&
        /(?:error|warn|info|debug|critical|fail|reject|deny|validat|assert|super|buildErrorResponse|sendErrorResponse)/iu.test(parent.expression.getText(source))) ||
        (ts.isPropertyAssignment(parent) && /message/iu.test(parent.name.getText(source))) ||
        (ts.isVariableDeclaration(parent) && /message|error|denied|unavailable/iu.test(parent.name.getText(source)));
      // Public, source-static prose only. Runtime strings/expressions never join this catalogue.
      if (path.startsWith("functions/src/") && messageSlot && text.length <= 2048 && /[a-zA-Z]{3}/u.test(text) && / /u.test(text) &&
          !/[\r\n<>]/u.test(text) && !/(?:https?:|\/\/|\\|\$\{)/u.test(text)) messages.add(text);
      if (ts.isLiteralTypeNode(node.parent) && /^[a-zA-Z][a-zA-Z0-9_.-]{0,79}$/u.test(text)) symbols.add(text);
    }
    if (ts.isClassDeclaration(node) && node.name && /Error$/u.test(node.name.text)) symbols.add(node.name.text);
    if (ts.isPropertyAssignment(node) && node.name.getText(source) === "service" && ts.isStringLiteralLike(node.initializer)) services.add(node.initializer.text);
    if ((ts.isCallExpression(node) || ts.isNewExpression(node)) && /(?:createLogger|createErrorReporter|createRequestLogger|StructuredLogger|RuntimeErrorReporter)$/u.test(node.expression.getText(source))) {
      const first = node.arguments?.[0]; if (first && ts.isStringLiteralLike(first)) services.add(first.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
// Reviewed compatibility prose for existing bounded template/configuration messages.
// These are exact public sentences, never interpolation of a runtime field/resource value.
for (const message of [
  'Field "instituteId" must be a non-empty string.',
  'Capability requires license layer L3.',
  'Uploaded file content does not match the ".png" extension.',
  'Field "limit" must be an integer between 1 and 20.',
  'Field "limit" must be an integer between 1 and 100.',
  'Tag dictionary revision conflict.',
  'Settings revision conflict.',
  'Field "attachments.0.clientAttachmentId" must be a non-empty string of at most 36 characters.',
  'Vendor intelligence authority is unavailable.',
  'Controlled mode requires license layer L2.',
]) messages.add(message);
for (const method of ["GET", "POST", "PATCH", "PUT", "DELETE", "HEAD", "OPTIONS"]) {
  messages.add(`Method ${method} is not allowed for this API route.`);
  messages.add(`Method not allowed. Use ${method}.`);
}
const set = (name, values) => `export const ${name}: ReadonlySet<string> = new Set([\n${[...values].sort().map(value => "  " + JSON.stringify(value) + ",").join("\n")}\n]);\n`;
const output = "/* eslint-disable max-len */\n// Source-static disclosure catalogue. Regenerate/check with scripts/backend-disclosure-catalog.mjs.\n" +
  "// Adding prose makes it eligible for disclosure; review additions as public text. No runtime harvesting.\n" +
  set("DISCLOSABLE_MESSAGES", messages) + set("DISCLOSABLE_SYMBOLS", symbols) +
  set("DISCLOSABLE_SERVICES", services) + set("DISCLOSABLE_FRAME_FILES", frames);
if (process.argv.includes("--write")) writeFileSync(resolve(root, destination), output);
else if (readFileSync(resolve(root, destination), "utf8") !== output) throw new Error("Disclosure catalogue drift; review source-static additions before regeneration.");
console.log(JSON.stringify({messages: messages.size, symbols: symbols.size, services: services.size, frames: frames.size}));
