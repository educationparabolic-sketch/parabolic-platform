import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import test from "node:test";
const require = createRequire(import.meta.url);
const ts = require("../functions/node_modules/typescript");
const source = readFileSync(new URL("../shared/services/studentProfileContract.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
const module = {exports: {}};
new Function("exports", "module", output)(module.exports, module);
const {parseStudentProfile, parseIdentityPhotoState, parseIdentityMedia, parseIdentityLifecycle} = module.exports;
const serverModule = {exports: {}};
new Function("exports", "module", ts.transpileModule(readFileSync(new URL("../functions/src/services/studentIdentityPhotoPolicy.ts", import.meta.url), "utf8"), {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText)(serverModule.exports, serverModule);
const photoId = `photo_${"a".repeat(40)}`;
const photo = {photoId, capturedAt: "2026-10-17T00:00:00.000Z", expiresAt: "2027-01-15T00:00:00.000Z", consentPolicyVersion: "student-identity-photo-v1"};

test("profile adapter accepts server policy and missing assignments, rejecting silent authority defaults", () => {
  const profile = {studentId: "synthetic", version: 1, fullName: "Synthetic Student", email: "synthetic@emulator.test", batch: null, academicYear: null,
    preferences: {sidebarCollapsed: false}, identityPhoto: {status: "not_enrolled", photo: null, mediaAvailable: false}, photoPolicy: serverModule.exports.STUDENT_IDENTITY_PHOTO_POLICY};
  assert.deepEqual(parseStudentProfile(profile), profile);
  for (const hostile of [
    {...profile, fullName: ""}, {...profile, email: null}, {...profile, version: 0},
    {...profile, academicYear: {name: "2026"}}, {...profile, preferences: {sidebarCollapsed: false, role: "admin"}},
    {...profile, photoPolicy: {...profile.photoPolicy, automatedFaceMatching: "verified"}},
    {...profile, livePhotoUrl: "https://invalid.example"},
  ]) assert.throws(() => parseStudentProfile(hostile), /incompatible/);
});

test("browser validators reject contradictory states and legacy/public media authority", () => {
  const state = {status: "pending_review", photo, mediaAvailable: true};
  assert.deepEqual(parseIdentityPhotoState(state), state);
  for (const hostile of [
    {...state, photoUrl: "https://invalid.example/photo"},
    {...state, photo: {...photo, objectPath: "private/path"}},
    {...state, status: "verified", mediaAvailable: false},
    {...state, status: "expired"},
    {...state, photo: {...photo, expiresAt: photo.capturedAt}},
    {status: "withdrawn", photo, mediaAvailable: true},
    {status: "not_enrolled", photo: null, mediaAvailable: true},
  ]) assert.throws(() => parseIdentityPhotoState(hostile), /incompatible/);
});
test("media validates exact requested photo, canonical bounded bytes and closed response", () => {
  const bytes = Buffer.from([255, 216, 255, 1, 255, 217]);
  const media = {photoId, mediaType: "image/jpeg", sizeBytes: bytes.length, contentBase64: bytes.toString("base64")};
  assert.deepEqual(parseIdentityMedia(media, photoId), media);
  const large = Buffer.alloc(1048576); large.set([255, 216, 255]); large.set([255, 217], large.length - 2);
  assert.equal(parseIdentityMedia({...media, sizeBytes: large.length, contentBase64: large.toString("base64")}, photoId).sizeBytes, 1048576);
  for (const hostile of [
    {...media, photoId: `photo_${"b".repeat(40)}`}, {...media, sizeBytes: bytes.length + 1},
    {...media, contentBase64: "a".repeat(1398105)}, {...media, contentBase64: "data:image/jpeg;base64," + media.contentBase64},
    {...media, mediaType: "image/png"}, {...media, downloadUrl: "https://invalid.example"},
    {...media, contentBase64: Buffer.from("not a jpeg").toString("base64"), sizeBytes: 10},
  ]) assert.throws(() => parseIdentityMedia(hostile, photoId), /incompatible/);
});
test("deletion UI cannot accept pending as completed or expose another photo", () => {
  const pending = {photoId, state: "deletion_pending", deletionReason: "consent_withdrawn", deletedAt: null};
  assert.deepEqual(parseIdentityLifecycle(pending, photoId), pending);
  for (const hostile of [
    {...pending, state: "deleted"}, {...pending, deletedAt: photo.capturedAt},
    {...pending, deletionReason: null}, {...pending, bucket: "private"},
  ]) assert.throws(() => parseIdentityLifecycle(hostile, photoId), /incompatible/);
  assert.throws(() => parseIdentityLifecycle(pending, "other"), /incompatible/);
});
