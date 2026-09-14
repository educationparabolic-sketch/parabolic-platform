/* eslint-disable require-jsdoc */
import {createHash} from "node:crypto";
import {Timestamp} from "firebase-admin/firestore";
import {AdminQuestionTagField} from "../types/adminQuestionBank";
import {getFirestore} from "../utils/firebaseAdmin";

const INSTITUTES_COLLECTION = "institutes";
const QUESTION_BANK_COLLECTION = "questionBank";
const ITEMS_COLLECTION = "questionTagProjectionItems";
const PROJECTIONS_COLLECTION = "questionTagProjections";
const TAG_FIELDS: readonly AdminQuestionTagField[] = [
  "primaryTag", "secondaryTag", "additionalTag", "topic",
];

interface TagValue {
  field: AdminQuestionTagField;
  name: string;
}

interface TagContribution {
  questionId: string;
  tags: TagValue[];
  usedInActiveTemplate: boolean;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function integer(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 0;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function tagKey(tag: TagValue): string {
  return `${tag.field}\u0000${tag.name}`;
}

function tagId(tag: TagValue): string {
  return `tag_${sha256(tagKey(tag)).slice(0, 40)}`;
}

function contribution(
  questionId: string,
  data: FirebaseFirestore.DocumentData | undefined,
): TagContribution | null {
  if (!data) return null;
  const tags = TAG_FIELDS.flatMap((field) => {
    const name = text(data[field]);
    return name ? [{field, name}] : [];
  });
  return {
    questionId,
    tags,
    usedInActiveTemplate: integer(data.activeTemplateCount) > 0 ||
      data.usedInActiveTemplate === true,
  };
}

function storedContribution(value: unknown): TagContribution | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  const questionId = text(data.questionId);
  if (!questionId || !Array.isArray(data.tags)) return null;
  const tags = data.tags.flatMap((value): TagValue[] => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return [];
    const tag = value as Record<string, unknown>;
    const field = TAG_FIELDS.find((candidate) => candidate === tag.field);
    const name = text(tag.name);
    return field && name ? [{field, name}] : [];
  });
  return {questionId, tags, usedInActiveTemplate: data.usedInActiveTemplate === true};
}

function fingerprint(value: TagContribution | null): string {
  return sha256(JSON.stringify(value));
}

export class QuestionTagProjectionService {
  constructor(
    private readonly firestore: FirebaseFirestore.Firestore = getFirestore(),
    private readonly now: () => Timestamp = () => Timestamp.now(),
  ) {}

  public async reconcileQuestion(input: {
    instituteId: string;
    questionId: string;
  }): Promise<"applied" | "unchanged"> {
    const instituteId = text(input.instituteId);
    const questionId = text(input.questionId);
    if (!instituteId || !questionId) throw new Error("Tag projection identifiers are required.");
    const institute = this.firestore.collection(INSTITUTES_COLLECTION).doc(instituteId);
    const questionRef = institute.collection(QUESTION_BANK_COLLECTION).doc(questionId);
    const itemRef = institute.collection(ITEMS_COLLECTION).doc(questionId);
    return this.firestore.runTransaction(async (transaction) => {
      const [questionSnapshot, itemSnapshot] = await Promise.all([
        transaction.get(questionRef), transaction.get(itemRef),
      ]);
      const previous = storedContribution(itemSnapshot.get("contribution"));
      const next = contribution(
        questionId,
        questionSnapshot.exists ? questionSnapshot.data() : undefined,
      );
      const nextFingerprint = fingerprint(next);
      if (itemSnapshot.get("fingerprint") === nextFingerprint) return "unchanged";
      const tags = new Map<string, TagValue>();
      [...(previous?.tags ?? []), ...(next?.tags ?? [])].forEach((tag) =>
        tags.set(tagKey(tag), tag));
      const references = [...tags.values()].map((tag) =>
        institute.collection(PROJECTIONS_COLLECTION).doc(tagId(tag)));
      const snapshots = await Promise.all(references.map((reference) =>
        transaction.get(reference)));
      [...tags.values()].forEach((tag, index) => {
        const data = snapshots[index]?.data() ?? {};
        const wasPresent = previous?.tags.some((value) => tagKey(value) === tagKey(tag)) ?? false;
        const isPresent = next?.tags.some((value) => tagKey(value) === tagKey(tag)) ?? false;
        const wasActive = wasPresent && previous?.usedInActiveTemplate === true;
        const isActive = isPresent && next?.usedInActiveTemplate === true;
        const questionCount = Math.max(0, integer(data.questionCount) +
          Number(isPresent) - Number(wasPresent));
        const activeQuestionCount = Math.max(0, integer(data.activeQuestionCount) +
          Number(isActive) - Number(wasActive));
        if (questionCount === 0) {
          transaction.delete(references[index]);
        } else {
          transaction.set(references[index], {
            activeQuestionCount,
            field: tag.field,
            kind: "question_tag_projection",
            name: tag.name,
            questionCount,
            updatedAt: this.now(),
            usedInActiveTemplate: activeQuestionCount > 0,
          });
        }
      });
      transaction.set(itemRef, {
        contribution: next,
        fingerprint: nextFingerprint,
        kind: "question_tag_projection_item",
        questionId,
        updatedAt: this.now(),
      });
      return "applied";
    });
  }
}

export const questionTagProjectionService = new QuestionTagProjectionService();
