/* eslint-disable require-jsdoc */
import {Timestamp} from "firebase-admin/firestore";
import {getFirestore} from "../utils/firebaseAdmin";

const INSTITUTES_COLLECTION = "institutes";
const TESTS_COLLECTION = "tests";
const QUESTION_BANK_COLLECTION = "questionBank";
const USAGE_ITEMS_COLLECTION = "questionUsageProjectionItems";
const MAX_TEMPLATE_QUESTIONS = 100;

interface UsageState {
  activeQuestionIds: string[];
  lastUsedAcademicYear: string | null;
  lastUsedAt: Timestamp | null;
  questionIds: string[];
  runCount: number;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function integer(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 0;
}

function state(data: FirebaseFirestore.DocumentData | undefined): UsageState {
  if (!data) {
    return {
      activeQuestionIds: [], lastUsedAcademicYear: null,
      lastUsedAt: null, questionIds: [], runCount: 0,
    };
  }
  const questionIds = Array.isArray(data.questionIds) ? Array.from(new Set(
    data.questionIds.filter((value): value is string =>
      typeof value === "string" && Boolean(value.trim())).map((value) => value.trim()),
  )).sort() : [];
  if (questionIds.length > MAX_TEMPLATE_QUESTIONS) {
    throw new Error(`Template usage exceeds ${MAX_TEMPLATE_QUESTIONS} questions.`);
  }
  const totalRuns = integer(data.totalRuns) || integer(data.runCount);
  const assigned = data.status === "assigned" || totalRuns > 0;
  const storedActiveIds = Array.isArray(data.activeQuestionIds) ?
    data.activeQuestionIds.filter((value): value is string =>
      typeof value === "string" && Boolean(value.trim())).map((value) => value.trim()) : null;
  const active = data.status === "ready" || data.status === "assigned";
  return {
    activeQuestionIds: Array.from(new Set(storedActiveIds ??
      (active ? questionIds : []))).sort(),
    lastUsedAcademicYear: assigned ? text(data.lastUsedAcademicYear) : null,
    lastUsedAt: assigned && data.lastUsedAt instanceof Timestamp ? data.lastUsedAt : null,
    questionIds: assigned ? questionIds : [],
    runCount: assigned ? Math.max(totalRuns, 1) : 0,
  };
}

function sameState(left: UsageState, right: UsageState): boolean {
  return left.runCount === right.runCount &&
    left.lastUsedAcademicYear === right.lastUsedAcademicYear &&
    (left.lastUsedAt?.toMillis() ?? null) ===
      (right.lastUsedAt?.toMillis() ?? null) &&
    left.activeQuestionIds.length === right.activeQuestionIds.length &&
    left.activeQuestionIds.every((questionId, index) =>
      questionId === right.activeQuestionIds[index]) &&
    left.questionIds.length === right.questionIds.length &&
    left.questionIds.every((questionId, index) =>
      questionId === right.questionIds[index]);
}

export class QuestionUsageProjectionService {
  constructor(
    private readonly firestore: FirebaseFirestore.Firestore = getFirestore(),
    private readonly now: () => Timestamp = () => Timestamp.now(),
  ) {}

  public async reconcileTemplate(input: {
    instituteId: string;
    testId: string;
  }): Promise<"applied" | "unchanged"> {
    const instituteId = text(input.instituteId);
    const testId = text(input.testId);
    if (!instituteId || !testId) throw new Error("Usage projection identifiers are required.");
    const institute = this.firestore.collection(INSTITUTES_COLLECTION).doc(instituteId);
    const templateRef = institute.collection(TESTS_COLLECTION).doc(testId);
    const itemRef = institute.collection(USAGE_ITEMS_COLLECTION).doc(testId);
    return this.firestore.runTransaction(async (transaction) => {
      const [templateSnapshot, itemSnapshot] = await Promise.all([
        transaction.get(templateRef), transaction.get(itemRef),
      ]);
      const previous = state(itemSnapshot.exists ? itemSnapshot.data() : undefined);
      const next = templateSnapshot.exists ? state(templateSnapshot.data()) : {
        ...previous,
        activeQuestionIds: [],
      };
      if (sameState(previous, next)) return "unchanged";
      const questionIds = Array.from(new Set([
        ...previous.activeQuestionIds, ...previous.questionIds,
        ...next.activeQuestionIds, ...next.questionIds,
      ])).sort();
      const questionRefs = questionIds.map((questionId) =>
        institute.collection(QUESTION_BANK_COLLECTION).doc(questionId));
      const snapshots = await Promise.all(questionRefs.map((reference) =>
        transaction.get(reference)));
      questionIds.forEach((questionId, index) => {
        const snapshot = snapshots[index];
        if (!snapshot?.exists) {
          throw new Error(`Template "${testId}" references missing question "${questionId}".`);
        }
        const beforeRuns = previous.questionIds.includes(questionId) ? previous.runCount : 0;
        const afterRuns = next.questionIds.includes(questionId) ? next.runCount : 0;
        const current = snapshot.data() ?? {};
        const currentCount = typeof current.usedCount === "number" &&
          Number.isInteger(current.usedCount) && current.usedCount > 0 ? current.usedCount : 0;
        const nextCount = Math.max(0, currentCount + afterRuns - beforeRuns);
        const beforeActive = previous.activeQuestionIds.includes(questionId) ? 1 : 0;
        const afterActive = next.activeQuestionIds.includes(questionId) ? 1 : 0;
        const currentActiveCount = integer(current.activeTemplateCount);
        const nextActiveCount = Math.max(
          0, currentActiveCount + afterActive - beforeActive,
        );
        const updates: Record<string, unknown> = {
          activeTemplateCount: nextActiveCount,
          usedCount: nextCount,
          usedInActiveTemplate: nextActiveCount > 0,
          usedInTemplate: nextCount > 0,
        };
        if (afterRuns > beforeRuns && next.lastUsedAt && next.lastUsedAcademicYear) {
          const existingLastUsed = current.lastUsedAt instanceof Timestamp ?
            current.lastUsedAt : null;
          if (!existingLastUsed || next.lastUsedAt.toMillis() >= existingLastUsed.toMillis()) {
            updates.lastUsedAt = next.lastUsedAt;
            updates.lastUsedAcademicYear = next.lastUsedAcademicYear;
          }
          if (current.status === "active") updates.status = "used";
        }
        transaction.update(questionRefs[index], updates);
      });
      transaction.set(itemRef, {
        ...next,
        kind: "question_usage_projection_item",
        testId,
        updatedAt: this.now(),
      });
      return "applied";
    });
  }
}

export const questionUsageProjectionService = new QuestionUsageProjectionService();
