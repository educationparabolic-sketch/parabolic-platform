import type {
  ExamExecutionMode,
  ExamRuntimeQuestion,
  ExamRuntimeSnapshot,
  ExamRuntimeTimingProfileSnapshot,
} from "../../../shared/contracts/apiDtos";
import {buildQuestionAssetUrl} from "../../../shared/services/cdnAssetDelivery";

const DEV_MOCK_INSTITUTE_ID = "inst-dev-mock";
const DEV_MOCK_SESSION_START_DELAY_MS = 60_000;
const DEV_MOCK_EARLY_ENTRY_BUFFER_MINUTES = 1;

export function buildDevMockSessionSnapshot(
  sessionId: string,
  mode: ExamExecutionMode,
): ExamRuntimeSnapshot {
  const questions: ExamRuntimeQuestion[] = [
    {
      difficulty: "easy",
      id: "dev-physics-mcq",
      imageUrl: "",
      matrixColumns: [],
      matrixRows: [],
      media: null,
      number: 1,
      options: [
        {id: "A", label: "A", text: "v / r"},
        {id: "B", label: "B", text: "v² / r"},
        {id: "C", label: "C", text: "r / v²"},
        {id: "D", label: "D", text: "v² r"},
      ],
      section: "Physics",
      text: "A particle moves in a circle of radius r with constant speed v. What is the magnitude of centripetal acceleration?",
      type: "mcq",
    },
    {
      difficulty: "medium",
      id: "dev-chemistry-numeric",
      imageUrl: buildQuestionAssetUrl({
        instituteId: DEV_MOCK_INSTITUTE_ID,
        kind: "questionImage",
        questionId: "dev-chemistry-numeric",
        version: "v1",
      }),
      matrixColumns: [],
      matrixRows: [],
      media: null,
      number: 2,
      options: [],
      section: "Chemistry",
      text: "For pH = 3 solution, enter [H+] concentration in mol/L using decimal notation.",
      type: "numeric",
    },
    {
      difficulty: "hard",
      id: "dev-mathematics-matrix",
      imageUrl: "",
      matrixColumns: ["Equals 1", "Equals 2", "Exists", "Zero"],
      matrixRows: ["Determinant", "Trace", "Inverse"],
      media: null,
      number: 3,
      options: [],
      section: "Mathematics",
      text: "Select all statements that are true for a 2x2 identity matrix.",
      type: "matrix",
    },
  ];
  const timingProfile: ExamRuntimeTimingProfileSnapshot = {
    controlledSlowdownSeconds: 12,
    finalWindowMinutes: 10,
    hardModeRestrictSubmitUntilAllVisited: true,
    hardModeSequentialNavigation: true,
    maxTimeByDifficultySec: {easy: 180, hard: 300, medium: 240},
    minTimeByDifficultySec: {easy: 20, hard: 50, medium: 35},
    syncEveryMs: 10_000,
  };
  const sessionStartsAtMs = Date.now() + DEV_MOCK_SESSION_START_DELAY_MS;
  const durationMs = questions.reduce((total, question) =>
    total + timingProfile.maxTimeByDifficultySec[question.difficulty] * 1000, 0);
  const sessionEndsAtMs = sessionStartsAtMs + durationMs;

  return {
    difficultyDistribution: {
      easyPercent: 33.3333,
      hardPercent: 33.3333,
      mediumPercent: 33.3333,
    },
    hardModeRevisitRestricted: mode === "Hard",
    license: {
      currentLayer: mode === "Operational" ? "L0" : mode === "Diagnostic" ? "L1" : "L2",
      eligibilityFlags: {},
      featureFlags: {},
    },
    mode,
    phaseConfigSnapshot: {
      bufferPercent: 10,
      phase1Percent: 40,
      phase2Percent: 30,
      phase3Percent: 20,
    },
    proctoringPolicy: {
      browserIntegrityGuardEnabled: true,
      faceIdentityGazeGuardEnabled: true,
    },
    questionSetVersion: "dev-snapshot-v1",
    questions,
    schedule: {
      durationMs,
      earlyEntryBufferMinutes: DEV_MOCK_EARLY_ENTRY_BUFFER_MINUTES,
      earlyEntryOpensAt: new Date(
        sessionStartsAtMs - DEV_MOCK_EARLY_ENTRY_BUFFER_MINUTES * 60_000,
      ).toISOString(),
      sessionEndsAt: new Date(sessionEndsAtMs).toISOString(),
      sessionStartsAt: new Date(sessionStartsAtMs).toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    },
    sessionId,
    subjects: ["Physics", "Chemistry", "Mathematics"],
    timingProfile,
  };
}
