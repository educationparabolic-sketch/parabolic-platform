import {createMiddlewareHandler} from "../middleware/framework";
import {sendErrorResponse} from "../services/apiResponse";

// Retain deployed names without admitting standalone legacy business writes.
export const createClosedLegacyHandler = (service: string) => createMiddlewareHandler({
  service,
  controller: async (request, response): Promise<void> => {
    sendErrorResponse(response, request.context.requestId, "NOT_FOUND", "Legacy operation is unavailable.");
  },
});
