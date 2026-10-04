/* eslint-disable max-len, require-jsdoc */
import {Timestamp} from "firebase-admin/firestore";
import type {DecodedIdToken} from "firebase-admin/auth";
import type {
  ClaimPropagationFeatureFlags,
  ClaimPropagationLicenseLayer,
  ClaimPropagationLicenseState,
  InstituteSessionEnforcementReason,
} from "../../../shared/contracts/claimPropagation";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";

const ACTIVE_SESSION_STATUSES = ["created", "started", "active"] as const;
const LAYER_ORDER: Record<ClaimPropagationLicenseLayer, number> = {
  L0: 0,
  L1: 1,
  L2: 2,
  L3: 3,
};
const MODE_REQUIRED_LAYER: Record<string, ClaimPropagationLicenseLayer> = {
  Controlled: "L2",
  Diagnostic: "L1",
  Hard: "L2",
  Operational: "L0",
};

export type InstituteAuthorityEnforcementFailure =
  | InstituteSessionEnforcementReason
  | "malformed_authority";

export interface CurrentInstituteAuthority {
  activeStudentLimit: number;
  authorizationVersion: number;
  concurrentSessionLimit: number;
  expiryDate: string | null;
  featureFlags: ClaimPropagationFeatureFlags;
  gracePeriodEndsAt: string | null;
  instituteId: string;
  instituteStatus: "active" | "suspended";
  licenseLayer: ClaimPropagationLicenseLayer;
  licenseState: ClaimPropagationLicenseState;
  licenseVersion: string;
}

export class InstituteAuthorityEnforcementError extends Error {
  constructor(
    public readonly reason: InstituteAuthorityEnforcementFailure,
    message: string,
  ) {
    super(message);
    this.name = "InstituteAuthorityEnforcementError";
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requiredString = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new InstituteAuthorityEnforcementError(
      "malformed_authority",
      `Current institute authority field "${field}" is missing or invalid.`,
    );
  }
  return value.trim();
};

const positiveInteger = (value: unknown, field: string): number => {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new InstituteAuthorityEnforcementError(
      "malformed_authority",
      `Current institute authority field "${field}" must be a positive integer.`,
    );
  }
  return Number(value);
};

const optionalDate = (value: unknown, field: string): Date | null => {
  if (value === null || value === undefined) return null;
  const candidate = value instanceof Timestamp ? value.toDate() :
    value instanceof Date ? value :
      typeof value === "string" ? new Date(value) : null;
  if (!candidate || Number.isNaN(candidate.getTime())) {
    throw new InstituteAuthorityEnforcementError(
      "malformed_authority",
      `Current institute authority field "${field}" must be a timestamp or null.`,
    );
  }
  return candidate;
};

const featureFlags = (value: unknown): ClaimPropagationFeatureFlags => {
  if (!isRecord(value)) {
    throw new InstituteAuthorityEnforcementError(
      "malformed_authority",
      "Current institute authority feature flags are missing.",
    );
  }
  return {
    adaptivePhase: value.adaptivePhase === true,
    controlledMode: value.controlledMode === true,
    governanceAccess: value.governanceAccess === true,
    hardMode: value.hardMode === true,
    riskOverview: value.riskOverview === true,
  };
};

const normalizeLayer = (value: unknown): ClaimPropagationLicenseLayer => {
  const layer = requiredString(value, "license.currentLayer").toUpperCase();
  if (layer !== "L0" && layer !== "L1" && layer !== "L2" && layer !== "L3") {
    throw new InstituteAuthorityEnforcementError(
      "malformed_authority",
      "Current institute license layer is unsupported.",
    );
  }
  return layer;
};

const normalizeState = (
  licenseData: Record<string, unknown>,
  now: Date,
): ClaimPropagationLicenseState => {
  const state = requiredString(
    licenseData.licenseState,
    "license.licenseState",
  ).toLowerCase();
  if (state !== "active" && state !== "grace" && state !== "expired") {
    throw new InstituteAuthorityEnforcementError(
      "malformed_authority",
      "Current institute license state is unsupported.",
    );
  }
  const expiryDate = optionalDate(licenseData.expiryDate, "license.expiryDate");
  const gracePeriodEndsAt = optionalDate(
    licenseData.gracePeriodEndsAt,
    "license.gracePeriodEndsAt",
  );
  if (state === "active" && expiryDate && expiryDate.getTime() <= now.getTime()) {
    return "expired";
  }
  if (
    state === "grace" &&
    (!gracePeriodEndsAt || gracePeriodEndsAt.getTime() <= now.getTime())
  ) {
    return "expired";
  }
  return state;
};

const normalizeMode = (value: unknown): keyof typeof MODE_REQUIRED_LAYER => {
  const mode = requiredString(value, "session.mode");
  if (!(mode in MODE_REQUIRED_LAYER)) {
    throw new InstituteAuthorityEnforcementError(
      "malformed_authority",
      "Session mode is unsupported by current institute authority.",
    );
  }
  return mode as keyof typeof MODE_REQUIRED_LAYER;
};

const optionalPositiveInteger = (value: unknown): number | null =>
  Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : null;

const decodedFeatureFlags = (value: unknown): ClaimPropagationFeatureFlags | null => {
  if (!isRecord(value)) return null;
  return {
    adaptivePhase: value.adaptivePhase === true,
    controlledMode: value.controlledMode === true,
    governanceAccess: value.governanceAccess === true,
    hardMode: value.hardMode === true,
    riskOverview: value.riskOverview === true,
  };
};

export class InstituteAuthorityEnforcementService {
  constructor(
    private readonly dependencies: {
      firestore: FirebaseFirestore.Firestore;
      now: () => Date;
    } = {
      firestore: getFirestore(),
      now: () => new Date(),
    },
  ) {}

  public async readCurrentAuthority(
    transaction: FirebaseFirestore.Transaction,
    instituteId: string,
  ): Promise<CurrentInstituteAuthority> {
    const normalizedInstituteId = requiredString(instituteId, "instituteId");
    const instituteReference = this.dependencies.firestore
      .collection("institutes").doc(normalizedInstituteId);
    const licenseReference = instituteReference.collection("license").doc("current");
    const [instituteSnapshot, licenseSnapshot] = await transaction.getAll(
      instituteReference,
      licenseReference,
    );
    if (!instituteSnapshot.exists || !licenseSnapshot.exists) {
      throw new InstituteAuthorityEnforcementError(
        "malformed_authority",
        "Current institute and license authority are required.",
      );
    }
    const instituteData = instituteSnapshot.data() ?? {};
    const licenseData = licenseSnapshot.data() ?? {};
    const expiryDate = optionalDate(licenseData.expiryDate, "license.expiryDate");
    const gracePeriodEndsAt = optionalDate(
      licenseData.gracePeriodEndsAt,
      "license.gracePeriodEndsAt",
    );
    const status = requiredString(instituteData.status, "institute.status")
      .toLowerCase();
    if (status !== "active" && status !== "suspended" && status !== "archived") {
      throw new InstituteAuthorityEnforcementError(
        "malformed_authority",
        "Current institute access state is unsupported.",
      );
    }
    const licenseVersion = requiredString(
      licenseData.licenseVersion,
      "license.licenseVersion",
    );
    if (requiredString(instituteData.licenseVersion, "institute.licenseVersion") !== licenseVersion) {
      throw new InstituteAuthorityEnforcementError(
        "malformed_authority",
        "Institute and current-license versions do not match.",
      );
    }
    return {
      activeStudentLimit: positiveInteger(
        licenseData.activeStudentLimit,
        "license.activeStudentLimit",
      ),
      authorizationVersion: positiveInteger(
        instituteData.authorizationVersion,
        "institute.authorizationVersion",
      ),
      concurrentSessionLimit: positiveInteger(
        licenseData.concurrentSessionLimit,
        "license.concurrentSessionLimit",
      ),
      expiryDate: expiryDate?.toISOString() ?? null,
      featureFlags: featureFlags(licenseData.featureFlags),
      gracePeriodEndsAt: gracePeriodEndsAt?.toISOString() ?? null,
      instituteId: normalizedInstituteId,
      instituteStatus: status === "active" ? "active" : "suspended",
      licenseLayer: normalizeLayer(licenseData.currentLayer),
      licenseState: normalizeState(licenseData, this.dependencies.now()),
      licenseVersion,
    };
  }

  public assertOperational(authority: CurrentInstituteAuthority): void {
    if (authority.instituteStatus !== "active") {
      throw new InstituteAuthorityEnforcementError(
        "institute_suspended",
        "Institute access is suspended.",
      );
    }
    if (authority.licenseState !== "active") {
      throw new InstituteAuthorityEnforcementError(
        "license_expired",
        "Institute license is not active.",
      );
    }
  }

  public assertPresentedAuthorizationVersion(
    authority: CurrentInstituteAuthority,
    presentedAuthorizationVersion: unknown,
  ): void {
    if (
      !Number.isSafeInteger(presentedAuthorizationVersion) ||
      Number(presentedAuthorizationVersion) !== authority.authorizationVersion
    ) {
      throw new InstituteAuthorityEnforcementError(
        "stale_authorization_version",
        "Authentication authority is stale; refresh the session.",
      );
    }
  }

  public async assertDecodedTokenAuthority(
    decodedToken: DecodedIdToken,
  ): Promise<void> {
    const role = typeof decodedToken.role === "string" ?
      decodedToken.role.trim().toLowerCase() : "";
    if (role === "vendor" || decodedToken.isVendor === true) return;
    const instituteId = requiredString(
      decodedToken.instituteId ?? decodedToken.tenantId,
      "token.instituteId",
    );
    await this.dependencies.firestore.runTransaction(async (transaction) => {
      const authority = await this.readCurrentAuthority(transaction, instituteId);
      this.assertPresentedAuthorizationVersion(
        authority,
        optionalPositiveInteger(decodedToken.authorizationVersion),
      );
      this.assertOperational(authority);
      const tokenLayer = normalizeLayer(decodedToken.licenseLayer);
      const tokenVersion = requiredString(
        decodedToken.licenseVersion,
        "token.licenseVersion",
      );
      const tokenState = typeof decodedToken.licenseState === "string" ?
        decodedToken.licenseState.trim().toLowerCase() : "";
      const tokenFlags = decodedFeatureFlags(decodedToken.featureFlags);
      if (
        tokenLayer !== authority.licenseLayer ||
        tokenVersion !== authority.licenseVersion ||
        tokenState !== authority.licenseState ||
        !tokenFlags ||
        JSON.stringify(tokenFlags) !== JSON.stringify(authority.featureFlags)
      ) {
        throw new InstituteAuthorityEnforcementError(
          "stale_authorization_version",
          "Authentication entitlement authority is stale; refresh the session.",
        );
      }
    });
  }

  public assertModeAllowed(
    authority: CurrentInstituteAuthority,
    modeValue: unknown,
  ): void {
    this.assertOperational(authority);
    const mode = normalizeMode(modeValue);
    const requiredLayer = MODE_REQUIRED_LAYER[mode];
    if (LAYER_ORDER[authority.licenseLayer] < LAYER_ORDER[requiredLayer]) {
      throw new InstituteAuthorityEnforcementError(
        "license_downgrade",
        `Current license layer does not permit ${mode} sessions.`,
      );
    }
    if (
      (mode === "Controlled" && !authority.featureFlags.controlledMode) ||
      (mode === "Hard" && !authority.featureFlags.hardMode)
    ) {
      throw new InstituteAuthorityEnforcementError(
        "license_downgrade",
        `Current license feature flags do not permit ${mode} sessions.`,
      );
    }
  }

  public assertActiveSessionAllowed(
    authority: CurrentInstituteAuthority,
    sessionData: Record<string, unknown>,
  ): void {
    this.assertModeAllowed(authority, sessionData.mode);
    const snapshot = sessionData.licenseSnapshot;
    if (!isRecord(snapshot)) {
      throw new InstituteAuthorityEnforcementError(
        "malformed_authority",
        "Active session license snapshot is missing.",
      );
    }
    normalizeLayer(snapshot.currentLayer);
  }

  public async assertStudentActivationCapacity(
    transaction: FirebaseFirestore.Transaction,
    authority: CurrentInstituteAuthority,
  ): Promise<void> {
    this.assertOperational(authority);
    const query = this.dependencies.firestore
      .collection("institutes").doc(authority.instituteId)
      .collection("students")
      .where("status", "==", "active")
      .limit(authority.activeStudentLimit);
    const snapshot = await transaction.get(query);
    if (snapshot.size >= authority.activeStudentLimit) {
      throw new InstituteAuthorityEnforcementError(
        "active_student_limit",
        "Active Student capacity has been reached.",
      );
    }
  }

  public async assertConcurrentSessionCapacity(
    transaction: FirebaseFirestore.Transaction,
    authority: CurrentInstituteAuthority,
  ): Promise<void> {
    this.assertOperational(authority);
    let activeSessionCount = 0;
    for (const status of ACTIVE_SESSION_STATUSES) {
      const remaining = authority.concurrentSessionLimit - activeSessionCount;
      if (remaining <= 0) break;
      const query = this.dependencies.firestore.collectionGroup("sessions")
        .where("instituteId", "==", authority.instituteId)
        .where("status", "==", status)
        .limit(remaining);
      const snapshot = await transaction.get(query);
      activeSessionCount += snapshot.size;
    }
    if (activeSessionCount >= authority.concurrentSessionLimit) {
      throw new InstituteAuthorityEnforcementError(
        "concurrent_session_limit",
        "Concurrent Exam session capacity has been reached.",
      );
    }
  }
}

export const instituteAuthorityEnforcementService =
  new InstituteAuthorityEnforcementService();

export const verifyCurrentAuthorityIdToken = async (
  idToken: string,
): Promise<DecodedIdToken> => {
  const decodedToken = await getFirebaseAdminApp().auth()
    .verifyIdToken(idToken, true);
  await instituteAuthorityEnforcementService.assertDecodedTokenAuthority(
    decodedToken,
  );
  return decodedToken;
};
