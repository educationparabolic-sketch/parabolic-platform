/* eslint-disable require-jsdoc */
import type {
  AdminQuestionTagMutationResult,
  AdminQuestionTagsResult,
} from "./adminQuestionBank";
import type {StandardApiSuccessResponse} from "./apiResponse";

export {
  AdminQuestionBankValidationError as AdminQuestionTagsValidationError,
} from "./adminQuestionBank";
export type {
  AdminQuestionTagAuthorityRecord,
  AdminQuestionTagField,
  AdminQuestionTagMutationRequest,
  AdminQuestionTagMutationResult,
  AdminQuestionTagMutationValidatedRequest,
  AdminQuestionTagReadValidatedRequest,
  AdminQuestionTagsResult,
} from "./adminQuestionBank";

export type AdminQuestionTagsSuccessResponse = StandardApiSuccessResponse<
  AdminQuestionTagsResult | AdminQuestionTagMutationResult
>;
