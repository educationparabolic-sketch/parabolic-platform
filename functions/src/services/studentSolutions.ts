/* eslint-disable require-jsdoc */
import {Timestamp} from "firebase-admin/firestore";
import type {StudentSolutionsResultV2,
  StudentSolutionAvailability} from "../../../shared/contracts/studentEntitlements";
import {StudentSummaryValidationError} from "../types/studentSummary";
import {StudentSummaryAuthorityService, StudentSummaryReadScope} from "./studentSummaryAuthority";
import {signedUrlService} from "./signedUrl";
import {cdnArchitectureService} from "./cdnArchitecture";
import {canonicalSolutionJson, solutionConflict, solutionHash, solutionIdentifier,
  validateStudentSolutionSnapshot, SolutionAsset} from "./studentSolutionSnapshot";

interface Selection {testId: string; runId: string; pageSize: number; cursor?: string}
function fail(code: StudentSummaryValidationError["code"], message: string): never {
  throw new StudentSummaryValidationError(code, message);
}
export function normalizeStudentSolutionSelection(testId: unknown, query: unknown): Selection {
  if (!query || typeof query !== "object" || Array.isArray(query) ||
      Object.keys(query).some((key) => !["runId", "pageSize", "cursor"].includes(key))) {
    return fail("VALIDATION_ERROR", "Solution query contains unsupported fields.");
  }
  const input = query as Record<string, unknown>;
  let runId: string;
  let id: string;
  try {
    runId = solutionIdentifier(input.runId);
    id = solutionIdentifier(testId);
  } catch {
    return fail("VALIDATION_ERROR", "Exact test and run selectors are required.");
  }
  const size = input.pageSize === undefined ? 10 :
    typeof input.pageSize === "string" && /^[1-9][0-9]*$/u.test(input.pageSize) ?
      Number(input.pageSize) : input.pageSize;
  if (!Number.isInteger(size) || Number(size) < 1 || Number(size) > 20 ||
      (input.cursor !== undefined && (typeof input.cursor !== "string" || !input.cursor ||
        Buffer.byteLength(input.cursor, "utf8") > 4096))) {
    return fail("VALIDATION_ERROR", "Solution page selection is invalid.");
  }
  return {testId: id, runId, pageSize: Number(size),
    ...(input.cursor === undefined ? {} : {cursor: input.cursor as string})};
}
function timestamp(value: unknown): number {
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === "string" && /^\d{4}-\d\d-\d\dT/u.test(value) && Number.isFinite(Date.parse(value))) {
    return Date.parse(value);
  }
  return solutionConflict();
}
function release(data: FirebaseFirestore.DocumentData, now: number): string {
  const end = timestamp(data.endWindow);
  const aliases = [data.solutionReleaseAt, data.solutionsReleaseAt, data.resultReleaseAt]
    .filter((value) => value !== undefined).map(timestamp);
  const at = aliases[0] ?? end;
  if (aliases.some((value) => value !== at) || at < end ||
      (data.solutionsReleased !== undefined && typeof data.solutionsReleased !== "boolean")) return solutionConflict();
  if (data.solutionsReleased === false || now < at) return fail("FORBIDDEN", "Solutions are not released.");
  return new Date(at).toISOString();
}
interface Dependencies {
  authority?: Pick<StudentSummaryAuthorityService, "withRead" | "assertRunAllowed">;
  now?: () => Date;
  sign?: typeof signedUrlService.generateQuestionAssetSignedUrl;
}

export class StudentSolutionsService {
  private readonly authority: Pick<StudentSummaryAuthorityService, "withRead" | "assertRunAllowed">;
  private readonly now: () => Date;
  private readonly sign: typeof signedUrlService.generateQuestionAssetSignedUrl;

  constructor(dependencies: Dependencies = {}) {
    this.authority = dependencies.authority ?? new StudentSummaryAuthorityService();
    this.now = dependencies.now ?? (() => new Date());
    this.sign = dependencies.sign ?? signedUrlService.generateQuestionAssetSignedUrl.bind(signedUrlService);
  }

  private async load(transaction: FirebaseFirestore.Transaction, scope: StudentSummaryReadScope, selection: Selection,
    knownRun?: FirebaseFirestore.DocumentSnapshot) {
    if (scope.kind !== "current") return fail("FORBIDDEN", "Archived solutions are unavailable.");
    const run = knownRun ?? await transaction.get(scope.yearReference.collection("runs").doc(selection.runId));
    const data = run.data();
    if (!data || data.testId !== selection.testId || !Array.isArray(data.recipientStudentIds) ||
        !data.recipientStudentIds.includes(scope.studentId)) {
      return fail("NOT_FOUND", "Completed assigned test was not found.");
    }
    if (data.runId !== run.id ||
        (data.instituteId !== undefined && data.instituteId !== scope.instituteId) ||
        (data.academicYear !== undefined && data.academicYear !== scope.yearId) ||
        (data.yearId !== undefined && data.yearId !== scope.yearId)) return solutionConflict();
    this.authority.assertRunAllowed(scope, data.mode, data.adaptivePhase);
    if (data.status !== "completed") return fail("FORBIDDEN", "Test completion is required for solutions.");
    const releasedAt = release(data, this.now().getTime());
    const attempts = await transaction.get(run.ref.collection("sessions")
      .where("studentId", "==", scope.studentId).where("status", "==", "submitted").limit(2));
    if (attempts.empty) return fail("NOT_FOUND", "Owned submitted attempt was not found.");
    if (attempts.size !== 1) return solutionConflict();
    const attempt = attempts.docs[0];
    const session = attempt.data();
    if (session.studentUid !== scope.uid || session.instituteId !== scope.instituteId ||
        session.runId !== run.id || session.yearId !== scope.yearId || session.sessionId !== attempt.id) {
      return fail("NOT_FOUND", "Owned submitted attempt was not found.");
    }
    if (timestamp(session.submittedAt) > this.now().getTime() || session.mode !== data.mode ||
        session.templateVersion !== data.templateVersion) return solutionConflict();
    const snapshot = validateStudentSolutionSnapshot(session.solutionSnapshot, session);
    if (!Array.isArray(data.questionIds) || canonicalSolutionJson([...data.questionIds].sort()) !==
        canonicalSolutionJson(snapshot.questions.map((q) => q.questionId).sort())) return solutionConflict();
    if (!session.answerMap || typeof session.answerMap !== "object" || Array.isArray(session.answerMap)) {
      return solutionConflict();
    }
    const answers = snapshot.questions.map(({questionId}) => {
      const answer = session.answerMap[questionId];
      if (answer === undefined) return null;
      if (!answer || typeof answer !== "object" || Array.isArray(answer)) return solutionConflict();
      const selected = answer.selectedOption;
      if (selected === undefined || selected === null) return null;
      if (typeof selected !== "string" || selected.length > 4096) return solutionConflict();
      return selected;
    });
    return {instituteId: scope.instituteId, uid: scope.uid, yearId: scope.yearId, runId: run.id,
      testId: selection.testId, sessionId: attempt.id, snapshot, answers, releasedAt, access: scope.access,
      entitlement: {authorizationVersion: scope.authority.authorizationVersion,
        licenseVersion: scope.authority.licenseVersion, flags: scope.authority.featureFlags,
        expiryDate: scope.authority.expiryDate, gracePeriodEndsAt: scope.authority.gracePeriodEndsAt}};
  }

  public async readAvailability(transaction: FirebaseFirestore.Transaction, scope: StudentSummaryReadScope,
    run: FirebaseFirestore.DocumentSnapshot): Promise<StudentSolutionAvailability> {
    if (run.get("status") !== "completed") return {state: "locked", reason: "not_completed"};
    try {
      const material = await this.load(transaction, scope, {
        testId: solutionIdentifier(run.get("testId")), runId: run.id, pageSize: 1,
      }, run);
      return {state: "available", releasedAt: material.releasedAt};
    } catch (error) {
      if (!(error instanceof StudentSummaryValidationError) || error.code === "INTERNAL_ERROR") throw error;
      return {state: "locked", reason: error.code === "FORBIDDEN" && error.message === "Solutions are not released." ?
        "not_released" : "unavailable"};
    }
  }

  public async getSolutions(idToken: string, testId: unknown, query: unknown): Promise<StudentSolutionsResultV2> {
    const selection = normalizeStudentSolutionSelection(testId, query);
    const load = (transaction: FirebaseFirestore.Transaction, scope: StudentSummaryReadScope) =>
      this.load(transaction, scope, selection);
    const material = await this.authority.withRead(idToken, {resource: "solutions"}, load);
    const binding = solutionHash({material, pageSize: selection.pageSize});
    let next = 0;
    if (selection.cursor) {
      try {
        const decoded = Buffer.from(selection.cursor, "base64url");
        if (decoded.toString("base64url") !== selection.cursor) throw new Error("cursor");
        const value = JSON.parse(decoded.toString("utf8"));
        if (Object.keys(value).sort().join(",") !== "binding,next,v" || value.v !== 1 ||
            value.binding !== binding || !Number.isSafeInteger(value.next) || value.next < 1 ||
            value.next >= material.snapshot.questions.length) throw new Error("cursor");
        next = value.next;
      } catch {
        return fail("VALIDATION_ERROR", "Solution cursor is invalid for current scope.");
      }
    }
    // Content assembled outside the first transaction must be reauthorized before
    // any signing. Signing is synchronous and never happens inside a retryable transaction.
    const checked = await this.authority.withRead(idToken, {resource: "solutions"}, load);
    if (solutionHash(checked) !== solutionHash(material)) return fail("CONFLICT", "Solution authority changed.");
    try {
      const selected = material.snapshot.questions.slice(next, next + selection.pageSize);
      const needsAssets = selected.some((q) => q.questionAsset || q.solutionAsset);
      if (needsAssets && (!process.env.CDN_BASE_URL || !process.env.CDN_SIGNED_URL_KEY_VALUE ||
          !process.env.CDN_SIGNED_URL_KEY_NAME?.trim())) {
        return fail("INTERNAL_ERROR", "Solution delivery is unavailable.");
      }
      if (needsAssets) {
        const base = new URL(process.env.CDN_BASE_URL as string);
        if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) {
          return fail("INTERNAL_ERROR", "Solution delivery is unavailable.");
        }
        cdnArchitectureService.assertNoDirectBucketUrlExposure(base.toString());
      }
      const signAsset = (
        questionId: string, asset: SolutionAsset | null, assetKind: "questionImage" | "solutionImage",
      ) => {
        if (!asset) return null;
        const request = {instituteId: material.instituteId, questionId, ...asset, assetKind,
          accessContext: "dashboardView" as const};
        const target = cdnArchitectureService.resolveQuestionAssetLocation(request);
        const result = this.sign(request);
        const url = new URL(result.signedUrl);
        const expected = new URL(`${target.cdnBaseUrl}/${target.cdnPath}`);
        if (url.protocol !== "https:" || url.username || url.password || url.origin !== expected.origin ||
            url.pathname !== expected.pathname || result.cdnPath !== target.cdnPath ||
            result.accessContext !== "dashboardView" || result.expiresInSeconds !== 1800 ||
            !url.searchParams.get("Signature") || !url.searchParams.get("KeyName") ||
            Number(url.searchParams.get("Expires")) * 1000 !== Date.parse(result.expiresAt) ||
            Date.parse(result.expiresAt) <= Date.now() || Date.parse(result.expiresAt) > Date.now() + 1800000) {
          throw new Error("invalid signing result");
        }
        cdnArchitectureService.assertNoDirectBucketUrlExposure(result.signedUrl);
        return result;
      };
      const items = selected.map((question, index) => {
        const image = signAsset(question.questionId, question.questionAsset, "questionImage");
        const solution = signAsset(question.questionId, question.solutionAsset, "solutionImage");
        const expiries = [image, solution].flatMap((asset) => asset ? [asset.expiresAt] : []).sort();
        return {questionId: question.questionId, questionVersion: question.version, questionRevision: question.revision,
          correctAnswer: question.correctAnswer, studentAnswer: material.answers[next + index],
          questionImageUrl: image?.signedUrl ?? null, solutionImageUrl: solution?.signedUrl ?? null,
          assetsExpireAt: expiries[0] ?? null, tutorialVideoLink: question.tutorialVideoLink,
          simulationLink: question.simulationLink};
      });
      const index = next + items.length;
      const hasMore = index < material.snapshot.questions.length;
      return {contractVersion: 2, scope: {kind: "current", yearId: material.yearId, tier: "HOT_WARM"},
        access: material.access, testId: material.testId, runId: material.runId, releasedAt: material.releasedAt,
        page: {items, hasMore, nextCursor: hasMore ?
          Buffer.from(JSON.stringify({v: 1, binding, next: index})).toString("base64url") : null}};
    } catch (error) {
      if (error instanceof StudentSummaryValidationError) throw error;
      return fail("INTERNAL_ERROR", "Solution delivery is unavailable.");
    }
  }
}
export const studentSolutionsService = new StudentSolutionsService();
