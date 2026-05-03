import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {createLogger} from "./logging";
import {getFirebaseAdminApp, getFirestore} from "../utils/firebaseAdmin";
import {
  administrativeActionLoggingService,
} from "./administrativeActionLogging";
import {
  StudentBulkIngestionResult,
  StudentBulkIngestionRowAction,
  StudentBulkIngestionRowResult,
  StudentBulkIngestionStudentInput,
  StudentBulkIngestionValidatedRequest,
  StudentBulkIngestionValidatedRow,
  StudentBulkIngestionValidationError,
} from "../types/studentBulkIngestion";
import {LicenseLayer} from "../types/middleware";

const INSTITUTES_COLLECTION = "institutes";
const STUDENTS_COLLECTION = "students";
const AUTH_NOT_FOUND_CODE = "auth/user-not-found";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CSV_REQUIRED_HEADERS = ["studentid", "fullname", "email", "batch"];

interface StudentBulkIngestionAuthUserRecord {
  disabled?: boolean;
  email?: string;
  uid: string;
}

interface StudentBulkIngestionAuthDependencies {
  createUser: (input: {
    disabled?: boolean;
    displayName?: string;
    email: string;
    uid: string;
  }) => Promise<StudentBulkIngestionAuthUserRecord>;
  deleteUser: (uid: string) => Promise<void>;
  getUser: (uid: string) => Promise<StudentBulkIngestionAuthUserRecord>;
  setCustomUserClaims: (
    uid: string,
    claims: Record<string, unknown>,
  ) => Promise<void>;
  updateUser: (uid: string, input: {
    disabled?: boolean;
    displayName?: string;
    email?: string;
  }) => Promise<StudentBulkIngestionAuthUserRecord>;
}

interface StudentBulkIngestionDependencies {
  auth: StudentBulkIngestionAuthDependencies;
  firestore: FirebaseFirestore.Firestore;
  getCurrentTimestamp: () => Date;
  logStudentImport:
    typeof administrativeActionLoggingService.logStudentImport;
}

interface StudentDocumentRecord {
  batch?: unknown;
  batchId?: unknown;
  createdAt?: unknown;
  deleted?: unknown;
  email?: unknown;
  enrollmentYear?: unknown;
  fullName?: unknown;
  name?: unknown;
  parentEmail?: unknown;
  phone?: unknown;
  status?: unknown;
  studentId?: unknown;
}

interface ExistingStudentRecord {
  batchId?: string;
  createdAt?: FirebaseFirestore.Timestamp;
  deleted: boolean;
  email?: string;
  fullName?: string;
  parentEmail?: string;
  phone?: string;
  status?: string;
  studentId: string;
}

interface PreparedRow {
  action: Extract<StudentBulkIngestionRowAction, "create" | "update">;
  existingStudent?: ExistingStudentRecord;
  row: StudentBulkIngestionValidatedRow;
  rowResult: StudentBulkIngestionRowResult;
}

const normalizeRequiredString = (value: unknown, fieldName: string): string => {
  if (typeof value !== "string") {
    throw new StudentBulkIngestionValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a string.`,
    );
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new StudentBulkIngestionValidationError(
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

const normalizeOptionalEmail = (
  value: unknown,
  fieldName: string,
): string | undefined => {
  const normalizedValue = normalizeOptionalString(value);

  if (!normalizedValue) {
    return undefined;
  }

  const normalizedEmail = normalizedValue.toLowerCase();

  if (!EMAIL_PATTERN.test(normalizedEmail)) {
    throw new StudentBulkIngestionValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a valid email address.`,
    );
  }

  return normalizedEmail;
};

const normalizeCsvHeader = (value: string): string =>
  value.trim().toLowerCase().replace(/[\s_-]+/g, "");

const parseCsvLine = (line: string): string[] => {
  const values: string[] = [];
  let currentValue = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === "\"") {
      if (inQuotes && nextCharacter === "\"") {
        currentValue += "\"";
        index += 1;
        continue;
      }

      inQuotes = !inQuotes;
      continue;
    }

    if (character === "," && !inQuotes) {
      values.push(currentValue.trim());
      currentValue = "";
      continue;
    }

    currentValue += character;
  }

  if (inQuotes) {
    throw new StudentBulkIngestionValidationError(
      "VALIDATION_ERROR",
      "CSV content contains an unterminated quoted field.",
    );
  }

  values.push(currentValue.trim());
  return values;
};

const parseCsvContent = (
  csvContent: string,
): StudentBulkIngestionStudentInput[] => {
  const normalizedContent = csvContent.trim();

  if (!normalizedContent) {
    throw new StudentBulkIngestionValidationError(
      "VALIDATION_ERROR",
      "Field \"csvContent\" must include at least one data row.",
    );
  }

  const lines = normalizedContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => Boolean(line));

  if (lines.length < 2) {
    throw new StudentBulkIngestionValidationError(
      "VALIDATION_ERROR",
      "CSV content must include a header row and at least one student row.",
    );
  }

  const headers = parseCsvLine(lines[0] ?? "");
  const headerMap = new Map<string, number>();

  headers.forEach((header, index) => {
    headerMap.set(normalizeCsvHeader(header), index);
  });

  for (const requiredHeader of CSV_REQUIRED_HEADERS) {
    if (!headerMap.has(requiredHeader)) {
      throw new StudentBulkIngestionValidationError(
        "VALIDATION_ERROR",
        `CSV content is missing required header "${requiredHeader}".`,
      );
    }
  }

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const readColumn = (headerName: string): string | undefined => {
      const index = headerMap.get(headerName);
      if (index === undefined) {
        return undefined;
      }

      return values[index]?.trim();
    };

    return {
      batch: readColumn("batch") ?? readColumn("batchid"),
      class: readColumn("class"),
      email: readColumn("email"),
      enrollmentYear: readColumn("enrollmentyear"),
      fullName: readColumn("fullname") ?? readColumn("name"),
      parentEmail: readColumn("parentemail"),
      phone: readColumn("phone"),
      studentId: readColumn("studentid"),
    };
  });
};

const toStudentDocumentRecord = (
  value: FirebaseFirestore.DocumentData | undefined,
  studentId: string,
): ExistingStudentRecord => {
  const record = (value ?? {}) as StudentDocumentRecord;

  return {
    batchId:
      normalizeOptionalString(record.batchId) ??
      normalizeOptionalString(record.batch),
    createdAt:
      record.createdAt instanceof Timestamp ? record.createdAt : undefined,
    deleted: record.deleted === true,
    email: normalizeOptionalEmail(record.email, "email"),
    fullName:
      normalizeOptionalString(record.fullName) ??
      normalizeOptionalString(record.name),
    parentEmail: normalizeOptionalEmail(record.parentEmail, "parentEmail"),
    phone: normalizeOptionalString(record.phone),
    status: normalizeOptionalString(record.status),
    studentId:
      normalizeOptionalString(record.studentId) ??
      studentId,
  };
};

/**
 * Validates and commits student roster uploads.
 */
export class StudentBulkIngestionService {
  private readonly logger = createLogger("StudentBulkIngestionService");

  /**
   * @param {StudentBulkIngestionDependencies} dependencies Runtime collaborators.
   */
  constructor(
    private readonly dependencies: StudentBulkIngestionDependencies = {
      auth: {
        createUser: (input) => getFirebaseAdminApp().auth().createUser(input),
        deleteUser: (uid) => getFirebaseAdminApp().auth().deleteUser(uid),
        getUser: (uid) => getFirebaseAdminApp().auth().getUser(uid),
        setCustomUserClaims: (uid, claims) =>
          getFirebaseAdminApp().auth().setCustomUserClaims(uid, claims),
        updateUser: (uid, input) =>
          getFirebaseAdminApp().auth().updateUser(uid, input),
      },
      firestore: getFirestore(),
      getCurrentTimestamp: () => new Date(),
      logStudentImport:
        administrativeActionLoggingService.logStudentImport.bind(
          administrativeActionLoggingService,
        ),
    },
  ) {}

  /**
   * Normalizes request payloads into a validated ingestion request.
   * @param {Partial<StudentBulkIngestionValidatedRequest>} input Raw request.
   * @return {StudentBulkIngestionValidatedRequest} Validated request.
   */
  public normalizeRequest(
    input: Partial<StudentBulkIngestionValidatedRequest> & {
      commit?: unknown;
      csvContent?: unknown;
      deactivateMissing?: unknown;
      students?: unknown;
    },
  ): StudentBulkIngestionValidatedRequest {
    const actorLicenseLayer = normalizeRequiredString(
      input.actorLicenseLayer,
      "actorLicenseLayer",
    ) as LicenseLayer;

    if (
      actorLicenseLayer !== "L0" &&
      actorLicenseLayer !== "L1" &&
      actorLicenseLayer !== "L2" &&
      actorLicenseLayer !== "L3"
    ) {
      throw new StudentBulkIngestionValidationError(
        "VALIDATION_ERROR",
        "Field \"actorLicenseLayer\" must be a supported license layer.",
      );
    }

    const rawStudents = Array.isArray(input.students) ? input.students : null;
    const csvContent = normalizeOptionalString(input.csvContent);

    if (!rawStudents && !csvContent) {
      throw new StudentBulkIngestionValidationError(
        "VALIDATION_ERROR",
        "Provide either \"students\" or \"csvContent\" for bulk ingestion.",
      );
    }

    if (rawStudents && csvContent) {
      throw new StudentBulkIngestionValidationError(
        "VALIDATION_ERROR",
        "Provide only one of \"students\" or \"csvContent\" per request.",
      );
    }

    const parsedStudents = rawStudents ??
      parseCsvContent(csvContent ?? "");

    if (parsedStudents.length === 0) {
      throw new StudentBulkIngestionValidationError(
        "VALIDATION_ERROR",
        "Bulk ingestion requires at least one student row.",
      );
    }

    const rows = parsedStudents.map((row, index) =>
      this.normalizeRow(row, index + 1),
    );

    return {
      actorId: normalizeRequiredString(input.actorId, "actorId"),
      actorLicenseLayer,
      actorRole: normalizeRequiredString(input.actorRole, "actorRole")
        .toLowerCase(),
      commit: input.commit === true,
      deactivateMissing: input.deactivateMissing === true,
      instituteId: normalizeRequiredString(input.instituteId, "instituteId"),
      ipAddress: normalizeOptionalString(input.ipAddress),
      rows,
      userAgent: normalizeOptionalString(input.userAgent),
    };
  }

  /**
   * Executes validation-only preview or validated commit for roster uploads.
   * @param {StudentBulkIngestionValidatedRequest} request Validated request.
   * @return {Promise<StudentBulkIngestionResult>} Upload result summary.
   */
  public async ingestStudents(
    request: StudentBulkIngestionValidatedRequest,
  ): Promise<StudentBulkIngestionResult> {
    const studentCollection = this.dependencies.firestore
      .collection(INSTITUTES_COLLECTION)
      .doc(request.instituteId)
      .collection(STUDENTS_COLLECTION);
    const existingSnapshots = await Promise.all(
      request.rows.map((row) => studentCollection.doc(row.studentId).get()),
    );
    const existingById = new Map<string, ExistingStudentRecord>();

    existingSnapshots.forEach((snapshot, index) => {
      if (!snapshot.exists) {
        return;
      }

      const row = request.rows[index];
      if (!row) {
        return;
      }

      existingById.set(
        row.studentId,
        toStudentDocumentRecord(snapshot.data(), row.studentId),
      );
    });

    const existingEmailCandidates = await Promise.all(
      request.rows.map((row) =>
        studentCollection.where("email", "==", row.email).limit(2).get(),
      ),
    );
    const preparedRows: PreparedRow[] = [];
    const rowResults: StudentBulkIngestionRowResult[] = [];
    const seenStudentIds = new Set<string>();
    const seenEmails = new Set<string>();

    request.rows.forEach((row, index) => {
      const errors: string[] = [];

      if (seenStudentIds.has(row.studentId)) {
        errors.push("Duplicate studentId within upload.");
      }
      seenStudentIds.add(row.studentId);

      if (seenEmails.has(row.email)) {
        errors.push("Duplicate email within upload.");
      }
      seenEmails.add(row.email);

      const existingStudent = existingById.get(row.studentId);
      const emailSnapshots = existingEmailCandidates[index];
      const conflictingEmailDocument = emailSnapshots?.docs.find((document) =>
        document.id !== row.studentId,
      );

      if (conflictingEmailDocument) {
        errors.push("Email is already assigned to another student record.");
      }

      if (
        existingStudent?.email &&
        existingStudent.email !== row.email
      ) {
        errors.push(
          "Existing studentId is linked to a different email address.",
        );
      }

      const rowResult: StudentBulkIngestionRowResult = {
        action: existingStudent ? "update" : "create",
        email: row.email,
        errors,
        fullName: row.fullName,
        rowNumber: row.rowNumber,
        studentId: row.studentId,
      };

      rowResults.push(rowResult);

      if (errors.length === 0) {
        preparedRows.push({
          action: existingStudent ? "update" : "create",
          existingStudent,
          row,
          rowResult,
        });
      }
    });

    const uploadedStudentIds = new Set(request.rows.map((row) => row.studentId));
    const deactivationCandidates = request.deactivateMissing ?
      await this.loadDeactivationCandidates(request.instituteId, uploadedStudentIds) :
      [];

    const invalid = rowResults.filter((row) => row.errors.length > 0).length;
    const created = preparedRows.filter((row) => row.action === "create").length;
    const updated = preparedRows.filter((row) => row.action === "update").length;
    const canCommit = request.commit && invalid === 0;

    if (canCommit) {
      const createdAuthUsers: string[] = [];

      try {
        await Promise.all(
          preparedRows.map((entry) =>
            this.upsertAuthUser(request, entry, createdAuthUsers),
          ),
        );
      } catch (error) {
        await Promise.all(
          createdAuthUsers.map((uid) =>
            this.dependencies.auth.deleteUser(uid).catch(() => undefined),
          ),
        );
        throw error;
      }

      try {
        await this.commitRows(
          request,
          preparedRows,
          deactivationCandidates,
        );
      } catch (error) {
        await Promise.all(
          createdAuthUsers.map((uid) =>
            this.dependencies.auth.deleteUser(uid).catch(() => undefined),
          ),
        );
        throw error;
      }
    }

    if (canCommit && deactivationCandidates.length > 0) {
      rowResults.push(
        ...deactivationCandidates.map((candidate) => ({
          action: "deactivate" as const,
          email: candidate.email ?? null,
          errors: [],
          fullName: candidate.fullName ?? null,
          rowNumber: 0,
          studentId: candidate.studentId,
        })),
      );
    }

    const result: StudentBulkIngestionResult = {
      commitRequested: request.commit,
      committed: canCommit,
      deactivateMissing: request.deactivateMissing,
      rows: rowResults,
      summary: {
        created: canCommit ? created : 0,
        deactivated: canCommit ? deactivationCandidates.length : 0,
        deactivationCandidates: deactivationCandidates.length,
        invalid,
        received: request.rows.length,
        updated: canCommit ? updated : 0,
        valid: request.rows.length - invalid,
      },
    };

    this.logger.info("Student bulk ingestion evaluated.", {
      committed: result.committed,
      created: result.summary.created,
      deactivated: result.summary.deactivated,
      instituteId: request.instituteId,
      invalid,
      received: request.rows.length,
      updated: result.summary.updated,
    });

    return result;
  }

  private normalizeRow(
    value: StudentBulkIngestionStudentInput,
    rowNumber: number,
  ): StudentBulkIngestionValidatedRow {
    const studentId = normalizeRequiredString(value.studentId, "studentId");
    const fullName = normalizeRequiredString(
      value.fullName ?? value.name,
      "fullName",
    );
    const email = normalizeOptionalEmail(value.email, "email");

    if (!email) {
      throw new StudentBulkIngestionValidationError(
        "VALIDATION_ERROR",
        `Row ${rowNumber} must include a valid email address.`,
      );
    }

    const batchId = normalizeRequiredString(
      value.batchId ?? value.batch,
      "batchId",
    );

    return {
      batchId,
      className: normalizeOptionalString(value.class),
      email,
      enrollmentYear: normalizeOptionalString(value.enrollmentYear),
      fullName,
      parentEmail: normalizeOptionalEmail(value.parentEmail, "parentEmail"),
      phone: normalizeOptionalString(value.phone),
      rowNumber,
      studentId,
    };
  }

  private async loadDeactivationCandidates(
    instituteId: string,
    uploadedStudentIds: Set<string>,
  ): Promise<ExistingStudentRecord[]> {
    const snapshot = await this.dependencies.firestore
      .collection(INSTITUTES_COLLECTION)
      .doc(instituteId)
      .collection(STUDENTS_COLLECTION)
      .get();

    return snapshot.docs
      .map((document) => toStudentDocumentRecord(document.data(), document.id))
      .filter((record) =>
        !record.deleted &&
        record.status !== "inactive" &&
        record.status !== "archived" &&
        !uploadedStudentIds.has(record.studentId),
      );
  }

  private async upsertAuthUser(
    request: StudentBulkIngestionValidatedRequest,
    entry: PreparedRow,
    createdAuthUsers: string[],
  ): Promise<void> {
    const displayName = entry.row.fullName;
    const claims = {
      instituteId: request.instituteId,
      licenseLayer: request.actorLicenseLayer,
      role: "student",
      studentId: entry.row.studentId,
    };

    try {
      const existingAuthUser = await this.dependencies.auth.getUser(
        entry.row.studentId,
      );
      const existingEmail = normalizeOptionalEmail(
        existingAuthUser.email,
        "auth.email",
      );

      if (existingEmail && existingEmail !== entry.row.email) {
        throw new StudentBulkIngestionValidationError(
          "VALIDATION_ERROR",
          `Auth account for "${entry.row.studentId}" is linked to a ` +
            "different email address.",
        );
      }

      await this.dependencies.auth.updateUser(entry.row.studentId, {
        disabled: false,
        displayName,
        email: entry.row.email,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error as {code?: string}).code === AUTH_NOT_FOUND_CODE
      ) {
        await this.dependencies.auth.createUser({
          disabled: false,
          displayName,
          email: entry.row.email,
          uid: entry.row.studentId,
        });
        createdAuthUsers.push(entry.row.studentId);
      } else if (error instanceof StudentBulkIngestionValidationError) {
        throw error;
      } else {
        throw error;
      }
    }

    await this.dependencies.auth.setCustomUserClaims(entry.row.studentId, claims);
  }

  private async commitRows(
    request: StudentBulkIngestionValidatedRequest,
    preparedRows: PreparedRow[],
    deactivationCandidates: ExistingStudentRecord[],
  ): Promise<void> {
    const now = this.dependencies.getCurrentTimestamp();
    const studentCollection = this.dependencies.firestore
      .collection(INSTITUTES_COLLECTION)
      .doc(request.instituteId)
      .collection(STUDENTS_COLLECTION);

    await this.dependencies.firestore.runTransaction(async (transaction) => {
      preparedRows.forEach((entry) => {
        const documentReference = studentCollection.doc(entry.row.studentId);
        const baseDocument = {
          academicYear: entry.row.enrollmentYear ?? null,
          batch: entry.row.batchId,
          batchId: entry.row.batchId,
          class: entry.row.className ?? null,
          createdAt:
            entry.existingStudent?.createdAt ?? FieldValue.serverTimestamp(),
          deleted: false,
          email: entry.row.email,
          enrollmentYear: entry.row.enrollmentYear ?? null,
          fullName: entry.row.fullName,
          name: entry.row.fullName,
          parentEmail: entry.row.parentEmail ?? null,
          phone: entry.row.phone ?? null,
          status: entry.existingStudent?.status ?? "invited",
          studentId: entry.row.studentId,
          updatedAt: FieldValue.serverTimestamp(),
        };

        transaction.set(documentReference, baseDocument, {merge: true});
      });

      deactivationCandidates.forEach((candidate) => {
        transaction.set(studentCollection.doc(candidate.studentId), {
          status: "inactive",
          updatedAt: FieldValue.serverTimestamp(),
        }, {merge: true});
      });
    });

    await this.dependencies.logStudentImport({
      actorId: request.actorId,
      actorRole: request.actorRole,
      afterState: {
        committedAt: now.toISOString(),
        created: preparedRows.filter((row) => row.action === "create").length,
        deactivated: deactivationCandidates.length,
        importedStudentIds: preparedRows.map((row) => row.row.studentId),
        updated: preparedRows.filter((row) => row.action === "update").length,
      },
      beforeState: {
        committedAt: null,
      },
      entityId: `student_import_${now.getTime()}`,
      instituteId: request.instituteId,
      ipAddress: request.ipAddress,
      metadata: {
        commitMode: "all_or_nothing",
        deactivateMissing: request.deactivateMissing,
        rowCount: request.rows.length,
      },
      userAgent: request.userAgent,
    });
  }
}

export const studentBulkIngestionService = new StudentBulkIngestionService();
