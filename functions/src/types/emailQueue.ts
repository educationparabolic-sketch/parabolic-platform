export type EmailQueueApiErrorCode =
  "FORBIDDEN" |
  "INTERNAL_ERROR" |
  "TENANT_MISMATCH" |
  "UNAUTHORIZED" |
  "VALIDATION_ERROR";

export interface EmailQueueRequestPayload {
  instituteId: string;
  [key: string]: unknown;
}

export interface EnqueueEmailJobInput {
  payload: EmailQueueRequestPayload;
  recipientEmail: string;
  templateType: string;
}

export interface EnqueueEmailJobResult {
  jobId: string;
  jobPath: string;
  status: "pending";
}

export interface EmailQueueSuccessResponse {
  code: "OK";
  data: EnqueueEmailJobResult;
  message: string;
  requestId: string;
  success: true;
  timestamp: string;
}
