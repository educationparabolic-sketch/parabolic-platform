import type {StandardApiErrorCode} from "./apiResponse";

export type {
  StudentIdentityPhotoEnrollRequest,
  StudentIdentityPhotoEnrollResult,
  StudentProfileResult,
  StudentProfilePreferencesRequest,
  StudentProfilePreferencesResult,
} from "../../../shared/contracts/studentProfile";

export class StudentProfileValidationError extends Error {
  constructor(
    public readonly code: StandardApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "StudentProfileValidationError";
  }
}
