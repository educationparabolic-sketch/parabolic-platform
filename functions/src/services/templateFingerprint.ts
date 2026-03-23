import {createHash} from "node:crypto";
import {createLogger} from "./logging";
import {
  TemplateCreationContext,
  TemplateCreationResult,
} from "../types/templateCreation";
import {getFirestore} from "../utils/firebaseAdmin";

const INSTITUTES_COLLECTION = "institutes";
const TESTS_COLLECTION = "tests";

interface TemplateFingerprintCanonicalPayload {
  difficultyDistribution: {
    easy: number;
    hard: number;
    medium: number;
  };
  phaseConfigSnapshot: {
    phase1Percent: number;
    phase2Percent: number;
    phase3Percent: number;
  };
  questionIds: string[];
}

const buildCanonicalPayload = (
  templateCreationResult: TemplateCreationResult,
): TemplateFingerprintCanonicalPayload => ({
  difficultyDistribution: {
    easy: templateCreationResult.difficultyDistribution.easy,
    hard: templateCreationResult.difficultyDistribution.hard,
    medium: templateCreationResult.difficultyDistribution.medium,
  },
  phaseConfigSnapshot: {
    phase1Percent: templateCreationResult.phaseConfigSnapshot.phase1Percent,
    phase2Percent: templateCreationResult.phaseConfigSnapshot.phase2Percent,
    phase3Percent: templateCreationResult.phaseConfigSnapshot.phase3Percent,
  },
  questionIds: [...templateCreationResult.questionIds],
});

const computeTemplateFingerprint = (
  payload: TemplateFingerprintCanonicalPayload,
): string => createHash("sha256")
  .update(JSON.stringify(payload))
  .digest("hex");

/**
 * Generates deterministic template fingerprints for
 * structural integrity checks.
 */
export class TemplateFingerprintService {
  private readonly firestore = getFirestore();
  private readonly logger = createLogger("TemplateFingerprintService");

  /**
   * Computes and persists a deterministic template fingerprint.
   * @param {TemplateCreationContext} context Trigger context identifiers.
   * @param {TemplateCreationResult} templateCreationResult
   * Validated template data.
   * @return {Promise<string>} Persisted template fingerprint.
   */
  public async persistTemplateFingerprint(
    context: TemplateCreationContext,
    templateCreationResult: TemplateCreationResult,
  ): Promise<string> {
    const templatePath = `${INSTITUTES_COLLECTION}/${context.instituteId}/` +
      `${TESTS_COLLECTION}/${context.testId}`;
    const templateReference = this.firestore.doc(templatePath);
    const canonicalPayload = buildCanonicalPayload(templateCreationResult);
    const templateFingerprint = computeTemplateFingerprint(canonicalPayload);

    await templateReference.set({
      templateFingerprint,
    }, {merge: true});

    this.logger.info("Template fingerprint persisted", {
      instituteId: context.instituteId,
      templatePath,
      testId: context.testId,
    });

    return templateFingerprint;
  }
}

export const templateFingerprintService = new TemplateFingerprintService();
