export const EXAM_TYPES = ["JEEMains", "NEET"] as const;
export const SELECTION_METHODS = ["manual", "shuffle_slice", "offset_limit", "round_robin"] as const;
export const DIFFICULTY_LEVELS = ["easy", "medium", "hard"] as const;

export type ExamType = (typeof EXAM_TYPES)[number];
export type SelectionMethod = (typeof SELECTION_METHODS)[number];
export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number];

export interface QuestionBankRecord {
  academicYear: string;
  additionalTag: string;
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
  questionType: string;
  secondaryTag: string;
  usedCount: number;
  version: number;
  thermalState: "hot" | "warm" | "cold";
  status: "active" | "used" | "archived" | "deprecated";
}

export const QUESTION_BANK: QuestionBankRecord[] = [
  {
    academicYear: "2026-27",
    additionalTag: "jee-main",
    examType: "JEEMains",
    id: "q-101",
    lastUsedDate: "2026-05-10",
    uniqueKey: "PH-KIN-001",
    subject: "Physics",
    chapter: "Kinematics",
    difficulty: "easy",
    marks: 4,
    negativeMarks: 1,
    prompt: "Uniform acceleration and displacement relation",
    primaryTag: "motion",
    questionType: "MCQ",
    secondaryTag: "basics",
    usedCount: 3,
    version: 2,
    thermalState: "hot",
    status: "active",
  },
  {
    academicYear: "2026-27",
    additionalTag: "jee-main",
    examType: "JEEMains",
    id: "q-102",
    lastUsedDate: null,
    uniqueKey: "PH-LOM-002",
    subject: "Physics",
    chapter: "Laws of Motion",
    difficulty: "medium",
    marks: 4,
    negativeMarks: 1,
    prompt: "Block and pulley force balance",
    primaryTag: "dynamics",
    questionType: "MCQ",
    secondaryTag: "force",
    usedCount: 0,
    version: 1,
    thermalState: "warm",
    status: "active",
  },
  {
    academicYear: "2026-27",
    additionalTag: "jee-advanced",
    examType: "JEEMains",
    id: "q-103",
    lastUsedDate: "2026-04-28",
    uniqueKey: "PH-ELE-003",
    subject: "Physics",
    chapter: "Electrostatics",
    difficulty: "hard",
    marks: 4,
    negativeMarks: 1,
    prompt: "Potential due to charged ring on axis",
    primaryTag: "electrostatics",
    questionType: "Integer",
    secondaryTag: "advanced",
    usedCount: 1,
    version: 1,
    thermalState: "hot",
    status: "active",
  },
  {
    academicYear: "2026-27",
    additionalTag: "neet",
    examType: "NEET",
    id: "q-104",
    lastUsedDate: null,
    uniqueKey: "CH-MOL-004",
    subject: "Chemistry",
    chapter: "Mole Concept",
    difficulty: "easy",
    marks: 4,
    negativeMarks: 1,
    prompt: "Molarity and dilution",
    primaryTag: "stoichiometry",
    questionType: "MCQ",
    secondaryTag: "foundation",
    usedCount: 0,
    version: 1,
    thermalState: "warm",
    status: "active",
  },
  {
    academicYear: "2026-27",
    additionalTag: "neet",
    examType: "NEET",
    id: "q-105",
    lastUsedDate: "2026-05-02",
    uniqueKey: "CH-THM-005",
    subject: "Chemistry",
    chapter: "Thermodynamics",
    difficulty: "medium",
    marks: 4,
    negativeMarks: 1,
    prompt: "Sign convention for heat and work",
    primaryTag: "thermo",
    questionType: "MCQ",
    secondaryTag: "conceptual",
    usedCount: 2,
    version: 1,
    thermalState: "hot",
    status: "active",
  },
  {
    academicYear: "2025-26",
    additionalTag: "neet-repeaters",
    examType: "NEET",
    id: "q-106",
    lastUsedDate: null,
    uniqueKey: "CH-ORG-006",
    subject: "Chemistry",
    chapter: "Organic Chemistry",
    difficulty: "hard",
    marks: 4,
    negativeMarks: 1,
    prompt: "Reaction mechanism selection",
    primaryTag: "organic",
    questionType: "Assertion Reason",
    secondaryTag: "mechanism",
    usedCount: 0,
    version: 1,
    thermalState: "warm",
    status: "active",
  },
  {
    academicYear: "2026-27",
    additionalTag: "jee-main",
    examType: "JEEMains",
    id: "q-107",
    lastUsedDate: "2026-05-12",
    uniqueKey: "MA-QUA-007",
    subject: "Mathematics",
    chapter: "Quadratic Equations",
    difficulty: "easy",
    marks: 4,
    negativeMarks: 1,
    prompt: "Roots and coefficient relation",
    primaryTag: "algebra",
    questionType: "MCQ",
    secondaryTag: "roots",
    usedCount: 4,
    version: 2,
    thermalState: "hot",
    status: "active",
  },
  {
    academicYear: "2026-27",
    additionalTag: "jee-main",
    examType: "JEEMains",
    id: "q-108",
    lastUsedDate: "2026-04-20",
    uniqueKey: "MA-FUN-008",
    subject: "Mathematics",
    chapter: "Functions",
    difficulty: "medium",
    marks: 4,
    negativeMarks: 1,
    prompt: "Domain and range mapping",
    primaryTag: "functions",
    questionType: "MCQ",
    secondaryTag: "mapping",
    usedCount: 1,
    version: 1,
    thermalState: "hot",
    status: "active",
  },
  {
    academicYear: "2025-26",
    additionalTag: "jee-advanced",
    examType: "Other",
    id: "q-109",
    lastUsedDate: null,
    uniqueKey: "MA-INT-009",
    subject: "Mathematics",
    chapter: "Definite Integration",
    difficulty: "hard",
    marks: 4,
    negativeMarks: 1,
    prompt: "Area under transformed curve",
    primaryTag: "calculus",
    questionType: "Integer",
    secondaryTag: "definite-integral",
    usedCount: 0,
    version: 1,
    thermalState: "warm",
    status: "active",
  },
  {
    academicYear: "2026-27",
    additionalTag: "jee-main",
    examType: "JEEMains",
    id: "q-110",
    lastUsedDate: null,
    uniqueKey: "PH-OPT-010",
    subject: "Physics",
    chapter: "Ray Optics",
    difficulty: "medium",
    marks: 4,
    negativeMarks: 1,
    prompt: "Lens formula and image formation",
    primaryTag: "optics",
    questionType: "MCQ",
    secondaryTag: "application",
    usedCount: 0,
    version: 1,
    thermalState: "cold",
    status: "active",
  },
  {
    academicYear: "2025-26",
    additionalTag: "neet-repeaters",
    examType: "NEET",
    id: "q-111",
    lastUsedDate: null,
    uniqueKey: "CH-ION-011",
    subject: "Chemistry",
    chapter: "Ionic Equilibrium",
    difficulty: "hard",
    marks: 4,
    negativeMarks: 1,
    prompt: "pH from mixed weak acid/base",
    primaryTag: "equilibrium",
    questionType: "Numerical",
    secondaryTag: "advanced",
    usedCount: 0,
    version: 1,
    thermalState: "cold",
    status: "active",
  },
  {
    academicYear: "2026-27",
    additionalTag: "jee-main",
    examType: "JEEMains",
    id: "q-112",
    lastUsedDate: null,
    uniqueKey: "MA-PNC-012",
    subject: "Mathematics",
    chapter: "Permutation and Combination",
    difficulty: "medium",
    marks: 4,
    negativeMarks: 1,
    prompt: "Arrangement constraints with repetition",
    primaryTag: "combinatorics",
    questionType: "MCQ",
    secondaryTag: "counting",
    usedCount: 0,
    version: 1,
    thermalState: "warm",
    status: "active",
  },
];

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
