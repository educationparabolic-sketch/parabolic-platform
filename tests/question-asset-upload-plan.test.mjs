import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDirectory = fileURLToPath(new URL("../", import.meta.url));
const sourcePath = join(
  rootDirectory,
  "apps/admin/src/features/tests/questionAssetUploadPlan.ts",
);
const managementPagePath = join(
  rootDirectory,
  "apps/admin/src/features/tests/QuestionBankManagementPage.tsx",
);
const require = createRequire(import.meta.url);
const typescript = require(join(rootDirectory, "functions/node_modules/typescript"));
const source = await readFile(sourcePath, "utf8");
const managementPageSource = await readFile(managementPagePath, "utf8");
const transpiled = typescript.transpileModule(source, {
  compilerOptions: {
    module: typescript.ModuleKind.CommonJS,
    target: typescript.ScriptTarget.ES2022,
  },
  fileName: sourcePath,
}).outputText;
const loadedModule = { exports: {} };
new Function("exports", "module", transpiled)(
  loadedModule.exports,
  loadedModule,
);
const {
  buildQuestionAssetUploadPlan,
  uploadQuestionAssetPlan,
} = loadedModule.exports;

const workbookRows = [
  {
    questionImageFile: "question-001.png",
    solutionImageFile: "solution-001.webp",
  },
];
const serverRows = [
  {
    action: "create",
    errors: [],
    questionId: "physics-motion-001-v2",
    rowNumber: 1,
    uniqueKey: "PHYSICS-MOTION-001",
    version: 2,
    warnings: [],
  },
];

test("asset upload plan binds ZIP bytes to authoritative IDs and versions", () => {
  const plan = buildQuestionAssetUploadPlan({
    assetFiles: {
      "question-001.png": new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      "solution-001.webp": new Uint8Array([0x52, 0x49, 0x46, 0x46]),
    },
    instituteId: "inst-001",
    serverRows,
    workbookRows,
  });

  assert.equal(plan.length, 2);
  assert.deepEqual(
    plan.map((entry) => ({
      assetKind: entry.request.assetKind,
      extension: entry.request.extension,
      instituteId: entry.request.instituteId,
      questionId: entry.request.questionId,
      version: entry.request.version,
    })),
    [
      {
        assetKind: "questionImage",
        extension: "png",
        instituteId: "inst-001",
        questionId: "physics-motion-001-v2",
        version: 2,
      },
      {
        assetKind: "solutionImage",
        extension: "webp",
        instituteId: "inst-001",
        questionId: "physics-motion-001-v2",
        version: 2,
      },
    ],
  );
  assert.deepEqual(
    Buffer.from(plan[0].request.contentBase64, "base64"),
    Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  );
});

test("asset upload plan rejects missing authority, bytes, and unsupported files", () => {
  assert.throws(
    () => buildQuestionAssetUploadPlan({
      assetFiles: {},
      instituteId: "inst-001",
      serverRows: [],
      workbookRows,
    }),
    /authoritative ID and version/i,
  );
  assert.throws(
    () => buildQuestionAssetUploadPlan({
      assetFiles: {},
      instituteId: "inst-001",
      serverRows,
      workbookRows,
    }),
    /no longer available/i,
  );
  assert.throws(
    () => buildQuestionAssetUploadPlan({
      assetFiles: {
        "question-001.jpg": new Uint8Array([1]),
        "solution-001.webp": new Uint8Array([2]),
      },
      instituteId: "inst-001",
      serverRows,
      workbookRows: [{
        questionImageFile: "question-001.jpg",
        solutionImageFile: "solution-001.webp",
      }],
    }),
    /must use a \.png or \.webp extension/i,
  );
});

test("asset uploads finish before yielding both managed commit paths", async () => {
  const plan = buildQuestionAssetUploadPlan({
    assetFiles: {
      "question-001.png": new Uint8Array([1]),
      "solution-001.webp": new Uint8Array([2]),
    },
    instituteId: "inst-001",
    serverRows,
    workbookRows,
  });
  const calls = [];
  const paths = await uploadQuestionAssetPlan(plan, async (request) => {
    calls.push(request.assetKind);
    return {
      assetKind: request.assetKind,
      cdnPath:
        `inst-001/questions/${request.questionId}/v${request.version}/` +
        `${request.assetKind === "questionImage" ? "question.png" : "solution.webp"}`,
      contentType:
        request.extension === "webp" ? "image/webp" : "image/png",
      previewSignedUrl: "https://cdn.example.test/preview?Expires=1",
      questionId: request.questionId,
      uploaded: true,
      version: request.version,
    };
  });

  assert.deepEqual(calls, ["questionImage", "solutionImage"]);
  assert.deepEqual(paths.get(0), {
    questionImageUrl:
      "inst-001/questions/physics-motion-001-v2/v2/question.png",
    solutionImageUrl:
      "inst-001/questions/physics-motion-001-v2/v2/solution.webp",
  });

  await assert.rejects(
    uploadQuestionAssetPlan(plan.slice(0, 1), async (request) => ({
      assetKind: "solutionImage",
      cdnPath: "wrong",
      contentType: "image/png",
      previewSignedUrl: "https://cdn.example.test/wrong?Expires=1",
      questionId: request.questionId,
      uploaded: true,
      version: request.version,
    })),
    /mismatched authority/i,
  );
});

test("live question upload sends retained archive bytes to authoritative validation before revision-bound package commit", async () => {
  assert.match(managementPageSource, /assetFiles\[fileName\]\s*=\s*await inflateZipEntry\(/);
  assert.match(managementPageSource, /validateQuestionPackageWithApi\(\{\s*contentBase64: await fileToBase64\(selectedUploadFile\)/s);
  assert.match(managementPageSource, /packageAuthority.state !== "validated"/);
  assert.match(managementPageSource, /commitQuestionPackage\(packageAuthority.packageId, \{\s*expectedPackageRevision: packageAuthority.packageRevision,/s);
  assert.doesNotMatch(managementPageSource, /inst-build-125|uploadQuestionAssetPlan\(/);
  assert.ok(managementPageSource.indexOf("await validateQuestionPackageWithApi(") < managementPageSource.indexOf("await commitQuestionPackage("));
  const api = await readFile(join(rootDirectory, "apps/admin/src/features/tests/questionBankApi.ts"), "utf8");
  assert.match(api, /post<unknown, AdminQuestionPackageValidateRequest>\(\s*"\/admin\/questions\/packages\/validate"/s);
  assert.match(api, /post<unknown, AdminQuestionPackageCommitRequest>\(/);
  assert.match(api, /encodeURIComponent\(packageId\)\}\/commit/);
});
