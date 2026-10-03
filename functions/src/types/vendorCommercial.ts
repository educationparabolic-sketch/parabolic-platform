import type {
  VendorBillingCommunicationIntent,
  VendorBillingCommunicationReceipt,
  VendorInvoiceCommandIntent,
  VendorInvoiceCommandReceipt,
  VendorInvoiceDetail,
  VendorInvoiceListQuery,
  VendorInvoiceListResult,
  VendorLicenseCatalogCommandIntent,
  VendorLicenseCatalogCommandReceipt,
  VendorLicenseCatalogResult,
  VendorLicenseRequestDecisionIntent,
  VendorLicenseRequestDecisionReceipt,
  VendorLicenseRequestDetail,
  VendorLicenseRequestListQuery,
  VendorLicenseRequestListResult,
  VendorOfflinePaymentCommandIntent,
  VendorOfflinePaymentCommandReceipt,
  VendorPaymentEventCommandIntent,
  VendorPaymentEventCommandReceipt,
  VendorPaymentEventListQuery,
  VendorPaymentEventListResult,
  VendorSubscriptionCommandIntent,
  VendorSubscriptionCommandReceipt,
  VendorSubscriptionDetail,
} from "../../../shared/contracts/vendorCommercial";

export type VendorCommercialErrorCode =
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL_ERROR";

export class VendorCommercialValidationError extends Error {
  constructor(
    public readonly code: VendorCommercialErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "VendorCommercialValidationError";
  }
}

export interface VendorCommercialActorContext {
  actorId: string;
  actorRole: "vendor";
  ipAddress?: string;
  userAgent?: string;
}

export interface VendorCommercialInstituteRequest
  extends VendorCommercialActorContext {
  instituteId: string;
}

export interface VendorLicenseCatalogCommandRequest
  extends VendorCommercialActorContext {
  command: VendorLicenseCatalogCommandIntent;
}

export interface VendorSubscriptionCommandRequest
  extends VendorCommercialInstituteRequest {
  command: VendorSubscriptionCommandIntent;
}

export interface VendorInvoiceListRequest
  extends VendorCommercialActorContext, VendorInvoiceListQuery {
  limit: number;
}

export interface VendorInvoiceRequest extends VendorCommercialInstituteRequest {
  invoiceId: string;
}

export interface VendorInvoiceCommandRequest extends VendorInvoiceRequest {
  command: VendorInvoiceCommandIntent;
}

export interface VendorBillingCommunicationRequest extends VendorInvoiceRequest {
  command: VendorBillingCommunicationIntent;
}

export interface VendorOfflinePaymentCommandRequest extends VendorInvoiceRequest {
  command: VendorOfflinePaymentCommandIntent;
}

export interface VendorPaymentEventListRequest
  extends VendorCommercialActorContext, VendorPaymentEventListQuery {
  limit: number;
}

export interface VendorPaymentEventCommandRequest
  extends VendorCommercialActorContext {
  command: VendorPaymentEventCommandIntent;
  eventId: string;
}

export interface VendorLicenseRequestListValidatedRequest
  extends VendorCommercialActorContext, VendorLicenseRequestListQuery {
  limit: number;
}

export interface VendorLicenseRequestDetailValidatedRequest
  extends VendorCommercialActorContext {
  instituteId: string;
  requestId: string;
}

export interface VendorLicenseRequestDecisionValidatedRequest
  extends VendorLicenseRequestDetailValidatedRequest {
  command: VendorLicenseRequestDecisionIntent;
}

export type VendorCommercialValidatedOperation =
  | {
      operation: "list_license_requests";
      request: VendorLicenseRequestListValidatedRequest;
    }
  | {
      operation: "get_license_request";
      request: VendorLicenseRequestDetailValidatedRequest;
    }
  | {
      operation: "decide_license_request";
      request: VendorLicenseRequestDecisionValidatedRequest;
    }
  | {
      operation: "get_license_catalog";
      request: VendorCommercialActorContext;
    }
  | {
      operation: "command_license_catalog";
      request: VendorLicenseCatalogCommandRequest;
    }
  | {
      operation: "get_subscription";
      request: VendorCommercialInstituteRequest;
    }
  | {
      operation: "command_subscription";
      request: VendorSubscriptionCommandRequest;
    }
  | {
      operation: "list_invoices";
      request: VendorInvoiceListRequest;
    }
  | {
      operation: "get_invoice";
      request: VendorInvoiceRequest;
    }
  | {
      operation: "command_invoice";
      request: VendorInvoiceCommandRequest;
    }
  | {
      operation: "communicate_invoice";
      request: VendorBillingCommunicationRequest;
    }
  | {
      operation: "command_offline_payment";
      request: VendorOfflinePaymentCommandRequest;
    }
  | {
      operation: "list_payment_events";
      request: VendorPaymentEventListRequest;
    }
  | {
      operation: "retry_payment_event";
      request: VendorPaymentEventCommandRequest;
    };

export type {
  VendorBillingCommunicationReceipt,
  VendorInvoiceCommandReceipt,
  VendorInvoiceDetail,
  VendorInvoiceListResult,
  VendorLicenseCatalogCommandReceipt,
  VendorLicenseCatalogResult,
  VendorLicenseRequestDecisionReceipt,
  VendorLicenseRequestDetail,
  VendorLicenseRequestListResult,
  VendorOfflinePaymentCommandReceipt,
  VendorPaymentEventCommandReceipt,
  VendorPaymentEventListResult,
  VendorSubscriptionCommandReceipt,
  VendorSubscriptionDetail,
};
