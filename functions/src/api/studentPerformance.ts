import {verifyCurrentAuthorityIdToken} from "../services/instituteAuthorityEnforcement";
/* eslint-disable require-jsdoc */
import type {DecodedIdToken} from "firebase-admin/auth";
import {studentSummaryService} from "../services/studentSummary";
import {createStudentSummaryHandler} from "./studentSummaryHandler";
interface Dependencies {
  getPerformance: typeof studentSummaryService.getPerformance;
  verifyIdToken: (token: string) => Promise<DecodedIdToken>;
}
export const createStudentPerformanceHandler = (dependencies: Dependencies) =>
  createStudentSummaryHandler("performance", dependencies.getPerformance, dependencies.verifyIdToken);
export const handleStudentPerformanceRequest = createStudentPerformanceHandler({
  getPerformance: studentSummaryService.getPerformance.bind(studentSummaryService),
  verifyIdToken: (token) => verifyCurrentAuthorityIdToken(token),
});
