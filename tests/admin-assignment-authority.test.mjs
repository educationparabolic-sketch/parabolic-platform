import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";

const rootDirectory = fileURLToPath(new URL("../", import.meta.url));
const authorityPath = join(
  rootDirectory,
  "apps/admin/src/features/assignments/assignmentAuthority.ts",
);
const pagePath = join(
  rootDirectory,
  "apps/admin/src/features/assignments/AssignmentManagementPage.tsx",
);
const require = createRequire(import.meta.url);
const typescript = require(join(
  rootDirectory,
  "functions/node_modules/typescript",
));

function loadTypeScriptModule(source, sourcePath) {
  const transpiled = typescript.transpileModule(source, {
    compilerOptions: {
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  }).outputText;
  const loadedModule = {exports: {}};
  const evaluate = new Function("exports", "module", transpiled);
  evaluate(loadedModule.exports, loadedModule);
  return loadedModule.exports;
}

const [authoritySource, pageSource] = await Promise.all([
  readFile(authorityPath, "utf8"),
  readFile(pagePath, "utf8"),
]);
const {reconcileCreatedRun} = loadTypeScriptModule(
  authoritySource,
  authorityPath,
);

const request = {
  academicYear: "2026",
  attemptLimit: 1,
  endWindow: "2026-08-25T11:00:00.000Z",
  expectedTemplateVersion: 4,
  gracePeriodMinutes: 10,
  idempotencyKey: "assignment-authority-test",
  mode: "Diagnostic",
  proctoringPolicy: {
    browserIntegrityGuardEnabled: true,
    faceIdentityGazeGuardEnabled: false,
  },
  recipientStudentIds: ["student-1", "student-2"],
  shuffleQuestionOrder: true,
  startWindow: "2026-08-25T09:00:00.000Z",
  testId: "test-1",
  timezone: "Asia/Kolkata",
};

const authoritativeRun = {
  academicYear: request.academicYear,
  attemptLimit: request.attemptLimit,
  canonicalId: "canonical-physics-1",
  createdAt: "2026-08-23T13:00:00.000Z",
  endWindow: request.endWindow,
  gracePeriodMinutes: request.gracePeriodMinutes,
  id: "run_authoritative_1",
  mode: request.mode,
  proctoringPolicy: request.proctoringPolicy,
  recipientCount: request.recipientStudentIds.length,
  recipientStudentIds: request.recipientStudentIds,
  runPath:
    "institutes/inst-1/academicYears/2026/runs/run_authoritative_1",
  shuffleQuestionOrder: request.shuffleQuestionOrder,
  startWindow: request.startWindow,
  status: "scheduled",
  templateVersion: request.expectedTemplateVersion,
  testId: request.testId,
  timezone: request.timezone,
};

test("create/replay reconciliation returns only the persisted authority", () => {
  assert.equal(
    reconcileCreatedRun(
      request,
      {disposition: "created", run: authoritativeRun},
      {disposition: "replayed", run: authoritativeRun},
    ),
    authoritativeRun,
  );
});

test("create/replay reconciliation rejects non-replay and field drift", () => {
  assert.throws(
    () => reconcileCreatedRun(
      request,
      {disposition: "created", run: authoritativeRun},
      {disposition: "created", run: authoritativeRun},
    ),
    /did not return the persisted run replay/,
  );
  assert.throws(
    () => reconcileCreatedRun(
      request,
      {disposition: "created", run: authoritativeRun},
      {
        disposition: "replayed",
        run: {...authoritativeRun, recipientCount: 1},
      },
    ),
    /recipientCount 1; expected 2/,
  );
  assert.throws(
    () => reconcileCreatedRun(
      request,
      {disposition: "created", run: authoritativeRun},
      {
        disposition: "replayed",
        run: {...authoritativeRun, canonicalId: "drifted-canonical"},
      },
    ),
    /did not match the authoritative create result/,
  );
});

test("live Admin create retries, reconciles, and avoids fallback run state", () => {
  assert.match(pageSource, /const createResult = await submitRunToApi\(payload\)/);
  assert.match(pageSource, /const replayResult = await submitRunToApi\(payload\)/);
  assert.match(pageSource, /reconcileCreatedRun\(\s*payload,\s*createResult,\s*replayResult/);
  assert.match(pageSource, /setLastAuthoritativeRun\(authoritativeRun\)/);

  const liveBranch = pageSource.match(
    /if \(shouldUseLiveApi\(\)\) \{([\s\S]*?)\n      \} else \{/,
  )?.[1] ?? "";
  assert.doesNotMatch(liveBranch, /buildFallbackRunRecord|setRuns/);
});
