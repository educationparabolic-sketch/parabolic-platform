import { getFrontendEnvironment } from "./frontendEnvironment";

const LOCAL_CDN_BASE_URL = "/cdn";
const FIREBASE_STORAGE_HOST_PATTERN = /(^|\.)firebasestorage\.googleapis\.com$/i;
const GCS_HOST_PATTERN = /(^|\.)storage\.googleapis\.com$/i;

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, "");
}

function removeTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function resolveCdnBaseUrl(): string {
  const configuredBase = getFrontendEnvironment().cdnBaseUrl?.trim();
  if (!configuredBase) {
    return LOCAL_CDN_BASE_URL;
  }

  return removeTrailingSlash(configuredBase);
}

function joinCdnPath(pathValue: string): string {
  const normalizedPath = trimSlashes(pathValue);
  if (normalizedPath.length === 0) {
    return resolveCdnBaseUrl();
  }

  const baseUrl = resolveCdnBaseUrl();
  if (baseUrl === "/") {
    return `/${normalizedPath}`;
  }

  return `${baseUrl}/${normalizedPath}`;
}

function decodeFirebaseObjectPath(candidate: URL): string | null {
  const segments = candidate.pathname.split("/");
  const objectMarkerIndex = segments.findIndex((segment) => segment === "o");
  if (objectMarkerIndex < 0) {
    return null;
  }

  const encodedPath = segments[objectMarkerIndex + 1];
  if (!encodedPath) {
    return null;
  }

  try {
    return decodeURIComponent(encodedPath);
  } catch {
    return null;
  }
}

function decodeGcsObjectPath(candidate: URL): string | null {
  const segments = candidate.pathname.split("/").filter((segment) => segment.length > 0);
  if (segments.length <= 1) {
    return null;
  }

  return segments.slice(1).join("/");
}

function toCdnPathFromStorageUrl(urlValue: string): string | null {
  let parsed: URL;

  try {
    parsed = new URL(urlValue);
  } catch {
    return null;
  }

  if (FIREBASE_STORAGE_HOST_PATTERN.test(parsed.hostname)) {
    return decodeFirebaseObjectPath(parsed);
  }

  if (GCS_HOST_PATTERN.test(parsed.hostname)) {
    return decodeGcsObjectPath(parsed);
  }

  return null;
}

export function toCdnAssetUrl(source: string | null | undefined): string {
  if (!source) {
    return "";
  }

  const normalized = source.trim();
  if (normalized.length === 0) {
    return "";
  }

  if (normalized.startsWith("data:") || normalized.startsWith("blob:")) {
    return normalized;
  }

  const storageObjectPath = toCdnPathFromStorageUrl(normalized);
  if (storageObjectPath) {
    return joinCdnPath(storageObjectPath);
  }

  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    return normalized;
  }

  return joinCdnPath(normalized);
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
