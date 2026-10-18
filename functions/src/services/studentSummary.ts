/* eslint-disable require-jsdoc */
import {getFirestore} from "../utils/firebaseAdmin";
import {FieldPath, Timestamp} from "firebase-admin/firestore";
import type {StudentDashboardResultV2, StudentPerformanceResultV2, StudentInsightsResultV2,
  StudentTestsResultV2, StudentCurrentRead, StudentCurrentTestRecord, StudentHistoryRecord} from
  "../../../shared/contracts/studentEntitlements";
import {StudentSummaryValidationError} from "../types/studentSummary";
import {StudentSummaryAuthorityService, StudentSummaryReadScope} from "./studentSummaryAuthority";
import {studentSolutionsService, StudentSolutionsService} from "./studentSolutions";
import {solutionHash, solutionIdentifier} from "./studentSolutionSnapshot";
import {conflict, record, records, required, iso, number, percent, mode, status,
  historyRow, currentRow, performancePoint, dashboardProjection, performanceProjection, insightProjection} from
  "./studentSummaryProjection";

type Resource = "dashboard" | "tests" | "performance" | "insights";
type Current = Extract<StudentSummaryReadScope, {kind: "current"}>;
interface Selection {scope: "current" | "history"; status: string; pageSize: number; limit: number;
  yearId?: string; cursor?: string}
interface Position {id: string; s: number; n: number}
interface Cursor {v: 1; binding: string; yearId: string; position: Position}
function invalid(): never {
  throw new StudentSummaryValidationError("VALIDATION_ERROR", "Student summary selection is invalid.");
}
function scalarInteger(v: unknown, fallback: number, maximum: number): number {
  if (v === undefined) return fallback;
  const parsed = typeof v === "string" && /^[1-9][0-9]*$/u.test(v) ? Number(v) : v;
  if (!Number.isInteger(parsed) || number(parsed) < 1 || number(parsed) > maximum) return invalid();
  return Number(parsed);
}
export function normalizeStudentSummaryQuery(resource: Resource, value: unknown): Selection {
  if (!record(value)) return invalid();
  const keys = resource === "tests" ? ["scope", "status", "yearId", "pageSize", "cursor"] :
    resource === "dashboard" ? [] : [resource === "performance" ? "lastN" : "limit"];
  if (Object.keys(value).some((key) => !keys.includes(key))) return invalid();
  const scope = value.scope ?? "current";
  if (scope !== "current" && scope !== "history") return invalid();
  if (scope === "history" && (resource !== "tests" || value.status !== undefined) ||
      scope === "current" && value.yearId !== undefined) return invalid();
  const state = value.status ?? "all";
  if (!["all", "scheduled", "active", "completed", "archived"].includes(String(state)) ||
      typeof state !== "string") return invalid();
  let yearId: string | undefined;
  if (value.yearId !== undefined) {
    try {
      yearId = solutionIdentifier(value.yearId);
    } catch {
      return invalid();
    }
  }
  if (value.cursor !== undefined && (typeof value.cursor !== "string" || !value.cursor ||
      Buffer.byteLength(value.cursor) > 4096)) return invalid();
  return {scope, status: state, pageSize: scalarInteger(value.pageSize, 10, 50),
    limit: scalarInteger(value.lastN ?? value.limit, 10, 20),
    ...(yearId === undefined ? {} : {yearId}),
    ...(value.cursor === undefined ? {} : {cursor: value.cursor as string})};
}
function position(document: FirebaseFirestore.DocumentSnapshot, field: string): Position {
  const t = document.get(field);
  if (!(t instanceof Timestamp)) return conflict();
  return {id: solutionIdentifier(document.id), s: t.seconds, n: t.nanoseconds};
}
function decode(value: string | undefined, binding: string, yearIds: string[]): Cursor | null {
  if (!value) return null;
  try {
    if (Buffer.from(value, "base64url").toString("base64url") !== value) return invalid();
    const c = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Cursor;
    if (!record(c) || Object.keys(c).sort().join(",") !== "binding,position,v,yearId" ||
        c.v !== 1 || c.binding !== binding || !yearIds.includes(c.yearId) || !record(c.position) ||
        Object.keys(c.position).sort().join(",") !== "id,n,s" ||
        !Number.isSafeInteger(c.position.s) || c.position.s < -62135596800 || c.position.s > 253402300799 ||
        !Number.isInteger(c.position.n) || c.position.n < 0 || c.position.n > 999999999) return invalid();
    solutionIdentifier(c.position.id);
    return c;
  } catch {
    return invalid();
  }
}
function queryAfter(query: FirebaseFirestore.Query, p?: Position): FirebaseFirestore.Query {
  return p ? query.startAfter(new Timestamp(p.s, p.n), p.id) : query;
}
function page<T>(items: T[], hasMore: boolean, binding: string, yearId: string, p?: Position) {
  return {items, hasMore, nextCursor: hasMore && p ?
    Buffer.from(JSON.stringify({v: 1, binding, yearId, position: p})).toString("base64url") : null};
}
function current(scope: StudentSummaryReadScope): Current {
  return scope.kind === "current" ? scope : conflict();
}
function header(scope: Current): StudentCurrentRead {
  return {contractVersion: 2, scope: {kind: "current", yearId: scope.yearId, tier: "HOT_WARM"}, access: scope.access};
}
function owned(data: Record<string, unknown>, scope: StudentSummaryReadScope, yearId: string, runId?: string): void {
  if (["studentId", "studentUid", "uid"].some((key) => data[key] !== undefined && data[key] !== scope.studentId) ||
      data.instituteId !== undefined && data.instituteId !== scope.instituteId ||
      ["yearId", "academicYear"].some((key) => data[key] !== undefined && data[key] !== yearId) ||
      runId !== undefined && data.runId !== undefined && data.runId !== runId) return conflict();
}
function runOwned(data: Record<string, unknown>, scope: Current, runId: string): boolean {
  if (data.runId !== runId || data.instituteId !== undefined && data.instituteId !== scope.instituteId ||
      ["yearId", "academicYear"].some((key) => data[key] !== undefined && data[key] !== scope.yearId) ||
      !Array.isArray(data.recipientStudentIds)) return conflict();
  return data.recipientStudentIds.includes(scope.studentId);
}
interface Dependencies {
  authority?: Pick<StudentSummaryAuthorityService, "withRead" | "assertRunAllowed">;
  solutions?: Pick<StudentSolutionsService, "readAvailability">;
  now?: () => Date;
}
export class StudentSummaryService {
  private readonly authority: Pick<StudentSummaryAuthorityService, "withRead" | "assertRunAllowed">;
  private readonly solutions: Pick<StudentSolutionsService, "readAvailability">;
  private readonly now: () => Date;
  constructor(dependencies: Dependencies = {}) {
    this.authority = dependencies.authority ?? new StudentSummaryAuthorityService();
    this.solutions = dependencies.solutions ?? studentSolutionsService;
    this.now = dependencies.now ?? (() => new Date());
  }
  private binding(scope: StudentSummaryReadScope, selection: Selection): string {
    return solutionHash({uid: scope.uid, studentId: scope.studentId, instituteId: scope.instituteId,
      authorizationVersion: scope.authority.authorizationVersion, licenseVersion: scope.authority.licenseVersion,
      expiry: scope.authority.expiryDate, grace: scope.authority.gracePeriodEndsAt,
      access: scope.access, flags: scope.authority.featureFlags,
      years: scope.kind === "current" ? [scope.yearId] : scope.yearIds,
      scope: selection.scope, yearId: selection.yearId ?? null, status: selection.status,
      pageSize: selection.pageSize});
  }
  private allowed(scope: Current, data: Record<string, unknown>): boolean {
    try {
      this.authority.assertRunAllowed(scope, data.mode, data.adaptivePhase);
      return true;
    } catch (error) {
      if (error instanceof StudentSummaryValidationError &&
          ["FORBIDDEN", "LICENSE_RESTRICTED"].includes(error.code)) return false;
      throw error;
    }
  }
  private async metrics(tx: FirebaseFirestore.Transaction, scope: Current) {
    const doc = await tx.get(scope.yearReference.collection("studentYearMetrics").doc(scope.studentId));
    const data = doc.data() ?? {};
    owned(data, scope, scope.yearId);
    return data;
  }
  private results(scope: Current) {
    return scope.yearReference.collection("studentYearMetrics").doc(scope.studentId).collection("results");
  }
  private async retained(tx: FirebaseFirestore.Transaction, scope: Current,
    data: Record<string, unknown>, runId: string): Promise<boolean> {
    solutionIdentifier(runId);
    owned(data, scope, scope.yearId, runId);
    const run = await tx.get(scope.yearReference.collection("runs").doc(runId));
    if (!run.exists) return true;
    if (!runOwned(run.data() ?? {}, scope, run.id)) return false;
    if (data.testId !== undefined && run.get("testId") !== data.testId) return conflict();
    return true;
  }
  public async getDashboard(idToken: string, query: unknown = {}): Promise<StudentDashboardResultV2> {
    normalizeStudentSummaryQuery("dashboard", query);
    return this.authority.withRead(idToken, {resource: "dashboard"}, async (tx, value) => {
      const scope = current(value);
      const metrics = await this.metrics(tx, scope);
      const upcoming = await tx.get(scope.yearReference.collection("runs")
        .where("recipientStudentIds", "array-contains", scope.studentId).where("status", "==", "scheduled")
        .where("startWindow", ">", Timestamp.fromDate(this.now())).orderBy("startWindow", "asc")
        .orderBy(FieldPath.documentId(), "asc").limit(49));
      const upcomingTests = upcoming.docs.filter((d) => runOwned(d.data(), scope, d.id) &&
        this.allowed(scope, d.data())).slice(0, 4).map((d) => ({runId: d.id, testId: required(d.get("testId")),
        testName: required(d.get("testName") ?? d.get("runName")), mode: mode(d.get("mode")),
        startAt: iso(d.get("startWindow")), endAt: iso(d.get("endWindow")),
        durationMinutes: Math.max(0, Math.round((Date.parse(iso(d.get("endWindow"))) -
          Date.parse(iso(d.get("startWindow")))) / 60000))}));
      const summaries = await tx.get(this.results(scope).orderBy("submittedAt", "desc").limit(5));
      const source: Record<string, unknown>[] = summaries.empty ? records(metrics.recentResults).slice(0, 5) :
        summaries.docs.map((d) => {
          owned(d.data(), scope, scope.yearId, d.id);
          return {...d.data(), runId: d.id};
        });
      const recentResults = [];
      for (const data of source) {
        const runId = required(data.runId);
        if (await this.retained(tx, scope, data, runId)) {
          recentResults.push({runId,
            testName: required(data.testName ?? data.runName), completedAt: iso(data.completedAt ?? data.submittedAt),
            accuracyPercent: percent(data.accuracyPercent), rawScorePercent: percent(data.rawScorePercent)});
        }
      }
      return {...header(scope), ...dashboardProjection(metrics, scope.access), upcomingTests, recentResults};
    });
  }
  public async getPerformance(idToken: string, query: unknown = {}): Promise<StudentPerformanceResultV2> {
    const selection = normalizeStudentSummaryQuery("performance", query);
    return this.authority.withRead(idToken, {resource: "performance"}, async (tx, value) => {
      const scope = current(value);
      const metrics = await this.metrics(tx, scope);
      const docs = await tx.get(this.results(scope).orderBy("submittedAt", "desc")
        .orderBy(FieldPath.documentId(), "desc").limit(selection.limit));
      const source: Record<string,
        unknown>[] = docs.empty ? records(metrics.performanceTimeline ?? metrics.testHistory ?? metrics.recentResults)
          .slice(-selection.limit) : docs.docs.map((d) => {
          owned(d.data(), scope, scope.yearId, d.id);
          return {...d.data(), runId: d.id};
        });
      const timeline = [];
      for (const data of source) {
        const runId = required(data.runId);
        if (await this.retained(tx, scope, data, runId)) {
          timeline.push(performancePoint(data, scope.access,
            timeline.length));
        }
      }
      timeline.sort((a, b) => a.completedAt.localeCompare(b.completedAt) || a.runId.localeCompare(b.runId));
      return {...header(scope), ...performanceProjection(metrics, scope.access, timeline)};
    });
  }
  public async getInsights(idToken: string, query: unknown = {}): Promise<StudentInsightsResultV2> {
    const selection = normalizeStudentSummaryQuery("insights", query);
    return this.authority.withRead(idToken, {resource: "insights"}, async (tx, value) => {
      const scope = current(value);
      const metrics = await this.metrics(tx, scope);
      const snapshots = await tx.get(scope.yearReference.collection("insightSnapshots")
        .where("snapshotType", "==", "student").where("studentId", "==", scope.studentId)
        .orderBy("sourceSubmittedAt", "desc").orderBy(FieldPath.documentId(), "desc").limit(selection.limit));
      for (const d of snapshots.docs) owned(d.data(), scope, scope.yearId);
      return {...header(scope), ...insightProjection(metrics, scope.access, snapshots.docs)};
    });
  }
  public async listTests(idToken: string, query: unknown = {}): Promise<StudentTestsResultV2> {
    const selection = normalizeStudentSummaryQuery("tests", query);
    return this.authority.withRead(idToken, {resource: "tests", scope: selection.scope,
      ...(selection.yearId === undefined ? {} : {yearId: selection.yearId})}, async (tx, scope) => {
      const binding = this.binding(scope, selection);
      const yearIds = scope.kind === "current" ? [scope.yearId] : scope.yearIds;
      const cursor = decode(selection.cursor, binding, yearIds);
      if (scope.kind === "history") {
        const items: StudentHistoryRecord[] = [];
        let last: Position | undefined;
        let lastYear = cursor?.yearId ?? yearIds[0] ?? "";
        for (let i = cursor ? yearIds.indexOf(cursor.yearId) : 0; i < yearIds.length; i++) {
          const yearId = yearIds[i];
          let q: FirebaseFirestore.Query = this.resultsInYear(scope, yearId)
            .orderBy("submittedAt", "desc").orderBy(FieldPath.documentId(), "desc");
          if (cursor?.yearId === yearId) q = queryAfter(q, cursor.position);
          const snapshot = await tx.get(q.limit(selection.pageSize - items.length + 1));
          // A missing indexed timestamp must not turn a wholly malformed retained year into empty success.
          if (snapshot.empty && cursor?.yearId !== yearId) {
            const probe = await tx.get(this.resultsInYear(scope, yearId).limit(1));
            if (!probe.empty) return conflict();
          }
          for (const d of snapshot.docs) {
            if (items.length === selection.pageSize) {
              return {contractVersion: 2,
                scope: {kind: "history", yearId: selection.yearId ?? null, tier: "COLD_SUMMARY"}, access: scope.access,
                page: page(items, true, binding, lastYear, last)};
            }
            const data = d.data();
            owned(data, scope, yearId, d.id);
            items.push(historyRow(data, d.id, yearId));
            last = position(d, "submittedAt");
            lastYear = yearId;
          }
        }
        return {contractVersion: 2, scope: {kind: "history", yearId: selection.yearId ?? null, tier: "COLD_SUMMARY"},
          access: scope.access, page: page(items, false, binding, lastYear, last)};
      }
      const completed = selection.status === "completed";
      const field = completed ? "submittedAt" : "startWindow";
      let q: FirebaseFirestore.Query = completed ? this.results(scope) :
        scope.yearReference.collection("runs").where("recipientStudentIds", "array-contains", scope.studentId);
      q = queryAfter(q.orderBy(field, "desc").orderBy(FieldPath.documentId(), "desc"), cursor?.position);
      // 49 source + 49 matching joins + at most 98 submitted attempts + one peek + 3 authority docs <= 200.
      const candidates = await tx.get(q.limit(50));
      const items: StudentCurrentTestRecord[] = [];
      let last: Position | undefined;
      let examined = 0;
      for (const d of candidates.docs.slice(0, 49)) {
        if (items.length === selection.pageSize) break;
        examined++;
        last = position(d, field);
        const resultDoc = completed ? d : await tx.get(this.results(scope).doc(d.id));
        const result = resultDoc.exists ? resultDoc.data() : undefined;
        if (result) owned(result, scope, scope.yearId, d.id);
        const run = completed ? await tx.get(scope.yearReference.collection("runs").doc(d.id)) : d;
        const data = run.data();
        if (data && !runOwned(data, scope, run.id)) continue;
        if (data && result?.testId !== undefined && result.testId !== data.testId) return conflict();
        if (!data && !result) continue;
        const state = result ? "completed" : status(data?.status);
        if (selection.status !== "all" && selection.status !== state) continue;
        if (!result && data && !this.allowed(scope, data)) continue;
        const availability = data ? await this.solutions.readAvailability(tx, scope, run) :
          {state: "locked" as const, reason: "unavailable" as const};
        items.push(currentRow(run.id, scope.yearId, data, result, availability));
      }
      return {...header(scope), page: page(items, candidates.size > examined, binding, scope.yearId, last)};
    });
  }
  private resultsInYear(scope: StudentSummaryReadScope, yearId: string) {
    // Every selector is rebuilt beneath the verified tenant/Student, never a cursor path.
    return this.resultsReference(scope, yearId).collection("results");
  }
  private resultsReference(scope: StudentSummaryReadScope, yearId: string) {
    // Obtain a reference from a scoped SDK collection, without another network read.
    return this.firestoreInstitute(scope).collection("academicYears").doc(yearId)
      .collection("studentYearMetrics").doc(scope.studentId);
  }
  private firestoreInstitute(scope: StudentSummaryReadScope) {
    return getFirestore().collection("institutes").doc(scope.instituteId);
  }
  public async getSolutions(_legacy: unknown): Promise<never> {
    void _legacy;
    throw new StudentSummaryValidationError("VALIDATION_ERROR", "Legacy solution contract is unavailable.");
  }
}
export const studentSummaryService = new StudentSummaryService();
