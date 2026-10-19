import { initializeLaunchBootstrap } from "./launchBootstrap";

function showBootstrapFailure(): void {
  const root = document.getElementById("root");
  if (root) root.textContent = "Exam launch unavailable. Please relaunch from Student My Tests.";
}

try {
  initializeLaunchBootstrap(import.meta.env.DEV && import.meta.env.VITE_EXAM_DEV_MOCK_ENTRY === "true");
  // URL/history are clean before any application dependency can execute.
  void import("./main").catch(showBootstrapFailure);
} catch {
  showBootstrapFailure();
}
