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
  calibrationVersion: string;
  capturedTemplateSnapshot: AssignmentTemplateSnapshot;
  licenseLayer: LicenseLayer;
  recipientCount: number;
  riskModelVersion: string;
  runPath: string;
  status: "scheduled";
  templateVersion: string;
  testPath: string;
}
