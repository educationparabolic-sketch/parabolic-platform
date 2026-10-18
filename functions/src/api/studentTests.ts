/* eslint-disable require-jsdoc */
import type {DecodedIdToken} from "firebase-admin/auth";
import {studentSummaryService} from "../services/studentSummary";
import {getFirebaseAdminApp} from "../utils/firebaseAdmin";
import {createStudentSummaryHandler} from "./studentSummaryHandler";
interface Dependencies {
  listTests: typeof studentSummaryService.listTests;
  verifyIdToken: (token: string) => Promise<DecodedIdToken>;
}
export const createStudentTestsHandler = (dependencies: Dependencies) =>
  createStudentSummaryHandler("tests", dependencies.listTests, dependencies.verifyIdToken);
export const handleStudentTestsRequest = createStudentTestsHandler({
  listTests: studentSummaryService.listTests.bind(studentSummaryService),
  verifyIdToken: (token) => getFirebaseAdminApp().auth().verifyIdToken(token, true),
});
