import {Query} from "firebase-admin/firestore";
import {createLogger} from "./logging";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  ChapterAutocompleteRequest,
  ChapterAutocompleteResult,
  ChapterAutocompleteSuggestion,
  TagAutocompleteRequest,
  TagAutocompleteResult,
  TagAutocompleteSuggestion,
} from "../types/autocompleteMetadata";
import {SearchActorRole} from "../types/searchArchitecture";

const INSTITUTES_COLLECTION = "institutes";
const TAG_DICTIONARY_COLLECTION = "tagDictionary";
const CHAPTER_DICTIONARY_COLLECTION = "chapterDictionary";
const DEFAULT_AUTOCOMPLETE_LIMIT = 10;
const MAX_AUTOCOMPLETE_LIMIT = 20;
const TAG_SUFFIX = "\uf8ff";
const AUTOCOMPLETE_ROLES: SearchActorRole[] = ["teacher", "admin", "internal"];

/**
 * Raised when autocomplete metadata queries fail validation.
 */
class AutocompleteMetadataValidationError extends Error {
  /**
   * @param {string} message Validation failure detail.
   */
  constructor(message: string) {
    super(message);
    this.name = "AutocompleteMetadataValidationError";
  }
}

const normalizeRequiredString = (
  value: unknown,
  fieldName: string,
): string => {
  if (typeof value !== "string") {
    throw new AutocompleteMetadataValidationError(
      `Autocomplete field "${fieldName}" must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new AutocompleteMetadataValidationError(
      `Autocomplete field "${fieldName}" must be a non-empty string.`,
    );
  }

  return normalizedValue;
};

const normalizeSearchString = (
  value: unknown,
  fieldName: string,
): string => normalizeRequiredString(value, fieldName)
  .toLowerCase()
  .replace(/\s+/g, " ");

const normalizeLimit = (value: unknown): number => {
  if (value === undefined) {
    return DEFAULT_AUTOCOMPLETE_LIMIT;
  }

  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_AUTOCOMPLETE_LIMIT
  ) {
    throw new AutocompleteMetadataValidationError(
      "Autocomplete limit must be an integer between 1 and " +
      `${MAX_AUTOCOMPLETE_LIMIT}.`,
    );
  }

  return value;
};

const normalizeActorRole = (value: unknown): SearchActorRole => {
  const actorRole =
    normalizeRequiredString(value, "actorRole") as SearchActorRole;

  if (!AUTOCOMPLETE_ROLES.includes(actorRole)) {
    throw new AutocompleteMetadataValidationError(
      `Role "${actorRole}" cannot access autocomplete metadata.`,
    );
  }

  return actorRole;
};

const normalizeTagRequest = (request: TagAutocompleteRequest) => ({
  actorRole: normalizeActorRole(request.actorRole),
  instituteId: normalizeRequiredString(request.instituteId, "instituteId"),
  limit: normalizeLimit(request.limit),
  query: normalizeSearchString(request.query, "query"),
});

const normalizeChapterRequest = (request: ChapterAutocompleteRequest) => ({
  actorRole: normalizeActorRole(request.actorRole),
  instituteId: normalizeRequiredString(request.instituteId, "instituteId"),
  limit: normalizeLimit(request.limit),
  query: normalizeSearchString(request.query, "query"),
  subject: request.subject === undefined ?
    undefined :
    normalizeSearchString(request.subject, "subject"),
});

const getTagCollectionPath = (instituteId: string): string =>
  `${INSTITUTES_COLLECTION}/${instituteId}/${TAG_DICTIONARY_COLLECTION}`;

const getChapterCollectionPath = (instituteId: string): string =>
  `${INSTITUTES_COLLECTION}/${instituteId}/${CHAPTER_DICTIONARY_COLLECTION}`;

const buildPrefixEnd = (value: string): string => `${value}${TAG_SUFFIX}`;

const getNumber = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

/**
 * Reads small institute-scoped metadata collections for autocomplete flows.
 */
export class AutocompleteMetadataService {
  private readonly firestore = getFirestore();
  private readonly logger = createLogger("AutocompleteMetadataService");

  /**
   * Returns prefix-matched tag suggestions from the tag dictionary.
   * @param {TagAutocompleteRequest} request Tag autocomplete request.
   * @return {Promise<TagAutocompleteResult>} Matched tag suggestions.
   */
  public async getTagSuggestions(
    request: TagAutocompleteRequest,
  ): Promise<TagAutocompleteResult> {
    const normalizedRequest = normalizeTagRequest(request);
    const collectionPath = getTagCollectionPath(normalizedRequest.instituteId);

    const snapshot = await this.firestore
      .collection(collectionPath)
      .orderBy("tagName")
      .startAt(normalizedRequest.query)
      .endAt(buildPrefixEnd(normalizedRequest.query))
      .limit(normalizedRequest.limit)
      .get();

    const suggestions = snapshot.docs.map((documentSnapshot) => {
      const payload = documentSnapshot.data();
      const tagName = normalizeSearchString(payload.tagName, "tagName");

      return {
        path: documentSnapshot.ref.path,
        tagId: documentSnapshot.id,
        tagName,
        usageCount: getNumber(payload.usageCount),
      } satisfies TagAutocompleteSuggestion;
    });

    this.logger.info("Tag autocomplete query completed", {
      actorRole: normalizedRequest.actorRole,
      instituteId: normalizedRequest.instituteId,
      limit: normalizedRequest.limit,
      query: normalizedRequest.query,
      resultCount: suggestions.length,
    });

    return {suggestions};
  }

  /**
   * Returns prefix-matched chapter suggestions from the chapter dictionary.
   * @param {ChapterAutocompleteRequest} request Chapter autocomplete request.
   * @return {Promise<ChapterAutocompleteResult>} Matched chapters.
   */
  public async getChapterSuggestions(
    request: ChapterAutocompleteRequest,
  ): Promise<ChapterAutocompleteResult> {
    const normalizedRequest = normalizeChapterRequest(request);
    const collectionPath = getChapterCollectionPath(
      normalizedRequest.instituteId,
    );
    let query:
    Query<FirebaseFirestore.DocumentData> =
      this.firestore.collection(collectionPath);

    if (normalizedRequest.subject) {
      query = query.where("subject", "==", normalizedRequest.subject);
    }

    const snapshot = await query
      .orderBy("chapterName")
      .startAt(normalizedRequest.query)
      .endAt(buildPrefixEnd(normalizedRequest.query))
      .limit(normalizedRequest.limit)
      .get();

    const suggestions = snapshot.docs.map((documentSnapshot) => {
      const payload = documentSnapshot.data();
      const chapterName = normalizeSearchString(
        payload.chapterName,
        "chapterName",
      );
      const subject = normalizeSearchString(payload.subject, "subject");

      return {
        chapterId: documentSnapshot.id,
        chapterName,
        path: documentSnapshot.ref.path,
        subject,
        usageCount: getNumber(payload.usageCount),
      } satisfies ChapterAutocompleteSuggestion;
    });

    this.logger.info("Chapter autocomplete query completed", {
      actorRole: normalizedRequest.actorRole,
      instituteId: normalizedRequest.instituteId,
      limit: normalizedRequest.limit,
      query: normalizedRequest.query,
      resultCount: suggestions.length,
      subject: normalizedRequest.subject ?? null,
    });

    return {suggestions};
  }
}

export const autocompleteMetadataService = new AutocompleteMetadataService();
