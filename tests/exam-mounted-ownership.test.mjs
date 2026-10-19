import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createRequire} from "node:module";
import test from "node:test";
const require = createRequire(import.meta.url);
const ts = require("../functions/node_modules/typescript");
const source = await readFile(new URL("../apps/exam/src/ownershipState.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022}}).outputText;
const {readOwnerRecord, recoverySource, readLease, leaseDeadline} = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const proof = Buffer.alloc(32, 1).toString("base64url"), scopeHash = "a".repeat(64);
const commandId = "01234567-89ab-4cde-8123-0123456789ab";
test("only bounded exact-scope token-free ownership records can be adopted", () => {
  const record = {scopeHash, current: {proof, generation: 3}, pending: {proof, commandId}};
  assert.deepEqual(readOwnerRecord(JSON.stringify(record), scopeHash), record);
  for (const invalid of [{...record, token: "raw-token"}, {...record, current: {...record.current, generation: 0}},
    {...record, pending: {...record.pending, commandId: "wrong"}}, {...record, current: {...record.current, proof: "x".repeat(43)}},
    {...record, current: {...record.current, secret: "unknown"}}]) assert.equal(readOwnerRecord(JSON.stringify(invalid), scopeHash), null);
  assert.equal(readOwnerRecord(JSON.stringify(record), "b".repeat(64)), null);
  assert.equal(readOwnerRecord("{".repeat(2000), scopeHash), null);
  assert.deepEqual(recoverySource(record), {proof, previous: {pendingCommandId: commandId}});
  assert.deepEqual(recoverySource({scopeHash, current: record.current}), {proof, previous: {generation: 3}});
  assert.throws(() => recoverySource({scopeHash}));
});
test("lease receipts are closed, finite, canonical and bounded by server time, with conservative monotonic deadlines", () => {
  const receipt = {contractVersion: 2, generation: 1, renewAfterSeconds: 30,
    serverTime: "2026-10-18T00:00:00.000Z", expiresAt: "2026-10-18T00:01:30.000Z"};
  assert.deepEqual(readLease(receipt), receipt);
  assert.equal(leaseDeadline(receipt, 1000), 91000);
  for (const bad of [{...receipt, generation: Number.MAX_SAFE_INTEGER + 1}, {...receipt, expiresAt: receipt.serverTime},
    {...receipt, expiresAt: "2026-10-18T00:01:31.000Z"}, {...receipt, renewAfterSeconds: 90}, {...receipt, proof}]) assert.throws(() => readLease(bad));
});
