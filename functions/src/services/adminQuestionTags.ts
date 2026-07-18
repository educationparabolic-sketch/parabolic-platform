import {Timestamp, WriteBatch} from "firebase-admin/firestore";
import {getFirestore} from "../utils/firebaseAdmin";
import {QuestionBankDocument} from "../types/questionIngestion";
import {
  AdminQuestionTagActionType,
  AdminQuestionTagRecord,
  AdminQuestionTagsMutationRequest,
  AdminQuestionTagsReadRequest,
  AdminQuestionTagsResult,
  AdminQuestionTagsValidationError,
} from "../types/adminQuestionTags";

const INSTITUTES_COLLECTION = "institutes";
const QUESTION_BANK_COLLECTION = "questionBank";
const TAG_DICTIONARY_COLLECTION = "tagDictionary";
const WRITE_BATCH_LIMIT = 400;

type QuestionTagDocumentStatus = "active" | "deprecated";

interface TagDictionaryDocument {
  status: QuestionTagDocumentStatus;
  tagName: string;
  updatedAt: FirebaseFirestore.Timestamp;
}

interface QuestionTagDocument {
  id: string;
  primaryTag: string | null;
  status: QuestionBankDocument["status"];
  tags: string[];
  usedCount: number;
}

function normalizeRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AdminQuestionTagsValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a non-empty string.`,
    );
  }

  return value.trim();
}

function normalizeTagName(value: unknown, fieldName: string): string {
  return normalizeRequiredString(value, fieldName)
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeOptionalTagName(
  value: unknown,
  fieldName: string,
): string | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }

  return normalizeTagName(value, fieldName);
}

function normalizeActionType(value: unknown): AdminQuestionTagActionType {
  if (
    value === "create" ||
    value === "rename" ||
    value === "merge" ||
    value === "deprecate"
  ) {
    return value;
  }

  throw new AdminQuestionTagsValidationError(
    "VALIDATION_ERROR",
    "Field \"actionType\" is not supported.",
  );
}

function buildTagId(tagName: string): string {
  return encodeURIComponent(tagName);
}

function dedupeTags(tags: string[]): string[] {
  return Array.from(new Set(tags.filter((tag) => tag.length > 0)));
}

function normalizeQuestionTagDocument(
  snapshot: FirebaseFirestore.QueryDocumentSnapshot,
): QuestionTagDocument {
  const payload = snapshot.data();
  const primaryTag =
    typeof payload.primaryTag === "string" && payload.primaryTag.trim().length > 0 ?
      normalizeTagName(payload.primaryTag, "primaryTag") :
      null;
  const tags = Array.isArray(payload.tags) ?
    dedupeTags(
      payload.tags
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) => normalizeTagName(tag, "tags[]")),
    ) :
    [];
  const usedCount =
    typeof payload.usedCount === "number" &&
      Number.isFinite(payload.usedCount) &&
      payload.usedCount >= 0 ?
      payload.usedCount :
      0;

  return {
    id: snapshot.id,
    primaryTag,
    status:
      payload.status === "deprecated" ||
        payload.status === "archived" ||
        payload.status === "used" ||
        payload.status === "active" ?
        payload.status :
        "active",
    tags,
    usedCount,
  };
}

function normalizeTagDictionaryDocument(
  snapshot: FirebaseFirestore.QueryDocumentSnapshot,
): TagDictionaryDocument {
  const payload = snapshot.data();

  return {
    status: payload.status === "deprecated" ? "deprecated" : "active",
    tagName: normalizeTagName(payload.tagName ?? snapshot.id, "tagName"),
    updatedAt:
      payload.updatedAt instanceof Timestamp ?
        payload.updatedAt :
        Timestamp.fromDate(new Date(0)),
  };
}

function collectQuestionTags(question: QuestionTagDocument): string[] {
  const tags = question.primaryTag ? [question.primaryTag, ...question.tags] : question.tags;
  return dedupeTags(tags);
}

function replaceQuestionTags(
  question: QuestionTagDocument,
  sourceTag: string,
  destinationTag: string,
): {primaryTag: string | null; tags: string[]} | null {
  const currentTags = collectQuestionTags(question);
  if (!currentTags.includes(sourceTag)) {
    return null;
  }

  const nextPrimaryTag =
    question.primaryTag === sourceTag ?
      destinationTag :
      question.primaryTag;
  const nextTags = dedupeTags(
    currentTags.map((tag) => tag === sourceTag ? destinationTag : tag),
  );

  return {
    primaryTag: nextPrimaryTag,
    tags: nextTags,
  };
}

function buildTagInventory(
  tagDictionary: TagDictionaryDocument[],
  questionDocuments: QuestionTagDocument[],
): AdminQuestionTagRecord[] {
  const tagMap = new Map<string, AdminQuestionTagRecord>();

  tagDictionary.forEach((tagDocument) => {
    tagMap.set(tagDocument.tagName, {
      id: buildTagId(tagDocument.tagName),
      name: tagDocument.tagName,
      questionCount: 0,
      status: tagDocument.status,
      usedInActiveTemplate: false,
    });
  });

  questionDocuments.forEach((question) => {
    collectQuestionTags(question).forEach((tagName) => {
      const existing = tagMap.get(tagName);
      const nextRecord: AdminQuestionTagRecord = existing ?? {
        id: buildTagId(tagName),
        name: tagName,
        questionCount: 0,
        status: "active",
        usedInActiveTemplate: false,
      };

      tagMap.set(tagName, {
        ...nextRecord,
        questionCount: nextRecord.questionCount + 1,
        usedInActiveTemplate:
          nextRecord.usedInActiveTemplate ||
          (question.status !== "deprecated" && question.usedCount > 0),
      });
    });
  });

  return Array.from(tagMap.values()).sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

async function commitBatchedWrites(
  firestore: FirebaseFirestore.Firestore,
  operations: Array<(batch: WriteBatch) => void>,
): Promise<void> {
  if (operations.length === 0) {
    return;
  }

  for (let index = 0; index < operations.length; index += WRITE_BATCH_LIMIT) {
    const batch = firestore.batch();
    operations
      .slice(index, index + WRITE_BATCH_LIMIT)
      .forEach((operation) => operation(batch));
    await batch.commit();
  }
}

export class AdminQuestionTagsService {
  constructor(
    private readonly firestore: FirebaseFirestore.Firestore = getFirestore(),
  ) {}

  public normalizeReadRequest(input: {
    instituteId?: unknown;
  }): AdminQuestionTagsReadRequest {
    return {
      instituteId: normalizeRequiredString(input.instituteId, "instituteId"),
    };
  }

  public normalizeMutationRequest(input: {
    actionType?: unknown;
    instituteId?: unknown;
    primaryTag?: unknown;
    secondaryTag?: unknown;
  }): AdminQuestionTagsMutationRequest {
    const actionType = normalizeActionType(input.actionType);
    const request: AdminQuestionTagsMutationRequest = {
      actionType,
      instituteId: normalizeRequiredString(input.instituteId, "instituteId"),
      primaryTag: normalizeTagName(input.primaryTag, "primaryTag"),
      secondaryTag: normalizeOptionalTagName(input.secondaryTag, "secondaryTag"),
    };

    if ((actionType === "rename" || actionType === "merge") && !request.secondaryTag) {
      throw new AdminQuestionTagsValidationError(
        "VALIDATION_ERROR",
        "Field \"secondaryTag\" must be provided for rename and merge actions.",
      );
    }

    return request;
  }

  public async getTags(
    request: AdminQuestionTagsReadRequest,
  ): Promise<AdminQuestionTagsResult> {
    const instituteRef = this.firestore
      .collection(INSTITUTES_COLLECTION)
      .doc(request.instituteId);
    const [questionSnapshot, tagDictionarySnapshot] = await Promise.all([
      instituteRef.collection(QUESTION_BANK_COLLECTION).get(),
      instituteRef.collection(TAG_DICTIONARY_COLLECTION).get(),
    ]);

    return {
      tags: buildTagInventory(
        tagDictionarySnapshot.docs.map((document) =>
          normalizeTagDictionaryDocument(document),
        ),
        questionSnapshot.docs.map((document) =>
          normalizeQuestionTagDocument(document),
        ),
      ),
    };
  }

  public async mutateTags(
    request: AdminQuestionTagsMutationRequest,
  ): Promise<AdminQuestionTagsResult> {
    const instituteRef = this.firestore
      .collection(INSTITUTES_COLLECTION)
      .doc(request.instituteId);
    const [questionSnapshot, tagDictionarySnapshot] = await Promise.all([
      instituteRef.collection(QUESTION_BANK_COLLECTION).get(),
      instituteRef.collection(TAG_DICTIONARY_COLLECTION).get(),
    ]);
    const questions = questionSnapshot.docs.map((document) =>
      normalizeQuestionTagDocument(document),
    );
    const tagDictionary = tagDictionarySnapshot.docs.map((document) =>
      normalizeTagDictionaryDocument(document),
    );
    const currentTags = buildTagInventory(tagDictionary, questions);
    const currentTagMap = new Map(
      currentTags.map((tag) => [tag.name, tag]),
    );
    const sourceTag = currentTagMap.get(request.primaryTag);

    if (request.actionType !== "create" && !sourceTag) {
      throw new AdminQuestionTagsValidationError(
        "VALIDATION_ERROR",
        "Primary tag not found.",
      );
    }

    if (request.actionType === "create" && sourceTag) {
      throw new AdminQuestionTagsValidationError(
        "VALIDATION_ERROR",
        "Tag already exists.",
      );
    }

    if (request.actionType === "deprecate" && sourceTag?.usedInActiveTemplate) {
      throw new AdminQuestionTagsValidationError(
        "VALIDATION_ERROR",
        "Cannot deprecate a tag that still appears in live in-use question coverage.",
      );
    }

    if (
      (request.actionType === "rename" || request.actionType === "merge") &&
      request.secondaryTag === request.primaryTag
    ) {
      throw new AdminQuestionTagsValidationError(
        "VALIDATION_ERROR",
        "Source and destination tags must differ.",
      );
    }

    if (request.actionType === "rename" && request.secondaryTag && currentTagMap.has(request.secondaryTag)) {
      throw new AdminQuestionTagsValidationError(
        "VALIDATION_ERROR",
        "Destination tag already exists.",
      );
    }

    if (request.actionType === "merge" && request.secondaryTag && !currentTagMap.has(request.secondaryTag)) {
      throw new AdminQuestionTagsValidationError(
        "VALIDATION_ERROR",
        "Destination tag does not exist.",
      );
    }

    const writes: Array<(batch: WriteBatch) => void> = [];
    const sourceTagRef = instituteRef
      .collection(TAG_DICTIONARY_COLLECTION)
      .doc(buildTagId(request.primaryTag));

    if (request.actionType === "create") {
      writes.push((batch) => {
        batch.set(sourceTagRef, {
          status: "active",
          tagName: request.primaryTag,
          updatedAt: Timestamp.now(),
        });
      });
    }

    if (request.actionType === "deprecate") {
      writes.push((batch) => {
        batch.set(sourceTagRef, {
          status: "deprecated",
          tagName: request.primaryTag,
          updatedAt: Timestamp.now(),
        }, {merge: true});
      });
    }

    if (
      (request.actionType === "rename" || request.actionType === "merge") &&
      request.secondaryTag
    ) {
      const secondaryTag = request.secondaryTag;
      const destinationTagRef = instituteRef
        .collection(TAG_DICTIONARY_COLLECTION)
        .doc(buildTagId(secondaryTag));

      writes.push((batch) => {
        batch.set(destinationTagRef, {
          status: "active",
          tagName: secondaryTag,
          updatedAt: Timestamp.now(),
        }, {merge: true});
        batch.set(sourceTagRef, {
          status: "deprecated",
          tagName: request.primaryTag,
          updatedAt: Timestamp.now(),
        }, {merge: true});
      });

      questionSnapshot.docs.forEach((document, index) => {
        const question = questions[index];
        if (!question) {
          throw new Error("Question tag snapshot normalization invariant failed.");
        }

        const nextTags = replaceQuestionTags(
          question,
          request.primaryTag,
          secondaryTag,
        );
        if (!nextTags) {
          return;
        }

        writes.push((batch) => {
          batch.update(document.ref, {
            primaryTag: nextTags.primaryTag,
            tags: nextTags.tags,
          });
        });
      });
    }

    await commitBatchedWrites(this.firestore, writes);
    return this.getTags({instituteId: request.instituteId});
  }
}

export const adminQuestionTagsService = new AdminQuestionTagsService();
