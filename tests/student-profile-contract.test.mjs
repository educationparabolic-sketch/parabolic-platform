import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("../functions/node_modules/typescript");
const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(`${root}${path}`, "utf8");
function compile(source, moduleResolution, module) {
  const file = `${root}tests/__student_profile_contract_probe.ts`;
  const options = {strict: true, noEmit: true, types: [],
    target: ts.ScriptTarget.ES2022, moduleResolution, module};
  const host = ts.createCompilerHost(options);
  const original = host.getSourceFile.bind(host);
  host.getSourceFile = (name, version, onError, fresh) => name === file ?
    ts.createSourceFile(file, source, version, true) : original(name, version, onError, fresh);
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([file], options, host));
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: () => root, getCanonicalFileName: (name) => name, getNewLine: () => "\n",
  }));
}

test("closed profile/photo declarations reject browser authority and false lifecycle claims", () => {
  const source = `
    import type {StudentProfilePreferencesRequest, StudentIdentityPhotoEnrollRequest,
      StudentIdentityPhotoWithdrawRequest, StudentIdentityPhotoLifecycleResult,
      StudentIdentityPhotoState, StudentIdentityPhotoPolicy, StudentProfileResult,
      StudentIdentityPhotoMediaResult, ManagedStudentIdentityPhotoReviewRequest,
      ExamIdentityStatusResult} from "../shared/contracts/studentProfile.js";
    const preferences: StudentProfilePreferencesRequest = {expectedVersion: 1,
      idempotencyKey: "uuid", preferences: {sidebarCollapsed: true}};
    const enrollment: StudentIdentityPhotoEnrollRequest = {expectedVersion: 1,
      expectedPhotoId: null, idempotencyKey: "uuid", contentBase64: "image",
      mediaType: "image/jpeg", consent: {accepted: true,
        policyVersion: "student-identity-photo-v1"}};
    const withdrawal: StudentIdentityPhotoWithdrawRequest = {expectedVersion: 2,
      expectedPhotoId: "photo_opaque", idempotencyKey: "uuid"};
    // @ts-expect-error tenant is verified server identity
    const tenant: StudentIdentityPhotoEnrollRequest = {...enrollment, instituteId: "other"};
    // @ts-expect-error Student cannot self-verify
    const review: StudentIdentityPhotoEnrollRequest = {...enrollment, verificationStatus: "verified"};
    // @ts-expect-error client time cannot become capture authority
    const time: StudentIdentityPhotoEnrollRequest = {...enrollment, capturedAt: "now"};
    // @ts-expect-error no URL-based uploads
    const url: StudentIdentityPhotoEnrollRequest = {...enrollment, photoUrl: "https://example.test"};
    // @ts-expect-error consent must be affirmative
    const consent: StudentIdentityPhotoEnrollRequest = {...enrollment, consent: {accepted: false, policyVersion: "student-identity-photo-v1"}};
    // @ts-expect-error wrong policy cannot enroll
    const version: StudentIdentityPhotoEnrollRequest = {...enrollment, consent: {accepted: true, policyVersion: "old"}};
    // @ts-expect-error no PNG or PDF upload contract
    const media: StudentIdentityPhotoEnrollRequest = {...enrollment, mediaType: "image/png"};
    // @ts-expect-error account name is Admin-owned
    const name: StudentProfilePreferencesRequest = {...preferences, preferences: {sidebarCollapsed: true, fullName: "spoof"}};
    // @ts-expect-error no actor authority in withdrawal
    const actor: StudentIdentityPhotoWithdrawRequest = {...withdrawal, actorId: "other"};
    // @ts-expect-error deleted requires confirmed server deletion time
    const deletion: StudentIdentityPhotoLifecycleResult = {photoId: "photo", state: "deleted", deletionReason: "consent_withdrawn", deletedAt: null};
    // @ts-expect-error withdrawn cannot make media available
    const withdrawn: StudentIdentityPhotoState = {status: "withdrawn", photo: null, mediaAvailable: true};
    declare const profile: StudentProfileResult;
    if (profile.identityPhoto.status === "verified") {
      const id: string = profile.identityPhoto.photo.photoId;
    }
    // @ts-expect-error no raw image in profile
    const rawProfile = profile.identityPhoto.contentBase64;
    declare const image: StudentIdentityPhotoMediaResult;
    // @ts-expect-error private bucket stays server-only
    const bucket = image.bucketName;
    // @ts-expect-error no public or signed download link
    const download = image.url;
    declare const exam: ExamIdentityStatusResult;
    const matching: "unavailable" = exam.automatedFaceMatching;
    // @ts-expect-error no image or photo ID in Exam
    const examPhoto = exam.photoId;
    // @ts-expect-error no consent details in Exam
    const examConsent = exam.consentPolicyVersion;
    declare const policy: StudentIdentityPhotoPolicy;
    const retention: 90 = policy.retentionDays;
    const access: "authenticated_api_only" = policy.mediaAccess;
    // @ts-expect-error replacement-aware review requires photo ID
    const staleReview: ManagedStudentIdentityPhotoReviewRequest = {expectedVersion: 1,
      expectedPhotoCapturedAt: "time", idempotencyKey: "uuid", decision: "verified"};
  `;
  compile(source, ts.ModuleResolutionKind.Bundler, ts.ModuleKind.ESNext);
  compile(source, ts.ModuleResolutionKind.NodeNext, ts.ModuleKind.NodeNext);
});

test("eight secured routes have exact exports and retain declaration provenance", () => {
  const output = ts.transpileModule(read("functions/src/apiRouteManifest.ts"), {
    compilerOptions: {module: ts.ModuleKind.CommonJS},
  }).outputText;
  const module = {exports: {}};
  new Function("exports", "module", output)(module.exports, module);
  const expected = [
    ["ADM-61", "GET", "/admin/students/{studentId}/identity-photo/{photoId}/media"],
    ["STU-07", "GET", "/student/profile"],
    ["STU-08", "PATCH", "/student/profile/preferences"],
    ["STU-09", "POST", "/student/profile/identity-photo"],
    ["STU-10", "POST", "/student/profile/identity-photo/withdrawal"],
    ["STU-11", "GET", "/student/profile/identity-photo/{photoId}/media"],
    ["STU-12", "GET", "/student/profile/identity-photo/{photoId}/status"],
    ["EXM-06", "GET", "/exam/session/{sessionId}/identity-status"],
  ];
  const ids = expected.map(([id]) => id);
  const routes = module.exports.API_ROUTE_MANIFEST.filter((route) => ids.includes(route.id));
  assert.deepEqual(routes.map(({id, method, canonicalPath, declaration, status, functionExport}) =>
    [id, method, canonicalPath, declaration, status, functionExport]),
  expected.map(([id, method, path]) => [id, method, `/api/v1${path}`, "planned", "implemented",
    id === "ADM-61" ? "adminStudentIdentityPhotoMedia" : id === "EXM-06" ? "examSessionIdentityStatus" : "studentProfile"]));
  const counts = module.exports.API_ROUTE_MANIFEST.reduce((acc, route) => {
    acc[route.status] = (acc[route.status] ?? 0) + 1;
    return acc;
  }, {});
  assert.deepEqual(counts, {implemented: 116, intentionally_retired: 5});
  assert.equal(module.exports.BACKEND_HTTP_EXPORT_MANIFEST.length, 64);
  for (const [id, method, path] of expected) {
    assert.ok(read("docs/api_contract.md").includes(`| ${id} | \`${method} /api/v1${path}\``), id);
  }
});

test("policy defines bounded private retention without granting runtime or Exam matching", () => {
  const contract = read("shared/contracts/studentProfile.d.ts");
  assert.doesNotMatch(contract, /^import\s|\[key:\s*string\]|Record<string/mu);
  for (const marker of ['policyVersion: "student-identity-photo-v1"', "maxUploadBytes: 1048576",
    "maxEncodedCharacters: 1398104", "maxDecodedPixels: 2073600", "retentionDays: 90",
    "stagingLifetimeHours: 24", "deletionTargetHours: 24", "cleanupIntervalMinutes: 15",
    "cleanupBatchLimit: 100", "cleanupLeaseSeconds: 300", "rawPhotoInExamResponse: false"]) {
    assert.ok(contract.includes(marker), marker);
  }
  const policy = read("docs/STUDENT_PROFILE_IDENTITY_PHOTO_CONTRACT.md");
  for (const marker of ["privacy exception", "expired/grace license", "generation",
    "Storage is not atomic", "EXIF", "IDENTITY_PHOTOS_BUCKET", "BWM-045", "BWM-052",
    "Secured transport checkpoint"]) {
    assert.ok(policy.includes(marker), marker);
  }
  assert.ok(read("storage.rules").includes("allow read, write: if false;"));
});

test("deployable own-profile capability stays equal to the portable Student/L0 policy", () => {
  function load(path) {
    const output = ts.transpileModule(read(path), {
      compilerOptions: {module: ts.ModuleKind.CommonJS},
    }).outputText;
    const module = {exports: {}};
    new Function("exports", "module", output)(module.exports, module);
    return module.exports;
  }
  const shared = load("shared/contracts/capabilityPolicy.ts").CAPABILITY_MATRIX["student.profile.manage_own"];
  const deployed = load("functions/src/policy/studentRolePolicy.ts").STUDENT_PROFILE_CAPABILITY;
  assert.deepEqual(deployed, shared);
  assert.deepEqual(deployed, {allowedRoles: ["student"], minimumLicenseLayer: "L0", requiredFeatureFlags: []});
});


test("photo cleanup has one bounded deadline index and an explicitly registered schedule", () => {
  const index = JSON.parse(read("firestore.indexes.json"));
  const override = index.fieldOverrides.filter(value => value.collectionGroup === "identityPhotos");
  assert.deepEqual(override, [{collectionGroup: "identityPhotos", fieldPath: "nextCleanupAt",
    indexes: [{order: "ASCENDING", queryScope: "COLLECTION_GROUP"}]}]);
  const trigger = read("functions/src/triggers/studentIdentityPhotoCleanup.ts");
  assert.ok(trigger.includes('schedule("every 15 minutes")'));
  assert.ok(trigger.includes('.timeZone("UTC")'));
  assert.ok(trigger.includes('maxInstances: 1'));
  assert.ok(read("functions/src/index.ts").includes('export {studentIdentityPhotoCleanupEvery15Minutes}'));
  const service = read("functions/src/services/studentIdentityPhotoLifecycle.ts");
  for (const marker of ['.collectionGroup("identityPhotos")', '.limit(POLICY.cleanupBatchLimit)',
    'withOwnStudentPrivacy', 'this.objects.closeUpload']) assert.ok(service.includes(marker));
  assert.doesNotMatch(service, /getFiles\(|deleteFiles\(/u);
});
