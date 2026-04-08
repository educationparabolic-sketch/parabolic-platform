import * as functions from "firebase-functions";
import {questionIngestionService} from "../services/questionIngestion";
import {systemEventTopologyService} from "../services/systemEventTopology";

const QUESTION_BANK_DOCUMENT_PATH =
  "institutes/{instituteId}/questionBank/{questionId}";

const isObjectRecord = (
  value: unknown,
): value is Record<string, unknown> => typeof value === "object" &&
  value !== null &&
  !Array.isArray(value);

const normalizeComparableString = (value: unknown): string =>
  typeof value === "string" ?
    value.trim().toLowerCase().replace(/\s+/g, " ") :
    "";

const normalizeComparableStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalizedValues = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => normalizeComparableString(entry))
    .filter((entry) => entry.length > 0);

  return Array.from(new Set(normalizedValues)).sort();
};

const hasSearchIndexInputsChanged = (
  beforeData: unknown,
  afterData: unknown,
): boolean => {
  if (!isObjectRecord(beforeData) || !isObjectRecord(afterData)) {
    return true;
  }

  const beforeSubject = normalizeComparableString(beforeData.subject);
  const afterSubject = normalizeComparableString(afterData.subject);
  const beforeChapter = normalizeComparableString(beforeData.chapter);
  const afterChapter = normalizeComparableString(afterData.chapter);

  if (beforeSubject !== afterSubject || beforeChapter !== afterChapter) {
    return true;
  }

  const beforeTags = normalizeComparableStringArray(beforeData.tags);
  const afterTags = normalizeComparableStringArray(afterData.tags);

  if (beforeTags.length !== afterTags.length) {
    return true;
  }

  for (let index = 0; index < beforeTags.length; index += 1) {
    if (beforeTags[index] !== afterTags[index]) {
      return true;
    }
  }

  const beforeKeywords = normalizeComparableStringArray(
    beforeData.questionTextKeywords,
  );
  const afterKeywords = normalizeComparableStringArray(
    afterData.questionTextKeywords,
  );

  if (beforeKeywords.length !== afterKeywords.length) {
    return true;
  }

  for (let index = 0; index < beforeKeywords.length; index += 1) {
    if (beforeKeywords[index] !== afterKeywords[index]) {
      return true;
    }
  }

  return false;
};

const isStaleEvent = (
  sourceSnapshot: FirebaseFirestore.QueryDocumentSnapshot,
  latestSnapshot: FirebaseFirestore.DocumentSnapshot,
): boolean => {
  if (!latestSnapshot.exists || !latestSnapshot.updateTime) {
    return true;
  }

  return !latestSnapshot.updateTime.isEqual(sourceSnapshot.updateTime);
};

export const handleQuestionCreated = async (
  snapshot: FirebaseFirestore.QueryDocumentSnapshot,
  context: functions.EventContext,
): Promise<void> => {
  const instituteId = String(context.params.instituteId ?? "").trim();
  const questionId = String(context.params.questionId ?? "").trim();
  const latestSnapshot = await snapshot.ref.get();

  if (isStaleEvent(snapshot, latestSnapshot)) {
    functions.logger.info("Skipping stale question create ingestion event.", {
      eventId: context.eventId,
      instituteId,
      questionId,
      sourceUpdateTime: snapshot.updateTime.toMillis(),
    });
    return;
  }

  await systemEventTopologyService.executeEventHandler(
    "QuestionCreated",
    "questionBankOnCreate",
    {
      eventId: context.eventId,
      instituteId,
      sourcePath: latestSnapshot.ref.path,
    },
    async () => questionIngestionService.ingestQuestion(
      {
        instituteId,
        questionId,
      },
      latestSnapshot.data(),
    ),
  );
};

export const handleQuestionUpdated = async (
  change: functions.Change<FirebaseFirestore.QueryDocumentSnapshot>,
  context: functions.EventContext,
): Promise<void> => {
  const instituteId = String(context.params.instituteId ?? "").trim();
  const questionId = String(context.params.questionId ?? "").trim();
  const beforeData = change.before.data();
  const afterData = change.after.data();

  if (!hasSearchIndexInputsChanged(beforeData, afterData)) {
    return;
  }

  const latestSnapshot = await change.after.ref.get();

  if (isStaleEvent(change.after, latestSnapshot)) {
    functions.logger.info("Skipping stale question update ingestion event.", {
      eventId: context.eventId,
      instituteId,
      questionId,
      sourceUpdateTime: change.after.updateTime.toMillis(),
    });
    return;
  }

  await systemEventTopologyService.executeEventHandler(
    "QuestionCreated",
    "questionBankOnCreate",
    {
      eventId: context.eventId,
      instituteId,
      sourcePath: latestSnapshot.ref.path,
    },
    async () => questionIngestionService.ingestQuestion(
      {
        instituteId,
        questionId,
      },
      latestSnapshot.data(),
      beforeData,
    ),
  );
};

export const questionBankOnCreate = functions.firestore
  .document(QUESTION_BANK_DOCUMENT_PATH)
  .onCreate(handleQuestionCreated);

export const questionBankOnUpdate = functions.firestore
  .document(QUESTION_BANK_DOCUMENT_PATH)
  .onUpdate(handleQuestionUpdated);
