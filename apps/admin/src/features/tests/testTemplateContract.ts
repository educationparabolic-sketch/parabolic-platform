export const EXAM_TYPES = ["JEEMains", "NEET"] as const;
export const SELECTION_METHODS = [
  "manual",
  "shuffle_slice",
  "offset_limit",
  "round_robin",
  "upload_set",
] as const;
export const DIFFICULTY_LEVELS = ["easy", "medium", "hard"] as const;

export type ExamType = (typeof EXAM_TYPES)[number];
export type SelectionMethod = (typeof SELECTION_METHODS)[number];
export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number];

export interface QuestionBankRecord {
  academicYear: string;
  additionalTag: string;
  correctAnswer?: string;
  examType: string;
  id: string;
  lastUsedDate: string | null;
  uniqueKey: string;
  subject: string;
  chapter: string;
  difficulty: DifficultyLevel;
  marks: number;
  negativeMarks: number;
  prompt: string;
  primaryTag: string;
  questionImageFile?: string;
  questionType: string;
  secondaryTag: string;
  solutionImageFile: string;
  tutorialVideoLink: string;
  simulationLink: string;
  topic: string;
  internalNotes: string;
  uploadId?: string;
  uploadLabel?: string;
  usedCount: number;
  version: number;
  thermalState: "hot" | "warm" | "cold";
  status: "active" | "used" | "archived" | "deprecated";
}

export async function deriveCanonicalTemplateId(questionIds: string[]): Promise<string> {
  const canonicalInput = [...questionIds].sort().join("|");

  if (typeof window === "undefined" || typeof window.crypto?.subtle === "undefined") {
    return `canonical-${canonicalInput}`;
  }

  const encoded = new TextEncoder().encode(canonicalInput);
  const digest = await window.crypto.subtle.digest("SHA-256", encoded);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
