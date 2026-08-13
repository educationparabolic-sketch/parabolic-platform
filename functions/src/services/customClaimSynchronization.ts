import {UserRecord} from "firebase-admin/auth";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {
  ClearManagedCustomClaimsResult,
  CustomClaimAuthority,
  CustomClaimRole,
  CustomClaimSynchronizationError,
  SynchronizeCustomClaimsInput,
  SynchronizeCustomClaimsResult,
} from "../types/customClaimSynchronization";
import {LicenseLayer} from "../types/middleware";

const MANAGED_CLAIM_KEYS = new Set([
  "instituteId",
  "isSuspended",
  "isVendor",
  "licenseLayer",
  "licenseVersion",
  "role",
  "studentId",
  "tenantId",
  "userRole",
]);
const STAFF_ROLES = new Set<CustomClaimRole>([
  "admin",
  "director",
  "teacher",
]);
const STAFF_STATUSES = new Set(["active", "suspended"]);
const STUDENT_STATUSES = new Set([
  "active",
  "archived",
  "inactive",
  "invited",
  "suspended",
]);

interface AuthorityRepository {
  resolveInstituteAuthority: (
    input: SynchronizeCustomClaimsInput,
  ) => Promise<CustomClaimAuthority>;
}

interface CustomClaimAuthClient {
  getUser: (uid: string) => Promise<Pick<
    UserRecord,
    "customClaims" | "disabled" | "uid"
  >>;
  setCustomUserClaims: (
    uid: string,
    customUserClaims: Record<string, unknown>,
  ) => Promise<void>;
}

interface CustomClaimSynchronizationDependencies {
  auth: CustomClaimAuthClient;
  authorityRepository: AuthorityRepository;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeRequiredString = (
  value: unknown,
  fieldName: string,
): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new CustomClaimSynchronizationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a non-empty string.`,
    );
  }

  return value.trim();
};

const normalizeAuthorityString = (
  value: unknown,
  fieldName: string,
): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new CustomClaimSynchronizationError(
      "INVALID_AUTHORITY",
      `Authoritative field "${fieldName}" must be a non-empty string.`,
    );
  }

  return value.trim();
};

const normalizeStatus = (
  value: unknown,
  fieldName: string,
  allowedStatuses: Set<string>,
): string => {
  const status = normalizeAuthorityString(value, fieldName).toLowerCase();

  if (!allowedStatuses.has(status)) {
    throw new CustomClaimSynchronizationError(
      "INVALID_AUTHORITY",
      `Authoritative field "${fieldName}" has unsupported value "${status}".`,
    );
  }

  return status;
};

const normalizeLicenseLayer = (value: unknown): LicenseLayer => {
  const layer = normalizeAuthorityString(
    value,
    "license.currentLayer",
  ).toUpperCase();

  if (layer !== "L0" && layer !== "L1" && layer !== "L2" && layer !== "L3") {
    throw new CustomClaimSynchronizationError(
      "INVALID_AUTHORITY",
      "Authoritative license layer must be one of L0, L1, L2, or L3.",
    );
  }

  return layer;
};

const resolveLicenseVersion = (
  licenseData: Record<string, unknown>,
  instituteData: Record<string, unknown>,
  instituteId: string,
): string => {
  const candidate = licenseData.licenseVersion ?? instituteData.licenseVersion;

  if (typeof candidate === "string" && candidate.trim()) {
    return candidate.trim();
  }

  return `legacy:${instituteId}`;
};

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }

  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
};

const omitManagedClaims = (
  claims: Record<string, unknown> | undefined,
): Record<string, unknown> => Object.fromEntries(
  Object.entries(claims ?? {}).filter(([key]) => !MANAGED_CLAIM_KEYS.has(key)),
);

export class FirestoreCustomClaimAuthorityRepository
implements AuthorityRepository {
  constructor(
    private readonly firestore: FirebaseFirestore.Firestore = getFirestore(),
  ) {}

  async resolveInstituteAuthority(
    input: SynchronizeCustomClaimsInput,
  ): Promise<CustomClaimAuthority> {
    const instituteId = normalizeRequiredString(input.instituteId, "instituteId");
    const uid = normalizeRequiredString(input.uid, "uid");
    const instituteReference = this.firestore.doc(`institutes/${instituteId}`);
    const [instituteSnapshot, studentSnapshot, currentLicenseSnapshot] =
      await this.firestore.getAll(
        instituteReference,
        instituteReference.collection("students").doc(uid),
        instituteReference.collection("license").doc("current"),
      );

    if (!instituteSnapshot.exists) {
      throw new CustomClaimSynchronizationError(
        "AUTHORITY_NOT_FOUND",
        `Institute authority "${instituteId}" does not exist.`,
      );
    }

    const instituteData = instituteSnapshot.data() ?? {};
    const instituteStatus = normalizeStatus(
      instituteData.status,
      "institute.status",
      new Set(["active", "suspended"]),
    );
    const settingsUsers = isRecord(instituteData.settingsUsers) ?
      instituteData.settingsUsers :
      {};
    const staffData = isRecord(settingsUsers[uid]) ? settingsUsers[uid] : null;
    const studentData = studentSnapshot.exists ? studentSnapshot.data() ?? {} : null;

    if (staffData && studentData) {
      throw new CustomClaimSynchronizationError(
        "AMBIGUOUS_AUTHORITY",
        `User "${uid}" has both staff and student authority in institute "${instituteId}".`,
      );
    }

    if (!staffData && !studentData) {
      throw new CustomClaimSynchronizationError(
        "AUTHORITY_NOT_FOUND",
        `User "${uid}" has no institute identity authority in "${instituteId}".`,
      );
    }

    let licenseSnapshot = currentLicenseSnapshot;
    if (!licenseSnapshot.exists) {
      licenseSnapshot = await instituteReference.collection("license").doc("main").get();
    }
    if (!licenseSnapshot.exists) {
      throw new CustomClaimSynchronizationError(
        "AUTHORITY_NOT_FOUND",
        `Institute "${instituteId}" has no authoritative license document.`,
      );
    }
    const licenseData = licenseSnapshot.data() ?? {};
    const licenseLayer = normalizeLicenseLayer(licenseData.currentLayer);
    const licenseVersion = resolveLicenseVersion(
      licenseData,
      instituteData,
      instituteId,
    );
    const instituteSuspended = instituteStatus === "suspended";

    if (staffData) {
      const role = normalizeAuthorityString(
        staffData.role,
        `settingsUsers.${uid}.role`,
      ).toLowerCase() as CustomClaimRole;
      if (!STAFF_ROLES.has(role)) {
        throw new CustomClaimSynchronizationError(
          "INVALID_AUTHORITY",
          `Staff role "${role}" is not a supported authentication claim role.`,
        );
      }
      const status = normalizeStatus(
        staffData.status,
        `settingsUsers.${uid}.status`,
        STAFF_STATUSES,
      );

      return {
        instituteId,
        isSuspended: instituteSuspended || status === "suspended",
        licenseLayer,
        licenseVersion,
        role,
        source: "staff",
        studentId: null,
      };
    }

    const studentId = normalizeAuthorityString(
      studentData?.studentId ?? uid,
      "student.studentId",
    );
    if (studentId !== uid) {
      throw new CustomClaimSynchronizationError(
        "INVALID_AUTHORITY",
        `Student authority ID "${studentId}" does not match Auth UID "${uid}".`,
      );
    }
    const status = normalizeStatus(
      studentData?.status,
      "student.status",
      STUDENT_STATUSES,
    );

    return {
      instituteId,
      isSuspended: instituteSuspended || status === "suspended",
      licenseLayer,
      licenseVersion,
      role: "student",
      source: "student",
      studentId,
    };
  }
}

export class CustomClaimSynchronizationService {
  constructor(
    private readonly dependencies: CustomClaimSynchronizationDependencies = {
      auth: {
        getUser: (uid) => getFirebaseAdminApp().auth().getUser(uid),
        setCustomUserClaims: (uid, claims) =>
          getFirebaseAdminApp().auth().setCustomUserClaims(uid, claims),
      },
      authorityRepository: new FirestoreCustomClaimAuthorityRepository(),
    },
  ) {}

  async clearManagedUserClaims(
    uidInput: string,
  ): Promise<ClearManagedCustomClaimsResult> {
    const uid = normalizeRequiredString(uidInput, "uid");
    const user = await this.dependencies.auth.getUser(uid);

    if (user.uid !== uid) {
      throw new CustomClaimSynchronizationError(
        "INVALID_AUTHORITY",
        "Firebase Auth returned a user whose UID does not match the request.",
      );
    }

    const claims = omitManagedClaims(user.customClaims);
    const changed = stableJson(user.customClaims ?? {}) !== stableJson(claims);
    if (changed) {
      await this.dependencies.auth.setCustomUserClaims(uid, claims);
    }

    return {changed, claims, uid};
  }

  async synchronizeInstituteUserClaims(
    input: SynchronizeCustomClaimsInput,
  ): Promise<SynchronizeCustomClaimsResult> {
    const normalizedInput = {
      instituteId: normalizeRequiredString(input.instituteId, "instituteId"),
      uid: normalizeRequiredString(input.uid, "uid"),
    };
    const [user, authority] = await Promise.all([
      this.dependencies.auth.getUser(normalizedInput.uid),
      this.dependencies.authorityRepository.resolveInstituteAuthority(
        normalizedInput,
      ),
    ]);

    if (user.uid !== normalizedInput.uid) {
      throw new CustomClaimSynchronizationError(
        "INVALID_AUTHORITY",
        "Firebase Auth returned a user whose UID does not match the request.",
      );
    }
    if (authority.instituteId !== normalizedInput.instituteId) {
      throw new CustomClaimSynchronizationError(
        "INVALID_AUTHORITY",
        "Resolved identity authority does not match the requested institute.",
      );
    }

    const claims: Record<string, unknown> = {
      ...omitManagedClaims(user.customClaims),
      instituteId: authority.instituteId,
      isSuspended: authority.isSuspended || user.disabled,
      isVendor: false,
      licenseLayer: authority.licenseLayer,
      licenseVersion: authority.licenseVersion,
      role: authority.role,
    };
    if (authority.studentId) {
      claims.studentId = authority.studentId;
    }

    const changed = stableJson(user.customClaims ?? {}) !== stableJson(claims);
    if (changed) {
      await this.dependencies.auth.setCustomUserClaims(normalizedInput.uid, claims);
    }

    return {
      authoritySource: authority.source,
      changed,
      claims,
      instituteId: normalizedInput.instituteId,
      uid: normalizedInput.uid,
    };
  }
}

export const customClaimSynchronizationService =
  new CustomClaimSynchronizationService();
