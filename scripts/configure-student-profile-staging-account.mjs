import assert from "node:assert/strict";
import {readFileSync, writeFileSync, mkdirSync, realpathSync} from "node:fs";
import {createRequire} from "node:module";
import {execFileSync} from "node:child_process";
import {dirname, resolve} from "node:path";

const require = createRequire(import.meta.url);
const cliPath = realpathSync(execFileSync("which", ["firebase"], {encoding: "utf8"}).trim());
const auth = require(resolve(dirname(cliPath), "../auth.js"));
const project = "parabolic-dev";
const instituteId = "bwm042-preview-test";
const mode = process.argv[2] ?? "--inspect";
assert.ok(["--inspect", "--apply"].includes(mode));
const credentials = readFileSync("docs/LOCAL_TEST_CREDENTIALS.md", "utf8");
assert.match(credentials, /`parabolic-dev`/);
const email = [...credentials.matchAll(/`([^`\s]+@[^`\s]+)`/g)].map((match) => match[1]).find((value) => value.startsWith("student."));
assert.ok(email?.endsWith("@parabolic.local"), "Only the documented synthetic Student account is eligible.");
const preview = JSON.parse(readFileSync("test-results/bwm042-preview/preview.json", "utf8"));
assert.equal(preview.projectId, project);
assert.ok(Date.parse(preview.expiresAt) > Date.now(), "Approved preview has expired.");
console.log(JSON.stringify({project, target: "portal", mode, institute: instituteId, scope: "existing synthetic Student Auth and isolated test institute/license/Student records"}));
const account = auth.getGlobalDefaultAccount();
assert.ok(account?.tokens?.refresh_token, "Existing authenticated Firebase CLI session required.");
const token = await auth.getAccessToken(account.tokens.refresh_token, ["https://www.googleapis.com/auth/cloud-platform", "https://www.googleapis.com/auth/firebase", "https://www.googleapis.com/auth/userinfo.email"]);
async function request(url, method = "GET", body) {
  const response = await fetch(url, {method, headers: {authorization: `Bearer ${token.access_token}`, "content-type": "application/json"},
    ...(body ? {body: JSON.stringify(body)} : {}), signal: AbortSignal.timeout(60_000)});
  let result;
  try {result = await response.json();} catch {throw new Error(`Staging ${method} returned non-JSON HTTP ${response.status}`);}
  if (response.status === 404 && method === "GET") return null;
  if (!response.ok) throw new Error(`Staging ${method} failed: HTTP ${response.status}, code ${result.error?.status ?? result.error?.code ?? "unknown"}.`);
  return result;
}
const authRoot = `https://identitytoolkit.googleapis.com/v1/projects/${project}`;
const users = await request(`${authRoot}/accounts:lookup`, "POST", {email: [email]});
assert.equal(users.users?.length, 1, "Exactly one existing test identity required.");
const user = users.users[0];
assert.equal(user.email, email); assert.notEqual(user.disabled, true);
const previousClaims = user.customAttributes ? JSON.parse(user.customAttributes) : {};
assert.ok(!previousClaims.role || previousClaims.role === "student", "Refuse to change a different existing role.");
assert.ok(!previousClaims.instituteId || previousClaims.instituteId === instituteId, "Refuse to reassign an existing institute association.");
assert.notEqual(previousClaims.isVendor, true);
const uid = user.localId;
assert.match(uid, /^[A-Za-z0-9_-]{1,128}$/);
const documents = `projects/${project}/databases/(default)/documents`;
const firestoreRoot = `https://firestore.googleapis.com/v1/${documents}`;
const paths = [`institutes/${instituteId}`, `institutes/${instituteId}/license/current`, `institutes/${instituteId}/students/${uid}`];
const existing = await Promise.all(paths.map((path) => request(`${firestoreRoot}/${path}`)));
const flagNames = ["adaptivePhase", "controlledMode", "governanceAccess", "hardMode", "riskOverview"];
const flags = Object.fromEntries(flagNames.map((key) => [key, false]));
const licenseVersion = "bwm042-preview-v1";
const claims = {...previousClaims, role: "student", studentId: uid, instituteId, authorizationVersion: 1,
  licenseLayer: "L0", licenseVersion, licenseState: "active", expiryDate: preview.expiresAt, featureFlags: flags, isSuspended: false};
const now = new Date().toISOString();
const owner = "bwm042-authorized-staging-bootstrap";
const records = [
  {status: "active", authorizationVersion: 1, licenseVersion, stagingBootstrapOwner: owner, createdAt: now,
    profile: {academicYearFormat: "YYYY-YY", contactEmail: "staging-test@example.invalid", contactPhone: "0000000000", defaultExamType: "Synthetic", instituteName: "BWM-042 isolated staging test institute", logoReference: "none", timeZone: "Asia/Kolkata"},
    securitySettings: {allowMultipleAdminSessions: false, forceLogoutOnPasswordChange: true, sessionTimeoutDuration: 30}},
  {currentLayer: "L0", licenseVersion, licenseState: "active", featureFlags: flags, activeStudentLimit: 1, concurrentSessionLimit: 1, expiryDate: preview.expiresAt, gracePeriodEndsAt: null, stagingBootstrapOwner: owner},
  {studentId: uid, fullName: "Staging Test Student", email, status: "active", version: 1, profilePreferences: {sidebarCollapsed: false}, stagingBootstrapOwner: owner, createdAt: now},
];
function encode(value) {
  if (value === null) return {nullValue: null};
  if (typeof value === "string") return {stringValue: value};
  if (typeof value === "boolean") return {booleanValue: value};
  if (Number.isSafeInteger(value)) return {integerValue: String(value)};
  assert.equal(typeof value, "object");
  return {mapValue: {fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)]))}};
}
if (existing.some(Boolean)) {
  assert.ok(existing.every(Boolean), "Partial preexisting setup requires inspection; refuse to overwrite.");
  for (const doc of existing) assert.equal(doc.fields.stagingBootstrapOwner?.stringValue, owner, "Refuse to overwrite unrelated records.");
  assert.equal(existing[0].fields.licenseVersion?.stringValue, licenseVersion);
  assert.equal(existing[1].fields.expiryDate?.stringValue, preview.expiresAt);
  assert.equal(existing[2].fields.studentId?.stringValue, uid);
  assert.equal(existing[0].fields.status?.stringValue, "active");
  assert.equal(existing[0].fields.authorizationVersion?.integerValue, "1");
  assert.equal(existing[1].fields.currentLayer?.stringValue, "L0");
  assert.equal(existing[1].fields.licenseVersion?.stringValue, licenseVersion);
  assert.equal(existing[1].fields.licenseState?.stringValue, "active");
  for (const key of flagNames) assert.equal(existing[1].fields.featureFlags?.mapValue?.fields[key]?.booleanValue, false);
  assert.equal(existing[2].fields.email?.stringValue, email);
  assert.equal(existing[2].fields.status?.stringValue, "active");
  assert.ok(Number(existing[2].fields.version?.integerValue) >= 1);
  if (previousClaims.role) {
    assert.equal(previousClaims.authorizationVersion, 1);
    assert.equal(previousClaims.licenseVersion, licenseVersion);
    assert.equal(previousClaims.licenseLayer, "L0");
    assert.equal(previousClaims.licenseState, "active");
    assert.equal(previousClaims.studentId, uid);
    assert.equal(previousClaims.expiryDate, preview.expiresAt);
    assert.deepEqual(previousClaims.featureFlags, flags);
  }
}
console.log(JSON.stringify({accountExists: true, accountEnabled: true, currentStudentRole: previousClaims.role === "student", currentInstituteBound: previousClaims.instituteId === instituteId,
  isolatedRecordsExist: existing.map(Boolean), proposedLayer: "L0", proposedRecordCount: existing.every(Boolean) ? 0 : 3, expiry: preview.expiresAt, applyAuthorizedByUserRequired: true}));
if (mode === "--apply") {
  mkdirSync("test-results/bwm042-preview", {recursive: true});
  const before = "test-results/bwm042-preview/account-before.private.json";
  try {writeFileSync(before, JSON.stringify({project, uid, previousClaims, paths, existing}, null, 2), {mode: 0o600, flag: "wx"});} catch (error) {if (error.code !== "EEXIST") throw error;}
  if (!existing.every(Boolean)) {
    await request(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents:commit`, "POST", {writes: records.map((record, index) => ({update: {name: `${documents}/${paths[index]}`, fields: encode(record).mapValue.fields}, currentDocument: {exists: false}}))});
  }
  await request(`${authRoot}/accounts:update`, "POST", {localId: uid, customAttributes: JSON.stringify(claims)});
  const refreshed = await request(`${authRoot}/accounts:lookup`, "POST", {localId: [uid]});
  assert.deepEqual(JSON.parse(refreshed.users[0].customAttributes), claims);
  const saved = await Promise.all(paths.map((path) => request(`${firestoreRoot}/${path}`)));
  assert.ok(saved.every(Boolean));
  const result = {project, instituteId, accountUpdated: true, role: "student", layer: "L0", records: 3, expiresAt: preview.expiresAt, verifiedCurrentClaims: true, verifiedPersistedRecords: true};
  writeFileSync("test-results/bwm042-preview/account-setup.json", JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result));
}
