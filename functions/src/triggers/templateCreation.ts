import * as functions from "firebase-functions";
import {
  templateConfigurationSnapshotService,
} from "../services/templateConfigurationSnapshot";
import {
  templateAnalyticsInitializationService,
} from "../services/templateAnalyticsInitialization";
import {
  templateAuditLoggingService,
} from "../services/templateAuditLogging";
import {templateFingerprintService} from "../services/templateFingerprint";
import {templateCreationService} from "../services/templateCreation";
import {systemEventTopologyService} from "../services/systemEventTopology";

const TESTS_DOCUMENT_PATH = "institutes/{instituteId}/tests/{testId}";

/**
 * Normalizes optional trigger string metadata.
 * @param {unknown} value Raw metadata value.
 * @return {string | undefined} Trimmed string when present.
 */
function extractOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalizedValue = value.trim();
  return normalizedValue || undefined;
}

export const handleTemplateCreated = async (
  snapshot: FirebaseFirestore.QueryDocumentSnapshot,
  context: functions.EventContext,
): Promise<void> => {
  const instituteId = String(context.params.instituteId ?? "").trim();
  const testId = String(context.params.testId ?? "").trim();

  await systemEventTopologyService.executeEventHandler(
    "TemplateCreated",
    "testTemplateOnCreate",
    {
      eventId: context.eventId,
      instituteId,
      sourcePath: snapshot.ref.path,
      testId,
    },
    async () => {
      const templateContext = {
        instituteId,
        testId,
      };
      const templatePayload = snapshot.data();

      const templateCreationResult = await templateCreationService
        .processTemplateCreated(
          templateContext,
          templatePayload,
        );

      await templateConfigurationSnapshotService.snapshotTemplateConfiguration(
        templateContext,
        templateCreationResult,
      );

      await templateFingerprintService.persistTemplateFingerprint(
        templateContext,
        templateCreationResult,
      );

      await templateAnalyticsInitializationService.initializeTemplateAnalytics(
        templateContext,
        templatePayload,
      );

      await templateAuditLoggingService.logTemplateLifecycleEvent({
        actor: {
          actorId: extractOptionalString(templatePayload?.createdBy),
          actorRole: extractOptionalString(templatePayload?.createdByRole),
          ipAddress: extractOptionalString(templatePayload?.createdFromIp),
          layer: extractOptionalString(templatePayload?.layer),
          userAgent: extractOptionalString(
            templatePayload?.createdFromUserAgent,
          ),
        },
        afterState: {
          academicYear: extractOptionalString(templatePayload?.academicYear),
          difficultyDistribution: templateCreationResult.difficultyDistribution,
          phaseConfigSnapshot: templateCreationResult.phaseConfigSnapshot,
          status: "draft",
          testId,
          timingProfile: templateCreationResult.timingProfile,
          totalQuestions: templateCreationResult.totalQuestions,
        },
        context: templateContext,
        eventType: "creation",
        metadata: {
          source: "testTemplateOnCreate",
          triggerPath: TESTS_DOCUMENT_PATH,
        },
      });
    },
  );
};

export const testTemplateOnCreate = functions.firestore
  .document(TESTS_DOCUMENT_PATH)
  .onCreate(handleTemplateCreated);
