import {assertRuntimeOwner} from "./examRuntimeOwnership";
import {randomUUID} from "node:crypto";
import type {Auth, DecodedIdToken} from "firebase-admin/auth";
import {Timestamp} from "firebase-admin/firestore";
import type {ExamIdentityStatusResult, StudentIdentityPhotoMediaResult} from "../../../shared/contracts/studentProfile";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {StudentProfileValidationError} from "../types/studentProfile";
import {StudentProfileService} from "./studentProfile";
import {currentManagedPhoto, identityPhotoHash, validPhotoId} from "./studentIdentityPhotoLifecycleAuthority";
import {PrivateIdentityPhotoMediaStore, resolveIdentityPhotosBucket} from "./studentIdentityPhotoStorage";
import {InstituteAuthorityEnforcementService} from "./instituteAuthorityEnforcement";
import {hasCurrentStaffMembership} from "./currentAccountIdentity";

export function photoAccessFail(code: StudentProfileValidationError["code"], message: string): never {
  throw new StudentProfileValidationError(code, message);
}
export function photoAccessId(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 128 || value !== value.trim() ||
      (/[/%\\]/u.test(value) || [...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) ||
      value === "." || value === "..") {
    return photoAccessFail("VALIDATION_ERROR", "Resource identifier is invalid.");
  }
  return value;
}

/** Current enabled Admin + L0 institute authority, refreshed inside every transaction retry. */
export class IdentityPhotoAdminAuthority {
  private readonly authority: InstituteAuthorityEnforcementService;
  constructor(
    private readonly firestore = getFirestore(),
    private readonly auth: Pick<Auth, "verifyIdToken" | "getUser"> = getFirebaseAdminApp().auth(),
  ) {
    this.authority = new InstituteAuthorityEnforcementService({firestore, now: () => new Date()});
  }
  public async verify(rawToken: string): Promise<DecodedIdToken> {
    try {
      return await this.auth.verifyIdToken(rawToken, true);
    } catch {
      return photoAccessFail("UNAUTHORIZED", "Authentication is invalid.");
    }
  }
  public async assert(transaction: FirebaseFirestore.Transaction, token: DecodedIdToken): Promise<void> {
    if (token.uid !== token.uid.trim()) {
      return photoAccessFail("UNAUTHORIZED", "Authentication identity is malformed.");
    }
    if (token.role !== "admin") return photoAccessFail("FORBIDDEN", "Current Admin authority is required.");
    const instituteId = photoAccessId(token.instituteId);
    let user;
    try {
      user = await this.auth.getUser(token.uid);
    } catch (error) {
      const missing = typeof error === "object" && error !== null &&
        "code" in error && error.code === "auth/user-not-found";
      return photoAccessFail(missing ? "UNAUTHORIZED" : "INTERNAL_ERROR", "Current authentication is unavailable.");
    }
    if (user.disabled || user.uid !== token.uid) return photoAccessFail("UNAUTHORIZED", "Authentication is disabled.");
    const current = user.customClaims ?? {};
    for (const claims of [token, current]) {
      if (claims.role !== "admin" || (claims.userRole !== undefined && claims.userRole !== "admin") ||
          claims.instituteId !== instituteId || (claims.tenantId !== undefined && claims.tenantId !== instituteId) ||
          (claims.isVendor !== undefined && claims.isVendor !== false) ||
          (claims.isSuspended !== undefined && claims.isSuspended !== false) ||
          (claims.suspended !== undefined && claims.suspended !== false)) {
        return photoAccessFail("FORBIDDEN", "Current Admin authority is required.");
      }
    }
    const authority = await this.authority.readCurrentAuthority(transaction, instituteId);
    this.authority.assertTokenAuthority(authority, token);
    this.authority.assertTokenAuthority(authority, current);
    const institute = await transaction.get(this.firestore.doc(`institutes/${instituteId}`));
    if (!hasCurrentStaffMembership(institute.get("settingsUsers"), token.uid, "admin")) {
      return photoAccessFail("FORBIDDEN", "Current Admin membership is required.");
    }
  }
  public async withStudent<T>(rawToken: string, studentId: string, work: (
    transaction: FirebaseFirestore.Transaction, student: FirebaseFirestore.DocumentSnapshot, token: DecodedIdToken,
  ) => Promise<T>): Promise<T> {
    const token = await this.verify(rawToken);
    return this.firestore.runTransaction(async (transaction) => {
      await this.assert(transaction, token);
      const student = await transaction.get(this.firestore.doc(
        `institutes/${photoAccessId(token.instituteId)}/students/${photoAccessId(studentId)}`,
      ));
      if (!student.exists || student.get("deleted") === true || student.get("status") !== "active" ||
          (student.get("studentId") !== undefined && student.get("studentId") !== studentId)) {
        return photoAccessFail("NOT_FOUND", "Active Student was not found.");
      }
      return work(transaction, student, token);
    });
  }
}

interface Dependencies {
  firestore?: FirebaseFirestore.Firestore;
  profiles?: StudentProfileService;
  admins?: IdentityPhotoAdminAuthority;
  media?: Pick<PrivateIdentityPhotoMediaStore, "read">;
  now?: () => Timestamp;
}
export class StudentIdentityPhotoAccessService {
  private readonly firestore: FirebaseFirestore.Firestore;
  private readonly profiles: StudentProfileService;
  private readonly admins: IdentityPhotoAdminAuthority;
  private readonly media: Pick<PrivateIdentityPhotoMediaStore, "read">;
  private readonly now: () => Timestamp;
  constructor(dependencies: Dependencies = {}) {
    this.firestore = dependencies.firestore ?? getFirestore();
    this.profiles = dependencies.profiles ?? new StudentProfileService();
    this.admins = dependencies.admins ?? new IdentityPhotoAdminAuthority(this.firestore);
    this.media = dependencies.media ?? new PrivateIdentityPhotoMediaStore();
    this.now = dependencies.now ?? (() => Timestamp.now());
  }
  public async readMedia(
    rawToken: string, photoId: string, adminStudentId?: string,
  ): Promise<StudentIdentityPhotoMediaResult> {
    if (!validPhotoId(photoId)) return photoAccessFail("VALIDATION_ERROR", "Photo identifier is invalid.");
    const authorize = <T>(work: (
      transaction: FirebaseFirestore.Transaction, student: FirebaseFirestore.DocumentSnapshot, actorId: string,
    ) => Promise<T>): Promise<T> => adminStudentId === undefined ?
        this.profiles.withOwnStudent(rawToken, (transaction, owner, student) =>
          work(transaction, student, owner.studentId)) :
        this.admins.withStudent(rawToken, adminStudentId, (transaction, student, token) =>
          work(transaction, student, token.uid));
    const resolve = async (transaction: FirebaseFirestore.Transaction, student: FirebaseFirestore.DocumentSnapshot) => {
      if (student.get("identityPhotoId") !== photoId) return photoAccessFail("NOT_FOUND", "Photo is unavailable.");
      const institute = student.ref.parent.parent ?? photoAccessFail("INTERNAL_ERROR", "Photo scope is invalid.");
      const instituteId = institute.id;
      const projection = await this.profiles.projectPhoto(transaction, {
        instituteId, studentId: student.id,
      }, student.data() ?? {});
      if (!projection.mediaAvailable) return photoAccessFail("NOT_FOUND", "Photo is unavailable.");
      const managed = await currentManagedPhoto(transaction, student);
      if (!managed) return photoAccessFail("NOT_FOUND", "Photo is unavailable.");
      const value = managed.value;
      if (value.bucketName !== resolveIdentityPhotosBucket()) {
        return photoAccessFail("INTERNAL_ERROR", "Photo storage authority is inconsistent.");
      }
      return {
        bucketName: value.bucketName as string, objectPath: value.objectPath as string,
        generation: value.generation as string, sizeBytes: value.sizeBytes as number,
        metadata: {photoId, instituteId, studentId: student.id, studentUid: student.id,
          idempotencyKeyHash: value.idempotencyKeyHash as string,
          requestFingerprint: value.requestFingerprint as string, sha256: value.sha256 as string},
      };
    };
    const target = await authorize((transaction, student) => resolve(transaction, student));
    const bytes = await this.media.read(target);
    // Reauthorize after I/O. A concurrent pointer/consent/license/Auth change denies release.
    await authorize(async (transaction, student, actorId) => {
      const current = await resolve(transaction, student);
      if (identityPhotoHash(current) !== identityPhotoHash(target)) {
        return photoAccessFail("NOT_FOUND", "Photo changed during access.");
      }
      const auditId = `identity_photo_access_${randomUUID()}`;
      const institute = student.ref.parent.parent ?? photoAccessFail("INTERNAL_ERROR", "Photo scope is invalid.");
      transaction.create(institute.collection("auditLogs").doc(auditId), {
        auditId, actionType: "ACCESS_STUDENT_IDENTITY_PHOTO", actorId,
        actorRole: adminStudentId === undefined ? "student" : "admin",
        instituteId: target.metadata.instituteId, targetId: student.id, targetCollection: "students",
        timestamp: this.now(), metadata: {source: "StudentIdentityPhotoAccessService", photoId},
      });
    });
    return {photoId, mediaType: "image/jpeg", sizeBytes: bytes.length, contentBase64: bytes.toString("base64")};
  }
  public async examStatus(rawToken: string, sessionId: string, ownership?: {proof: string;
    generation: number}): Promise<ExamIdentityStatusResult> {
    photoAccessId(sessionId);
    return this.profiles.withOwnStudent(rawToken, async (transaction, owner, student) => {
      const token = owner.token;
      const yearId = photoAccessId(token.yearId);
      const runId = photoAccessId(token.runId);
      const nonce = photoAccessId(token.launchNonce);
      if (token.sessionId !== sessionId || token.studentId !== owner.studentId) {
        return photoAccessFail("FORBIDDEN", "Session identity does not match.");
      }
      const session = await transaction.get(this.firestore.doc(
        `institutes/${owner.instituteId}/academicYears/${yearId}/runs/${runId}/sessions/${sessionId}`,
      ));
      const data = session.data();
      const binding = identityPhotoHash([owner.studentId, owner.instituteId, yearId, runId, sessionId, nonce]);
      if (!data || data.instituteId !== owner.instituteId || data.studentUid !== owner.studentId ||
          data.studentId !== owner.studentId || data.sessionId !== sessionId || data.yearId !== yearId ||
          data.runId !== runId || data.launchCredentialConsumedByUid !== owner.studentId ||
          !Array.isArray(data.identityStatusEntryBindings) || !data.identityStatusEntryBindings.includes(binding)) {
        return photoAccessFail("NOT_FOUND", "Entered owning session was not found.");
      }
      assertRuntimeOwner(data, {instituteId: owner.instituteId, yearId, runId, sessionId,
        studentId: owner.studentId, runtimeOwner: ownership ? {...ownership, studentUid: owner.studentId,
          launchNonce: nonce} : undefined}, this.now().toMillis());
      const end = data.deadlineAt ?? data.runtimeSnapshot?.schedule?.sessionEndsAt;
      const endMillis = end instanceof Timestamp ? end.toMillis() : typeof end === "string" ? Date.parse(end) : NaN;
      if (!["started", "active"].includes(data.status) || !Number.isFinite(endMillis) ||
          endMillis <= this.now().toMillis()) {
        return photoAccessFail("SESSION_NOT_ACTIVE", "Session is not active.");
      }
      const authority = new InstituteAuthorityEnforcementService({
        firestore: this.firestore, now: () => this.now().toDate(),
      });
      authority.assertActiveSessionAllowed(await authority.readCurrentAuthority(transaction, owner.instituteId), data);
      const state = await this.profiles.projectPhoto(transaction, owner, student.data() ?? {});
      return {sessionId, checkedAt: this.now().toDate().toISOString(), identityStatus: state.status,
        automatedFaceMatching: "unavailable"};
    });
  }
}
