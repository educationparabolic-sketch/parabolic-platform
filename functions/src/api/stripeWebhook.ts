import * as functions from "firebase-functions";
import {sendErrorResponse} from "../services/apiResponse";
import {
  createMethodMiddleware,
  createMiddlewareHandler,
} from "../middleware/framework";
import {MiddlewareRequest} from "../types/middleware";
import {
  StripeWebhookProcessingResult,
  PaymentEventIntegrationValidationError,
  StripeWebhookSuccessResponse,
} from "../types/paymentEventIntegration";
import {systemEventTopologyService} from "../services/systemEventTopology";

type ProcessStripeWebhook = (
  input: {
    rawBody?: Buffer | string;
    requestBody?: unknown;
    signatureHeader?: string;
  },
) => Promise<StripeWebhookProcessingResult>;

interface StripeWebhookDependencies {
  processStripeWebhook: ProcessStripeWebhook;
}

const buildSuccessResponse = (
  result: StripeWebhookProcessingResult,
  requestId: string,
  timestamp: string,
): StripeWebhookSuccessResponse => ({
  code: "OK",
  data: result,
  message:
    result.duplicate ?
      "Stripe webhook already processed." :
      "Stripe webhook processed.",
  requestId,
  success: true,
  timestamp,
});

export const createStripeWebhookHandler = (
  dependencies: StripeWebhookDependencies,
) => createMiddlewareHandler({
  controller: async (
    request: MiddlewareRequest,
    response: functions.Response,
  ): Promise<void> => {
    const signatureHeader = request.header("stripe-signature");
    const result = await systemEventTopologyService.executeEventHandler(
      "BillingWebhookReceived",
      "stripeWebhook",
      {
        requestId: request.context.requestId,
      },
      async () => dependencies.processStripeWebhook({
        rawBody: request.rawBody,
        requestBody: request.body,
        signatureHeader,
      }),
    );

    response.status(200).json(
      buildSuccessResponse(
        result,
        request.context.requestId,
        new Date().toISOString(),
      ),
    );
  },
  middlewares: [
    createMethodMiddleware("POST"),
  ],
  onError: (error, context): boolean => {
    if (error instanceof PaymentEventIntegrationValidationError) {
      context.logger.warn("Stripe webhook request rejected.", {
        code: error.code,
        error,
      });
      sendErrorResponse(
        context.response,
        context.requestId,
        error.code,
        error.message,
      );
      return true;
    }

    return false;
  },
  service: "StripeWebhookApi",
});

export const handleStripeWebhookRequest = createStripeWebhookHandler({
  processStripeWebhook: async (input) => {
    const {paymentEventIntegrationService} = await import(
      "../services/paymentEventIntegration.js"
    );
    return paymentEventIntegrationService.processStripeWebhook(input);
  },
});

export {buildSuccessResponse};
