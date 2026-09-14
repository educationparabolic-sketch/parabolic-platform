/* eslint-disable require-jsdoc */
import {createHash} from "node:crypto";
import {Timestamp} from "firebase-admin/firestore";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  AdminQuestionBankRequestContext,
  AdminQuestionBankValidationError,
  AdminQuestionTagAuthorityRecord,
  AdminQuestionTagField,
  AdminQuestionTagMutationRequest,
  AdminQuestionTagMutationResult,
  AdminQuestionTagMutationValidatedRequest,
  AdminQuestionTagReadValidatedRequest,
  AdminQuestionTagsResult,
} from "../types/adminQuestionBank";

const INSTITUTES_COLLECTION = "institutes";
const QUESTION_BANK_COLLECTION = "questionBank";
const TAG_PROJECTIONS_COLLECTION = "questionTagProjections";
const TAG_DICTIONARY_COLLECTION = "tagDictionary";
const TESTS_COLLECTION = "tests";
const AUDIT_LOGS_COLLECTION = "auditLogs";
const GOVERNANCE_DOCUMENT_ID = "question_tag_governance_state";
const PROJECTION_STATE_DOCUMENT_ID = "question_tag_projection_state";
const GOVERNED_TAG_KIND = "question_tag_governance";
const MAX_AFFECTED_QUESTIONS = 100;
const MAX_GOVERNED_TAGS = 400;
const MAX_TEMPLATE_REFERENCES = 100;
const MAX_MERGE_SOURCES = 20;
const ARRAY_CONTAINS_ANY_LIMIT = 30;
const DEFAULT_DICTIONARY_REVISION = 1;
const ALLOWED_ROLES = new Set(["admin", "teacher"]);
const TAG_FIELDS: readonly AdminQuestionTagField[] = [
  "primaryTag",
  "secondaryTag",
  "additionalTag",
  "topic",
];

interface AdminQuestionTagsDependencies {
  firestore: FirebaseFirestore.Firestore;
  now: () => Timestamp;
}

interface CommandAuthority {
  auditId: string;
  idempotencyKeyHash: string;
  requestFingerprint: string;
}

interface NormalizedQuestionTag {
  id: string;
  reference: FirebaseFirestore.DocumentReference;
  data: Record<string, unknown>;
  name: string;
}

interface GovernedTagDocument {
  field: AdminQuestionTagField;
  name: string;
  status: "active" | "deprecated";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeRequiredString(
  value: unknown,
  fieldName: string,
  maximumLength = 256,
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new AdminQuestionBankValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a non-empty string.`,
    );
  }

  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length > maximumLength) {
    throw new AdminQuestionBankValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be at most ${maximumLength} characters.`,
    );
  }
  return normalized;
}

function normalizeOptionalContextString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizePositiveInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new AdminQuestionBankValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a positive integer.`,
    );
  }
  return value;
}

function readNonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ?
    value : 0;
}

function normalizeField(value: unknown): AdminQuestionTagField {
  if (TAG_FIELDS.includes(value as AdminQuestionTagField)) {
    return value as AdminQuestionTagField;
  }
  throw new AdminQuestionBankValidationError(
    "VALIDATION_ERROR",
    "Field \"field\" must be primaryTag, secondaryTag, additionalTag, or topic.",
  );
}

function normalizeOptionalField(value: unknown): AdminQuestionTagField | undefined {
  return value === undefined || value === null || value === "" ?
    undefined :
    normalizeField(value);
}

function normalizeContext(input: {
  actorId?: unknown;
  actorRole?: unknown;
  instituteId?: unknown;
  ipAddress?: unknown;
  userAgent?: unknown;
}): AdminQuestionBankRequestContext {
  const actorRole = normalizeRequiredString(input.actorRole, "actorRole")
    .toLowerCase();
  if (!ALLOWED_ROLES.has(actorRole)) {
    throw new AdminQuestionBankValidationError(
      "FORBIDDEN",
      "Question tag governance requires the teacher or admin role.",
    );
  }
  return {
    actorId: normalizeRequiredString(input.actorId, "actorId"),
    actorRole,
    instituteId: normalizeRequiredString(input.instituteId, "instituteId"),
    ipAddress: normalizeOptionalContextString(input.ipAddress),
    userAgent: normalizeOptionalContextString(input.userAgent),
  };
}

function normalizeName(value: unknown, fieldName: string): string {
  return normalizeRequiredString(value, fieldName, 120);
}

function normalizeMutation(value: unknown): AdminQuestionTagMutationRequest {
  if (!isRecord(value)) {
    throw new AdminQuestionBankValidationError(
      "VALIDATION_ERROR",
      "Question tag mutation body must be an object.",
    );
  }
  const base = {
    expectedDictionaryRevision: normalizePositiveInteger(
      value.expectedDictionaryRevision,
      "expectedDictionaryRevision",
    ),
    field: normalizeField(value.field),
    idempotencyKey: normalizeRequiredString(
      value.idempotencyKey,
      "idempotencyKey",
      128,
    ),
  };

  if (value.action === "create") {
    return {...base, action: "create", name: normalizeName(value.name, "name")};
  }
  if (value.action === "deprecate") {
    return {
      ...base,
      action: "deprecate",
      name: normalizeName(value.name, "name"),
    };
  }
  if (value.action === "rename") {
    const sourceName = normalizeName(value.sourceName, "sourceName");
    const destinationName = normalizeName(
      value.destinationName,
      "destinationName",
    );
    if (sourceName === destinationName) {
      throw new AdminQuestionBankValidationError(
        "VALIDATION_ERROR",
        "Source and destination tag names must differ.",
      );
    }
    return {...base, action: "rename", destinationName, sourceName};
  }
  if (value.action === "merge") {
    if (!Array.isArray(value.sourceNames)) {
      throw new AdminQuestionBankValidationError(
        "VALIDATION_ERROR",
        "Field \"sourceNames\" must be an array.",
      );
    }
    const sourceNames = value.sourceNames.map((name) =>
      normalizeName(name, "sourceNames[]"));
    const uniqueSourceNames = [...new Set(sourceNames)];
    if (
      uniqueSourceNames.length < 2 ||
      uniqueSourceNames.length > MAX_MERGE_SOURCES ||
      uniqueSourceNames.length !== sourceNames.length
    ) {
      throw new AdminQuestionBankValidationError(
        "VALIDATION_ERROR",
        `Field "sourceNames" must contain 2-${MAX_MERGE_SOURCES} unique names.`,
      );
    }
    const destinationName = normalizeName(
      value.destinationName,
      "destinationName",
    );
    if (uniqueSourceNames.includes(destinationName)) {
      throw new AdminQuestionBankValidationError(
        "VALIDATION_ERROR",
        "Merge destination must not also be a source tag.",
      );
    }
    return {
      ...base,
      action: "merge",
      destinationName,
      sourceNames: uniqueSourceNames,
    };
  }

  throw new AdminQuestionBankValidationError(
    "VALIDATION_ERROR",
    "Field \"action\" must be create, rename, merge, or deprecate.",
  );
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function buildTagDocumentId(field: AdminQuestionTagField, name: string): string {
  return `governed_${field}_${sha256(`${field}:${name}`).slice(0, 40)}`;
}

function buildCommandAuthority(
  context: AdminQuestionBankRequestContext,
  mutation: AdminQuestionTagMutationRequest,
): CommandAuthority {
  const idempotencyKeyHash = sha256(mutation.idempotencyKey);
  return {
    auditId: `question_tags_${sha256(
      `${context.instituteId}:${idempotencyKeyHash}`,
    ).slice(0, 40)}`,
    idempotencyKeyHash,
    requestFingerprint: sha256(stableJson({
      actorId: context.actorId,
      mutation,
    })),
  };
}

function mutationForAudit(
  mutation: AdminQuestionTagMutationRequest,
): Record<string, unknown> {
  const copy: Record<string, unknown> = {...mutation};
  delete copy.idempotencyKey;
  return copy;
}

function readDictionaryRevision(data: Record<string, unknown>): number {
  return typeof data.dictionaryRevision === "number" &&
    Number.isInteger(data.dictionaryRevision) &&
    data.dictionaryRevision > 0 ?
    data.dictionaryRevision :
    DEFAULT_DICTIONARY_REVISION;
}

function readReplayResult(
  snapshot: FirebaseFirestore.DocumentSnapshot,
  fingerprint: string,
): AdminQuestionTagMutationResult | null {
  if (!snapshot.exists) return null;
  const metadata = snapshot.get("metadata");
  if (!isRecord(metadata) || metadata.requestFingerprint !== fingerprint) {
    throw new AdminQuestionBankValidationError(
      "CONFLICT",
      "Idempotency key was already used with different tag mutation semantics.",
    );
  }
  if (!isRecord(metadata.result)) {
    throw new AdminQuestionBankValidationError(
      "CONFLICT",
      "Tag mutation replay authority is incomplete.",
    );
  }
  return {
    ...(metadata.result as unknown as AdminQuestionTagMutationResult),
    disposition: "replayed",
  };
}

function tagNameFromQuestion(
  data: Record<string, unknown>,
  field: AdminQuestionTagField,
): string | null {
  const value = data[field];
  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim().replace(/\s+/g, " ");
}

function tagValues(data: Record<string, unknown>): string[] {
  return ["primaryTag", "secondaryTag", "additionalTag"]
    .map((field) => data[field])
    .filter((value): value is string =>
      typeof value === "string" && Boolean(value.trim()))
    .map((value) => value.trim().replace(/\s+/g, " "))
    .filter((value, index, values) => values.indexOf(value) === index);
}

function toRevision(data: Record<string, unknown>): number {
  return typeof data.revision === "number" &&
    Number.isInteger(data.revision) && data.revision > 0 ? data.revision : 1;
}

function parseGovernedTag(data: Record<string, unknown>): GovernedTagDocument | null {
  if (
    data.kind !== GOVERNED_TAG_KIND ||
    !TAG_FIELDS.includes(data.field as AdminQuestionTagField) ||
    typeof data.name !== "string" ||
    !data.name.trim()
  ) {
    return null;
  }
  return {
    field: data.field as AdminQuestionTagField,
    name: data.name.trim().replace(/\s+/g, " "),
    status: data.status === "deprecated" ? "deprecated" : "active",
  };
}

function sourceNames(mutation: AdminQuestionTagMutationRequest): string[] {
  if (mutation.action === "rename") return [mutation.sourceName];
  if (mutation.action === "merge") return mutation.sourceNames;
  if (mutation.action === "deprecate") return [mutation.name];
  return [];
}

function destinationName(
  mutation: AdminQuestionTagMutationRequest,
): string | null {
  if (mutation.action === "create") return mutation.name;
  if (mutation.action === "deprecate") return null;
  return mutation.destinationName;
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function assertBound(size: number, maximum: number, subject: string): void {
  if (size > maximum) {
    throw new AdminQuestionBankValidationError(
      "CONFLICT",
      `${subject} exceeds the bounded ${maximum}-record transaction limit.`,
    );
  }
}

function requireReference(
  references: Map<string, FirebaseFirestore.DocumentReference>,
  name: string,
): FirebaseFirestore.DocumentReference {
  const reference = references.get(name);
  if (!reference) throw new Error(`Missing tag reference for "${name}".`);
  return reference;
}

function buildInventory(input: {
  dictionary: GovernedTagDocument[];
  fields: readonly AdminQuestionTagField[];
  projections: FirebaseFirestore.QueryDocumentSnapshot[];
}): AdminQuestionTagAuthorityRecord[] {
  const records = new Map<string, AdminQuestionTagAuthorityRecord>();
  for (const document of input.dictionary) {
    if (!input.fields.includes(document.field)) continue;
    records.set(`${document.field}\u0000${document.name}`, {
      field: document.field,
      name: document.name,
      questionCount: 0,
      status: document.status,
      usedInActiveTemplate: false,
    });
  }
  for (const projection of input.projections) {
    const data = projection.data();
    const field = TAG_FIELDS.find((candidate) => candidate === data.field);
    const name = typeof data.name === "string" ? data.name.trim() : "";
    if (!field || !name || !input.fields.includes(field)) continue;
    const key = `${field}\u0000${name}`;
    const current = records.get(key);
    records.set(key, {
      field,
      name,
      questionCount: readNonNegativeInteger(data.questionCount),
      status: current?.status ?? "active",
      usedInActiveTemplate: data.usedInActiveTemplate === true,
    });
  }
  return [...records.values()].sort((left, right) =>
    TAG_FIELDS.indexOf(left.field) - TAG_FIELDS.indexOf(right.field) ||
    left.name.localeCompare(right.name));
}

export class AdminQuestionTagsService {
  constructor(
    private readonly dependencies: AdminQuestionTagsDependencies = {
      firestore: getFirestore(),
      now: () => Timestamp.now(),
    },
  ) {}

  public normalizeReadRequest(input: {
    actorId?: unknown;
    actorRole?: unknown;
    field?: unknown;
    instituteId?: unknown;
    ipAddress?: unknown;
    userAgent?: unknown;
  }): AdminQuestionTagReadValidatedRequest {
    return {...normalizeContext(input), field: normalizeOptionalField(input.field)};
  }

  public normalizeMutationRequest(input: {
    actorId?: unknown;
    actorRole?: unknown;
    body?: unknown;
    instituteId?: unknown;
    ipAddress?: unknown;
    userAgent?: unknown;
  }): AdminQuestionTagMutationValidatedRequest {
    return {...normalizeContext(input), mutation: normalizeMutation(input.body)};
  }

  public async getTags(
    request: AdminQuestionTagReadValidatedRequest,
  ): Promise<AdminQuestionTagsResult> {
    const institute = this.dependencies.firestore
      .collection(INSTITUTES_COLLECTION)
      .doc(request.instituteId);
    const projectionCollection = institute.collection(TAG_PROJECTIONS_COLLECTION);
    const projectionQuery = request.field ?
      projectionCollection.where("field", "==", request.field).orderBy("name", "asc") :
      projectionCollection.orderBy("field", "asc").orderBy("name", "asc");
    const [state, projectionState, projectionSnapshot, dictionarySnapshot] =
      await Promise.all([
        institute.collection(TAG_DICTIONARY_COLLECTION)
          .doc(GOVERNANCE_DOCUMENT_ID).get(),
        institute.collection(TAG_DICTIONARY_COLLECTION)
          .doc(PROJECTION_STATE_DOCUMENT_ID).get(),
        projectionQuery.limit(MAX_GOVERNED_TAGS + 1).get(),
        institute.collection(TAG_DICTIONARY_COLLECTION)
          .where("kind", "==", GOVERNED_TAG_KIND)
          .limit(MAX_GOVERNED_TAGS + 1).get(),
      ]);
    if (!projectionState.exists || projectionState.get("backfillComplete") !== true) {
      throw new AdminQuestionBankValidationError(
        "CONFLICT",
        "Question tag projection is unavailable; governed backfill is required.",
      );
    }
    assertBound(
      projectionSnapshot.size,
      MAX_GOVERNED_TAGS,
      "Question tag projection",
    );
    assertBound(
      dictionarySnapshot.size,
      MAX_GOVERNED_TAGS,
      "Governed tag dictionary",
    );
    const fields = request.field ? [request.field] : TAG_FIELDS;
    return {
      dictionaryRevision: readDictionaryRevision(state.data() ?? {}),
      tags: buildInventory({
        dictionary: dictionarySnapshot.docs
          .map((document) => parseGovernedTag(document.data()))
          .filter((tag): tag is GovernedTagDocument => tag !== null),
        fields,
        projections: projectionSnapshot.docs,
      }),
    };
  }

  public async mutateTags(
    request: AdminQuestionTagMutationValidatedRequest,
  ): Promise<AdminQuestionTagMutationResult> {
    const mutation = request.mutation;
    const authority = buildCommandAuthority(request, mutation);
    const institute = this.dependencies.firestore
      .collection(INSTITUTES_COLLECTION)
      .doc(request.instituteId);
    const dictionary = institute.collection(TAG_DICTIONARY_COLLECTION);
    const stateReference = dictionary.doc(GOVERNANCE_DOCUMENT_ID);
    const auditReference = institute.collection(AUDIT_LOGS_COLLECTION)
      .doc(authority.auditId);
    const sources = sourceNames(mutation);
    const destination = destinationName(mutation);
    const touchedNames = [...new Set([
      ...sources,
      ...(destination ? [destination] : []),
    ])];
    const tagReferences = new Map(touchedNames.map((name) => [
      name,
      dictionary.doc(buildTagDocumentId(mutation.field, name)),
    ]));

    return this.dependencies.firestore.runTransaction(async (transaction) => {
      const [auditSnapshot, stateSnapshot] = await Promise.all([
        transaction.get(auditReference),
        transaction.get(stateReference),
      ]);
      const replay = readReplayResult(
        auditSnapshot,
        authority.requestFingerprint,
      );
      if (replay) return replay;

      const currentRevision = readDictionaryRevision(stateSnapshot.data() ?? {});
      if (currentRevision !== mutation.expectedDictionaryRevision) {
        throw new AdminQuestionBankValidationError(
          "CONFLICT",
          "Tag dictionary revision conflict: expected " +
            `${mutation.expectedDictionaryRevision}, current revision is ` +
            `${currentRevision}.`,
        );
      }
      const tagSnapshots = await Promise.all(
        touchedNames.map((name) =>
          transaction.get(requireReference(tagReferences, name))),
      );
      const tagAuthority = new Map(touchedNames.map((name, index) => {
        const parsed = parseGovernedTag(tagSnapshots[index].data() ?? {});
        return [name, parsed];
      }));

      let questionDocuments: FirebaseFirestore.QueryDocumentSnapshot[] = [];
      if (touchedNames.length > 0) {
        const query = institute.collection(QUESTION_BANK_COLLECTION)
          .where(
            mutation.field,
            touchedNames.length === 1 ? "==" : "in",
            touchedNames.length === 1 ? touchedNames[0] : touchedNames,
          )
          .limit(MAX_AFFECTED_QUESTIONS + 1);
        const snapshot = await transaction.get(query);
        assertBound(
          snapshot.size,
          MAX_AFFECTED_QUESTIONS,
          "Affected question coverage",
        );
        questionDocuments = snapshot.docs;
      }
      const questionsByName = new Map<string, NormalizedQuestionTag[]>();
      touchedNames.forEach((name) => questionsByName.set(name, []));
      questionDocuments.forEach((document) => {
        const data = document.data();
        const name = tagNameFromQuestion(data, mutation.field);
        if (!name) return;
        const questions = questionsByName.get(name);
        if (!questions) return;
        questions.push({
          data,
          id: document.id,
          name,
          reference: document.ref,
        });
      });

      const exists = (name: string): boolean =>
        Boolean(tagAuthority.get(name)) ||
        (questionsByName.get(name)?.length ?? 0) > 0;
      const isActive = (name: string): boolean =>
        tagAuthority.get(name)?.status !== "deprecated" && exists(name);
      if (mutation.action === "create" && exists(mutation.name)) {
        throw new AdminQuestionBankValidationError(
          "CONFLICT",
          `Tag "${mutation.name}" already exists for ${mutation.field}.`,
        );
      }
      if (mutation.action === "rename" && exists(mutation.destinationName)) {
        throw new AdminQuestionBankValidationError(
          "CONFLICT",
          `Destination tag "${mutation.destinationName}" already exists.`,
        );
      }
      for (const source of sources) {
        if (!isActive(source)) {
          throw new AdminQuestionBankValidationError(
            "NOT_FOUND",
            `Active source tag "${source}" was not found for ${mutation.field}.`,
          );
        }
      }

      const affectedQuestions = sources.flatMap((name) =>
        questionsByName.get(name) ?? []);
      const affectedQuestionIds = affectedQuestions.map((question) => question.id);
      const activeTemplateIds = new Set<string>();
      for (const questionIdChunk of chunks(
        affectedQuestionIds,
        ARRAY_CONTAINS_ANY_LIMIT,
      )) {
        const snapshot = await transaction.get(
          institute.collection(TESTS_COLLECTION)
            .where("questionIds", "array-contains-any", questionIdChunk)
            .limit(MAX_TEMPLATE_REFERENCES + 1),
        );
        assertBound(
          snapshot.size,
          MAX_TEMPLATE_REFERENCES,
          "Template reference coverage",
        );
        snapshot.docs.forEach((document) => {
          const status = document.get("status");
          if (status === "ready" || status === "assigned") {
            activeTemplateIds.add(document.id);
          }
        });
        assertBound(
          activeTemplateIds.size,
          MAX_TEMPLATE_REFERENCES,
          "Active template reference coverage",
        );
      }
      if (activeTemplateIds.size > 0) {
        throw new AdminQuestionBankValidationError(
          "CONFLICT",
          "Source tags cannot be removed while their questions are used by " +
            `active templates (${[...activeTemplateIds].sort().join(", ")}).`,
        );
      }

      const timestamp = this.dependencies.now();
      const nextRevision = currentRevision + 1;
      const nextStatus = new Map<string, "active" | "deprecated">();
      touchedNames.forEach((name) => {
        nextStatus.set(name, tagAuthority.get(name)?.status ?? "active");
      });
      sources.forEach((name) => nextStatus.set(name, "deprecated"));
      if (destination) nextStatus.set(destination, "active");

      const counts = new Map(touchedNames.map((name) => [
        name,
        questionsByName.get(name)?.length ?? 0,
      ]));
      if (mutation.action === "rename" || mutation.action === "merge") {
        const movedCount = affectedQuestions.length;
        counts.set(mutation.destinationName,
          (counts.get(mutation.destinationName) ?? 0) + movedCount);
        sources.forEach((name) => counts.set(name, 0));
      }
      const result: AdminQuestionTagMutationResult = {
        affectedQuestionCount: affectedQuestions.length,
        auditId: authority.auditId,
        dictionaryRevision: nextRevision,
        disposition: "applied",
        tags: touchedNames.map((name) => ({
          field: mutation.field,
          name,
          questionCount: counts.get(name) ?? 0,
          status: nextStatus.get(name) ?? "active",
          usedInActiveTemplate: false,
        })).sort((left, right) => left.name.localeCompare(right.name)),
        updatedAt: timestamp.toDate().toISOString(),
      };

      if (mutation.action === "rename" || mutation.action === "merge") {
        affectedQuestions.forEach((question) => {
          const nextData = {
            ...question.data,
            [mutation.field]: mutation.destinationName,
          };
          transaction.update(question.reference, {
            [mutation.field]: mutation.destinationName,
            revision: toRevision(question.data) + 1,
            tags: tagValues(nextData),
            updatedAt: timestamp,
            updatedBy: request.actorId,
          });
        });
      }
      touchedNames.forEach((name, index) => {
        const snapshot = tagSnapshots[index];
        transaction.set(requireReference(tagReferences, name), {
          createdAt: snapshot.exists ? snapshot.get("createdAt") ?? timestamp : timestamp,
          createdBy: snapshot.exists ?
            snapshot.get("createdBy") ?? request.actorId : request.actorId,
          field: mutation.field,
          kind: GOVERNED_TAG_KIND,
          name,
          status: nextStatus.get(name),
          updatedAt: timestamp,
          updatedBy: request.actorId,
        });
      });
      transaction.set(stateReference, {
        dictionaryRevision: nextRevision,
        kind: "question_tag_governance_state",
        updatedAt: timestamp,
        updatedBy: request.actorId,
      }, {merge: true});
      transaction.create(auditReference, {
        actionType: "MUTATE_QUESTION_TAGS",
        actorId: request.actorId,
        actorRole: request.actorRole,
        actorUid: request.actorId,
        after: result,
        auditId: authority.auditId,
        before: {
          dictionaryRevision: currentRevision,
          field: mutation.field,
          tags: touchedNames.map((name) => ({
            name,
            questionCount: questionsByName.get(name)?.length ?? 0,
            status: tagAuthority.get(name)?.status ?? null,
          })),
        },
        entityId: `${mutation.field}:${touchedNames.join("|")}`,
        entityType: "question_tag_dictionary",
        instituteId: request.instituteId,
        ...(request.ipAddress ? {ipAddress: request.ipAddress} : {}),
        layer: "L0",
        metadata: {
          affectedQuestionIds: affectedQuestionIds.sort(),
          idempotencyKeyHash: authority.idempotencyKeyHash,
          mutation: mutationForAudit(mutation),
          requestFingerprint: authority.requestFingerprint,
          result,
          source: "AdminQuestionTagsService",
        },
        targetCollection: TAG_DICTIONARY_COLLECTION,
        targetId: GOVERNANCE_DOCUMENT_ID,
        tenantId: request.instituteId,
        timestamp,
        ...(request.userAgent ? {userAgent: request.userAgent} : {}),
      });
      return result;
    });
  }
}

export const adminQuestionTagsService = new AdminQuestionTagsService();
