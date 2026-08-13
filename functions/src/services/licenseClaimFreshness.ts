import {getFirestore} from "../utils/firebaseAdmin";
import {identitySessionSecurityService} from "./identitySessionSecurity";

const PROPAGATION_BATCH_SIZE = 25;

export interface InstituteLicenseIdentitySnapshot {
  licenseVersion: string;
  userIds: string[];
}

export interface LicenseClaimFreshnessResult {
  claimsChanged: number;
  instituteId: string;
  licenseVersion: string;
  refreshTokensRevoked: number;
  superseded: boolean;
  userCount: number;
  usersMissing: number;
}

interface LicenseClaimFreshnessDependencies {
  loadInstituteIdentitySnapshot: (
    instituteId: string,
  ) => Promise<InstituteLicenseIdentitySnapshot>;
  synchronizeClaimsAndRevokeSessions: (
    input: {instituteId: string; uid: string},
  ) => Promise<{
    claimsChanged: boolean | null;
    refreshTokensRevoked: boolean;
    userMissing: boolean;
  }>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeRequiredString = (value: unknown, fieldName: string): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Field "${fieldName}" must be a non-empty string.`);
  }

  return value.trim();
};

/**
 * Loads every authoritative institute identity and its persisted license
 * version for claim propagation.
 */
export class FirestoreInstituteLicenseIdentityRepository {
  constructor(
    private readonly firestore: FirebaseFirestore.Firestore = getFirestore(),
  ) {}

  async loadInstituteIdentitySnapshot(
    instituteIdInput: string,
  ): Promise<InstituteLicenseIdentitySnapshot> {
    const instituteId = normalizeRequiredString(
      instituteIdInput,
      "instituteId",
    );
    const instituteReference = this.firestore.doc(`institutes/${instituteId}`);
    const [instituteSnapshot, currentLicenseSnapshot, studentsSnapshot] =
      await Promise.all([
        instituteReference.get(),
        instituteReference.collection("license").doc("current").get(),
        instituteReference.collection("students").get(),
      ]);

    if (!instituteSnapshot.exists) {
      throw new Error(`Institute "${instituteId}" does not exist.`);
    }

    const instituteData = instituteSnapshot.data() ?? {};
    let licenseSnapshot = currentLicenseSnapshot;
    if (!licenseSnapshot.exists) {
      licenseSnapshot = await instituteReference
        .collection("license")
        .doc("main")
        .get();
    }
    if (!licenseSnapshot.exists) {
      throw new Error(
        `Institute "${instituteId}" has no authoritative license document.`,
      );
    }

    const licenseVersion = normalizeRequiredString(
      licenseSnapshot.get("licenseVersion") ?? instituteData.licenseVersion,
      "licenseVersion",
    );
    const instituteLicenseVersion = normalizeRequiredString(
      instituteData.licenseVersion,
      "institute.licenseVersion",
    );
    if (licenseVersion !== instituteLicenseVersion) {
      throw new Error(
        `Institute "${instituteId}" has inconsistent license versions.`,
      );
    }

    const settingsUsers = isRecord(instituteData.settingsUsers) ?
      instituteData.settingsUsers :
      {};
    const userIds = new Set<string>([
      ...Object.keys(settingsUsers),
      ...studentsSnapshot.docs.map((snapshot) => snapshot.id),
    ]);

    return {
      licenseVersion,
      userIds: Array.from(userIds).sort(),
    };
  }
}

/**
 * Projects a changed license version into all institute identities and then
 * revokes their existing refresh-token sessions.
 */
export class LicenseClaimFreshnessService {
  constructor(
    private readonly dependencies: LicenseClaimFreshnessDependencies = {
      loadInstituteIdentitySnapshot: (instituteId) =>
        new FirestoreInstituteLicenseIdentityRepository()
          .loadInstituteIdentitySnapshot(instituteId),
      synchronizeClaimsAndRevokeSessions: (input) =>
        identitySessionSecurityService
          .synchronizeClaimsAndRevokeSessions(input),
    },
  ) {}

  async propagateInstituteLicenseChange(
    input: {instituteId: string; licenseVersion: string},
  ): Promise<LicenseClaimFreshnessResult> {
    const instituteId = normalizeRequiredString(
      input.instituteId,
      "instituteId",
    );
    const licenseVersion = normalizeRequiredString(
      input.licenseVersion,
      "licenseVersion",
    );
    const snapshot = await this.dependencies.loadInstituteIdentitySnapshot(
      instituteId,
    );

    if (snapshot.licenseVersion !== licenseVersion) {
      return {
        claimsChanged: 0,
        instituteId,
        licenseVersion,
        refreshTokensRevoked: 0,
        superseded: true,
        userCount: 0,
        usersMissing: 0,
      };
    }

    let claimsChanged = 0;
    let refreshTokensRevoked = 0;
    let usersMissing = 0;

    for (
      let offset = 0;
      offset < snapshot.userIds.length;
      offset += PROPAGATION_BATCH_SIZE
    ) {
      const results = await Promise.all(
        snapshot.userIds
          .slice(offset, offset + PROPAGATION_BATCH_SIZE)
          .map((uid) => this.dependencies.synchronizeClaimsAndRevokeSessions({
            instituteId,
            uid,
          })),
      );

      claimsChanged += results.filter(
        (result) => result.claimsChanged === true,
      ).length;
      refreshTokensRevoked += results.filter(
        (result) => result.refreshTokensRevoked,
      ).length;
      usersMissing += results.filter((result) => result.userMissing).length;
    }

    return {
      claimsChanged,
      instituteId,
      licenseVersion,
      refreshTokensRevoked,
      superseded: false,
      userCount: snapshot.userIds.length,
      usersMissing,
    };
  }
}

export const licenseClaimFreshnessService =
  new LicenseClaimFreshnessService();
