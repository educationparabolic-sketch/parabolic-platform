import * as functions from "firebase-functions";
import {DecodedIdToken} from "firebase-admin/auth";
import {sendErrorResponse} from "../services/apiResponse";
import {getFirebaseAdminApp} from "../utils/firebaseAdmin";
import {loadEnvironmentConfig} from "../utils/environment";
import {sessionService, SessionStartValidationError} from "../services/session";
import {
  createMethodMiddleware,
  createMiddlewareHandler,
  createRequestValidationMiddleware,
  setRequestData,
} from "../middleware/framework";
import {MiddlewareRequest} from "../types/middleware";
import {createAuthenticationMiddleware} from "../middleware/auth";
import {createRoleAuthorizationMiddleware} from "../middleware/role";
import {systemEventTopologyService} from "../services/systemEventTopology";
import {studentOnboardingActivationService} from
  "../services/studentOnboardingActivation";
import {EnvironmentConfig} from "../types/environment";
import {
  StudentExamLaunchIntent,
  StudentExamLaunchResult,
} from "../../../shared/contracts/apiDtos";

interface ExamStartRequestBody {
  intent?: unknown;
  runId?: unknown;
}

interface ExamStartRequestDependencies {
  activateInvitedStudentOnFirstLogin?: (
    input: {instituteId: string; studentId: string},
  ) => Promise<void>;
  loadEnvironmentConfig?: () => Promise<EnvironmentConfig>;
  startSession: typeof sessionService.startSession;
  verifyIdToken: (idToken: string) => Promise<DecodedIdToken>;
}

interface ExamStartValidatedRequestData extends Record<string, unknown> {
  instituteId: string;
  intent: StudentExamLaunchIntent;
  licenseLayer: "L0" | "L1" | "L2" | "L3";
  runId: string;
  studentId: string;
  studentUid: string;
}

const normalizeRequiredBodyField = (
  value: unknown,
  fieldName: string,
): string => {
  if (typeof value !== "string") {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a non-empty string.`,
    );
  }

  return normalizedValue;
};

const normalizeLaunchIntent = (value: unknown): StudentExamLaunchIntent => {
  const normalizedValue = normalizeRequiredBodyField(value, "intent");
  if (normalizedValue !== "start" && normalizedValue !== "resume") {
    throw new SessionStartValidationError(
      "VALIDATION_ERROR",
      "Field \"intent\" must be start or resume.",
    );
  }
  return normalizedValue;
};

const buildExamUrl = (
  examBaseUrl: string,
  sessionId: string,
  launchCredential: string,
): string => {
  let baseUrl: URL;
  try {
    baseUrl = new URL(examBaseUrl);
  } catch {
    throw new Error("EXAM_BASE_URL must be an absolute URL.");
  }
  if (baseUrl.protocol !== "https:" && baseUrl.protocol !== "http:") {
    throw new Error("EXAM_BASE_URL must use HTTP or HTTPS.");
  }
  const examUrl = new URL(
    `/session/${encodeURIComponent(sessionId)}`,
    `${baseUrl.origin}/`,
  );
  examUrl.searchParams.set("token", launchCredential);
  return examUrl.toString();
};

export const createExamStartHandler = (
  dependencies: ExamStartRequestDependencies,
) => createMiddlewareHandler({
  controller: async (
    request: MiddlewareRequest,
    response: functions.Response,
  ): Promise<void> => {
    const requestId = request.context.requestId;
    const validatedData = request.context
      .requestData as ExamStartValidatedRequestData;
    const environmentConfig = await (
      dependencies.loadEnvironmentConfig ?? loadEnvironmentConfig
    )();
    const result = await systemEventTopologyService.executeEventHandler(
      "SessionStarted",
      "examStart",
      {
        instituteId: validatedData.instituteId,
        requestId,
        runId: validatedData.runId,
        studentId: validatedData.studentId,
      },
      async () => dependencies.startSession(validatedData),
    );
    const data: StudentExamLaunchResult = {
      disposition: result.disposition,
      examUrl: buildExamUrl(
        environmentConfig.endpoints.examBaseUrl,
        result.sessionId,
        result.launchCredential,
      ),
      launchCredential: result.launchCredential,
      sessionId: result.sessionId,
      status: result.status,
    };

    response.status(result.disposition === "created" ? 201 : 200).json({
      code: "OK",
      data,
      message: result.disposition === "created" ?
        "Exam session created." :
        "Existing exam session located.",
      requestId,
      success: true,
      timestamp: new Date().toISOString(),
    });
  },
  middlewares: [
    createMethodMiddleware("POST"),
    createAuthenticationMiddleware(dependencies, {
      attachStudentId: true,
      promoteInvitedStudentOnAuthenticate: true,
    }),
    createRoleAuthorizationMiddleware({
      allowedRoles: ["student"],
      forbiddenMessage: "Only students can start exam sessions.",
    }),
    createRequestValidationMiddleware({
      validator: (request: MiddlewareRequest): void => {
        const body = (request.body ?? {}) as ExamStartRequestBody;
        const identity = request.context.identity;
        if (
          !identity?.instituteId ||
          !identity.studentId ||
          !identity.licenseLayer
        ) {
          throw new SessionStartValidationError(
            "TENANT_MISMATCH",
            "Authenticated Student launch authority is incomplete.",
          );
        }
        const runId = normalizeRequiredBodyField(body.runId, "runId");

        setRequestData(request, {
          instituteId: identity.instituteId,
          intent: normalizeLaunchIntent(body.intent),
          licenseLayer: identity.licenseLayer,
          runId,
          studentId: identity.studentId,
          studentUid: identity.uid,
        });
      },
    }),
  ],
  onError: (error, context): boolean => {
    if (error instanceof SessionStartValidationError) {
      context.logger.warn("Exam start request rejected", {
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
  service: "ExamStartApi",
});

export const handleExamStartRequest = createExamStartHandler({
  activateInvitedStudentOnFirstLogin:
    studentOnboardingActivationService.activateInvitedStudentOnFirstLogin.bind(
      studentOnboardingActivationService,
    ),
  loadEnvironmentConfig,
  startSession: sessionService.startSession.bind(sessionService),
  verifyIdToken: (idToken: string) =>
    getFirebaseAdminApp().auth().verifyIdToken(idToken, true),
});
