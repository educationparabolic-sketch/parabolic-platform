/* eslint-disable require-jsdoc */
import {createHash} from "node:crypto";
import {Timestamp} from "firebase-admin/firestore";
import {getFirestore} from "../utils/firebaseAdmin";

const INSTITUTES_COLLECTION = "institutes";
const QUESTION_BANK_COLLECTION = "questionBank";
const QUESTION_ANALYTICS_COLLECTION = "questionAnalytics";
const PROJECTIONS_COLLECTION = "questionDistributionProjections";
const ITEMS_COLLECTION = "questionDistributionItems";
const CHAPTERS_COLLECTION = "chapters";
const ALL_SCOPE_ID = "all";

type Difficulty = "Easy" | "Medium" | "Hard";

interface Contribution {
  analyticsActive: boolean;
  chapter: string;
  difficulty: Difficulty | null;
  disciplineStressIndex: number;
  examType: string;
  guessRate: number;
  marks: number;
  overstayRate: number;
  questionId: string;
  riskImpactScore: number;
  subject: string;
}

interface DifficultyState {
  analyticsQuestionCount: number;
  guessRateSum: number;
  marks: number;
  overstayRateSum: number;
  questionCount: number;
}

interface SummaryState {
  analyticsQuestionCount: number;
  difficulties: Record<Difficulty, DifficultyState>;
  examTypeCounts: Record<string, number>;
  missingDifficultyWarnings: number;
  questionCount: number;
  totalMarks: number;
}

interface ChapterState {
  analyticsQuestionCount: number;
  chapter: string;
  counts: Record<Difficulty, number>;
  disciplineStressIndexSum: number;
  marks: number;
  questionCount: number;
  riskImpactScoreSum: number;
  subject: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function number(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function integer(value: unknown): number {
  return Math.max(0, Math.round(number(value)));
}

function difficulty(value: unknown): Difficulty | null {
  return value === "Easy" || value === "Medium" || value === "Hard" ? value : null;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function scopeId(examType: string | null): string {
  return examType === null ? ALL_SCOPE_ID : `exam_${sha256(examType).slice(0, 32)}`;
}

function chapterId(subject: string, chapter: string): string {
  return `chapter_${sha256(`${subject}\u0000${chapter}`).slice(0, 32)}`;
}

function emptyDifficulty(): DifficultyState {
  return {
    analyticsQuestionCount: 0,
    guessRateSum: 0,
    marks: 0,
    overstayRateSum: 0,
    questionCount: 0,
  };
}

function emptySummary(): SummaryState {
  return {
    analyticsQuestionCount: 0,
    difficulties: {
      Easy: emptyDifficulty(),
      Hard: emptyDifficulty(),
      Medium: emptyDifficulty(),
    },
    examTypeCounts: {},
    missingDifficultyWarnings: 0,
    questionCount: 0,
    totalMarks: 0,
  };
}

function readDifficulty(value: unknown): DifficultyState {
  const data = isRecord(value) ? value : {};
  return {
    analyticsQuestionCount: integer(data.analyticsQuestionCount),
    guessRateSum: number(data.guessRateSum),
    marks: number(data.marks),
    overstayRateSum: number(data.overstayRateSum),
    questionCount: integer(data.questionCount),
  };
}

function readSummary(value: FirebaseFirestore.DocumentData | undefined): SummaryState {
  if (!value) return emptySummary();
  const difficulties = isRecord(value.difficulties) ? value.difficulties : {};
  const examTypeCounts = isRecord(value.examTypeCounts) ?
    Object.fromEntries(Object.entries(value.examTypeCounts)
      .filter(([, count]) => typeof count === "number" && count > 0)) as Record<string, number> : {};
  return {
    analyticsQuestionCount: integer(value.analyticsQuestionCount),
    difficulties: {
      Easy: readDifficulty(difficulties.Easy),
      Hard: readDifficulty(difficulties.Hard),
      Medium: readDifficulty(difficulties.Medium),
    },
    examTypeCounts,
    missingDifficultyWarnings: integer(value.missingDifficultyWarnings),
    questionCount: integer(value.questionCount),
    totalMarks: number(value.totalMarks),
  };
}

function emptyChapter(subject: string, chapter: string): ChapterState {
  return {
    analyticsQuestionCount: 0,
    chapter,
    counts: {Easy: 0, Hard: 0, Medium: 0},
    disciplineStressIndexSum: 0,
    marks: 0,
    questionCount: 0,
    riskImpactScoreSum: 0,
    subject,
  };
}

function readChapter(
  value: FirebaseFirestore.DocumentData | undefined,
  subject: string,
  chapter: string,
): ChapterState {
  if (!value) return emptyChapter(subject, chapter);
  const counts = isRecord(value.counts) ? value.counts : {};
  return {
    analyticsQuestionCount: integer(value.analyticsQuestionCount),
    chapter: text(value.chapter, chapter),
    counts: {
      Easy: integer(counts.Easy),
      Hard: integer(counts.Hard),
      Medium: integer(counts.Medium),
    },
    disciplineStressIndexSum: number(value.disciplineStressIndexSum),
    marks: number(value.marks),
    questionCount: integer(value.questionCount),
    riskImpactScoreSum: number(value.riskImpactScoreSum),
    subject: text(value.subject, subject),
  };
}

function activeAnalytics(data: Record<string, unknown>): boolean {
  const processing = isRecord(data.processingMarkers) ? data.processingMarkers : {};
  const engine = isRecord(processing.questionAnalyticsEngine) ?
    processing.questionAnalyticsEngine : {};
  return number(engine.useCount) > 0 ||
    number(data.correctAttemptCount) + number(data.incorrectAttemptCount) > 0;
}

function contribution(
  questionId: string,
  question: FirebaseFirestore.DocumentData | undefined,
  analytics: FirebaseFirestore.DocumentData | undefined,
): Contribution | null {
  if (!question || question.status === "archived" || question.status === "deprecated") {
    return null;
  }
  const analyticsData = analytics ?? {};
  return {
    analyticsActive: activeAnalytics(analyticsData),
    chapter: text(question.chapter, "Unmapped"),
    difficulty: difficulty(question.difficulty),
    disciplineStressIndex: number(analyticsData.disciplineStressIndex),
    examType: text(question.examType, "General"),
    guessRate: number(analyticsData.guessRate),
    marks: number(question.marks),
    overstayRate: number(analyticsData.overstayRate),
    questionId,
    riskImpactScore: number(analyticsData.riskImpactScore),
    subject: text(question.subject, "General"),
  };
}

function storedContribution(value: unknown): Contribution | null {
  if (!isRecord(value)) return null;
  return {
    analyticsActive: value.analyticsActive === true,
    chapter: text(value.chapter, "Unmapped"),
    difficulty: difficulty(value.difficulty),
    disciplineStressIndex: number(value.disciplineStressIndex),
    examType: text(value.examType, "General"),
    guessRate: number(value.guessRate),
    marks: number(value.marks),
    overstayRate: number(value.overstayRate),
    questionId: text(value.questionId, "unknown"),
    riskImpactScore: number(value.riskImpactScore),
    subject: text(value.subject, "General"),
  };
}

function addSummary(state: SummaryState, value: Contribution, direction: 1 | -1): void {
  state.questionCount = Math.max(0, state.questionCount + direction);
  state.totalMarks = Math.max(0, state.totalMarks + direction * value.marks);
  state.examTypeCounts[value.examType] = Math.max(
    0, (state.examTypeCounts[value.examType] ?? 0) + direction,
  );
  if (state.examTypeCounts[value.examType] === 0) delete state.examTypeCounts[value.examType];
  if (value.analyticsActive) {
    state.analyticsQuestionCount = Math.max(0, state.analyticsQuestionCount + direction);
  }
  if (!value.difficulty) {
    state.missingDifficultyWarnings = Math.max(
      0, state.missingDifficultyWarnings + direction,
    );
    return;
  }
  const band = state.difficulties[value.difficulty];
  band.questionCount = Math.max(0, band.questionCount + direction);
  band.marks = Math.max(0, band.marks + direction * value.marks);
  if (value.analyticsActive) {
    band.analyticsQuestionCount = Math.max(0, band.analyticsQuestionCount + direction);
    band.guessRateSum = Math.max(0, band.guessRateSum + direction * value.guessRate);
    band.overstayRateSum = Math.max(0, band.overstayRateSum + direction * value.overstayRate);
  }
}

function addChapter(state: ChapterState, value: Contribution, direction: 1 | -1): void {
  state.questionCount = Math.max(0, state.questionCount + direction);
  state.marks = Math.max(0, state.marks + direction * value.marks);
  if (value.difficulty) {
    state.counts[value.difficulty] = Math.max(
      0, state.counts[value.difficulty] + direction,
    );
  }
  if (value.analyticsActive) {
    state.analyticsQuestionCount = Math.max(0, state.analyticsQuestionCount + direction);
    state.disciplineStressIndexSum = Math.max(
      0, state.disciplineStressIndexSum + direction * value.disciplineStressIndex,
    );
    state.riskImpactScoreSum = Math.max(
      0, state.riskImpactScoreSum + direction * value.riskImpactScore,
    );
  }
}

function scopeKeys(value: Contribution | null): Array<{examType: string | null; id: string}> {
  return value ? [
    {examType: null, id: scopeId(null)},
    {examType: value.examType, id: scopeId(value.examType)},
  ] : [];
}

export class QuestionDistributionProjectionService {
  constructor(
    private readonly firestore: FirebaseFirestore.Firestore = getFirestore(),
    private readonly now: () => Timestamp = () => Timestamp.now(),
  ) {}

  public getScopeId(examType: string | null): string {
    return scopeId(examType);
  }

  public async reconcileQuestion(input: {
    instituteId: string;
    questionId: string;
  }): Promise<"applied" | "unchanged"> {
    const instituteId = text(input.instituteId, "");
    const questionId = text(input.questionId, "");
    if (!instituteId || !questionId) throw new Error("Projection identifiers are required.");
    const institute = this.firestore.collection(INSTITUTES_COLLECTION).doc(instituteId);
    const questionRef = institute.collection(QUESTION_BANK_COLLECTION).doc(questionId);
    const analyticsRef = institute.collection(QUESTION_ANALYTICS_COLLECTION).doc(questionId);
    const itemRef = institute.collection(ITEMS_COLLECTION).doc(questionId);
    return this.firestore.runTransaction(async (transaction) => {
      const [questionSnapshot, analyticsSnapshot, itemSnapshot] = await Promise.all([
        transaction.get(questionRef),
        transaction.get(analyticsRef),
        transaction.get(itemRef),
      ]);
      const previous = storedContribution(itemSnapshot.get("contribution"));
      const next = contribution(
        questionId,
        questionSnapshot.exists ? questionSnapshot.data() : undefined,
        analyticsSnapshot.exists ? analyticsSnapshot.data() : undefined,
      );
      const fingerprint = sha256(stableJson(next));
      if (itemSnapshot.get("fingerprint") === fingerprint) return "unchanged";

      const scopeMap = new Map<string, {examType: string | null; id: string}>();
      [...scopeKeys(previous), ...scopeKeys(next)].forEach((scope) =>
        scopeMap.set(scope.id, scope));
      const chapterMap = new Map<string, {
        chapter: string;
        examType: string | null;
        id: string;
        scopeId: string;
        subject: string;
      }>();
      const collectChapters = (value: Contribution | null): void => {
        scopeKeys(value).forEach((scope) => {
          if (!value) return;
          const id = chapterId(value.subject, value.chapter);
          chapterMap.set(`${scope.id}/${id}`, {
            chapter: value.chapter,
            examType: scope.examType,
            id,
            scopeId: scope.id,
            subject: value.subject,
          });
        });
      };
      collectChapters(previous);
      collectChapters(next);
      const summaryRefs = Array.from(scopeMap.values()).map((scope) =>
        institute.collection(PROJECTIONS_COLLECTION).doc(scope.id));
      const chapterEntries = Array.from(chapterMap.values());
      const chapterRefs = chapterEntries.map((chapter) =>
        institute.collection(PROJECTIONS_COLLECTION).doc(chapter.scopeId)
          .collection(CHAPTERS_COLLECTION).doc(chapter.id));
      const [summarySnapshots, chapterSnapshots] = await Promise.all([
        Promise.all(summaryRefs.map((reference) => transaction.get(reference))),
        Promise.all(chapterRefs.map((reference) => transaction.get(reference))),
      ]);
      const summaries = new Map<string, SummaryState>();
      Array.from(scopeMap.values()).forEach((scope, index) =>
        summaries.set(scope.id, readSummary(summarySnapshots[index]?.data())));
      const chapters = new Map<string, ChapterState>();
      chapterEntries.forEach((chapter, index) => chapters.set(
        `${chapter.scopeId}/${chapter.id}`,
        readChapter(chapterSnapshots[index]?.data(), chapter.subject, chapter.chapter),
      ));
      const apply = (value: Contribution | null, direction: 1 | -1): void => {
        if (!value) return;
        scopeKeys(value).forEach((scope) => {
          const summary = summaries.get(scope.id);
          const chapter = chapters.get(
            `${scope.id}/${chapterId(value.subject, value.chapter)}`,
          );
          if (!summary || !chapter) throw new Error("Projection state is incomplete.");
          addSummary(summary, value, direction);
          addChapter(chapter, value, direction);
        });
      };
      apply(previous, -1);
      apply(next, 1);
      const computedAt = this.now();
      Array.from(scopeMap.values()).forEach((scope, index) => {
        const state = summaries.get(scope.id) ?? emptySummary();
        const revision = integer(summarySnapshots[index]?.get("projectionRevision")) + 1;
        transaction.set(summaryRefs[index], {
          ...state,
          backfillComplete: summarySnapshots[index]?.get("backfillComplete") === true,
          computedAt,
          examType: scope.examType,
          kind: "question_distribution_projection",
          projectionRevision: revision,
          scopeId: scope.id,
        });
      });
      chapterEntries.forEach((chapter, index) => {
        const state = chapters.get(`${chapter.scopeId}/${chapter.id}`) ??
          emptyChapter(chapter.subject, chapter.chapter);
        if (state.questionCount === 0) {
          transaction.delete(chapterRefs[index]);
          return;
        }
        transaction.set(chapterRefs[index], {
          ...state,
          chapterKey: `${state.subject}\u0000${state.chapter}`,
          computedAt,
          disciplineStressIndex: state.analyticsQuestionCount > 0 ?
            state.disciplineStressIndexSum / state.analyticsQuestionCount : 0,
          examType: chapter.examType,
          riskImpactScore: state.analyticsQuestionCount > 0 ?
            state.riskImpactScoreSum / state.analyticsQuestionCount : 0,
          scopeId: chapter.scopeId,
        });
      });
      transaction.set(itemRef, {
        contribution: next,
        fingerprint,
        kind: "question_distribution_item",
        questionId,
        updatedAt: computedAt,
      });
      return "applied";
    });
  }
}

export const questionDistributionProjectionService =
  new QuestionDistributionProjectionService();
