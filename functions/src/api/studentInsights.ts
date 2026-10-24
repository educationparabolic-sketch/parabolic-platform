import {verifyCurrentAuthorityIdToken} from "../services/instituteAuthorityEnforcement";
/* eslint-disable require-jsdoc */
import type {DecodedIdToken} from "firebase-admin/auth";
import {studentSummaryService} from "../services/studentSummary";
import {createStudentSummaryHandler} from "./studentSummaryHandler";
interface Dependencies {
  getInsights: typeof studentSummaryService.getInsights;
  verifyIdToken: (token: string) => Promise<DecodedIdToken>;
}
export const createStudentInsightsHandler = (dependencies: Dependencies) =>
  createStudentSummaryHandler("insights", dependencies.getInsights, dependencies.verifyIdToken);
export const handleStudentInsightsRequest = createStudentInsightsHandler({
  getInsights: studentSummaryService.getInsights.bind(studentSummaryService),
  verifyIdToken: (token) => verifyCurrentAuthorityIdToken(token),
});
