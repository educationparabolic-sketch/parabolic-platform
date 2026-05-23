/* eslint-disable require-jsdoc */
import {StandardApiErrorCode} from "./apiResponse";

export type AdminTestTemplateStatus =
  "draft" | "ready" | "assigned" | "archived" | "deprecated";

export type AdminTestSelectionMethod =
  "manual" | "shuffle_slice" | "offset_limit" | "round_robin";

export interface AdminTestDifficultyDistribution {
  easy: number;
  medium: number;
  hard: number;
}

export interface AdminTestTimingWindow {
  minSeconds: number;
  maxSeconds: number;
}

export interface AdminTestTimingProfile {
  easy: AdminTestTimingWindow;
  medium: AdminTestTimingWindow;
  hard: AdminTestTimingWindow;
}

export interface AdminTestExamSnapshot {
  defaultDurationMinutes: number;
  difficultyTimingMapping: AdminTestTimingProfile;
  markingScheme: string;
  sectionStructure: string[];
}

export interface AdminTestPhaseSplitRow {
  difficulty: "easy" | "medium" | "hard";
  focus: string;
  load: number;
  minutes: number;
  phase: string;
  percent: number;
  questionCount: number;
  weight: number;
}

export interface AdminTestPhaseConfigSnapshot {
  difficultyWeights: {
    easy: number;
    medium: number;
    hard: number;
  };
  phaseSplit: AdminTestPhaseSplitRow[];
  totalLoad: number;
}

export interface AdminTestTemplateRecord {
  id: string;
  canonicalId: string;
  templateName: string;
  examType: string;
  examSnapshot: AdminTestExamSnapshot;
  phaseConfigSnapshot: AdminTestPhaseConfigSnapshot;
  selectionMethod: AdminTestSelectionMethod;
  totalDurationMinutes: number;
  selectedQuestionIds: string[];
  difficultyDistribution: AdminTestDifficultyDistribution;
  timingProfile: AdminTestTimingProfile;
  status: AdminTestTemplateStatus;
  updatedAt: string;
}

export interface AdminTestsListRequest {
  instituteId: string;
  limit: number;
}

export interface AdminTestsCreateRequest {
  actorId: string;
  actorRole: string;
  canonicalId: string;
  difficultyDistribution: AdminTestDifficultyDistribution;
  examType: string;
  examSnapshot: AdminTestExamSnapshot;
  phaseConfigSnapshot: AdminTestPhaseConfigSnapshot;
  instituteId: string;
  ipAddress?: string;
  publish: boolean;
  questionIds: string[];
  selectionMethod: AdminTestSelectionMethod;
  templateName: string;
  timingProfile: AdminTestTimingProfile;
  totalDurationMinutes: number;
  userAgent?: string;
}

export interface AdminTestsCreateResult {
  template: AdminTestTemplateRecord;
}

export class AdminTestsValidationError extends Error {
  public readonly code: StandardApiErrorCode;

  constructor(code: StandardApiErrorCode, message: string) {
    super(message);
    this.name = "AdminTestsValidationError";
    this.code = code;
  }
}
