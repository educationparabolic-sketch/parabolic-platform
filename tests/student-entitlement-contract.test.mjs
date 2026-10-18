import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("../functions/node_modules/typescript");
const root = fileURLToPath(new URL("../", import.meta.url));

function compile(source, moduleResolution, module) {
  const file = `${root}tests/__student_entitlement_contract_probe.ts`;
  const options = {strict: true, noEmit: true, types: [],
    target: ts.ScriptTarget.ES2022, moduleResolution, module};
  const host = ts.createCompilerHost(options);
  const original = host.getSourceFile.bind(host);
  host.getSourceFile = (name, version, onError, fresh) => name === file ?
    ts.createSourceFile(file, source, version, true) : original(name, version, onError, fresh);
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram([file], options, host));
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: () => root, getCanonicalFileName: (name) => name, getNewLine: () => "\n",
  }));
}

test("reserved Student contracts keep history, intent and locked values distinct in both toolchains", () => {
  const source = `
    import type {StudentTestsQueryV2, StudentSolutionsQueryV2,
      StudentHistoryRecord, StudentHistoryScope, StudentCurrentYearScope,
      StudentTestsResultV2, StudentSolutionsResultV2, StudentSolutionAvailability,
      StudentDashboardResultV2, StudentPerformanceResultV2,
      StudentInsightsResultV2, StudentReleasedSolutionItem,
      StudentCursorPage} from "../shared/contracts/studentEntitlements.js";
    const current: StudentTestsQueryV2 = {scope: "current", status: "completed", pageSize: 10};
    const history: StudentTestsQueryV2 = {scope: "history", yearId: "opaque-year", cursor: "opaque"};
    // @ts-expect-error current scope cannot target an arbitrary year
    const override: StudentTestsQueryV2 = {...current, yearId: "other"};
    // @ts-expect-error history has no operational status filter
    const closed: StudentTestsQueryV2 = {...history, status: "active"};
    // @ts-expect-error tenant is never browser intent
    const tenant: StudentTestsQueryV2 = {...current, instituteId: "other"};
    // @ts-expect-error identity is never browser intent
    const owner: StudentTestsQueryV2 = {...current, studentId: "other"};
    // @ts-expect-error license is never browser intent
    const license: StudentTestsQueryV2 = {...current, licenseLayer: "L3"};
    // @ts-expect-error no numeric-page pagination
    const offset: StudentTestsQueryV2 = {...current, page: 9};
    const solution: StudentSolutionsQueryV2 = {runId: "selected-run", pageSize: 10};
    // @ts-expect-error exact run selection is mandatory
    const guessed: StudentSolutionsQueryV2 = {pageSize: 10};
    // @ts-expect-error no history solution selector
    const oldSolution: StudentSolutionsQueryV2 = {...solution, yearId: "old"};
    declare const row: StudentHistoryRecord;
    // @ts-expect-error history cannot expose a session
    row.sessionId;
    // @ts-expect-error history cannot expose media
    row.solutionImageUrl;
    // @ts-expect-error history cannot expose raw or advanced metrics
    row.disciplineIndex;
    // @ts-expect-error history cannot grant solution access
    row.solutionAccess;
    const historical: false = row.currentAcademicYear;
    declare const historyScope: StudentHistoryScope;
    const cold: "COLD_SUMMARY" = historyScope.tier;
    // @ts-expect-error current and history tiers cannot be interchanged
    const warm: StudentCurrentYearScope = historyScope;
    declare const historyResult: Extract<StudentTestsResultV2, {scope: StudentHistoryScope}>;
    const rows: StudentHistoryRecord[] = historyResult.page.items;
    const noAdvancedHistory: false = historyResult.access.metrics.advanced;
    const noInsightHistory: false = historyResult.access.metrics.insights;
    declare const page: StudentCursorPage<StudentHistoryRecord>;
    // @ts-expect-error no unauthorized or fabricated total
    page.total;
    const locked: StudentSolutionAvailability = {state: "locked", reason: "not_released"};
    // @ts-expect-error available must carry server release time
    const noTime: StudentSolutionAvailability = {state: "available"};
    // @ts-expect-error a lock cannot also advertise release success
    const contradictory: StudentSolutionAvailability = {...locked, releasedAt: "now"};
    declare const dashboard: StudentDashboardResultV2;
    // @ts-expect-error callers must handle a locked metric
    const discipline: number = dashboard.disciplineIndex;
    // @ts-expect-error locked risk cannot silently become low
    const risk: string = dashboard.riskState;
    const basic: number = dashboard.avgRawScorePercent;
    declare const performance: StudentPerformanceResultV2;
    // @ts-expect-error nested timeline redaction is explicit
    const nested: number = performance.timeline[0].guessRatePercent;
    declare const comparison: NonNullable<StudentPerformanceResultV2["controlledModeComparison"]>;
    // @ts-expect-error the nested hard-timing metric can be denied independently
    const nestedHardTiming: number = comparison.maxTimeViolationDeltaPercent;
    declare const insights: StudentInsightsResultV2;
    // @ts-expect-error numeric guess aliases require null handling at L1
    const alias: number = insights.snapshots[0].guessDetectionPercent;
    declare const item: StudentReleasedSolutionItem;
    // @ts-expect-error absent optional assets cannot become empty success URLs
    const image: string = item.solutionImageUrl;
    // @ts-expect-error no internal Storage path in public solutions
    item.objectPath;
    declare const released: StudentSolutionsResultV2;
    const v2: 2 = released.contractVersion;
    // @ts-expect-error whole raw session is never public
    released.answerMap;
  `;
  compile(source, ts.ModuleResolutionKind.Bundler, ts.ModuleKind.ESNext);
  compile(source, ts.ModuleResolutionKind.NodeNext, ts.ModuleKind.NodeNext);
});

test("contract stays declaration-only and documents ordered reader adoption", () => {
  const declarations = readFileSync(`${root}shared/contracts/studentEntitlements.d.ts`, "utf8");
  const ast = ts.createSourceFile("studentEntitlements.d.ts", declarations, ts.ScriptTarget.Latest, true);
  assert.ok(ast.statements.every((node) => ts.isImportDeclaration(node) ||
    ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)));
  const docs = readFileSync(`${root}docs/STUDENT_ENTITLEMENT_CONTRACT.md`, "utf8");
  assert.match(docs, /STU-01\.\.05 serve v2/);
  assert.match(docs, /Legacy v1 is \*\*not\*\* a parallel weaker reader/);
  assert.match(docs, /No count of\s+unfiltered\/unauthorized records is exposed/);
});
