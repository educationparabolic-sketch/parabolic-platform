/* eslint-disable require-jsdoc */
import * as functions from "firebase-functions";
import type {DecodedIdToken} from "firebase-admin/auth";
import {createAuthenticationMiddleware, getBearerToken} from "../middleware/auth";
import {createMethodMiddleware, createMiddlewareHandler,
  createRequestValidationMiddleware} from "../middleware/framework";
import {createRoleAuthorizationMiddleware} from "../middleware/role";
import {createTenantGuardMiddleware} from "../middleware/tenant";
import {normalizeStudentSummaryQuery} from "../services/studentSummary";
import {sendErrorResponse} from "../services/apiResponse";
import {StudentSummaryValidationError} from "../types/studentSummary";

export function createStudentSummaryHandler<T>(resource: "dashboard" | "tests" | "performance" | "insights",
  read: (token: string, query: unknown) => Promise<T>, verifyIdToken: (token: string) => Promise<DecodedIdToken>) {
  const name = resource[0].toUpperCase() + resource.slice(1);
  const handler = createMiddlewareHandler({
    service: `Student${name}Api`,
    middlewares: [createMethodMiddleware("GET"), createAuthenticationMiddleware({verifyIdToken},
      {attachStudentId: true}),
    createTenantGuardMiddleware({allowVendorBypass: false,
      resolveRequestInstituteId: (request) => request.context.identity?.instituteId}),
    createRoleAuthorizationMiddleware({allowedRoles: ["student"],
      forbiddenMessage: "Only Students can access Student summaries."}),
    createRequestValidationMiddleware({validator: (request) => {
      normalizeStudentSummaryQuery(resource, request.query);
    }})],
    controller: async (request, response) => {
      const data = await read(getBearerToken(request.headers.authorization), request.query);
      response.status(200).json({success: true, code: "OK", data, message: `Student ${resource} loaded.`,
        requestId: request.context.requestId, timestamp: new Date().toISOString()});
    },
    onError: (error, context) => {
      if (!(error instanceof StudentSummaryValidationError)) return false;
      context.logger.warn("Student summary request rejected.", {code: error.code});
      sendErrorResponse(context.response, context.requestId, error.code, error.message);
      return true;
    },
  });
  return async (request: functions.https.Request, response: functions.Response): Promise<void> => {
    response.set("Cache-Control", "private, max-age=0, no-store");
    response.set("Pragma", "no-cache");
    response.set("X-Content-Type-Options", "nosniff");
    await handler(request, response);
  };
}
