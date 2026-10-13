/* eslint-disable max-len, require-jsdoc */
import {Timestamp} from "firebase-admin/firestore";
import type {
  VendorHealthSource,
  VendorHealthUnavailableSource,
  VendorHealthUnavailableReason,
  VendorOperationalQueueEvidence,
  VendorRuntimeReleaseIdentity,
  VendorSystemHealthResult,
} from "../../../shared/contracts/vendorAuditHealth";

const MAX_SOURCE_DOCUMENTS = 1000;

type CountBucket = "processing" | "retrying" | "succeeded" | "failed";

interface StateDisposition {
  bucket: CountBucket | null;
  outstanding: boolean;
}

interface HealthSourceDescriptor {
  query: () => FirebaseFirestore.Query;
  state: (value: Record<string, unknown>) => string;
  dispositions: Readonly<Record<string, StateDisposition>>;
  createdAt: (value: Record<string, unknown>) => string;
  activityAt: (value: Record<string, unknown>) => string;
}

interface HealthSourceDescriptors {
  failureRecovery: HealthSourceDescriptor;
  emailDelivery: HealthSourceDescriptor;
  stripeReconciliation: HealthSourceDescriptor;
  calibrationOperations: HealthSourceDescriptor;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const storedString = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !value.trim() || value.length > 128) {
    throw new Error(`Persisted ${field} is invalid.`);
  }
  return value.trim();
};

const timestampIso = (value: unknown, field: string): string => {
  if (!(value instanceof Timestamp) || !Number.isFinite(value.toMillis())) {
    throw new Error(`Persisted ${field} is invalid.`);
  }
  return value.toDate().toISOString();
};

const optionalTimestampIso = (value: unknown, field: string): string | null =>
  value === undefined || value === null ? null : timestampIso(value, field);

const canonicalIso = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !value || !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== value) {
    throw new Error(`Persisted ${field} is invalid.`);
  }
  return value;
};

const unavailable = (
  observedAt: string,
  reason: VendorHealthUnavailableReason,
): VendorHealthUnavailableSource => ({availability: "unavailable", observedAt, reason});

const minimumIso = (current: string | null, candidate: string): string =>
  current === null || candidate < current ? candidate : current;

const maximumIso = (current: string | null, candidate: string): string =>
  current === null || candidate > current ? candidate : current;

const optionalEnvironment = (
  environment: Readonly<Record<string, string | undefined>>,
  key: string,
): string | null => {
  const value = environment[key]?.trim();
  return value ? value : null;
};

export class VendorSystemHealthReadService {
  private readonly environment: Readonly<Record<string, string | undefined>>;
  private readonly now: () => Date;

  constructor(private readonly dependencies: {
    firestore: FirebaseFirestore.Firestore;
    environment?: Readonly<Record<string, string | undefined>>;
    now?: () => Date;
  }) {
    this.environment = dependencies.environment ?? process.env;
    this.now = dependencies.now ?? (() => new Date());
  }

  private release(observedAt: string): VendorHealthSource<VendorRuntimeReleaseIdentity> {
    const releaseId = optionalEnvironment(this.environment, "RELEASE_ID");
    const commitSha = optionalEnvironment(this.environment, "RELEASE_COMMIT_SHA");
    const builtAt = optionalEnvironment(this.environment, "RELEASE_BUILT_AT");
    const environment = optionalEnvironment(this.environment, "NODE_ENV");
    const functionsRevision = optionalEnvironment(this.environment, "K_REVISION") ??
      optionalEnvironment(this.environment, "FUNCTIONS_VERSION");
    if ([releaseId, commitSha, builtAt, environment, functionsRevision]
      .every((value) => value === null)) {
      return unavailable(observedAt, "not_configured");
    }
    if ((releaseId !== null && !/^[A-Za-z0-9][A-Za-z0-9._-]{2,127}$/u.test(releaseId)) ||
      (commitSha !== null && !/^[a-fA-F0-9]{40}$/u.test(commitSha)) ||
      (builtAt !== null && (!Number.isFinite(Date.parse(builtAt)) ||
        new Date(builtAt).toISOString() !== builtAt)) ||
      (environment !== null && !["development", "staging", "production", "test"]
        .includes(environment)) ||
      (functionsRevision !== null &&
        !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(functionsRevision))) {
      return unavailable(observedAt, "source_unavailable");
    }
    return {
      availability: "available",
      observedAt,
      data: {releaseId, commitSha, builtAt, environment, functionsRevision},
    };
  }

  private async queue(
    descriptor: HealthSourceDescriptor,
    observedAt: string,
  ): Promise<VendorHealthSource<VendorOperationalQueueEvidence>> {
    try {
      const snapshot = await descriptor.query().limit(MAX_SOURCE_DOCUMENTS + 1).get();
      if (snapshot.size > MAX_SOURCE_DOCUMENTS) {
        return unavailable(observedAt, "source_limit_exceeded");
      }
      const evidence: VendorOperationalQueueEvidence = {
        totalCount: 0,
        outstandingCount: 0,
        processingCount: 0,
        retryingCount: 0,
        succeededCount: 0,
        failedCount: 0,
        oldestOutstandingAt: null,
        newestActivityAt: null,
      };
      for (const document of snapshot.docs) {
        const value = document.data();
        if (!isRecord(value)) throw new Error("Persisted health authority is invalid.");
        const state = descriptor.state(value);
        const disposition = descriptor.dispositions[state];
        if (!disposition) throw new Error("Persisted health state is unsupported.");
        const createdAt = descriptor.createdAt(value);
        const activityAt = descriptor.activityAt(value);
        evidence.totalCount += 1;
        evidence.newestActivityAt = maximumIso(evidence.newestActivityAt, activityAt);
        if (disposition.outstanding) {
          evidence.outstandingCount += 1;
          evidence.oldestOutstandingAt = minimumIso(
            evidence.oldestOutstandingAt,
            createdAt,
          );
        }
        if (disposition.bucket === "processing") evidence.processingCount += 1;
        if (disposition.bucket === "retrying") evidence.retryingCount += 1;
        if (disposition.bucket === "succeeded") evidence.succeededCount += 1;
        if (disposition.bucket === "failed") evidence.failedCount += 1;
      }
      return {availability: "available", observedAt, data: evidence};
    } catch {
      return unavailable(observedAt, "source_unavailable");
    }
  }

  private descriptors(): HealthSourceDescriptors {
    const firestore = this.dependencies.firestore;
    return {
      failureRecovery: {
        query: () => firestore.collection("systemFlags/failureRecoveryRetryQueue/jobs")
          .select("status", "createdAt", "updatedAt"),
        state: (value) => storedString(value.status, "failureRecovery.status"),
        dispositions: {
          pending: {bucket: null, outstanding: true},
          processing: {bucket: "processing", outstanding: true},
          retrying: {bucket: "retrying", outstanding: true},
          completed: {bucket: "succeeded", outstanding: false},
          failed: {bucket: "failed", outstanding: false},
        },
        createdAt: (value) => timestampIso(value.createdAt, "failureRecovery.createdAt"),
        activityAt: (value) => timestampIso(value.updatedAt, "failureRecovery.updatedAt"),
      },
      emailDelivery: {
        query: () => firestore.collection("emailQueue")
          .select("status", "createdAt", "updatedAt", "sentAt"),
        state: (value) => storedString(value.status, "emailQueue.status"),
        dispositions: {
          pending: {bucket: null, outstanding: true},
          processing: {bucket: "processing", outstanding: true},
          retrying: {bucket: "retrying", outstanding: true},
          sent: {bucket: "succeeded", outstanding: false},
          failed: {bucket: "failed", outstanding: false},
        },
        createdAt: (value) => timestampIso(value.createdAt, "emailQueue.createdAt"),
        activityAt: (value) => optionalTimestampIso(value.updatedAt,
          "emailQueue.updatedAt") ?? optionalTimestampIso(value.sentAt,
          "emailQueue.sentAt") ?? timestampIso(value.createdAt, "emailQueue.createdAt"),
      },
      stripeReconciliation: {
        query: () => firestore.collection("vendor/stripeEvents/events")
          .select("reconciliationState", "createdAt", "occurredAt", "updatedAt"),
        state: (value) => value.reconciliationState === undefined ||
          value.reconciliationState === null ? "manual_review" :
          storedString(value.reconciliationState, "stripeEvent.reconciliationState")
            .toLowerCase(),
        dispositions: {
          pending: {bucket: "processing", outstanding: true},
          reconciled: {bucket: "succeeded", outstanding: false},
          mismatch: {bucket: "failed", outstanding: true},
          manual_review: {bucket: null, outstanding: true},
        },
        createdAt: (value) => timestampIso(value.createdAt ?? value.occurredAt,
          "stripeEvent.createdAt"),
        activityAt: (value) => timestampIso(value.updatedAt ?? value.createdAt,
          "stripeEvent.updatedAt"),
      },
      calibrationOperations: {
        query: () => firestore.collection("vendorCalibrationRollouts")
          .select("state", "createdAt", "updatedAt"),
        state: (value) => storedString(value.state, "calibrationRollout.state"),
        dispositions: {
          pending: {bucket: "processing", outstanding: true},
          applied: {bucket: "succeeded", outstanding: false},
          not_applied: {bucket: "failed", outstanding: false},
          rolled_back: {bucket: "succeeded", outstanding: false},
        },
        createdAt: (value) => canonicalIso(value.createdAt, "calibrationRollout.createdAt"),
        activityAt: (value) => canonicalIso(value.updatedAt, "calibrationRollout.updatedAt"),
      },
    };
  }

  public async read(): Promise<VendorSystemHealthResult> {
    const observedAt = this.now().toISOString();
    const descriptors = this.descriptors();
    const [failureRecovery, emailDelivery, stripeReconciliation,
      calibrationOperations] = await Promise.all([
      this.queue(descriptors.failureRecovery, observedAt),
      this.queue(descriptors.emailDelivery, observedAt),
      this.queue(descriptors.stripeReconciliation, observedAt),
      this.queue(descriptors.calibrationOperations, observedAt),
    ]);
    return {
      generatedAt: observedAt,
      release: this.release(observedAt),
      failureRecovery,
      emailDelivery,
      stripeReconciliation,
      calibrationOperations,
      cloudMonitoring: unavailable(observedAt, "adapter_not_implemented"),
      errorReporting: unavailable(observedAt, "adapter_not_implemented"),
      costAndUsage: unavailable(observedAt, "no_durable_source"),
      latencyAndErrorMetrics: unavailable(observedAt, "no_durable_source"),
      frontendTelemetry: unavailable(observedAt, "no_durable_source"),
      deploymentHistory: unavailable(observedAt, "no_durable_source"),
    };
  }
}
