import { QUESTION_BANK_FIXTURE_DATA } from "./testTemplateFixtureData";

export {
  DIFFICULTY_LEVELS,
  EXAM_TYPES,
  SELECTION_METHODS,
  deriveCanonicalTemplateId,
} from "./testTemplateContract";
export type {
  DifficultyLevel,
  ExamType,
  QuestionBankRecord,
  SelectionMethod,
} from "./testTemplateContract";

// Vite replaces this expression at build time. Rollup can then remove the
// fixture payload import completely from live release artifacts while local
// fixture builds retain the existing deterministic question bank.
export const QUESTION_BANK =
  import.meta.env.VITE_DATA_MODE === "fixture" ? QUESTION_BANK_FIXTURE_DATA : [];
