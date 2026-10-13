import type { VendorCalibrationOperationResult, VendorCalibrationRolloutRequest, VendorCalibrationRollbackRequest } from "../../../../../shared/contracts/vendorCalibrationRollout";

type Obj = Record<string, unknown>;
const fail = (): never => { throw new Error("Invalid calibration operation authority."); };
function object(value: unknown, keys: string[]): Obj {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail();
  const item = value as Obj;
  if (Object.keys(item).length !== keys.length || keys.some(key => !Object.hasOwn(item, key))) fail();
  return item;
}
const id = (value: unknown) => { if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) fail(); return value as string; };
export const operationId = (value: unknown) => { if (typeof value !== "string" || !/^cal_[0-9a-f]{64}$/.test(value)) fail(); return value as string; };
const uuid = (value: unknown) => { if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) fail(); };
export function parseRollout(value: unknown): VendorCalibrationRolloutRequest {
  const item = object(value, ["idempotencyKey", "versionId", "targets"]);
  uuid(item.idempotencyKey); id(item.versionId);
  if (!Array.isArray(item.targets) || item.targets.length < 1 || item.targets.length > 20) fail();
  const ids = (item.targets as unknown[]).map(value => {
    const target = object(value, ["instituteId", "expectedCalibrationVersion"]);
    if (target.expectedCalibrationVersion !== null) id(target.expectedCalibrationVersion);
    return id(target.instituteId);
  });
  if (new Set(ids).size !== ids.length) fail();
  return item as unknown as VendorCalibrationRolloutRequest;
}
export function parseRollback(value: unknown): VendorCalibrationRollbackRequest {
  const item = object(value, ["idempotencyKey", "expectedOperationRevision"]); uuid(item.idempotencyKey);
  if (!Number.isSafeInteger(item.expectedOperationRevision) || (item.expectedOperationRevision as number) < 1) fail();
  return item as unknown as VendorCalibrationRollbackRequest;
}
export async function deriveOperationId(uid: string, kind: "rollout" | "rollback", key: string) {
  if (!uid) fail(); uuid(key);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify([1, uid, kind, key])));
  return "cal_" + Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
export function parseOperation(value: unknown, expected: string): VendorCalibrationOperationResult {
  const item = object(value, ["operationId", "revision", "state", "receipt", "rollbackOperationId"]);
  if (item.operationId !== operationId(expected)) fail();
  if (item.state === "pending") {
    if (item.revision !== 1 || item.receipt !== null || item.rollbackOperationId !== null) fail();
  } else {
    if (!["applied", "not_applied", "rolled_back"].includes(item.state as string) || item.revision !== (item.state === "rolled_back" ? 3 : 2)) fail();
    if (item.state === "rolled_back") { if (operationId(item.rollbackOperationId) === expected) fail(); }
    else if (item.rollbackOperationId !== null) fail();
    const receipt = object(item.receipt, ["schemaVersion", "operationId", "kind", "originalOperationId", "revision", "versionId", "completedAt", "vendorCalibrationLogPath", "state", "targets", "failureCode"]);
    const version = id(receipt.versionId);
    if (receipt.schemaVersion !== 1 || receipt.operationId !== expected || receipt.revision !== 2 ||
      !["rollout", "rollback"].includes(receipt.kind as string) ||
      (receipt.kind === "rollout" ? receipt.originalOperationId !== null : operationId(receipt.originalOperationId) === expected) ||
      (item.state === "rolled_back" && receipt.kind !== "rollout") ||
      receipt.state !== (item.state === "not_applied" ? "not_applied" : "applied") ||
      typeof receipt.completedAt !== "string" || !Number.isFinite(Date.parse(receipt.completedAt)) || new Date(receipt.completedAt).toISOString() !== receipt.completedAt ||
      receipt.vendorCalibrationLogPath !== `vendorCalibrationLogs/${expected}` || !Array.isArray(receipt.targets)) fail();
    const targets = receipt.targets as unknown[];
    if (receipt.state === "not_applied") {
      if (targets.length || !["INVALID_SOURCE", "INVALID_TARGET", "TARGET_CONFLICT", "OPERATION_CONFLICT", "APPLY_FAILED"].includes(receipt.failureCode as string)) fail();
    } else {
      if (receipt.failureCode !== null || targets.length < 1 || targets.length > 20) fail();
      let previous = "";
      for (const value of targets) {
        const target = object(value, ["instituteId", "state", "before", "after", "calibrationPath", "calibrationHistoryPath"]);
        const institute = id(target.instituteId);
        if (institute <= previous || target.state !== "applied" || target.calibrationPath !== `institutes/${institute}/calibration/${version}` || target.calibrationHistoryPath !== `institutes/${institute}/calibrationHistory/${expected}`) fail();
        previous = institute;
        for (const side of ["before", "after"]) {
          const snapshot = object(target[side], ["instituteId", "institutePointer", "currentLicensePointer", "compatibilityLicensePointer"]);
          if (snapshot.instituteId !== institute) fail();
          for (const field of ["institutePointer", "currentLicensePointer", "compatibilityLicensePointer"]) {
            const raw = snapshot[field] as Obj;
            const pointer = object(raw, raw?.present === true ? ["present", "value"] : ["present"]);
            if (typeof pointer.present !== "boolean") fail();
            if (pointer.present && pointer.value !== null) id(pointer.value);
            if (side === (receipt.kind === "rollout" ? "after" : "before") && (!pointer.present || pointer.value !== version)) fail();
          }
        }
      }
    }
  }
  return item as unknown as VendorCalibrationOperationResult;
}
export function matchRollout(result: VendorCalibrationOperationResult, request: VendorCalibrationRolloutRequest) {
  const receipt = result.receipt;
  if (receipt && (receipt.kind !== "rollout" || receipt.versionId !== request.versionId)) fail();
  if (receipt?.state === "applied") {
    const targets = [...request.targets].sort((a, b) => a.instituteId < b.instituteId ? -1 : 1);
    if (receipt.targets.length !== targets.length || receipt.targets.some((target, i) =>
      target.instituteId !== targets[i].instituteId || (target.before.institutePointer.present ? target.before.institutePointer.value : null) !== targets[i].expectedCalibrationVersion)) fail();
  }
  return result;
}
