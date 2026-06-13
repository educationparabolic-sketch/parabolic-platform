export interface PhaseTimingWindow {
  max: number;
  min: number;
  recommended: number;
}

export interface DifficultyTimingProfile {
  easy: PhaseTimingWindow;
  hard: PhaseTimingWindow;
  medium: PhaseTimingWindow;
}

export interface PhasePercentages {
  phase1Percent: number;
  phase2Percent: number;
  phase3Percent: number;
}

export interface QuestionPhaseTimingRuleSet {
  buffer: PhaseTimingWindow;
  phase1: PhaseTimingWindow;
  phase2: PhaseTimingWindow;
  phase3: PhaseTimingWindow;
}

export type TimingDifficultyKey = keyof DifficultyTimingProfile;

const roundToTwoDecimals = (value: number): number =>
  Math.round(value * 100) / 100;

const clampPercent = (value: number): number =>
  Math.max(0, Math.min(100, roundToTwoDecimals(value)));

const normalizeRecommended = (window: {
  max: number;
  min: number;
  recommended?: number;
}): number => {
  if (
    typeof window.recommended === "number" &&
    Number.isFinite(window.recommended)
  ) {
    return window.recommended;
  }

  return roundToTwoDecimals((window.min + window.max) / 2);
};

const allocateWindow = (
  window: PhaseTimingWindow,
  percent: number,
): PhaseTimingWindow => {
  const multiplier = clampPercent(percent) / 100;

  return {
    max: roundToTwoDecimals(window.max * multiplier),
    min: roundToTwoDecimals(window.min * multiplier),
    recommended: roundToTwoDecimals(window.recommended * multiplier),
  };
};

export const normalizeDifficultyTimingProfile = (
  profile: {
    easy: {max: number; min: number; recommended?: number};
    hard: {max: number; min: number; recommended?: number};
    medium: {max: number; min: number; recommended?: number};
  },
): DifficultyTimingProfile => ({
  easy: {
    max: roundToTwoDecimals(profile.easy.max),
    min: roundToTwoDecimals(profile.easy.min),
    recommended: roundToTwoDecimals(normalizeRecommended(profile.easy)),
  },
  hard: {
    max: roundToTwoDecimals(profile.hard.max),
    min: roundToTwoDecimals(profile.hard.min),
    recommended: roundToTwoDecimals(normalizeRecommended(profile.hard)),
  },
  medium: {
    max: roundToTwoDecimals(profile.medium.max),
    min: roundToTwoDecimals(profile.medium.min),
    recommended: roundToTwoDecimals(normalizeRecommended(profile.medium)),
  },
});

export const buildQuestionPhaseTimingRuleSet = (
  difficulty: TimingDifficultyKey,
  timingProfile: DifficultyTimingProfile,
  phasePercentages: PhasePercentages,
): QuestionPhaseTimingRuleSet => {
  const difficultyWindow = timingProfile[difficulty];

  return {
    buffer: {
      max: 0,
      min: 0,
      recommended: 0,
    },
    phase1: allocateWindow(difficultyWindow, phasePercentages.phase1Percent),
    phase2: allocateWindow(difficultyWindow, phasePercentages.phase2Percent),
    phase3: allocateWindow(difficultyWindow, phasePercentages.phase3Percent),
  };
};
