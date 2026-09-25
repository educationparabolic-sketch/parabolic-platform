import {loadEnvironmentConfig} from "../utils/environment";

const SENDGRID_MAIL_SEND_URL = "https://api.sendgrid.com/v3/mail/send";

export interface EmailDeliveryMessage {
  html: string;
  idempotencyKey: string;
  recipientEmail: string;
  subject: string;
  text: string;
}

export interface EmailDeliveryResult {
  providerMessageId?: string;
}

export interface EmailDeliveryProvider {
  send(message: EmailDeliveryMessage): Promise<EmailDeliveryResult>;
}

export class EmailDeliveryProviderError extends Error {
  constructor(
    public readonly code: string,
    public readonly retryable: boolean,
    message: string,
  ) {
    super(message);
    this.name = "EmailDeliveryProviderError";
  }
}

interface SendGridEmailProviderDependencies {
  fetch: typeof fetch;
  resolveConfiguration: () => Promise<{
    apiKey: string;
    fromEmail: string;
    fromName: string;
  }>;
}

const requiredEnvironmentValue = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new EmailDeliveryProviderError(
      "provider_not_configured",
      true,
      "Email delivery provider configuration is incomplete.",
    );
  }
  return value;
};

const defaultConfiguration = async (): Promise<{
  apiKey: string;
  fromEmail: string;
  fromName: string;
}> => {
  const environment = await loadEnvironmentConfig();
  const apiKey = environment.secrets.emailProviderKey;
  if (!apiKey) {
    throw new EmailDeliveryProviderError(
      "provider_not_configured",
      true,
      "Email delivery provider configuration is incomplete.",
    );
  }
  return {
    apiKey,
    fromEmail: requiredEnvironmentValue("EMAIL_FROM_ADDRESS"),
    fromName: process.env.EMAIL_FROM_NAME?.trim() || "Parabolic Platform",
  };
};

const isRetryableStatus = (status: number): boolean =>
  status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;

/** Sends transactional messages through the configured SendGrid v3 provider. */
export class SendGridEmailProvider implements EmailDeliveryProvider {
  constructor(
    private readonly dependencies: SendGridEmailProviderDependencies = {
      fetch,
      resolveConfiguration: defaultConfiguration,
    },
  ) {}

  public async send(message: EmailDeliveryMessage): Promise<EmailDeliveryResult> {
    const configuration = await this.dependencies.resolveConfiguration();
    let response: Response;
    try {
      response = await this.dependencies.fetch(SENDGRID_MAIL_SEND_URL, {
        body: JSON.stringify({
          content: [
            {type: "text/plain", value: message.text},
            {type: "text/html", value: message.html},
          ],
          from: {
            email: configuration.fromEmail,
            name: configuration.fromName,
          },
          personalizations: [{
            custom_args: {idempotency_key: message.idempotencyKey},
            to: [{email: message.recipientEmail}],
          }],
          subject: message.subject,
        }),
        headers: {
          "Authorization": `Bearer ${configuration.apiKey}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      });
    } catch {
      throw new EmailDeliveryProviderError(
        "provider_network_error",
        true,
        "Email delivery provider request failed.",
      );
    }

    if (response.status !== 202) {
      throw new EmailDeliveryProviderError(
        `provider_http_${response.status}`,
        isRetryableStatus(response.status),
        "Email delivery provider rejected the request.",
      );
    }

    return {
      providerMessageId: response.headers.get("x-message-id") ?? undefined,
    };
  }
}

export const emailDeliveryProvider = new SendGridEmailProvider();
