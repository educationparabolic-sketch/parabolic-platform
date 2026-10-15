import {createRequire} from "node:module";
import {createHash} from "node:crypto";
import {readFile, readdir} from "node:fs/promises";
import {join} from "node:path";
import {fileURLToPath} from "node:url";

export const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
export const ts = require(join(root, "functions/node_modules/typescript"));
const tags = new Set(["button", "form", "input", "select", "textarea", "a", "Link", "NavLink", "UiForm"]);
const intentAttributes = /^(?:onClick|onSubmit|onChange|onKeyDown|onKeyUp|href|to|type|disabled|name|aria-label|aria-describedby|role)$/u;
const printer = ts.createPrinter({removeComments: true});

export function sourceControls(source, file) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const controls = [];
  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(ast);
      const event = node.attributes.properties.some(attr => ts.isJsxAttribute(attr) && /^on(?:Click|Submit|Change|KeyDown|KeyUp)$/u.test(attr.name.text));
      // New wrappers with event props or conventional Button/Form/Link names also need a classification.
      if (tags.has(tag) || event || /(?:Button|Form|Link)$/u.test(tag)) {
        let ownerNode = node.parent;
        while (ownerNode && !ts.isFunctionDeclaration(ownerNode) && !(ts.isArrowFunction(ownerNode) && ts.isVariableDeclaration(ownerNode.parent))) ownerNode = ownerNode.parent;
        const owner = ownerNode?.name?.text ?? ownerNode?.parent?.name?.getText(ast) ?? "module";
        const attrs = node.attributes.properties.filter(attr => ts.isJsxSpreadAttribute(attr) || (ts.isJsxAttribute(attr) && intentAttributes.test(attr.name.text)))
          .map(attr => printer.printNode(ts.EmitHint.Unspecified, attr, ast)).sort();
        const label = ts.isJsxElement(node.parent) ? node.parent.children.filter(ts.isJsxText).map(n => n.text.trim().replace(/\s+/gu, " ")).filter(Boolean).join(" ") : "";
        let parent = node.parent, formIntent = "";
        while (parent) {
          if (ts.isJsxElement(parent) && ["form", "UiForm"].includes(parent.openingElement.tagName.getText(ast))) {
            const submit = parent.openingElement.attributes.properties.find(attr => ts.isJsxAttribute(attr) && attr.name.text === "onSubmit");
            if (submit) formIntent = printer.printNode(ts.EmitHint.Unspecified, submit, ast);
            break;
          }
          parent = parent.parent;
        }
        const choices = tag === "select" && ts.isJsxElement(node.parent) ? node.parent.children.filter(child => !ts.isJsxText(child)).map(child => printer.printNode(ts.EmitHint.Unspecified, child, ast)) : [];
        const maps = [];
        for (let ancestor = node.parent; ancestor && ancestor !== ownerNode; ancestor = ancestor.parent) {
          if (ts.isCallExpression(ancestor) && ts.isPropertyAccessExpression(ancestor.expression) && ancestor.expression.name.text === "map") {
            maps.push(printer.printNode(ts.EmitHint.Unspecified, ancestor.expression.expression, ast));
          }
        }
        const signature = JSON.stringify([owner, tag, attrs, label, formIntent, choices, maps]);
        controls.push({file, owner, tag, attrs, label, formIntent, fingerprint: createHash("sha256").update(signature).digest("hex"), line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1});
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return controls;
}

export function declaredVocabulary(source, file, name) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = [];
  function find(node) {
    if ((ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) && node.name?.getText(ast) === name) declarations.push(node);
    ts.forEachChild(node, find);
  }
  find(ast);
  if (declarations.length !== 1) throw new Error(`${file} must retain unique vocabulary owner ${name}`);
  const words = new Set();
  function collect(node) {
    if (ts.isStringLiteral(node)) words.add(node.text);
    ts.forEachChild(node, collect);
  }
  collect(declarations[0]);
  return [...words].sort();
}

export async function inventorySources(directory = join(root, "apps/vendor/src"), prefix = "") {
  const entries = await readdir(directory, {withFileTypes: true});
  const files = {};
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = prefix + entry.name;
    if (entry.isDirectory()) Object.assign(files, await inventorySources(join(directory, entry.name), relative + "/"));
    else if (entry.name.endsWith(".tsx")) files[relative] = await readFile(join(directory, entry.name), "utf8");
  }
  return files;
}

export function mountedRoutes(source) {
  const ast = ts.createSourceFile("App.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const rows = [], occurrences = new Map();
  const value = attr => ts.isStringLiteral(attr.initializer) ? attr.initializer.text : "$" + attr.initializer.expression.getText(ast);
  function visit(node) {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(ast) === "Route") {
      const attrs = node.attributes.properties.filter(ts.isJsxAttribute);
      const pathAttr = attrs.find(attr => attr.name.text === "path");
      if (!pathAttr) throw new Error("Every Vendor Route must declare an inventoried path");
      const path = value(pathAttr);
      const occurrence = occurrences.get(path) ?? 0;
      occurrences.set(path, occurrence + 1);
      const element = attrs.find(attr => attr.name.text === "element")?.initializer?.getText(ast) ?? "";
      const elementNode = attrs.find(attr => attr.name.text === "element")?.initializer;
      const components = [];
      function mounts(child) {
        if (ts.isJsxOpeningElement(child) || ts.isJsxSelfClosingElement(child)) components.push(child.tagName.getText(ast));
        else if (ts.isCallExpression(child) && ts.isIdentifier(child.expression)) components.push(child.expression.text);
        ts.forEachChild(child, mounts);
      }
      if (elementNode) mounts(elementNode);
      rows.push({path, occurrence, element, components});
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return rows;
}
