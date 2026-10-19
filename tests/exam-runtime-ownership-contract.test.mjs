import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("../functions/node_modules/typescript");
const root = fileURLToPath(new URL("../", import.meta.url));

test("reserved ownership commands and results remain closed in both toolchains", () => {
  const source = `
    import type {ExamRuntimeEntryRequestV2 as Request,
      ExamRuntimeEntryResultV2 as Result, ExamRuntimeLeaseReceipt,
      ExamRuntimeOwnershipHeaders, ExamRuntimeOwnershipFailure}
      from "../shared/contracts/examRuntimeOwnership.js";
    const launch: Request = {operation: "launch", commandId: "uuid",
      token: "custom-token", nextOwnerProof: "random-proof"};
    const recovery: Request = {operation: "recover", commandId: "uuid",
      nextOwnerProof: "fresh-proof", previous: {generation: 1}};
    const uncertain: Request = {operation: "recover", commandId: "new-uuid",
      nextOwnerProof: "fresh-proof", previous: {pendingCommandId: "prior-uuid"}};
    // @ts-expect-error recovery selectors cannot be mixed
    const mixed: Request = {operation: "recover", commandId: "uuid", nextOwnerProof: "p", previous: {generation: 1, pendingCommandId: "prior"}};
    const renew: Request = {operation: "renew", commandId: "uuid"};
    const release: Request = {operation: "release", commandId: "uuid"};
    // @ts-expect-error no legacy identity-only resume
    const weak: Request = {resume: true};
    // @ts-expect-error recovery needs a prior owner selector
    const missing: Request = {operation: "recover", commandId: "uuid", nextOwnerProof: "fresh"};
    // @ts-expect-error initial launch needs a raw credential
    const noToken: Request = {operation: "launch", commandId: "uuid", nextOwnerProof: "fresh"};
    // @ts-expect-error no forced takeover
    const force: Request = {operation: "launch", commandId: "uuid", token: "t", nextOwnerProof: "p", force: true};
    // @ts-expect-error identity is never browser authority
    const tenant: Request = {operation: "renew", commandId: "uuid", instituteId: "other"};
    // @ts-expect-error client cannot select lease duration
    const ttl: Request = {operation: "renew", commandId: "uuid", durationSeconds: 900};
    const headers: ExamRuntimeOwnershipHeaders = {
      "X-Parabolic-Exam-Owner": "proof", "X-Parabolic-Exam-Generation": "1"};
    // @ts-expect-error generation header is mandatory for protected work
    const incomplete: ExamRuntimeOwnershipHeaders = {"X-Parabolic-Exam-Owner": "proof"};
    declare const result: Result;
    if (result.operation === "launch" || result.operation === "recover") {
      const allowed: true = result.entry.allowed;
      const version: 2 = result.ownership.contractVersion;
      // @ts-expect-error raw proof is never returned
      result.ownership.proof;
    }
    if (result.operation === "release") {
      const closed: true = result.released;
      // @ts-expect-error release cannot return candidate content
      result.entry;
    }
    if (result.operation === "renew") {
      const cadence: 30 = result.ownership.renewAfterSeconds;
      // @ts-expect-error renewal cannot return candidate content
      result.entry;
    }
    declare const receipt: ExamRuntimeLeaseReceipt;
    // @ts-expect-error private hashes cannot leave the server
    receipt.ownerProofHash;
    const conflict: ExamRuntimeOwnershipFailure = {code: "CONFLICT", reason: "owner_busy"};
    // @ts-expect-error contention must not trigger terminal Auth signout
    const terminal: ExamRuntimeOwnershipFailure = {code: "UNAUTHORIZED", reason: "owner_busy"};
  `;
  for (const [moduleResolution, module] of [
    [ts.ModuleResolutionKind.Bundler, ts.ModuleKind.ESNext],
    [ts.ModuleResolutionKind.NodeNext, ts.ModuleKind.NodeNext],
  ]) {
    const file = `${root}tests/__exam_ownership_probe.ts`;
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
});

test("ownership reservation contains no executable statements", () => {
  const declaration = readFileSync(`${root}shared/contracts/examRuntimeOwnership.d.ts`, "utf8");
  const ast = ts.createSourceFile("ownership.d.ts", declaration, ts.ScriptTarget.Latest, true);
  assert.ok(ast.statements.every((node) => ts.isImportDeclaration(node) ||
    ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)));
});
