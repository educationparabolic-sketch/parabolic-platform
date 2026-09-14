/* eslint-disable require-jsdoc */
import {Timestamp} from "firebase-admin/firestore";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  AdminQuestionDistributionChapterRecord,
  AdminQuestionDistributionDifficultyMetric,
  AdminQuestionDistributionResult,
  AdminQuestionDistributionValidatedRequest,
  AdminQuestionDistributionValidationError,
} from "../types/adminQuestionDistribution";
import {questionDistributionProjectionService} from
  "./questionDistributionProjection";

const INSTITUTES_COLLECTION = "institutes";
const PROJECTIONS_COLLECTION = "questionDistributionProjections";
const CHAPTERS_COLLECTION = "chapters";
const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;
const ALL_EXAM_SCOPE = "all";

type DifficultyBand = "Easy" | "Medium" | "Hard";

function requiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new AdminQuestionDistributionValidationError(
      "VALIDATION_ERROR", `Field "${fieldName}" must be a non-empty string.`,
    );
  }
  return value.trim();
}

function limit(value: unknown): number {
  if (value === undefined || value === null || value === "") return DEFAULT_LIMIT;
  const parsed = typeof value === "string" ? Number.parseInt(value, 10) : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
    throw new AdminQuestionDistributionValidationError(
      "VALIDATION_ERROR", `Field "limit" must be an integer between 1 and ${MAX_LIMIT}.`,
    );
  }
  return parsed;
}

function examType(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  const normalized = requiredString(value, "examType");
  return normalized.toLowerCase() === ALL_EXAM_SCOPE ? null : normalized;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ?
    value as Record<string, unknown> : {};
}

function number(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function integer(value: unknown): number {
  return Math.max(0, Math.round(number(value)));
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function percent(part: number, total: number): number {
  return total > 0 ? round((part / total) * 100) : 0;
}

function difficultyMetric(
  band: DifficultyBand,
  raw: unknown,
  totalQuestions: number,
  totalMarks: number,
): AdminQuestionDistributionDifficultyMetric {
  const data = record(raw);
  const analyticsCount = integer(data.analyticsQuestionCount);
  const questionCount = integer(data.questionCount);
  return {
    difficulty: band,
    guessRatePercent: analyticsCount > 0 ?
      round(number(data.guessRateSum) / analyticsCount) : 0,
    marksPercent: percent(number(data.marks), totalMarks),
    overstayPercent: analyticsCount > 0 ?
      round(number(data.overstayRateSum) / analyticsCount) : 0,
    questionCount,
    sharePercent: percent(questionCount, totalQuestions),
  };
}

function chapterRecord(
  snapshot: FirebaseFirestore.QueryDocumentSnapshot,
  totalMarks: number,
): AdminQuestionDistributionChapterRecord {
  const data = snapshot.data();
  const counts = record(data.counts);
  const questionCount = integer(data.questionCount);
  const analyticsCount = integer(data.analyticsQuestionCount);
  return {
    chapter: text(data.chapter, "Unmapped"),
    disciplineStressIndex: analyticsCount > 0 ?
      round(number(data.disciplineStressIndexSum) / analyticsCount) : 0,
    easyPercent: percent(integer(counts.Easy), questionCount),
    hardPercent: percent(integer(counts.Hard), questionCount),
    marksPercent: percent(number(data.marks), totalMarks),
    mediumPercent: percent(integer(counts.Medium), questionCount),
    questionCount,
    riskImpactScore: analyticsCount > 0 ?
      round(number(data.riskImpactScoreSum) / analyticsCount) : 0,
    subject: text(data.subject, "General"),
  };
}

function imbalanceWarnings(chapters: AdminQuestionDistributionChapterRecord[]): number {
  return chapters.filter((chapter) => chapter.marksPercent >= 25 ||
    chapter.easyPercent >= 70 || chapter.mediumPercent >= 70 ||
    chapter.hardPercent >= 50).length;
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
      examType: examType(input.examType),
      instituteId: requiredString(input.instituteId, "instituteId"),
      limit: limit(input.limit),
    };
  }

  public async getDistributionSummary(
    request: AdminQuestionDistributionValidatedRequest,
  ): Promise<AdminQuestionDistributionResult> {
    const scopeId = questionDistributionProjectionService
      .getScopeId(request.examType);
    const projection = this.firestore.collection(INSTITUTES_COLLECTION)
      .doc(request.instituteId).collection(PROJECTIONS_COLLECTION).doc(scopeId);
    const [summary, chapters] = await Promise.all([
      projection.get(),
      projection.collection(CHAPTERS_COLLECTION)
        .orderBy("questionCount", "desc")
        .orderBy("riskImpactScore", "desc")
        .orderBy("chapterKey", "asc")
        .limit(request.limit)
        .get(),
    ]);
    if (!summary.exists || summary.get("kind") !== "question_distribution_projection" ||
      summary.get("backfillComplete") !== true) {
      throw new AdminQuestionDistributionValidationError(
        "CONFLICT",
        "Question distribution projection is unavailable; governed backfill is required.",
      );
    }
    const data = summary.data() ?? {};
    const computedAt = summary.get("computedAt");
    if (!(computedAt instanceof Timestamp)) {
      throw new AdminQuestionDistributionValidationError(
        "CONFLICT", "Question distribution projection is missing its timestamp.",
      );
    }
    const totalQuestions = integer(data.questionCount);
    const totalMarks = number(data.totalMarks);
    const difficulties = record(data.difficulties);
    const chapterRecords = chapters.docs.map((chapter) =>
      chapterRecord(chapter, totalMarks));
    const examTypeCounts = record(data.examTypeCounts);
    const examTypes = Object.entries(examTypeCounts)
      .filter(([, count]) => number(count) > 0)
      .map(([name]) => name);
    return {
      analyticsQuestionCount: integer(data.analyticsQuestionCount),
      chapters: chapterRecords,
      computedAt: computedAt.toDate().toISOString(),
      difficulties: ["Easy", "Medium", "Hard"].map((band) =>
        difficultyMetric(
          band as DifficultyBand,
          difficulties[band],
          totalQuestions,
          totalMarks,
        )),
      examType: request.examType ?? (examTypes.length === 1 ? examTypes[0] : "Mixed"),
      imbalanceWarnings: imbalanceWarnings(chapterRecords),
      missingDifficultyWarnings: integer(data.missingDifficultyWarnings),
      totalQuestions,
    };
  }
}

export const adminQuestionDistributionService =
  new AdminQuestionDistributionService();
