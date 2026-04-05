import {FieldValue} from "firebase-admin/firestore";
import {createLogger} from "./logging";
import {calibrationHistoryService} from "./calibrationHistory";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  CalibrationDeploymentError,
  DeployCalibrationVersionInput,
  DeployCalibrationVersionResult,
  DeployedInstituteCalibrationResult,
} from "../types/calibrationDeployment";

const GLOBAL_CALIBRATION_COLLECTION = "globalCalibration";
const INSTITUTES_COLLECTION = "institutes";
const CALIBRATION_COLLECTION = "calibration";
const CALIBRATION_HISTORY_COLLECTION = "calibrationHistory";
const LICENSE_COLLECTION = "license";
const LICENSE_CURRENT_DOCUMENT_ID = "current";
const LICENSE_MAIN_DOCUMENT_ID = "main";

const isPlainObject = (
  value: unknown,
): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value);

const normalizeRequiredString = (
  value: unknown,
  fieldName: string,
): string => {
  if (typeof value !== "string") {
    throw new CalibrationDeploymentError(
      "VALIDATION_ERROR",
      `Calibration field "${fieldName}" must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new CalibrationDeploymentError(
      "VALIDATION_ERROR",
      `Calibration field "${fieldName}" must be a non-empty string.`,
    );
  }

  return normalizedValue;
};

const normalizeTargetInstitutes = (
  value: unknown,
): string[] => {
  if (!Array.isArray(value)) {
    throw new CalibrationDeploymentError(
      "VALIDATION_ERROR",
      "Calibration field \"targetInstitutes\" must be an array.",
    );
  }

  const normalizedInstitutes = value.map((instituteId, index) =>
    normalizeRequiredString(
      instituteId,
      `targetInstitutes[${index}]`,
    ));
  const deduplicatedInstitutes = Array.from(new Set(normalizedInstitutes));

  if (deduplicatedInstitutes.length === 0) {
    throw new CalibrationDeploymentError(
      "VALIDATION_ERROR",
      "Calibration field \"targetInstitutes\" must contain at least one " +
        "institute.",
    );
  }

  return deduplicatedInstitutes;
};

const buildCalibrationSourcePath = (versionId: string): string =>
  `${GLOBAL_CALIBRATION_COLLECTION}/${versionId}`;

const buildInstitutePath = (instituteId: string): string =>
  `${INSTITUTES_COLLECTION}/${instituteId}`;

const buildInstituteCalibrationPath = (
  instituteId: string,
  versionId: string,
): string =>
  `${buildInstitutePath(instituteId)}/` +
  `${CALIBRATION_COLLECTION}/${versionId}`;

const buildLicensePath = (
  instituteId: string,
  documentId: string,
): string =>
  `${buildInstitutePath(instituteId)}/` +
  `${LICENSE_COLLECTION}/${documentId}`;

const buildInstituteCalibrationHistoryPath = (
  instituteId: string,
  deploymentLogId: string,
): string =>
  `${buildInstitutePath(instituteId)}/` +
  `${CALIBRATION_HISTORY_COLLECTION}/${deploymentLogId}`;

const buildDeploymentRecord = (
  instituteId: string,
  changedBy: string,
  calibrationSourcePath: string,
  sourceData: Record<string, unknown>,
): Record<string, unknown> => ({
  ...sourceData,
  deployedAt: FieldValue.serverTimestamp(),
  deployedBy: changedBy,
  instituteId,
  sourceCalibrationPath: calibrationSourcePath,
});

const buildLicenseMetadata = (
  baseLicenseData: Record<string, unknown>,
  versionId: string,
  changedBy: string,
): Record<string, unknown> => ({
  ...baseLicenseData,
  calibrationVersion: versionId,
  updatedAt: FieldValue.serverTimestamp(),
  updatedBy: changedBy,
});

/**
 * Deploys an existing global calibration version to selected institutes.
 */
export class CalibrationDeploymentService {
  private readonly firestore = getFirestore();
  private readonly logger = createLogger("CalibrationDeploymentService");

  /**
   * Validates the deployment request and normalizes its payload.
   * @param {DeployCalibrationVersionInput} input Raw deployment input.
   * @return {DeployCalibrationVersionInput} Normalized deployment input.
   */
  private normalizeInput(
    input: DeployCalibrationVersionInput,
  ): DeployCalibrationVersionInput {
    return {
      changedBy: normalizeRequiredString(input.changedBy, "changedBy"),
      deploymentLogId: input.deploymentLogId === undefined ?
        undefined :
        normalizeRequiredString(input.deploymentLogId, "deploymentLogId"),
      targetInstitutes: normalizeTargetInstitutes(input.targetInstitutes),
      versionId: normalizeRequiredString(input.versionId, "versionId"),
    };
  }

  /**
   * Deploys the requested calibration version to all target institutes.
   * @param {DeployCalibrationVersionInput} input Vendor deployment request.
   * @return {Promise<DeployCalibrationVersionResult>} Deployment summary.
   */
  public async deployCalibrationVersion(
    input: DeployCalibrationVersionInput,
  ): Promise<DeployCalibrationVersionResult> {
    const normalizedInput = this.normalizeInput(input);
    const vendorCalibrationLogWrite =
      calibrationHistoryService.prepareVendorCalibrationLog({
        activatedBy: normalizedInput.changedBy,
        affectedInstitutes: normalizedInput.targetInstitutes,
        calibrationVersion: normalizedInput.versionId,
        logId: normalizedInput.deploymentLogId,
        rollbackAvailable: true,
      });
    const calibrationSourcePath = buildCalibrationSourcePath(
      normalizedInput.versionId,
    );
    const calibrationReference = this.firestore.doc(calibrationSourcePath);
    const calibrationSnapshot = await calibrationReference.get();

    if (!calibrationSnapshot.exists) {
      throw new CalibrationDeploymentError(
        "NOT_FOUND",
        `Calibration version "${normalizedInput.versionId}" does not exist.`,
      );
    }

    const calibrationData = calibrationSnapshot.data();

    if (!isPlainObject(calibrationData)) {
      throw new CalibrationDeploymentError(
        "INTERNAL_ERROR",
        `Calibration version "${normalizedInput.versionId}" is malformed.`,
      );
    }

    if (calibrationData.isActive !== true) {
      throw new CalibrationDeploymentError(
        "VALIDATION_ERROR",
        `Calibration version "${normalizedInput.versionId}" must be active ` +
          "before deployment.",
      );
    }

    const deployedInstitutes: DeployedInstituteCalibrationResult[] = [];

    for (const instituteId of normalizedInput.targetInstitutes) {
      const institutePath = buildInstitutePath(instituteId);
      const calibrationPath = buildInstituteCalibrationPath(
        instituteId,
        normalizedInput.versionId,
      );
      const calibrationHistoryPath = buildInstituteCalibrationHistoryPath(
        instituteId,
        vendorCalibrationLogWrite.logId,
      );
      const licensePath = buildLicensePath(
        instituteId,
        LICENSE_CURRENT_DOCUMENT_ID,
      );
      const compatibilityLicensePath = buildLicensePath(
        instituteId,
        LICENSE_MAIN_DOCUMENT_ID,
      );

      await this.firestore.runTransaction(async (transaction) => {
        const instituteReference = this.firestore.doc(institutePath);
        const calibrationReference = this.firestore.doc(calibrationPath);
        const licenseReference = this.firestore.doc(licensePath);
        const compatibilityLicenseReference = this.firestore.doc(
          compatibilityLicensePath,
        );

        const [
          instituteSnapshot,
          currentLicenseSnapshot,
          compatibilityLicenseSnapshot,
        ] = await Promise.all([
          transaction.get(instituteReference),
          transaction.get(licenseReference),
          transaction.get(compatibilityLicenseReference),
        ]);

        if (!instituteSnapshot.exists) {
          throw new CalibrationDeploymentError(
            "NOT_FOUND",
            `Institute "${instituteId}" does not exist.`,
          );
        }

        const currentLicenseData = currentLicenseSnapshot.data();
        const compatibilityLicenseData = compatibilityLicenseSnapshot.data();
        const baseLicenseData =
          isPlainObject(currentLicenseData) ? currentLicenseData :
            isPlainObject(compatibilityLicenseData) ?
              compatibilityLicenseData :
              null;

        if (!baseLicenseData) {
          throw new CalibrationDeploymentError(
            "NOT_FOUND",
            `Institute "${instituteId}" is missing license metadata.`,
          );
        }

        transaction.set(
          instituteReference,
          {
            calibrationVersion: normalizedInput.versionId,
          },
          {merge: true},
        );
        transaction.set(
          calibrationReference,
          buildDeploymentRecord(
            instituteId,
            normalizedInput.changedBy,
            calibrationSourcePath,
            calibrationData,
          ),
          {merge: true},
        );
        transaction.create(
          this.firestore.doc(calibrationHistoryPath),
          vendorCalibrationLogWrite.entry,
        );

        const nextLicenseMetadata = buildLicenseMetadata(
          baseLicenseData,
          normalizedInput.versionId,
          normalizedInput.changedBy,
        );

        transaction.set(licenseReference, nextLicenseMetadata, {merge: true});
        transaction.set(
          compatibilityLicenseReference,
          nextLicenseMetadata,
          {merge: true},
        );
      });

      deployedInstitutes.push({
        calibrationPath,
        calibrationHistoryPath,
        compatibilityLicensePath,
        instituteId,
        licensePath,
      });
    }

    await this.firestore
      .doc(vendorCalibrationLogWrite.path)
      .create(vendorCalibrationLogWrite.entry);

    this.logger.info("Calibration version deployed to institutes.", {
      calibrationSourcePath,
      changedBy: normalizedInput.changedBy,
      deployedInstituteCount: deployedInstitutes.length,
      deploymentLogId: vendorCalibrationLogWrite.logId,
      instituteIds: deployedInstitutes.map((entry) => entry.instituteId),
      versionId: normalizedInput.versionId,
    });

    return {
      calibrationSourcePath,
      deployedInstituteCount: deployedInstitutes.length,
      deployedInstitutes,
      deploymentLogId: vendorCalibrationLogWrite.logId,
      vendorCalibrationLogPath: vendorCalibrationLogWrite.path,
      versionId: normalizedInput.versionId,
    };
  }
}

export const calibrationDeploymentService = new CalibrationDeploymentService();
