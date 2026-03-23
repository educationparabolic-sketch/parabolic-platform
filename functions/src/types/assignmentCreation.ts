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

export interface AssignmentCreationResult {
  recipientCount: number;
  runPath: string;
  status: "scheduled";
  testPath: string;
}
