import * as functions from "firebase-functions";
import {questionDistributionProjectionService} from
  "../services/questionDistributionProjection";
import {questionUsageProjectionService} from
  "../services/questionUsageProjection";
import {questionTagProjectionService} from
  "../services/questionTagProjection";

const QUESTION_PATH = "institutes/{instituteId}/questionBank/{questionId}";
const ANALYTICS_PATH = "institutes/{instituteId}/questionAnalytics/{questionId}";
const TEMPLATE_PATH = "institutes/{instituteId}/tests/{testId}";

export const handleQuestionProjectionWrite = async (
  _change: functions.Change<FirebaseFirestore.DocumentSnapshot>,
  context: functions.EventContext,
): Promise<void> => {
  await questionDistributionProjectionService.reconcileQuestion({
    instituteId: String(context.params.instituteId ?? ""),
    questionId: String(context.params.questionId ?? ""),
  });
  await questionTagProjectionService.reconcileQuestion({
    instituteId: String(context.params.instituteId ?? ""),
    questionId: String(context.params.questionId ?? ""),
  });
};

export const handleQuestionAnalyticsProjectionWrite = async (
  _change: functions.Change<FirebaseFirestore.DocumentSnapshot>,
  context: functions.EventContext,
): Promise<void> => {
  await questionDistributionProjectionService.reconcileQuestion({
    instituteId: String(context.params.instituteId ?? ""),
    questionId: String(context.params.questionId ?? ""),
  });
};

export const handleTemplateUsageProjectionWrite = async (
  _change: functions.Change<FirebaseFirestore.DocumentSnapshot>,
  context: functions.EventContext,
): Promise<void> => {
  await questionUsageProjectionService.reconcileTemplate({
    instituteId: String(context.params.instituteId ?? ""),
    testId: String(context.params.testId ?? ""),
  });
};

export const questionDistributionOnQuestionWrite = functions.firestore
  .document(QUESTION_PATH).onWrite(handleQuestionProjectionWrite);

export const questionDistributionOnAnalyticsWrite = functions.firestore
  .document(ANALYTICS_PATH).onWrite(handleQuestionAnalyticsProjectionWrite);

export const questionUsageOnTemplateWrite = functions.firestore
  .document(TEMPLATE_PATH).onWrite(handleTemplateUsageProjectionWrite);
