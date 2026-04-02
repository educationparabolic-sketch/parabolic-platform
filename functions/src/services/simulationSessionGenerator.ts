import {Timestamp} from "firebase-admin/firestore";
import {StandardApiErrorCode} from "../types/apiResponse";
import {
  SessionExecutionMode,
  SessionQuestionTimeMap,
  SessionTimingProfileSnapshot,
} from "../types/sessionStart";
import {
  GenerateSyntheticSessionsInput,
  GenerateSyntheticSessionsResult,
  SyntheticAnswerRecord,
  SyntheticSessionDocument,
} from "../types/simulationSessionGenerator";
import {
  SubmissionQuestionMeta,
  computeSubmissionMetrics,
} from "./submission";
import {getFirestore} from "../utils/firebaseAdmin";
import {createLogger} from "./logging";
import {
  assertSimulationEnvironmentAllowed,
  normalizeSimulationId,
} from "./simulationEnvironment";

const INSTITUTES_COLLECTION = "institutes";
const ACADEMIC_YEARS_COLLECTION = "academicYears";
const RUNS_COLLECTION = "runs";
const SESSIONS_COLLECTION = "sessions";
const STUDENTS_COLLECTION = "students";
const SIMULATION_INSTITUTE_PREFIX = "sim_";
const QUESTION_OPTIONS = ["A", "B", "C", "D"] as const;
const RUN_BATCH_SIZE = 300;

interface SimulationEnvironmentDocument {
  parameterSnapshot?: {
    difficultyDistribution?: unknown;
    runCount?: unknown;
    timingAggressiveness?: unknown;
  };
  simulationVersion?: unknown;
}

interface SyntheticRunDefinition {
  mode: SessionExecutionMode;
  path: string;
  phaseConfigSnapshot: {
    phase1Percent: number;
    phase2Percent: number;
    phase3Percent: number;
  };
  questionIds: string[];
  questionMetaById: Record<string, SubmissionQuestionMeta>;
  runId: string;
  timingProfileSnapshot: SessionTimingProfileSnapshot;
}

interface SimulatedQuestionAttempt {
  answerRecord?: SyntheticAnswerRecord;
  timeRecord: SessionQuestionTimeMap[string];
}

interface SyntheticStudentProfile {
  baselineAbility: number;
  disciplineProfile: number;
  fatigueFactor: number;
  impulsivenessScore: number;
  overconfidenceScore: number;
  studentId: string;
  topicStrengthMap: Record<string, number>;
}

/**
 * Raised when synthetic session generation input or prerequisites are invalid.
 */
export class SimulationSessionGenerationValidationError extends Error {
  public readonly code: StandardApiErrorCode;

  /**
   * @param {StandardApiErrorCode} code Stable API error code.
   * @param {string} message Safe validation detail for API responses.
   */
  constructor(code: StandardApiErrorCode, message: string) {
    super(message);
    this.name = "SimulationSessionGenerationValidationError";
    this.code = code;
  }
}

const isRecord = (
  value: unknown,
): value is Record<string, unknown> => typeof value === "object" &&
  value !== null &&
  !Array.isArray(value);

const normalizeRequiredString = (
  value: unknown,
  fieldName: string,
): string => {
  if (typeof value !== "string") {
    throw new SimulationSessionGenerationValidationError(
      "VALIDATION_ERROR",
      `Simulation field "${fieldName}" must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new SimulationSessionGenerationValidationError(
      "VALIDATION_ERROR",
      `Simulation field "${fieldName}" must be a non-empty string.`,
    );
  }

  return normalizedValue;
};

const normalizePositiveInteger = (
  value: unknown,
  fieldName: string,
): number => {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new SimulationSessionGenerationValidationError(
      "VALIDATION_ERROR",
      `Simulation field "${fieldName}" must be a positive integer.`,
    );
  }

  return value;
};

const normalizeUnitInterval = (
  value: unknown,
  fieldName: string,
): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new SimulationSessionGenerationValidationError(
      "VALIDATION_ERROR",
      `Simulation field "${fieldName}" must be a number.`,
    );
  }

  return Number(Math.max(0, Math.min(1, value)).toFixed(4));
};

const createSeededRandom = (seedValue: string): (() => number) => {
  let hash = 2166136261;

  for (let index = 0; index < seedValue.length; index += 1) {
    hash ^= seedValue.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (): number => {
    hash += 0x6D2B79F5;
    let value = hash;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const chunkArray = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
};

const normalizeDifficultyDistribution = (value: unknown): string =>
  typeof value === "string" && value.trim() ? value.trim().toLowerCase() :
    "realistic";

const normalizeTimingAggressiveness = (value: unknown): string =>
  typeof value === "string" && value.trim() ? value.trim().toLowerCase() :
    "moderate";

const resolveTimingProfileSnapshot = (
  timingAggressiveness: string,
): SessionTimingProfileSnapshot => {
  switch (timingAggressiveness) {
  case "aggressive":
  case "high":
    return {
      easy: {max: 75, min: 30},
      hard: {max: 150, min: 55},
      medium: {max: 105, min: 40},
    };
  case "relaxed":
  case "low":
    return {
      easy: {max: 105, min: 25},
      hard: {max: 210, min: 70},
      medium: {max: 150, min: 50},
    };
  case "moderate":
  default:
    return {
      easy: {max: 90, min: 30},
      hard: {max: 180, min: 60},
      medium: {max: 120, min: 45},
    };
  }
};

const resolveRunMode = (
  timingAggressiveness: string,
): SessionExecutionMode => {
  switch (timingAggressiveness) {
  case "aggressive":
  case "high":
    return "Hard";
  case "relaxed":
  case "low":
    return "Operational";
  case "moderate":
  default:
    return "Controlled";
  }
};

const resolveQuestionDifficulties = (
  difficultyDistribution: string,
): Array<SubmissionQuestionMeta["difficulty"]> => {
  const difficulties: Array<SubmissionQuestionMeta["difficulty"]> = [];
  const mix = difficultyDistribution === "hard" ?
    {easy: 4, medium: 8, hard: 8} :
    difficultyDistribution === "easy" ?
      {easy: 10, medium: 7, hard: 3} :
      {easy: 8, medium: 8, hard: 4};

  for (let index = 0; index < mix.easy; index += 1) {
    difficulties.push("Easy");
  }

  for (let index = 0; index < mix.medium; index += 1) {
    difficulties.push("Medium");
  }

  for (let index = 0; index < mix.hard; index += 1) {
    difficulties.push("Hard");
  }

  return difficulties;
};

const buildQuestionMetaById = (
  simulationId: string,
  runId: string,
  difficultyDistribution: string,
): Record<string, SubmissionQuestionMeta> => {
  const difficulties = resolveQuestionDifficulties(difficultyDistribution);
  const phase1Count = 8;
  const phase2Count = 9;
  const orderedDifficulties = [
    ...difficulties.slice(2, phase1Count),
    ...difficulties.slice(0, 2),
    ...difficulties.slice(phase1Count, phase1Count + phase2Count),
    ...difficulties.slice(phase1Count + phase2Count),
  ];
  const questionMetaById: Record<string, SubmissionQuestionMeta> = {};

  orderedDifficulties.forEach((difficulty, index) => {
    const questionId =
      `${simulationId}_${runId}_q${String(index + 1).padStart(2, "0")}`;
    const optionIndex = (index + runId.length) % QUESTION_OPTIONS.length;

    questionMetaById[questionId] = {
      correctAnswer: QUESTION_OPTIONS[optionIndex],
      difficulty,
      marks: difficulty === "Hard" ? 4 : difficulty === "Medium" ? 2 : 1,
      negativeMarks:
        difficulty === "Hard" ? 1 : difficulty === "Medium" ? 0.5 : 0.25,
    };
  });

  return questionMetaById;
};

const buildRunDefinition = (
  instituteId: string,
  simulationId: string,
  yearId: string,
  runIndex: number,
  timingAggressiveness: string,
  difficultyDistribution: string,
): SyntheticRunDefinition => {
  const runId = `sim_run_${String(runIndex + 1).padStart(3, "0")}`;
  const questionMetaById = buildQuestionMetaById(
    simulationId,
    runId,
    difficultyDistribution,
  );

  return {
    mode: resolveRunMode(timingAggressiveness),
    path:
      `${INSTITUTES_COLLECTION}/${instituteId}/` +
      `${ACADEMIC_YEARS_COLLECTION}/${yearId}/${RUNS_COLLECTION}/${runId}`,
    phaseConfigSnapshot: {
      phase1Percent: 40,
      phase2Percent: 45,
      phase3Percent: 15,
    },
    questionIds: Object.keys(questionMetaById),
    questionMetaById,
    runId,
    timingProfileSnapshot: resolveTimingProfileSnapshot(timingAggressiveness),
  };
};

const normalizeStudentProfile = (
  value: unknown,
): SyntheticStudentProfile => {
  if (!isRecord(value)) {
    throw new SimulationSessionGenerationValidationError(
      "VALIDATION_ERROR",
      "Synthetic student documents must be Firestore objects.",
    );
  }

  const topicStrengthMap = isRecord(value.topicStrengthMap) ?
    Object.entries(value.topicStrengthMap).reduce<Record<string, number>>(
      (accumulator, [topicId, strength]) => {
        accumulator[topicId] = normalizeUnitInterval(
          strength,
          `topicStrengthMap.${topicId}`,
        );
        return accumulator;
      },
      {},
    ) :
    {};

  if (Object.keys(topicStrengthMap).length === 0) {
    throw new SimulationSessionGenerationValidationError(
      "VALIDATION_ERROR",
      "Synthetic students must include a non-empty topicStrengthMap.",
    );
  }

  return {
    baselineAbility: normalizeUnitInterval(
      value.baselineAbility,
      "baselineAbility",
    ),
    disciplineProfile: normalizeUnitInterval(
      value.disciplineProfile,
      "disciplineProfile",
    ),
    fatigueFactor: normalizeUnitInterval(
      value.fatigueFactor,
      "fatigueFactor",
    ),
    impulsivenessScore: normalizeUnitInterval(
      value.impulsivenessScore,
      "impulsivenessScore",
    ),
    overconfidenceScore: normalizeUnitInterval(
      value.overconfidenceScore,
      "overconfidenceScore",
    ),
    studentId: normalizeRequiredString(value.studentId, "studentId"),
    topicStrengthMap,
  };
};

const buildSessionId = (runId: string, studentId: string): string =>
  `${runId}_${studentId}`;

const resolveTopicStrength = (
  profile: SyntheticStudentProfile,
  questionIndex: number,
): number => {
  const topics = Object.keys(profile.topicStrengthMap).sort();
  const topicId = topics[questionIndex % topics.length];
  return profile.topicStrengthMap[topicId] ?? profile.baselineAbility;
};

const buildQuestionAttempt = (
  profile: SyntheticStudentProfile,
  questionId: string,
  questionIndex: number,
  questionCount: number,
  questionMeta: SubmissionQuestionMeta,
  timingProfileSnapshot: SessionTimingProfileSnapshot,
  random: () => number,
  startedAtMillis: number,
  cumulativeElapsedSeconds: number,
): SimulatedQuestionAttempt => {
  const timingKey =
    questionMeta.difficulty.toLowerCase() as "easy" | "medium" | "hard";
  const timingWindow = timingProfileSnapshot[timingKey];
  const progressFactor = questionCount <= 1 ?
    0 :
    questionIndex / (questionCount - 1);
  const topicStrength = resolveTopicStrength(profile, questionIndex);
  const effectiveAbility =
    (profile.baselineAbility * 0.55) + (topicStrength * 0.45);
  const difficultyPenalty =
    questionMeta.difficulty === "Hard" ? 0.27 :
      questionMeta.difficulty === "Medium" ? 0.15 :
        0.05;
  const fatiguePenalty = profile.fatigueFactor * progressFactor * 0.24;
  const disciplineBonus = profile.disciplineProfile * 0.12;
  const overconfidencePenalty =
    profile.overconfidenceScore *
    (questionMeta.difficulty === "Hard" ? 0.12 : 0.06);
  const correctnessProbability = clamp(
    effectiveAbility - difficultyPenalty - fatiguePenalty +
    disciplineBonus - overconfidencePenalty + ((random() - 0.5) * 0.12),
    0.05,
    0.97,
  );
  const skipProbability = clamp(
    ((1 - effectiveAbility) * 0.22) +
    (questionMeta.difficulty === "Hard" ? 0.1 : 0.04) +
    (profile.fatigueFactor * progressFactor * 0.1) -
    (profile.disciplineProfile * 0.08),
    0,
    0.45,
  );
  const minTimeLikelihood = clamp(
    (profile.impulsivenessScore * 0.55) +
    (profile.overconfidenceScore * 0.2) +
    ((1 - profile.disciplineProfile) * 0.15),
    0,
    0.9,
  );
  const maxTimeLikelihood = clamp(
    (profile.fatigueFactor * 0.4) +
    ((1 - effectiveAbility) * 0.25) +
    (
      (questionMeta.difficulty === "Hard" ? 0.2 : 0.08) *
      (1 - profile.disciplineProfile)
    ),
    0,
    0.9,
  );
  let timeSpent = timingWindow.min +
    ((timingWindow.max - timingWindow.min) * (0.35 + (random() * 0.4)));

  if (random() < minTimeLikelihood) {
    timeSpent = Math.max(5, timingWindow.min * (0.35 + (random() * 0.35)));
  } else if (random() < maxTimeLikelihood) {
    timeSpent = timingWindow.max * (1.05 + (random() * 0.35));
  }

  timeSpent = Number(timeSpent.toFixed(2));

  const enteredAt = startedAtMillis + (cumulativeElapsedSeconds * 1000);
  const exitedAt = enteredAt + Math.round(timeSpent * 1000);
  const shouldSkip = random() < skipProbability;

  if (shouldSkip) {
    return {
      timeRecord: {
        cumulativeTimeSpent: timeSpent,
        enteredAt,
        exitedAt,
        lastEntryTimestamp: enteredAt,
        maxTime: timingWindow.max,
        minTime: timingWindow.min,
      },
    };
  }

  const guessed = random() >
    correctnessProbability + (profile.disciplineProfile * 0.05);
  const isCorrect = !guessed && random() <= correctnessProbability;
  const selectedOption = isCorrect ?
    questionMeta.correctAnswer :
    QUESTION_OPTIONS.find(
      (option) => option !== questionMeta.correctAnswer,
    ) ??
      "A";

  return {
    answerRecord: {
      clientTimestamp: exitedAt,
      selectedOption,
      timeSpent,
    },
    timeRecord: {
      cumulativeTimeSpent: timeSpent,
      enteredAt,
      exitedAt,
      lastEntryTimestamp: enteredAt,
      maxTime: timingWindow.max,
      minTime: timingWindow.min,
    },
  };
};

const buildSyntheticSessionDocument = (
  instituteId: string,
  yearId: string,
  runDefinition: SyntheticRunDefinition,
  profile: SyntheticStudentProfile,
  simulationId: string,
): SyntheticSessionDocument => {
  const sessionId = buildSessionId(runDefinition.runId, profile.studentId);
  const random = createSeededRandom(
    `${simulationId}:${yearId}:${runDefinition.runId}:${profile.studentId}`,
  );
  const answerMap: Record<string, SyntheticAnswerRecord> = {};
  const questionTimeMap: SessionQuestionTimeMap = {};
  const baseTime = Date.UTC(Number(yearId) || 2026, 0, 15, 9, 0, 0);
  const runOffsetMillis =
    Number(runDefinition.runId.replace(/\D/g, "")) * 3_600_000;
  const studentOffsetMillis =
    Number(profile.studentId.replace(/\D/g, "")) * 60_000;
  const startedAtMillis = baseTime + runOffsetMillis + studentOffsetMillis;
  let cumulativeElapsedSeconds = 0;

  runDefinition.questionIds.forEach((questionId, questionIndex) => {
    const questionMeta = runDefinition.questionMetaById[questionId];
    const attempt = buildQuestionAttempt(
      profile,
      questionId,
      questionIndex,
      runDefinition.questionIds.length,
      questionMeta,
      runDefinition.timingProfileSnapshot,
      random,
      startedAtMillis,
      cumulativeElapsedSeconds,
    );

    questionTimeMap[questionId] = attempt.timeRecord;

    if (attempt.answerRecord) {
      answerMap[questionId] = attempt.answerRecord;
    }

    cumulativeElapsedSeconds += attempt.timeRecord.cumulativeTimeSpent;
  });

  const metrics = computeSubmissionMetrics({
    answerMap,
    phaseConfigSnapshot: runDefinition.phaseConfigSnapshot,
    questionIds: runDefinition.questionIds,
    questionMetaById: runDefinition.questionMetaById,
    questionTimeMap,
  });
  const createdAt = Timestamp.fromMillis(startedAtMillis - 30_000);
  const startedAt = Timestamp.fromMillis(startedAtMillis);
  const submittedAt = Timestamp.fromMillis(
    startedAtMillis + Math.round(cumulativeElapsedSeconds * 1000),
  );

  return {
    accuracyPercent: metrics.accuracyPercent,
    answerMap,
    consecutiveWrongStreakMax: metrics.consecutiveWrongStreakMax,
    createdAt,
    disciplineIndex: metrics.disciplineIndex,
    easyRemainingAfterPhase1Percent: metrics.easyRemainingAfterPhase1Percent,
    guessRate: metrics.guessRate,
    hardInPhase1Percent: metrics.hardInPhase1Percent,
    instituteId,
    maxTimeViolationPercent: metrics.maxTimeViolationPercent,
    minTimeViolationPercent: metrics.minTimeViolationPercent,
    mode: runDefinition.mode,
    phaseAdherencePercent: metrics.phaseAdherencePercent,
    questionTimeMap,
    rawScorePercent: metrics.rawScorePercent,
    riskState: metrics.riskState,
    runId: runDefinition.runId,
    sessionId,
    skipBurstCount: metrics.skipBurstCount,
    startedAt,
    status: "submitted",
    studentId: profile.studentId,
    studentUid: `sim_uid_${profile.studentId}`,
    submissionLock: false,
    submittedAt,
    timingProfileSnapshot: runDefinition.timingProfileSnapshot,
    updatedAt: submittedAt,
    version: 1,
    yearId,
  };
};

/**
 * Generates deterministic synthetic submitted sessions in sandbox namespaces.
 */
export class SimulationSessionGeneratorService {
  private readonly firestore = getFirestore();
  private readonly logger = createLogger("SimulationSessionGeneratorService");

  /**
   * Generates sandbox run and session data for a simulation environment.
   * @param {GenerateSyntheticSessionsInput} input Simulation request data.
   * @return {Promise<GenerateSyntheticSessionsResult>}
   * Synthetic session write result.
   */
  public async generateSyntheticSessions(
    input: GenerateSyntheticSessionsInput,
  ): Promise<GenerateSyntheticSessionsResult> {
    assertSimulationEnvironmentAllowed(input.nodeEnv);

    const simulationId = normalizeSimulationId(input.simulationId);
    const yearId = normalizeRequiredString(input.yearId, "yearId");
    const instituteId = `${SIMULATION_INSTITUTE_PREFIX}${simulationId}`;
    const institutePath = `${INSTITUTES_COLLECTION}/${instituteId}`;
    const studentsPath = `${institutePath}/${STUDENTS_COLLECTION}`;
    const sessionsRootPath =
      `${institutePath}/${ACADEMIC_YEARS_COLLECTION}/` +
      `${yearId}/${RUNS_COLLECTION}`;
    const environmentSnapshot = await this.firestore.doc(institutePath).get();

    if (!environmentSnapshot.exists) {
      throw new SimulationSessionGenerationValidationError(
        "NOT_FOUND",
        "Simulation environment must be initialized before generating " +
          "synthetic sessions.",
      );
    }

    const environmentData = environmentSnapshot.data();

    if (!isRecord(environmentData)) {
      throw new SimulationSessionGenerationValidationError(
        "VALIDATION_ERROR",
        "Simulation environment document must be a Firestore object.",
      );
    }

    const metadata = environmentData as SimulationEnvironmentDocument;
    const parameterSnapshot = isRecord(metadata.parameterSnapshot) ?
      metadata.parameterSnapshot :
      undefined;
    const runCount = normalizePositiveInteger(
      parameterSnapshot?.runCount,
      "parameterSnapshot.runCount",
    );
    const simulationVersion = normalizeRequiredString(
      metadata.simulationVersion,
      "simulationVersion",
    );
    const timingAggressiveness = normalizeTimingAggressiveness(
      parameterSnapshot?.timingAggressiveness,
    );
    const difficultyDistribution = normalizeDifficultyDistribution(
      parameterSnapshot?.difficultyDistribution,
    );
    const studentSnapshots = await this.firestore
      .collection(studentsPath)
      .get();
    const studentProfiles = studentSnapshots.docs
      .map((snapshot) => normalizeStudentProfile(snapshot.data()))
      .sort((left, right) => left.studentId.localeCompare(right.studentId));

    if (studentProfiles.length === 0) {
      throw new SimulationSessionGenerationValidationError(
        "NOT_FOUND",
        "Synthetic students must be generated before synthetic sessions.",
      );
    }

    const studentIds = studentProfiles.map((profile) => profile.studentId);
    const runDefinitions = Array.from({length: runCount}, (_value, runIndex) =>
      buildRunDefinition(
        instituteId,
        simulationId,
        yearId,
        runIndex,
        timingAggressiveness,
        difficultyDistribution,
      )
    );
    let existingRunCount = 0;
    let generatedRunCount = 0;
    let existingSessionCount = 0;
    let generatedSessionCount = 0;

    for (const runDefinition of runDefinitions) {
      try {
        await this.firestore.doc(runDefinition.path).create({
          endWindow: Timestamp.fromMillis(Date.now() + 86_400_000),
          mode: runDefinition.mode,
          phaseConfigSnapshot: runDefinition.phaseConfigSnapshot,
          questionIds: runDefinition.questionIds,
          recipientStudentIds: studentIds,
          runId: runDefinition.runId,
          startWindow: Timestamp.fromMillis(Date.now() - 86_400_000),
          status: "scheduled",
          testId: `sim_test_${runDefinition.runId}`,
          timingProfileSnapshot: runDefinition.timingProfileSnapshot,
        });
        generatedRunCount += 1;
      } catch (error) {
        const errorCode = isRecord(error) ? error.code : undefined;

        if (errorCode !== 6 && errorCode !== "already-exists") {
          throw error;
        }

        existingRunCount += 1;
      }

      const sessionReferences = studentProfiles.map((profile) =>
        this.firestore.doc(
          `${runDefinition.path}/${SESSIONS_COLLECTION}/` +
          `${buildSessionId(runDefinition.runId, profile.studentId)}`,
        )
      );

      for (const referenceChunk of chunkArray(
        sessionReferences,
        RUN_BATCH_SIZE,
      )) {
        const existingSnapshots = await this.firestore.getAll(
          ...referenceChunk,
        );
        const existingSessionIds = new Set(
          existingSnapshots
            .filter((snapshot) => snapshot.exists)
            .map((snapshot) => snapshot.id),
        );
        const createCandidates = referenceChunk.filter(
          (reference) => !existingSessionIds.has(reference.id),
        );

        existingSessionCount += existingSessionIds.size;

        for (const writeChunk of chunkArray(createCandidates, 400)) {
          if (writeChunk.length === 0) {
            continue;
          }

          const batch = this.firestore.batch();

          writeChunk.forEach((reference) => {
            const studentProfile = studentProfiles.find((profile) =>
              buildSessionId(runDefinition.runId, profile.studentId) ===
                reference.id
            );

            if (!studentProfile) {
              throw new SimulationSessionGenerationValidationError(
                "INTERNAL_ERROR",
                `Missing synthetic student profile for "${reference.id}".`,
              );
            }

            batch.create(
              reference,
              buildSyntheticSessionDocument(
                instituteId,
                yearId,
                runDefinition,
                studentProfile,
                simulationId,
              ),
            );
          });

          await batch.commit();
          generatedSessionCount += writeChunk.length;
        }
      }
    }

    this.logger.info("Synthetic session generation completed.", {
      existingRunCount,
      existingSessionCount,
      generatedRunCount,
      generatedSessionCount,
      instituteId,
      nodeEnv: input.nodeEnv,
      runCount,
      simulationId,
      simulationVersion,
      totalStudentCount: studentProfiles.length,
      yearId,
    });

    return {
      existingRunCount,
      existingSessionCount,
      generatedRunCount,
      generatedSessionCount,
      instituteId,
      runCount,
      sessionsRootPath,
      simulationId,
      simulationVersion,
      totalStudentCount: studentProfiles.length,
      yearId,
    };
  }
}

export const simulationSessionGeneratorService =
  new SimulationSessionGeneratorService();
