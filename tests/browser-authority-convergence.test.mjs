import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDirectory = fileURLToPath(new URL("../", import.meta.url));
const modulePath = join(rootDirectory, "shared/services/authSessionConvergence.ts");
const require = createRequire(import.meta.url);
const typescript = require(join(rootDirectory, "functions/node_modules/typescript"));

function loadConvergenceModule(source) {
  const output = typescript.transpileModule(source, {
    compilerOptions: {
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2022,
    },
    fileName: modulePath,
  }).outputText;
  const loaded = { exports: {} };
  new Function("exports", "module", output)(loaded.exports, loaded);
  return loaded.exports;
}

function token(claims) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none" })}.${encode(claims)}.`;
}

const convergenceSource = await readFile(modulePath, "utf8");
const convergence = loadConvergenceModule(convergenceSource);

test("API and Firebase failures classify only terminal institute authority changes", () => {
  const idToken = token({ authorizationVersion: 7 });
  assert.deepEqual(
    convergence.classifyApiAuthorityFailure({
      code: "UNAUTHORIZED",
      idToken,
      message: "Authentication authority is stale; refresh the session.",
      status: 401,
    }),
    {
      issue: "session_revoked",
      message: "This session is no longer authorized. Sign in again to continue.",
      observedAuthorizationVersion: 7,
      source: "api",
    },
  );
  assert.equal(
    convergence.classifyApiAuthorityFailure({
      code: "FORBIDDEN",
      idToken,
      message: "Teacher role required.",
      status: 403,
    }),
    null,
  );
  assert.equal(
    convergence.classifyApiAuthorityFailure({
      code: "FORBIDDEN",
      idToken,
      message: "Institute access is suspended.",
      status: 403,
    }).issue,
    "institute_suspended",
  );
  assert.equal(
    convergence.classifyApiAuthorityFailure({
      code: "LICENSE_RESTRICTED",
      idToken,
      message: "Current license layer does not permit Hard sessions.",
      status: 403,
    }).issue,
    "license_restricted",
  );
  assert.equal(convergence.isTerminalFirebaseAuthError({ code: "auth/user-disabled" }), true);
  assert.equal(convergence.isTerminalFirebaseAuthError({ code: "auth/network-request-failed" }), false);
});

test("authority signals are origin-local, observable, and unsubscribable", () => {
  const observed = [];
  const unsubscribe = convergence.subscribeToAuthAuthoritySignals((signal) => observed.push(signal.issue));
  convergence.publishAuthAuthoritySignal({
    issue: "license_restricted",
    message: "restricted",
    observedAuthorizationVersion: 3,
    source: "api",
  });
  unsubscribe();
  convergence.publishAuthAuthoritySignal({
    issue: "session_revoked",
    message: "revoked",
    observedAuthorizationVersion: 3,
    source: "api",
  });
  assert.deepEqual(observed, ["license_restricted"]);
});

test("only a newer authorization generation clears a retained institute issue", () => {
  assert.equal(convergence.hasAuthorizationAdvanced(7, token({ authorizationVersion: 7 })), false);
  assert.equal(convergence.hasAuthorizationAdvanced(7, token({ authorizationVersion: 8 })), true);
  assert.equal(convergence.hasAuthorizationAdvanced(null, token({ authorizationVersion: 8 })), false);
});

test("all institute portals implement bounded convergence while Vendor stays global-only", async () => {
  const [provider, apiClient, globalState, admin, student, exam] = await Promise.all([
    readFile(join(rootDirectory, "shared/services/authProvider.tsx"), "utf8"),
    readFile(join(rootDirectory, "shared/services/apiClient.ts"), "utf8"),
    readFile(join(rootDirectory, "shared/services/globalPortalState.tsx"), "utf8"),
    readFile(join(rootDirectory, "apps/admin/src/App.tsx"), "utf8"),
    readFile(join(rootDirectory, "apps/student/src/App.tsx"), "utf8"),
    readFile(join(rootDirectory, "apps/exam/src/ExamRuntimeApp.tsx"), "utf8"),
  ]);

  assert.match(provider, /onIdTokenChanged/u);
  assert.match(provider, /INSTITUTE_TOKEN_REFRESH_INTERVAL_MS = 60 \* 1000/u);
  assert.match(provider, /portalKey === "vendor"/u);
  assert.match(provider, /firebaseSignOut\(authRef\.current\)/u);
  assert.match(apiClient, /classifyApiAuthorityFailure/u);
  assert.match(apiClient, /buildFirebaseRefreshAuthoritySignal/u);
  assert.match(globalState, /portal !== "vendor"/u);
  assert.match(globalState, /portal === "vendor" && sessionAuthorityIssue !== "session_revoked"/u);
  assert.match(admin, /Institute access suspended/u);
  assert.match(admin, /Institute license access unavailable/u);
  assert.match(student, /Institute access suspended/u);
  assert.match(student, /Institute license access unavailable/u);
  assert.match(exam, /Recoverable Session Interruption/u);
  assert.match(exam, /The exam was not auto-submitted/u);
  assert.match(exam, /authorityInterrupted/u);
});
