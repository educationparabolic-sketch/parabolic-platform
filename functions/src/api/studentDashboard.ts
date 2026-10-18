/* eslint-disable require-jsdoc */
import type {DecodedIdToken} from "firebase-admin/auth";
import {studentSummaryService} from "../services/studentSummary";
import {getFirebaseAdminApp} from "../utils/firebaseAdmin";
import {createStudentSummaryHandler} from "./studentSummaryHandler";
interface Dependencies {
  getDashboard: typeof studentSummaryService.getDashboard;
  verifyIdToken: (token: string) => Promise<DecodedIdToken>;
}
export const createStudentDashboardHandler = (dependencies: Dependencies) =>
  createStudentSummaryHandler("dashboard", dependencies.getDashboard, dependencies.verifyIdToken);
export const handleStudentDashboardRequest = createStudentDashboardHandler({
  getDashboard: studentSummaryService.getDashboard.bind(studentSummaryService),
  verifyIdToken: (token) => getFirebaseAdminApp().auth().verifyIdToken(token, true),
});
