import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDirectory = fileURLToPath(new URL("../", import.meta.url));
const apiDirectory = join(rootDirectory, "functions/src/api");

const explicitVendorTenantBypasses = new Set([
  "adminAcademicYearArchive.ts",
  "adminGovernanceReports.ts",
  "adminGovernanceSnapshots.ts",
  "adminStudentDataExport.ts",
  "adminStudentSoftDelete.ts",
]);

test("every authenticated institute-scoped API has a fail-closed tenant guard", async () => {
  const fileNames = (await readdir(apiDirectory)).filter((fileName) => fileName.endsWith(".ts"));
  let protectedApiCount = 0;
  let tenantScopedApiCount = 0;

  for (const fileName of fileNames) {
    const source = await readFile(join(apiDirectory, fileName), "utf8");
    if (!source.includes("createAuthenticationMiddleware(")) {
      continue;
    }

    protectedApiCount += 1;
    const isVendorOnly = /allowedRoles:\s*\["vendor"\]/u.test(source);
    if (isVendorOnly) {
      assert.doesNotMatch(
        source,
        /createTenantGuardMiddleware\(/u,
        `${fileName} is an explicit global Vendor API and must not imply an institute scope`,
      );
      continue;
    }

    tenantScopedApiCount += 1;
    const hasTenantGuard = /createTenantGuardMiddleware\(/u.test(source);
    const hasIdentityOnlyTenantScope = fileName === "examStart.ts" &&
      /const identity = request\.context\.identity/u.test(source) &&
      /instituteId:\s*identity\.instituteId/u.test(source) &&
      !/instituteId:\s*body\.instituteId/u.test(source);
    assert.ok(
      hasTenantGuard || hasIdentityOnlyTenantScope,
      `${fileName} must enforce the authenticated institute boundary`,
    );

    const hasVendorRole = /allowedRoles:\s*\[[^\]]*"vendor"/u.test(source);
    const hasExplicitBypass = /allowVendorBypass:\s*true/u.test(source);
    assert.equal(
      hasExplicitBypass,
      explicitVendorTenantBypasses.has(fileName),
      `${fileName} Vendor tenant bypass disposition must be explicit and reviewed`,
    );
    assert.equal(
      hasExplicitBypass,
      hasVendorRole,
      `${fileName} may bypass tenant binding only when Vendor is explicitly authorized`,
    );
  }

  assert.equal(protectedApiCount, 44);
  assert.equal(tenantScopedApiCount, 31);
});

test("Student Exam targets come from verified identity and stored ownership checks", async () => {
  const examApiFiles = ["examStart.ts", "examSessionAnswers.ts", "examSessionSubmit.ts"];

  for (const fileName of examApiFiles) {
    const source = await readFile(join(apiDirectory, fileName), "utf8");
    assert.match(source, /attachStudentId:\s*true/u);
    assert.match(
      source,
      /studentId:\s*(?:request\.context\.identity\?\.studentId|identity\.studentId)/u,
    );
    assert.doesNotMatch(source, /studentId:\s*body\.studentId/u);
    assert.match(
      source,
      /instituteId:\s*(?:request\.context\.identity\?\.instituteId|identity\.instituteId)/u,
    );
  }

  const authSource = await readFile(
    join(rootDirectory, "functions/src/middleware/auth.ts"),
    "utf8",
  );
  assert.match(
    authSource,
    /studentId:\s*role === "student" \? resolveStudentId\(decodedToken, uid\) : null/u,
  );

  const answerBatchSource = await readFile(
    join(rootDirectory, "functions/src/services/answerBatch.ts"),
    "utf8",
  );
  assert.match(answerBatchSource, /storedInstituteId !== instituteId/u);
  assert.match(answerBatchSource, /storedStudentId !== studentId/u);

  const submissionSource = await readFile(
    join(rootDirectory, "functions/src/services/submission.ts"),
    "utf8",
  );
  assert.match(submissionSource, /storedInstituteId !== context\.instituteId/u);
  assert.match(submissionSource, /storedStudentId !== context\.studentId/u);
});

test("staff-selected student IDs are verified inside the authenticated institute subtree", async () => {
  const verificationSources = [
    ["studentDataExport.ts", /studentSnapshot\.exists/u],
    ["studentSoftDelete.ts", /studentSnapshot\.exists/u],
    ["adminStudentOnboardingResend.ts", /studentSnapshot\.exists/u],
    ["interventionTools.ts", /studentSnapshot\.exists/u],
  ];

  for (const [fileName, existenceCheck] of verificationSources) {
    const source = await readFile(
      join(rootDirectory, "functions/src/services", fileName),
      "utf8",
    );
    assert.match(source, /INSTITUTES_COLLECTION/u, `${fileName} must scope through institutes`);
    assert.match(source, /STUDENTS_COLLECTION/u, `${fileName} must scope through students`);
    assert.match(source, existenceCheck, `${fileName} must reject an unknown target student`);
  }
});
