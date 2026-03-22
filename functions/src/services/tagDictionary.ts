import {Transaction} from "firebase-admin/firestore";
import {createLogger} from "./logging";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  TagDictionaryEntry,
  TagDictionaryUpdateInput,
  TagDictionaryUpdateResult,
} from "../types/tagDictionary";

const INSTITUTES_COLLECTION = "institutes";
const TAG_DICTIONARY_COLLECTION = "tagDictionary";

class TagDictionaryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TagDictionaryValidationError";
  }
}

const normalizeRequiredString = (value: unknown, fieldName: string): string => {
  if (typeof value !== "string") {
    throw new TagDictionaryValidationError(
      `Tag dictionary field "${fieldName}" must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new TagDictionaryValidationError(
      `Tag dictionary field "${fieldName}" must be a non-empty string.`,
    );
  }

  return normalizedValue;
};

const normalizeTagName = (value: unknown): string =>
  normalizeRequiredString(value, "tags[]")
    .toLowerCase()
    .replace(/\s+/g, " ");

const buildTagId = (tagName: string): string => encodeURIComponent(tagName);

const getTagPath = (instituteId: string, tagId: string): string =>
  `${INSTITUTES_COLLECTION}/${instituteId}/` +
  `${TAG_DICTIONARY_COLLECTION}/${tagId}`;

const normalizeInput = (
  input: TagDictionaryUpdateInput,
): {instituteId: string; tags: string[]} => {
  const instituteId = normalizeRequiredString(input.instituteId, "instituteId");
  const normalizedTags = Array.from(new Set(input.tags.map(normalizeTagName)));

  return {
    instituteId,
    tags: normalizedTags,
  };
};

export class TagDictionaryService {
  private readonly logger = createLogger("TagDictionaryService");
  private readonly firestore = getFirestore();

  public async incrementUsageCounts(
    input: TagDictionaryUpdateInput,
  ): Promise<TagDictionaryUpdateResult> {
    const normalizedInput = normalizeInput(input);

    if (!normalizedInput.tags.length) {
      return {entries: []};
    }

    const entries = await this.firestore.runTransaction(
      async (transaction): Promise<TagDictionaryEntry[]> =>
        this.incrementUsageCountsWithTransaction(transaction, normalizedInput),
    );

    this.logger.info("Tag dictionary usage updated", {
      entryCount: entries.length,
      instituteId: normalizedInput.instituteId,
      tagNames: entries.map((entry) => entry.tagName),
    });

    return {entries};
  }

  public async incrementUsageCountsWithTransaction(
    transaction: Transaction,
    input: TagDictionaryUpdateInput,
  ): Promise<TagDictionaryEntry[]> {
    const normalizedInput = normalizeInput(input);

    if (!normalizedInput.tags.length) {
      return [];
    }

    const tagReferences = normalizedInput.tags.map((tagName) => {
      const tagId = buildTagId(tagName);
      const path = getTagPath(normalizedInput.instituteId, tagId);
      return {
        path,
        reference: this.firestore.doc(path),
        tagId,
        tagName,
      };
    });

    const snapshots = await Promise.all(
      tagReferences.map(({reference}) => transaction.get(reference)),
    );

    return tagReferences.map((tagReference, index) => {
      const snapshot = snapshots[index];
      const existingUsageCount = snapshot.exists ?
        Number(snapshot.data()?.usageCount) :
        0;
      const usageCount = Number.isFinite(existingUsageCount) &&
        existingUsageCount >= 0 ?
        existingUsageCount + 1 :
        1;

      transaction.set(tagReference.reference, {
        tagName: tagReference.tagName,
        usageCount,
      });

      return {
        path: tagReference.path,
        tagId: tagReference.tagId,
        tagName: tagReference.tagName,
        usageCount,
      };
    });
  }
}

export const tagDictionaryService = new TagDictionaryService();
