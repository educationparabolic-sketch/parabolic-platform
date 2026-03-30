import * as functions from "firebase-functions";
import {StructuredLogger} from "../services/logging";
import {StandardApiErrorCode} from "./apiResponse";

export type LicenseLayer = "L0" | "L1" | "L2" | "L3";

export interface MiddlewareIdentityContext {
  uid: string;
  role: string;
  instituteId: string | null;
  licenseLayer: LicenseLayer | null;
  isVendor: boolean;
  isSuspended: boolean;
}

export interface MiddlewareRequestContext {
  identity?: MiddlewareIdentityContext;
  licenseDepth?: LicenseLayer | null;
  requestData?: Record<string, unknown>;
  requestId: string;
}

export type MiddlewareRequest = functions.https.Request & {
  context: MiddlewareRequestContext;
};

export type MiddlewareResponse = functions.Response;

export type MiddlewareNext = () => Promise<void>;

export type Middleware = (
  request: MiddlewareRequest,
  response: MiddlewareResponse,
  next: MiddlewareNext,
) => Promise<void> | void;

export type MiddlewareController = (
  request: MiddlewareRequest,
  response: MiddlewareResponse,
) => Promise<void> | void;

export interface MiddlewareErrorContext {
  logger: StructuredLogger;
  request: MiddlewareRequest;
  requestId: string;
  response: MiddlewareResponse;
}

export type MiddlewareErrorHandler = (
  error: unknown,
  context: MiddlewareErrorContext,
) => Promise<boolean> | boolean;

export interface MiddlewareHandlerOptions {
  controller: MiddlewareController;
  middlewares?: Middleware[];
  onError?: MiddlewareErrorHandler;
  service: string;
}

export interface RequestValidationOptions {
  validator: (request: MiddlewareRequest) => Promise<void> | void;
}

/**
 * Raised when middleware intentionally rejects a request with an API code.
 */
export class MiddlewareRejectionError extends Error {
  public readonly code: StandardApiErrorCode;

  /**
   * @param {StandardApiErrorCode} code Stable API error code.
   * @param {string} message Safe rejection detail for API responses.
   */
  constructor(code: StandardApiErrorCode, message: string) {
    super(message);
    this.name = "MiddlewareRejectionError";
    this.code = code;
  }
}
