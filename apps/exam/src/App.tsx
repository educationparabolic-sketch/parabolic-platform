import { useEffect, useMemo, useState } from "react";
import { Route, Routes, useLocation, useParams } from "react-router-dom";
import { usePortalTitle } from "../../../shared/hooks/usePortalTitle";
import "./App.css";

type QuestionPaletteStatus = "not_visited" | "not_answered" | "answered" | "marked" | "answered_marked";
type ExecutionMode = "Operational" | "Diagnostic" | "Controlled" | "Hard";
type QuestionSection = "Physics" | "Chemistry" | "Mathematics";
type QuestionType = "mcq" | "numeric" | "matrix";
type CalculatorOperation =
  | "sqrt"
  | "square"
  | "cbrt"
  | "cube"
  | "log"
  | "ln"
  | "sin"
  | "cos"
  | "tan"
  | "pi"
  | "e"
  | "clear"
  | "backspace"
  | "equals";

interface TokenClaims {
  sub: string | null;
  exp: number | null;
  mode: ExecutionMode;
}

interface EntryValidationResult {
  allowed: boolean;
  reason: "missing_token" | "expired_token" | "malformed_token" | null;
  claims: TokenClaims;
}

interface ModeInstruction {
  title: string;
  points: string[];
}

interface QuestionOption {
  id: string;
  label: string;
  text: string;
}

interface QuestionMedia {
  type: "video" | "audio";
  title: string;
  url: string;
}

interface SessionQuestion {
  id: string;
  number: number;
  section: QuestionSection;
  type: QuestionType;
  text: string;
  imageUrl?: string;
  options?: QuestionOption[];
  matrixRows?: string[];
  matrixColumns?: string[];
  media?: QuestionMedia;
}

interface SessionSnapshot {
  sessionId: string;
  questionSetVersion: string;
  subjects: QuestionSection[];
  questions: SessionQuestion[];
  hardModeRevisitRestricted: boolean;
}

interface QuestionResponseState {
  selectedOptionId: string | null;
  numericResponse: string;
  matrixSelections: string[];
  markedForReview: boolean;
}

interface PaletteTile {
  id: string;
  number: number;
  section: QuestionSection;
  status: QuestionPaletteStatus;
  revisitLocked: boolean;
}

const EXAM_DURATION_MINUTES = 180;
const TIMER_SYNC_INTERVAL_MS = 10_000;
const TICK_INTERVAL_MS = 1_000;
const EXPIRY_RED_MINUTES_THRESHOLD = 10;
const STUDENT_PORTAL_FALLBACK_PATH = "/student/my-tests";

const MARKING_SCHEME = [
  "+4 for each correct answer",
  "-1 for each incorrect MCQ answer",
  "0 for unanswered questions",
  "Numeric-type questions do not carry negative marking unless explicitly configured",
];

const NAVIGATION_INSTRUCTIONS = [
  "Use the left question palette for direct question jumps.",
  "Use section tabs to focus on Physics, Chemistry, or Mathematics.",
  "Answered questions are tracked in green tiles and review-marked ones in purple variants.",
  "Submission should only happen after final review of unanswered and marked questions.",
];

const MODE_INSTRUCTIONS: Record<ExecutionMode, ModeInstruction> = {
  Operational: {
    title: "Operational Mode",
    points: [
      "Free question navigation is available across all sections.",
      "No pacing interventions are enforced in this mode.",
    ],
  },
  Diagnostic: {
    title: "L1 Diagnostic Mode",
    points: [
      "Diagnostic advisories may appear to guide pacing awareness.",
      "No blocking actions are enforced; this mode remains advisory.",
    ],
  },
  Controlled: {
    title: "L2 Controlled Mode",
    points: [
      "Minimum engagement timing is enforced per question.",
      "Save actions may remain disabled until minimum timing conditions are met.",
    ],
  },
  Hard: {
    title: "Hard Mode",
    points: [
      "Minimum and maximum timing limits may be enforced per question.",
      "Revisit and free navigation behavior can be restricted by session policy.",
    ],
  },
};

const QUESTION_PALETTE_LEGEND: Array<{ status: QuestionPaletteStatus; label: string }> = [
  { status: "not_visited", label: "Not Visited" },
  { status: "not_answered", label: "Not Answered" },
  { status: "answered", label: "Answered" },
  { status: "marked", label: "Marked for Review" },
  { status: "answered_marked", label: "Answered & Marked" },
];

const CALCULATOR_KEYS = ["7", "8", "9", "/", "4", "5", "6", "*", "1", "2", "3", "-", "0", ".", "(", ")", "+"];
const PHYSICS_IMAGE_DATA_URI = `data:image/svg+xml;utf8,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='800' height='400'><rect width='100%' height='100%' fill='#edf4ff'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='Segoe UI' font-size='28' fill='#1f5fbf'>Physics Question Figure</text></svg>",
)}`;
const CHEMISTRY_IMAGE_DATA_URI = `data:image/svg+xml;utf8,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='800' height='400'><rect width='100%' height='100%' fill='#f2fbf5'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='Segoe UI' font-size='28' fill='#0a7e42'>Chemistry Question Figure</text></svg>",
)}`;

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return atob(padded);
}

function parseExecutionMode(value: unknown): ExecutionMode | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "operational" || normalized === "l0") {
    return "Operational";
  }
  if (normalized === "diagnostic" || normalized === "l1") {
    return "Diagnostic";
  }
  if (normalized === "controlled" || normalized === "l2") {
    return "Controlled";
  }
  if (normalized === "hard" || normalized === "l3") {
    return "Hard";
  }

  return null;
}

function parseTokenClaims(token: string): TokenClaims | null {
  const tokenParts = token.split(".");
  if (tokenParts.length !== 3) {
    return null;
  }

  try {
    const payload = JSON.parse(decodeBase64Url(tokenParts[1] ?? "")) as Record<string, unknown>;
    return {
      sub: typeof payload.sub === "string" && payload.sub.trim().length > 0 ? payload.sub.trim() : null,
      exp: typeof payload.exp === "number" && Number.isFinite(payload.exp) ? payload.exp : null,
      mode:
        parseExecutionMode(payload.mode) ??
        parseExecutionMode(payload.executionMode) ??
        parseExecutionMode(payload.licenseLayer) ??
        "Operational",
    };
  } catch {
    return null;
  }
}

function validateSessionEntry(token: string | null): EntryValidationResult {
  if (!token || token.trim().length === 0) {
    return {
      allowed: false,
      reason: "missing_token",
      claims: { sub: null, exp: null, mode: "Operational" },
    };
  }

  const claims = parseTokenClaims(token.trim());
  if (!claims) {
    return {
      allowed: false,
      reason: "malformed_token",
      claims: { sub: null, exp: null, mode: "Operational" },
    };
  }

  if (claims.exp && claims.exp * 1000 <= Date.now()) {
    return {
      allowed: false,
      reason: "expired_token",
      claims,
    };
  }

  return {
    allowed: true,
    reason: null,
    claims,
  };
}

function statusClassName(status: QuestionPaletteStatus): string {
  switch (status) {
    case "not_visited":
      return "exam-palette-tile-not-visited";
    case "not_answered":
      return "exam-palette-tile-not-answered";
    case "answered":
      return "exam-palette-tile-answered";
    case "marked":
      return "exam-palette-tile-marked";
    case "answered_marked":
      return "exam-palette-tile-answered-marked";
    default:
      return "exam-palette-tile-not-visited";
  }
}

function toCountdownLabel(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function buildSessionSnapshot(sessionId: string, mode: ExecutionMode): SessionSnapshot {
  const questions: SessionQuestion[] = [
    {
      id: "q-1",
      number: 1,
      section: "Physics",
      type: "mcq",
      text: "A particle moves in a circle of radius r with constant speed v. What is the magnitude of centripetal acceleration?",
      options: [
        { id: "q1-a", label: "A", text: "v / r" },
        { id: "q1-b", label: "B", text: "v² / r" },
        { id: "q1-c", label: "C", text: "r / v²" },
        { id: "q1-d", label: "D", text: "v² r" },
      ],
      media: {
        type: "video",
        title: "Reference animation: circular motion setup",
        url: "https://example.com/media/circular-motion",
      },
    },
    {
      id: "q-2",
      number: 2,
      section: "Physics",
      type: "numeric",
      text: "A body starts from rest and accelerates uniformly at 2 m/s² for 6 seconds. Enter displacement in meters.",
      imageUrl: PHYSICS_IMAGE_DATA_URI,
    },
    {
      id: "q-3",
      number: 3,
      section: "Physics",
      type: "matrix",
      text: "Match each quantity to its SI unit symbol.",
      matrixRows: ["Force", "Power", "Frequency"],
      matrixColumns: ["N", "W", "Hz", "J"],
    },
    {
      id: "q-4",
      number: 4,
      section: "Chemistry",
      type: "mcq",
      text: "Which quantum number determines the orientation of an orbital?",
      options: [
        { id: "q4-a", label: "A", text: "Principal quantum number" },
        { id: "q4-b", label: "B", text: "Azimuthal quantum number" },
        { id: "q4-c", label: "C", text: "Magnetic quantum number" },
        { id: "q4-d", label: "D", text: "Spin quantum number" },
      ],
    },
    {
      id: "q-5",
      number: 5,
      section: "Chemistry",
      type: "numeric",
      text: "For pH = 3 solution, enter [H+] concentration in mol/L using decimal notation.",
    },
    {
      id: "q-6",
      number: 6,
      section: "Chemistry",
      type: "mcq",
      text: "Identify the compound that exhibits hydrogen bonding in pure state.",
      options: [
        { id: "q6-a", label: "A", text: "CH4" },
        { id: "q6-b", label: "B", text: "NH3" },
        { id: "q6-c", label: "C", text: "CO2" },
        { id: "q6-d", label: "D", text: "CCl4" },
      ],
      imageUrl: CHEMISTRY_IMAGE_DATA_URI,
    },
    {
      id: "q-7",
      number: 7,
      section: "Mathematics",
      type: "mcq",
      text: "If f(x) = x³, then f'(2) equals:",
      options: [
        { id: "q7-a", label: "A", text: "4" },
        { id: "q7-b", label: "B", text: "8" },
        { id: "q7-c", label: "C", text: "12" },
        { id: "q7-d", label: "D", text: "16" },
      ],
    },
    {
      id: "q-8",
      number: 8,
      section: "Mathematics",
      type: "matrix",
      text: "Select all statements that are true for a 2x2 identity matrix.",
      matrixRows: ["Determinant", "Trace", "Inverse"],
      matrixColumns: ["Equals 1", "Equals 2", "Exists", "Zero"],
    },
    {
      id: "q-9",
      number: 9,
      section: "Mathematics",
      type: "numeric",
      text: "Evaluate integral of 2x from x = 0 to x = 3.",
      media: {
        type: "audio",
        title: "Optional audio instruction",
        url: "https://example.com/media/math-audio",
      },
    },
  ];

  return {
    sessionId,
    questionSetVersion: "snapshot-v1",
    subjects: ["Physics", "Chemistry", "Mathematics"],
    questions,
    hardModeRevisitRestricted: mode === "Hard",
  };
}

function buildInitialResponseMap(questions: SessionQuestion[]): Record<string, QuestionResponseState> {
  return questions.reduce<Record<string, QuestionResponseState>>((accumulator, question) => {
    accumulator[question.id] = {
      selectedOptionId: null,
      numericResponse: "",
      matrixSelections: [],
      markedForReview: false,
    };
    return accumulator;
  }, {});
}

function hasAnswer(question: SessionQuestion, responseState: QuestionResponseState): boolean {
  if (question.type === "mcq") {
    return Boolean(responseState.selectedOptionId);
  }
  if (question.type === "numeric") {
    return responseState.numericResponse.trim().length > 0;
  }

  return responseState.matrixSelections.length > 0;
}

function toPaletteStatus(question: SessionQuestion, responseState: QuestionResponseState, hasVisited: boolean): QuestionPaletteStatus {
  if (!hasVisited) {
    return "not_visited";
  }

  const answered = hasAnswer(question, responseState);
  if (answered && responseState.markedForReview) {
    return "answered_marked";
  }
  if (answered) {
    return "answered";
  }
  if (responseState.markedForReview) {
    return "marked";
  }
  return "not_answered";
}

function getQuestionIndex(questions: SessionQuestion[], questionId: string): number {
  return questions.findIndex((question) => question.id === questionId);
}

function evaluateExpression(expression: string): number {
  if (!/^[0-9+\-*/().\s]+$/.test(expression)) {
    throw new Error("Invalid expression");
  }

  const evaluator = Function(`"use strict"; return (${expression});`);
  const value = evaluator();

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("Evaluation error");
  }

  return value;
}

function evaluateScientificOperation(currentValue: string, operation: CalculatorOperation): string {
  const trimmed = currentValue.trim();

  if (operation === "clear") {
    return "";
  }
  if (operation === "backspace") {
    return currentValue.slice(0, -1);
  }
  if (operation === "pi") {
    return `${currentValue}${Math.PI.toFixed(8)}`;
  }
  if (operation === "e") {
    return `${currentValue}${Math.E.toFixed(8)}`;
  }
  if (operation === "equals") {
    if (trimmed.length === 0) {
      return "";
    }
    return String(evaluateExpression(trimmed));
  }

  if (trimmed.length === 0) {
    return currentValue;
  }

  const numericValue = Number(trimmed);
  if (!Number.isFinite(numericValue)) {
    throw new Error("Input must be numeric for scientific operations");
  }

  if (operation === "sqrt") {
    return String(Math.sqrt(numericValue));
  }
  if (operation === "square") {
    return String(numericValue ** 2);
  }
  if (operation === "cbrt") {
    return String(Math.cbrt(numericValue));
  }
  if (operation === "cube") {
    return String(numericValue ** 3);
  }
  if (operation === "log") {
    return String(Math.log10(numericValue));
  }
  if (operation === "ln") {
    return String(Math.log(numericValue));
  }
  if (operation === "sin") {
    return String(Math.sin(numericValue));
  }
  if (operation === "cos") {
    return String(Math.cos(numericValue));
  }

  return String(Math.tan(numericValue));
}

function ExamAccessRedirect(props: { reason: EntryValidationResult["reason"] }) {
  const { reason } = props;

  return (
    <main className="exam-access-shell" aria-live="polite">
      <section className="exam-access-card">
        <p className="exam-access-eyebrow">Secure Entry Check</p>
        <h1>Session Access Blocked</h1>
        <p>
          Exam session access requires a valid signed token generated through the backend exam start flow.
        </p>
        <p className="exam-access-reason">
          Reason:
          {" "}
          <strong>{reason ?? "invalid_entry"}</strong>
        </p>
        <button
          type="button"
          className="exam-start-button"
          onClick={() => {
            window.location.assign(STUDENT_PORTAL_FALLBACK_PATH);
          }}
        >
          Go to Student Portal
        </button>
      </section>
    </main>
  );
}

function ScientificCalculatorModal(props: { open: boolean; onClose: () => void }) {
  const { open, onClose } = props;
  const [displayValue, setDisplayValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return null;
  }

  const runScientificOperation = (operation: CalculatorOperation) => {
    try {
      const nextValue = evaluateScientificOperation(displayValue, operation);
      setDisplayValue(nextValue);
      setError(null);
    } catch (operationError) {
      setError(operationError instanceof Error ? operationError.message : "Calculation error");
    }
  };

  return (
    <div className="exam-calculator-overlay" role="presentation" onClick={onClose}>
      <section
        className="exam-calculator-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Scientific calculator"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="exam-calculator-header">
          <h2>Scientific Calculator</h2>
          <button type="button" className="exam-calculator-close" onClick={onClose}>
            Close
          </button>
        </header>

        <p className="exam-calculator-note">
          Client-side calculator only. No server persistence and no history storage.
        </p>

        <input
          type="text"
          className="exam-calculator-display"
          value={displayValue}
          onChange={(event) => {
            setDisplayValue(event.target.value);
            setError(null);
          }}
          aria-label="Calculator display"
        />

        {error ? <p className="exam-calculator-error">{error}</p> : null}

        <div className="exam-calculator-grid" aria-label="Arithmetic keypad">
          {CALCULATOR_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              className="exam-calculator-key"
              onClick={() => {
                setDisplayValue((current) => `${current}${key}`);
                setError(null);
              }}
            >
              {key}
            </button>
          ))}
        </div>

        <div className="exam-calculator-operations" aria-label="Scientific operations">
          <button type="button" onClick={() => runScientificOperation("sqrt")}>sqrt</button>
          <button type="button" onClick={() => runScientificOperation("square")}>x²</button>
          <button type="button" onClick={() => runScientificOperation("cbrt")}>cbrt</button>
          <button type="button" onClick={() => runScientificOperation("cube")}>x³</button>
          <button type="button" onClick={() => runScientificOperation("log")}>log</button>
          <button type="button" onClick={() => runScientificOperation("ln")}>ln</button>
          <button type="button" onClick={() => runScientificOperation("sin")}>sin</button>
          <button type="button" onClick={() => runScientificOperation("cos")}>cos</button>
          <button type="button" onClick={() => runScientificOperation("tan")}>tan</button>
          <button type="button" onClick={() => runScientificOperation("pi")}>pi</button>
          <button type="button" onClick={() => runScientificOperation("e")}>e</button>
          <button type="button" onClick={() => runScientificOperation("backspace")}>backspace</button>
          <button type="button" onClick={() => runScientificOperation("clear")}>clear</button>
          <button type="button" onClick={() => runScientificOperation("equals")}>equals</button>
        </div>
      </section>
    </div>
  );
}

function ExamSessionPage() {
  const { sessionId = "" } = useParams<{ sessionId: string }>();
  const location = useLocation();
  const token = useMemo(() => new URLSearchParams(location.search).get("token"), [location.search]);
  const entryValidation = useMemo(() => validateSessionEntry(token), [token]);
  const modeInstruction = MODE_INSTRUCTIONS[entryValidation.claims.mode];
  const candidateName = entryValidation.claims.sub ?? "Student Candidate";

  const sessionSnapshot = useMemo(
    () => buildSessionSnapshot(sessionId || "runtime-session", entryValidation.claims.mode),
    [entryValidation.claims.mode, sessionId],
  );

  const [selectedSection, setSelectedSection] = useState<QuestionSection | "All">("All");
  const [selectedQuestionId, setSelectedQuestionId] = useState(sessionSnapshot.questions[0]?.id ?? "q-1");
  const [declarationAccepted, setDeclarationAccepted] = useState(false);
  const [instructionConfirmed, setInstructionConfirmed] = useState(false);
  const [remainingMs, setRemainingMs] = useState(EXAM_DURATION_MINUTES * 60 * 1000);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [responseStateByQuestionId, setResponseStateByQuestionId] = useState<Record<string, QuestionResponseState>>(() =>
    buildInitialResponseMap(sessionSnapshot.questions),
  );
  const [visitedQuestionIds, setVisitedQuestionIds] = useState<Set<string>>(() =>
    new Set(sessionSnapshot.questions[0] ? [sessionSnapshot.questions[0].id] : []),
  );
  const [hardModeLockedQuestionIds, setHardModeLockedQuestionIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const tickInterval = window.setInterval(() => {
      setRemainingMs((current) => Math.max(0, current - TICK_INTERVAL_MS));
    }, TICK_INTERVAL_MS);

    return () => window.clearInterval(tickInterval);
  }, []);

  useEffect(() => {
    const syncInterval = window.setInterval(() => {
      // Server sync wiring lands with runtime API integration builds.
    }, TIMER_SYNC_INTERVAL_MS);

    return () => window.clearInterval(syncInterval);
  }, []);

  const navigateToQuestion = (questionId: string) => {
    setVisitedQuestionIds((current) => {
      const next = new Set(current);
      next.add(questionId);
      return next;
    });
    setSelectedQuestionId(questionId);
  };

  const palette = useMemo<PaletteTile[]>(
    () =>
      sessionSnapshot.questions.map((question) => ({
        id: question.id,
        number: question.number,
        section: question.section,
        status: toPaletteStatus(
          question,
          responseStateByQuestionId[question.id] ?? {
            selectedOptionId: null,
            numericResponse: "",
            matrixSelections: [],
            markedForReview: false,
          },
          visitedQuestionIds.has(question.id),
        ),
        revisitLocked: hardModeLockedQuestionIds.has(question.id),
      })),
    [hardModeLockedQuestionIds, responseStateByQuestionId, sessionSnapshot.questions, visitedQuestionIds],
  );

  const filteredPalette = useMemo(
    () =>
      selectedSection === "All"
        ? palette
        : palette.filter((tile) => tile.section === selectedSection),
    [palette, selectedSection],
  );

  const selectedQuestion = sessionSnapshot.questions.find((question) => question.id === selectedQuestionId) ?? sessionSnapshot.questions[0];
  const selectedQuestionIndex = getQuestionIndex(sessionSnapshot.questions, selectedQuestion?.id ?? "");
  const nextQuestion = selectedQuestionIndex >= 0 ? sessionSnapshot.questions[selectedQuestionIndex + 1] : null;
  const selectedResponseState = selectedQuestion
    ? responseStateByQuestionId[selectedQuestion.id]
    : undefined;

  useEffect(() => {
    if (!nextQuestion?.imageUrl) {
      return;
    }

    const preloadedImage = new Image();
    preloadedImage.src = nextQuestion.imageUrl;
  }, [nextQuestion?.imageUrl]);

  const answeredCount = palette.filter((tile) => tile.status === "answered" || tile.status === "answered_marked").length;
  const notAnsweredCount = palette.filter((tile) => tile.status === "not_answered").length;
  const markedCount = palette.filter((tile) => tile.status === "marked" || tile.status === "answered_marked").length;
  const timerMinutes = Math.floor(remainingMs / 1000 / 60);

  if (!entryValidation.allowed) {
    return <ExamAccessRedirect reason={entryValidation.reason} />;
  }

  if (!instructionConfirmed) {
    return (
      <main className="exam-instruction-shell">
        <section className="exam-instruction-card" aria-labelledby="exam-instruction-title">
          <header className="exam-instruction-header">
            <p className="exam-instruction-eyebrow">Exam Entry</p>
            <h1 id="exam-instruction-title">Instructions</h1>
            <p>
              Session ID:
              {" "}
              <code>{sessionId}</code>
            </p>
            <p>
              Candidate:
              {" "}
              <strong>{candidateName}</strong>
            </p>
          </header>

          <section className="exam-instruction-section" aria-label="General Instructions">
            <h2>1. General Instructions</h2>
            <ul>
              <li>This portal follows a server-authoritative execution model.</li>
              <li>Do not refresh or close the tab during the attempt.</li>
              <li>Use only this session URL with the signed token provided by the backend.</li>
            </ul>
          </section>

          <section className="exam-instruction-section" aria-label="Marking Scheme">
            <h2>2. Marking Scheme</h2>
            <ul>
              {MARKING_SCHEME.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </section>

          <section className="exam-instruction-section" aria-label="Question Palette Explanation">
            <h2>3. Question Palette Explanation</h2>
            <div className="exam-legend-grid">
              {QUESTION_PALETTE_LEGEND.map((legend) => (
                <div key={legend.status} className="exam-legend-item">
                  <span className={`exam-legend-swatch ${statusClassName(legend.status)}`}>{legend.label.split(" ")[0]}</span>
                  <span>{legend.label}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="exam-instruction-section" aria-label="Navigation Instructions">
            <h2>4. Navigation Instructions</h2>
            <ul>
              {NAVIGATION_INSTRUCTIONS.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </section>

          <section className="exam-instruction-section" aria-label="Mode Specific Instructions">
            <h2>5. Mode-Specific Instructions</h2>
            <p>
              <strong>{modeInstruction.title}</strong>
            </p>
            <ul>
              {modeInstruction.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </section>

          <section className="exam-instruction-section" aria-label="Declaration and Start">
            <h2>6. Declaration and Start</h2>
            <label className="exam-declaration-checkbox" htmlFor="exam-declaration-checkbox">
              <input
                id="exam-declaration-checkbox"
                type="checkbox"
                checked={declarationAccepted}
                onChange={(event) => setDeclarationAccepted(event.target.checked)}
              />
              I have read all instructions and agree to begin the test under monitored exam conditions.
            </label>
            <button
              type="button"
              className="exam-start-button"
              disabled={!declarationAccepted}
              onClick={() => setInstructionConfirmed(true)}
            >
              Start Test
            </button>
          </section>
        </section>
      </main>
    );
  }

  const isHardMode = entryValidation.claims.mode === "Hard";
  const selectedQuestionRevisitLocked = selectedQuestion ? hardModeLockedQuestionIds.has(selectedQuestion.id) : false;

  const saveCurrentAndMaybeAdvance = (advance: boolean) => {
    if (!selectedQuestion) {
      return;
    }

    if (isHardMode && selectedQuestionRevisitLocked) {
      return;
    }

    setVisitedQuestionIds((current) => {
      const next = new Set(current);
      next.add(selectedQuestion.id);
      return next;
    });

    if (isHardMode && sessionSnapshot.hardModeRevisitRestricted) {
      setHardModeLockedQuestionIds((current) => {
        const next = new Set(current);
        next.add(selectedQuestion.id);
        return next;
      });
    }

    if (!advance) {
      return;
    }

    const firstForwardQuestion = sessionSnapshot.questions.find(
      (question, index) =>
        index > selectedQuestionIndex &&
        (!isHardMode || !hardModeLockedQuestionIds.has(question.id) || question.id === selectedQuestion.id),
    );

    if (firstForwardQuestion) {
      navigateToQuestion(firstForwardQuestion.id);
    }
  };

  const goToPreviousQuestion = () => {
    if (!selectedQuestion || selectedQuestionIndex <= 0) {
      return;
    }

    const previousQuestion = sessionSnapshot.questions[selectedQuestionIndex - 1];
    if (!previousQuestion) {
      return;
    }

    if (isHardMode && sessionSnapshot.hardModeRevisitRestricted && hardModeLockedQuestionIds.has(previousQuestion.id)) {
      return;
    }

    navigateToQuestion(previousQuestion.id);
  };

  const jumpToQuestion = (questionId: string) => {
    if (!selectedQuestion) {
      return;
    }

    if (isHardMode && sessionSnapshot.hardModeRevisitRestricted) {
      const targetQuestionIndex = getQuestionIndex(sessionSnapshot.questions, questionId);
      if (targetQuestionIndex < selectedQuestionIndex) {
        return;
      }
      if (hardModeLockedQuestionIds.has(questionId)) {
        return;
      }
    }

    navigateToQuestion(questionId);
  };

  return (
    <main className="exam-runner-shell">
      <header className="exam-header" aria-label="Exam header bar">
        <div className="exam-header-group">
          <p className="exam-header-label">Candidate</p>
          <h1>{candidateName}</h1>
        </div>

        <div className="exam-header-group exam-header-metrics">
          <p>
            Question:
            {" "}
            <strong>{selectedQuestion?.number ?? 1}</strong>
            {" / "}
            {sessionSnapshot.questions.length}
          </p>
          <p>
            Mode:
            {" "}
            <strong>{entryValidation.claims.mode}</strong>
          </p>
          <p>
            Version:
            {" "}
            <strong>{sessionSnapshot.questionSetVersion}</strong>
          </p>
        </div>

        <div className="exam-header-group exam-header-timer-group">
          <p className="exam-header-label">Time Left</p>
          <p className={timerMinutes <= EXPIRY_RED_MINUTES_THRESHOLD ? "exam-header-timer danger" : "exam-header-timer"}>
            {toCountdownLabel(remainingMs)}
          </p>
          <button
            type="button"
            className="exam-calculator-launch"
            onClick={() => setCalculatorOpen(true)}
          >
            Open Calculator
          </button>
        </div>
      </header>

      <div className="exam-main-layout">
        <aside className="exam-palette-panel" aria-label="Question navigation panel">
          <div className="exam-palette-section-header">
            <h2>Question Palette</h2>
            <p>Left vertical navigation with JEE-style square tiles.</p>
          </div>

          <div className="exam-section-filters" role="tablist" aria-label="Question section filters">
            {(["All", ...sessionSnapshot.subjects] as const).map((section) => (
              <button
                key={section}
                type="button"
                role="tab"
                aria-selected={selectedSection === section}
                className={selectedSection === section ? "exam-filter-button active" : "exam-filter-button"}
                onClick={() => setSelectedSection(section)}
              >
                {section}
              </button>
            ))}
          </div>

          <div className="exam-palette-grid" aria-label="Question status tiles">
            {filteredPalette.map((tile) => {
              const jumpDisabled =
                isHardMode &&
                sessionSnapshot.hardModeRevisitRestricted &&
                (tile.revisitLocked || tile.number < (selectedQuestion?.number ?? 1));

              return (
                <button
                  key={tile.id}
                  type="button"
                  disabled={jumpDisabled}
                  className={
                    tile.id === selectedQuestionId
                      ? `exam-palette-tile ${statusClassName(tile.status)} selected`
                      : `exam-palette-tile ${statusClassName(tile.status)}`
                  }
                  onClick={() => jumpToQuestion(tile.id)}
                >
                  {tile.number}
                </button>
              );
            })}
          </div>

          <div className="exam-status-indicators" aria-label="Answer status indicators">
            <h3>Status Indicators</h3>
            <p>
              Answered:
              {" "}
              <strong>{answeredCount}</strong>
            </p>
            <p>
              Not Answered:
              {" "}
              <strong>{notAnsweredCount}</strong>
            </p>
            <p>
              Marked:
              {" "}
              <strong>{markedCount}</strong>
            </p>
            <p>
              Hard Mode Locks:
              {" "}
              <strong>{hardModeLockedQuestionIds.size}</strong>
            </p>
          </div>
        </aside>

        <section className="exam-question-container" aria-label="Question rendering container">
          <header className="exam-question-header">
            <h2>
              {selectedQuestion?.section ?? "Physics"}
              {" "}
              • Question
              {" "}
              {selectedQuestion?.number ?? 1}
            </h2>
            <p>
              Snapshot:
              {" "}
              <code>{sessionSnapshot.sessionId}</code>
            </p>
          </header>

          {selectedQuestion && selectedResponseState ? (
            <article className="exam-question-surface">
              <p className="exam-question-type">
                Type:
                {" "}
                <strong>{selectedQuestion.type.toUpperCase()}</strong>
              </p>
              <p className="exam-question-text">{selectedQuestion.text}</p>

              {selectedQuestion.imageUrl ? (
                <figure className="exam-question-image-wrap">
                  <img
                    src={selectedQuestion.imageUrl}
                    alt={`Question ${selectedQuestion.number} prompt`}
                    loading="lazy"
                    className="exam-question-image"
                  />
                  <figcaption>Image-based question content (lazy loaded)</figcaption>
                </figure>
              ) : null}

              {selectedQuestion.media ? (
                <section className="exam-question-media" aria-label="Optional media">
                  <p>
                    <strong>{selectedQuestion.media.title}</strong>
                  </p>
                  <a href={selectedQuestion.media.url} target="_blank" rel="noreferrer">
                    Open {selectedQuestion.media.type} reference
                  </a>
                </section>
              ) : null}

              {selectedQuestion.type === "mcq" && selectedQuestion.options ? (
                <div className="exam-option-list" role="radiogroup" aria-label="Multiple choice options">
                  {selectedQuestion.options.map((option) => (
                    <label key={option.id} className="exam-option-item">
                      <input
                        type="radio"
                        name={selectedQuestion.id}
                        checked={selectedResponseState.selectedOptionId === option.id}
                        onChange={() => {
                          if (selectedQuestionRevisitLocked) {
                            return;
                          }

                          setResponseStateByQuestionId((current) => ({
                            ...current,
                            [selectedQuestion.id]: {
                              ...current[selectedQuestion.id],
                              selectedOptionId: option.id,
                            },
                          }));
                        }}
                      />
                      <span>
                        <strong>{option.label}.</strong>
                        {" "}
                        {option.text}
                      </span>
                    </label>
                  ))}
                </div>
              ) : null}

              {selectedQuestion.type === "numeric" ? (
                <div className="exam-numeric-response">
                  <label htmlFor={`numeric-${selectedQuestion.id}`}>Numeric response</label>
                  <input
                    id={`numeric-${selectedQuestion.id}`}
                    type="text"
                    value={selectedResponseState.numericResponse}
                    onChange={(event) => {
                      if (selectedQuestionRevisitLocked) {
                        return;
                      }

                      setResponseStateByQuestionId((current) => ({
                        ...current,
                        [selectedQuestion.id]: {
                          ...current[selectedQuestion.id],
                          numericResponse: event.target.value,
                        },
                      }));
                    }}
                    placeholder="Enter numeric answer"
                  />
                </div>
              ) : null}

              {selectedQuestion.type === "matrix" ? (
                <div className="exam-matrix-response" aria-label="Matrix response">
                  {(selectedQuestion.matrixRows ?? []).map((row) => (
                    <div key={row} className="exam-matrix-row">
                      <p>{row}</p>
                      <div className="exam-matrix-columns">
                        {(selectedQuestion.matrixColumns ?? []).map((column) => {
                          const value = `${row}::${column}`;
                          const checked = selectedResponseState.matrixSelections.includes(value);
                          return (
                            <label key={value}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(event) => {
                                  if (selectedQuestionRevisitLocked) {
                                    return;
                                  }

                                  setResponseStateByQuestionId((current) => {
                                    const existing = current[selectedQuestion.id].matrixSelections;
                                    const nextSelections = event.target.checked
                                      ? [...existing, value]
                                      : existing.filter((entry) => entry !== value);

                                    return {
                                      ...current,
                                      [selectedQuestion.id]: {
                                        ...current[selectedQuestion.id],
                                        matrixSelections: nextSelections,
                                      },
                                    };
                                  });
                                }}
                              />
                              {column}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              <footer className="exam-question-actions" aria-label="Question interaction controls">
                <button
                  type="button"
                  onClick={goToPreviousQuestion}
                  disabled={selectedQuestionIndex <= 0 || selectedQuestionRevisitLocked}
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedQuestionRevisitLocked) {
                      return;
                    }

                    setResponseStateByQuestionId((current) => ({
                      ...current,
                      [selectedQuestion.id]: {
                        selectedOptionId: null,
                        numericResponse: "",
                        matrixSelections: [],
                        markedForReview: current[selectedQuestion.id]?.markedForReview ?? false,
                      },
                    }));
                  }}
                  disabled={selectedQuestionRevisitLocked}
                >
                  Clear Response
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedQuestionRevisitLocked) {
                      return;
                    }

                    setResponseStateByQuestionId((current) => ({
                      ...current,
                      [selectedQuestion.id]: {
                        ...current[selectedQuestion.id],
                        markedForReview: !current[selectedQuestion.id].markedForReview,
                      },
                    }));
                  }}
                  disabled={selectedQuestionRevisitLocked}
                >
                  Mark for Review
                </button>
                <button
                  type="button"
                  className="exam-save-next-button"
                  onClick={() => saveCurrentAndMaybeAdvance(true)}
                  disabled={selectedQuestionRevisitLocked}
                >
                  Save & Next
                </button>
              </footer>

              {selectedQuestionRevisitLocked ? (
                <p className="exam-hard-mode-notice">
                  Hard Mode revisit restriction active. This question is locked after save.
                </p>
              ) : null}
            </article>
          ) : null}
        </section>
      </div>

      <ScientificCalculatorModal open={calculatorOpen} onClose={() => setCalculatorOpen(false)} />
    </main>
  );
}

function App() {
  usePortalTitle("exam");

  return (
    <Routes>
      <Route path="/" element={<ExamAccessRedirect reason="missing_token" />} />
      <Route path="/session/:sessionId" element={<ExamSessionPage />} />
      <Route path="*" element={<ExamAccessRedirect reason="missing_token" />} />
    </Routes>
  );
}

export default App;
