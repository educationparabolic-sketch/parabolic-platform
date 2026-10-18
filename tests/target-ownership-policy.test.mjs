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
  "adminGovernanceTransport.ts",
]);

const sharedVendorBoundaries = new Set([
  "vendorAuditHealthBoundary.ts", "vendorCalibrationBoundary.ts", "vendorIntelligenceReadBoundary.ts",
  "vendorInstitutes.ts", "vendorCommercial.ts", "vendorSupport.ts",
]);
function isReviewedSharedVendorBoundary(fileName, source) {
  if (!/allowedRoles:\s*VENDOR_CAPABILITY_ROLES\[/u.test(source)) return false;
  assert.ok(sharedVendorBoundaries.has(fileName), `${fileName} needs explicit global-boundary review`);
  assert.match(source, /from "\.\.\/policy\/vendorRolePolicy"/u);
  assert.match(source, /from "\.\.\/middleware\/currentVendor"/u);
  assert.match(source, /await assertCurrentVendorIdentity\(request, dependencies,/u);
  assert.doesNotMatch(source, /allowVendorBypass:\s*true/u);
  return true;
}

const studentDelegates = new Map([
  ["studentDashboard.ts", ["dashboard", "getDashboard"]],
  ["studentTests.ts", ["tests", "listTests"]],
  ["studentPerformance.ts", ["performance", "getPerformance"]],
  ["studentInsights.ts", ["insights", "getInsights"]],
]);
function assertStudentBoundary(source) {
  assert.match(source, /createAuthenticationMiddleware\(/u);
  assert.match(source, /attachStudentId:\s*true/u);
  assert.match(source, /createTenantGuardMiddleware\(/u);
  assert.match(source, /allowVendorBypass:\s*false/u);
  assert.match(source, /allowedRoles:\s*\["student"\]/u);
  assert.match(source, /normalizeStudentSummaryQuery\(resource, request\.query\)/u);
  assert.match(source, /read\(getBearerToken\(request\.headers\.authorization\), request\.query\)/u);
}

test("every authenticated institute-scoped API has a fail-closed tenant guard", async () => {
  const fileNames = (await readdir(apiDirectory)).filter((fileName) => fileName.endsWith(".ts"));
  let protectedApiCount = 0;
  let tenantScopedApiCount = 0;
  const seenSharedVendorBoundaries = new Set();
  const seenStudentDelegates = new Set();

  for (const fileName of fileNames) {
    const source = await readFile(join(apiDirectory, fileName), "utf8");
    if (fileName === "studentSummaryHandler.ts") {
      assertStudentBoundary(source);
      continue; // Shared implementation; the four reviewed delegates count as endpoints.
    }
    if (studentDelegates.has(fileName)) {
      const [resource, method] = studentDelegates.get(fileName);
      assert.ok(source.includes(`createStudentSummaryHandler("${resource}", dependencies.${method}, dependencies.verifyIdToken)`));
      assert.match(source, /from "\.\/studentSummaryHandler"/u);
      assert.ok(source.includes(`studentSummaryService.${method}.bind(studentSummaryService)`));
      seenStudentDelegates.add(fileName);
      protectedApiCount++;
      tenantScopedApiCount++;
      continue;
    }
    if (!source.includes("createAuthenticationMiddleware(")) {
      continue;
    }

    protectedApiCount += 1;
    const isSharedVendor = isReviewedSharedVendorBoundary(fileName, source);
    if (isSharedVendor) seenSharedVendorBoundaries.add(fileName);
    const isVendorOnly = /allowedRoles:\s*\["vendor"\]/u.test(source) || isSharedVendor;
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

  assert.deepEqual([...seenSharedVendorBoundaries].sort(), [...sharedVendorBoundaries].sort());
  assert.deepEqual([...seenStudentDelegates].sort(), [...studentDelegates.keys()].sort());
  assert.equal(protectedApiCount, 51);
  assert.equal(tenantScopedApiCount, 39);
  for (const fileName of ["adminStudentDataExport.ts", "adminStudentSoftDelete.ts"]) {
    const source = await readFile(join(apiDirectory, fileName), "utf8");
    assert.match(source, /allowVendorBypass:\s*false/u);
    assert.match(source, /allowedRoles:\s*\["admin"\]/u);
  }
  const governance = await readFile(join(apiDirectory, "adminGovernanceTransport.ts"), "utf8");
  assert.match(governance, /allowedRoles:\s*\["director", "vendor"\]/u);
  assert.match(governance, /Vendor governance requests require targetInstituteId/u);
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


test("shared global Vendor classification rejects removed fresh guards and unreviewed boundaries", async () => {
  const source = await readFile(join(apiDirectory, "vendorAuditHealthBoundary.ts"), "utf8");
  assert.equal(isReviewedSharedVendorBoundary("vendorAuditHealthBoundary.ts", source), true);
  assert.throws(() => isReviewedSharedVendorBoundary("newUnreviewedBoundary.ts", source));
  assert.throws(() => isReviewedSharedVendorBoundary("vendorAuditHealthBoundary.ts", source.replace("await assertCurrentVendorIdentity(", "await removedFreshGuard(")));
  assert.throws(() => isReviewedSharedVendorBoundary("vendorAuditHealthBoundary.ts", source.replace("../policy/vendorRolePolicy", "../policy/unreviewedRoles")));
});


test("reviewed shared Student transport rejects missing tenant, role and closed-query guards", async () => {
  const source = await readFile(join(apiDirectory, "studentSummaryHandler.ts"), "utf8");
  assertStudentBoundary(source);
  for (const guard of ["createTenantGuardMiddleware(", "normalizeStudentSummaryQuery(resource, request.query)",
    "attachStudentId: true", 'allowedRoles: ["student"]']) {
    assert.throws(() => assertStudentBoundary(source.replace(guard, "removedGuard")));
  }
});
