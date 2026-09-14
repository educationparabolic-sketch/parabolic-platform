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
import {ADMIN_TEACHER_ROLES} from "../policy/adminRolePolicy";
import {createTenantGuardMiddleware} from "../middleware/tenant";
import {adminQuestionLibraryService} from "../services/adminQuestionLibrary";
import {
  AdminQuestionDetailSuccessResponse,
  AdminQuestionLibrarySuccessResponse,
  AdminQuestionLibraryValidationError,
} from "../types/adminQuestionLibrary";
import {MiddlewareRequest} from "../types/middleware";

interface AdminQuestionLibraryDependencies {
  getLibrary: typeof adminQuestionLibraryService.getLibrary;
  getQuestionDetail: typeof adminQuestionLibraryService.getQuestionDetail;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

type ValidatedQuestionRead =
  | {action: "detail"; payload: ReturnType<typeof adminQuestionLibraryService.normalizeDetailRequest>}
  | {action: "list"; payload: ReturnType<typeof adminQuestionLibraryService.normalizeRequest>};

const buildSuccessResponse = (
  result: Awaited<ReturnType<typeof adminQuestionLibraryService.getLibrary>>,
  requestId: string,
  timestamp: string,
): AdminQuestionLibrarySuccessResponse => ({
  code: "OK",
  data: result,
  message: "Question library loaded.",
  requestId,
  success: true,
  timestamp,
});

export const createAdminQuestionLibraryHandler = (
  dependencies: AdminQuestionLibraryDependencies,
) => createMiddlewareHandler({
  controller: async (
    request: MiddlewareRequest,
    response: functions.Response,
  ): Promise<void> => {
    const validatedRequest = request.context
      .requestData as unknown as ValidatedQuestionRead;

    if (validatedRequest.action === "detail") {
      const result = await dependencies.getQuestionDetail(validatedRequest.payload);
      const body: AdminQuestionDetailSuccessResponse = {
        code: "OK",
        data: result,
        message: "Question detail loaded.",
        requestId: request.context.requestId,
        success: true,
        timestamp: new Date().toISOString(),
      };
      response.status(200).json(body);
      return;
    }

    const result = await dependencies.getLibrary(validatedRequest.payload);

    response.status(200).json(
      buildSuccessResponse(
        result,
        request.context.requestId,
        new Date().toISOString(),
      ),
    );
  },
  middlewares: [
    createMethodMiddleware("GET"),
    createAuthenticationMiddleware(dependencies),
    createTenantGuardMiddleware({
      allowVendorBypass: false,
      resolveRequestInstituteId: (request): string | null =>
        request.context.identity?.instituteId ?? null,
    }),
    createRoleAuthorizationMiddleware({
      allowedRoles: ADMIN_TEACHER_ROLES,
      forbiddenMessage:
        "Only teacher and admin roles can access question library records.",
    }),
    createRequestValidationMiddleware({
      validator: (request: MiddlewareRequest): void => {
        const identity = request.context.identity;
        if (request.params.questionId) {
          setRequestData(request, {
            action: "detail",
            payload: adminQuestionLibraryService.normalizeDetailRequest({
              actorId: identity?.uid,
              actorRole: identity?.role,
              instituteId: identity?.instituteId,
              questionId: request.params.questionId,
            }),
          });
          return;
        }
        const validatedRequest = adminQuestionLibraryService.normalizeRequest({
          academicYear: request.query.academicYear,
          actorId: identity?.uid,
          actorRole: identity?.role,
          additionalTag: request.query.additionalTag,
          chapter: request.query.chapter,
          cursor: request.query.cursor,
          difficulty: request.query.difficulty,
          examType: request.query.examType,
          instituteId: identity?.instituteId,
          limit: request.query.limit,
          primaryTag: request.query.primaryTag,
          query: request.query.query,
          questionType: request.query.questionType,
          secondaryTag: request.query.secondaryTag,
          status: request.query.status,
          subject: request.query.subject,
          thermalState: request.query.thermalState,
          usedInTemplate: request.query.usedInTemplate,
        });

        setRequestData(request, {action: "list", payload: validatedRequest});
      },
    }),
  ],
  onError: (error, context): boolean => {
    if (error instanceof AdminQuestionLibraryValidationError) {
      context.logger.warn("Question library request rejected.", {
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
  service: "AdminQuestionLibraryApi",
});

export const handleAdminQuestionLibraryRequest =
  createAdminQuestionLibraryHandler({
    getLibrary: adminQuestionLibraryService.getLibrary.bind(
      adminQuestionLibraryService,
    ),
    getQuestionDetail: adminQuestionLibraryService.getQuestionDetail.bind(
      adminQuestionLibraryService,
    ),
    verifyIdToken: (idToken: string) =>
      getFirebaseAdminApp().auth().verifyIdToken(idToken, true),
  });

export {buildSuccessResponse};
