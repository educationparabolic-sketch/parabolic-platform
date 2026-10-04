import {getFirestore} from "../utils/firebaseAdmin";
import {
  InstituteAuthorityEnforcementService,
} from "./instituteAuthorityEnforcement";

const INSTITUTES_COLLECTION = "institutes";
const STUDENTS_COLLECTION = "students";

export interface StudentOnboardingActivationRequest {
  instituteId: string;
  studentId: string;
}

export class StudentOnboardingActivationService {
  private readonly authority: Pick<
    InstituteAuthorityEnforcementService,
    "assertStudentActivationCapacity" | "readCurrentAuthority"
  >;

  constructor(
    private readonly dependencies: {
      authority?: Pick<
        InstituteAuthorityEnforcementService,
        "assertStudentActivationCapacity" | "readCurrentAuthority"
      >;
      firestore: FirebaseFirestore.Firestore;
      getCurrentTimestamp: () => Date;
    } = {
      firestore: getFirestore(),
      getCurrentTimestamp: () => new Date(),
    },
  ) {
    this.authority = dependencies.authority ??
      new InstituteAuthorityEnforcementService({
        firestore: dependencies.firestore,
        now: dependencies.getCurrentTimestamp,
      });
  }

  public async activateInvitedStudentOnFirstLogin(
    request: StudentOnboardingActivationRequest,
  ): Promise<void> {
    const instituteId = request.instituteId.trim();
    const studentId = request.studentId.trim();

    if (!instituteId || !studentId) {
      return;
    }

    const studentRef = this.dependencies.firestore
      .collection(INSTITUTES_COLLECTION)
      .doc(instituteId)
      .collection(STUDENTS_COLLECTION)
      .doc(studentId);

    await this.dependencies.firestore.runTransaction(async (transaction) => {
      const studentSnapshot = await transaction.get(studentRef);
      if (!studentSnapshot.exists) {
        return;
      }

      const studentData = studentSnapshot.data() ?? {};
      const currentStatus =
        typeof studentData.status === "string" ?
          studentData.status.trim().toLowerCase() :
          "";

      if (currentStatus !== "invited") {
        return;
      }

      const authority = await this.authority.readCurrentAuthority(
        transaction,
        instituteId,
      );
      await this.authority.assertStudentActivationCapacity(
        transaction,
        authority,
      );

      const transitionTimestamp = this.dependencies.getCurrentTimestamp();
      transaction.update(studentRef, {
        activatedAt:
          studentData.activatedAt ?? studentData.firstLoginAt ?? transitionTimestamp,
        firstLoginAt:
          studentData.firstLoginAt ?? studentData.activatedAt ?? transitionTimestamp,
        lastActive: transitionTimestamp,
        lastActiveAt: transitionTimestamp,
        status: "active",
        statusUpdatedAt: transitionTimestamp,
      });
    });
  }
}

export const studentOnboardingActivationService =
  new StudentOnboardingActivationService();
