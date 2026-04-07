import {createLogger} from "./logging";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  administrativeActionLoggingService,
} from "./administrativeActionLogging";
import {
  StudentSoftDeleteResult,
  StudentSoftDeleteValidatedRequest,
  StudentSoftDeleteValidationError,
} from "../types/studentSoftDelete";

const INSTITUTES_COLLECTION = "institutes";
const STUDENTS_COLLECTION = "students";

interface StudentSoftDeleteDependencies {
  firestore: FirebaseFirestore.Firestore;
  logStudentSoftDelete:
    typeof administrativeActionLoggingService.logStudentSoftDelete;
}

interface StudentRecord {
  deleted?: unknown;
  studentId?: unknown;
}

const normalizeRequiredString = (value: unknown, fieldName: string): string => {
  if (typeof value !== "string") {
    throw new StudentSoftDeleteValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new StudentSoftDeleteValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a non-empty string.`,
    );
  }

  return normalizedValue;
};

const normalizeOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalizedValue = value.trim();
  return normalizedValue || undefined;
};

const isDeletedStudentRecord = (value: unknown): boolean =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  (value as StudentRecord).deleted === true;

/**
 * Implements Build 104 soft deletion for student identity records.
 */
export class StudentSoftDeleteService {
  private readonly logger = createLogger("StudentSoftDeleteService");

  /**
   * @param {StudentSoftDeleteDependencies} dependencies Runtime collaborators.
   */
  constructor(
    private readonly dependencies: StudentSoftDeleteDependencies = {
      firestore: getFirestore(),
      logStudentSoftDelete:
        administrativeActionLoggingService.logStudentSoftDelete.bind(
          administrativeActionLoggingService,
        ),
    },
  ) {}

  /**
   * Validates and normalizes a soft-delete request payload.
   * @param {Partial<StudentSoftDeleteValidatedRequest>} input Raw request data.
   * @return {StudentSoftDeleteValidatedRequest} Typed soft-delete request.
   */
  public normalizeRequest(
    input: Partial<StudentSoftDeleteValidatedRequest>,
  ): StudentSoftDeleteValidatedRequest {
    return {
      actorId: normalizeRequiredString(input.actorId, "actorId"),
      actorRole: normalizeRequiredString(input.actorRole, "actorRole"),
      instituteId: normalizeRequiredString(input.instituteId, "instituteId"),
      ipAddress: normalizeOptionalString(input.ipAddress),
      studentId: normalizeRequiredString(input.studentId, "studentId"),
      userAgent: normalizeOptionalString(input.userAgent),
    };
  }

  /**
   * Marks a student document as deleted without touching sessions or analytics.
   * @param {StudentSoftDeleteValidatedRequest} request Validated request.
   * @return {Promise<StudentSoftDeleteResult>} Soft-delete result metadata.
   */
  public async softDeleteStudent(
    request: StudentSoftDeleteValidatedRequest,
  ): Promise<StudentSoftDeleteResult> {
    const instituteId = normalizeRequiredString(
      request.instituteId,
      "instituteId",
    );
    const studentId = normalizeRequiredString(request.studentId, "studentId");
    const studentReference = this.dependencies.firestore
      .collection(INSTITUTES_COLLECTION)
      .doc(instituteId)
      .collection(STUDENTS_COLLECTION)
      .doc(studentId);
    const studentSnapshot = await studentReference.get();

    if (!studentSnapshot.exists) {
      throw new StudentSoftDeleteValidationError(
        "NOT_FOUND",
        "Student record was not found for soft delete.",
      );
    }

    const studentData = (studentSnapshot.data() ?? {}) as StudentRecord;
    const alreadyDeleted = isDeletedStudentRecord(studentData);

    if (!alreadyDeleted) {
      await studentReference.set({deleted: true}, {merge: true});
      await this.dependencies.logStudentSoftDelete({
        actorId: request.actorId,
        actorRole: request.actorRole,
        afterState: {
          deleted: true,
          studentId,
        },
        beforeState: {
          deleted: studentData.deleted === true,
          studentId:
            typeof studentData.studentId === "string" &&
              studentData.studentId.trim() ?
              studentData.studentId.trim() :
              studentId,
        },
        entityId: studentId,
        instituteId,
        ipAddress: request.ipAddress,
        metadata: {
          deleteMode: "soft",
          preservesAnalytics: true,
          preservesSessionHistory: true,
        },
        userAgent: request.userAgent,
      });
    }

    this.logger.info("Student soft delete processed.", {
      alreadyDeleted,
      instituteId,
      studentId,
    });

    return {
      alreadyDeleted,
      analyticsPreserved: true,
      deleted: true,
      instituteId,
      sessionHistoryPreserved: true,
      studentId,
    };
  }
}

export const studentSoftDeleteService = new StudentSoftDeleteService();
