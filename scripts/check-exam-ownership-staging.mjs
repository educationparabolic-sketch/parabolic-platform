import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFileSync, mkdirSync, writeFileSync} from "node:fs";

// Run only after explicit approval for this project and the existing test identity.
assert.equal(process.env.BWM044_APPROVED_STAGING_PREFLIGHT, "parabolic-dev",
  "Explicit parabolic-dev staging preflight approval is required.");
const args = process.argv.slice(2);
assert.ok(args.length === 4 || args.length === 6, "Supply --portal-origin, --credentials-file and optional --api-base-url.");
const values = new Map();
for (let i = 0; i < args.length; i += 2) {
  assert.ok(["--portal-origin", "--credentials-file", "--api-base-url"].includes(args[i]) && !values.has(args[i]));
  values.set(args[i], args[i + 1]);
}
const raw = values.get("--portal-origin");
const portal = new URL(raw);
assert.equal(raw, portal.origin);
assert.equal(portal.protocol, "https:");
assert.equal(portal.port, "");
assert.match(portal.hostname, /^parabolic-dev(?:--[a-z0-9-]+)?\.web\.app$/);
const apiBase = values.get("--api-base-url") ?? portal.origin;
assert.ok(apiBase === portal.origin || apiBase === "https://us-central1-parabolic-dev.cloudfunctions.net/apiV1",
  "Only the explicit staging API function or selected staging Portal is allowed.");
const config = readFileSync("apps/student/.env.local", "utf8");
assert.match(config, /^VITE_FIREBASE_PROJECT_ID=parabolic-dev\s*$/m);
const apiKey = config.match(/^VITE_FIREBASE_API_KEY=(.+)$/m)?.[1].trim().replace(/^['"]|['"]$/g, "");
assert.match(apiKey, /^AIza[A-Za-z0-9_-]{20,}$/);
let credentialText = readFileSync(values.get("--credentials-file"), "utf8");
let email, password;
try {({email, password} = JSON.parse(credentialText));}
catch {
  password = credentialText.match(/Temporary test password[^]*?`([^`]+)`/i)?.[1];
  email = [...credentialText.matchAll(/`([^`\s]+@[^`\s]+)`/g)].map(match => match[1]).find(value => value.startsWith("student."));
}
assert.ok(email && password, "An explicitly approved existing staging Student credential is required.");
let idToken;
const evidence = {project: "parabolic-dev", origin: portal.origin, apiBase, hostingQualification: false,
  checkedAt: new Date().toISOString(), accountChanges: false, applicationDataWrites: false,
  deployment: false, limitation: "Protocol-presence preflight only; full deployed ownership acceptance is not established."};
try {
  const signIn = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`, {
    method: "POST", headers: {"content-type": "application/json"},
    body: JSON.stringify({email, password, returnSecureToken: true}), signal: AbortSignal.timeout(30000),
  });
  evidence.signInStatus = signIn.status;
  assert.equal(signIn.status, 200, "Existing approved staging Student could not authenticate.");
  idToken = (await signIn.json()).idToken;
  const claims = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString());
  assert.ok(claims.aud === "parabolic-dev" && claims.role === "student" && typeof claims.instituteId === "string",
    "Approved identity must have current Student/tenant claims in parabolic-dev; no privilege change is allowed.");
  const tests = await fetch(`${apiBase}/api/v1/student/tests?scope=current&pageSize=1`, {
    headers: {authorization: `Bearer ${idToken}`}, signal: AbortSignal.timeout(30000),
  });
  evidence.studentReaderStatus = tests.status;
  const testsBody = await tests.json();
  evidence.readerEnvelopeCode = testsBody.code ?? testsBody.error?.code ?? null;
  evidence.readerJson = typeof testsBody === "object";
  evidence.studentReaderV2 = tests.status === 200 && testsBody.data?.contractVersion === 2 &&
    testsBody.data?.scope?.kind === "current" && Array.isArray(testsBody.data?.page?.items);
  assert.ok(evidence.studentReaderV2, "Current staging Student reader/authority is unqualified. Stop without account or backend changes.");
  // Both v1 and v2 must deny this non-existent session with no owner proof.
  // v2's closed parser/header validation returns its specific safe reason before
  // controller/session access. Never start, recover, renew or release a real run.
  const response = await fetch(`${apiBase}/api/v1/exam/session/bwm044-preflight-no-session/entry`, {
    method: "POST", headers: {"content-type": "application/json", authorization: `Bearer ${idToken}`},
    body: JSON.stringify({operation: "renew", commandId: randomUUID()}), signal: AbortSignal.timeout(30000),
  });
  const body = await response.json();
  evidence.probeStatus = response.status;
  evidence.noStore = /no-store/i.test(response.headers.get("cache-control") ?? "");
  evidence.ownershipParserV2 = response.status === 400 && body.error?.details?.reason === "invalid_ownership_request";
  assert.ok(evidence.noStore && evidence.ownershipParserV2,
    "Deployed ownership v2 is absent or unqualified. Stop; do not deploy mixed frontend/backend versions.");
  console.log("Staging ownership parser preflight PASS; full public acceptance remains required. No deployment or application-data/account change.");
} finally {
  idToken = null; email = null; password = null; credentialText = null;
  mkdirSync("test-results/bwm044-closeout", {recursive: true});
  writeFileSync("test-results/bwm044-closeout/staging-preflight.json", JSON.stringify(evidence, null, 2) + "\n");
}
