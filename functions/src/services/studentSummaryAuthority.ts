/* eslint-disable require-jsdoc */
import type {Auth, DecodedIdToken} from "firebase-admin/auth";
import {FieldPath} from "firebase-admin/firestore";
import type {AdminRunMode} from "../../../shared/contracts/apiDtos";
import type {StudentReadAccess, StudentHistoryReadAccess} from "../../../shared/contracts/studentEntitlements";
import {hasConsistentOwnStudentClaims} from "../policy/studentRolePolicy";
import {StudentSummaryValidationError} from "../types/studentSummary";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {
  CurrentInstituteAuthority, InstituteAuthorityEnforcementError, InstituteAuthorityEnforcementService,
} from "./instituteAuthorityEnforcement";

type Resource = "dashboard" | "tests" | "performance" | "insights" | "solutions";
interface Intent {resource: Resource; scope: "current" | "history"; yearId?: string}
interface Owner {
  uid: string;
  instituteId: string;
  studentId: string;
  authority: CurrentInstituteAuthority;
}
export type StudentSummaryReadScope = Owner & (
  | {kind: "current"; yearId: string; yearReference: FirebaseFirestore.DocumentReference; access: StudentReadAccess}
  | {kind: "history"; yearIds: string[]; access: StudentHistoryReadAccess}
);
interface Dependencies {
  auth?: Pick<Auth, "verifyIdToken" | "getUser">;
  firestore?: FirebaseFirestore.Firestore;
  now?: () => Date;
}
const FLAGS = ["adaptivePhase", "controlledMode", "governanceAccess", "hardMode", "riskOverview"];
const PRIORITY = ["active", "started", "scheduled"];
const STATUSES = new Set([...PRIORITY, "locked", "archived", "draft"]);
const MODES: AdminRunMode[] = ["Operational", "Diagnostic", "Controlled", "Hard"];
function fail(code: StudentSummaryValidationError["code"], message: string): never {
  throw new StudentSummaryValidationError(code, message);
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function identifier(value: unknown): string {
  if (typeof value !== "string" || !value || value !== value.trim() || value.length > 128 ||
      value.includes("/") || value === "." || value === "..") {
    return fail("VALIDATION_ERROR", "Read selector is invalid.");
  }
  return value;
}
function intent(value: unknown): Intent {
  if (!record(value) || Object.keys(value).some((key) => !["resource", "scope", "yearId"].includes(key)) ||
      typeof value.resource !== "string" ||
      !["dashboard", "tests", "performance", "insights", "solutions"].includes(value.resource)) {
    return fail("VALIDATION_ERROR", "Read scope contains unsupported fields.");
  }
  const scope = value.scope === undefined ? "current" : value.scope;
  if ((scope !== "current" && scope !== "history") ||
      (scope === "history" && value.resource !== "tests") ||
      (scope === "current" && value.yearId !== undefined)) {
    return fail("VALIDATION_ERROR", "Read scope is unsupported for this resource.");
  }
  return {resource: value.resource as Resource, scope,
    ...(value.yearId === undefined ? {} : {yearId: identifier(value.yearId)})};
}
function deadline(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !value.trim() || Number.isNaN(Date.parse(value))) {
    return fail("FORBIDDEN", "Current entitlement claims are incomplete.");
  }
  return new Date(value).toISOString();
}
function assertCompleteClaims(claims: Record<string, unknown>, authority: CurrentInstituteAuthority): void {
  const flags = claims.featureFlags;
  if (!record(flags) || FLAGS.some((key) => typeof flags[key] !== "boolean") ||
      claims.licenseLayer !== authority.licenseLayer || claims.licenseVersion !== authority.licenseVersion ||
      claims.licenseState !== authority.licenseState ||
      deadline(claims.expiryDate) !== authority.expiryDate ||
      deadline(claims.gracePeriodEndsAt) !== authority.gracePeriodEndsAt) {
    fail("FORBIDDEN", "Current entitlement claims are inconsistent.");
  }
}
function access(authority: CurrentInstituteAuthority): StudentReadAccess {
  const execution = authority.licenseLayer !== "L0";
  const advanced = authority.licenseLayer === "L2" || authority.licenseLayer === "L3";
  return {policyVersion: "student-entitlements-v1", licenseLayer: authority.licenseLayer,
    metrics: {basic: true, execution, insights: execution && authority.featureFlags.riskOverview,
      advanced, controlledComparison: advanced && authority.featureFlags.controlledMode,
      hardTiming: advanced && authority.featureFlags.hardMode}};
}

/** Internal transaction boundary for STU-01..05; transport adoption is ordered separately. */
export class StudentSummaryAuthorityService {
  private readonly firestore: FirebaseFirestore.Firestore;
  private readonly auth: Pick<Auth, "verifyIdToken" | "getUser">;
  private readonly authority: InstituteAuthorityEnforcementService;

  constructor(dependencies: Dependencies = {}) {
    this.firestore = dependencies.firestore ?? getFirestore();
    this.auth = dependencies.auth ?? getFirebaseAdminApp().auth();
    this.authority = new InstituteAuthorityEnforcementService({
      firestore: this.firestore, now: dependencies.now ?? (() => new Date()),
    });
  }

  public assertRunAllowed(scope: StudentSummaryReadScope, mode: unknown, adaptive?: unknown): void {
    if (scope.kind !== "current") fail("FORBIDDEN", "History does not grant run or solution access.");
    if (!MODES.includes(mode as AdminRunMode) || (adaptive !== undefined && typeof adaptive !== "boolean")) {
      fail("CONFLICT", "Persisted run eligibility is malformed.");
    }
    try {
      this.authority.assertModeAllowed(scope.authority, mode);
    } catch (error) {
      this.rethrow(error);
    }
    if (adaptive === true && (!scope.access.metrics.advanced || !scope.authority.featureFlags.adaptivePhase)) {
      fail("LICENSE_RESTRICTED", "Adaptive runs are unavailable under current entitlement.");
    }
  }

  public async withRead<T>(idToken: string, input: unknown, work: (
    transaction: FirebaseFirestore.Transaction, scope: StudentSummaryReadScope,
  ) => Promise<T>): Promise<T> {
    const selection = intent(input); // Detached before the first await; no caller scope mutation.
    if (typeof idToken !== "string" || !idToken) fail("UNAUTHORIZED", "Authentication is required.");
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
    if (!hasConsistentOwnStudentClaims(token, uid, instituteId)) {
      fail("FORBIDDEN", "Current own Student identity is required.");
    }
    try {
      return await this.firestore.runTransaction(async (transaction) => {
        // Auth is deliberately refreshed on every transaction attempt.
        let current;
        try {
          current = await this.auth.getUser(uid);
        } catch (error) {
          return fail(record(error) && error.code === "auth/user-not-found" ? "UNAUTHORIZED" : "INTERNAL_ERROR",
            "Current authentication authority is unavailable.");
        }
        if (current.disabled || current.uid !== uid) fail("UNAUTHORIZED", "Authentication is disabled.");
        const claims = current.customClaims ?? {};
        if (!hasConsistentOwnStudentClaims(claims, uid, instituteId)) {
          fail("FORBIDDEN", "Current own Student identity is required.");
        }
        const authority = await this.authority.readCurrentAuthority(transaction, instituteId,
          {requireCompleteEntitlement: true});
        this.authority.assertTokenAuthority(authority, token);
        this.authority.assertTokenAuthority(authority, claims);
        assertCompleteClaims(token, authority);
        assertCompleteClaims(claims, authority);
        const institute = this.firestore.collection("institutes").doc(instituteId);
        const student = await transaction.get(institute.collection("students").doc(uid));
        const data = student.data();
        if (!data || data.deleted === true || data.status !== "active") {
          fail("NOT_FOUND", "Active own Student authority was not found.");
        }
        if ((data.deleted !== undefined && typeof data.deleted !== "boolean") ||
            ["studentId", "studentUid", "uid"].some((key) => data[key] !== undefined && data[key] !== uid) ||
            (data.instituteId !== undefined && data.instituteId !== instituteId)) {
          fail("CONFLICT", "Persisted Student ownership is inconsistent.");
        }
        const years = await transaction.get(institute.collection("academicYears")
          .orderBy(FieldPath.documentId()).limit(26));
        if (years.size > 25) fail("CONFLICT", "Academic year authority exceeds the supported bound.");
        const normalized = years.docs.map((year) => {
          const value = year.get("status");
          const status = typeof value === "string" ? value.trim().toLowerCase() : "";
          if (!STATUSES.has(status)) fail("CONFLICT", "Academic year authority is malformed.");
          return {year, status};
        });
        const owner: Owner = {uid, instituteId, studentId: uid, authority};
        const readAccess = access(authority);
        if (selection.scope === "history") {
          const yearIds = normalized.filter(({year, status}) => status === "archived" &&
            (selection.yearId === undefined || year.id === selection.yearId)).map(({year}) => year.id).reverse();
          if (selection.yearId !== undefined && yearIds.length !== 1) {
            fail("NOT_FOUND", "Archived summary year was not found.");
          }
          return work(transaction, {...owner, kind: "history", yearIds,
            access: {...readAccess, metrics: {basic: true, execution: false, insights: false,
              advanced: false, controlledComparison: false, hardTiming: false}}});
        }
        const candidates = normalized.filter(({status}) => PRIORITY.includes(status))
          .sort((a, b) => PRIORITY.indexOf(a.status) - PRIORITY.indexOf(b.status));
        const chosen = candidates[0];
        if (!chosen || (candidates[1] && chosen.status === candidates[1].status)) {
          fail("CONFLICT", "Current academic year authority is absent or ambiguous.");
        }
        if (selection.resource === "insights" && !readAccess.metrics.insights) {
          fail("LICENSE_RESTRICTED", "Current license does not permit Student insights.");
        }
        return work(transaction, {...owner, kind: "current", yearId: chosen.year.id,
          yearReference: chosen.year.ref, access: readAccess});
      });
    } catch (error) {
      return this.rethrow(error);
    }
  }

  private rethrow(error: unknown): never {
    if (error instanceof StudentSummaryValidationError) throw error;
    if (error instanceof InstituteAuthorityEnforcementError) {
      return fail(error.reason === "license_expired" || error.reason === "license_downgrade" ?
        "LICENSE_RESTRICTED" : error.reason === "malformed_authority" ? "CONFLICT" : "FORBIDDEN",
      "Current institute authority denied this read.");
    }
    return fail("INTERNAL_ERROR", "Student read authority is unavailable.");
  }
}
