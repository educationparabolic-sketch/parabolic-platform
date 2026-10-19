import {ExamProctoringError} from "./examProctoringPolicy";
import {RuntimeOwnershipError} from "./examRuntimeOwnership";
import {assertPhotoStudentBinding} from "./studentIdentityPhotoLifecycleAuthority";
import {createHash} from "node:crypto";
import type {Auth, DecodedIdToken} from "firebase-admin/auth";
import {FieldPath, Timestamp} from "firebase-admin/firestore";
import type {
  StudentIdentityPhotoState,
  StudentProfilePreferences,
  StudentProfilePreferencesRequest,
  StudentProfilePreferencesResult,
  StudentProfileResult,
} from "../../../shared/contracts/studentProfile";
import {STUDENT_IDENTITY_PHOTO_POLICY as POLICY} from "./studentIdentityPhotoPolicy";
import {hasConsistentOwnStudentClaims, STUDENT_PROFILE_CAPABILITY} from "../policy/studentRolePolicy";
import {StudentProfileValidationError} from "../types/studentProfile";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {
  InstituteAuthorityEnforcementError,
  InstituteAuthorityEnforcementService,
} from "./instituteAuthorityEnforcement";


const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const PHOTO_ID = /^photo_[a-f0-9]{40}$/u;
const YEAR_PRIORITY = ["active", "started", "scheduled"];
const YEAR_STATUSES = new Set([...YEAR_PRIORITY, "locked", "archived", "draft"]);
const MAX_YEARS = 25;
const SOURCE = "StudentProfileService";
const COMMAND = "update-own-preferences";

function fail(code: StudentProfileValidationError["code"], message: string): never {
  throw new StudentProfileValidationError(code, message);
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exactKeys(
  value: unknown,
  keys: string[],
  code: "VALIDATION_ERROR" | "INTERNAL_ERROR",
): asserts value is Record<string, unknown> {
  if (!record(value) || Object.keys(value).sort().join(",") !== [...keys].sort().join(",")) {
    fail(code, "Profile fields are missing or unsupported.");
  }
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 320) {
    return fail("INTERNAL_ERROR", "Profile authority is malformed.");
  }
  return value.trim();
}
function identifier(value: unknown): string {
  const id = text(value);
  if (value !== id || id.includes("/") || id === "." || id === ".." || id.length > 128) {
    return fail("FORBIDDEN", "Profile identity is invalid.");
  }
  return id;
}
export function readStudentProfileVersion(value: unknown): number {
  if (value === undefined) return 1;
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) >= Number.MAX_SAFE_INTEGER) {
    return fail("INTERNAL_ERROR", "Student version is malformed.");
  }
  return Number(value);
}
function preferences(value: unknown): StudentProfilePreferences {
  if (value === undefined) return {sidebarCollapsed: false};
  exactKeys(value, ["sidebarCollapsed"], "INTERNAL_ERROR");
  if (typeof value.sidebarCollapsed !== "boolean") {
    return fail("INTERNAL_ERROR", "Stored preferences are malformed.");
  }
  return {sidebarCollapsed: value.sidebarCollapsed};
}
function iso(value: unknown): string {
  if (!(value instanceof Timestamp)) return fail("INTERNAL_ERROR", "Profile time authority is malformed.");
  return value.toDate().toISOString();
}
function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function normalizeStudentProfilePreferencesRequest(value: unknown): StudentProfilePreferencesRequest {
  exactKeys(value, ["expectedVersion", "idempotencyKey", "preferences"], "VALIDATION_ERROR");
  exactKeys(value.preferences, ["sidebarCollapsed"], "VALIDATION_ERROR");
  if (
    !Number.isSafeInteger(value.expectedVersion) ||
    Number(value.expectedVersion) < 1 ||
    Number(value.expectedVersion) >= Number.MAX_SAFE_INTEGER ||
    typeof value.idempotencyKey !== "string" ||
    !UUID.test(value.idempotencyKey) ||
    typeof value.preferences.sidebarCollapsed !== "boolean"
  ) {
    return fail("VALIDATION_ERROR", "Preference command is invalid.");
  }
  return {
    expectedVersion: Number(value.expectedVersion),
    idempotencyKey: value.idempotencyKey,
    preferences: {sidebarCollapsed: value.preferences.sidebarCollapsed},
  };
}

interface Dependencies {
  auth?: Pick<Auth, "verifyIdToken" | "getUser">;
  firestore?: FirebaseFirestore.Firestore;
  now?: () => Timestamp;
}
interface Scope {
  token: DecodedIdToken;
  instituteId: string;
  studentId: string;
}

/** Own profile authority; no Auth mutation. */
export class StudentProfileService {
  private readonly firestore: FirebaseFirestore.Firestore;
  private readonly auth: Pick<Auth, "verifyIdToken" | "getUser">;
  private readonly now: () => Timestamp;
  private readonly authority: InstituteAuthorityEnforcementService;

  constructor(dependencies: Dependencies = {}) {
    this.firestore = dependencies.firestore ?? getFirestore();
    this.auth = dependencies.auth ?? getFirebaseAdminApp().auth();
    this.now = dependencies.now ?? (() => Timestamp.now());
    this.authority = new InstituteAuthorityEnforcementService({
      firestore: this.firestore,
      now: () => this.now().toDate(),
    });
  }

  private async authenticate(idToken: string): Promise<Scope> {
    if (typeof idToken !== "string" || !idToken) return fail("UNAUTHORIZED", "Authentication is required.");
    let token: DecodedIdToken;
    try {
      token = await this.auth.verifyIdToken(idToken, true);
    } catch {
      return fail("UNAUTHORIZED", "Authentication is invalid.");
    }
    let uid: string;
    let instituteId: string;
    try {
      uid = identifier(token.uid);
      instituteId = identifier(token.instituteId);
    } catch {
      return fail("UNAUTHORIZED", "Authentication identity is malformed.");
    }
    this.assertClaims(token, uid, instituteId);
    return {token, instituteId, studentId: uid};
  }

  private assertClaims(claims: Record<string, unknown>, uid: string, instituteId: string): void {
    const allowed: readonly string[] = STUDENT_PROFILE_CAPABILITY.allowedRoles;
    if (
      !allowed.includes(String(claims.role)) ||
      !hasConsistentOwnStudentClaims(claims, uid, instituteId)
    ) {
      fail("FORBIDDEN", "Current Student identity is required.");
    }
  }

  private async withScope<T>(
    idToken: string,
    work: (
      transaction: FirebaseFirestore.Transaction,
      scope: Scope,
      student: FirebaseFirestore.DocumentSnapshot,
    ) => Promise<T>,
    privacy = false,
  ): Promise<T> {
    const scope = await this.authenticate(idToken);
    try {
      return await this.firestore.runTransaction(async (transaction) => {
        // Refresh on every transaction retry; no stale-token/current-role bypass.
        let current;
        try {
          current = await this.auth.getUser(scope.studentId);
        } catch (error) {
          const code = record(error) ? error.code : undefined;
          return fail(
            code === "auth/user-not-found" ? "UNAUTHORIZED" : "INTERNAL_ERROR",
            "Current authentication authority is unavailable.",
          );
        }
        if (current.disabled || current.uid !== scope.studentId) {
          return fail("UNAUTHORIZED", "Authentication is disabled.");
        }
        const claims = current.customClaims ?? {};
        this.assertClaims(claims, scope.studentId, scope.instituteId);
        if (!privacy) {
          const authority = await this.authority.readCurrentAuthority(transaction, scope.instituteId);
          this.authority.assertTokenAuthority(authority, scope.token);
          this.authority.assertTokenAuthority(authority, claims);
        }
        const student = await transaction.get(this.studentRef(scope));
        const data = student.data();
        if (data && data.deleted !== undefined && typeof data.deleted !== "boolean") {
          return fail("INTERNAL_ERROR", "Student deletion authority is malformed.");
        }
        if (!data || (!privacy && (data.deleted === true || data.status !== "active"))) {
          return fail("NOT_FOUND", "Active own Student profile was not found.");
        }
        if (data.studentId !== undefined && data.studentId !== scope.studentId) {
          return fail("NOT_FOUND", "Active own Student profile was not found.");
        }
        return work(transaction, scope, student);
      });
    } catch (error) {
      if (error instanceof RuntimeOwnershipError || error instanceof ExamProctoringError) throw error;
      if (error instanceof StudentProfileValidationError) throw error;
      if (error instanceof InstituteAuthorityEnforcementError) {
        return fail(
          error.reason === "license_expired" ?
            "LICENSE_RESTRICTED" :
            error.reason === "malformed_authority" ?
              "INTERNAL_ERROR" :
              "FORBIDDEN",
          "Current institute authority denied access.",
        );
      }
      return fail("INTERNAL_ERROR", "Profile operation could not be completed.");
    }
  }

  // Shared internal transaction authority; never accepts browser actor/tenant fields.
  public withOwnStudent<T>(
    idToken: string,
    work: (
      transaction: FirebaseFirestore.Transaction,
      owner: {instituteId: string; studentId: string; token: DecodedIdToken},
      student: FirebaseFirestore.DocumentSnapshot,
    ) => Promise<T>,
  ): Promise<T> {
    return this.withScope(idToken, (transaction, scope, student) =>
      work(transaction, {instituteId: scope.instituteId, studentId: scope.studentId, token: scope.token}, student));
  }

  // Only withdrawal and media-free exact lifecycle status use this narrow exception.
  public withOwnStudentPrivacy<T>(
    idToken: string,
    work: (
      transaction: FirebaseFirestore.Transaction,
      owner: {instituteId: string; studentId: string},
      student: FirebaseFirestore.DocumentSnapshot,
    ) => Promise<T>,
  ): Promise<T> {
    return this.withScope(idToken, (transaction, scope, student) =>
      work(transaction, {instituteId: scope.instituteId, studentId: scope.studentId}, student), true);
  }

  private studentRef(scope: Scope): FirebaseFirestore.DocumentReference {
    return this.firestore
      .collection("institutes")
      .doc(scope.instituteId)
      .collection("students")
      .doc(scope.studentId);
  }

  public async getProfile(idToken: string): Promise<StudentProfileResult> {
    return this.withScope(idToken, async (transaction, scope, student) => {
      const data = student.data() ?? fail("INTERNAL_ERROR", "Student authority is missing.");
      const years = await transaction.get(
        this.firestore
          .collection("institutes")
          .doc(scope.instituteId)
          .collection("academicYears")
          .orderBy(FieldPath.documentId())
          .limit(MAX_YEARS + 1),
      );
      if (years.size > MAX_YEARS) {
        return fail("INTERNAL_ERROR", "Academic year authority exceeds the supported bound.");
      }
      const candidates = years.docs
        .map((year) => {
          const status = text(year.get("status")).toLowerCase();
          if (!YEAR_STATUSES.has(status)) {
            return fail("INTERNAL_ERROR", "Academic year authority is malformed.");
          }
          return {year, priority: YEAR_PRIORITY.indexOf(status)};
        })
        .filter(({priority}) => priority >= 0)
        .sort((a, b) => a.priority - b.priority);
      if (candidates.length > 1 && candidates[0].priority === candidates[1].priority) {
        return fail("INTERNAL_ERROR", "Current academic year authority is ambiguous.");
      }
      const year = candidates[0]?.year;
      const fullName = text(data.fullName ?? data.name);
      if (data.fullName !== undefined && data.name !== undefined && text(data.name) !== fullName) {
        return fail("INTERNAL_ERROR", "Student name authority is contradictory.");
      }
      const email = text(data.email);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
        return fail("INTERNAL_ERROR", "Student email authority is malformed.");
      }
      const batchName = data.batchName ?? data.batch;
      const batch =
        batchName === undefined || batchName === null ?
          null :
          {
            id: data.batchId === undefined || data.batchId === null ? null : text(data.batchId),
            name: text(batchName),
          };
      if (!batch && data.batchId != null) {
        return fail("INTERNAL_ERROR", "Student batch authority is malformed.");
      }
      if (data.batchId != null && data.batch != null && text(data.batchId) !== text(data.batch)) {
        return fail("INTERNAL_ERROR", "Student batch authority is contradictory.");
      }
      return {
        studentId: scope.studentId,
        version: readStudentProfileVersion(data.version),
        fullName,
        email,
        batch,
        academicYear: year ? {id: year.id, name: text(year.get("academicYearLabel") ?? year.id)} : null,
        preferences: preferences(data.profilePreferences),
        identityPhoto: await this.projectPhoto(transaction, scope, data),
        photoPolicy: {...POLICY},
      };
    });
  }

  public async projectPhoto(
    transaction: FirebaseFirestore.Transaction,
    scope: {instituteId: string; studentId: string},
    data: FirebaseFirestore.DocumentData,
  ): Promise<StudentIdentityPhotoState> {
    assertPhotoStudentBinding(data, scope.studentId);
    const state = data.identityPhotoConsentState ?? "never_enrolled";
    if (state === "never_enrolled" || state === "withdrawn") {
      if (data.identityPhotoId != null) {
        return fail("INTERNAL_ERROR", "Photo consent authority is contradictory.");
      }
      return {
        status: state === "withdrawn" ? "withdrawn" : "not_enrolled",
        photo: null,
        mediaAvailable: false,
      };
    }
    if (
      state !== "granted" ||
      typeof data.identityPhotoId !== "string" ||
      !PHOTO_ID.test(data.identityPhotoId) ||
      data.identityPhotoConsentPolicyVersion !== POLICY.policyVersion
    ) {
      return fail("INTERNAL_ERROR", "Photo consent authority is malformed.");
    }
    const capturedAt = iso(data.identityPhotoCapturedAt);
    const expiresAt = iso(data.identityPhotoExpiresAt);
    if (
      iso(data.identityPhotoConsentedAt) !== capturedAt ||
      Date.parse(expiresAt) - Date.parse(capturedAt) !== POLICY.retentionDays * 86400000 ||
      Date.parse(capturedAt) > this.now().toMillis()
    ) {
      return fail("INTERNAL_ERROR", "Photo retention authority is malformed.");
    }
    const photo = {
      photoId: data.identityPhotoId,
      capturedAt,
      expiresAt,
      consentPolicyVersion: POLICY.policyVersion,
    };
    const stored = await transaction.get(
      this.firestore
        .collection("institutes")
        .doc(scope.instituteId)
        .collection("identityPhotos")
        .doc(photo.photoId),
    );
    const value = stored.data();
    if (
      !value ||
      value.schemaVersion !== 1 ||
      value.studentId !== scope.studentId ||
      value.studentUid !== scope.studentId
    ) {
      return fail("INTERNAL_ERROR", "Managed photo ownership is malformed.");
    }
    if (this.now().toMillis() >= Date.parse(expiresAt)) {
      if (
        !["active", "deletion_pending", "deleting", "deleted"].includes(value.state) ||
        (value.state !== "active" && value.deletionReason !== "retention_expired")
      ) {
        return fail("INTERNAL_ERROR", "Expired photo authority is malformed.");
      }
      return {status: "expired", photo, mediaAvailable: false};
    }
    if (
      value.state !== "active" ||
      value.consentPolicyVersion !== POLICY.policyVersion ||
      iso(value.committedAt) !== capturedAt ||
      iso(value.consentedAt) !== capturedAt ||
      iso(value.expiresAt) !== expiresAt
    ) {
      return fail("INTERNAL_ERROR", "Current photo authority is malformed.");
    }
    // Eligibility is derived from a structurally valid private record. The
    // later media boundary must still inspect actual Storage bytes/generation.
    const expectedPath = `identity-photos/${encodeURIComponent(scope.instituteId)}/` +
      `${encodeURIComponent(scope.studentId)}/${photo.photoId}.jpg`;
    if (value.mediaType !== POLICY.mediaType || value.objectPath !== expectedPath ||
        typeof value.bucketName !== "string" || !/^[a-z0-9][a-z0-9._-]+$/u.test(value.bucketName) ||
        typeof value.generation !== "string" || !/^[1-9][0-9]*$/u.test(value.generation) ||
        typeof value.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(value.sha256) ||
        !Number.isSafeInteger(value.sizeBytes) || value.sizeBytes < 1 || value.sizeBytes > POLICY.maxUploadBytes ||
        !Number.isSafeInteger(value.width) || !Number.isSafeInteger(value.height) ||
        value.width < POLICY.minimumImageDimension || value.height < POLICY.minimumImageDimension ||
        value.width > POLICY.maxImageDimension || value.height > POLICY.maxImageDimension ||
        value.width * value.height > POLICY.maxDecodedPixels) {
      return fail("INTERNAL_ERROR", "Private photo metadata is malformed.");
    }
    const decision = data.identityPhotoReviewDecision;
    if (decision != null) {
      if (
        !["verified", "unverified"].includes(decision) ||
        data.identityPhotoVerified !== (decision === "verified") ||
        Date.parse(iso(data.identityPhotoReviewedAt)) < Date.parse(capturedAt) ||
        Date.parse(iso(data.identityPhotoReviewedAt)) > this.now().toMillis()
      ) {
        return fail("INTERNAL_ERROR", "Photo review authority is malformed.");
      }
      text(data.identityPhotoReviewedBy);
    } else if (data.identityPhotoVerified === true) {
      return fail("INTERNAL_ERROR", "Photo review authority is contradictory.");
    }
    return {status: decision ?? "pending_review", photo, mediaAvailable: true};
  }

  public async updatePreferences(idToken: string, body: unknown): Promise<StudentProfilePreferencesResult> {
    // Parse synchronously into a detached value before awaiting authentication.
    const request = normalizeStudentProfilePreferencesRequest(body);
    return this.withScope(idToken, async (transaction, scope, student) => {
      const commandScope = [SOURCE, COMMAND, scope.instituteId, scope.studentId, scope.token.uid];
      const keyHash = hash([...commandScope, request.idempotencyKey]);
      const auditId = `student_preferences_${keyHash.slice(0, 40)}`;
      const fingerprint = hash([
        ...commandScope,
        request.expectedVersion,
        request.preferences.sidebarCollapsed,
      ]);
      const auditRef = this.firestore
        .collection("institutes")
        .doc(scope.instituteId)
        .collection("auditLogs")
        .doc(auditId);
      const audit = await transaction.get(auditRef);
      if (audit.exists) {
        const metadata = audit.get("metadata");
        if (
          !record(metadata) ||
          metadata.source !== SOURCE ||
          metadata.command !== COMMAND ||
          metadata.idempotencyKeyHash !== keyHash ||
          audit.get("actorId") !== scope.studentId ||
          audit.get("targetId") !== scope.studentId ||
          audit.get("instituteId") !== scope.instituteId ||
          audit.get("actionType") !== "UPDATE_STUDENT_PREFERENCES"
        ) {
          return fail("INTERNAL_ERROR", "Preference receipt authority is malformed.");
        }
        if (
          typeof metadata.requestFingerprint !== "string" ||
          !/^[a-f0-9]{64}$/u.test(metadata.requestFingerprint)
        ) {
          return fail("INTERNAL_ERROR", "Preference fingerprint authority is malformed.");
        }
        if (metadata.requestFingerprint !== fingerprint) {
          return fail("CONFLICT", "Command key has different intent.");
        }
        const result = metadata.result;
        exactKeys(result, ["auditId", "version", "updatedAt", "preferences"], "INTERNAL_ERROR");
        exactKeys(result.preferences, ["sidebarCollapsed"], "INTERNAL_ERROR");
        if (
          result.auditId !== auditId ||
          result.version !== request.expectedVersion + 1 ||
          result.updatedAt !== iso(audit.get("timestamp")) ||
          typeof result.updatedAt !== "string" ||
          preferences(result.preferences).sidebarCollapsed !== request.preferences.sidebarCollapsed
        ) {
          return fail("INTERNAL_ERROR", "Preference receipt result is malformed.");
        }
        return {
          auditId,
          disposition: "replayed",
          version: Number(result.version),
          updatedAt: result.updatedAt,
          preferences: preferences(result.preferences),
        };
      }
      const data = student.data() ?? fail("INTERNAL_ERROR", "Student authority is missing.");
      const previous = preferences(data.profilePreferences);
      const currentVersion = readStudentProfileVersion(data.version);
      if (currentVersion >= Number.MAX_SAFE_INTEGER - 1) return fail("CONFLICT", "Student version is exhausted.");
      if (request.expectedVersion !== currentVersion) return fail("CONFLICT", "Student version has changed.");
      const timestamp = this.now();
      const result = {
        auditId,
        version: currentVersion + 1,
        updatedAt: timestamp.toDate().toISOString(),
        preferences: {...request.preferences},
      };
      transaction.update(student.ref, {
        profilePreferences: result.preferences,
        version: result.version,
        updatedAt: timestamp,
        updatedBy: scope.studentId,
      });
      transaction.create(auditRef, {
        actionType: "UPDATE_STUDENT_PREFERENCES",
        actorId: scope.studentId,
        actorRole: "student",
        actorUid: scope.studentId,
        auditId,
        instituteId: scope.instituteId,
        tenantId: scope.instituteId,
        entityId: scope.studentId,
        entityType: "student",
        targetCollection: "students",
        targetId: scope.studentId,
        layer: "L0",
        timestamp,
        before: {version: currentVersion, preferences: previous},
        after: result,
        metadata: {
          source: SOURCE,
          command: COMMAND,
          idempotencyKeyHash: keyHash,
          requestFingerprint: fingerprint,
          result,
        },
      });
      return {...result, disposition: "applied"};
    });
  }
}
