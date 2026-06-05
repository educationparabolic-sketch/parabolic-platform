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
import {createTenantGuardMiddleware} from "../middleware/tenant";
import {
  adminStudentOnboardingResendService,
} from "../services/adminStudentOnboardingResend";
import {
  AdminStudentOnboardingResendRequest,
  AdminStudentOnboardingResendSuccessResponse,
  AdminStudentOnboardingResendValidatedRequest,
  AdminStudentOnboardingResendValidationError,
} from "../types/adminStudentOnboardingResend";
import {MiddlewareRequest} from "../types/middleware";

interface AdminStudentOnboardingResendDependencies {
  resendOnboardingEmail:
    typeof adminStudentOnboardingResendService.resendOnboardingEmail;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

const buildSuccessResponse = (
  result: Awaited<ReturnType<typeof adminStudentOnboardingResendService.resendOnboardingEmail>>,
  requestId: string,
  timestamp: string,
): AdminStudentOnboardingResendSuccessResponse => ({
  code: "OK",
  data: result,
  message: "Onboarding email queued.",
  requestId,
  success: true,
  timestamp,
});

export const createAdminStudentOnboardingResendHandler = (
  dependencies: AdminStudentOnboardingResendDependencies,
) => createMiddlewareHandler({
  controller: async (
    request: MiddlewareRequest,
    response: functions.Response,
  ): Promise<void> => {
    const validatedRequest = request.context
      .requestData as unknown as AdminStudentOnboardingResendValidatedRequest;
    const result = await dependencies.resendOnboardingEmail(validatedRequest);

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
    createTenantGuardMiddleware({
      allowVendorBypass: false,
      resolveRequestInstituteId: (request): string | null => {
        const body = (request.body ?? {}) as AdminStudentOnboardingResendRequest;
        return typeof body.instituteId === "string" ? body.instituteId : request.context.identity?.instituteId ?? null;
      },
    }),
    createRoleAuthorizationMiddleware({
      allowedRoles: ["admin"],
      forbiddenMessage:
        "Only admin roles can resend student onboarding emails.",
    }),
    createRequestValidationMiddleware({
      validator: (request: MiddlewareRequest): void => {
        const body = (request.body ?? {}) as Partial<AdminStudentOnboardingResendRequest>;
        const identity = request.context.identity;
        const validatedRequest = adminStudentOnboardingResendService.normalizeRequest({
          actorId: identity?.uid,
          actorRole: identity?.role,
          instituteId: identity?.instituteId ?? body.instituteId,
          studentId: body.studentId,
        });

        setRequestData(
          request,
          validatedRequest as unknown as Record<string, unknown>,
        );
      },
    }),
  ],
  onError: (error, context): boolean => {
    if (error instanceof AdminStudentOnboardingResendValidationError) {
      context.logger.warn("Admin student onboarding resend request rejected.", {
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
  service: "AdminStudentOnboardingResendApi",
});

export const handleAdminStudentOnboardingResendRequest =
  createAdminStudentOnboardingResendHandler({
    resendOnboardingEmail:
      adminStudentOnboardingResendService.resendOnboardingEmail.bind(
        adminStudentOnboardingResendService,
      ),
    verifyIdToken: (idToken: string) =>
      getFirebaseAdminApp().auth().verifyIdToken(idToken),
  });

export {buildSuccessResponse};
