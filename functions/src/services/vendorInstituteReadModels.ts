/* eslint-disable require-jsdoc */
import {createHash} from "node:crypto";
import {FieldPath, Timestamp} from "firebase-admin/firestore";
import type {
  VendorInstituteAccessStatus,
  VendorInstituteAdministratorRecord,
  VendorInstituteAggregateSummary,
  VendorInstituteCommercialReference,
  VendorInstituteDeletionSummary,
  VendorInstituteDetail,
  VendorInstituteLicenseLayer,
  VendorInstituteLicenseState,
  VendorInstituteLifecycleState,
  VendorInstituteListResult,
  VendorInstituteSummary,
  VendorPrimaryAdministratorSummary,
} from "../../../shared/contracts/vendorInstitutes";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  VendorInstituteDetailValidatedRequest,
  VendorInstituteListValidatedRequest,
  VendorInstituteValidationError,
} from "../types/vendorInstitutes";

const INSTITUTES_COLLECTION = "institutes";
const LICENSE_COLLECTION = "license";
const CURRENT_LICENSE_DOCUMENT = "current";
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;
const MAX_STAFF_RECORDS = 100;
const MAX_CURSOR_LENGTH = 4096;
const MAX_QUERY_LENGTH = 80;
const MAX_IDENTIFIER_LENGTH = 128;
const LIFECYCLE_STATES: readonly VendorInstituteLifecycleState[] = [
  "onboarding",
  "active",
  "suspended",
  "archived",
  "deletion_scheduled",
  "purging",
  "purged",
  "recovery_required",
];
const LICENSE_LAYERS: readonly VendorInstituteLicenseLayer[] = [
  "L0",
  "L1",
  "L2",
  "L3",
];
const LICENSE_STATES: readonly VendorInstituteLicenseState[] = [
  "active",
  "grace",
  "expired",
];

interface VendorInstituteReadModelDependencies {
  firestore: FirebaseFirestore.Firestore;
}

interface VendorInstituteListInput {
  actorId?: unknown;
  actorRole?: unknown;
  cursor?: unknown;
  lifecycleState?: unknown;
  licenseLayer?: unknown;
  limit?: unknown;
  query?: unknown;
}

interface VendorInstituteDetailInput {
  actorId?: unknown;
  actorRole?: unknown;
  instituteId?: unknown;
}

interface VendorInstituteCursor {
  fingerprint: string;
  instituteId: string;
  updatedAtMillis: number;
  version: 1;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const validationError = (message: string): never => {
  throw new VendorInstituteValidationError("VALIDATION_ERROR", message);
};

const authorityError = (message: string): never => {
  throw new VendorInstituteValidationError("INTERNAL_ERROR", message);
};

const requiredInputString = (
  value: unknown,
  field: string,
  maximumLength = 256,
): string => {
  if (typeof value !== "string" || !value.trim()) {
    return validationError(`Field "${field}" must be a non-empty string.`);
  }
  const normalized = value.trim();
  if (normalized.length > maximumLength) {
    return validationError(
      `Field "${field}" must be at most ${maximumLength} characters.`,
    );
  }
  return normalized;
};

const optionalInputString = (
  value: unknown,
  field: string,
  maximumLength: number,
): string | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  return requiredInputString(value, field, maximumLength);
};

const requireVendorContext = (input: {
  actorId?: unknown;
  actorRole?: unknown;
}): {actorId: string; actorRole: "vendor"} => {
  const actorId = requiredInputString(input.actorId, "actorId", MAX_IDENTIFIER_LENGTH);
  const actorRole = requiredInputString(input.actorRole, "actorRole", 32).toLowerCase();
  if (actorRole !== "vendor") {
    throw new VendorInstituteValidationError(
      "FORBIDDEN",
      "Vendor institute reads require current Vendor authority.",
    );
  }
  return {actorId, actorRole: "vendor"};
};

const storedString = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !value.trim()) {
    return authorityError(`Persisted field "${field}" is invalid.`);
  }
  return value.trim();
};

const storedOptionalString = (value: unknown, field: string): string | null => {
  if (value === undefined || value === null) return null;
  return storedString(value, field);
};

const storedInteger = (value: unknown, field: string, minimum = 0): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) {
    return authorityError(`Persisted field "${field}" is invalid.`);
  }
  return value;
};

const storedNullableInteger = (value: unknown, field: string): number | null => {
  if (value === undefined || value === null) return null;
  return storedInteger(value, field);
};

const storedTimestamp = (value: unknown, field: string): Timestamp => {
  if (!(value instanceof Timestamp)) {
    return authorityError(`Persisted field "${field}" is not a timestamp.`);
  }
  return value;
};

const storedNullableTimestamp = (value: unknown, field: string): string | null => {
  if (value === undefined || value === null) return null;
  return storedTimestamp(value, field).toDate().toISOString();
};

const storedLifecycleState = (value: unknown): VendorInstituteLifecycleState => {
  if (!LIFECYCLE_STATES.includes(value as VendorInstituteLifecycleState)) {
    return authorityError("Persisted Vendor institute lifecycle state is invalid.");
  }
  return value as VendorInstituteLifecycleState;
};

const storedAccessStatus = (value: unknown): VendorInstituteAccessStatus => {
  if (value !== "active" && value !== "suspended") {
    return authorityError("Persisted institute access status is invalid.");
  }
  return value;
};

const assertStatusAlignment = (
  accessStatus: VendorInstituteAccessStatus,
  lifecycleState: VendorInstituteLifecycleState,
): void => {
  const expectedStatus = lifecycleState === "active" ? "active" : "suspended";
  if (accessStatus !== expectedStatus) {
    authorityError("Institute access status conflicts with Vendor lifecycle authority.");
  }
};

const aggregateSummary = (value: unknown): VendorInstituteAggregateSummary => {
  if (value === undefined || value === null) {
    return {
      activeStudentCount: null,
      aggregateAsOf: null,
      lastActiveAt: null,
      monthlyTestRuns: null,
    };
  }
  if (!isRecord(value)) {
    return authorityError("Persisted Vendor aggregate summary is invalid.");
  }
  return {
    activeStudentCount: storedNullableInteger(
      value.activeStudentCount,
      "vendorSummary.activeStudentCount",
    ),
    aggregateAsOf: storedNullableTimestamp(
      value.aggregateAsOf,
      "vendorSummary.aggregateAsOf",
    ),
    lastActiveAt: storedNullableTimestamp(
      value.lastActiveAt,
      "vendorSummary.lastActiveAt",
    ),
    monthlyTestRuns: storedNullableInteger(
      value.monthlyTestRuns,
      "vendorSummary.monthlyTestRuns",
    ),
  };
};

const licenseLayer = (value: unknown, field: string): VendorInstituteLicenseLayer => {
  if (!LICENSE_LAYERS.includes(value as VendorInstituteLicenseLayer)) {
    return authorityError(`Persisted field "${field}" is invalid.`);
  }
  return value as VendorInstituteLicenseLayer;
};

const commercialReference = (
  institute: Record<string, unknown>,
  licenseSnapshot: FirebaseFirestore.DocumentSnapshot,
): VendorInstituteCommercialReference => {
  if (!licenseSnapshot.exists) {
    if (institute.vendorLicenseLayer !== undefined &&
      institute.vendorLicenseLayer !== null) {
      return authorityError(
        "Institute license-layer projection exists without license/current authority.",
      );
    }
    return {
      authorityState: "not_configured",
      licenseLayer: null,
      licenseState: null,
      licenseVersion: null,
      planId: null,
    };
  }
  const license = licenseSnapshot.data();
  if (!isRecord(license)) {
    return authorityError("Persisted license/current authority is invalid.");
  }
  const layer = licenseLayer(license.currentLayer, "license.currentLayer");
  if (institute.vendorLicenseLayer !== layer) {
    return authorityError(
      "Institute license-layer projection conflicts with license/current authority.",
    );
  }
  if (!LICENSE_STATES.includes(license.licenseState as VendorInstituteLicenseState)) {
    return authorityError("Persisted field \"license.licenseState\" is invalid.");
  }
  return {
    authorityState: "available",
    licenseLayer: layer,
    licenseState: license.licenseState as VendorInstituteLicenseState,
    licenseVersion: storedString(
      license.licenseVersion,
      "license.licenseVersion",
    ),
    planId: storedString(license.planId, "license.planId"),
  };
};

const administratorRecords = (
  institute: Record<string, unknown>,
): {
  administrators: VendorInstituteAdministratorRecord[];
  primaryAdministrator: VendorPrimaryAdministratorSummary | null;
} => {
  const usersValue = institute.settingsUsers;
  if (usersValue === undefined || usersValue === null) {
    if (institute.primaryAdminUserId !== undefined &&
      institute.primaryAdminUserId !== null) {
      return authorityError(
        "Primary administrator is set without settingsUsers authority.",
      );
    }
    return {administrators: [], primaryAdministrator: null};
  }
  if (!isRecord(usersValue)) {
    return authorityError("Persisted settingsUsers authority is invalid.");
  }
  const pendingValue = institute.pendingPrimaryAdministrator;
  let pending: {
    currentPrimaryUserId: string | null;
    kind: "initial" | "replacement";
    userId: string;
  } | null = null;
  if (pendingValue !== undefined && pendingValue !== null) {
    if (!isRecord(pendingValue)) {
      return authorityError("Persisted pending primary-administrator authority is invalid.");
    }
    const kind = storedString(
      pendingValue.kind,
      "pendingPrimaryAdministrator.kind",
    );
    if (kind !== "initial" && kind !== "replacement") {
      return authorityError("Persisted pending primary-administrator kind is invalid.");
    }
    storedTimestamp(
      pendingValue.proposedAt,
      "pendingPrimaryAdministrator.proposedAt",
    );
    pending = {
      currentPrimaryUserId: storedOptionalString(
        pendingValue.currentPrimaryUserId,
        "pendingPrimaryAdministrator.currentPrimaryUserId",
      ),
      kind,
      userId: storedString(
        pendingValue.userId,
        "pendingPrimaryAdministrator.userId",
      ),
    };
  }
  const entries = Object.entries(usersValue);
  if (entries.length > MAX_STAFF_RECORDS) {
    return authorityError(
      `Persisted settingsUsers exceeds the ${MAX_STAFF_RECORDS}-record bound.`,
    );
  }
  const primaryAdminUserId = storedOptionalString(
    institute.primaryAdminUserId,
    "primaryAdminUserId",
  );
  if (entries.length > 0 && !primaryAdminUserId && !pending) {
    return authorityError("Persisted primary-administrator authority is missing.");
  }
  const administrators = entries.map(([userId, rawValue]) => {
    if (!isRecord(rawValue)) {
      return authorityError(`Persisted settings user "${userId}" is invalid.`);
    }
    const role = storedString(rawValue.role, `settingsUsers.${userId}.role`).toLowerCase();
    if (role !== "admin" && role !== "teacher" && role !== "director") {
      return authorityError(`Persisted settings user "${userId}" has an invalid role.`);
    }
    const status = storedString(
      rawValue.status,
      `settingsUsers.${userId}.status`,
    ).toLowerCase();
    if (status !== "invitation_pending" &&
      status !== "active" && status !== "suspended") {
      return authorityError(`Persisted settings user "${userId}" has an invalid status.`);
    }
    const invitationValue = rawValue.invitationStatus ??
      (status === "invitation_pending" ? "queued" : "accepted");
    if (invitationValue !== "not_sent" && invitationValue !== "queued" &&
      invitationValue !== "delivered" && invitationValue !== "failed" &&
      invitationValue !== "revoked" && invitationValue !== "accepted") {
      return authorityError(
        `Persisted settings user "${userId}" has an invalid invitation status.`,
      );
    }
    return {
      displayName: storedString(
        rawValue.displayName,
        `settingsUsers.${userId}.displayName`,
      ),
      email: storedString(
        rawValue.email,
        `settingsUsers.${userId}.email`,
      ).toLowerCase(),
      invitationStatus: invitationValue,
      isPrimaryAdministrator: userId === primaryAdminUserId,
      role,
      status,
      updatedAt: storedTimestamp(
        rawValue.updatedAt,
        `settingsUsers.${userId}.updatedAt`,
      ).toDate().toISOString(),
      userId,
    } as VendorInstituteAdministratorRecord;
  }).sort((left, right) => left.userId.localeCompare(right.userId));
  const primary = primaryAdminUserId ?
    administrators.find((record) => record.userId === primaryAdminUserId) :
    undefined;
  if (primaryAdminUserId && (!primary || primary.role !== "admin")) {
    return authorityError("Persisted primary-administrator record is invalid.");
  }
  if (pending) {
    const candidate = administrators.find((record) => record.userId === pending.userId);
    if (!candidate || candidate.role !== "admin" ||
      candidate.status !== "invitation_pending" ||
      candidate.invitationStatus === "accepted" ||
      candidate.invitationStatus === "revoked") {
      return authorityError("Persisted pending primary-administrator candidate is invalid.");
    }
    if (pending.kind === "initial" &&
      (primaryAdminUserId !== null || pending.currentPrimaryUserId !== null)) {
      return authorityError("Persisted initial primary-administrator authority is invalid.");
    }
    if (pending.kind === "replacement" &&
      (!primaryAdminUserId || pending.currentPrimaryUserId !== primaryAdminUserId ||
        pending.userId === primaryAdminUserId)) {
      return authorityError("Persisted replacement primary-administrator authority is invalid.");
    }
  }
  return {
    administrators,
    primaryAdministrator: primary ? {
      displayName: primary.displayName,
      email: primary.email,
      invitationStatus: primary.invitationStatus,
      status: primary.status,
      updatedAt: primary.updatedAt,
      userId: primary.userId,
    } : null,
  };
};

const deletionSummary = (value: unknown): VendorInstituteDeletionSummary => {
  if (value === undefined || value === null) {
    return {
      eligibleAt: null,
      lastErrorCode: null,
      operationId: null,
      scheduledAt: null,
      stage: "none",
    };
  }
  if (!isRecord(value)) {
    return authorityError("Persisted deletion operation is invalid.");
  }
  const stage = storedString(value.stage, "deletionOperation.stage").toLowerCase();
  if (stage !== "scheduled" && stage !== "quiescing" && stage !== "purging" &&
    stage !== "failed" && stage !== "purged") {
    return authorityError("Persisted deletion operation stage is invalid.");
  }
  return {
    eligibleAt: storedNullableTimestamp(
      value.eligibleAt,
      "deletionOperation.eligibleAt",
    ),
    lastErrorCode: storedOptionalString(
      value.lastErrorCode,
      "deletionOperation.lastErrorCode",
    ),
    operationId: storedString(
      value.operationId,
      "deletionOperation.operationId",
    ),
    scheduledAt: storedNullableTimestamp(
      value.scheduledAt,
      "deletionOperation.scheduledAt",
    ),
    stage,
  } as VendorInstituteDeletionSummary;
};

const assertDeletionAlignment = (
  lifecycleState: VendorInstituteLifecycleState,
  deletion: VendorInstituteDeletionSummary,
): void => {
  const aligned =
    (lifecycleState === "deletion_scheduled" && deletion.stage === "scheduled") ||
    (lifecycleState === "purging" &&
      (deletion.stage === "quiescing" || deletion.stage === "purging")) ||
    (lifecycleState === "purged" && deletion.stage === "purged") ||
    (lifecycleState === "recovery_required" && deletion.stage === "failed") ||
    (![
      "deletion_scheduled",
      "purging",
      "purged",
      "recovery_required",
    ].includes(lifecycleState) && deletion.stage === "none");
  if (!aligned) {
    authorityError(
      "Persisted deletion operation conflicts with Vendor lifecycle authority.",
    );
  }
};

const instituteProjection = (
  document: FirebaseFirestore.DocumentSnapshot,
  licenseSnapshot: FirebaseFirestore.DocumentSnapshot,
): {
  administrators: VendorInstituteAdministratorRecord[];
  detail: VendorInstituteDetail;
  summary: VendorInstituteSummary;
} => {
  if (!document.exists || !isRecord(document.data())) {
    return authorityError("Persisted institute authority is unavailable.");
  }
  const institute = document.data() as Record<string, unknown>;
  const instituteId = storedString(institute.instituteId, "instituteId");
  if (instituteId !== document.id) {
    return authorityError("Persisted institute identity conflicts with its document path.");
  }
  const lifecycleState = storedLifecycleState(institute.vendorLifecycleState);
  const accessStatus = storedAccessStatus(institute.status);
  assertStatusAlignment(accessStatus, lifecycleState);
  const administration = administratorRecords(institute);
  const registeredName = storedString(institute.registeredName, "registeredName");
  const deletion = deletionSummary(institute.deletionOperation);
  assertDeletionAlignment(lifecycleState, deletion);
  const summary: VendorInstituteSummary = {
    accessStatus,
    aggregate: aggregateSummary(institute.vendorSummary),
    commercial: commercialReference(institute, licenseSnapshot),
    createdAt: storedTimestamp(institute.createdAt, "createdAt").toDate().toISOString(),
    instituteId,
    lifecycleState,
    primaryAdministrator: administration.primaryAdministrator,
    registeredName,
    revision: storedInteger(institute.instituteRevision, "instituteRevision", 1),
    updatedAt: storedTimestamp(institute.updatedAt, "updatedAt").toDate().toISOString(),
  };
  const detail: VendorInstituteDetail = {
    ...summary,
    administrators: administration.administrators,
    deletion,
    profile: {
      registeredName,
      vendorAccountReference: storedOptionalString(
        institute.vendorAccountReference,
        "vendorAccountReference",
      ),
    },
    settingsRevision: storedInteger(
      institute.settingsRevision,
      "settingsRevision",
    ),
  };
  return {administrators: administration.administrators, detail, summary};
};

const fingerprint = (request: VendorInstituteListValidatedRequest): string =>
  createHash("sha256").update(JSON.stringify({
    lifecycleState: request.lifecycleState ?? null,
    licenseLayer: request.licenseLayer ?? null,
    query: request.query ?? null,
  })).digest("hex");

const encodeCursor = (value: VendorInstituteCursor): string =>
  Buffer.from(JSON.stringify(value), "utf8").toString("base64url");

const decodeCursor = (
  value: string,
  expectedFingerprint: string,
): VendorInstituteCursor => {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as unknown;
    if (!isRecord(parsed) || parsed.version !== 1 ||
      parsed.fingerprint !== expectedFingerprint ||
      typeof parsed.instituteId !== "string" || !parsed.instituteId ||
      typeof parsed.updatedAtMillis !== "number" ||
      !Number.isSafeInteger(parsed.updatedAtMillis) ||
      parsed.updatedAtMillis < 0) {
      throw new Error("Invalid Vendor institute cursor.");
    }
    return parsed as unknown as VendorInstituteCursor;
  } catch {
    return validationError(
      "Field \"cursor\" is invalid or does not match the active filters.",
    );
  }
};

export class VendorInstituteReadModelsService {
  constructor(
    private readonly dependencies: VendorInstituteReadModelDependencies = {
      firestore: getFirestore(),
    },
  ) {}

  public normalizeListRequest(
    input: VendorInstituteListInput,
  ): VendorInstituteListValidatedRequest {
    const context = requireVendorContext(input);
    const limit = input.limit === undefined ? DEFAULT_LIMIT : input.limit;
    if (typeof limit !== "number" || !Number.isSafeInteger(limit) ||
      limit < 1 || limit > MAX_LIMIT) {
      return validationError(`Field "limit" must be an integer from 1 to ${MAX_LIMIT}.`);
    }
    let lifecycleState: VendorInstituteLifecycleState | undefined;
    if (input.lifecycleState !== undefined) {
      const normalized = requiredInputString(
        input.lifecycleState,
        "lifecycleState",
        40,
      ).toLowerCase();
      if (!LIFECYCLE_STATES.includes(normalized as VendorInstituteLifecycleState)) {
        return validationError("Field \"lifecycleState\" is invalid.");
      }
      lifecycleState = normalized as VendorInstituteLifecycleState;
    }
    let requestedLicenseLayer: VendorInstituteLicenseLayer | undefined;
    if (input.licenseLayer !== undefined) {
      const normalized = requiredInputString(
        input.licenseLayer,
        "licenseLayer",
        2,
      ).toUpperCase();
      if (!LICENSE_LAYERS.includes(normalized as VendorInstituteLicenseLayer)) {
        return validationError("Field \"licenseLayer\" is invalid.");
      }
      requestedLicenseLayer = normalized as VendorInstituteLicenseLayer;
    }
    const queryValue = optionalInputString(
      input.query,
      "query",
      MAX_QUERY_LENGTH,
    )?.toLowerCase().replace(/\s+/gu, " ");
    const cursor = optionalInputString(
      input.cursor,
      "cursor",
      MAX_CURSOR_LENGTH,
    );
    return {
      ...context,
      ...(cursor ? {cursor} : {}),
      ...(lifecycleState ? {lifecycleState} : {}),
      ...(requestedLicenseLayer ? {licenseLayer: requestedLicenseLayer} : {}),
      limit,
      ...(queryValue ? {query: queryValue} : {}),
    };
  }

  public normalizeDetailRequest(
    input: VendorInstituteDetailInput,
  ): VendorInstituteDetailValidatedRequest {
    return {
      ...requireVendorContext(input),
      instituteId: requiredInputString(
        input.instituteId,
        "instituteId",
        MAX_IDENTIFIER_LENGTH,
      ),
    };
  }

  public async listInstitutes(
    rawRequest: VendorInstituteListValidatedRequest,
  ): Promise<VendorInstituteListResult> {
    const request = this.normalizeListRequest(rawRequest);
    let filteredQuery: FirebaseFirestore.Query =
      this.dependencies.firestore.collection(INSTITUTES_COLLECTION);
    if (request.lifecycleState) {
      filteredQuery = filteredQuery.where(
        "vendorLifecycleState",
        "==",
        request.lifecycleState,
      );
    }
    if (request.licenseLayer) {
      filteredQuery = filteredQuery.where(
        "vendorLicenseLayer",
        "==",
        request.licenseLayer,
      );
    }
    if (request.query) {
      filteredQuery = filteredQuery.where(
        "vendorFilterKeys",
        "array-contains",
        `query=${request.query}`,
      );
    }
    const requestFingerprint = fingerprint(request);
    let pageQuery = filteredQuery
      .orderBy("updatedAt", "desc")
      .orderBy(FieldPath.documentId(), "desc");
    if (request.cursor) {
      const cursor = decodeCursor(request.cursor, requestFingerprint);
      pageQuery = pageQuery.startAfter(
        Timestamp.fromMillis(cursor.updatedAtMillis),
        cursor.instituteId,
      );
    }
    const [pageSnapshot, countSnapshot] = await Promise.all([
      pageQuery.limit(request.limit + 1).get(),
      filteredQuery.count().get(),
    ]);
    const hasMore = pageSnapshot.docs.length > request.limit;
    const selected = pageSnapshot.docs.slice(0, request.limit);
    const licenseSnapshots = selected.length > 0 ?
      await this.dependencies.firestore.getAll(...selected.map((document) =>
        document.ref.collection(LICENSE_COLLECTION).doc(CURRENT_LICENSE_DOCUMENT))) :
      [];
    const items = selected.map((document, index) =>
      instituteProjection(document, licenseSnapshots[index]).summary);
    const last = selected[selected.length - 1];
    const lastUpdatedAt = last?.get("updatedAt");
    const nextCursor = hasMore && last && lastUpdatedAt instanceof Timestamp ?
      encodeCursor({
        fingerprint: requestFingerprint,
        instituteId: last.id,
        updatedAtMillis: lastUpdatedAt.toMillis(),
        version: 1,
      }) : null;
    if (hasMore && !nextCursor) {
      return authorityError("Persisted institute cursor authority is invalid.");
    }
    const totalMatching = countSnapshot.data().count;
    if (!Number.isSafeInteger(totalMatching) || totalMatching < 0) {
      return authorityError("Institute count authority is invalid.");
    }
    return {items, nextCursor, totalMatching};
  }

  public async getInstituteDetail(
    rawRequest: VendorInstituteDetailValidatedRequest,
  ): Promise<VendorInstituteDetail> {
    const request = this.normalizeDetailRequest(rawRequest);
    const instituteReference = this.dependencies.firestore
      .collection(INSTITUTES_COLLECTION)
      .doc(request.instituteId);
    const [instituteSnapshot, licenseSnapshot] = await Promise.all([
      instituteReference.get(),
      instituteReference.collection(LICENSE_COLLECTION)
        .doc(CURRENT_LICENSE_DOCUMENT).get(),
    ]);
    if (!instituteSnapshot.exists) {
      throw new VendorInstituteValidationError(
        "NOT_FOUND",
        "Vendor institute was not found.",
      );
    }
    return instituteProjection(instituteSnapshot, licenseSnapshot).detail;
  }
}

export const vendorInstituteReadModelsService =
  new VendorInstituteReadModelsService();
