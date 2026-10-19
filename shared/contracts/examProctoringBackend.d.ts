/** BWM-045 backend projection. Public Admin/Exam DTOs adopted locally in 5–6. */
import type * as Previous from "./apiDtos.js";
import type {ExamProctoringPolicyV1, ExamProctoringRequirementsV1} from "./examProctoring.js";
export type * from "./apiDtos.js";

/** Preserve domain fields while replacing policy throughout nested projections. */
type WithPolicyV1<T> = T extends readonly (infer Item)[] ? WithPolicyV1<Item>[] :
  T extends object ? {[Key in keyof T]: Key extends "proctoringPolicy" ?
    ExamProctoringPolicyV1 : WithPolicyV1<T[Key]>} : T;

export type AdminRunProctoringPolicy = ExamProctoringPolicyV1;
export type AdminRunCreateRequest = Omit<Previous.AdminRunCreateRequest, "proctoringPolicy"> & {
  proctoringPolicy: ExamProctoringRequirementsV1;
};
export type AdminRunRecord = WithPolicyV1<Previous.AdminRunRecord>;
export type AdminRunCreateResult = WithPolicyV1<Previous.AdminRunCreateResult>;
export type AdminRunListResult = WithPolicyV1<Previous.AdminRunListResult>;
export type AdminRunDetailResult = WithPolicyV1<Previous.AdminRunDetailResult>;
export type AdminRunVersionedRecord = WithPolicyV1<Previous.AdminRunVersionedRecord>;
export type AdminRunLiveVersionedRecord = WithPolicyV1<Previous.AdminRunLiveVersionedRecord>;
export type AdminRunHistoryVersionedRecord = WithPolicyV1<Previous.AdminRunHistoryVersionedRecord>;
export type AdminRunLiveListRecord = WithPolicyV1<Previous.AdminRunLiveListRecord>;
export type AdminRunLiveListResult = WithPolicyV1<Previous.AdminRunLiveListResult>;
export type AdminRunLiveDetailResult = WithPolicyV1<Previous.AdminRunLiveDetailResult>;
export type AdminRunHistoryRecord = WithPolicyV1<Previous.AdminRunHistoryRecord>;
export type AdminRunHistoryResult = WithPolicyV1<Previous.AdminRunHistoryResult>;
export type AdminRunDerivedCreateResult = WithPolicyV1<Previous.AdminRunDerivedCreateResult>;
export type ExamRuntimeSnapshot = WithPolicyV1<Previous.ExamRuntimeSnapshot>;

export type AdminRunLifecycleResult = Omit<Previous.AdminRunLifecycleResult, "run"> & {
  run: Omit<AdminRunVersionedRecord, "proctoringPolicy"> & {proctoringPolicy: ExamProctoringPolicyV1 | {
    status: "unavailable"; reason: "policy_upgrade_required" | "policy_unsupported";
  }};
};
