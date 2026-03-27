import {FieldValue} from "firebase-admin/firestore";
import {getFirestore} from "../utils/firebaseAdmin";
import {createLogger} from "./logging";
import {
  EnqueueEmailJobInput,
  EnqueueEmailJobResult,
  EmailQueueApiErrorCode,
  EmailQueueRequestPayload,
} from "../types/emailQueue";

const EMAIL_QUEUE_COLLECTION = "emailQueue";

const isPlainObject = (
  value: unknown,
): value is Record<string, unknown> => typeof value === "object" &&
  value !== null &&
  !Array.isArray(value);

const toNonEmptyString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalizedValue = value.trim();
  return normalizedValue || undefined;
};

const toRequiredString = (value: unknown, fieldName: string): string => {
  const normalizedValue = toNonEmptyString(value);

  if (!normalizedValue) {
    throw new EmailQueueValidationError(
      "VALIDATION_ERROR",
      `Field "${fieldName}" must be a non-empty string.`,
    );
  }

  return normalizedValue;
};

const toPayload = (value: unknown): EmailQueueRequestPayload => {
  if (!isPlainObject(value)) {
    throw new EmailQueueValidationError(
      "VALIDATION_ERROR",
      "Field \"payload\" must be an object.",
    );
  }

  return {
    ...value,
    instituteId: toRequiredString(value.instituteId, "payload.instituteId"),
  };
};

/**
 * Raised when an email queue request fails contract validation.
 */
export class EmailQueueValidationError extends Error {
  public readonly code: EmailQueueApiErrorCode;

  /**
   * @param {EmailQueueApiErrorCode} code Stable API error code.
   * @param {string} message Validation failure detail.
   */
  constructor(code: EmailQueueApiErrorCode, message: string) {
    super(message);
    this.name = "EmailQueueValidationError";
    this.code = code;
  }
}

/**
 * Persists backend-triggered email jobs in the root email queue collection.
 */
export class EmailQueueService {
  private readonly firestore = getFirestore();
  private readonly logger = createLogger("EmailQueueService");

  /**
   * Creates a pending email queue job document.
   * @param {EnqueueEmailJobInput} input Email queue request payload.
   * @return {Promise<EnqueueEmailJobResult>} Created queue job metadata.
   */
  public async enqueueEmailJob(
    input: EnqueueEmailJobInput,
  ): Promise<EnqueueEmailJobResult> {
    const recipientEmail = toRequiredString(
      input.recipientEmail,
      "recipientEmail",
    );
    const templateType = toRequiredString(input.templateType, "templateType");
    const payload = toPayload(input.payload);
    const instituteId = payload.instituteId;
    const jobReference = this.firestore
      .collection(EMAIL_QUEUE_COLLECTION)
      .doc();

    await jobReference.create({
      createdAt: FieldValue.serverTimestamp(),
      instituteId,
      payload,
      recipientEmail,
      retryCount: 0,
      sentAt: null,
      status: "pending",
      subject:
        templateType,
      templateType,
    });

    const result: EnqueueEmailJobResult = {
      jobId: jobReference.id,
      jobPath: `${EMAIL_QUEUE_COLLECTION}/${jobReference.id}`,
      status: "pending",
    };

    this.logger.info("Queued email job.", {
      instituteId,
      jobId: result.jobId,
      jobPath: result.jobPath,
      recipientEmail,
      templateType,
    });

    return result;
  }
}

/**
 * Shared email queue service instance for internal notification workflows.
 */
export const emailQueueService = new EmailQueueService();
