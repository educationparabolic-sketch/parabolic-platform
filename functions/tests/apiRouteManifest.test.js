/* eslint-disable require-jsdoc, @typescript-eslint/no-var-requires */
"use strict";

const assert = require("node:assert/strict");
const {readdirSync, readFileSync} = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");
const {
  API_ROUTE_MANIFEST,
  BACKEND_HTTP_EXPORT_MANIFEST,
} = require("../lib/apiRouteManifest.js");

const WORKSPACE_ROOT = path.resolve(__dirname, "../..");
const FRONTEND_SOURCE_ROOTS = [
  "apps/admin/src",
  "apps/student/src",
  "apps/exam/src",
  "apps/vendor/src",
].map((relativePath) => path.join(WORKSPACE_ROOT, relativePath));
const API_METHODS = new Set(["get", "post", "put", "patch", "delete"]);
const PORTAL_API_PATH = /^\/(admin|student|exam|vendor)\//;

function collectTypeScriptFiles(directory) {
  return readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return collectTypeScriptFiles(entryPath);
    }

    if (
      entry.isFile() &&
      (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
      !entry.name.endsWith(".d.ts")
    ) {
      return [entryPath];
    }

    return [];
  });
}

function parameterName(expression, sourceFile) {
  const expressionText = expression.getText(sourceFile);

  if (/testId/i.test(expressionText)) {
    return "{testId}";
  }

  if (/sessionId/i.test(expressionText)) {
    return "{sessionId}";
  }

  throw new Error(
    `Unsupported API path parameter in ${sourceFile.fileName}: ` +
      expressionText,
  );
}

function resolveLiteralPath(expression, sourceFile) {
  if (
    ts.isStringLiteral(expression) ||
    ts.isNoSubstitutionTemplateLiteral(expression)
  ) {
    return expression.text;
  }

  if (!ts.isTemplateExpression(expression)) {
    return null;
  }

  let routePath = expression.head.text;
  for (const span of expression.templateSpans) {
    routePath += parameterName(span.expression, sourceFile);
    routePath += span.literal.text;
  }

  return routePath;
}

function resolveIdentifierPaths(identifier, sourceFile) {
  const resolvedPaths = new Set();

  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === identifier.text &&
      node.initializer
    ) {
      const resolvedPath = resolveLiteralPath(node.initializer, sourceFile);
      if (resolvedPath) {
        resolvedPaths.add(resolvedPath);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return [...resolvedPaths];
}

function containingFunctionName(node) {
  let current = node.parent;

  while (current) {
    if (ts.isFunctionDeclaration(current) && current.name) {
      return current.name.text;
    }

    current = current.parent;
  }

  return null;
}

function routeKey(method, routePath) {
  return `${method} ${routePath}`;
}

function discoverFrontendRoutes() {
  const discoveredRoutes = new Map();
  const unresolvedCalls = [];

  const recordRoute = (method, routePath, sourceFile, node) => {
    if (!PORTAL_API_PATH.test(routePath)) {
      return;
    }

    const key = routeKey(method, routePath);
    const relativeFile = path.relative(WORKSPACE_ROOT, sourceFile.fileName);
    const source = `${relativeFile}:${sourceFile.getLineAndCharacterOfPosition(
      node.getStart(sourceFile),
    ).line + 1}`;
    const existing = discoveredRoutes.get(key);

    if (existing) {
      existing.sources.add(source);
      return;
    }

    discoveredRoutes.set(key, {
      method,
      routePath,
      sources: new Set([source]),
    });
  };

  for (const filePath of FRONTEND_SOURCE_ROOTS.flatMap(
    collectTypeScriptFiles,
  )) {
    const sourceText = readFileSync(filePath, "utf8");
    const scriptKind = filePath.endsWith(".tsx") ?
      ts.ScriptKind.TSX :
      ts.ScriptKind.TS;
    const sourceFile = ts.createSourceFile(
      filePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      scriptKind,
    );

    const visit = (node) => {
      if (!ts.isCallExpression(node)) {
        ts.forEachChild(node, visit);
        return;
      }

      if (
        ts.isIdentifier(node.expression) &&
        node.expression.text === "getStudentSummaryResource"
      ) {
        const firstArgument = node.arguments[0];
        if (firstArgument) {
          const resolvedPath = resolveLiteralPath(firstArgument, sourceFile);
          if (resolvedPath) {
            recordRoute("GET", resolvedPath, sourceFile, node);
          }
        }
      }

      if (!ts.isPropertyAccessExpression(node.expression)) {
        ts.forEachChild(node, visit);
        return;
      }

      const methodName = node.expression.name.text.toLowerCase();
      const clientName = node.expression.expression.getText(sourceFile);
      if (!API_METHODS.has(methodName) || !/apiClient$/i.test(clientName)) {
        ts.forEachChild(node, visit);
        return;
      }

      const firstArgument = node.arguments[0];
      if (!firstArgument) {
        unresolvedCalls.push(`${sourceFile.fileName}: missing path argument`);
        ts.forEachChild(node, visit);
        return;
      }

      const method = methodName.toUpperCase();
      const literalPath = resolveLiteralPath(firstArgument, sourceFile);
      if (literalPath) {
        recordRoute(method, literalPath, sourceFile, node);
        ts.forEachChild(node, visit);
        return;
      }

      if (ts.isIdentifier(firstArgument)) {
        const identifierPaths = resolveIdentifierPaths(
          firstArgument,
          sourceFile,
        );
        for (const identifierPath of identifierPaths) {
          recordRoute(method, identifierPath, sourceFile, node);
        }

        if (identifierPaths.length > 0) {
          ts.forEachChild(node, visit);
          return;
        }

        if (
          firstArgument.text === "path" &&
          containingFunctionName(node) === "getStudentSummaryResource"
        ) {
          ts.forEachChild(node, visit);
          return;
        }
      }

      const relativeFile = path.relative(WORKSPACE_ROOT, sourceFile.fileName);
      unresolvedCalls.push(
        `${relativeFile}:${sourceFile.getLineAndCharacterOfPosition(
          node.getStart(sourceFile),
        ).line + 1} ${method} ${firstArgument.getText(sourceFile)}`,
      );
      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  assert.deepEqual(
    unresolvedCalls,
    [],
    "Every API-client call must expose a statically discoverable route.",
  );

  return discoveredRoutes;
}

test(
  "every frontend-declared API call has exactly one manifest entry",
  () => {
    const discoveredRoutes = discoverFrontendRoutes();
    const manifestRoutes = new Map(
      API_ROUTE_MANIFEST.map((route) => [
        routeKey(route.method, route.currentFrontendPath),
        route,
      ]),
    );

    assert.equal(
      manifestRoutes.size,
      API_ROUTE_MANIFEST.length,
      "Manifest method/current-path keys must be unique.",
    );

    const missingManifestEntries = [...discoveredRoutes.keys()]
      .filter((key) => !manifestRoutes.has(key))
      .sort();
    const staleManifestEntries = [...manifestRoutes.keys()]
      .filter((key) => !discoveredRoutes.has(key))
      .sort();

    assert.deepEqual(
      missingManifestEntries,
      [],
      "Frontend API calls missing from API_ROUTE_MANIFEST.",
    );
    assert.deepEqual(
      staleManifestEntries,
      [],
      "API_ROUTE_MANIFEST entries without a frontend declaration.",
    );
  },
);

test("every HTTP Functions export has one manifest disposition", () => {
  const indexSource = readFileSync(
    path.join(WORKSPACE_ROOT, "functions/src/index.ts"),
    "utf8",
  );
  const sourceExports = [...indexSource.matchAll(
    /export const (\w+)\s*=\s*functions\.https\.onRequest/g,
  )].map((match) => match[1]).sort();
  const manifestExports = BACKEND_HTTP_EXPORT_MANIFEST
    .map((entry) => entry.functionExport)
    .sort();

  assert.equal(
    new Set(manifestExports).size,
    manifestExports.length,
    "Backend HTTP export manifest names must be unique.",
  );
  assert.deepEqual(
    manifestExports,
    sourceExports,
    "Every source onRequest export must have one manifest disposition.",
  );

  for (const route of API_ROUTE_MANIFEST) {
    assert.equal(
      route.status === "missing",
      route.functionExport === null,
      `${route.id} handler mapping must agree with its status.`,
    );

    if (route.functionExport) {
      assert.ok(
        manifestExports.includes(route.functionExport),
        `${route.id} references an unaccounted Functions export.`,
      );
    }
  }
});
