import * as functions from "firebase-functions";
import {
  API_ROUTE_MANIFEST,
  ApiRouteManifestEntry,
} from "../apiRouteManifest";
import {sendErrorResponse} from "../services/apiResponse";
import {createRequestLogger} from "../services/logging";
import {API_GATEWAY_HANDLERS} from "./apiGatewayHandlers";

export interface ApiRouteMatch {
  parameters: Readonly<Record<string, string>>;
  route: ApiRouteManifestEntry;
}

const ROUTE_PARAMETER_SEGMENT = /^\{([^{}]+)\}$/;

export const assertGatewayHandlerRegistry = (): void => {
  const mappedFunctionExports = new Set(
    API_ROUTE_MANIFEST.flatMap((route) =>
      route.functionExport === null ? [] : [route.functionExport]),
  );
  const registeredFunctionExports = new Set(
    Object.keys(API_GATEWAY_HANDLERS),
  );
  const missingHandlers = [...mappedFunctionExports]
    .filter((functionExport) => !registeredFunctionExports.has(functionExport));
  const extraHandlers = [...registeredFunctionExports]
    .filter((functionExport) => !mappedFunctionExports.has(functionExport));

  if (missingHandlers.length > 0 || extraHandlers.length > 0) {
    throw new Error(
      "API gateway handler registry does not match the route manifest: " +
      JSON.stringify({extraHandlers, missingHandlers}),
    );
  }
};

assertGatewayHandlerRegistry();

const matchRoutePath = (
  canonicalPath: string,
  requestPath: string,
): Readonly<Record<string, string>> | null => {
  const canonicalSegments = canonicalPath.split("/");
  const requestSegments = requestPath.split("/");

  if (canonicalSegments.length !== requestSegments.length) {
    return null;
  }

  const parameters: Record<string, string> = {};

  for (let index = 0; index < canonicalSegments.length; index += 1) {
    const canonicalSegment = canonicalSegments[index];
    const requestSegment = requestSegments[index];
    const parameterMatch = canonicalSegment.match(ROUTE_PARAMETER_SEGMENT);

    if (!parameterMatch) {
      if (canonicalSegment !== requestSegment) {
        return null;
      }
      continue;
    }

    if (!requestSegment) {
      return null;
    }

    try {
      parameters[parameterMatch[1]] = decodeURIComponent(requestSegment);
    } catch {
      return null;
    }
  }

  return parameters;
};

export const resolveApiRoute = (
  method: string,
  requestPath: string,
): ApiRouteMatch | null =>
  resolveApiRoutePath(requestPath)
    .find((routeMatch) => routeMatch.route.method === method) ?? null;

export const resolveApiRoutePath = (
  requestPath: string,
): readonly ApiRouteMatch[] => {
  const routeMatches: ApiRouteMatch[] = [];

  for (const route of API_ROUTE_MANIFEST) {
    const parameters = matchRoutePath(route.canonicalPath, requestPath);
    if (parameters) {
      routeMatches.push({
        parameters,
        route,
      });
    }
  }

  return routeMatches;
};

export const handleApiV1Request = (
  request: functions.https.Request,
  response: functions.Response,
): Promise<void> | void => {
  const logger = createRequestLogger("ApiV1Gateway", request);
  const routeMatches = resolveApiRoutePath(request.path);
  const routeMatch = routeMatches
    .find((match) => match.route.method === request.method);

  if (!routeMatch) {
    if (routeMatches.length > 0) {
      const allowedMethods = [...new Set(
        routeMatches.map((match) => match.route.method),
      )].sort();

      response.set("Allow", allowedMethods.join(", "));
      sendErrorResponse(
        response,
        logger.getRequestId(),
        "METHOD_NOT_ALLOWED",
        `Method ${request.method} is not allowed for this API route.`,
      );
      return;
    }

    sendErrorResponse(
      response,
      logger.getRequestId(),
      "NOT_FOUND",
      "API route not found.",
    );
    return;
  }

  if (!routeMatch.route.functionExport) {
    sendErrorResponse(
      response,
      logger.getRequestId(),
      "NOT_FOUND",
      "API route is not implemented.",
    );
    return;
  }

  Object.assign(request.params, routeMatch.parameters);

  return API_GATEWAY_HANDLERS[routeMatch.route.functionExport](
    request,
    response,
  );
};
