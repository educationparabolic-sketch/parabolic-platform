import {createHash, randomUUID} from "crypto";
import {FieldPath, Timestamp} from "firebase-admin/firestore";
import {createLogger} from "./logging";
import {getFirestore} from "../utils/firebaseAdmin";
import {
  VendorIntelligencePortfolioSnapshotDocument,
  VendorIntelligenceRollupInput,
  VendorIntelligenceRollupItemDocument,
  VendorIntelligenceRollupLayer,
  VendorIntelligenceRollupLayerCounts,
  VendorIntelligenceRollupLayerMoney,
  VendorIntelligenceRollupResult,
  VendorIntelligenceRollupSourceCounts,
} from "../types/vendorIntelligenceRollup";

const INSTITUTES = "institutes";
const LICENSE = "license";
const CURRENT_LICENSE = "current";
const USAGE_METER = "usageMeter";
const LICENSE_HISTORY = "licenseHistory";
const ACADEMIC_YEARS = "academicYears";
const GOVERNANCE_SNAPSHOTS = "governanceSnapshots";
const BILLING_SNAPSHOTS = "billingSnapshots";
const VENDOR_AGGREGATES = "vendorAggregates";
const PORTFOLIO_SNAPSHOTS = "vendorIntelligenceSnapshots";
const ROLLUP_OPERATIONS = "vendorIntelligenceRollups";
const ROLLUP_ITEMS = "items";
const SCHEMA_VERSION = 1;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES_PER_RUN = 20;
const MAX_ATTEMPTS = 5;
const MAX_LICENSE_TRANSITIONS_PER_INSTITUTE = 50;
const LEASE_SECONDS = 300;
const MINIMUM_RETAINED_COMPLETE_MONTHS = 24;
const RETENTION_DELETE_LIMIT = 12;
const ACTIVE_YEAR_STATUSES = ["active", "started", "scheduled"];
const LIVE_INSTITUTE_STATUSES = new Set(["active", "suspended"]);
const EXCLUDED_INSTITUTE_STATUSES = new Set([
  "archived",
  "deletion_scheduled",
  "onboarding",
  "purged",
  "purging",
  "recovery_required",
]);
const RETRY_DELAYS_SECONDS = [5, 15, 30, 60] as const;

interface VendorIntelligenceRollupDependencies {
  firestore: FirebaseFirestore.Firestore;
  maxPagesPerRun: number;
  now: () => Date;
  pageSize: number;
}

interface ClaimedOperation {
  monthId: string;
  operationReference: FirebaseFirestore.DocumentReference;
  ownerHash: string;
  replayed: boolean;
}

interface CollectedPage {
  excludedCount: number;
  items: VendorIntelligenceRollupItemDocument[];
  lastDocumentId: string | null;
  reachedEnd: boolean;
  totalRootCount: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const sha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const addSeconds = (date: Date, seconds: number): string =>
  new Date(date.getTime() + (seconds * 1000)).toISOString();

const previousUtcMonth = (date: Date): string => {
  const previous = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth() - 1,
    1,
  ));
  return `${previous.getUTCFullYear()}-${String(
    previous.getUTCMonth() + 1,
  ).padStart(2, "0")}`;
};

const monthId = (value: unknown, now: Date): string => {
  const normalized = typeof value === "string" ? value.trim() : "";
  const resolved = normalized || previousUtcMonth(now);
  const match = /^(\d{4})-(\d{2})$/u.exec(resolved);
  if (!match) {
    throw new Error("Vendor intelligence monthId must match YYYY-MM.");
  }
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw new Error("Vendor intelligence monthId is not a calendar month.");
  }
  return resolved;
};

const monthRange = (value: string): {end: string; start: string} => {
  const [yearValue, monthValue] = value.split("-");
  const year = Number(yearValue);
  const month = Number(monthValue);
  return {
    end: new Date(Date.UTC(year, month, 1)).toISOString(),
    start: new Date(Date.UTC(year, month - 1, 1)).toISOString(),
  };
};

const requiredString = (
  value: unknown,
  fieldName: string,
): string => {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Vendor intelligence source field "${fieldName}" is invalid.`);
  }
  return value.trim();
};

const optionalString = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  return requiredString(value, "optionalString");
};

const nonNegativeInteger = (
  value: unknown,
  fieldName: string,
): number => {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`Vendor intelligence source field "${fieldName}" is invalid.`);
  }
  return Number(value);
};

const timestampIso = (value: unknown, fieldName: string): string => {
  if (!(value instanceof Timestamp)) {
    throw new Error(`Vendor intelligence source field "${fieldName}" is invalid.`);
  }
  return value.toDate().toISOString();
};

const licenseLayer = (
  value: unknown,
  fieldName: string,
): VendorIntelligenceRollupLayer => {
  if (value === "L0" || value === "L1" || value === "L2" || value === "L3") {
    return value;
  }
  throw new Error(`Vendor intelligence source field "${fieldName}" is invalid.`);
};

const currency = (value: unknown): string => {
  const normalized = requiredString(value, "billing.currency");
  if (!/^[A-Z]{3}$/u.test(normalized)) {
    throw new Error("Vendor intelligence billing currency must be uppercase ISO-4217.");
  }
  return normalized;
};

const zeroLayerCounts = (): VendorIntelligenceRollupLayerCounts => ({
  L0: 0,
  L1: 0,
  L2: 0,
  L3: 0,
});

const zeroLayerMoney = (): VendorIntelligenceRollupLayerMoney => ({
  L0: 0,
  L1: 0,
  L2: 0,
  L3: 0,
});

const zeroSourceCounts = (): VendorIntelligenceRollupSourceCounts => ({
  billingSnapshots: 0,
  governanceSnapshots: 0,
  licenseHistory: 0,
  usageMeter: 0,
});

const storedCount = (
  value: unknown,
  fieldName: string,
): number => nonNegativeInteger(value, fieldName);

const storedLayerCounts = (
  value: unknown,
): VendorIntelligenceRollupLayerCounts => {
  if (!isRecord(value)) throw new Error("Rollup layer counters are malformed.");
  return {
    L0: storedCount(value.L0, "layerCounts.L0"),
    L1: storedCount(value.L1, "layerCounts.L1"),
    L2: storedCount(value.L2, "layerCounts.L2"),
    L3: storedCount(value.L3, "layerCounts.L3"),
  };
};

const storedLayerMoney = (
  value: unknown,
): VendorIntelligenceRollupLayerMoney => {
  if (!isRecord(value)) throw new Error("Rollup layer revenue is malformed.");
  return {
    L0: storedCount(value.L0, "revenueByLayerMinor.L0"),
    L1: storedCount(value.L1, "revenueByLayerMinor.L1"),
    L2: storedCount(value.L2, "revenueByLayerMinor.L2"),
    L3: storedCount(value.L3, "revenueByLayerMinor.L3"),
  };
};

const storedSourceCounts = (
  value: unknown,
): VendorIntelligenceRollupSourceCounts => {
  if (!isRecord(value)) throw new Error("Rollup source counters are malformed.");
  return {
    billingSnapshots: storedCount(
      value.billingSnapshots,
      "sourceDocumentCounts.billingSnapshots",
    ),
    governanceSnapshots: storedCount(
      value.governanceSnapshots,
      "sourceDocumentCounts.governanceSnapshots",
    ),
    licenseHistory: storedCount(
      value.licenseHistory,
      "sourceDocumentCounts.licenseHistory",
    ),
    usageMeter: storedCount(
      value.usageMeter,
      "sourceDocumentCounts.usageMeter",
    ),
  };
};

const normalizePageSize = (value: number): number => {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_PAGE_SIZE) {
    throw new Error("Vendor intelligence rollup page size is invalid.");
  }
  return value;
};

const normalizeMaxPages = (value: number): number => {
  if (!Number.isSafeInteger(value) || value < 1 || value > 100) {
    throw new Error("Vendor intelligence maximum pages is invalid.");
  }
  return value;
};

const operationResult = (
  month: string,
  path: string,
  value: Record<string, unknown>,
): VendorIntelligenceRollupResult => ({
  monthId: month,
  operationPath: path,
  phase: value.phase as VendorIntelligenceRollupResult["phase"],
  processedInstituteCount: storedCount(
    value.processedInstituteCount,
    "processedInstituteCount",
  ),
  snapshotPath: `${PORTFOLIO_SNAPSHOTS}/${month}`,
  state: value.state as VendorIntelligenceRollupResult["state"],
});

/**
 * Produces resumable, aggregate-only Vendor intelligence monthly authority.
 */
export class VendorIntelligenceRollupService {
  private readonly dependencies: VendorIntelligenceRollupDependencies;
  private readonly logger = createLogger("VendorIntelligenceRollupService");

  constructor(
    dependencies: Partial<VendorIntelligenceRollupDependencies> = {},
  ) {
    this.dependencies = {
      firestore: dependencies.firestore ?? getFirestore(),
      maxPagesPerRun: normalizeMaxPages(
        dependencies.maxPagesPerRun ?? DEFAULT_MAX_PAGES_PER_RUN,
      ),
      now: dependencies.now ?? (() => new Date()),
      pageSize: normalizePageSize(
        dependencies.pageSize ?? DEFAULT_PAGE_SIZE,
      ),
    };
  }

  /**
   * Advances one monthly operation through bounded collection and install
   * pages, then publishes its immutable complete portfolio snapshot.
   * @param {VendorIntelligenceRollupInput} input Month and worker identity.
   * @return {Promise<VendorIntelligenceRollupResult>} Durable operation state.
   */
  public async generateMonthlyRollup(
    input: VendorIntelligenceRollupInput = {},
  ): Promise<VendorIntelligenceRollupResult> {
    const now = this.dependencies.now();
    const targetMonth = monthId(input.monthId, now);
    const workerId = input.workerId?.trim() || randomUUID();
    const claim = await this.claimOperation(targetMonth, workerId);
    if (claim.replayed) {
      await this.pruneOldSnapshots();
      const replaySnapshot = await claim.operationReference.get();
      return operationResult(
        targetMonth,
        claim.operationReference.path,
        replaySnapshot.data() ?? {},
      );
    }

    try {
      for (
        let pageNumber = 0;
        pageNumber < this.dependencies.maxPagesPerRun;
        pageNumber += 1
      ) {
        const operationSnapshot = await claim.operationReference.get();
        const operation = operationSnapshot.data() ?? {};
        if (operation.state === "complete") break;
        if (operation.leaseOwnerHash !== claim.ownerHash) break;
        if (operation.phase === "collecting") {
          await this.collectNextPage(claim, operation);
          continue;
        }
        if (operation.phase === "installing") {
          await this.installNextPage(claim, operation);
          continue;
        }
        throw new Error("Vendor intelligence rollup phase is invalid.");
      }

      const currentSnapshot = await claim.operationReference.get();
      const current = currentSnapshot.data() ?? {};
      if (current.state !== "complete" &&
        current.leaseOwnerHash === claim.ownerHash) {
        await claim.operationReference.update({
          leaseExpiresAt: null,
          leaseOwnerHash: null,
          nextAttemptAt: this.dependencies.now().toISOString(),
          state: "pending",
          updatedAt: this.dependencies.now().toISOString(),
        });
      }

      const finalOperation = await claim.operationReference.get();
      const finalValue = finalOperation.data() ?? {};
      if (finalValue.state === "complete") await this.pruneOldSnapshots();
      return operationResult(
        targetMonth,
        claim.operationReference.path,
        finalValue,
      );
    } catch (error) {
      await this.recordRetryableFailure(claim, error);
      throw error;
    }
  }

  private async claimOperation(
    targetMonth: string,
    workerId: string,
  ): Promise<ClaimedOperation> {
    const reference = this.dependencies.firestore
      .collection(ROLLUP_OPERATIONS)
      .doc(targetMonth);
    const ownerHash = sha256(workerId);
    const now = this.dependencies.now();
    const nowIso = now.toISOString();
    const replayed = await this.dependencies.firestore.runTransaction(
      async (transaction) => {
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists) {
          transaction.create(reference, {
            activeInstituteCount: 0,
            attemptCount: 0,
            collectCursor: null,
            currency: null,
            excludedInstituteCount: 0,
            installCursor: null,
            instituteCountByLayer: zeroLayerCounts(),
            lastErrorCode: null,
            leaseExpiresAt: addSeconds(now, LEASE_SECONDS),
            leaseOwnerHash: ownerHash,
            monthId: targetMonth,
            nextAttemptAt: nowIso,
            phase: "collecting",
            processedInstituteCount: 0,
            revenueByLayerMinor: zeroLayerMoney(),
            retryExhausted: false,
            rollingFingerprint: sha256(`vendor-intelligence:${targetMonth}`),
            schemaVersion: SCHEMA_VERSION,
            sourceDocumentCounts: zeroSourceCounts(),
            startedAt: nowIso,
            state: "processing",
            suspendedInstituteCount: 0,
            totalActiveStudents: 0,
            totalInstituteCount: 0,
            totalMonthlyRevenueMinor: 0,
            totalSessionExecutions: 0,
            totalTestRuns: 0,
            transitionCount: 0,
            updatedAt: nowIso,
          });
          return false;
        }

        const value = snapshot.data() ?? {};
        if (value.state === "complete") return true;
        const leaseExpiresAt = optionalString(value.leaseExpiresAt);
        if (value.state === "processing" && leaseExpiresAt &&
          leaseExpiresAt > nowIso) {
          throw new Error("Vendor intelligence rollup is already leased.");
        }
        const attemptCount = storedCount(value.attemptCount, "attemptCount");
        if (value.retryExhausted === true ||
          attemptCount >= MAX_ATTEMPTS) {
          throw new Error("Vendor intelligence rollup retry budget is exhausted.");
        }
        const nextAttemptAt = optionalString(value.nextAttemptAt);
        if (value.state === "failed_retryable" && nextAttemptAt &&
          nextAttemptAt > nowIso) {
          throw new Error("Vendor intelligence rollup retry is not due.");
        }
        transaction.update(reference, {
          lastErrorCode: null,
          leaseExpiresAt: addSeconds(now, LEASE_SECONDS),
          leaseOwnerHash: ownerHash,
          nextAttemptAt: nowIso,
          retryExhausted: false,
          state: "processing",
          updatedAt: nowIso,
        });
        return false;
      },
    );
    return {
      monthId: targetMonth,
      operationReference: reference,
      ownerHash,
      replayed,
    };
  }

  private async collectNextPage(
    claim: ClaimedOperation,
    operation: Record<string, unknown>,
  ): Promise<void> {
    let query: FirebaseFirestore.Query = this.dependencies.firestore
      .collection(INSTITUTES)
      .orderBy(FieldPath.documentId(), "asc")
      .limit(this.dependencies.pageSize);
    const cursor = optionalString(operation.collectCursor);
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.get();
    if (snapshot.empty) {
      await this.updateOwnedOperation(claim, {
        collectCursor: null,
        installCursor: null,
        phase: "installing",
      });
      return;
    }

    const page = await this.collectPage(claim.monthId, snapshot.docs);
    const now = this.dependencies.now();
    await this.dependencies.firestore.runTransaction(async (transaction) => {
      const operationSnapshot = await transaction.get(
        claim.operationReference,
      );
      const current = operationSnapshot.data() ?? {};
      this.assertOwned(current, claim.ownerHash, "collecting");
      if (optionalString(current.collectCursor) !== cursor) {
        throw new Error("Vendor intelligence collect cursor changed.");
      }
      for (const item of page.items) {
        transaction.set(
          claim.operationReference.collection(ROLLUP_ITEMS).doc(item.instituteId),
          item,
        );
      }
      const counters = this.accumulatePage(current, page);
      transaction.update(claim.operationReference, {
        ...counters,
        collectCursor: page.lastDocumentId,
        leaseExpiresAt: addSeconds(now, LEASE_SECONDS),
        phase: page.reachedEnd ? "installing" : "collecting",
        updatedAt: now.toISOString(),
      });
    });
  }

  private async collectPage(
    targetMonth: string,
    roots: FirebaseFirestore.QueryDocumentSnapshot[],
  ): Promise<CollectedPage> {
    const collected = await Promise.all(roots.map(async (root) => {
      const status = requiredString(root.get("status"), "institute.status")
        .toLowerCase();
      if (EXCLUDED_INSTITUTE_STATUSES.has(status)) return null;
      if (!LIVE_INSTITUTE_STATUSES.has(status)) {
        throw new Error("Vendor intelligence institute status is malformed.");
      }
      return this.collectInstitute(
        targetMonth,
        root,
        status as "active" | "suspended",
      );
    }));
    return {
      excludedCount: collected.filter((item) => item === null).length,
      items: collected.filter(
        (item): item is VendorIntelligenceRollupItemDocument => item !== null,
      ),
      lastDocumentId: roots.length > 0 ? roots[roots.length - 1].id : null,
      reachedEnd: roots.length < this.dependencies.pageSize,
      totalRootCount: roots.length,
    };
  }

  private async collectInstitute(
    targetMonth: string,
    root: FirebaseFirestore.QueryDocumentSnapshot,
    status: "active" | "suspended",
  ): Promise<VendorIntelligenceRollupItemDocument> {
    const instituteId = root.id;
    const institute = root.data();
    const licenseReference = root.ref.collection(LICENSE).doc(CURRENT_LICENSE);
    const usageReference = root.ref.collection(USAGE_METER).doc(targetMonth);
    const billingReference = this.dependencies.firestore
      .collection(BILLING_SNAPSHOTS)
      .doc(`${instituteId}__${targetMonth}`);
    const range = monthRange(targetMonth);
    const historyQuery = root.ref.collection(LICENSE_HISTORY)
      .where("effectiveDate", ">=", range.start)
      .where("effectiveDate", "<", range.end)
      .orderBy("effectiveDate", "asc")
      .limit(MAX_LICENSE_TRANSITIONS_PER_INSTITUTE + 1);
    const yearQuery = root.ref.collection(ACADEMIC_YEARS)
      .where("status", "in", ACTIVE_YEAR_STATUSES)
      .limit(ACTIVE_YEAR_STATUSES.length + 1);
    const [license, usage, billing, history, years] = await Promise.all([
      licenseReference.get(),
      usageReference.get(),
      billingReference.get(),
      historyQuery.get(),
      yearQuery.get(),
    ]);
    if (!license.exists || !isRecord(license.data())) {
      throw new Error(`Current license is missing for institute "${instituteId}".`);
    }
    if (history.size > MAX_LICENSE_TRANSITIONS_PER_INSTITUTE) {
      throw new Error("Monthly license history exceeds the supported bound.");
    }
    const layer = licenseLayer(
      license.get("currentLayer"),
      "license.currentLayer",
    );
    const usageData = usage.exists ? this.normalizeUsage(
      targetMonth,
      usage.data(),
    ) : null;
    const billingData = billing.exists ? this.normalizeBilling(
      instituteId,
      targetMonth,
      billing.data(),
    ) : null;
    const historyData = history.docs.map((document) =>
      this.normalizeHistory(instituteId, document.data()));
    const governance = await this.resolveGovernance(
      instituteId,
      targetMonth,
      years.docs,
    );
    const generatedAt = this.dependencies.now().toISOString();
    const normalized = {
      billing: billingData,
      governance,
      history: historyData,
      instituteId,
      instituteName: optionalString(institute.name ?? institute.instituteName),
      layer,
      status,
      usage: usageData,
    };
    const monthlyRecurringRevenue = billingData &&
      billingData.monthlyRevenueMinor !== null &&
      billingData.currency !== null ? {
        amountMinor: billingData.monthlyRevenueMinor,
        currency: billingData.currency,
      } : null;
    return {
      activeStudentCount: usageData?.activeStudentCount ?? null,
      currentLayer: layer,
      generatedAt,
      governanceSnapshotPresent: governance !== null,
      instituteId,
      instituteName: normalized.instituteName,
      instituteStatus: status,
      lastActivityAt: usageData?.updatedAt ?? null,
      latestCompleteMonth: targetMonth,
      licenseTransitionCount: historyData.length,
      monthlyRecurringRevenue,
      monthlySessionExecutions: usageData?.sessionExecutionVolume ?? null,
      monthlyTestRuns: usageData?.assignmentsCreated ?? null,
      schemaVersion: SCHEMA_VERSION,
      sourceFingerprint: sha256(JSON.stringify(normalized)),
      sourcePresence: {
        billingSnapshot: billingData !== null,
        governanceSnapshot: governance !== null,
        licenseHistory: historyData.length > 0,
        usageMeter: usageData !== null,
      },
    };
  }

  private normalizeUsage(
    targetMonth: string,
    value: unknown,
  ): {
    activeStudentCount: number;
    assignmentsCreated: number;
    sessionExecutionVolume: number;
    updatedAt: string;
  } {
    if (!isRecord(value) || value.cycleId !== targetMonth) {
      throw new Error("Vendor intelligence usage source is malformed.");
    }
    return {
      activeStudentCount: nonNegativeInteger(
        value.activeStudentCount,
        "usage.activeStudentCount",
      ),
      assignmentsCreated: nonNegativeInteger(
        value.assignmentsCreated,
        "usage.assignmentsCreated",
      ),
      sessionExecutionVolume: nonNegativeInteger(
        value.sessionExecutionVolume,
        "usage.sessionExecutionVolume",
      ),
      updatedAt: timestampIso(value.updatedAt, "usage.updatedAt"),
    };
  }

  private normalizeBilling(
    instituteId: string,
    targetMonth: string,
    value: unknown,
  ): {currency: string | null; monthlyRevenueMinor: number | null} {
    if (!isRecord(value) ||
      value.instituteId !== instituteId ||
      value.cycleId !== targetMonth ||
      value.immutable !== true ||
      value.schemaVersion !== SCHEMA_VERSION) {
      throw new Error("Vendor intelligence billing source is malformed.");
    }
    if (value.monthlyRevenueMinor === null && value.currency === null) {
      return {currency: null, monthlyRevenueMinor: null};
    }
    if (value.monthlyRevenueMinor === null || value.currency === null) {
      throw new Error("Vendor intelligence billing money is incomplete.");
    }
    return {
      currency: currency(value.currency),
      monthlyRevenueMinor: nonNegativeInteger(
        value.monthlyRevenueMinor,
        "billing.monthlyRevenueMinor",
      ),
    };
  }

  private normalizeHistory(
    instituteId: string,
    value: unknown,
  ): {effectiveDate: string; newLayer: string; previousLayer: string} {
    if (!isRecord(value) || value.instituteId !== instituteId) {
      throw new Error("Vendor intelligence license history is malformed.");
    }
    return {
      effectiveDate: requiredString(value.effectiveDate, "history.effectiveDate"),
      newLayer: licenseLayer(value.newLayer, "history.newLayer"),
      previousLayer: licenseLayer(value.previousLayer, "history.previousLayer"),
    };
  }

  private async resolveGovernance(
    instituteId: string,
    targetMonth: string,
    years: FirebaseFirestore.QueryDocumentSnapshot[],
  ): Promise<{academicYear: string; generatedAt: string} | null> {
    const priorities = new Map([
      ["active", 0],
      ["started", 1],
      ["scheduled", 2],
    ]);
    const ordered = years.slice().sort((left, right) =>
      (priorities.get(String(left.get("status"))) ?? 99) -
      (priorities.get(String(right.get("status"))) ?? 99) ||
      left.id.localeCompare(right.id));
    if (ordered.length > 1 &&
      ordered[0].get("status") === ordered[1].get("status")) {
      throw new Error("Vendor intelligence current academic year is ambiguous.");
    }
    const currentYear = ordered[0];
    if (!currentYear) return null;
    const snapshot = await currentYear.ref.collection(GOVERNANCE_SNAPSHOTS)
      .doc(targetMonth.replace("-", "_"))
      .get();
    if (!snapshot.exists) return null;
    const value = snapshot.data();
    if (!isRecord(value) ||
      value.instituteId !== instituteId ||
      value.month !== targetMonth ||
      value.immutable !== true ||
      value.schemaVersion !== SCHEMA_VERSION) {
      throw new Error("Vendor intelligence governance source is malformed.");
    }
    return {
      academicYear: currentYear.id,
      generatedAt: timestampIso(value.generatedAt, "governance.generatedAt"),
    };
  }

  private accumulatePage(
    operation: Record<string, unknown>,
    page: CollectedPage,
  ): Record<string, unknown> {
    const layerCounts = storedLayerCounts(operation.instituteCountByLayer);
    const layerMoney = storedLayerMoney(operation.revenueByLayerMinor);
    const sourceCounts = storedSourceCounts(operation.sourceDocumentCounts);
    let rollingFingerprint = requiredString(
      operation.rollingFingerprint,
      "rollingFingerprint",
    );
    let currencyValue = optionalString(operation.currency);
    let activeCount = storedCount(
      operation.activeInstituteCount,
      "activeInstituteCount",
    );
    let suspendedCount = storedCount(
      operation.suspendedInstituteCount,
      "suspendedInstituteCount",
    );
    let students = storedCount(operation.totalActiveStudents, "totalActiveStudents");
    let revenue = storedCount(
      operation.totalMonthlyRevenueMinor,
      "totalMonthlyRevenueMinor",
    );
    let sessions = storedCount(
      operation.totalSessionExecutions,
      "totalSessionExecutions",
    );
    let tests = storedCount(operation.totalTestRuns, "totalTestRuns");
    let transitions = storedCount(operation.transitionCount, "transitionCount");
    for (const item of page.items) {
      layerCounts[item.currentLayer] += 1;
      if (item.instituteStatus === "active") activeCount += 1;
      else suspendedCount += 1;
      students += item.activeStudentCount ?? 0;
      sessions += item.monthlySessionExecutions ?? 0;
      tests += item.monthlyTestRuns ?? 0;
      transitions += item.licenseTransitionCount;
      if (item.monthlyRecurringRevenue) {
        if (currencyValue &&
          currencyValue !== item.monthlyRecurringRevenue.currency) {
          throw new Error("Vendor intelligence source currencies are mixed.");
        }
        currencyValue = item.monthlyRecurringRevenue.currency;
        revenue += item.monthlyRecurringRevenue.amountMinor;
        layerMoney[item.currentLayer] +=
          item.monthlyRecurringRevenue.amountMinor;
      }
      sourceCounts.billingSnapshots +=
        item.sourcePresence.billingSnapshot ? 1 : 0;
      sourceCounts.governanceSnapshots +=
        item.sourcePresence.governanceSnapshot ? 1 : 0;
      sourceCounts.licenseHistory += item.licenseTransitionCount;
      sourceCounts.usageMeter += item.sourcePresence.usageMeter ? 1 : 0;
      rollingFingerprint = sha256(
        `${rollingFingerprint}:${item.instituteId}:${item.sourceFingerprint}`,
      );
    }
    return {
      activeInstituteCount: activeCount,
      currency: currencyValue,
      excludedInstituteCount: storedCount(
        operation.excludedInstituteCount,
        "excludedInstituteCount",
      ) + page.excludedCount,
      instituteCountByLayer: layerCounts,
      processedInstituteCount: storedCount(
        operation.processedInstituteCount,
        "processedInstituteCount",
      ) + page.items.length,
      revenueByLayerMinor: layerMoney,
      rollingFingerprint,
      sourceDocumentCounts: sourceCounts,
      suspendedInstituteCount: suspendedCount,
      totalActiveStudents: students,
      totalInstituteCount: storedCount(
        operation.totalInstituteCount,
        "totalInstituteCount",
      ) + page.totalRootCount,
      totalMonthlyRevenueMinor: revenue,
      totalSessionExecutions: sessions,
      totalTestRuns: tests,
      transitionCount: transitions,
    };
  }

  private async installNextPage(
    claim: ClaimedOperation,
    operation: Record<string, unknown>,
  ): Promise<void> {
    let query: FirebaseFirestore.Query = claim.operationReference
      .collection(ROLLUP_ITEMS)
      .orderBy(FieldPath.documentId(), "asc")
      .limit(this.dependencies.pageSize);
    const cursor = optionalString(operation.installCursor);
    if (cursor) query = query.startAfter(cursor);
    const items = await query.get();
    if (items.empty) {
      await this.finalizeOperation(claim);
      return;
    }
    const now = this.dependencies.now();
    await this.dependencies.firestore.runTransaction(async (transaction) => {
      const operationSnapshot = await transaction.get(claim.operationReference);
      const current = operationSnapshot.data() ?? {};
      this.assertOwned(current, claim.ownerHash, "installing");
      if (optionalString(current.installCursor) !== cursor) {
        throw new Error("Vendor intelligence install cursor changed.");
      }
      for (const item of items.docs) {
        const value = item.data() as VendorIntelligenceRollupItemDocument;
        transaction.set(
          this.dependencies.firestore.collection(VENDOR_AGGREGATES).doc(item.id),
          value,
        );
      }
      transaction.update(claim.operationReference, {
        installCursor: items.docs.length > 0 ?
          items.docs[items.docs.length - 1].id : cursor,
        leaseExpiresAt: addSeconds(now, LEASE_SECONDS),
        updatedAt: now.toISOString(),
      });
    });
  }

  private async finalizeOperation(claim: ClaimedOperation): Promise<void> {
    const snapshotReference = this.dependencies.firestore
      .collection(PORTFOLIO_SNAPSHOTS)
      .doc(claim.monthId);
    const completedAt = this.dependencies.now().toISOString();
    await this.dependencies.firestore.runTransaction(async (transaction) => {
      const [operationSnapshot, existingSnapshot] = await Promise.all([
        transaction.get(claim.operationReference),
        transaction.get(snapshotReference),
      ]);
      const operation = operationSnapshot.data() ?? {};
      this.assertOwned(operation, claim.ownerHash, "installing");
      const portfolio = this.buildPortfolioSnapshot(
        claim.monthId,
        completedAt,
        operation,
      );
      if (existingSnapshot.exists) {
        if (existingSnapshot.get("status") !== "complete" ||
          existingSnapshot.get("sourceFingerprint") !==
            portfolio.sourceFingerprint) {
          throw new Error("Immutable Vendor intelligence snapshot conflicts.");
        }
      } else {
        transaction.create(snapshotReference, portfolio);
      }
      transaction.update(claim.operationReference, {
        completedAt,
        leaseExpiresAt: null,
        leaseOwnerHash: null,
        nextAttemptAt: null,
        phase: "complete",
        snapshotPath: snapshotReference.path,
        state: "complete",
        updatedAt: completedAt,
      });
    });
    this.logger.info("Vendor intelligence rollup completed.", {
      monthId: claim.monthId,
      operationPath: claim.operationReference.path,
      snapshotPath: snapshotReference.path,
    });
  }

  private buildPortfolioSnapshot(
    targetMonth: string,
    generatedAt: string,
    operation: Record<string, unknown>,
  ): VendorIntelligencePortfolioSnapshotDocument {
    return {
      activeInstituteCount: storedCount(
        operation.activeInstituteCount,
        "activeInstituteCount",
      ),
      currency: optionalString(operation.currency),
      excludedInstituteCount: storedCount(
        operation.excludedInstituteCount,
        "excludedInstituteCount",
      ),
      generatedAt,
      immutable: true,
      instituteCountByLayer: storedLayerCounts(
        operation.instituteCountByLayer,
      ),
      monthId: targetMonth,
      revenueByLayerMinor: storedLayerMoney(operation.revenueByLayerMinor),
      schemaVersion: SCHEMA_VERSION,
      sourceDocumentCounts: storedSourceCounts(
        operation.sourceDocumentCounts,
      ),
      sourceFingerprint: requiredString(
        operation.rollingFingerprint,
        "rollingFingerprint",
      ),
      status: "complete",
      suspendedInstituteCount: storedCount(
        operation.suspendedInstituteCount,
        "suspendedInstituteCount",
      ),
      totalActiveStudents: storedCount(
        operation.totalActiveStudents,
        "totalActiveStudents",
      ),
      totalInstituteCount: storedCount(
        operation.totalInstituteCount,
        "totalInstituteCount",
      ),
      totalMonthlyRevenueMinor: storedCount(
        operation.totalMonthlyRevenueMinor,
        "totalMonthlyRevenueMinor",
      ),
      totalSessionExecutions: storedCount(
        operation.totalSessionExecutions,
        "totalSessionExecutions",
      ),
      totalTestRuns: storedCount(operation.totalTestRuns, "totalTestRuns"),
      transitionCount: storedCount(
        operation.transitionCount,
        "transitionCount",
      ),
    };
  }

  private async updateOwnedOperation(
    claim: ClaimedOperation,
    update: Record<string, unknown>,
  ): Promise<void> {
    const now = this.dependencies.now();
    await this.dependencies.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(claim.operationReference);
      const value = snapshot.data() ?? {};
      this.assertOwned(value, claim.ownerHash, String(value.phase));
      transaction.update(claim.operationReference, {
        ...update,
        leaseExpiresAt: addSeconds(now, LEASE_SECONDS),
        updatedAt: now.toISOString(),
      });
    });
  }

  private assertOwned(
    value: Record<string, unknown>,
    ownerHash: string,
    phase: string,
  ): void {
    if (value.state !== "processing" ||
      value.phase !== phase ||
      value.leaseOwnerHash !== ownerHash) {
      throw new Error("Vendor intelligence rollup lease or phase changed.");
    }
  }

  private async recordRetryableFailure(
    claim: ClaimedOperation,
    error: unknown,
  ): Promise<void> {
    const now = this.dependencies.now();
    await this.dependencies.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(claim.operationReference);
      if (!snapshot.exists || snapshot.get("state") === "complete" ||
        snapshot.get("leaseOwnerHash") !== claim.ownerHash) return;
      const attemptCount = storedCount(
        snapshot.get("attemptCount"),
        "attemptCount",
      ) + 1;
      const retryDelay = RETRY_DELAYS_SECONDS[attemptCount - 1];
      transaction.update(claim.operationReference, {
        attemptCount,
        lastErrorCode: "ROLLUP_SOURCE_OR_WRITE_FAILED",
        leaseExpiresAt: null,
        leaseOwnerHash: null,
        nextAttemptAt: retryDelay === undefined ? null : addSeconds(now, retryDelay),
        retryExhausted: retryDelay === undefined,
        state: "failed_retryable",
        updatedAt: now.toISOString(),
      });
    });
    this.logger.error("Vendor intelligence rollup failed.", {
      error,
      monthId: claim.monthId,
      operationPath: claim.operationReference.path,
    });
  }

  private async pruneOldSnapshots(): Promise<void> {
    const collection = this.dependencies.firestore
      .collection(PORTFOLIO_SNAPSHOTS);
    const countSnapshot = await collection.count().get();
    const deleteCount = Math.min(
      RETENTION_DELETE_LIMIT,
      Math.max(
        0,
        countSnapshot.data().count - MINIMUM_RETAINED_COMPLETE_MONTHS,
      ),
    );
    if (deleteCount === 0) return;
    const snapshot = await collection
      .orderBy(FieldPath.documentId(), "asc")
      .limit(deleteCount)
      .get();
    const expired = snapshot.docs.filter((document) => {
      if (!/^\d{4}-\d{2}$/u.test(document.id) ||
        document.get("status") !== "complete") {
        throw new Error("Vendor intelligence snapshot retention source is malformed.");
      }
      return true;
    });
    const batch = this.dependencies.firestore.batch();
    for (const document of expired) batch.delete(document.ref);
    await batch.commit();
  }
}

export const vendorIntelligenceRollupService =
  new VendorIntelligenceRollupService();
