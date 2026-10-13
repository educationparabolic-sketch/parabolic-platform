import {GoogleAuth} from "google-auth-library";

const configuredKey = (value: unknown): Buffer => {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/u.test(value)) {
    throw new Error("Vendor audit cursor key is unavailable.");
  }
  const key = Buffer.from(value, "base64url");
  if (key.length !== 32 || key.toString("base64url") !== value) {
    throw new Error("Vendor audit cursor key is unavailable.");
  }
  return key;
};

let resolvedKey: {resource: string; value: Buffer} | undefined;

export const loadVendorAuditCursorKey = async (): Promise<Buffer> => {
  if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
    return configuredKey(process.env.VENDOR_AUDIT_CURSOR_KEY);
  }
  // Release environments require an explicit pinned same-project secret version.
  // Do not resolve a mutable latest alias or fall back to a raw env value.
  const resource = process.env.VENDOR_AUDIT_CURSOR_KEY_SECRET_VERSION;
  const projectIds = [process.env.GOOGLE_CLOUD_PROJECT, process.env.GCLOUD_PROJECT,
    process.env.PROJECT_ID].filter((value): value is string => value !== undefined);
  const projectId = projectIds[0];
  const match = resource?.match(/^projects\/([^/]+)\/secrets\/([A-Za-z0-9_-]+)\/versions\/([1-9][0-9]*)$/u);
  if (!resource || !projectId || projectIds.some((value) => value !== projectId) ||
    !match || match[1] !== projectId ||
    !["staging", "production"].includes(process.env.NODE_ENV ?? "")) {
    throw new Error("Vendor audit cursor key is unavailable.");
  }
  if (resolvedKey?.resource === resource) return Buffer.from(resolvedKey.value);
  try {
    const auth = new GoogleAuth({projectId, scopes: ["https://www.googleapis.com/auth/cloud-platform"]});
    const client = await auth.getClient();
    const response = await client.request<{payload?: {data?: string}}>({
      url: `https://secretmanager.googleapis.com/v1/${resource}:access`, method: "GET",
    });
    // Authority is the authenticated, pinned request resource. Do not require
    // response metadata to echo the project's textual ID rather than its number.
    if (typeof response.data.payload?.data !== "string") {
      throw new Error("Invalid cursor key authority.");
    }
    const value = configuredKey(Buffer.from(response.data.payload.data, "base64").toString("utf8"));
    resolvedKey = {resource, value};
    return Buffer.from(value);
  } catch {
    throw new Error("Vendor audit cursor key is unavailable.");
  }
};
