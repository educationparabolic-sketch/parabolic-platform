/* eslint-disable max-len, require-jsdoc */
import {createHash} from "node:crypto";
import {FieldPath, FieldValue} from "firebase-admin/firestore";
import type {
  ClaimPropagationDeliveryRecord,
  ClaimPropagationDesiredAuthority,
  ClaimPropagationFeatureFlags,
  ClaimPropagationIdentityKind,
  ClaimPropagationOperationRecord,
  ClaimPropagationOperationState,
  ClaimPropagationPublicReceipt,
  ClaimPropagationSource,
} from "../../../shared/contracts/claimPropagation";
import {getFirestore} from "../utils/firebaseAdmin";
import {identitySessionSecurityService} from "./identitySessionSecurity";
import {licenseHistoryService} from "./licenseHistory";

export const CLAIM_PROPAGATION_PAGE_SIZE = 100;
export const CLAIM_PROPAGATION_DELIVERY_BATCH_SIZE = 25;
export const CLAIM_PROPAGATION_LEASE_SECONDS = 60;
export const CLAIM_PROPAGATION_MAX_ATTEMPTS = 5;
export const CLAIM_PROPAGATION_RETRY_DELAYS_SECONDS = [5, 15, 30, 60] as const;
export const CLAIM_PROPAGATION_SERVER_SLA_SECONDS = 240;
export const CLAIM_PROPAGATION_BROWSER_SLA_SECONDS = 300;
export const CLAIM_PROPAGATION_SCHEDULE_MINUTES = 1;
export const CLAIM_PROPAGATION_SWEEP_MAX_OPERATIONS = 100;

const OPERATIONS_COLLECTION = "claimPropagationOperations";
const DELIVERIES_COLLECTION = "deliveries";
const AUDIT_COLLECTION = "auditLogs";
const OPERATION_STATES = new Set<ClaimPropagationOperationState>([
  "dead_lettered", "pending", "processing", "retrying", "succeeded", "superseded",
]);
const SOURCES = new Set<ClaimPropagationSource>([
  "commercial_entitlement_reconciled",
  "grace_expired",
  "institute_archived",
  "institute_restored",
  "institute_suspended",
  "license_changed",
  "license_expired",
  "stripe_entitlement_reconciled",
]);

type SynchronizationResult = {
  claimsChanged: boolean | null;
  refreshTokensRevoked: boolean;
  userMissing: boolean;
};

interface ClaimPropagationDependencies {
  firestore: FirebaseFirestore.Firestore;
  now: () => Date;
  synchronizeClaimsAndRevokeSessions: (input: {
    authorizationVersion: number;
    instituteId: string;
    uid: string;
  }) => Promise<SynchronizationResult>;
}

export interface StageClaimPropagationOperationInput {
  auditEventId?: string;
  desiredAuthority: ClaimPropagationDesiredAuthority;
  source: ClaimPropagationSource;
}

export interface CreateClaimPropagationOperationInput {
  instituteId: string;
  source: ClaimPropagationSource;
}

export interface ProcessClaimPropagationOperationInput {
  instituteId: string;
  operationId: string;
  workerId: string;
}

export interface ProcessClaimPropagationOperationResult {
  operationId: string;
  processed: boolean;
  state: ClaimPropagationOperationState;
}

export interface ProcessClaimPropagationDeadlinesResult {
  inspected: number;
  transitioned: number;
}

export interface ProcessDueClaimPropagationOperationsResult {
  invoked: number;
  processed: number;
}

export interface ProcessClaimPropagationScheduleResult {
  deadlines: ProcessClaimPropagationDeadlinesResult;
  operations: ProcessDueClaimPropagationOperationsResult;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requiredString = (value: unknown, field: string, maximum = 256): string => {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maximum) {
    throw new Error(`Claim propagation field "${field}" is invalid.`);
  }
  return value.trim();
};

const positiveInteger = (value: unknown, field: string): number => {
  if (!Number.isInteger(value) || Number(value) <= 0) {
    throw new Error(`Claim propagation field "${field}" must be a positive integer.`);
  }
  return Number(value);
};

const nonNegativeInteger = (value: unknown, field: string): number => {
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new Error(`Claim propagation field "${field}" must be a non-negative integer.`);
  }
  return Number(value);
};

const optionalIsoTimestamp = (value: unknown, field: string): string | null => {
  if (value === null || value === undefined) return null;
  const candidate = typeof value === "string" ? new Date(value) :
    value instanceof Date ? value :
      isRecord(value) && typeof value.toDate === "function" ?
        (value.toDate as () => unknown)() : null;
  if (!(candidate instanceof Date) || Number.isNaN(candidate.getTime())) {
    throw new Error(`Claim propagation field "${field}" must be a timestamp or null.`);
  }
  return candidate.toISOString();
};

const requiredIsoTimestamp = (value: unknown, field: string): string => {
  const timestamp = optionalIsoTimestamp(value, field);
  if (!timestamp) throw new Error(`Claim propagation field "${field}" is required.`);
  return timestamp;
};

const normalizeFeatureFlags = (value: unknown): ClaimPropagationFeatureFlags => {
  const flags = isRecord(value) ? value : {};
  return {
    adaptivePhase: flags.adaptivePhase === true,
    controlledMode: flags.controlledMode === true,
    governanceAccess: flags.governanceAccess === true,
    hardMode: flags.hardMode === true,
    riskOverview: flags.riskOverview === true,
  };
};

const normalizeDesiredAuthority = (
  value: ClaimPropagationDesiredAuthority,
): ClaimPropagationDesiredAuthority => {
  const instituteAccess = value.instituteAccess;
  if (instituteAccess !== "active" && instituteAccess !== "suspended") {
    throw new Error("Claim propagation institute access is invalid.");
  }
  const licenseLayer = value.licenseLayer;
  if (!["L0", "L1", "L2", "L3"].includes(licenseLayer)) {
    throw new Error("Claim propagation license layer is invalid.");
  }
  const licenseState = value.licenseState;
  if (!["active", "grace", "expired"].includes(licenseState)) {
    throw new Error("Claim propagation license state is invalid.");
  }
  return {
    activeStudentLimit: positiveInteger(value.activeStudentLimit, "activeStudentLimit"),
    authorizationVersion: positiveInteger(value.authorizationVersion, "authorizationVersion"),
    concurrentSessionLimit: positiveInteger(value.concurrentSessionLimit, "concurrentSessionLimit"),
    expiryDate: optionalIsoTimestamp(value.expiryDate, "expiryDate"),
    featureFlags: normalizeFeatureFlags(value.featureFlags),
    gracePeriodEndsAt: optionalIsoTimestamp(value.gracePeriodEndsAt, "gracePeriodEndsAt"),
    instituteAccess,
    instituteId: requiredString(value.instituteId, "instituteId", 128),
    instituteRevision: positiveInteger(value.instituteRevision, "instituteRevision"),
    licenseLayer,
    licenseState,
    licenseVersion: requiredString(value.licenseVersion, "licenseVersion", 256),
  };
};

const normalizeSource = (value: unknown): ClaimPropagationSource => {
  if (typeof value !== "string" || !SOURCES.has(value as ClaimPropagationSource)) {
    throw new Error("Claim propagation source is invalid.");
  }
  return value as ClaimPropagationSource;
};

const operationIdFor = (authorizationVersion: number): `v${number}` =>
  `v${positiveInteger(authorizationVersion, "authorizationVersion")}`;

const auditEventIdFor = (authorizationVersion: number): string =>
  `claim_propagation_${operationIdFor(authorizationVersion)}`;

const addSeconds = (value: Date, seconds: number): string =>
  new Date(value.getTime() + seconds * 1_000).toISOString();

const workerHash = (value: string): string =>
  createHash("sha256").update(requiredString(value, "workerId", 512)).digest("hex");

const safeErrorCode = (error: unknown): string => {
  const candidate = isRecord(error) && typeof error.code === "string" ?
    error.code : "claim_propagation_processing_error";
  const normalized = candidate.trim().toLowerCase().replace(/[^a-z0-9_-]+/gu, "_");
  return normalized.slice(0, 80) || "claim_propagation_processing_error";
};

const retryDelaySeconds = (attemptCount: number): number =>
  CLAIM_PROPAGATION_RETRY_DELAYS_SECONDS[
    Math.min(Math.max(attemptCount - 1, 0), CLAIM_PROPAGATION_RETRY_DELAYS_SECONDS.length - 1)
  ];

const terminalOperationState = (state: ClaimPropagationOperationState): boolean =>
  state === "dead_lettered" || state === "succeeded" || state === "superseded";

export const nextClaimAuthorizationVersion = (value: unknown): number =>
  Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) + 1 : 1;

export const buildClaimPropagationDesiredAuthority = (
  instituteId: string,
  instituteData: Record<string, unknown>,
  licenseData: Record<string, unknown>,
): ClaimPropagationDesiredAuthority => {
  const status = requiredString(instituteData.status, "institute.status").toLowerCase();
  if (!["active", "archived", "suspended"].includes(status)) {
    throw new Error("Claim propagation institute status is invalid.");
  }
  const layer = requiredString(licenseData.currentLayer, "license.currentLayer").toUpperCase();
  const state = requiredString(licenseData.licenseState, "license.licenseState").toLowerCase();
  const licenseVersion = requiredString(
    licenseData.licenseVersion ?? instituteData.licenseVersion,
    "license.licenseVersion",
  );
  if (
    typeof instituteData.licenseVersion === "string" &&
    instituteData.licenseVersion.trim() !== licenseVersion
  ) {
    throw new Error("Institute and current-license versions do not match.");
  }
  return normalizeDesiredAuthority({
    activeStudentLimit: positiveInteger(
      licenseData.activeStudentLimit ?? instituteData.activeStudentLimit,
      "activeStudentLimit",
    ),
    authorizationVersion: positiveInteger(
      instituteData.authorizationVersion,
      "authorizationVersion",
    ),
    concurrentSessionLimit: positiveInteger(
      licenseData.concurrentSessionLimit ?? licenseData.concurrencyLimit ??
        licenseData.maxConcurrentStudents ?? instituteData.concurrentSessionLimit,
      "concurrentSessionLimit",
    ),
    expiryDate: optionalIsoTimestamp(licenseData.expiryDate, "license.expiryDate"),
    featureFlags: normalizeFeatureFlags(licenseData.featureFlags),
    gracePeriodEndsAt: optionalIsoTimestamp(
      licenseData.gracePeriodEndsAt,
      "license.gracePeriodEndsAt",
    ),
    instituteAccess: status === "active" ? "active" : "suspended",
    instituteId,
    instituteRevision: positiveInteger(instituteData.instituteRevision, "instituteRevision"),
    licenseLayer: layer as ClaimPropagationDesiredAuthority["licenseLayer"],
    licenseState: state as ClaimPropagationDesiredAuthority["licenseState"],
    licenseVersion,
  });
};

export const buildClaimPropagationOperationRecord = (input: {
  auditEventId?: string;
  createdAt: Date;
  desiredAuthority: ClaimPropagationDesiredAuthority;
  source: ClaimPropagationSource;
}): ClaimPropagationOperationRecord => {
  const desiredAuthority = normalizeDesiredAuthority(input.desiredAuthority);
  const source = normalizeSource(input.source);
  const createdAt = new Date(input.createdAt);
  if (Number.isNaN(createdAt.getTime())) {
    throw new Error("Claim propagation createdAt is invalid.");
  }
  const createdAtIso = createdAt.toISOString();
  return {
    attemptCount: 0,
    auditEventId: requiredString(
      input.auditEventId ?? auditEventIdFor(desiredAuthority.authorizationVersion),
      "auditEventId",
    ),
    browserDeadlineAt: addSeconds(createdAt, CLAIM_PROPAGATION_BROWSER_SLA_SECONDS),
    completedAt: null,
    counts: {
      claimsChanged: 0,
      deadLettered: 0,
      discovered: 0,
      missing: 0,
      refreshTokensRevoked: 0,
      synchronized: 0,
    },
    createdAt: createdAtIso,
    desiredAuthority,
    enumeration: {
      pageSize: CLAIM_PROPAGATION_PAGE_SIZE,
      staffComplete: false,
      studentCursor: null,
      studentsComplete: false,
    },
    instituteId: desiredAuthority.instituteId,
    lastErrorCode: null,
    leaseExpiresAt: null,
    leaseOwnerHash: null,
    maxAttempts: CLAIM_PROPAGATION_MAX_ATTEMPTS,
    nextAttemptAt: createdAtIso,
    operationId: operationIdFor(desiredAuthority.authorizationVersion),
    schemaVersion: 1,
    serverDeadlineAt: addSeconds(createdAt, CLAIM_PROPAGATION_SERVER_SLA_SECONDS),
    source,
    state: "pending",
    supersededByOperationId: null,
    updatedAt: createdAtIso,
  };
};

const parseOperation = (
  snapshot: FirebaseFirestore.DocumentSnapshot,
): ClaimPropagationOperationRecord => {
  if (!snapshot.exists || !isRecord(snapshot.data())) {
    throw new Error(`Claim propagation operation "${snapshot.id}" does not exist.`);
  }
  const value = snapshot.data() as Record<string, unknown>;
  const state = value.state;
  if (typeof state !== "string" || !OPERATION_STATES.has(state as ClaimPropagationOperationState)) {
    throw new Error(`Claim propagation operation "${snapshot.id}" has invalid state.`);
  }
  const desiredAuthority = normalizeDesiredAuthority(
    value.desiredAuthority as ClaimPropagationDesiredAuthority,
  );
  const expectedOperationId = operationIdFor(desiredAuthority.authorizationVersion);
  if (snapshot.id !== expectedOperationId || value.operationId !== expectedOperationId) {
    throw new Error(`Claim propagation operation "${snapshot.id}" has invalid identity.`);
  }
  const counts = isRecord(value.counts) ? value.counts : {};
  const enumeration = isRecord(value.enumeration) ? value.enumeration : {};
  if (
    enumeration.pageSize !== CLAIM_PROPAGATION_PAGE_SIZE ||
    typeof enumeration.staffComplete !== "boolean" ||
    typeof enumeration.studentsComplete !== "boolean" ||
    (enumeration.studentCursor !== null && typeof enumeration.studentCursor !== "string")
  ) {
    throw new Error(`Claim propagation operation "${snapshot.id}" has invalid enumeration.`);
  }
  return {
    attemptCount: nonNegativeInteger(value.attemptCount, "attemptCount"),
    auditEventId: requiredString(value.auditEventId, "auditEventId"),
    browserDeadlineAt: requiredIsoTimestamp(value.browserDeadlineAt, "browserDeadlineAt"),
    completedAt: optionalIsoTimestamp(value.completedAt, "completedAt"),
    counts: {
      claimsChanged: nonNegativeInteger(counts.claimsChanged, "counts.claimsChanged"),
      deadLettered: nonNegativeInteger(counts.deadLettered, "counts.deadLettered"),
      discovered: nonNegativeInteger(counts.discovered, "counts.discovered"),
      missing: nonNegativeInteger(counts.missing, "counts.missing"),
      refreshTokensRevoked: nonNegativeInteger(
        counts.refreshTokensRevoked,
        "counts.refreshTokensRevoked",
      ),
      synchronized: nonNegativeInteger(counts.synchronized, "counts.synchronized"),
    },
    createdAt: requiredIsoTimestamp(value.createdAt, "createdAt"),
    desiredAuthority,
    enumeration: {
      pageSize: CLAIM_PROPAGATION_PAGE_SIZE,
      staffComplete: enumeration.staffComplete,
      studentCursor: enumeration.studentCursor as string | null,
      studentsComplete: enumeration.studentsComplete,
    },
    instituteId: requiredString(value.instituteId, "instituteId", 128),
    lastErrorCode: value.lastErrorCode === null ? null : requiredString(value.lastErrorCode, "lastErrorCode", 80),
    leaseExpiresAt: optionalIsoTimestamp(value.leaseExpiresAt, "leaseExpiresAt"),
    leaseOwnerHash: value.leaseOwnerHash === null ? null : requiredString(value.leaseOwnerHash, "leaseOwnerHash", 64),
    maxAttempts: CLAIM_PROPAGATION_MAX_ATTEMPTS,
    nextAttemptAt: optionalIsoTimestamp(value.nextAttemptAt, "nextAttemptAt"),
    operationId: expectedOperationId,
    schemaVersion: 1,
    serverDeadlineAt: requiredIsoTimestamp(value.serverDeadlineAt, "serverDeadlineAt"),
    source: normalizeSource(value.source),
    state: state as ClaimPropagationOperationState,
    supersededByOperationId: value.supersededByOperationId === null ? null : requiredString(value.supersededByOperationId, "supersededByOperationId"),
    updatedAt: requiredIsoTimestamp(value.updatedAt, "updatedAt"),
  };
};

const deliveryDocument = (input: {
  authorizationVersion: number;
  createdAt: string;
  identityKind: ClaimPropagationIdentityKind;
  uid: string;
}): ClaimPropagationDeliveryRecord => ({
  attemptCount: 0,
  authorizationVersion: input.authorizationVersion,
  claimsChanged: null,
  completedAt: null,
  identityKind: input.identityKind,
  lastErrorCode: null,
  leaseExpiresAt: null,
  leaseOwnerHash: null,
  nextAttemptAt: input.createdAt,
  refreshTokensRevoked: false,
  state: "pending",
  uid: input.uid,
  updatedAt: input.createdAt,
});

const publicReceipt = (operation: ClaimPropagationOperationRecord): ClaimPropagationPublicReceipt => ({
  authorizationVersion: operation.desiredAuthority.authorizationVersion,
  browserDeadlineAt: operation.browserDeadlineAt,
  operationId: operation.operationId,
  serverDeadlineAt: operation.serverDeadlineAt,
  state: operation.state === "dead_lettered" ? "failed" : operation.state,
});

export class ClaimPropagationCoordinator {
  constructor(
    private readonly dependencies: Pick<ClaimPropagationDependencies, "firestore" | "now"> = {
      firestore: getFirestore(),
      now: () => new Date(),
    },
  ) {}

  public stageOperation(
    transaction: FirebaseFirestore.Transaction,
    input: StageClaimPropagationOperationInput,
    createdAt = this.dependencies.now(),
  ): ClaimPropagationPublicReceipt {
    const operation = buildClaimPropagationOperationRecord({...input, createdAt});
    const instituteReference = this.dependencies.firestore.doc(
      `institutes/${operation.instituteId}`,
    );
    const operationReference = instituteReference
      .collection(OPERATIONS_COLLECTION).doc(operation.operationId);
    const auditReference = instituteReference
      .collection(AUDIT_COLLECTION).doc(operation.auditEventId);
    transaction.create(operationReference, operation);
    transaction.create(auditReference, {
      action: "claim_propagation_requested",
      actorType: "system",
      auditEventId: operation.auditEventId,
      authorizationVersion: operation.desiredAuthority.authorizationVersion,
      createdAt: operation.createdAt,
      eventId: operation.auditEventId,
      instituteId: operation.instituteId,
      operationId: operation.operationId,
      source: operation.source,
    });
    return publicReceipt(operation);
  }

  public async createOperationFromCurrentAuthority(
    input: CreateClaimPropagationOperationInput,
  ): Promise<ClaimPropagationPublicReceipt> {
    const instituteId = requiredString(input.instituteId, "instituteId", 128);
    const source = normalizeSource(input.source);
    const createdAt = this.dependencies.now();
    const instituteReference = this.dependencies.firestore.doc(`institutes/${instituteId}`);
    const licenseReference = instituteReference.collection("license").doc("current");

    return this.dependencies.firestore.runTransaction(async (transaction) => {
      const [instituteSnapshot, licenseSnapshot] = await transaction.getAll(
        instituteReference,
        licenseReference,
      );
      if (!instituteSnapshot.exists || !licenseSnapshot.exists) {
        throw new Error(`Institute "${instituteId}" has incomplete propagation authority.`);
      }
      const desiredAuthority = buildClaimPropagationDesiredAuthority(
        instituteId,
        instituteSnapshot.data() ?? {},
        licenseSnapshot.data() ?? {},
      );
      const operationId = operationIdFor(desiredAuthority.authorizationVersion);
      const auditEventId = auditEventIdFor(desiredAuthority.authorizationVersion);
      const operationReference = instituteReference
        .collection(OPERATIONS_COLLECTION).doc(operationId);
      const auditReference = instituteReference.collection(AUDIT_COLLECTION).doc(auditEventId);
      const [operationSnapshot, auditSnapshot] = await transaction.getAll(
        operationReference,
        auditReference,
      );
      if (operationSnapshot.exists) {
        const operation = parseOperation(operationSnapshot);
        if (
          operation.source !== source ||
          JSON.stringify(operation.desiredAuthority) !== JSON.stringify(desiredAuthority)
        ) {
          throw new Error(`Claim propagation operation "${operationId}" conflicts with current authority.`);
        }
        return publicReceipt(operation);
      }
      if (auditSnapshot.exists) {
        throw new Error(`Claim propagation audit "${auditEventId}" exists without its operation.`);
      }
      return this.stageOperation(transaction, {
        auditEventId,
        desiredAuthority,
        source,
      }, createdAt);
    });
  }
}

export class ClaimPropagationDeadlineService {
  constructor(
    private readonly dependencies: Pick<ClaimPropagationDependencies, "firestore" | "now"> = {
      firestore: getFirestore(),
      now: () => new Date(),
    },
    private readonly coordinator = new ClaimPropagationCoordinator(dependencies),
  ) {}

  private async transitionIfDue(
    licenseReference: FirebaseFirestore.DocumentReference,
    source: "grace_expired" | "license_expired",
    now: Date,
  ): Promise<boolean> {
    const instituteReference = licenseReference.parent.parent;
    if (!instituteReference) return false;
    const compatibilityReference = instituteReference.collection("license").doc("main");
    return this.dependencies.firestore.runTransaction(async (transaction) => {
      const [instituteSnapshot, licenseSnapshot] = await transaction.getAll(
        instituteReference,
        licenseReference,
      );
      if (!instituteSnapshot.exists || !licenseSnapshot.exists) return false;
      const instituteData = instituteSnapshot.data() ?? {};
      const licenseData = licenseSnapshot.data() ?? {};
      const state = licenseData.licenseState;
      const deadline = optionalIsoTimestamp(
        source === "grace_expired" ? licenseData.gracePeriodEndsAt : licenseData.expiryDate,
        source === "grace_expired" ? "license.gracePeriodEndsAt" : "license.expiryDate",
      );
      if (
        (source === "grace_expired" && state !== "grace") ||
        (source === "license_expired" && state !== "active") ||
        !deadline || deadline > now.toISOString()
      ) return false;
      const authorizationVersion = nextClaimAuthorizationVersion(
        instituteData.authorizationVersion,
      );
      const instituteRevision = Number.isSafeInteger(instituteData.instituteRevision) &&
        Number(instituteData.instituteRevision) > 0 ?
        Number(instituteData.instituteRevision) : 1;
      const licenseVersion = `authorization_deadline_v${authorizationVersion}`;
      const nextInstituteData = {
        ...instituteData,
        authorizationVersion,
        instituteRevision,
        licenseVersion,
      };
      const nextLicenseData = {
        ...licenseData,
        licenseState: "expired",
        licenseVersion,
      };
      const desiredAuthority = buildClaimPropagationDesiredAuthority(
        instituteReference.id,
        nextInstituteData,
        nextLicenseData,
      );
      const previousLayer = desiredAuthority.licenseLayer;
      const historyWrite = licenseHistoryService.prepareLicenseHistoryEntry({
        billingPlan: requiredString(
          licenseData.planName ?? licenseData.planId ?? previousLayer,
          "license.planName",
        ),
        changedBy: "claim_propagation_deadline_scheduler",
        effectiveDate: now,
        entryId: licenseVersion,
        instituteId: instituteReference.id,
        newLayer: previousLayer,
        newStudentLimit: desiredAuthority.activeStudentLimit,
        previousLayer,
        previousStudentLimit: desiredAuthority.activeStudentLimit,
        reason: source === "grace_expired" ?
          "License grace period elapsed." : "License expiry deadline elapsed.",
      });
      transaction.set(licenseReference, {
        licenseState: "expired",
        licenseVersion,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: "claim_propagation_deadline_scheduler",
      }, {merge: true});
      transaction.set(compatibilityReference, {
        licenseState: "expired",
        licenseVersion,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: "claim_propagation_deadline_scheduler",
      }, {merge: true});
      transaction.set(instituteReference, {
        authorizationVersion,
        instituteRevision,
        licenseVersion,
        updatedAt: FieldValue.serverTimestamp(),
      }, {merge: true});
      transaction.create(this.dependencies.firestore.doc(historyWrite.path), historyWrite.entry);
      this.coordinator.stageOperation(transaction, {desiredAuthority, source}, now);
      return true;
    });
  }

  public async processDueTransitions(
    maximumTransitions = CLAIM_PROPAGATION_PAGE_SIZE,
  ): Promise<ProcessClaimPropagationDeadlinesResult> {
    if (!Number.isSafeInteger(maximumTransitions) || maximumTransitions < 1 ||
      maximumTransitions > CLAIM_PROPAGATION_PAGE_SIZE) {
      throw new Error("Claim propagation deadline batch size is invalid.");
    }
    const now = this.dependencies.now();
    const nowIso = now.toISOString();
    const perStateLimit = maximumTransitions * 2;
    const [activeSnapshot, graceSnapshot] = await Promise.all([
      this.dependencies.firestore.collectionGroup("license")
        .where("licenseState", "==", "active")
        .where("expiryDate", "<=", nowIso)
        .limit(perStateLimit)
        .get(),
      this.dependencies.firestore.collectionGroup("license")
        .where("licenseState", "==", "grace")
        .where("gracePeriodEndsAt", "<=", nowIso)
        .limit(perStateLimit)
        .get(),
    ]);
    const candidates = [
      ...activeSnapshot.docs.filter((document) => document.id === "current")
        .map((document) => ({document, source: "license_expired" as const})),
      ...graceSnapshot.docs.filter((document) => document.id === "current")
        .map((document) => ({document, source: "grace_expired" as const})),
    ].slice(0, maximumTransitions);
    let transitioned = 0;
    for (const candidate of candidates) {
      if (await this.transitionIfDue(candidate.document.ref, candidate.source, now)) {
        transitioned += 1;
      }
    }
    return {inspected: candidates.length, transitioned};
  }
}

export class ClaimPropagationWorker {
  private readonly dependencies: ClaimPropagationDependencies;

  constructor(dependencies: Partial<ClaimPropagationDependencies> = {}) {
    this.dependencies = {
      firestore: dependencies.firestore ?? getFirestore(),
      now: dependencies.now ?? (() => new Date()),
      synchronizeClaimsAndRevokeSessions:
        dependencies.synchronizeClaimsAndRevokeSessions ?? ((input) =>
          identitySessionSecurityService.synchronizeClaimsAndRevokeSessions(input)),
    };
  }

  private operationReference(instituteId: string, operationId: string) {
    return this.dependencies.firestore.doc(
      `institutes/${instituteId}/${OPERATIONS_COLLECTION}/${operationId}`,
    );
  }

  private async claimOperation(
    instituteId: string,
    operationId: string,
    ownerHash: string,
  ): Promise<ClaimPropagationOperationRecord | null> {
    const operationReference = this.operationReference(instituteId, operationId);
    const instituteReference = this.dependencies.firestore.doc(`institutes/${instituteId}`);
    return this.dependencies.firestore.runTransaction(async (transaction) => {
      const [operationSnapshot, instituteSnapshot] = await transaction.getAll(
        operationReference,
        instituteReference,
      );
      const operation = parseOperation(operationSnapshot);
      if (!instituteSnapshot.exists) throw new Error(`Institute "${instituteId}" does not exist.`);
      const currentVersion = positiveInteger(
        instituteSnapshot.get("authorizationVersion"),
        "authorizationVersion",
      );
      const now = this.dependencies.now();
      const nowIso = now.toISOString();
      if (currentVersion > operation.desiredAuthority.authorizationVersion) {
        transaction.update(operationReference, {
          completedAt: nowIso,
          leaseExpiresAt: null,
          leaseOwnerHash: null,
          nextAttemptAt: null,
          state: "superseded",
          supersededByOperationId: operationIdFor(currentVersion),
          updatedAt: nowIso,
        });
        return null;
      }
      if (currentVersion < operation.desiredAuthority.authorizationVersion) {
        throw new Error("Institute authorization version regressed below operation authority.");
      }
      if (terminalOperationState(operation.state)) return null;
      if (operation.nextAttemptAt && operation.nextAttemptAt > nowIso) return null;
      if (
        operation.state === "processing" &&
        operation.leaseExpiresAt &&
        operation.leaseExpiresAt > nowIso
      ) return null;
      const leaseExpiresAt = addSeconds(now, CLAIM_PROPAGATION_LEASE_SECONDS);
      transaction.update(operationReference, {
        leaseExpiresAt,
        leaseOwnerHash: ownerHash,
        nextAttemptAt: leaseExpiresAt,
        state: "processing",
        updatedAt: nowIso,
      });
      return {...operation, leaseExpiresAt, leaseOwnerHash: ownerHash, state: "processing"};
    });
  }

  private async createDeliveries(
    instituteId: string,
    operationId: string,
    ownerHash: string,
    identityKind: ClaimPropagationIdentityKind,
    userIds: string[],
    enumerationUpdate: ClaimPropagationOperationRecord["enumeration"],
  ): Promise<number> {
    const operationReference = this.operationReference(instituteId, operationId);
    const deliveryReferences = userIds.map((uid) =>
      operationReference.collection(DELIVERIES_COLLECTION).doc(uid));
    const nowIso = this.dependencies.now().toISOString();
    return this.dependencies.firestore.runTransaction(async (transaction) => {
      const operationSnapshot = await transaction.get(operationReference);
      const operation = parseOperation(operationSnapshot);
      if (
        operation.state !== "processing" ||
        operation.leaseOwnerHash !== ownerHash
      ) return 0;
      const deliverySnapshots = deliveryReferences.length > 0 ?
        await transaction.getAll(...deliveryReferences) : [];
      let created = 0;
      deliverySnapshots.forEach((snapshot, index) => {
        if (snapshot.exists) return;
        const uid = userIds[index];
        transaction.create(snapshot.ref, deliveryDocument({
          authorizationVersion: operation.desiredAuthority.authorizationVersion,
          createdAt: nowIso,
          identityKind,
          uid,
        }));
        created += 1;
      });
      transaction.update(operationReference, {
        counts: {...operation.counts, discovered: operation.counts.discovered + created},
        enumeration: enumerationUpdate,
        updatedAt: nowIso,
      });
      return created;
    });
  }

  private async enumerateNextPage(
    operation: ClaimPropagationOperationRecord,
    ownerHash: string,
  ): Promise<number> {
    const instituteReference = this.dependencies.firestore.doc(
      `institutes/${operation.instituteId}`,
    );
    if (!operation.enumeration.staffComplete) {
      const instituteSnapshot = await instituteReference.get();
      if (!instituteSnapshot.exists) throw new Error("Institute disappeared during propagation.");
      const settingsUsersValue = instituteSnapshot.get("settingsUsers");
      const settingsUsers = isRecord(settingsUsersValue) ? settingsUsersValue : {};
      const userIds = Object.keys(settingsUsers).sort();
      if (userIds.length > CLAIM_PROPAGATION_PAGE_SIZE) {
        throw new Error("Institute staff authority exceeds the bounded propagation page.");
      }
      return this.createDeliveries(
        operation.instituteId,
        operation.operationId,
        ownerHash,
        "staff",
        userIds,
        {...operation.enumeration, staffComplete: true},
      );
    }
    if (operation.enumeration.studentsComplete) return 0;
    let query: FirebaseFirestore.Query = instituteReference
      .collection("students")
      .orderBy(FieldPath.documentId(), "asc")
      .limit(CLAIM_PROPAGATION_PAGE_SIZE);
    if (operation.enumeration.studentCursor) {
      query = query.startAfter(operation.enumeration.studentCursor);
    }
    const snapshot = await query.get();
    const userIds = snapshot.docs.map((document) => document.id);
    return this.createDeliveries(
      operation.instituteId,
      operation.operationId,
      ownerHash,
      "student",
      userIds,
      {
        ...operation.enumeration,
        studentCursor: userIds.length > 0 ?
          userIds[userIds.length - 1] : operation.enumeration.studentCursor,
        studentsComplete: userIds.length < CLAIM_PROPAGATION_PAGE_SIZE,
      },
    );
  }

  private async claimDelivery(
    instituteId: string,
    operationId: string,
    uid: string,
    ownerHash: string,
  ): Promise<{attemptCount: number} | null> {
    const operationReference = this.operationReference(instituteId, operationId);
    const deliveryReference = operationReference.collection(DELIVERIES_COLLECTION).doc(uid);
    const instituteReference = this.dependencies.firestore.doc(`institutes/${instituteId}`);
    return this.dependencies.firestore.runTransaction(async (transaction) => {
      const [operationSnapshot, deliverySnapshot, instituteSnapshot] = await transaction.getAll(
        operationReference,
        deliveryReference,
        instituteReference,
      );
      const operation = parseOperation(operationSnapshot);
      if (
        operation.state !== "processing" ||
        operation.leaseOwnerHash !== ownerHash ||
        !deliverySnapshot.exists ||
        !instituteSnapshot.exists
      ) return null;
      const currentVersion = positiveInteger(
        instituteSnapshot.get("authorizationVersion"),
        "authorizationVersion",
      );
      const now = this.dependencies.now();
      const nowIso = now.toISOString();
      if (currentVersion !== operation.desiredAuthority.authorizationVersion) {
        transaction.update(deliveryReference, {
          completedAt: nowIso,
          leaseExpiresAt: null,
          leaseOwnerHash: null,
          nextAttemptAt: null,
          state: "superseded",
          updatedAt: nowIso,
        });
        transaction.update(operationReference, {
          completedAt: nowIso,
          leaseExpiresAt: null,
          leaseOwnerHash: null,
          nextAttemptAt: null,
          state: "superseded",
          supersededByOperationId: operationIdFor(currentVersion),
          updatedAt: nowIso,
        });
        return null;
      }
      const value = deliverySnapshot.data() ?? {};
      const state = value.state;
      if (!["pending", "processing", "retrying"].includes(String(state))) return null;
      const nextAttemptAt = optionalIsoTimestamp(value.nextAttemptAt, "delivery.nextAttemptAt");
      const leaseExpiresAt = optionalIsoTimestamp(value.leaseExpiresAt, "delivery.leaseExpiresAt");
      if (nextAttemptAt && nextAttemptAt > nowIso) return null;
      if (state === "processing" && leaseExpiresAt && leaseExpiresAt > nowIso) return null;
      const attemptCount = nonNegativeInteger(value.attemptCount, "delivery.attemptCount") + 1;
      if (attemptCount > CLAIM_PROPAGATION_MAX_ATTEMPTS) return null;
      transaction.update(deliveryReference, {
        attemptCount,
        leaseExpiresAt: addSeconds(now, CLAIM_PROPAGATION_LEASE_SECONDS),
        leaseOwnerHash: ownerHash,
        nextAttemptAt: addSeconds(now, CLAIM_PROPAGATION_LEASE_SECONDS),
        state: "processing",
        updatedAt: nowIso,
      });
      return {attemptCount};
    });
  }

  private async currentAuthorizationVersion(instituteId: string): Promise<number> {
    const snapshot = await this.dependencies.firestore.doc(
      `institutes/${instituteId}`,
    ).get();
    if (!snapshot.exists) {
      throw new Error(`Institute "${instituteId}" disappeared during delivery.`);
    }
    return positiveInteger(
      snapshot.get("authorizationVersion"),
      "authorizationVersion",
    );
  }

  private async synchronizeLatestAuthority(
    instituteId: string,
    uid: string,
  ): Promise<SynchronizationResult> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const versionBefore = await this.currentAuthorizationVersion(instituteId);
      const result = await this.dependencies.synchronizeClaimsAndRevokeSessions({
        authorizationVersion: versionBefore,
        instituteId,
        uid,
      });
      const versionAfter = await this.currentAuthorizationVersion(instituteId);
      if (versionAfter === versionBefore) return result;
    }
    const error = new Error("Institute authority changed repeatedly during delivery.") as
      Error & {code: string};
    error.code = "authorization_changed_during_delivery";
    throw error;
  }

  private async completeDelivery(
    instituteId: string,
    operationId: string,
    uid: string,
    ownerHash: string,
    attemptCount: number,
    result: SynchronizationResult,
  ): Promise<void> {
    const operationReference = this.operationReference(instituteId, operationId);
    const deliveryReference = operationReference.collection(DELIVERIES_COLLECTION).doc(uid);
    const instituteReference = this.dependencies.firestore.doc(`institutes/${instituteId}`);
    await this.dependencies.firestore.runTransaction(async (transaction) => {
      const [operationSnapshot, deliverySnapshot, instituteSnapshot] = await transaction.getAll(
        operationReference,
        deliveryReference,
        instituteReference,
      );
      const operation = parseOperation(operationSnapshot);
      if (!deliverySnapshot.exists || !instituteSnapshot.exists) return;
      const delivery = deliverySnapshot.data() ?? {};
      if (
        delivery.state !== "processing" ||
        delivery.leaseOwnerHash !== ownerHash ||
        delivery.attemptCount !== attemptCount
      ) return;
      const nowIso = this.dependencies.now().toISOString();
      const currentVersion = positiveInteger(
        instituteSnapshot.get("authorizationVersion"),
        "authorizationVersion",
      );
      if (currentVersion !== operation.desiredAuthority.authorizationVersion) {
        transaction.update(deliveryReference, {
          completedAt: nowIso,
          leaseExpiresAt: null,
          leaseOwnerHash: null,
          nextAttemptAt: null,
          state: "superseded",
          updatedAt: nowIso,
        });
        transaction.update(operationReference, {
          completedAt: nowIso,
          leaseExpiresAt: null,
          leaseOwnerHash: null,
          nextAttemptAt: null,
          state: "superseded",
          supersededByOperationId: operationIdFor(currentVersion),
          updatedAt: nowIso,
        });
        return;
      }
      const nextCounts = {...operation.counts};
      if (result.userMissing) nextCounts.missing += 1;
      else nextCounts.synchronized += 1;
      if (result.claimsChanged === true) nextCounts.claimsChanged += 1;
      if (result.refreshTokensRevoked) nextCounts.refreshTokensRevoked += 1;
      transaction.update(deliveryReference, {
        claimsChanged: result.claimsChanged,
        completedAt: nowIso,
        lastErrorCode: null,
        leaseExpiresAt: null,
        leaseOwnerHash: null,
        nextAttemptAt: null,
        refreshTokensRevoked: result.refreshTokensRevoked,
        state: result.userMissing ? "missing" : "synchronized",
        updatedAt: nowIso,
      });
      transaction.update(operationReference, {counts: nextCounts, updatedAt: nowIso});
    });
  }

  private async failDelivery(
    instituteId: string,
    operationId: string,
    uid: string,
    ownerHash: string,
    attemptCount: number,
    error: unknown,
  ): Promise<void> {
    const operationReference = this.operationReference(instituteId, operationId);
    const deliveryReference = operationReference.collection(DELIVERIES_COLLECTION).doc(uid);
    await this.dependencies.firestore.runTransaction(async (transaction) => {
      const [operationSnapshot, deliverySnapshot] = await transaction.getAll(
        operationReference,
        deliveryReference,
      );
      const operation = parseOperation(operationSnapshot);
      if (!deliverySnapshot.exists || operation.state !== "processing") return;
      const delivery = deliverySnapshot.data() ?? {};
      if (
        delivery.state !== "processing" ||
        delivery.leaseOwnerHash !== ownerHash ||
        delivery.attemptCount !== attemptCount
      ) return;
      const now = this.dependencies.now();
      const nowIso = now.toISOString();
      const terminal = attemptCount >= CLAIM_PROPAGATION_MAX_ATTEMPTS;
      const nextCounts = terminal ?
        {...operation.counts, deadLettered: operation.counts.deadLettered + 1} :
        operation.counts;
      transaction.update(deliveryReference, {
        completedAt: terminal ? nowIso : null,
        lastErrorCode: safeErrorCode(error),
        leaseExpiresAt: null,
        leaseOwnerHash: null,
        nextAttemptAt: terminal ? null : addSeconds(now, retryDelaySeconds(attemptCount)),
        state: terminal ? "dead_lettered" : "retrying",
        updatedAt: nowIso,
      });
      transaction.update(operationReference, {counts: nextCounts, updatedAt: nowIso});
    });
  }

  private async processDueDeliveries(
    operation: ClaimPropagationOperationRecord,
    ownerHash: string,
  ): Promise<number> {
    const operationReference = this.operationReference(
      operation.instituteId,
      operation.operationId,
    );
    const nowIso = this.dependencies.now().toISOString();
    const snapshot = await operationReference.collection(DELIVERIES_COLLECTION)
      .where("nextAttemptAt", ">=", "0000")
      .where("nextAttemptAt", "<=", nowIso)
      .orderBy("nextAttemptAt", "asc")
      .limit(CLAIM_PROPAGATION_DELIVERY_BATCH_SIZE)
      .get();
    let processed = 0;
    for (const document of snapshot.docs) {
      const claimed = await this.claimDelivery(
        operation.instituteId,
        operation.operationId,
        document.id,
        ownerHash,
      );
      if (!claimed) continue;
      processed += 1;
      try {
        const result = await this.synchronizeLatestAuthority(
          operation.instituteId,
          document.id,
        );
        await this.completeDelivery(
          operation.instituteId,
          operation.operationId,
          document.id,
          ownerHash,
          claimed.attemptCount,
          result,
        );
      } catch (error) {
        await this.failDelivery(
          operation.instituteId,
          operation.operationId,
          document.id,
          ownerHash,
          claimed.attemptCount,
          error,
        );
      }
    }
    return processed;
  }

  private async releaseOrCompleteOperation(
    instituteId: string,
    operationId: string,
    ownerHash: string,
    earliestDeliveryAttemptAt: string | null,
  ): Promise<ClaimPropagationOperationState> {
    const operationReference = this.operationReference(instituteId, operationId);
    const instituteReference = this.dependencies.firestore.doc(`institutes/${instituteId}`);
    return this.dependencies.firestore.runTransaction(async (transaction) => {
      const [operationSnapshot, instituteSnapshot] = await transaction.getAll(
        operationReference,
        instituteReference,
      );
      const operation = parseOperation(operationSnapshot);
      if (terminalOperationState(operation.state)) return operation.state;
      if (operation.leaseOwnerHash !== ownerHash || !instituteSnapshot.exists) {
        return operation.state;
      }
      const now = this.dependencies.now();
      const nowIso = now.toISOString();
      const currentVersion = positiveInteger(
        instituteSnapshot.get("authorizationVersion"),
        "authorizationVersion",
      );
      if (currentVersion !== operation.desiredAuthority.authorizationVersion) {
        transaction.update(operationReference, {
          completedAt: nowIso,
          leaseExpiresAt: null,
          leaseOwnerHash: null,
          nextAttemptAt: null,
          state: "superseded",
          supersededByOperationId: operationIdFor(currentVersion),
          updatedAt: nowIso,
        });
        return "superseded";
      }
      const terminalDeliveries = operation.counts.synchronized +
        operation.counts.missing + operation.counts.deadLettered;
      const enumerationComplete = operation.enumeration.staffComplete &&
        operation.enumeration.studentsComplete;
      if (enumerationComplete && terminalDeliveries >= operation.counts.discovered) {
        const state = operation.counts.deadLettered > 0 ? "dead_lettered" : "succeeded";
        transaction.update(operationReference, {
          attemptCount: 0,
          completedAt: nowIso,
          lastErrorCode: operation.counts.deadLettered > 0 ? "delivery_dead_lettered" : null,
          leaseExpiresAt: null,
          leaseOwnerHash: null,
          nextAttemptAt: null,
          state,
          updatedAt: nowIso,
        });
        return state;
      }
      const state = enumerationComplete ? "retrying" : "pending";
      transaction.update(operationReference, {
        attemptCount: 0,
        leaseExpiresAt: null,
        leaseOwnerHash: null,
        nextAttemptAt: enumerationComplete ?
          earliestDeliveryAttemptAt ??
            addSeconds(now, CLAIM_PROPAGATION_RETRY_DELAYS_SECONDS[0]) :
          nowIso,
        state,
        updatedAt: nowIso,
      });
      return state;
    });
  }

  private async failOperation(
    instituteId: string,
    operationId: string,
    ownerHash: string,
    error: unknown,
  ): Promise<ClaimPropagationOperationState> {
    const operationReference = this.operationReference(instituteId, operationId);
    return this.dependencies.firestore.runTransaction(async (transaction) => {
      const operationSnapshot = await transaction.get(operationReference);
      const operation = parseOperation(operationSnapshot);
      if (terminalOperationState(operation.state)) return operation.state;
      if (operation.leaseOwnerHash !== ownerHash) return operation.state;
      const now = this.dependencies.now();
      const nowIso = now.toISOString();
      const attemptCount = operation.attemptCount + 1;
      const terminal = attemptCount >= CLAIM_PROPAGATION_MAX_ATTEMPTS;
      const state: ClaimPropagationOperationState = terminal ? "dead_lettered" : "retrying";
      transaction.update(operationReference, {
        attemptCount,
        completedAt: terminal ? nowIso : null,
        lastErrorCode: safeErrorCode(error),
        leaseExpiresAt: null,
        leaseOwnerHash: null,
        nextAttemptAt: terminal ? null : addSeconds(now, retryDelaySeconds(attemptCount)),
        state,
        updatedAt: nowIso,
      });
      return state;
    });
  }

  public async processOperation(
    input: ProcessClaimPropagationOperationInput,
  ): Promise<ProcessClaimPropagationOperationResult> {
    const instituteId = requiredString(input.instituteId, "instituteId", 128);
    const operationId = requiredString(input.operationId, "operationId", 64);
    const ownerHash = workerHash(input.workerId);
    const claimed = await this.claimOperation(instituteId, operationId, ownerHash);
    if (!claimed) {
      const snapshot = await this.operationReference(instituteId, operationId).get();
      const operation = parseOperation(snapshot);
      return {operationId, processed: false, state: operation.state};
    }
    try {
      await this.enumerateNextPage(claimed, ownerHash);
      const currentSnapshot = await this.operationReference(instituteId, operationId).get();
      const currentOperation = parseOperation(currentSnapshot);
      if (!terminalOperationState(currentOperation.state)) {
        await this.processDueDeliveries(currentOperation, ownerHash);
      }
      const nextDeliverySnapshot = await this.operationReference(instituteId, operationId)
        .collection(DELIVERIES_COLLECTION)
        .where("nextAttemptAt", ">=", "0000")
        .orderBy("nextAttemptAt", "asc")
        .limit(1)
        .get();
      const earliestDeliveryAttemptAt = nextDeliverySnapshot.empty ? null :
        optionalIsoTimestamp(
          nextDeliverySnapshot.docs[0].get("nextAttemptAt"),
          "delivery.nextAttemptAt",
        );
      const state = await this.releaseOrCompleteOperation(
        instituteId,
        operationId,
        ownerHash,
        earliestDeliveryAttemptAt,
      );
      return {operationId, processed: true, state};
    } catch (error) {
      const state = await this.failOperation(
        instituteId,
        operationId,
        ownerHash,
        error,
      );
      return {operationId, processed: true, state};
    }
  }

  public async processDueOperations(
    workerIdInput: string,
    maximumOperations = CLAIM_PROPAGATION_SWEEP_MAX_OPERATIONS,
  ): Promise<ProcessDueClaimPropagationOperationsResult> {
    const workerId = requiredString(workerIdInput, "workerId", 512);
    if (
      !Number.isSafeInteger(maximumOperations) ||
      maximumOperations < 1 ||
      maximumOperations > CLAIM_PROPAGATION_SWEEP_MAX_OPERATIONS
    ) {
      throw new Error("Claim propagation sweep size is invalid.");
    }
    let invoked = 0;
    let processed = 0;
    while (invoked < maximumOperations) {
      const nowIso = this.dependencies.now().toISOString();
      const snapshot = await this.dependencies.firestore
        .collectionGroup(OPERATIONS_COLLECTION)
        .where("state", "in", ["pending", "processing", "retrying"])
        .where("nextAttemptAt", "<=", nowIso)
        .orderBy("nextAttemptAt", "asc")
        .limit(Math.min(10, maximumOperations - invoked))
        .get();
      if (snapshot.empty) break;
      for (const document of snapshot.docs) {
        if (invoked >= maximumOperations) break;
        const operationCollection = document.ref.parent;
        const instituteReference = operationCollection.parent;
        if (
          operationCollection.id !== OPERATIONS_COLLECTION ||
          !instituteReference ||
          instituteReference.parent.id !== "institutes"
        ) {
          continue;
        }
        invoked += 1;
        const result = await this.processOperation({
          instituteId: instituteReference.id,
          operationId: document.id,
          workerId,
        });
        if (result.processed) processed += 1;
      }
    }
    return {invoked, processed};
  }
}

export class ClaimPropagationScheduleService {
  constructor(
    private readonly deadlineService: Pick<
      ClaimPropagationDeadlineService,
      "processDueTransitions"
    >,
    private readonly worker: Pick<ClaimPropagationWorker, "processDueOperations">,
  ) {}

  public async execute(workerId: string): Promise<ProcessClaimPropagationScheduleResult> {
    const deadlines = await this.deadlineService.processDueTransitions(
      CLAIM_PROPAGATION_PAGE_SIZE,
    );
    const operations = await this.worker.processDueOperations(
      workerId,
      CLAIM_PROPAGATION_SWEEP_MAX_OPERATIONS,
    );
    return {deadlines, operations};
  }
}

export const claimPropagationCoordinator = new ClaimPropagationCoordinator();
export const claimPropagationWorker = new ClaimPropagationWorker();
export const claimPropagationDeadlineService = new ClaimPropagationDeadlineService();
export const claimPropagationScheduleService = new ClaimPropagationScheduleService(
  claimPropagationDeadlineService,
  claimPropagationWorker,
);
