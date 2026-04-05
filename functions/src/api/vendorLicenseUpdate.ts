import * as functions from "firebase-functions";
import {DecodedIdToken} from "firebase-admin/auth";
import {sendErrorResponse} from "../services/apiResponse";
import {getFirebaseAdminApp} from "../utils/firebaseAdmin";
import {createAuthenticationMiddleware} from "../middleware/auth";
import {
  createMethodMiddleware,
  createMiddlewareHandler,
  createRequestValidationMiddleware,
  setRequestData,
} from "../middleware/framework";
import {createRoleAuthorizationMiddleware} from "../middleware/role";
import {MiddlewareRequest} from "../types/middleware";
import {
  LicenseManagementValidationError,
  UpdateInstituteLicenseInput,
  UpdateInstituteLicenseSuccessResponse,
} from "../types/licenseManagement";
import {licenseManagementService} from "../services/licenseManagement";

interface VendorLicenseUpdateRequestBody {
  billingPlan?: unknown;
  instituteId?: unknown;
  newLayer?: unknown;
}

interface VendorLicenseUpdateDependencies {
  updateInstituteLicense:
    typeof licenseManagementService.updateInstituteLicense;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

const normalizeRequiredString = (
  value: unknown,
  fieldName: string,
): string => {
  if (typeof value !== "string") {
    throw new LicenseManagementValidationError(
      "VALIDATION_ERROR",
      `License field "${fieldName}" must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new LicenseManagementValidationError(
      "VALIDATION_ERROR",
      `License field "${fieldName}" must be a non-empty string.`,
    );
  }

  return normalizedValue;
};

const buildSuccessResponse = (
  result: Awaited<
    ReturnType<typeof licenseManagementService.updateInstituteLicense>
  >,
  requestId: string,
  timestamp: string,
): UpdateInstituteLicenseSuccessResponse => ({
  code: "OK",
  data: result,
  message: "Institute license updated.",
  requestId,
  success: true,
  timestamp,
});

export const createVendorLicenseUpdateHandler = (
  dependencies: VendorLicenseUpdateDependencies,
) => createMiddlewareHandler({
  controller: async (
    request: MiddlewareRequest,
    response: functions.Response,
  ): Promise<void> => {
    const requestData = request.context
      .requestData as unknown as UpdateInstituteLicenseInput;
    const result = await dependencies.updateInstituteLicense(requestData);

    response.status(200).json(
      buildSuccessResponse(
        result,
        request.context.requestId,
        new Date().toISOString(),
      ),
    );
  },
  middlewares: [
    createMethodMiddleware("POST"),
    createAuthenticationMiddleware(dependencies),
    createRoleAuthorizationMiddleware({
      allowedRoles: ["vendor"],
      forbiddenMessage:
        "Only vendor roles can update institute licenses.",
    }),
    createRequestValidationMiddleware({
      validator: (request: MiddlewareRequest): void => {
        const body = (request.body ?? {}) as VendorLicenseUpdateRequestBody;
        const changedBy = request.context.identity?.uid;

        setRequestData(request, {
          billingPlan: normalizeRequiredString(body.billingPlan, "billingPlan"),
          changedBy: normalizeRequiredString(changedBy, "changedBy"),
          instituteId: normalizeRequiredString(body.instituteId, "instituteId"),
          newLayer: normalizeRequiredString(body.newLayer, "newLayer"),
        });
      },
    }),
  ],
  onError: (error, context): boolean => {
    if (error instanceof LicenseManagementValidationError) {
      context.logger.warn("Vendor license update request rejected.", {
        code: error.code,
        error,
      });
      sendErrorResponse(
        context.response,
        context.requestId,
        error.code,
        error.message,
      );
      return true;
    }

    return false;
  },
  service: "VendorLicenseUpdateApi",
});

export const handleVendorLicenseUpdateRequest =
  createVendorLicenseUpdateHandler({
    updateInstituteLicense:
      licenseManagementService.updateInstituteLicense.bind(
        licenseManagementService,
      ),
    verifyIdToken: (idToken: string) =>
      getFirebaseAdminApp().auth().verifyIdToken(idToken),
  });

export {buildSuccessResponse};
