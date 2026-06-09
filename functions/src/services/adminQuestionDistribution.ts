import {getFirestore} from "../utils/firebaseAdmin";
import {QuestionAnalyticsDocument} from "../types/questionIngestion";
import {
  AdminQuestionDistributionChapterRecord,
  AdminQuestionDistributionDifficultyMetric,
  AdminQuestionDistributionResult,
  AdminQuestionDistributionValidatedRequest,
  AdminQuestionDistributionValidationError,
} from "../types/adminQuestionDistribution";

const INSTITUTES_COLLECTION = "institutes";
const QUESTION_ANALYTICS_COLLECTION = "questionAnalytics";
const QUESTION_BANK_COLLECTION = "questionBank";
const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;
const ALL_EXAM_SCOPE = "all";

type DifficultyBand = "Easy" | "Medium" | "Hard";

interface QuestionBankDistributionDocument {
  chapter?: unknown;
  difficulty?: unknown;
  examType?: unknown;
  marks?: unknown;
  status?: unknown;
  subject?: unknown;
}

interface DifficultyAggregationState {
  difficulty: DifficultyBand;
  marks: number;
  overstayPercentSum: number;
  questionCount: number;
  questionCountWithAnalytics: number;
  guessRatePercentSum: number;
}

interface ChapterAggregationState {
  chapter: string;
  counts: Record<DifficultyBand, number>;
  disciplineStressIndexSum: number;
  marks: number;
  questionCount: number;
  questionCountWithAnalytics: number;
  riskImpactScoreSum: number;
  subject: string;
}

function normalizeRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AdminQuestionDistributionValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a non-empty string.`,
    );
  }

  return value.trim();
}

function normalizeLimit(value: unknown): number {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_LIMIT;
  }

  const parsedValue =
    typeof value === "string" ? Number.parseInt(value, 10) : Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new AdminQuestionDistributionValidationError(
      "VALIDATION_ERROR",
      "Field \"limit\" must be a positive integer.",
    );
  }

  return Math.min(parsedValue, MAX_LIMIT);
}

function normalizeExamTypeFilter(value: unknown): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new AdminQuestionDistributionValidationError(
      "VALIDATION_ERROR",
      "Field \"examType\" must be a non-empty string when provided.",
    );
  }

  const normalized = value.trim();
  if (normalized.length === 0 || normalized.toLowerCase() === ALL_EXAM_SCOPE) {
    return null;
  }

  return normalized;
}

function toNonEmptyString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ?
    value.trim() :
    fallback;
}

function toNonNegativeNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return 0;
  }

  return value;
}

function normalizeDifficulty(value: unknown): DifficultyBand | null {
  if (value !== "Easy" && value !== "Medium" && value !== "Hard") {
    return null;
  }

  return value;
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

function toPercent(part: number, total: number): number {
  if (total <= 0) {
    return 0;
  }

  return roundToTwoDecimals((part / total) * 100);
}

function createDifficultyState(
  difficulty: DifficultyBand,
): DifficultyAggregationState {
  return {
    difficulty,
    guessRatePercentSum: 0,
    marks: 0,
    overstayPercentSum: 0,
    questionCount: 0,
    questionCountWithAnalytics: 0,
  };
}

function createChapterState(
  subject: string,
  chapter: string,
): ChapterAggregationState {
  return {
    chapter,
    counts: {
      Easy: 0,
      Hard: 0,
      Medium: 0,
    },
    disciplineStressIndexSum: 0,
    marks: 0,
    questionCount: 0,
    questionCountWithAnalytics: 0,
    riskImpactScoreSum: 0,
    subject,
  };
}

function toQuestionAnalyticsDocument(
  value: FirebaseFirestore.DocumentData | undefined,
): QuestionAnalyticsDocument | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  return {
    avgAccuracyWhenUsed: toNonNegativeNumber(value.avgAccuracyWhenUsed),
    avgRawPercentWhenUsed: toNonNegativeNumber(value.avgRawPercentWhenUsed),
    averageResponseTimeMs: toNonNegativeNumber(value.averageResponseTimeMs),
    correctAttemptCount: toNonNegativeNumber(value.correctAttemptCount),
    disciplineStressIndex: toNonNegativeNumber(value.disciplineStressIndex),
    guessRate: toNonNegativeNumber(value.guessRate),
    incorrectAttemptCount: toNonNegativeNumber(value.incorrectAttemptCount),
    overstayRate: toNonNegativeNumber(value.overstayRate),
    riskImpactScore: toNonNegativeNumber(value.riskImpactScore),
  };
}

function toDifficultyMetrics(
  states: DifficultyAggregationState[],
  totalQuestions: number,
  totalMarks: number,
): AdminQuestionDistributionDifficultyMetric[] {
  return states.map((state) => ({
    difficulty: state.difficulty,
    guessRatePercent:
      state.questionCountWithAnalytics > 0 ?
        roundToTwoDecimals(
          state.guessRatePercentSum / state.questionCountWithAnalytics,
        ) :
        0,
    marksPercent: toPercent(state.marks, totalMarks),
    overstayPercent:
      state.questionCountWithAnalytics > 0 ?
        roundToTwoDecimals(
          state.overstayPercentSum / state.questionCountWithAnalytics,
        ) :
        0,
    questionCount: state.questionCount,
    sharePercent: toPercent(state.questionCount, totalQuestions),
  }));
}

function toChapterRecord(
  state: ChapterAggregationState,
  totalMarks: number,
): AdminQuestionDistributionChapterRecord {
  return {
    chapter: state.chapter,
    disciplineStressIndex:
      state.questionCountWithAnalytics > 0 ?
        roundToTwoDecimals(
          state.disciplineStressIndexSum / state.questionCountWithAnalytics,
        ) :
        0,
    easyPercent: toPercent(state.counts.Easy, state.questionCount),
    hardPercent: toPercent(state.counts.Hard, state.questionCount),
    marksPercent: toPercent(state.marks, totalMarks),
    mediumPercent: toPercent(state.counts.Medium, state.questionCount),
    questionCount: state.questionCount,
    riskImpactScore:
      state.questionCountWithAnalytics > 0 ?
        roundToTwoDecimals(
          state.riskImpactScoreSum / state.questionCountWithAnalytics,
        ) :
        0,
    subject: state.subject,
  };
}

function countImbalanceWarnings(
  chapters: AdminQuestionDistributionChapterRecord[],
): number {
  return chapters.filter((chapter) => (
    chapter.marksPercent >= 25 ||
    chapter.easyPercent >= 70 ||
    chapter.mediumPercent >= 70 ||
    chapter.hardPercent >= 50
  )).length;
}

export class AdminQuestionDistributionService {
  constructor(
    private readonly firestore: FirebaseFirestore.Firestore = getFirestore(),
  ) {}

  public normalizeRequest(input: {
    examType?: unknown;
    instituteId?: unknown;
    limit?: unknown;
  }): AdminQuestionDistributionValidatedRequest {
    return {
      examType: normalizeExamTypeFilter(input.examType),
      instituteId: normalizeRequiredString(input.instituteId, "instituteId"),
      limit: normalizeLimit(input.limit),
    };
  }

  public async getDistributionSummary(
    request: AdminQuestionDistributionValidatedRequest,
  ): Promise<AdminQuestionDistributionResult> {
    const questionBankSnapshot = await this.firestore
      .collection(INSTITUTES_COLLECTION)
      .doc(request.instituteId)
      .collection(QUESTION_BANK_COLLECTION)
      .get();

    const difficultyStates: Record<
      DifficultyBand,
      DifficultyAggregationState
    > = {
      Easy: createDifficultyState("Easy"),
      Hard: createDifficultyState("Hard"),
      Medium: createDifficultyState("Medium"),
    };
    const chapterStates = new Map<string, ChapterAggregationState>();
    const examTypes = new Set<string>();
    const retainedQuestionDocs: Array<{
      data: QuestionBankDistributionDocument;
      id: string;
    }> = [];
    let missingDifficultyWarnings = 0;
    let totalMarks = 0;

    questionBankSnapshot.docs.forEach((document) => {
      const data = document.data() as QuestionBankDistributionDocument;
      const status = toNonEmptyString(data.status, "active").toLowerCase();

      if (status === "deprecated") {
        return;
      }

      const examType = toNonEmptyString(data.examType, "General");
      if (request.examType !== null && examType !== request.examType) {
        return;
      }

      retainedQuestionDocs.push({
        data,
        id: document.id,
      });

      examTypes.add(examType);

      const subject = toNonEmptyString(data.subject, "General");
      const chapter = toNonEmptyString(data.chapter, "Unmapped");
      const marks = toNonNegativeNumber(data.marks);
      const difficulty = normalizeDifficulty(data.difficulty);

      totalMarks += marks;

      if (!difficulty) {
        missingDifficultyWarnings += 1;
      }

      const chapterKey = `${subject}::${chapter}`;
      const chapterState =
        chapterStates.get(chapterKey) ?? createChapterState(subject, chapter);
      chapterState.questionCount += 1;
      chapterState.marks += marks;

      if (difficulty) {
        difficultyStates[difficulty].questionCount += 1;
        difficultyStates[difficulty].marks += marks;
        chapterState.counts[difficulty] += 1;
      }

      chapterStates.set(chapterKey, chapterState);
    });

    const analyticsReferences = retainedQuestionDocs.map((question) =>
      this.firestore.doc(
        `${INSTITUTES_COLLECTION}/${request.instituteId}/` +
        `${QUESTION_ANALYTICS_COLLECTION}/${question.id}`,
      ),
    );
    const analyticsSnapshots =
      analyticsReferences.length > 0 ?
        await this.firestore.getAll(...analyticsReferences) :
        [];
    const analyticsByQuestionId = new Map<string, QuestionAnalyticsDocument>();

    analyticsSnapshots.forEach((snapshot) => {
      if (!snapshot.exists) {
        return;
      }

      const analytics = toQuestionAnalyticsDocument(snapshot.data());
      if (!analytics) {
        return;
      }

      analyticsByQuestionId.set(snapshot.id, analytics);
    });

    retainedQuestionDocs.forEach((question) => {
      const difficulty = normalizeDifficulty(question.data.difficulty);
      if (!difficulty) {
        return;
      }

      const analytics = analyticsByQuestionId.get(question.id);
      if (!analytics) {
        return;
      }

      const subject = toNonEmptyString(question.data.subject, "General");
      const chapter = toNonEmptyString(question.data.chapter, "Unmapped");
      const chapterKey = `${subject}::${chapter}`;
      const chapterState = chapterStates.get(chapterKey);
      if (!chapterState) {
        return;
      }

      difficultyStates[difficulty].guessRatePercentSum += analytics.guessRate;
      difficultyStates[difficulty].overstayPercentSum += analytics.overstayRate;
      difficultyStates[difficulty].questionCountWithAnalytics += 1;

      chapterState.disciplineStressIndexSum += analytics.disciplineStressIndex;
      chapterState.questionCountWithAnalytics += 1;
      chapterState.riskImpactScoreSum += analytics.riskImpactScore;
    });

    const analyticsQuestionCount = analyticsByQuestionId.size;
    const totalQuestions = retainedQuestionDocs.length;
    const chapters = Array.from(chapterStates.values())
      .map((state) => toChapterRecord(state, totalMarks))
      .sort((left, right) =>
        right.questionCount - left.questionCount ||
        right.riskImpactScore - left.riskImpactScore ||
        left.chapter.localeCompare(right.chapter),
      )
      .slice(0, request.limit);

    return {
      analyticsQuestionCount,
      chapters,
      computedAt: new Date().toISOString(),
      difficulties: toDifficultyMetrics(
        [difficultyStates.Easy, difficultyStates.Medium, difficultyStates.Hard],
        totalQuestions,
        totalMarks,
      ),
      examType:
        examTypes.size === 1 ? Array.from(examTypes)[0] ?? "General" : "Mixed",
      imbalanceWarnings: countImbalanceWarnings(chapters),
      missingDifficultyWarnings,
      totalQuestions,
    };
  }
}

export const adminQuestionDistributionService =
  new AdminQuestionDistributionService();
