import {createHash} from "node:crypto";
import {FieldValue, Firestore} from "firebase-admin/firestore";
import type {
  VendorCalibrationFailureCode, VendorCalibrationOperationRecord,
  VendorCalibrationOperationReceipt, VendorCalibrationOperationResult,
  VendorCalibrationPointer, VendorCalibrationRollbackRequest, VendorCalibrationRolloutRequest,
  VendorCalibrationTargetSnapshot, VendorCalibrationTerminalLog,
} from "../../../shared/contracts/vendorCalibrationRollout";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {assertExactCalibrationKeys, isPlainCalibrationObject,
  normalizeCalibrationDocumentId, validateStoredCalibrationVersion} from "./calibrationContract";
import {calibrationFingerprint} from "./calibrationConsumer";

export class CalibrationRolloutError extends Error {
  constructor(public readonly code: "VALIDATION_ERROR" | "OPERATION_CONFLICT" | "INVALID_JOURNAL" | "NOT_FOUND",
    message: string) {
    super(message);
    this.name = "CalibrationRolloutError";
  }
}
class ApplyFailure extends Error {
  constructor(public readonly code: VendorCalibrationFailureCode) {
    super(code);
  }
}
const invalid = (message: string): Error => new CalibrationRolloutError("VALIDATION_ERROR", message);
const sha = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const OPERATION_ID = /^cal_[0-9a-f]{64}$/;
const assertVendor = (vendorUid: string): void => {
  if (typeof vendorUid !== "string" || !vendorUid || vendorUid !== vendorUid.trim() || vendorUid.length > 128) {
    throw invalid("Current server Vendor UID is required.");
  }
};
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const targetPairs = (targets: VendorCalibrationRolloutRequest["targets"]) =>
  targets.map((target) => [target.instituteId, target.expectedCalibrationVersion]);
const snapshotPairs = (snapshot: VendorCalibrationTargetSnapshot) => [snapshot.instituteId,
  ...[snapshot.institutePointer, snapshot.currentLicensePointer, snapshot.compatibilityLicensePointer]
    .map((captured) => captured.present ? [true, captured.value] : [false])];

const parseTargets = (value: unknown): VendorCalibrationRolloutRequest["targets"] => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) {
    throw invalid("Exactly 1..20 unique targets are required.");
  }
  const targets = value.map((target: unknown) => {
    if (!isPlainCalibrationObject(target)) throw invalid("Target must be an object.");
    assertExactCalibrationKeys(target, ["instituteId", "expectedCalibrationVersion"], "target", invalid);
    const instituteId = normalizeCalibrationDocumentId(target.instituteId, "instituteId", invalid);
    const expectedCalibrationVersion = target.expectedCalibrationVersion === null ? null :
      normalizeCalibrationDocumentId(target.expectedCalibrationVersion, "expectedCalibrationVersion", invalid);
    return {instituteId, expectedCalibrationVersion};
  }).sort((a, b) => compare(a.instituteId, b.instituteId));
  if (new Set(targets.map((target) => target.instituteId)).size !== targets.length) {
    throw invalid("Duplicate targets are not permitted.");
  }
  return targets;
};
export const parseCalibrationRollout = (value: unknown): VendorCalibrationRolloutRequest => {
  if (!isPlainCalibrationObject(value)) throw invalid("Rollout must be an object.");
  assertExactCalibrationKeys(value, ["idempotencyKey", "versionId", "targets"], "rollout", invalid);
  if (typeof value.idempotencyKey !== "string" || !UUID.test(value.idempotencyKey)) {
    throw invalid("A canonical lowercase UUID v4 is required.");
  }
  return {idempotencyKey: value.idempotencyKey,
    versionId: normalizeCalibrationDocumentId(value.versionId, "versionId", invalid),
    targets: parseTargets(value.targets)};
};
export const parseCalibrationRollback = (value: unknown): VendorCalibrationRollbackRequest => {
  if (!isPlainCalibrationObject(value)) throw invalid("Rollback must be an object.");
  assertExactCalibrationKeys(value, ["idempotencyKey", "expectedOperationRevision"], "rollback", invalid);
  if (typeof value.idempotencyKey !== "string" || !UUID.test(value.idempotencyKey) ||
    !Number.isSafeInteger(value.expectedOperationRevision) || (value.expectedOperationRevision as number) <= 0) {
    throw invalid("Rollback requires a canonical UUID v4 and positive safe integer revision.");
  }
  return {idempotencyKey: value.idempotencyKey, expectedOperationRevision: value.expectedOperationRevision as number};
};
export const calibrationRollbackIdentity = (
  vendorUid: string, originalOperationId: string, request: VendorCalibrationRollbackRequest,
) => {
  assertVendor(vendorUid);
  if (typeof originalOperationId !== "string" || !OPERATION_ID.test(originalOperationId)) {
    throw invalid("Original operation ID is invalid.");
  }
  const keyHash = sha([1, vendorUid, "rollback", request.idempotencyKey]);
  return {keyHash, operationId: `cal_${keyHash}`,
    requestFingerprint: sha([1, "rollback", originalOperationId, request.expectedOperationRevision])};
};

export const calibrationRolloutIdentity = (vendorUid: string, request: VendorCalibrationRolloutRequest) => {
  assertVendor(vendorUid);
  const keyHash = sha([1, vendorUid, "rollout", request.idempotencyKey]);
  return {keyHash, operationId: `cal_${keyHash}`,
    requestFingerprint: sha([1, "rollout", request.versionId, targetPairs(request.targets)])};
};

const pointer = (value: Record<string, unknown>): VendorCalibrationPointer => {
  if (!Object.prototype.hasOwnProperty.call(value, "calibrationVersion")) return {present: false};
  const version = value.calibrationVersion;
  if (version !== null) {
    normalizeCalibrationDocumentId(version, "calibrationVersion", () => new ApplyFailure("INVALID_TARGET"));
  }
  return {present: true, value: version as string | null};
};
const license = (value: unknown): Record<string, unknown> => {
  if (!isPlainCalibrationObject(value) ||
    typeof value.currentLayer !== "string" || !["L0", "L1", "L2", "L3"].includes(value.currentLayer) ||
    typeof value.licenseVersion !== "string" || !value.licenseVersion.trim() ||
    typeof value.licenseState !== "string" || !["active", "grace", "expired"].includes(value.licenseState) ||
    !isPlainCalibrationObject(value.featureFlags) ||
    Object.values(value.featureFlags).some((flag) => typeof flag !== "boolean")) {
    throw new ApplyFailure("INVALID_TARGET");
  }
  return value;
};
const result = (record: VendorCalibrationOperationRecord): VendorCalibrationOperationResult => {
  if (record.state === "pending" && record.receipt === null && record.revision === 1) {
    return {operationId: record.operationId, revision: 1, state: "pending", receipt: null, rollbackOperationId: null};
  }
  if ((record.state === "applied" || record.state === "not_applied") && record.revision === 2 &&
    record.receipt?.state === record.state && record.receipt.operationId === record.operationId &&
    record.receipt.revision === 2) {
    return {operationId: record.operationId, revision: 2, state: record.state,
      receipt: record.receipt, rollbackOperationId: null} as VendorCalibrationOperationResult;
  }
  if (record.kind === "rollout" && record.state === "rolled_back" && record.revision === 3 &&
    record.receipt?.state === "applied" && record.receipt.revision === 2 &&
    record.receipt.operationId === record.operationId &&
    record.rollbackOperationId !== null && OPERATION_ID.test(record.rollbackOperationId)) {
    return {operationId: record.operationId, revision: 3, state: "rolled_back",
      receipt: record.receipt, rollbackOperationId: record.rollbackOperationId};
  }
  throw new CalibrationRolloutError("INVALID_JOURNAL", "Stored operation state is invalid.");
};

// Shared closed journal validation for apply replay and inverse source/replay authority.
const assertOperationRecord = (
  value: unknown, vendorUid: string, operationId: string,
): VendorCalibrationOperationRecord => {
  if (!OPERATION_ID.test(operationId)) throw invalid("Operation ID is invalid.");
  if (!isPlainCalibrationObject(value) || value.schemaVersion !== 1 ||
    value.operationId !== operationId || value.vendorUid !== vendorUid ||
    (value.kind !== "rollout" && value.kind !== "rollback") ||
    value.keyHash !== operationId.slice(4)) {
    throw new CalibrationRolloutError("OPERATION_CONFLICT", "Scoped key has conflicting intent or authority.");
  }
  const stored = value as unknown as VendorCalibrationOperationRecord;
  const invalidJournal = (message: string): Error => new CalibrationRolloutError("INVALID_JOURNAL", message);
  let targets: VendorCalibrationRolloutRequest["targets"];
  try {
    targets = parseTargets(stored.targets);
    normalizeCalibrationDocumentId(stored.versionId, "versionId", invalid);
  } catch {
    throw invalidJournal("Stored operation request is malformed.");
  }
  if (JSON.stringify(targetPairs(stored.targets)) !== JSON.stringify(targetPairs(targets))) {
    throw new CalibrationRolloutError("INVALID_JOURNAL", "Stored targets are not canonical.");
  }
  const request = {versionId: stored.versionId, targets};
  const identity = {operationId};
  const log = {path: `vendorCalibrationLogs/${operationId}`};
  const expectedFingerprint = stored.kind === "rollout" ?
    sha([1, "rollout", stored.versionId, targetPairs(targets)]) :
    sha([1, "rollback", stored.originalOperationId, stored.expectedOperationRevision]);
  if (stored.requestFingerprint !== expectedFingerprint) {
    throw new CalibrationRolloutError("INVALID_JOURNAL", "Stored fingerprint is inconsistent.");
  }
  assertExactCalibrationKeys(value, ["schemaVersion", "operationId", "vendorUid", "kind", "keyHash",
    "requestFingerprint", "sourceFingerprint", "originalOperationId", "expectedOperationRevision", "versionId",
    "targets", "snapshots", "state", "revision", "createdAt", "updatedAt", "receipt", "rollbackOperationId"],
  "journal", invalidJournal);
  if ((stored.kind === "rollout" && (stored.originalOperationId !== null ||
    stored.expectedOperationRevision !== null)) ||
    (stored.kind === "rollback" && (typeof stored.originalOperationId !== "string" ||
      !OPERATION_ID.test(stored.originalOperationId) || !Number.isSafeInteger(stored.expectedOperationRevision) ||
      (stored.expectedOperationRevision as number) <= 0)) ||
    (stored.state === "rolled_back" ? (stored.kind !== "rollout" ||
      typeof stored.rollbackOperationId !== "string" || !OPERATION_ID.test(stored.rollbackOperationId) ||
      stored.rollbackOperationId === operationId) : stored.rollbackOperationId !== null) ||
    !Array.isArray(stored.snapshots) ||
    typeof stored.createdAt !== "string" || !Number.isFinite(Date.parse(stored.createdAt)) ||
    typeof stored.updatedAt !== "string" || !Number.isFinite(Date.parse(stored.updatedAt)) ||
    (stored.sourceFingerprint !== null && !/^[0-9a-f]{64}$/.test(stored.sourceFingerprint))) {
    throw invalidJournal("Stored operation metadata is invalid.");
  }
  if (stored.state === "pending" && (stored.sourceFingerprint !== null || stored.snapshots.length !== 0)) {
    throw invalidJournal("Pending operation contains unsupported captured authority.");
  }
  if (stored.receipt !== null) {
    const receipt = stored.receipt;
    if (!isPlainCalibrationObject(receipt)) throw invalidJournal("Stored receipt is malformed.");
    assertExactCalibrationKeys(receipt, ["schemaVersion", "operationId", "kind", "originalOperationId",
      "revision", "versionId", "completedAt", "vendorCalibrationLogPath", "state", "targets", "failureCode"],
    "receipt", invalidJournal);
    if (receipt.schemaVersion !== 1 || receipt.kind !== stored.kind ||
      receipt.originalOperationId !== stored.originalOperationId ||
      receipt.versionId !== request.versionId || receipt.vendorCalibrationLogPath !== log.path ||
      (stored.state !== "rolled_back" && receipt.completedAt !== stored.updatedAt) ||
      typeof receipt.completedAt !== "string" || !Number.isFinite(Date.parse(receipt.completedAt)) ||
      Date.parse(receipt.completedAt) > Date.parse(stored.updatedAt) || !Array.isArray(receipt.targets)) {
      throw invalidJournal("Stored receipt identity is inconsistent.");
    }
    if (receipt.state === "applied") {
      if (receipt.failureCode !== null || stored.sourceFingerprint === null ||
        receipt.targets.length !== request.targets.length || stored.snapshots.length !== request.targets.length) {
        throw invalidJournal("Applied receipt is incomplete.");
      }
      receipt.targets.forEach((outcome, index) => {
        const id = request.targets[index].instituteId;
        const next: VendorCalibrationPointer = {present: true, value: request.versionId};
        if (!isPlainCalibrationObject(outcome)) throw invalidJournal("Stored target outcome is malformed.");
        assertExactCalibrationKeys(outcome, ["instituteId", "state", "before", "after", "calibrationPath",
          "calibrationHistoryPath"], "outcome", invalidJournal);
        if (outcome.instituteId !== id || outcome.state !== "applied" ||
          outcome.calibrationPath !== `institutes/${id}/calibration/${request.versionId}` ||
          outcome.calibrationHistoryPath !== `institutes/${id}/calibrationHistory/${identity.operationId}`) {
          throw invalidJournal("Stored target outcome is inconsistent.");
        }
        for (const snapshot of [outcome.before, outcome.after]) {
          if (!isPlainCalibrationObject(snapshot) || snapshot.instituteId !== id) {
            throw invalidJournal("Stored pointer snapshot is malformed.");
          }
          assertExactCalibrationKeys(snapshot, ["instituteId", "institutePointer", "currentLicensePointer",
            "compatibilityLicensePointer"], "snapshot", invalidJournal);
          const fields = ["institutePointer", "currentLicensePointer", "compatibilityLicensePointer"] as const;
          for (const field of fields) {
            const captured = snapshot[field];
            if (!isPlainCalibrationObject(captured) || typeof captured.present !== "boolean") {
              throw invalidJournal("Stored pointer is malformed.");
            }
            assertExactCalibrationKeys(captured, captured.present ? ["present", "value"] : ["present"],
              "pointer", invalidJournal);
            if (captured.present && captured.value !== null) {
              normalizeCalibrationDocumentId(captured.value, "pointer.value", invalidJournal);
            }
            if (((stored.kind === "rollout" && snapshot === outcome.after) ||
              (stored.kind === "rollback" && snapshot === outcome.before)) &&
              (!captured.present || captured.value !== next.value)) {
              throw invalidJournal("Applied pointer does not match the selected version.");
            }
          }
        }
        const prior = stored.kind === "rollout" ? outcome.before.institutePointer : outcome.after.institutePointer;
        if ((prior.present ? prior.value : null) !== targets[index].expectedCalibrationVersion) {
          throw invalidJournal("Captured prior institute pointer differs from the request precondition.");
        }
        if (JSON.stringify(snapshotPairs(outcome.before)) !==
          JSON.stringify(snapshotPairs(stored.snapshots[index]))) {
          throw invalidJournal("Captured journal pointers differ from the immutable receipt.");
        }
      });
    } else if (receipt.state !== "not_applied" || receipt.targets.length !== 0 || stored.snapshots.length !== 0 ||
      !["INVALID_SOURCE", "INVALID_TARGET", "TARGET_CONFLICT", "OPERATION_CONFLICT", "APPLY_FAILED"]
        .includes(receipt.failureCode)) {
      throw invalidJournal("Failed receipt is inconsistent.");
    }
  }
  result(stored);
  return stored;
};
const equal = (left: unknown, right: unknown): boolean => {
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) :
    isPlainCalibrationObject(value) ? Object.fromEntries(Object.keys(value).sort()
      .map((key) => [key, canonical(value[key])])) : value;
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
};

/** Explicit fault seams for disposable emulator verification, never request-driven. */
export interface CalibrationRolloutTestHooks {
  afterReservation?: () => void;
  beforeApplyCommit?: () => void;
  afterApplyCommit?: () => void;
  beforeRollbackCommit?: () => void;
  afterRollbackCommit?: () => void;
  beforeFailureCommit?: () => void;
}

export class CalibrationRolloutService {
  constructor(private readonly firestore: Firestore = getFirestore(),
    private readonly hooks: CalibrationRolloutTestHooks = {}) {
    if (Object.keys(hooks).length &&
      (!process.env.FIRESTORE_EMULATOR_HOST || getFirebaseAdminApp().options.projectId !== "demo-parabolic-test")) {
      throw new Error("Rollout fault seams require the disposable demo emulator.");
    }
  }

  // One scoped recovery read, never a list or scan; no internal journal projection.
  public async readOperation(vendorUid: string, operationId: string): Promise<VendorCalibrationOperationResult> {
    assertVendor(vendorUid);
    if (typeof operationId !== "string" || !OPERATION_ID.test(operationId)) {
      throw invalid("Operation ID is invalid.");
    }
    const snapshot = await this.firestore.doc(`vendorCalibrationRollouts/${operationId}`).get();
    if (!snapshot.exists || snapshot.get("vendorUid") !== vendorUid) {
      throw new CalibrationRolloutError("NOT_FOUND", "Calibration operation is unavailable.");
    }
    try {
      return result(assertOperationRecord(snapshot.data(), vendorUid, operationId));
    } catch {
      // A scoped read has no competing command intent; malformed authority is internal.
      throw new CalibrationRolloutError("INVALID_JOURNAL", "Stored operation authority is invalid.");
    }
  }

  // Transport supplies fresh Vendor authority; caller input never supplies an actor.
  public async apply(vendorUid: string, input: unknown): Promise<VendorCalibrationOperationResult> {
    const request = parseCalibrationRollout(input);
    const identity = calibrationRolloutIdentity(vendorUid, request);
    const journal = this.firestore.doc(`vendorCalibrationRollouts/${identity.operationId}`);
    const log = this.firestore.doc(`vendorCalibrationLogs/${identity.operationId}`);
    const assertRecord = (value: unknown): VendorCalibrationOperationRecord => {
      const stored = assertOperationRecord(value, vendorUid, identity.operationId);
      if (stored.kind !== "rollout" || stored.keyHash !== identity.keyHash ||
        stored.requestFingerprint !== identity.requestFingerprint) {
        throw new CalibrationRolloutError("OPERATION_CONFLICT", "Scoped key has conflicting intent or authority.");
      }
      return stored;
    };
    const reserved = await this.firestore.runTransaction(async (transaction) => {
      const existing = await transaction.get(journal);
      if (existing.exists) return assertRecord(existing.data());
      const now = new Date().toISOString();
      const record: VendorCalibrationOperationRecord = {
        schemaVersion: 1, ...identity, vendorUid, kind: "rollout", versionId: request.versionId,
        targets: request.targets, snapshots: [], sourceFingerprint: null, originalOperationId: null,
        expectedOperationRevision: null, state: "pending", revision: 1, createdAt: now, updatedAt: now,
        receipt: null, rollbackOperationId: null,
      };
      transaction.create(journal, record);
      return record;
    });
    if (reserved.state !== "pending") return result(reserved);
    // A process death here leaves a durable pending journal which the same intent can resume.
    this.hooks.afterReservation?.();
    try {
      const applied = await this.firestore.runTransaction(async (transaction) => {
        const stored = assertRecord((await transaction.get(journal)).data());
        if (stored.state !== "pending") return stored;
        const sourcePath = `globalCalibration/${request.versionId}`;
        const references = [this.firestore.doc(sourcePath), log, ...request.targets.flatMap(({instituteId}) => [
          this.firestore.doc(`institutes/${instituteId}`),
          this.firestore.doc(`institutes/${instituteId}/license/current`),
          this.firestore.doc(`institutes/${instituteId}/license/main`),
          this.firestore.doc(`institutes/${instituteId}/calibration/${request.versionId}`),
          this.firestore.doc(`institutes/${instituteId}/calibrationHistory/${identity.operationId}`),
        ])];
        const documents = await transaction.getAll(...references);
        const now = new Date();
        const source = validateStoredCalibrationVersion(documents[0].data(), request.versionId, sourcePath,
          now, () => new ApplyFailure("INVALID_SOURCE"));
        if (Date.parse(source.createdAt) > now.getTime() ||
          (source.activationDate !== null && Date.parse(source.activationDate) > now.getTime())) {
          throw new ApplyFailure("INVALID_SOURCE");
        }
        if (documents[1].exists) throw new ApplyFailure("OPERATION_CONFLICT");
        const sourceFingerprint = calibrationFingerprint(source);
        // Deterministic null-activation promotion permits identical immutable-copy reuse on later keys.
        const copy = {...source, schemaVersion: 1, isActive: true,
          activationDate: source.activationDate ?? source.createdAt};
        const copyFingerprint = calibrationFingerprint(copy);
        const snapshots: VendorCalibrationTargetSnapshot[] = [];
        const outcomes = request.targets.map((target, index) => {
          const offset = 2 + index * 5;
          const institute = documents[offset].data();
          if (!isPlainCalibrationObject(institute)) throw new ApplyFailure("INVALID_TARGET");
          const current = license(documents[offset + 1].data());
          const main = license(documents[offset + 2].data());
          const before: VendorCalibrationTargetSnapshot = {instituteId: target.instituteId,
            institutePointer: pointer(institute), currentLicensePointer: pointer(current),
            compatibilityLicensePointer: pointer(main)};
          const actual = before.institutePointer.present ? before.institutePointer.value : null;
          if (actual !== target.expectedCalibrationVersion) throw new ApplyFailure("TARGET_CONFLICT");
          if (documents[offset + 4].exists) throw new ApplyFailure("OPERATION_CONFLICT");
          if (documents[offset + 3].exists) {
            const existing = validateStoredCalibrationVersion(documents[offset + 3].data(), request.versionId,
              references[offset + 3].path, now, () => new ApplyFailure("TARGET_CONFLICT"));
            if (calibrationFingerprint(existing) !== copyFingerprint) throw new ApplyFailure("TARGET_CONFLICT");
          }
          snapshots.push(before);
          const next: VendorCalibrationPointer = {present: true, value: request.versionId};
          return {instituteId: target.instituteId, state: "applied" as const, before,
            after: {instituteId: target.instituteId, institutePointer: next,
              currentLicensePointer: next, compatibilityLicensePointer: next},
            calibrationPath: references[offset + 3].path, calibrationHistoryPath: references[offset + 4].path};
        });
        const receipt: VendorCalibrationOperationReceipt = {schemaVersion: 1,
          operationId: identity.operationId, kind: "rollout", originalOperationId: null, revision: 2,
          versionId: request.versionId, completedAt: now.toISOString(), vendorCalibrationLogPath: log.path,
          state: "applied", targets: outcomes, failureCode: null};
        const terminal: VendorCalibrationTerminalLog = {schemaVersion: 1, operationId: identity.operationId,
          vendorUid, requestFingerprint: identity.requestFingerprint, sourceFingerprint,
          requestedInstituteIds: request.targets.map((target) => target.instituteId), receipt};
        request.targets.forEach((target, index) => {
          const offset = 2 + index * 5;
          transaction.update(references[offset], {calibrationVersion: request.versionId});
          transaction.update(references[offset + 1], {calibrationVersion: request.versionId});
          transaction.update(references[offset + 2], {calibrationVersion: request.versionId});
          if (!documents[offset + 3].exists) transaction.create(references[offset + 3], copy);
          transaction.create(references[offset + 4], {...terminal,
            requestedInstituteIds: [target.instituteId], receipt: {...receipt, targets: [outcomes[index]]}});
        });
        const complete: VendorCalibrationOperationRecord = {...stored, snapshots, sourceFingerprint,
          state: "applied", revision: 2, updatedAt: receipt.completedAt, receipt};
        transaction.create(log, terminal);
        transaction.update(journal, {...complete});
        this.hooks.beforeApplyCommit?.();
        return complete;
      });
      this.hooks.afterApplyCommit?.();
      return result(applied);
    } catch (error) {
      // A lost commit response cannot be treated as a failed apply. Reread before terminalizing.
      const observed = assertRecord((await journal.get()).data());
      if (observed.state !== "pending") return result(observed);
      try {
        const failed = await this.firestore.runTransaction(async (transaction) => {
          const stored = assertRecord((await transaction.get(journal)).data());
          if (stored.state !== "pending") return stored;
          const receipt: VendorCalibrationOperationReceipt = {schemaVersion: 1,
            operationId: identity.operationId, kind: "rollout", originalOperationId: null, revision: 2,
            versionId: request.versionId, completedAt: new Date().toISOString(), vendorCalibrationLogPath: log.path,
            state: "not_applied", targets: [],
            failureCode: error instanceof ApplyFailure ? error.code : "APPLY_FAILED"};
          const terminal: VendorCalibrationTerminalLog = {schemaVersion: 1, operationId: identity.operationId,
            vendorUid, requestFingerprint: identity.requestFingerprint, sourceFingerprint: null,
            requestedInstituteIds: request.targets.map((target) => target.instituteId), receipt};
          const complete: VendorCalibrationOperationRecord = {...stored, state: "not_applied", revision: 2,
            updatedAt: receipt.completedAt, receipt};
          transaction.create(log, terminal);
          transaction.update(journal, {...complete});
          this.hooks.beforeFailureCommit?.();
          return complete;
        });
        return result(failed);
      } catch {
        // Concurrent completion or failed failure-log write: report authoritative state, possibly pending.
        return result(assertRecord((await journal.get()).data()));
      }
    }
  }

  // Inverse command; secured transport supplies current Vendor authority.
  public async rollback(
    vendorUid: string, originalOperationId: string, input: unknown,
  ): Promise<VendorCalibrationOperationResult> {
    const request = parseCalibrationRollback(input);
    const identity = calibrationRollbackIdentity(vendorUid, originalOperationId, request);
    const originalReference = this.firestore.doc(`vendorCalibrationRollouts/${originalOperationId}`);
    const journal = this.firestore.doc(`vendorCalibrationRollouts/${identity.operationId}`);
    const log = this.firestore.doc(`vendorCalibrationLogs/${identity.operationId}`);
    const assertInverse = (value: unknown): VendorCalibrationOperationRecord => {
      const stored = assertOperationRecord(value, vendorUid, identity.operationId);
      if (stored.kind !== "rollback" || stored.requestFingerprint !== identity.requestFingerprint) {
        throw new CalibrationRolloutError("OPERATION_CONFLICT", "Scoped inverse key has conflicting intent.");
      }
      return stored;
    };
    const assertOriginal = (value: unknown): VendorCalibrationOperationRecord => {
      const stored = assertOperationRecord(value, vendorUid, originalOperationId);
      if (stored.kind !== "rollout" || stored.state !== "applied" ||
        stored.revision !== request.expectedOperationRevision || stored.rollbackOperationId !== null ||
        sha([1, vendorUid, "rollout", request.idempotencyKey]) === stored.keyHash) {
        throw new CalibrationRolloutError("OPERATION_CONFLICT", "Rollback requires an unapplied inverse and new key.");
      }
      return stored;
    };
    const reserved = await this.firestore.runTransaction(async (transaction) => {
      const existing = await transaction.get(journal);
      if (existing.exists) return assertInverse(existing.data());
      const original = assertOriginal((await transaction.get(originalReference)).data());
      const now = new Date().toISOString();
      const record: VendorCalibrationOperationRecord = {schemaVersion: 1, ...identity,
        vendorUid, kind: "rollback", originalOperationId, expectedOperationRevision: request.expectedOperationRevision,
        versionId: original.versionId, targets: original.targets, snapshots: [], sourceFingerprint: null,
        state: "pending", revision: 1, createdAt: now, updatedAt: now, receipt: null, rollbackOperationId: null};
      transaction.create(journal, record);
      return record;
    });
    if (reserved.state !== "pending") return result(reserved);
    this.hooks.afterReservation?.();
    try {
      const restored = await this.firestore.runTransaction(async (transaction) => {
        const stored = assertInverse((await transaction.get(journal)).data());
        if (stored.state !== "pending") return stored;
        const original = assertOriginal((await transaction.get(originalReference)).data());
        if (original.receipt?.state !== "applied") throw new ApplyFailure("OPERATION_CONFLICT");
        const originalReceipt = original.receipt;
        const references = [log, this.firestore.doc(originalReceipt.vendorCalibrationLogPath),
          ...original.targets.flatMap(({instituteId}) => [
            this.firestore.doc(`institutes/${instituteId}`),
            this.firestore.doc(`institutes/${instituteId}/license/current`),
            this.firestore.doc(`institutes/${instituteId}/license/main`),
            this.firestore.doc(`institutes/${instituteId}/calibrationHistory/${identity.operationId}`),
          ])];
        const documents = await transaction.getAll(...references);
        const originalLog: VendorCalibrationTerminalLog = {schemaVersion: 1, operationId: originalOperationId,
          vendorUid, requestFingerprint: original.requestFingerprint, sourceFingerprint: original.sourceFingerprint,
          requestedInstituteIds: original.targets.map((target) => target.instituteId), receipt: originalReceipt};
        if (documents[0].exists || !equal(documents[1].data(), originalLog)) {
          throw new ApplyFailure("OPERATION_CONFLICT");
        }
        if (stored.versionId !== original.versionId || !equal(stored.targets, original.targets)) {
          throw new ApplyFailure("OPERATION_CONFLICT");
        }
        const snapshots: VendorCalibrationTargetSnapshot[] = [];
        const outcomes = originalReceipt.targets.map((outcome, index) => {
          const offset = 2 + index * 4;
          const institute = documents[offset].data();
          if (!isPlainCalibrationObject(institute)) throw new ApplyFailure("INVALID_TARGET");
          const current = license(documents[offset + 1].data());
          const main = license(documents[offset + 2].data());
          const actual: VendorCalibrationTargetSnapshot = {instituteId: outcome.instituteId,
            institutePointer: pointer(institute), currentLicensePointer: pointer(current),
            compatibilityLicensePointer: pointer(main)};
          if (!equal(actual, outcome.after)) throw new ApplyFailure("TARGET_CONFLICT");
          if (documents[offset + 3].exists) throw new ApplyFailure("OPERATION_CONFLICT");
          snapshots.push(actual);
          return {...outcome, before: actual, after: outcome.before,
            calibrationHistoryPath: references[offset + 3].path};
        });
        const now = new Date().toISOString();
        const receipt: VendorCalibrationOperationReceipt = {schemaVersion: 1, operationId: identity.operationId,
          kind: "rollback", originalOperationId, revision: 2, versionId: original.versionId, completedAt: now,
          vendorCalibrationLogPath: log.path, state: "applied", targets: outcomes, failureCode: null};
        const terminal: VendorCalibrationTerminalLog = {schemaVersion: 1, operationId: identity.operationId,
          vendorUid, requestFingerprint: identity.requestFingerprint, sourceFingerprint: original.sourceFingerprint,
          requestedInstituteIds: original.targets.map((target) => target.instituteId), receipt};
        const restore = (captured: VendorCalibrationPointer) =>
          ({calibrationVersion: captured.present ? captured.value : FieldValue.delete()});
        outcomes.forEach((outcome, index) => {
          const offset = 2 + index * 4;
          transaction.update(references[offset], restore(outcome.after.institutePointer));
          transaction.update(references[offset + 1], restore(outcome.after.currentLicensePointer));
          transaction.update(references[offset + 2], restore(outcome.after.compatibilityLicensePointer));
          transaction.create(references[offset + 3], {...terminal, requestedInstituteIds: [outcome.instituteId],
            receipt: {...receipt, targets: [outcome]}});
        });
        const complete: VendorCalibrationOperationRecord = {...stored, sourceFingerprint: original.sourceFingerprint,
          snapshots, state: "applied", revision: 2, updatedAt: now, receipt};
        transaction.create(log, terminal);
        transaction.update(journal, {...complete});
        transaction.update(originalReference, {state: "rolled_back", revision: original.revision + 1,
          updatedAt: now, rollbackOperationId: identity.operationId});
        this.hooks.beforeRollbackCommit?.();
        return complete;
      });
      this.hooks.afterRollbackCommit?.();
      return result(restored);
    } catch (error) {
      const observed = assertInverse((await journal.get()).data());
      if (observed.state !== "pending") return result(observed);
      try {
        const failed = await this.firestore.runTransaction(async (transaction) => {
          const stored = assertInverse((await transaction.get(journal)).data());
          if (stored.state !== "pending") return stored;
          const failureCode = error instanceof ApplyFailure ? error.code :
            error instanceof CalibrationRolloutError ? "OPERATION_CONFLICT" : "APPLY_FAILED";
          const now = new Date().toISOString();
          const receipt: VendorCalibrationOperationReceipt = {schemaVersion: 1, operationId: identity.operationId,
            kind: "rollback", originalOperationId, revision: 2, versionId: stored.versionId, completedAt: now,
            vendorCalibrationLogPath: log.path, state: "not_applied", targets: [], failureCode};
          const terminal: VendorCalibrationTerminalLog = {schemaVersion: 1, operationId: identity.operationId,
            vendorUid, requestFingerprint: identity.requestFingerprint, sourceFingerprint: null,
            requestedInstituteIds: stored.targets.map((target) => target.instituteId), receipt};
          const complete: VendorCalibrationOperationRecord = {...stored, state: "not_applied", revision: 2,
            updatedAt: now, receipt};
          transaction.create(log, terminal);
          transaction.update(journal, {...complete});
          this.hooks.beforeFailureCommit?.();
          return complete;
        });
        return result(failed);
      } catch {
        return result(assertInverse((await journal.get()).data()));
      }
    }
  }
}

export const calibrationRolloutService = new CalibrationRolloutService();
