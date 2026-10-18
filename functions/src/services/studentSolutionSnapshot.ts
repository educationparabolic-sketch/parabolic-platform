/* eslint-disable require-jsdoc */
import {createHash} from "node:crypto";
import {isIP} from "node:net";
import {StudentSummaryValidationError} from "../types/studentSummary";
import {cdnArchitectureService} from "./cdnArchitecture";

export interface SolutionAsset {version: number; revision: number; extension: "png" | "webp"}
export interface CapturedSolutionQuestion {
  questionId: string;
  version: number;
  revision: number;
  correctAnswer: string;
  questionAsset: SolutionAsset | null;
  solutionAsset: SolutionAsset | null;
  tutorialVideoLink: string | null;
  simulationLink: string | null;
}
export interface StudentSolutionSnapshot {
  schemaVersion: 1;
  questionSetVersion: string;
  questions: CapturedSolutionQuestion[];
  fingerprint: string;
}
export function solutionConflict(): never {
  throw new StudentSummaryValidationError("CONFLICT", "Attempted solution authority is unavailable or inconsistent.");
}
export function solutionIdentifier(value: unknown): string {
  if (typeof value !== "string" || !value || value !== value.trim() || value.length > 128 ||
      /[/\\?#%]/u.test(value) || value === "." || value === "..") return solutionConflict();
  return value;
}
function positive(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) return solutionConflict();
  return Number(value);
}
export function canonicalSolutionJson(value: unknown): string {
  function normalize(item: unknown): unknown {
    if (item === null || typeof item === "string" || typeof item === "boolean") return item;
    if (typeof item === "number" && Number.isFinite(item)) return item;
    if (Array.isArray(item)) return item.map(normalize);
    if (typeof item === "object" && item !== null && Object.getPrototypeOf(item) === Object.prototype) {
      return Object.fromEntries(Object.keys(item).sort().map((key) =>
        [key, normalize((item as Record<string, unknown>)[key])]));
    }
    return solutionConflict();
  }
  return JSON.stringify(normalize(value));
}
export function solutionHash(value: unknown): string {
  return createHash("sha256").update(canonicalSolutionJson(value)).digest("hex");
}
export function safeSolutionLink(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    // No network resolution/fetch: omit IP literals, local/single-label names,
    // bucket endpoints and credential-bearing links entirely.
    if (url.protocol !== "https:" || url.username || url.password || !host.includes(".") ||
        isIP(host.replace(/^\[|\]$/g, "")) || /^(?:\d+\.)+\d+$/u.test(host) ||
        /(?:^|\.)(?:localhost|local|internal|test|invalid)$/u.test(host) ||
        /(?:storage|firebasestorage)\.googleapis\.com$/u.test(host) ||
        /(?:^|\.)googleapis\.com$/u.test(host)) return null;
    return url.toString();
  } catch {
    return null;
  }
}
function captureAsset(
  data: FirebaseFirestore.DocumentData, instituteId: string, questionId: string,
  kind: "question" | "solution", version: number,
): SolutionAsset | null {
  const path = data[`${kind}ImageUrl`];
  if (path === undefined || path === null || path === "") return null;
  if (typeof path !== "string") return solutionConflict();
  const revision = positive(data[`${kind}ImageRevision`]);
  const extension = path.endsWith(".png") ? "png" : path.endsWith(".webp") ? "webp" : solutionConflict();
  const target = cdnArchitectureService.resolveQuestionAssetLocation({instituteId, questionId,
    assetKind: kind === "question" ? "questionImage" : "solutionImage", version, revision, extension});
  if (path !== target.cdnPath) return solutionConflict();
  return {version, revision, extension};
}
export function captureStudentSolutionSnapshot(
  instituteId: string, questionSetVersion: string, orderedIds: string[],
  documents: Array<Pick<FirebaseFirestore.DocumentSnapshot, "id" | "exists" | "data">>,
): StudentSolutionSnapshot {
  if (!orderedIds.length || orderedIds.length > 500 || new Set(orderedIds).size !== orderedIds.length ||
      typeof questionSetVersion !== "string" || !questionSetVersion.trim()) return solutionConflict();
  solutionIdentifier(instituteId);
  const byId = new Map(documents.map((document) => [document.id, document]));
  const questions = orderedIds.map((id): CapturedSolutionQuestion => {
    solutionIdentifier(id);
    const document = byId.get(id);
    if (!document?.exists) return solutionConflict();
    const data = document.data() ?? {};
    if ((data.questionId !== undefined && data.questionId !== id) ||
        typeof data.correctAnswer !== "string" || !data.correctAnswer.trim() || data.correctAnswer.length > 4096) {
      return solutionConflict();
    }
    const version = positive(data.version);
    return {questionId: id, version, revision: positive(data.revision), correctAnswer: data.correctAnswer,
      questionAsset: captureAsset(data, instituteId, id, "question", version),
      solutionAsset: captureAsset(data, instituteId, id, "solution", version),
      tutorialVideoLink: safeSolutionLink(data.tutorialVideoLink),
      simulationLink: safeSolutionLink(data.simulationLink)};
  });
  const body = {schemaVersion: 1 as const, questionSetVersion, questions};
  const result = {...body, fingerprint: solutionHash(body)};
  if (Buffer.byteLength(canonicalSolutionJson(result), "utf8") > 262144) return solutionConflict();
  return result;
}
function validateSnapshot(value: unknown, session: FirebaseFirestore.DocumentData):
StudentSolutionSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return solutionConflict();
  const raw = value as StudentSolutionSnapshot;
  if (raw.schemaVersion !== 1 || !Array.isArray(raw.questions) || typeof raw.fingerprint !== "string" ||
      !/^[a-f0-9]{64}$/u.test(raw.fingerprint) || raw.questionSetVersion !== session.templateVersion ||
      raw.questionSetVersion !== session.runtimeSnapshot?.questionSetVersion) return solutionConflict();
  const {fingerprint, ...body} = raw;
  if (solutionHash(body) !== fingerprint || Object.keys(body).sort().join(",") !==
      "questionSetVersion,questions,schemaVersion") return solutionConflict();
  // Rebuild the allowlisted snapshot from immutable captured fields, never the mutable bank.
  const documents = raw.questions.map((question) => ({id: question.questionId, exists: true,
    data: () => {
      const material: Record<string, unknown> = {questionId: question.questionId, version: question.version,
        revision: question.revision, correctAnswer: question.correctAnswer,
        tutorialVideoLink: question.tutorialVideoLink, simulationLink: question.simulationLink};
      for (const [kind, asset] of [
        ["question", question.questionAsset], ["solution", question.solutionAsset],
      ] as const) {
        if (asset !== null) {
          if (!asset || asset.version !== question.version || !["png", "webp"].includes(asset.extension)) {
            return solutionConflict();
          }
          material[`${kind}ImageUrl`] = cdnArchitectureService.resolveQuestionAssetLocation({
            instituteId: session.instituteId, questionId: question.questionId, version: asset.version,
            revision: positive(asset.revision), extension: asset.extension,
            assetKind: kind === "question" ? "questionImage" : "solutionImage"}).cdnPath;
          material[`${kind}ImageRevision`] = asset.revision;
        }
      }
      return material;
    }}));
  const rebuilt = captureStudentSolutionSnapshot(session.instituteId, raw.questionSetVersion,
    raw.questions.map((q) => q.questionId), documents);
  if (canonicalSolutionJson(rebuilt) !== canonicalSolutionJson(raw)) return solutionConflict();
  const ids = raw.questions.map((q) => q.questionId);
  const runtimeIds = session.runtimeSnapshot?.questions?.map((q: {id: string}) => q.id);
  const templateIds = session.templateSnapshot?.questionIds;
  if (JSON.stringify(ids) !== JSON.stringify(runtimeIds) || !Array.isArray(templateIds) ||
      JSON.stringify([...ids].sort()) !== JSON.stringify([...templateIds].sort()) ||
      session.templateSnapshot?.version !== undefined &&
      String(session.templateSnapshot.version) !== raw.questionSetVersion) return solutionConflict();
  return rebuilt;
}

export function validateStudentSolutionSnapshot(value: unknown, session: FirebaseFirestore.DocumentData):
StudentSolutionSnapshot {
  try {
    return validateSnapshot(value, session);
  } catch {
    return solutionConflict();
  }
}
