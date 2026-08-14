import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDirectory = fileURLToPath(new URL("../", import.meta.url));

async function readRepositoryFile(path) {
  return readFile(join(rootDirectory, path), "utf8");
}

test("shared Firebase client owns an origin-local Auth session and gates emulator use to loopback", async () => {
  const [clientSource, providerSource, apiClientSource] = await Promise.all([
    readRepositoryFile("shared/services/firebaseClient.ts"),
    readRepositoryFile("shared/services/authProvider.tsx"),
    readRepositoryFile("shared/services/apiClient.ts"),
  ]);

  assert.match(clientSource, /connectAuthEmulator/u);
  assert.match(clientSource, /import\.meta\.env\.VITE_FIREBASE_AUTH_EMULATOR_URL/u);
  assert.match(clientSource, /browserIsLoopback/u);
  assert.match(clientSource, /emulatorIsLoopback/u);
  assert.match(clientSource, /parsedUrl\.protocol !== "http:"/u);
  assert.match(clientSource, /connectAuthEmulator\(auth, parsedUrl\.origin/u);
  assert.match(providerSource, /setPersistence\(auth, browserLocalPersistence\)/u);
  assert.match(apiClientSource, /getFirebaseAuth\(\)\.currentUser/u);
  assert.doesNotMatch(providerSource, /localStorage\.(?:setItem|getItem)\(/u);
  assert.doesNotMatch(clientSource, /document\.cookie|localStorage/u);
});

test("role browser regressions authenticate through the Firebase SDK instead of seeding bearer storage", async () => {
  const paths = [
    "tests/e2e/admin-teacher-access.spec.mjs",
    "tests/e2e/student-vendor-role-guards.spec.mjs",
  ];

  for (const path of paths) {
    const source = await readRepositoryFile(path);
    assert.match(source, /getByLabel\("Email"/u, `${path} must enter the identity in the UI`);
    assert.match(source, /getByLabel\("Password"/u, `${path} must enter the password in the UI`);
    assert.match(source, /accounts:signInWithPassword/u, `${path} must observe real Auth traffic`);
    assert.doesNotMatch(source, /localStorage\.(?:setItem|getItem)\(/u);
    assert.doesNotMatch(source, /parabolic\.crossPortalAuthSession/u);
  }

  for (const path of [
    "scripts/run-admin-teacher-access-e2e.mjs",
    "scripts/run-student-vendor-role-guards-e2e.mjs",
  ]) {
    const source = await readRepositoryFile(path);
    assert.match(
      source,
      /VITE_FIREBASE_AUTH_EMULATOR_URL: "http:\/\/127\.0\.0\.1:9099"/u,
    );
  }
});

test("release builds explicitly exclude the local Auth emulator", async () => {
  const [workflowSource, validatorSource, matrixSource] = await Promise.all([
    readRepositoryFile(".github/workflows/frontend-ci-cd.yml"),
    readRepositoryFile("scripts/frontend-cicd/validate-build-environment.mjs"),
    readRepositoryFile("docs/ENVIRONMENT_VARIABLE_MATRIX.md"),
  ]);

  assert.equal(
    workflowSource.split('VITE_FIREBASE_AUTH_EMULATOR_URL: ""').length - 1,
    2,
  );
  assert.match(
    validatorSource,
    /VITE_FIREBASE_AUTH_EMULATOR_URL is forbidden in release builds/u,
  );
  assert.match(matrixSource, /Admin and Student share one Hosting origin/u);
  assert.match(matrixSource, /Exam and Vendor use\s+their mapped target origins/u);
});
