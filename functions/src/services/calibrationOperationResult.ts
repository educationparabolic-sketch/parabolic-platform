import type {VendorCalibrationOperationResult} from "../../../shared/contracts/vendorCalibrationRollout";
import {CalibrationRolloutError} from "./calibrationRollout";
import {assertExactCalibrationKeys, isPlainCalibrationObject,
  normalizeCalibrationDocumentId} from "./calibrationContract";

const invalid = (): Error => new CalibrationRolloutError("INVALID_JOURNAL", "Invalid operation response.");
export const assertCalibrationOperationId = (value: unknown): string => {
  if (typeof value !== "string" || !/^cal_[0-9a-f]{64}$/.test(value)) {
    throw new CalibrationRolloutError("VALIDATION_ERROR", "Operation ID is invalid.");
  }
  return value;
};

// Validate the entire closed public projection before sending any service result.
export const validateCalibrationOperationResult = (
  value: unknown, expectedOperationId: string,
): VendorCalibrationOperationResult => {
  if (!isPlainCalibrationObject(value)) throw invalid();
  assertExactCalibrationKeys(value, ["operationId", "revision", "state", "receipt", "rollbackOperationId"],
    "operation", invalid);
  if (value.operationId !== expectedOperationId || !/^cal_[0-9a-f]{64}$/.test(expectedOperationId)) throw invalid();
  if (value.state === "pending") {
    if (value.revision !== 1 || value.receipt !== null || value.rollbackOperationId !== null) throw invalid();
    return value as unknown as VendorCalibrationOperationResult;
  }
  if (!["applied", "not_applied", "rolled_back"].includes(value.state as string) ||
    value.revision !== (value.state === "rolled_back" ? 3 : 2)) throw invalid();
  if (value.state === "rolled_back" ? (typeof value.rollbackOperationId !== "string" ||
    !/^cal_[0-9a-f]{64}$/.test(value.rollbackOperationId) || value.rollbackOperationId === expectedOperationId) :
    value.rollbackOperationId !== null) throw invalid();
  const receipt = value.receipt;
  if (!isPlainCalibrationObject(receipt)) throw invalid();
  assertExactCalibrationKeys(receipt, ["schemaVersion", "operationId", "kind", "originalOperationId",
    "revision", "versionId", "completedAt", "vendorCalibrationLogPath", "state", "targets", "failureCode"],
  "receipt", invalid);
  if (receipt.schemaVersion !== 1 || receipt.operationId !== expectedOperationId || receipt.revision !== 2 ||
    !["rollout", "rollback"].includes(receipt.kind as string) ||
    (receipt.kind === "rollout" ? receipt.originalOperationId !== null :
      (typeof receipt.originalOperationId !== "string" || !/^cal_[0-9a-f]{64}$/.test(receipt.originalOperationId) ||
        receipt.originalOperationId === expectedOperationId)) ||
    (value.state === "rolled_back" && receipt.kind !== "rollout") ||
    receipt.state !== (value.state === "not_applied" ? "not_applied" : "applied") ||
    typeof receipt.completedAt !== "string" || !Number.isFinite(Date.parse(receipt.completedAt)) ||
    new Date(receipt.completedAt).toISOString() !== receipt.completedAt ||
    receipt.vendorCalibrationLogPath !== `vendorCalibrationLogs/${expectedOperationId}` ||
    !Array.isArray(receipt.targets)) throw invalid();
  normalizeCalibrationDocumentId(receipt.versionId, "receipt.versionId", invalid);
  if (receipt.state === "not_applied") {
    if (receipt.targets.length !== 0 || !["INVALID_SOURCE", "INVALID_TARGET", "TARGET_CONFLICT",
      "OPERATION_CONFLICT", "APPLY_FAILED"].includes(receipt.failureCode as string)) throw invalid();
  } else {
    if (receipt.failureCode !== null || receipt.targets.length < 1 || receipt.targets.length > 20) throw invalid();
    let priorId = "";
    for (const outcome of receipt.targets) {
      if (!isPlainCalibrationObject(outcome)) throw invalid();
      assertExactCalibrationKeys(outcome, ["instituteId", "state", "before", "after", "calibrationPath",
        "calibrationHistoryPath"], "outcome", invalid);
      const id = normalizeCalibrationDocumentId(outcome.instituteId, "outcome.instituteId", invalid);
      if (id <= priorId || outcome.state !== "applied" ||
        outcome.calibrationPath !== `institutes/${id}/calibration/${receipt.versionId}` ||
        outcome.calibrationHistoryPath !== `institutes/${id}/calibrationHistory/${expectedOperationId}`) {
        throw invalid();
      }
      priorId = id;
      for (const side of ["before", "after"]) {
        const snapshot = outcome[side];
        if (!isPlainCalibrationObject(snapshot) || snapshot.instituteId !== id) throw invalid();
        assertExactCalibrationKeys(snapshot, ["instituteId", "institutePointer", "currentLicensePointer",
          "compatibilityLicensePointer"], "snapshot", invalid);
        for (const field of ["institutePointer", "currentLicensePointer", "compatibilityLicensePointer"]) {
          const pointer = snapshot[field];
          if (!isPlainCalibrationObject(pointer) || typeof pointer.present !== "boolean") throw invalid();
          assertExactCalibrationKeys(pointer, pointer.present ? ["present", "value"] : ["present"],
            "pointer", invalid);
          if (pointer.present && pointer.value !== null) {
            normalizeCalibrationDocumentId(pointer.value, "pointer.value", invalid);
          }
          if (side === (receipt.kind === "rollout" ? "after" : "before") &&
            (!pointer.present || pointer.value !== receipt.versionId)) throw invalid();
        }
      }
    }
  }
  return value as unknown as VendorCalibrationOperationResult;
};
