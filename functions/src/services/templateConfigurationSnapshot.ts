import {createLogger} from "./logging";
import {
  TemplateConfigurationSnapshot,
  TemplateCreationContext,
  TemplateCreationResult,
} from "../types/templateCreation";
import {getFirestore} from "../utils/firebaseAdmin";

const INSTITUTES_COLLECTION = "institutes";
const TESTS_COLLECTION = "tests";

/**
 * Persists immutable template configuration snapshots for assignment use.
 */
export class TemplateConfigurationSnapshotService {
  private readonly firestore = getFirestore();
  private readonly logger = createLogger(
    "TemplateConfigurationSnapshotService",
  );

  /**
   * Stores deterministic template configuration snapshots on template create.
   * @param {TemplateCreationContext} context Trigger context identifiers.
   * @param {TemplateCreationResult} templateCreationResult
   * Validated template data.
   * @return {Promise<TemplateConfigurationSnapshot>}
   * Persisted snapshot payload.
   */
  public async snapshotTemplateConfiguration(
    context: TemplateCreationContext,
    templateCreationResult: TemplateCreationResult,
  ): Promise<TemplateConfigurationSnapshot> {
    const templatePath = `${INSTITUTES_COLLECTION}/${context.instituteId}/` +
      `${TESTS_COLLECTION}/${context.testId}`;
    const templateReference = this.firestore.doc(templatePath);
    const configurationSnapshot = templateCreationResult.configurationSnapshot;

    await templateReference.set({
      difficultyDistribution: configurationSnapshot.difficultyDistribution,
      phaseConfigSnapshot: configurationSnapshot.phaseConfigSnapshot,
      timingProfile: configurationSnapshot.timingProfile,
    }, {merge: true});

    this.logger.info("Template configuration snapshot persisted", {
      instituteId: context.instituteId,
      templatePath,
      testId: context.testId,
    });

    return configurationSnapshot;
  }
}

export const templateConfigurationSnapshotService =
  new TemplateConfigurationSnapshotService();
