import {FieldPath} from "firebase-admin/firestore";
import type {
  VendorCalibrationVersion,
  VendorCalibrationVersionDetailResult,
  VendorCalibrationVersionsQuery,
  VendorCalibrationVersionsResult,
} from "../../../shared/contracts/vendorCalibration";
import {getFirestore} from "../utils/firebaseAdmin";
import {CalibrationSimulationError} from "../types/calibrationSimulation";
import {
  assertExactCalibrationKeys,
  isPlainCalibrationObject,
  normalizeCalibrationDocumentId,
  validateStoredCalibrationVersion,
} from "./calibrationContract";

const invalid = (message: string): Error =>
  new CalibrationSimulationError("VALIDATION_ERROR", message);
const unavailable = (message: string): Error =>
  new CalibrationSimulationError("INTERNAL_ERROR", message);

const projectVersion = (id: string, data: unknown, now: Date): VendorCalibrationVersion => ({
  ...validateStoredCalibrationVersion(data, id, "calibration version", now, unavailable),
  deploymentAvailability: "immediate_selected_targets",
  schemaVersion: 1,
  sourcePath: `globalCalibration/${id}`,
});

const encodeCursor = (lastVersionId: string): string =>
  Buffer.from(JSON.stringify({schemaVersion: 1, query: "calibration_versions", lastVersionId}))
    .toString("base64url");

const decodeCursor = (cursor: unknown): string => {
  if (typeof cursor !== "string" || cursor.length > 512 || !/^[A-Za-z0-9_-]+$/.test(cursor)) {
    throw invalid("Invalid calibration version cursor.");
  }
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  } catch {
    throw invalid("Invalid calibration version cursor.");
  }
  if (!isPlainCalibrationObject(value)) throw invalid("Invalid calibration version cursor.");
  assertExactCalibrationKeys(value, ["schemaVersion", "query", "lastVersionId"], "cursor", invalid);
  const id = normalizeCalibrationDocumentId(value.lastVersionId, "cursor.lastVersionId", invalid);
  if (value.schemaVersion !== 1 || value.query !== "calibration_versions" || encodeCursor(id) !== cursor) {
    throw invalid("Invalid calibration version cursor.");
  }
  return id;
};

export const readCalibrationVersion = async (
  versionId: string,
): Promise<VendorCalibrationVersionDetailResult> => {
  const id = normalizeCalibrationDocumentId(versionId, "versionId", invalid);
  const snapshot = await getFirestore().collection("globalCalibration").doc(id).get();
  if (!snapshot.exists) throw new CalibrationSimulationError("NOT_FOUND", "Calibration version not found.");
  return {version: projectVersion(id, snapshot.data(), new Date())};
};

export const listCalibrationVersions = async (
  input: VendorCalibrationVersionsQuery = {},
): Promise<VendorCalibrationVersionsResult> => {
  assertExactCalibrationKeys(input as Record<string, unknown>, ["limit", "cursor"], "query", invalid);
  const limit = input.limit ?? 25;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw invalid("Version limit must be 1-50.");
  let query = getFirestore().collection("globalCalibration").orderBy(FieldPath.documentId());
  if (input.cursor !== undefined) query = query.startAfter(decodeCursor(input.cursor));
  const snapshot = await query.limit(limit + 1).get();
  const now = new Date();
  // Validate the lookahead too: never hide malformed selected authority.
  const versions = snapshot.docs.map((doc) => projectVersion(doc.id, doc.data(), now));
  const hasMore = versions.length > limit;
  const items = versions.slice(0, limit);
  return {items, hasMore, nextCursor: hasMore ? encodeCursor(items[items.length - 1].versionId) : null};
};
