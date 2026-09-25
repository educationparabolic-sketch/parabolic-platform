import assert from "node:assert/strict";
import test from "node:test";
import {
  EmailDeliveryProviderError,
  SendGridEmailProvider,
} from "../services/emailDeliveryProvider";

test("SendGrid provider sends a provider-backed request without exposing its secret", async () => {
  const apiKey = "test-provider-secret";
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  const provider = new SendGridEmailProvider({
    fetch: async (input, init) => {
      requestUrl = String(input);
      requestInit = init;
      return new Response(null, {
        headers: {"x-message-id": "provider-message-123"},
        status: 202,
      });
    },
    resolveConfiguration: async () => ({
      apiKey,
      fromEmail: "verified-sender@example.test",
      fromName: "Parabolic Platform",
    }),
  });

  const result = await provider.send({
    html: "<p>Private action</p>",
    idempotencyKey: "hashed-command-key",
    recipientEmail: "teacher@example.test",
    subject: "Set your password",
    text: "Private action",
  });

  assert.equal(requestUrl, "https://api.sendgrid.com/v3/mail/send");
  assert.equal(requestInit?.method, "POST");
  assert.equal((requestInit?.headers as Record<string, string>).Authorization, `Bearer ${apiKey}`);
  const body = JSON.parse(String(requestInit?.body));
  assert.equal(body.from.email, "verified-sender@example.test");
  assert.equal(body.personalizations[0].custom_args.idempotency_key, "hashed-command-key");
  assert.equal(body.personalizations[0].to[0].email, "teacher@example.test");
  assert.equal(result.providerMessageId, "provider-message-123");
});

test("SendGrid provider classifies retryable and permanent failures without response bodies", async () => {
  const providerForStatus = (status: number) => new SendGridEmailProvider({
    fetch: async () => new Response("provider-sensitive-response", {status}),
    resolveConfiguration: async () => ({
      apiKey: "secret",
      fromEmail: "verified-sender@example.test",
      fromName: "Parabolic Platform",
    }),
  });
  const message = {
    html: "<p>Action</p>",
    idempotencyKey: "hash",
    recipientEmail: "teacher@example.test",
    subject: "Action",
    text: "Action",
  };

  await assert.rejects(providerForStatus(429).send(message), (error: unknown) =>
    error instanceof EmailDeliveryProviderError &&
    error.code === "provider_http_429" &&
    error.retryable &&
    !error.message.includes("provider-sensitive-response"));
  await assert.rejects(providerForStatus(400).send(message), (error: unknown) =>
    error instanceof EmailDeliveryProviderError &&
    error.code === "provider_http_400" &&
    !error.retryable &&
    !error.message.includes("provider-sensitive-response"));
});
