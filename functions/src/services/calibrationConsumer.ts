/* eslint-disable require-jsdoc */
import {createHash} from "node:crypto";
import type {FrozenCalibrationSource} from
  "../../../shared/contracts/calibrationConsumer";
import {
  assertExactCalibrationKeys,
  isPlainCalibrationObject,
  normalizeCalibrationDocumentId,
  validateStoredCalibrationVersion,
  ValidatedStoredCalibrationVersion,
} from "./calibrationContract";

export type {FrozenCalibrationSource};
const invalid = (message: string): Error => new Error(message);

export const calibrationFingerprint = (
  source: ValidatedStoredCalibrationVersion,
): string => createHash("sha256").update(JSON.stringify([
  1, source.versionId,
  [source.weights.guessWeight, source.weights.phaseWeight,
    source.weights.easyNeglectWeight, source.weights.hardBiasWeight,
    source.weights.wrongStreakWeight],
  [source.thresholds.guessFactorEasy, source.thresholds.guessFactorMedium,
    source.thresholds.guessFactorHard, source.thresholds.phaseDeviationThreshold],
  source.createdBy, source.createdAt, source.activationDate, source.isActive,
])).digest("hex");

export const freezeCalibration = (
  value: unknown, instituteId: string, versionId: string,
): FrozenCalibrationSource => {
  normalizeCalibrationDocumentId(instituteId, "instituteId", invalid);
  normalizeCalibrationDocumentId(versionId, "versionId", invalid);
  const sourcePath = `institutes/${instituteId}/calibration/${versionId}`;
  const source = validateStoredCalibrationVersion(
    value, versionId, sourcePath, new Date(), invalid,
  );
  if (!source.isActive) throw invalid("Calibration source must be active.");
  return {...source, isActive: true, schemaVersion: 1,
    model: "risk_projection_v1", instituteId, sourcePath,
    fingerprint: calibrationFingerprint(source)};
};

export const validateFrozenCalibration = (
  value: unknown, instituteId: string, versionId: unknown,
): FrozenCalibrationSource => {
  if (!isPlainCalibrationObject(value)) {
    throw invalid("Frozen calibration source is required.");
  }
  assertExactCalibrationKeys(value, ["schemaVersion", "model", "instituteId",
    "sourcePath", "fingerprint", "versionId", "weights", "thresholds",
    "createdBy", "createdAt", "activationDate", "isActive"], "snapshot", invalid);
  const id = normalizeCalibrationDocumentId(versionId, "versionId", invalid);
  const validated = freezeCalibration(value, instituteId, id);
  if (value.schemaVersion !== 1 || value.model !== validated.model ||
    value.instituteId !== instituteId || value.sourcePath !== validated.sourcePath ||
    value.fingerprint !== validated.fingerprint) {
    throw invalid("Frozen calibration identity/fingerprint mismatch.");
  }
  return validated;
};

export const assertSameFrozenCalibration = (
  run: Record<string, unknown>, session: Record<string, unknown>,
  instituteId: string,
): FrozenCalibrationSource | undefined => {
  if (run.calibrationSnapshot === undefined &&
    session.calibrationSnapshot === undefined) {
    if (run.calibrationModel === "risk_projection_v1" ||
      session.calibrationModel === "risk_projection_v1") {
      throw invalid("Frozen calibration source is required.");
    }
    return undefined;
  }
  // Existing runs are not rewritten. A newly started session may freeze their
  // version's validated source; already-existing legacy sessions stay legacy.
  if (run.calibrationSnapshot === undefined) {
    if (run.calibrationModel === "risk_projection_v1") {
      throw invalid("Frozen run calibration source is required.");
    }
    const frozen = validateFrozenCalibration(
      session.calibrationSnapshot, instituteId, session.calibrationVersion,
    );
    if (frozen.versionId !== run.calibrationVersion) {
      throw invalid("Session calibration differs from legacy run version.");
    }
    return frozen;
  }
  const original = validateFrozenCalibration(
    run.calibrationSnapshot, instituteId, run.calibrationVersion,
  );
  const frozen = validateFrozenCalibration(
    session.calibrationSnapshot, instituteId, session.calibrationVersion,
  );
  if (original.fingerprint !== frozen.fingerprint) {
    throw invalid("Session calibration differs from immutable run source.");
  }
  return frozen;
};
