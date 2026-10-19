/* eslint-disable max-len */
import {createHash, timingSafeEqual} from "node:crypto";
import {Timestamp} from "firebase-admin/firestore";
import type {ExamRuntimeEntryRequestV2, ExamRuntimeLeaseReceipt, ExamRuntimeOwnershipFailure} from "../../../shared/contracts/examRuntimeOwnership";
export const INTERNAL_SUBMISSION_AUTHORITY = Symbol("verified-internal-submission");
export interface RuntimeOwnerCredentials {
    studentUid: string;
    launchNonce: string;
    proof: string;
    generation: number;
}
export interface RuntimeIdentity {
    instituteId: string;
    yearId: string;
    runId: string;
    sessionId: string;
    studentId: string;
    studentUid: string;
    launchNonce: string;
}
export interface RuntimeScopedContext {
    instituteId: string;
    yearId: string;
    runId: string;
    sessionId: string;
    studentId: string;
    runtimeOwner?: RuntimeOwnerCredentials;
}
export class RuntimeOwnershipError extends Error {
  constructor(public readonly code: ExamRuntimeOwnershipFailure["code"], public readonly reason: ExamRuntimeOwnershipFailure["reason"]) {
    super("Exam runtime ownership was denied.");
    this.name = "RuntimeOwnershipError";
  }
}
const deny = (code: ExamRuntimeOwnershipFailure["code"], reason: ExamRuntimeOwnershipFailure["reason"]): never => {
  throw new RuntimeOwnershipError(code, reason);
};
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const same = (a: unknown, b: string): boolean => typeof a === "string" && /^[a-f0-9]{64}$/u.test(a) && timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
const uuid = (v: unknown): string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(v) ? v : deny("VALIDATION_ERROR", "invalid_ownership_request");
export const ownerProof = (v: unknown): string => typeof v === "string" && /^[A-Za-z0-9_-]{43}$/u.test(v) && Buffer.from(v, "base64url").toString("base64url") === v ? v : deny("VALIDATION_ERROR", "invalid_ownership_request");
export const ownerGeneration = (v: unknown): number => Number.isSafeInteger(v) && Number(v) > 0 ? Number(v) : deny("VALIDATION_ERROR", "invalid_ownership_request");
const keys = (v: Record<string, unknown>, expected: string[]) => {
  if (Object.keys(v).length !== expected.length || expected.some((k) => !Object.prototype.hasOwnProperty.call(v, k))) {
    deny("VALIDATION_ERROR", "invalid_ownership_request");
  }
};
export function parseRuntimeCommand(value: unknown): ExamRuntimeEntryRequestV2 {
  if (!record(value)) {
    return deny("VALIDATION_ERROR", "invalid_ownership_request");
  }
  uuid(value.commandId);
  switch (value.operation) {
  case "launch":
    keys(value, ["operation", "commandId", "token", "nextOwnerProof"]);
    ownerProof(value.nextOwnerProof);
    if (typeof value.token !== "string" || !value.token || value.token.length > 8192 || value.token.trim() !== value.token) {
      return deny("VALIDATION_ERROR", "invalid_ownership_request");
    }
    break;
  case "recover":
    keys(value, ["operation", "commandId", "nextOwnerProof", "previous"]);
    ownerProof(value.nextOwnerProof);
    if (!record(value.previous)) {
      return deny("VALIDATION_ERROR", "invalid_ownership_request");
    }
    if (Object.prototype.hasOwnProperty.call(value.previous, "generation")) {
      keys(value.previous, ["generation"]);
      ownerGeneration(value.previous.generation);
    } else {
      keys(value.previous, ["pendingCommandId"]);
      uuid(value.previous.pendingCommandId);
    }
    break;
  case "renew":
  case "release":
    keys(value, ["operation", "commandId"]);
    break;
  default: return deny("VALIDATION_ERROR", "invalid_ownership_request");
  }
  return value as unknown as ExamRuntimeEntryRequestV2;
}
export function runtimeHeaders(request: {
    headers: Record<string, unknown>;
    rawHeaders?: string[];
}, recover = false): {
    proof: string;
    generation: number;
} {
  for (const name of ["x-parabolic-exam-owner", "x-parabolic-exam-generation"]) {
    if ((request.rawHeaders?.filter((v, i) => i % 2 === 0 && v.toLowerCase() === name).length ?? 0) > 1) {
      return deny("VALIDATION_ERROR", "invalid_ownership_request");
    }
  }
  const proof = ownerProof(request.headers["x-parabolic-exam-owner"]);
  const raw = request.headers["x-parabolic-exam-generation"];
  if (recover && raw === undefined) {
    return {proof, generation: 0};
  }
  if (typeof raw !== "string" || !/^[1-9][0-9]*$/u.test(raw)) {
    return deny("VALIDATION_ERROR", "invalid_ownership_request");
  }
  return {proof, generation: ownerGeneration(Number(raw))};
}
// Reject duplicate JSON keys before Express loses that information.
export function assertUniqueCommandJson(raw: Buffer | undefined): void {
  if (!raw) {
    return;
  }
  if (raw.length > 16384) {
    return deny("VALIDATION_ERROR", "invalid_ownership_request");
  }
  try {
    JSON.parse(raw.toString("utf8"));
  } catch {
    return deny("VALIDATION_ERROR", "invalid_ownership_request");
  }
  const stack: {
        object: boolean;
        key: boolean;
        seen: Set<string>;
    }[] = [];
  for (const token of raw.toString("utf8").match(/"(?:\\.|[^"\\])*"|[{}[\]:,]|[^\s{}[\]:,]+/gu) ?? []) {
    if (token === "{" || token === "[") {
      stack.push({object: token === "{", key: token === "{", seen: new Set()});
    } else if (token === "}" || token === "]") {
      stack.pop();
    } else {
      const top = stack[stack.length - 1];
      if (token === "," && top?.object) {
        top.key = true;
      } else if (top?.object && top.key && token.startsWith("\"")) {
        const name = JSON.parse(token) as string;
        if (top.seen.has(name)) {
          return deny("VALIDATION_ERROR", "invalid_ownership_request");
        }
        top.seen.add(name);
        top.key = false;
      }
    }
  }
}
export const entryBinding = (i: RuntimeIdentity): string => hash(JSON.stringify([i.studentUid, i.instituteId, i.yearId, i.runId, i.sessionId, i.launchNonce]));
const proofHash = (s: string) => hash(`exam-owner-v2:${ownerProof(s)}`);
export interface RuntimeOwnershipRecord {
    generation: number;
    state: "held" | "released" | "closed";
    entryBindingHash: string;
    ownerProofHash: string;
    acquiredAt: Timestamp;
    expiresAt: Timestamp;
    updatedAt: Timestamp;
    lastCommand: {
        idHash: string;
        fingerprint: string;
        operation: string;
        generation: number;
        expiresAt: Timestamp;
        serverTime: Timestamp;
    };
}
export function assertRuntimeVersion(data: Record<string, unknown>): void {
  if (data.runtimeOwnershipVersion !== 2) {
    deny("SESSION_LOCKED", "ownership_upgrade_required");
  }
}
export function storedOwnership(data: Record<string, unknown>): RuntimeOwnershipRecord | null {
  assertRuntimeVersion(data);
  if (data.runtimeOwnership === undefined) {
    return null;
  }
  const v = data.runtimeOwnership;
  if (!record(v) || !Number.isSafeInteger(v.generation) || Number(v.generation) < 1 ||
        !["held", "released", "closed"].includes(String(v.state)) ||
        typeof v.ownerProofHash !== "string" || !/^[a-f0-9]{64}$/u.test(v.ownerProofHash) ||
        typeof v.entryBindingHash !== "string" || !/^[a-f0-9]{64}$/u.test(v.entryBindingHash) ||
        !(v.acquiredAt instanceof Timestamp) || !(v.updatedAt instanceof Timestamp) || !(v.expiresAt instanceof Timestamp) ||
        !record(v.lastCommand) || typeof v.lastCommand.idHash !== "string" || !/^[a-f0-9]{64}$/u.test(v.lastCommand.idHash) ||
        typeof v.lastCommand.fingerprint !== "string" || !/^[a-f0-9]{64}$/u.test(v.lastCommand.fingerprint) ||
        !["launch", "recover", "renew", "release"].includes(String(v.lastCommand.operation)) ||
        v.lastCommand.generation !== v.generation || !(v.lastCommand.expiresAt instanceof Timestamp) || !(v.lastCommand.serverTime instanceof Timestamp)) {
    return deny("SESSION_LOCKED", "ownership_upgrade_required");
  }
  return v as unknown as RuntimeOwnershipRecord;
}
function assertIdentity(data: Record<string, unknown>, identity: RuntimeIdentity): void {
  if (["instituteId", "yearId", "runId", "sessionId", "studentId", "studentUid"].some((key) => data[key] !== identity[key as keyof RuntimeIdentity]) || !identity.launchNonce) {
    deny("UNAUTHORIZED", "invalid_owner");
  }
}
function consumed(data: Record<string, unknown>, identity: RuntimeIdentity): void {
  assertIdentity(data, identity);
  if (!Array.isArray(data.identityStatusEntryBindings) || !data.identityStatusEntryBindings.includes(entryBinding(identity))) {
    deny("UNAUTHORIZED", "entry_not_consumed");
  }
}
export function assertRuntimeOwner(data: Record<string, unknown>, context: RuntimeScopedContext, now = Date.now(), allowClosedReplay = false): RuntimeOwnershipRecord {
  const owner = storedOwnership(data);
  if (!context.runtimeOwner) {
    return deny("UNAUTHORIZED", "invalid_owner");
  }
  const identity = {...context, studentUid: context.runtimeOwner.studentUid, launchNonce: context.runtimeOwner.launchNonce};
  consumed(data, identity);
  const generation = ownerGeneration(context.runtimeOwner.generation);
  if (!owner || owner.generation !== generation || !same(owner.entryBindingHash, entryBinding(identity))) {
    return deny("CONFLICT", "ownership_lost");
  }
  if (!same(owner.ownerProofHash, proofHash(context.runtimeOwner.proof))) {
    return deny("UNAUTHORIZED", "invalid_owner");
  }
  if (data.status === "submitted" || data.status === "terminated") {
    if (allowClosedReplay && data.status === "submitted" && owner.state === "closed") {
      return owner;
    }
    return deny("SESSION_LOCKED", "session_closed");
  }
  if (owner.state !== "held" || owner.expiresAt.toMillis() <= now) {
    return deny("CONFLICT", "ownership_lost");
  }
  return owner;
}
export function closeRuntimeOwnership(data: Record<string, unknown>, now: number): Record<string, unknown> {
  const owner = data.runtimeOwnership;
  return record(owner) ? {runtimeOwnership: {...owner, state: "closed", expiresAt: Timestamp.fromMillis(now), updatedAt: Timestamp.fromMillis(now)}} : {};
}
export function planRuntimeCommand(data: Record<string, unknown>, identity: RuntimeIdentity, raw: ExamRuntimeEntryRequestV2, supplied: {
    proof?: string;
    generation?: number;
}, now: number): {
    owner: RuntimeOwnershipRecord;
    receipt: ExamRuntimeLeaseReceipt;
    replayed: boolean;
} {
  const command = parseRuntimeCommand(raw);
  const current = storedOwnership(data);
  for (const key of ["launchCredentialHashes", "consumedLaunchCredentialHashes", "identityStatusEntryBindings"]) {
    const values = data[key];
    if (values !== undefined && (!Array.isArray(values) || values.length > 5 || new Set(values).size !== values.length || values.some((v) => typeof v !== "string" || !/^[a-f0-9]{64}$/u.test(v)))) {
      return deny("SESSION_LOCKED", "ownership_upgrade_required");
    }
  }
  assertIdentity(data, identity);
  if (!["created", "started", "active", "expired"].includes(String(data.status))) {
    return deny("SESSION_LOCKED", "session_closed");
  }
  if (command.operation !== "launch") {
    consumed(data, identity);
  }
  const binding = entryBinding(identity);
  const nextHash = command.operation === "launch" || command.operation === "recover" ? proofHash(command.nextOwnerProof) : proofHash(supplied.proof ?? "");
  const fingerprint = hash(`exam-command-v2:${JSON.stringify([command.operation, binding,
    command.operation === "launch" ? hash(command.token) : null,
    command.operation === "recover" ? command.previous : null,
    supplied.proof ? proofHash(supplied.proof) : null, supplied.generation ?? null, nextHash])}`);
  const idHash = hash(command.commandId);
  let owner: RuntimeOwnershipRecord;
  let replayed = false;
  if (current && same(current.lastCommand.idHash, idHash)) {
    if (!same(current.lastCommand.fingerprint, fingerprint)) {
      return deny("CONFLICT", "ownership_lost");
    }
    consumed(data, identity);
    if (!same(current.entryBindingHash, binding) || !same(current.ownerProofHash, nextHash) ||
            (command.operation !== "release" && (current.state !== "held" || current.expiresAt.toMillis() <= now))) {
      return deny("CONFLICT", "ownership_lost");
    }
    owner = current;
    replayed = true;
  } else {
    if (command.operation === "launch") {
      const tokenHash = hash(command.token);
      if (Array.isArray(data.consumedLaunchCredentialHashes) && data.consumedLaunchCredentialHashes.includes(tokenHash)) {
        return deny("UNAUTHORIZED", "entry_not_consumed");
      }
      if (!Array.isArray(data.launchCredentialHashes) || !data.launchCredentialHashes.includes(tokenHash)) {
        return deny("UNAUTHORIZED", "entry_not_consumed");
      }
      if (current?.state === "held" && current.expiresAt.toMillis() > now) {
        return deny("CONFLICT", "owner_busy");
      }
    } else {
      consumed(data, identity);
      if (!current || !same(current.entryBindingHash, binding) || current.state !== "held") {
        return deny("CONFLICT", "ownership_lost");
      }
      if (command.operation === "recover") {
        if ((command.previous.generation !== undefined && current.generation !== command.previous.generation) ||
                    (command.previous.pendingCommandId !== undefined &&
                        (!["launch", "recover"].includes(current.lastCommand.operation) || !same(current.lastCommand.idHash, hash(command.previous.pendingCommandId))))) {
          return deny("CONFLICT", "ownership_lost");
        }
        if (same(current.ownerProofHash, nextHash)) {
          return deny("VALIDATION_ERROR", "invalid_ownership_request");
        }
      } else if (current.generation !== supplied.generation ||
          (command.operation === "renew" && current.expiresAt.toMillis() <= now)) {
        return deny("CONFLICT", "ownership_lost");
      }
      if (!same(current.ownerProofHash, proofHash(supplied.proof ?? ""))) {
        return deny("UNAUTHORIZED", "invalid_owner");
      }
    }
    const acquire = command.operation === "launch" || command.operation === "recover";
    const generation = acquire ? ownerGeneration((current?.generation ?? 0) + 1) : ownerGeneration(current?.generation);
    const expiresAt = Timestamp.fromMillis(command.operation === "release" ? now : now + 90000);
    owner = {generation, state: command.operation === "release" ? "released" : "held", entryBindingHash: binding, ownerProofHash: nextHash,
      acquiredAt: acquire ? Timestamp.fromMillis(now) : (current as RuntimeOwnershipRecord).acquiredAt,
      expiresAt, updatedAt: Timestamp.fromMillis(now), lastCommand: {idHash, fingerprint, operation: command.operation, generation, expiresAt, serverTime: Timestamp.fromMillis(now)}};
  }
  return {owner, replayed, receipt: {contractVersion: 2, generation: owner.generation, expiresAt: owner.lastCommand.expiresAt.toDate().toISOString(), serverTime: owner.lastCommand.serverTime.toDate().toISOString(), renewAfterSeconds: 30}};
}
