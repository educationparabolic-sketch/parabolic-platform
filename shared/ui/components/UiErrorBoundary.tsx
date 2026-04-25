import { Component, type ErrorInfo, type ReactNode } from "react";
import { captureFrontendClientCrash } from "../../services/frontendMonitoring";
import "./shared-ui-components.css";

interface UiErrorBoundaryProps {
  portalLabel: string;
  children: ReactNode;
}

interface UiErrorBoundaryState {
  hasError: boolean;
  eventId: string | null;
  occurredAt: string | null;
  message: string;
}

const INITIAL_STATE: UiErrorBoundaryState = {
  hasError: false,
  eventId: null,
  occurredAt: null,
  message: "An unexpected error interrupted this page.",
};

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error.trim();
  }

  return "An unexpected error interrupted this page.";
}

function shouldTriggerLocalCrashProbe(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const hostname = window.location.hostname;
  const isLocalHost = hostname === "127.0.0.1" || hostname === "localhost";
  if (!isLocalHost) {
    return false;
  }

  const query = new URLSearchParams(window.location.search);
  return query.get("__parabolicCrash") === "1";
}

function LocalCrashProbe(): null {
  throw new Error("Build 148 local render crash probe triggered.");
}

class UiErrorBoundary extends Component<UiErrorBoundaryProps, UiErrorBoundaryState> {
  constructor(props: UiErrorBoundaryProps) {
    super(props);
    this.state = INITIAL_STATE;
    this.handleTryAgain = this.handleTryAgain.bind(this);
    this.handleReload = this.handleReload.bind(this);
  }

  static getDerivedStateFromError(error: unknown): Partial<UiErrorBoundaryState> {
    return {
      hasError: true,
      message: toErrorMessage(error),
    };
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo): void {
    const event = captureFrontendClientCrash({
      name: error instanceof Error ? error.name : "RenderError",
      message: toErrorMessage(error),
      stack: error instanceof Error ? error.stack : undefined,
      componentStack: errorInfo.componentStack ?? undefined,
    });

    this.setState({
      hasError: true,
      eventId: event.eventId,
      occurredAt: event.timestamp,
      message: toErrorMessage(error),
    });
  }

  handleTryAgain(): void {
    this.setState(INITIAL_STATE);
  }

  handleReload(): void {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  }

  render() {
    const { portalLabel, children } = this.props;
    const { hasError, eventId, occurredAt, message } = this.state;

    if (hasError) {
      return (
        <main className="ui-error-boundary-shell">
          <section className="ui-error-boundary-card" role="alert" aria-live="assertive">
            <p className="ui-error-boundary-eyebrow">System Protection</p>
            <h1 className="ui-error-boundary-title">We recovered from an unexpected error.</h1>
            <p className="ui-error-boundary-copy">
              {portalLabel} is still running. You can retry this view or reload the page.
            </p>
            <p className="ui-error-boundary-message">Details: {message}</p>
            <p className="ui-error-boundary-meta">
              Event ID: <code>{eventId ?? "pending"}</code>
            </p>
            <p className="ui-error-boundary-meta">
              Timestamp: <code>{occurredAt ?? new Date().toISOString()}</code>
            </p>
            <div className="ui-error-boundary-actions">
              <button type="button" onClick={this.handleTryAgain}>Try again</button>
              <button type="button" onClick={this.handleReload}>Reload page</button>
            </div>
          </section>
        </main>
      );
    }

    if (shouldTriggerLocalCrashProbe()) {
      return <LocalCrashProbe />;
    }

    return children;
  }
}

export default UiErrorBoundary;
