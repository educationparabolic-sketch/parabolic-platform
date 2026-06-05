import {getFirestore} from "../utils/firebaseAdmin";
import {emailQueueService} from "./emailQueue";
import {
  AdminStudentOnboardingResendResult,
  AdminStudentOnboardingResendValidatedRequest,
  AdminStudentOnboardingResendValidationError,
} from "../types/adminStudentOnboardingResend";

const INSTITUTES_COLLECTION = "institutes";
const STUDENTS_COLLECTION = "students";
const STUDENT_ONBOARDING_TEMPLATE = "student_onboarding";

const toRequiredString = (value: unknown, fieldName: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AdminStudentOnboardingResendValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a non-empty string.`,
    );
  }

  return value.trim();
};

const toOptionalEmail = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
};

export class AdminStudentOnboardingResendService {
  constructor(
    private readonly dependencies: {
      enqueueEmailJob: typeof emailQueueService.enqueueEmailJob;
      firestore: FirebaseFirestore.Firestore;
      getCurrentTimestamp: () => Date;
    } = {
      enqueueEmailJob: emailQueueService.enqueueEmailJob.bind(emailQueueService),
      firestore: getFirestore(),
      getCurrentTimestamp: () => new Date(),
    },
  ) {}

  public normalizeRequest(
    input: Partial<AdminStudentOnboardingResendValidatedRequest> & {
      instituteId?: unknown;
      studentId?: unknown;
    },
  ): AdminStudentOnboardingResendValidatedRequest {
    return {
      actorId: toRequiredString(input.actorId, "actorId"),
      actorRole: toRequiredString(input.actorRole, "actorRole").toLowerCase(),
      instituteId: toRequiredString(input.instituteId, "instituteId"),
      studentId: toRequiredString(input.studentId, "studentId"),
    };
  }

  public async resendOnboardingEmail(
    request: AdminStudentOnboardingResendValidatedRequest,
  ): Promise<AdminStudentOnboardingResendResult> {
    const studentSnapshot = await this.dependencies.firestore
      .collection(INSTITUTES_COLLECTION)
      .doc(request.instituteId)
      .collection(STUDENTS_COLLECTION)
      .doc(request.studentId)
      .get();

    if (!studentSnapshot.exists) {
      throw new AdminStudentOnboardingResendValidationError(
        "VALIDATION_ERROR",
        `Student "${request.studentId}" was not found in the current institute roster.`,
      );
    }

    const studentData = studentSnapshot.data() ?? {};
    const status =
      typeof studentData.status === "string" ? studentData.status.trim().toLowerCase() : "";
    const recipientEmail = toOptionalEmail(studentData.email);
    const fullName =
      typeof studentData.fullName === "string" && studentData.fullName.trim().length > 0 ?
        studentData.fullName.trim() :
      typeof studentData.name === "string" && studentData.name.trim().length > 0 ?
        studentData.name.trim() :
        request.studentId;

    if (status !== "invited") {
      throw new AdminStudentOnboardingResendValidationError(
        "VALIDATION_ERROR",
        "Onboarding email resend is only available for invited students.",
      );
    }

    if (!recipientEmail) {
      throw new AdminStudentOnboardingResendValidationError(
        "VALIDATION_ERROR",
        "The selected student does not have a valid email address for onboarding resend.",
      );
    }

    const queuedAt = this.dependencies.getCurrentTimestamp().toISOString();
    const result = await this.dependencies.enqueueEmailJob({
      payload: {
        fullName,
        instituteId: request.instituteId,
        studentId: request.studentId,
      },
      recipientEmail,
      templateType: STUDENT_ONBOARDING_TEMPLATE,
    });

    return {
      jobId: result.jobId,
      jobPath: result.jobPath,
      queuedAt,
      recipientEmail,
      status: result.status,
      studentId: request.studentId,
    };
  }
}

export const adminStudentOnboardingResendService =
  new AdminStudentOnboardingResendService();
