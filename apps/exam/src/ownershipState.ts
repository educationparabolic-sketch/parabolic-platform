import type { ExamRuntimeLeaseReceipt } from "../../../shared/contracts/examRuntimeOwnership";

export const OWNER_STORAGE_KEY = "parabolic.exam.runtimeOwner.v2";
export interface Owner {proof: string; generation: number}
export interface PendingOwner {proof: string; commandId: string}
export interface OwnerRecord {scopeHash: string; current?: Owner; pending?: PendingOwner}
const plain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).length === keys.length && keys.every((k) => k in v);
export const validProof = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{43}$/u.test(v) &&
  btoa(atob(v.replace(/-/gu, "+").replace(/_/gu, "/") + "=")).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "") === v;
export const validGeneration = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) > 0;
export function readOwnerRecord(raw: string | null, scopeHash: string): OwnerRecord | null {
  try {
    if (!raw || raw.length > 1024) return null;
    const v: unknown = JSON.parse(raw);
    if (!plain(v) || v.scopeHash !== scopeHash || !/^[a-f0-9]{64}$/u.test(scopeHash) ||
        Object.keys(v).some((key) => !["scopeHash", "current", "pending"].includes(key))) return null;
    if (v.current !== undefined && (!plain(v.current) || !exact(v.current, ["proof", "generation"]) ||
        !validProof(v.current.proof) || !validGeneration(v.current.generation))) return null;
    if (v.pending !== undefined && (!plain(v.pending) || !exact(v.pending, ["proof", "commandId"]) ||
        !validProof(v.pending.proof) || typeof v.pending.commandId !== "string" ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(v.pending.commandId))) return null;
    return v as unknown as OwnerRecord;
  } catch { return null; }
}
export function recoverySource(record: OwnerRecord) {
  if (record.pending) return {proof: record.pending.proof, previous: {pendingCommandId: record.pending.commandId}};
  if (record.current) return {proof: record.current.proof, previous: {generation: record.current.generation}};
  throw new Error("No recoverable ownership record.");
}
export function readLease(value: unknown): ExamRuntimeLeaseReceipt {
  if (!plain(value) || !exact(value, ["contractVersion", "generation", "expiresAt", "serverTime", "renewAfterSeconds"]) ||
      value.contractVersion !== 2 || !validGeneration(value.generation) || value.renewAfterSeconds !== 30 ||
      typeof value.expiresAt !== "string" || typeof value.serverTime !== "string" ||
      !Number.isFinite(Date.parse(value.serverTime)) || !Number.isFinite(Date.parse(value.expiresAt)) ||
      new Date(value.serverTime).toISOString() !== value.serverTime || new Date(value.expiresAt).toISOString() !== value.expiresAt ||
      Date.parse(value.expiresAt) - Date.parse(value.serverTime) > 90000 || Date.parse(value.expiresAt) <= Date.parse(value.serverTime)) {
    throw new Error("Invalid runtime lease receipt.");
  }
  return value as unknown as ExamRuntimeLeaseReceipt;
}
export function leaseDeadline(lease: ExamRuntimeLeaseReceipt, sentAt: number): number {
  // Monotonic, conservatively subtract the entire request/retry round trip.
  return sentAt + Date.parse(lease.expiresAt) - Date.parse(lease.serverTime);
}
