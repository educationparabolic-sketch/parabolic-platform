import { useEffect, useMemo, useState } from "react";
import { Route, Routes, useLocation, useParams } from "react-router-dom";
import { usePortalTitle } from "../../../shared/hooks/usePortalTitle";
import "./App.css";

type QuestionPaletteStatus = "not_visited" | "not_answered" | "answered" | "marked" | "answered_marked";
type ExecutionMode = "Operational" | "Diagnostic" | "Controlled" | "Hard";

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

interface QuestionTile {
  id: string;
  number: number;
  status: QuestionPaletteStatus;
  section: "Physics" | "Chemistry" | "Mathematics";
}

interface ModeInstruction {
  title: string;
  points: string[];
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

function buildQuestionPalette(): QuestionTile[] {
  const sections: Array<QuestionTile["section"]> = ["Physics", "Chemistry", "Mathematics"];
  const statuses: QuestionPaletteStatus[] = [
    "not_visited",
    "not_answered",
    "answered",
    "marked",
    "answered_marked",
  ];

  return Array.from({ length: 30 }, (_, index) => {
    const section = sections[Math.floor(index / 10)] ?? "Physics";
    return {
      id: `q-${index + 1}`,
      number: index + 1,
      status: statuses[index % statuses.length] ?? "not_visited",
      section,
    };
  });
}

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

function ExamSessionPage() {
  const { sessionId = "" } = useParams<{ sessionId: string }>();
  const location = useLocation();
  const token = useMemo(() => new URLSearchParams(location.search).get("token"), [location.search]);
  const entryValidation = useMemo(() => validateSessionEntry(token), [token]);
  const palette = useMemo(() => buildQuestionPalette(), []);
  const [selectedSection, setSelectedSection] = useState<QuestionTile["section"] | "All">("All");
  const [selectedQuestionId, setSelectedQuestionId] = useState(palette[0]?.id ?? "q-1");
  const [declarationAccepted, setDeclarationAccepted] = useState(false);
  const [instructionConfirmed, setInstructionConfirmed] = useState(false);
  const [remainingMs, setRemainingMs] = useState(EXAM_DURATION_MINUTES * 60 * 1000);

  const modeInstruction = MODE_INSTRUCTIONS[entryValidation.claims.mode];
  const candidateName = entryValidation.claims.sub ?? "Student Candidate";
  useEffect(() => {
    const tickInterval = window.setInterval(() => {
      setRemainingMs((current) => Math.max(0, current - TICK_INTERVAL_MS));
    }, TICK_INTERVAL_MS);

    return () => window.clearInterval(tickInterval);
  }, []);

  useEffect(() => {
    // Placeholder sync loop that preserves the server-authoritative timing contract.
    const syncInterval = window.setInterval(() => {
      // Server sync wiring lands with runtime API integration builds.
    }, TIMER_SYNC_INTERVAL_MS);

    return () => window.clearInterval(syncInterval);
  }, []);
  const timerMinutes = Math.floor(remainingMs / 1000 / 60);

  if (!entryValidation.allowed) {
    return <ExamAccessRedirect reason={entryValidation.reason} />;
  }

  const filteredPalette = selectedSection === "All"
    ? palette
    : palette.filter((tile) => tile.section === selectedSection);

  const selectedQuestion = palette.find((tile) => tile.id === selectedQuestionId) ?? palette[0];
  const answeredCount = palette.filter((tile) => tile.status === "answered" || tile.status === "answered_marked").length;
  const notAnsweredCount = palette.filter((tile) => tile.status === "not_answered").length;
  const markedCount = palette.filter((tile) => tile.status === "marked" || tile.status === "answered_marked").length;

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
            {palette.length}
          </p>
          <p>
            Mode:
            {" "}
            <strong>{entryValidation.claims.mode}</strong>
          </p>
        </div>

        <div className="exam-header-group exam-header-timer-group">
          <p className="exam-header-label">Time Left</p>
          <p className={timerMinutes <= EXPIRY_RED_MINUTES_THRESHOLD ? "exam-header-timer danger" : "exam-header-timer"}>
            {toCountdownLabel(remainingMs)}
          </p>
        </div>
      </header>

      <div className="exam-main-layout">
        <aside className="exam-palette-panel" aria-label="Question navigation panel">
          <div className="exam-palette-section-header">
            <h2>Question Palette</h2>
            <p>Left vertical navigation with JEE-style square tiles.</p>
          </div>

          <div className="exam-section-filters" role="tablist" aria-label="Question section filters">
            {(["All", "Physics", "Chemistry", "Mathematics"] as const).map((section) => (
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
            {filteredPalette.map((tile) => (
              <button
                key={tile.id}
                type="button"
                className={
                  tile.id === selectedQuestionId ?
                    `exam-palette-tile ${statusClassName(tile.status)} selected` :
                    `exam-palette-tile ${statusClassName(tile.status)}`
                }
                onClick={() => setSelectedQuestionId(tile.id)}
              >
                {tile.number}
              </button>
            ))}
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
            <p>This build establishes the base execution layout shell and status-aware navigation frame.</p>
          </header>

          <article className="exam-question-surface">
            <p>
              Read the question carefully and choose the best answer. The full rendering engine for text/image/options
              is implemented in Build 132.
            </p>
            <ol>
              <li>Use palette tiles to move between questions.</li>
              <li>Track answer state from the left panel indicators.</li>
              <li>Follow mode-specific guidance shown on the instruction screen.</li>
            </ol>
          </article>
        </section>
      </div>
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
