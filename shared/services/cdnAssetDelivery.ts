import {getFrontendEnvironment} from "./frontendEnvironment";
import {managedSignedAssetUrl} from "./managedAssetPolicy";

export function toCdnAssetUrl(source: string | null | undefined, expectedPath?: string): string {
  return managedSignedAssetUrl(source, getFrontendEnvironment().cdnBaseUrl, expectedPath);
}

export function buildQuestionAssetUrl(params: {
  instituteId: string;
  questionId: string;
  version: string;
  kind: "questionImage" | "solutionImage";
}): string {
  const extension = "png";
  const fileName = params.kind === "solutionImage" ? `solution.${extension}` : `question.${extension}`;
  const objectPath = [
    params.instituteId,
    "questions",
    params.questionId,
    params.version,
    fileName,
  ].join("/");

  return toCdnAssetUrl(objectPath);
}

export function buildStudentReportUrl(params: {
  instituteId: string;
  year: string;
  month: string;
  fileName: string;
}): string {
  const objectPath = [
    params.instituteId,
    "reports",
    params.year,
    params.month,
    params.fileName,
  ].join("/");

  return toCdnAssetUrl(objectPath);
}
