/* eslint-disable max-len, require-jsdoc */
import {createHash} from "node:crypto";
import {Timestamp} from "firebase-admin/firestore";
import type {
  VendorCommercialAuditReference,
  VendorLicenseRequestDecisionIntent,
  VendorLicenseRequestDecisionReceipt,
  VendorLicenseRequestDecisionState,
  VendorLicenseRequestDetail,
  VendorLicenseRequestStatus,
  VendorLicenseRequestSummary,
} from "../../../shared/contracts/vendorCommercial";
import {
  VendorLicenseRequestDecisionValidatedRequest,
  VendorLicenseRequestDetailValidatedRequest,
  VendorLicenseRequestListResult,
  VendorLicenseRequestListValidatedRequest,
  VendorCommercialValidationError,
} from "../types/vendorCommercial";
import {getFirestore} from "../utils/firebaseAdmin";

const LICENSE_REQUESTS_COLLECTION = "licenseRequests";
const LICENSE_REQUEST_AUDIT_COLLECTION = "licenseRequestAudit";
const LICENSE_REQUEST_STATE_COLLECTION = "licenseRequestState";
const LICENSE_REQUEST_STATE_DOCUMENT = "current";
const LICENSE_COLLECTION = "license";
const CURRENT_LICENSE_DOCUMENT = "current";
const COMMERCIAL_COMMANDS_COLLECTION = "commercialCommands";
const ROOT_AUDIT_COLLECTION = "vendorAuditLogs";
const INSTITUTE_AUDIT_COLLECTION = "auditLogs";
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;
const MAX_CURSOR_LENGTH = 4096;
const MAX_IDENTIFIER_LENGTH = 128;
const MAX_NOTE_LENGTH = 1000;

const REQUEST_STATUSES: readonly VendorLicenseRequestStatus[] = [
  "pending",
  "payment_required",
  "approved",
  "rejected",
];
const DECISION_STATES: readonly VendorLicenseRequestDecisionState[] = [
  "undecided",
  "provider_pending",
  "provider_failed",
  "decided",
];
const LICENSE_LAYERS = ["L0", "L1", "L2", "L3"] as const;

interface VendorLicenseRequestDependencies {
  firestore: FirebaseFirestore.Firestore;
  now: () => Date;
}

interface VendorLicenseRequestListInput {
  actorId?: unknown;
  actorRole?: unknown;
  cursor?: unknown;
  instituteId?: unknown;
  limit?: unknown;
  requestedLayer?: unknown;
  status?: unknown;
}

interface VendorLicenseRequestDetailInput {
  actorId?: unknown;
  actorRole?: unknown;
  instituteId?: unknown;
  ipAddress?: unknown;
  requestId?: unknown;
  userAgent?: unknown;
}

interface VendorLicenseRequestDecisionInput
  extends VendorLicenseRequestDetailInput {
  action?: unknown;
  expectedRevision?: unknown;
  idempotencyKey?: unknown;
  note?: unknown;
  reason?: unknown;
}

interface RequestCursor {
  fingerprint: string;
  instituteId: string;
  requestId: string;
  submittedAtMillis: number;
  version: 1;
}

interface ParsedRequestAuthority {
  decisionAuditEventIds: string[];
  detail: VendorLicenseRequestDetail;
  expectedLicenseVersion: string;
  submissionAuditEventId: string;
}

interface DecisionCommandAuthority {
  auditEventId: string;
  commandId: string;
  fingerprint: string;
  idempotencyKeyHash: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const validationError = (message: string): never => {
  throw new VendorCommercialValidationError("VALIDATION_ERROR", message);
};

const authorityError = (message: string): never => {
  throw new VendorCommercialValidationError("INTERNAL_ERROR", message);
};

const inputString = (
  value: unknown,
  field: string,
  maximumLength: number,
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
  return inputString(value, field, maximumLength);
};

const identifier = (value: unknown, field: string): string => {
  const normalized = inputString(value, field, MAX_IDENTIFIER_LENGTH);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(normalized)) {
    return validationError(`Field "${field}" has an invalid identifier.`);
  }
  return normalized;
};

const vendorContext = (input: {
  actorId?: unknown;
  actorRole?: unknown;
}): {actorId: string; actorRole: "vendor"} => {
  const actorId = identifier(input.actorId, "actorId");
  const actorRole = inputString(input.actorRole, "actorRole", 32).toLowerCase();
  if (actorRole !== "vendor") {
    throw new VendorCommercialValidationError(
      "FORBIDDEN",
      "Vendor commercial authority is required.",
    );
  }
  return {actorId, actorRole: "vendor"};
};

const optionalContextString = (
  value: unknown,
  field: string,
): string | undefined => optionalInputString(value, field, 1024);

const positiveInteger = (value: unknown, field: string): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    return validationError(`Field "${field}" must be a positive integer.`);
  }
  return value;
};

const normalizedLimit = (value: unknown): number => {
  if (value === undefined || value === null || value === "") return DEFAULT_LIMIT;
  const limit = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    return validationError(`Field "limit" must be an integer from 1 to ${MAX_LIMIT}.`);
  }
  return limit;
};

const requestStatus = (
  value: unknown,
  field: string,
): VendorLicenseRequestStatus => {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!REQUEST_STATUSES.includes(normalized as VendorLicenseRequestStatus)) {
    return authorityError(`Persisted field "${field}" is invalid.`);
  }
  return normalized as VendorLicenseRequestStatus;
};

const inputRequestStatus = (value: unknown): VendorLicenseRequestStatus | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  const normalized = inputString(value, "status", 32).toLowerCase();
  if (!REQUEST_STATUSES.includes(normalized as VendorLicenseRequestStatus)) {
    return validationError("Field \"status\" is invalid.");
  }
  return normalized as VendorLicenseRequestStatus;
};

const licenseLayer = (value: unknown, field: string): typeof LICENSE_LAYERS[number] => {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!LICENSE_LAYERS.includes(normalized as typeof LICENSE_LAYERS[number])) {
    return authorityError(`Persisted field "${field}" is invalid.`);
  }
  return normalized as typeof LICENSE_LAYERS[number];
};

const inputLicenseLayer = (value: unknown): typeof LICENSE_LAYERS[number] | undefined => {
  if (value === undefined || value === null || value === "") return undefined;
  const normalized = inputString(value, "requestedLayer", 2).toUpperCase();
  if (!LICENSE_LAYERS.includes(normalized as typeof LICENSE_LAYERS[number])) {
    return validationError("Field \"requestedLayer\" is invalid.");
  }
  return normalized as typeof LICENSE_LAYERS[number];
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

const storedTimestamp = (value: unknown, field: string): Timestamp => {
  if (!(value instanceof Timestamp) || Number.isNaN(value.toDate().getTime())) {
    return authorityError(`Persisted field "${field}" is not a valid timestamp.`);
  }
  return value;
};

const storedRevision = (value: unknown): number => {
  if (value === undefined || value === null) return 1;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    return authorityError("Persisted request revision is invalid.");
  }
  return value;
};

const storedStringArray = (value: unknown, field: string): string[] => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_LIMIT) {
    return authorityError(`Persisted field "${field}" is invalid.`);
  }
  const normalized = value.map((entry, index) =>
    storedString(entry, `${field}[${index}]`));
  if (new Set(normalized).size !== normalized.length) {
    return authorityError(`Persisted field "${field}" contains duplicates.`);
  }
  return normalized;
};

const decisionState = (
  value: unknown,
  status: VendorLicenseRequestStatus,
): VendorLicenseRequestDecisionState => {
  if (value === undefined || value === null) {
    return status === "pending" ? "undecided" : "decided";
  }
  if (!DECISION_STATES.includes(value as VendorLicenseRequestDecisionState)) {
    return authorityError("Persisted request decision state is invalid.");
  }
  return value as VendorLicenseRequestDecisionState;
};

const submissionAuditId = (
  value: unknown,
  requestId: string,
): string => {
  if (value !== undefined && value !== null) {
    return storedString(value, "request.submissionAuditEventId");
  }
  const prefix = "license_request_";
  if (!requestId.startsWith(prefix) || requestId.length === prefix.length) {
    return authorityError("License request has no submission-audit authority.");
  }
  return `license_request_audit_${requestId.slice(prefix.length)}`;
};

const parseRequest = (
  document: FirebaseFirestore.DocumentSnapshot,
): ParsedRequestAuthority => {
  const value = document.data();
  if (!document.exists || !isRecord(value)) {
    throw new VendorCommercialValidationError(
      "NOT_FOUND",
      "License request was not found.",
    );
  }
  const instituteReference = document.ref.parent.parent;
  if (!instituteReference || instituteReference.parent.id !== "institutes") {
    return authorityError("License request is outside institute authority.");
  }
  const instituteId = storedString(value.instituteId, "request.instituteId");
  if (instituteId !== instituteReference.id) {
    return authorityError("License request institute authority is inconsistent.");
  }
  const storedRequestId = value.requestId === undefined ? document.id :
    storedString(value.requestId, "request.requestId");
  if (storedRequestId !== document.id) {
    return authorityError("License request identity is inconsistent.");
  }
  const kind = storedString(value.requestKind, "request.requestKind").toLowerCase();
  if (kind !== "evaluation" && kind !== "upgrade") {
    return authorityError("Persisted request kind is invalid.");
  }
  const status = requestStatus(value.status, "request.status");
  const submittedAt = storedTimestamp(value.submittedAt, "request.submittedAt");
  const updatedAt = value.updatedAt === undefined ? submittedAt :
    storedTimestamp(value.updatedAt, "request.updatedAt");
  const revision = storedRevision(value.revision);
  const summary: VendorLicenseRequestSummary = {
    createdAt: submittedAt.toDate().toISOString(),
    currentLayer: licenseLayer(value.currentLayer, "request.currentLayer"),
    decisionState: decisionState(value.decisionState, status),
    instituteId,
    requestId: document.id,
    requestedLayer: licenseLayer(value.requestedLayer, "request.requestedLayer"),
    requestedPlanId: storedString(value.requestedPlanId, "request.requestedPlanId"),
    revision,
    status,
    updatedAt: updatedAt.toDate().toISOString(),
  };
  return {
    decisionAuditEventIds: storedStringArray(
      value.decisionAuditEventIds,
      "request.decisionAuditEventIds",
    ),
    detail: {
      ...summary,
      audit: [],
      decisionNote: storedOptionalString(value.decisionNote, "request.decisionNote"),
      providerOperation: null,
      reason: storedString(value.reason, "request.reason"),
      requestKind: kind,
    },
    expectedLicenseVersion: storedString(
      value.expectedLicenseVersion,
      "request.expectedLicenseVersion",
    ),
    submissionAuditEventId: submissionAuditId(
      value.submissionAuditEventId,
      document.id,
    ),
  };
};

const requestSummary = (
  detail: VendorLicenseRequestDetail,
): VendorLicenseRequestSummary => ({
  createdAt: detail.createdAt,
  currentLayer: detail.currentLayer,
  decisionState: detail.decisionState,
  instituteId: detail.instituteId,
  requestId: detail.requestId,
  requestedLayer: detail.requestedLayer,
  requestedPlanId: detail.requestedPlanId,
  revision: detail.revision,
  status: detail.status,
  updatedAt: detail.updatedAt,
});

const stableSerialize = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const filterFingerprint = (
  request: VendorLicenseRequestListValidatedRequest,
): string => sha256(stableSerialize({
  instituteId: request.instituteId ?? null,
  requestedLayer: request.requestedLayer ?? null,
  status: request.status ?? null,
}));

const encodeCursor = (cursor: RequestCursor): string =>
  Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");

const decodeCursor = (value: string, fingerprint: string): RequestCursor => {
  if (value.length > MAX_CURSOR_LENGTH) {
    return validationError("Field \"cursor\" is too long.");
  }
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!isRecord(parsed) || parsed.version !== 1 ||
      parsed.fingerprint !== fingerprint ||
      typeof parsed.submittedAtMillis !== "number" ||
      !Number.isSafeInteger(parsed.submittedAtMillis) ||
      parsed.submittedAtMillis < 0) {
      return validationError("Field \"cursor\" is invalid for these filters.");
    }
    return {
      fingerprint,
      instituteId: identifier(parsed.instituteId, "cursor.instituteId"),
      requestId: identifier(parsed.requestId, "cursor.requestId"),
      submittedAtMillis: parsed.submittedAtMillis,
      version: 1,
    };
  } catch (error) {
    if (error instanceof VendorCommercialValidationError) throw error;
    return validationError("Field \"cursor\" is malformed.");
  }
};

const decisionCommandAuthority = (
  request: VendorLicenseRequestDecisionValidatedRequest,
): DecisionCommandAuthority => {
  const keyHash = sha256(
    `${request.actorId}:${request.instituteId}:${request.requestId}:` +
      request.command.idempotencyKey,
  );
  const suffix = keyHash.slice(0, 40);
  return {
    auditEventId: `vendor_license_decision_audit_${suffix}`,
    commandId: `vendor_license_decision_command_${suffix}`,
    fingerprint: sha256(stableSerialize({
      action: request.command.action,
      expectedRevision: request.command.expectedRevision,
      instituteId: request.instituteId,
      note: "note" in request.command ? request.command.note ?? null : null,
      reason: "reason" in request.command ? request.command.reason : null,
      requestId: request.requestId,
    })),
    idempotencyKeyHash: keyHash,
  };
};

const replayReceipt = (
  value: unknown,
  authority: DecisionCommandAuthority,
): VendorLicenseRequestDecisionReceipt => {
  if (!isRecord(value) || value.auditEventId !== authority.auditEventId ||
    value.commandId !== authority.commandId ||
    typeof value.completedAt !== "string" ||
    typeof value.revision !== "number" ||
    !REQUEST_STATUSES.includes(value.status as VendorLicenseRequestStatus)) {
    return authorityError("Persisted license-decision receipt is invalid.");
  }
  return {
    ...(value as unknown as VendorLicenseRequestDecisionReceipt),
    replayed: true,
  };
};

const auditReference = (
  document: FirebaseFirestore.DocumentSnapshot,
  expectedId: string,
  requestId: string,
): VendorCommercialAuditReference => {
  const value = document.data();
  if (!document.exists || !isRecord(value) || document.id !== expectedId ||
    value.requestId !== requestId) {
    return authorityError("License-request audit authority is unavailable.");
  }
  return {
    auditEventId: expectedId,
    occurredAt: storedTimestamp(
      value.occurredAt ?? value.createdAt,
      "audit.occurredAt",
    ).toDate().toISOString(),
  };
};

export class VendorLicenseRequestsService {
  constructor(
    private readonly dependencies: VendorLicenseRequestDependencies = {
      firestore: getFirestore(),
      now: () => new Date(),
    },
  ) {}

  public normalizeListRequest(
    input: VendorLicenseRequestListInput,
  ): VendorLicenseRequestListValidatedRequest {
    const context = vendorContext(input);
    const cursor = optionalInputString(input.cursor, "cursor", MAX_CURSOR_LENGTH);
    const instituteId = input.instituteId === undefined || input.instituteId === null ||
      input.instituteId === "" ? undefined : identifier(input.instituteId, "instituteId");
    const requestedLayer = inputLicenseLayer(input.requestedLayer);
    const status = inputRequestStatus(input.status);
    return {
      ...context,
      ...(cursor ? {cursor} : {}),
      ...(instituteId ? {instituteId} : {}),
      limit: normalizedLimit(input.limit),
      ...(requestedLayer ? {requestedLayer} : {}),
      ...(status ? {status} : {}),
    };
  }

  public normalizeDetailRequest(
    input: VendorLicenseRequestDetailInput,
  ): VendorLicenseRequestDetailValidatedRequest {
    const ipAddress = optionalContextString(input.ipAddress, "ipAddress");
    const userAgent = optionalContextString(input.userAgent, "userAgent");
    return {
      ...vendorContext(input),
      instituteId: identifier(input.instituteId, "instituteId"),
      ...(ipAddress ? {ipAddress} : {}),
      requestId: identifier(input.requestId, "requestId"),
      ...(userAgent ? {userAgent} : {}),
    };
  }

  public normalizeDecisionRequest(
    input: VendorLicenseRequestDecisionInput,
  ): VendorLicenseRequestDecisionValidatedRequest {
    const detail = this.normalizeDetailRequest(input);
    const action = inputString(input.action, "action", 32).toLowerCase();
    const expectedRevision = positiveInteger(
      input.expectedRevision,
      "expectedRevision",
    );
    const idempotencyKey = inputString(
      input.idempotencyKey,
      "idempotencyKey",
      64,
    ).toLowerCase();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(idempotencyKey)) {
      return validationError("Field \"idempotencyKey\" must be a UUID.");
    }
    let command: VendorLicenseRequestDecisionIntent;
    if (action === "reject") {
      const reason = inputString(input.reason, "reason", MAX_NOTE_LENGTH);
      if (reason.length < 3) {
        return validationError("Field \"reason\" must contain at least 3 characters.");
      }
      command = {action, expectedRevision, idempotencyKey, reason};
    } else if (action === "approve" || action === "require_payment") {
      const note = optionalInputString(input.note, "note", MAX_NOTE_LENGTH);
      command = {
        action,
        expectedRevision,
        idempotencyKey,
        ...(note ? {note} : {}),
      };
    } else {
      return validationError(
        "Field \"action\" must be approve, require_payment, or reject.",
      );
    }
    return {...detail, command};
  }

  public listRequests = async (
    request: VendorLicenseRequestListValidatedRequest,
  ): Promise<VendorLicenseRequestListResult> => {
    const fingerprint = filterFingerprint(request);
    let filteredQuery: FirebaseFirestore.Query = this.dependencies.firestore
      .collectionGroup(LICENSE_REQUESTS_COLLECTION);
    if (request.instituteId) {
      filteredQuery = filteredQuery.where("instituteId", "==", request.instituteId);
    }
    if (request.requestedLayer) {
      filteredQuery = filteredQuery.where("requestedLayer", "==", request.requestedLayer);
    }
    if (request.status) {
      filteredQuery = filteredQuery.where("status", "==", request.status);
    }
    let pageQuery = filteredQuery
      .orderBy("submittedAt", "desc")
      .orderBy("instituteId", "asc")
      .orderBy("requestId", "asc");
    if (request.cursor) {
      const cursor = decodeCursor(request.cursor, fingerprint);
      pageQuery = pageQuery.startAfter(
        Timestamp.fromMillis(cursor.submittedAtMillis),
        cursor.instituteId,
        cursor.requestId,
      );
    }
    const [pageSnapshot, countSnapshot] = await Promise.all([
      pageQuery.limit(request.limit + 1).get(),
      filteredQuery.count().get(),
    ]);
    const page = pageSnapshot.docs.slice(0, request.limit);
    const items = page.map((document) =>
      requestSummary(parseRequest(document).detail));
    const lastDocument = page[page.length - 1];
    const last = lastDocument ? parseRequest(lastDocument).detail : null;
    return {
      items,
      nextCursor: pageSnapshot.docs.length > request.limit && last ?
        encodeCursor({
          fingerprint,
          instituteId: last.instituteId,
          requestId: last.requestId,
          submittedAtMillis: new Date(last.createdAt).getTime(),
          version: 1,
        }) : null,
      totalMatching: countSnapshot.data().count,
    };
  };

  public getRequestDetail = async (
    request: VendorLicenseRequestDetailValidatedRequest,
  ): Promise<VendorLicenseRequestDetail> => {
    const instituteReference = this.dependencies.firestore
      .collection("institutes").doc(request.instituteId);
    const requestReference = instituteReference
      .collection(LICENSE_REQUESTS_COLLECTION).doc(request.requestId);
    const parsed = parseRequest(await requestReference.get());
    const auditReferences = [
      instituteReference.collection(LICENSE_REQUEST_AUDIT_COLLECTION)
        .doc(parsed.submissionAuditEventId),
      ...parsed.decisionAuditEventIds.map((auditEventId) =>
        instituteReference.collection(INSTITUTE_AUDIT_COLLECTION)
          .doc(auditEventId)),
    ];
    const auditSnapshots = await this.dependencies.firestore.getAll(
      ...auditReferences,
    );
    const audit = auditSnapshots.map((snapshot, index) => auditReference(
      snapshot,
      auditReferences[index].id,
      request.requestId,
    )).sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
    return {...parsed.detail, audit};
  };

  public decideRequest = async (
    request: VendorLicenseRequestDecisionValidatedRequest,
  ): Promise<VendorLicenseRequestDecisionReceipt> => {
    const firestore = this.dependencies.firestore;
    const nowDate = this.dependencies.now();
    if (Number.isNaN(nowDate.getTime())) {
      return authorityError("Commercial decision server time is invalid.");
    }
    const now = Timestamp.fromDate(nowDate);
    const authority = decisionCommandAuthority(request);
    const instituteReference = firestore.collection("institutes")
      .doc(request.instituteId);
    const requestReference = instituteReference
      .collection(LICENSE_REQUESTS_COLLECTION).doc(request.requestId);
    const stateReference = instituteReference
      .collection(LICENSE_REQUEST_STATE_COLLECTION)
      .doc(LICENSE_REQUEST_STATE_DOCUMENT);
    const licenseReference = instituteReference.collection(LICENSE_COLLECTION)
      .doc(CURRENT_LICENSE_DOCUMENT);
    const commandReference = instituteReference
      .collection(COMMERCIAL_COMMANDS_COLLECTION).doc(authority.commandId);
    const rootAuditReference = firestore.collection(ROOT_AUDIT_COLLECTION)
      .doc(authority.auditEventId);
    const instituteAuditReference = instituteReference
      .collection(INSTITUTE_AUDIT_COLLECTION).doc(authority.auditEventId);

    return firestore.runTransaction(async (transaction) => {
      const commandSnapshot = await transaction.get(commandReference);
      if (commandSnapshot.exists) {
        const commandData = commandSnapshot.data();
        if (!isRecord(commandData) ||
          commandData.fingerprint !== authority.fingerprint ||
          commandData.idempotencyKeyHash !== authority.idempotencyKeyHash ||
          commandData.instituteId !== request.instituteId ||
          commandData.requestId !== request.requestId) {
          throw new VendorCommercialValidationError(
            "CONFLICT",
            "Idempotency key was already used for different commercial intent.",
          );
        }
        const [rootAudit, instituteAudit] = await Promise.all([
          transaction.get(rootAuditReference),
          transaction.get(instituteAuditReference),
        ]);
        const audits = [rootAudit, instituteAudit];
        if (audits.some((audit) => {
          const value = audit.data();
          return !audit.exists || !isRecord(value) ||
            value.auditEventId !== authority.auditEventId ||
            value.fingerprint !== authority.fingerprint ||
            value.idempotencyKeyHash !== authority.idempotencyKeyHash ||
            value.instituteId !== request.instituteId ||
            value.requestId !== request.requestId;
        })) {
          return authorityError("Persisted commercial decision audit is unavailable.");
        }
        return replayReceipt(commandData.receipt, authority);
      }

      const [instituteSnapshot, requestSnapshot, stateSnapshot, licenseSnapshot] =
        await Promise.all([
          transaction.get(instituteReference),
          transaction.get(requestReference),
          transaction.get(stateReference),
          transaction.get(licenseReference),
        ]);
      if (!instituteSnapshot.exists || !isRecord(instituteSnapshot.data())) {
        throw new VendorCommercialValidationError(
          "NOT_FOUND",
          "Institute commercial authority was not found.",
        );
      }
      const parsed = parseRequest(requestSnapshot);
      if (parsed.detail.revision !== request.command.expectedRevision) {
        throw new VendorCommercialValidationError(
          "CONFLICT",
          "License request changed; reload before deciding.",
        );
      }
      if (parsed.detail.status === "approved" ||
        parsed.detail.status === "rejected") {
        throw new VendorCommercialValidationError(
          "CONFLICT",
          "License request already has a terminal decision.",
        );
      }
      if (request.command.action === "require_payment" &&
        parsed.detail.status !== "pending") {
        throw new VendorCommercialValidationError(
          "CONFLICT",
          "Payment can be required only for a pending request.",
        );
      }
      if (!stateSnapshot.exists || !isRecord(stateSnapshot.data()) ||
        stateSnapshot.get("openRequestId") !== request.requestId) {
        return authorityError(
          "License request sentinel does not match open request authority.",
        );
      }
      if (!licenseSnapshot.exists || !isRecord(licenseSnapshot.data())) {
        return authorityError("Authoritative license/current is unavailable.");
      }
      const currentLicenseVersion = storedString(
        licenseSnapshot.get("licenseVersion") ??
          instituteSnapshot.get("licenseVersion"),
        "license.licenseVersion",
      );
      if (currentLicenseVersion !== parsed.expectedLicenseVersion) {
        throw new VendorCommercialValidationError(
          "CONFLICT",
          "Current entitlement changed after this request was submitted.",
        );
      }
      if (parsed.decisionAuditEventIds.length >= MAX_LIMIT) {
        return authorityError("License request decision audit bound is exhausted.");
      }

      const status: VendorLicenseRequestStatus =
        request.command.action === "require_payment" ? "payment_required" :
          request.command.action === "approve" ? "approved" : "rejected";
      const revision = parsed.detail.revision + 1;
      const note = request.command.action === "reject" ?
        request.command.reason : request.command.note ?? null;
      const receipt: VendorLicenseRequestDecisionReceipt = {
        auditEventId: authority.auditEventId,
        commandId: authority.commandId,
        completedAt: nowDate.toISOString(),
        decisionState: "decided",
        propagationState: "not_required",
        providerOperation: null,
        replayed: false,
        requestId: request.requestId,
        revision,
        status,
      };
      const audit = {
        action: `license_request_${request.command.action}`,
        actorRole: request.actorRole,
        actorUserId: request.actorId,
        auditEventId: authority.auditEventId,
        fingerprint: authority.fingerprint,
        idempotencyKeyHash: authority.idempotencyKeyHash,
        instituteId: request.instituteId,
        ipAddressHash: request.ipAddress ? sha256(request.ipAddress) : null,
        occurredAt: now,
        previousRevision: parsed.detail.revision,
        previousStatus: parsed.detail.status,
        requestId: request.requestId,
        requestedLayer: parsed.detail.requestedLayer,
        requestedPlanId: parsed.detail.requestedPlanId,
        revision,
        status,
        summary: `Vendor recorded ${request.command.action} for a licensing request.`,
        userAgentHash: request.userAgent ? sha256(request.userAgent) : null,
      };

      transaction.update(requestReference, {
        decidedAt: now,
        decidedByUserId: request.actorId,
        decisionAction: request.command.action,
        decisionAuditEventIds: [
          ...parsed.decisionAuditEventIds,
          authority.auditEventId,
        ],
        decisionNote: note,
        decisionState: "decided",
        revision,
        status,
        updatedAt: now,
      });
      transaction.set(stateReference, {
        openRequestId: status === "payment_required" ? request.requestId : null,
        updatedAt: now,
      });
      transaction.create(rootAuditReference, audit);
      transaction.create(instituteAuditReference, audit);
      transaction.create(commandReference, {
        action: request.command.action,
        completedAt: now,
        fingerprint: authority.fingerprint,
        idempotencyKeyHash: authority.idempotencyKeyHash,
        instituteId: request.instituteId,
        receipt,
        requestId: request.requestId,
      });
      return receipt;
    });
  };
}

export const vendorLicenseRequestsService = new VendorLicenseRequestsService();
