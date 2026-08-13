import {getFirebaseAdminApp} from "../utils/firebaseAdmin";
import {
  customClaimSynchronizationService,
} from "./customClaimSynchronization";

export interface IdentitySessionSecurityResult {
  claimsChanged: boolean | null;
  refreshTokensRevoked: boolean;
  uid: string;
  userMissing: boolean;
}

export interface IdentitySessionSecurityDependencies {
  clearManagedUserClaims: (
    uid: string,
  ) => Promise<{changed: boolean}>;
  revokeRefreshTokens: (uid: string) => Promise<void>;
  synchronizeInstituteUserClaims: (
    input: {instituteId: string; uid: string},
  ) => Promise<{changed: boolean}>;
}

const normalizeRequiredString = (value: unknown, fieldName: string): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Field "${fieldName}" must be a non-empty string.`);
  }

  return value.trim();
};

const isUserNotFound = (error: unknown): boolean =>
  error instanceof Error &&
  "code" in error &&
  (error as {code?: unknown}).code === "auth/user-not-found";

/**
 * Coordinates custom-claim transitions with Firebase refresh-token revocation.
 */
export class IdentitySessionSecurityService {
  constructor(
    private readonly dependencies: IdentitySessionSecurityDependencies = {
      clearManagedUserClaims: (uid) =>
        customClaimSynchronizationService.clearManagedUserClaims(uid),
      revokeRefreshTokens: (uid) =>
        getFirebaseAdminApp().auth().revokeRefreshTokens(uid),
      synchronizeInstituteUserClaims: (input) =>
        customClaimSynchronizationService.synchronizeInstituteUserClaims(input),
    },
  ) {}

  async synchronizeClaimsAndRevokeSessions(
    input: {instituteId: string; uid: string},
  ): Promise<IdentitySessionSecurityResult> {
    const normalizedInput = {
      instituteId: normalizeRequiredString(input.instituteId, "instituteId"),
      uid: normalizeRequiredString(input.uid, "uid"),
    };

    try {
      const claimResult =
        await this.dependencies.synchronizeInstituteUserClaims(normalizedInput);
      await this.dependencies.revokeRefreshTokens(normalizedInput.uid);

      return {
        claimsChanged: claimResult.changed,
        refreshTokensRevoked: true,
        uid: normalizedInput.uid,
        userMissing: false,
      };
    } catch (error) {
      if (isUserNotFound(error)) {
        return {
          claimsChanged: null,
          refreshTokensRevoked: false,
          uid: normalizedInput.uid,
          userMissing: true,
        };
      }

      throw error;
    }
  }

  async clearClaimsAndRevokeSessions(
    uidInput: string,
  ): Promise<IdentitySessionSecurityResult> {
    const uid = normalizeRequiredString(uidInput, "uid");

    try {
      const claimResult = await this.dependencies.clearManagedUserClaims(uid);
      await this.dependencies.revokeRefreshTokens(uid);

      return {
        claimsChanged: claimResult.changed,
        refreshTokensRevoked: true,
        uid,
        userMissing: false,
      };
    } catch (error) {
      if (isUserNotFound(error)) {
        return {
          claimsChanged: null,
          refreshTokensRevoked: false,
          uid,
          userMissing: true,
        };
      }

      throw error;
    }
  }

  async revokeSessions(
    uidInput: string,
  ): Promise<IdentitySessionSecurityResult> {
    const uid = normalizeRequiredString(uidInput, "uid");

    try {
      await this.dependencies.revokeRefreshTokens(uid);

      return {
        claimsChanged: null,
        refreshTokensRevoked: true,
        uid,
        userMissing: false,
      };
    } catch (error) {
      if (isUserNotFound(error)) {
        return {
          claimsChanged: null,
          refreshTokensRevoked: false,
          uid,
          userMissing: true,
        };
      }

      throw error;
    }
  }
}

export const identitySessionSecurityService =
  new IdentitySessionSecurityService();
