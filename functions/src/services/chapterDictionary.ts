import {FieldValue, Transaction} from "firebase-admin/firestore";
import {createLogger} from "./logging";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  ChapterDictionaryEntry,
  ChapterDictionaryUpdateInput,
  ChapterDictionaryUpdateResult,
} from "../types/chapterDictionary";

const INSTITUTES_COLLECTION = "institutes";
const CHAPTER_DICTIONARY_COLLECTION = "chapterDictionary";

/**
 * Raised when chapter dictionary payload validation fails.
 */
class ChapterDictionaryValidationError extends Error {
  /**
   * @param {string} message Validation failure detail.
   */
  constructor(message: string) {
    super(message);
    this.name = "ChapterDictionaryValidationError";
  }
}

const normalizeRequiredString = (value: unknown, fieldName: string): string => {
  if (typeof value !== "string") {
    throw new ChapterDictionaryValidationError(
      `Chapter dictionary field "${fieldName}" must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new ChapterDictionaryValidationError(
      `Chapter dictionary field "${fieldName}" must be a non-empty string.`,
    );
  }

  return normalizedValue;
};

const normalizeChapterName = (value: unknown): string =>
  normalizeRequiredString(value, "chapterName")
    .toLowerCase()
    .replace(/\s+/g, " ");

const normalizeSubject = (value: unknown): string =>
  normalizeRequiredString(value, "subject")
    .toLowerCase()
    .replace(/\s+/g, " ");

const buildChapterId = (chapterName: string): string =>
  encodeURIComponent(chapterName);

const getChapterPath = (instituteId: string, chapterId: string): string =>
  `${INSTITUTES_COLLECTION}/${instituteId}/` +
  `${CHAPTER_DICTIONARY_COLLECTION}/${chapterId}`;

const normalizeInput = (
  input: ChapterDictionaryUpdateInput,
): {instituteId: string; chapterName: string; subject: string} => ({
  chapterName: normalizeChapterName(input.chapterName),
  instituteId: normalizeRequiredString(input.instituteId, "instituteId"),
  subject: normalizeSubject(input.subject),
});

/**
 * Maintains institute-scoped chapter autocomplete metadata.
 */
export class ChapterDictionaryService {
  private readonly logger = createLogger("ChapterDictionaryService");
  private readonly firestore = getFirestore();

  /**
   * Increments usage for one normalized chapter dictionary entry.
   * @param {ChapterDictionaryUpdateInput} input Chapter dictionary input.
   * @return {Promise<ChapterDictionaryUpdateResult>} Updated chapter entry.
   */
  public async incrementUsageCount(
    input: ChapterDictionaryUpdateInput,
  ): Promise<ChapterDictionaryUpdateResult> {
    const normalizedInput = normalizeInput(input);

    const pendingEntry = await this.firestore.runTransaction(
      async (transaction): Promise<ChapterDictionaryEntry> =>
        this.incrementUsageCountWithTransaction(transaction, normalizedInput),
    );
    const snapshot = await this.firestore.doc(pendingEntry.path).get();
    const persistedUsageCount = Number(snapshot.data()?.usageCount);
    const entry: ChapterDictionaryEntry = {
      ...pendingEntry,
      usageCount: Number.isFinite(persistedUsageCount) ?
        persistedUsageCount :
        pendingEntry.usageCount,
    };

    this.logger.info("Chapter dictionary usage updated", {
      chapterName: entry.chapterName,
      instituteId: normalizedInput.instituteId,
      path: entry.path,
      subject: entry.subject,
      usageCount: entry.usageCount,
    });

    return {entry};
  }

  /**
   * Transaction-safe chapter usage increment without transaction reads.
   * @param {Transaction} transaction Active Firestore transaction.
   * @param {ChapterDictionaryUpdateInput} input Chapter dictionary input.
   * @return {Promise<ChapterDictionaryEntry>} Updated chapter entry metadata.
   */
  public async incrementUsageCountWithTransaction(
    transaction: Transaction,
    input: ChapterDictionaryUpdateInput,
  ): Promise<ChapterDictionaryEntry> {
    const normalizedInput = normalizeInput(input);

    const chapterId = buildChapterId(normalizedInput.chapterName);
    const path = getChapterPath(normalizedInput.instituteId, chapterId);
    const reference = this.firestore.doc(path);

    transaction.set(reference, {
      chapterName: normalizedInput.chapterName,
      subject: normalizedInput.subject,
      usageCount: FieldValue.increment(1),
    }, {merge: true});

    return {
      chapterId,
      chapterName: normalizedInput.chapterName,
      path,
      subject: normalizedInput.subject,
      usageCount: 0,
    };
  }
}

export const chapterDictionaryService = new ChapterDictionaryService();
