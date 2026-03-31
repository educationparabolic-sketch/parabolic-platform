import type { RouteAccessDecision } from "../../../../shared/types/portalRouting";

export interface ExamRouteDefinition {
  path: "/session/:sessionId";
  title: string;
  section: string;
  description: string;
  redirectOnDenied: string;
}

export interface ResolvedExamRoute {
  definition: ExamRouteDefinition;
  params: Record<string, string>;
}

export interface ExamRouteContext {
  token: string | null;
}

export const EXAM_ROUTE_DEFINITION: ExamRouteDefinition = {
  path: "/session/:sessionId",
  title: "Exam Session Runtime",
  section: "Exam Portal Routes",
  description:
    "Single secure execution entry point that validates the session token, confirms the student-owned session context, loads immutable snapshots, and hands off to the exam runtime engine.",
  redirectOnDenied: "/student/my-tests",
};

function escapeSegment(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function matchExamRoute(pathname: string): ResolvedExamRoute | null {
  const params: Record<string, string> = {};
  const pattern = EXAM_ROUTE_DEFINITION.path
    .split("/")
    .map((segment) => {
      if (!segment) {
        return "";
      }

      if (segment.startsWith(":")) {
        return `(?<${segment.slice(1)}>[^/]+)`;
      }

      return escapeSegment(segment);
    })
    .join("/");
  const matcher = new RegExp(`^${pattern}$`);
  const match = matcher.exec(pathname);

  if (!match) {
    return null;
  }

  for (const [key, value] of Object.entries(match.groups ?? {})) {
    params[key] = decodeURIComponent(value);
  }

  return {
    definition: EXAM_ROUTE_DEFINITION,
    params,
  };
}

export function evaluateExamRoutePermissions(
  route: ResolvedExamRoute | null,
  context: ExamRouteContext,
): RouteAccessDecision {
  if (!route) {
    return {
      allowed: false,
      redirectTo: "/unauthorized",
      reason: "unauthorized",
    };
  }

  if (!context.token) {
    return {
      allowed: false,
      redirectTo: route.definition.redirectOnDenied,
      reason: "invalid_session_token",
    };
  }

  return {
    allowed: true,
    redirectTo: null,
    reason: null,
  };
}
