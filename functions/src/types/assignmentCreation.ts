import {
  TemplateDifficultyDistribution,
  TemplatePhaseConfigSnapshot,
  TemplateTimingProfile,
} from "./templateCreation";

export type AssignmentMode =
  "Operational" |
  "Diagnostic" |
  "Controlled" |
  "Hard";

export type LicenseLayer = "L0" | "L1" | "L2" | "L3";

export interface AssignmentCreationContext {
  instituteId: string;
  runId: string;
  yearId: string;
}

export interface AssignmentTemplateSnapshot {
  difficultyDistribution: TemplateDifficultyDistribution;
  phaseConfigSnapshot: TemplatePhaseConfigSnapshot;
  questionIds: string[];
  timingProfileSnapshot: TemplateTimingProfile;
}

export interface AssignmentCreationResult {
  capturedTemplateSnapshot: AssignmentTemplateSnapshot;
  recipientCount: number;
  runPath: string;
  status: "scheduled";
  testPath: string;
}
