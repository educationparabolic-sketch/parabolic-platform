import { Suspense, lazy } from "react";
import { UiRouteLoading } from "../../../shared/ui/components";

const ExamRuntimeApp = lazy(() => import("./ExamRuntimeApp"));

function App() {
  return (
    // The runtime owns entry/authority gates and answer/submission errors.
    // Background saves must keep questions visible for newer candidate edits.
    <Suspense fallback={<UiRouteLoading label="Loading exam runtime" />}>
      <ExamRuntimeApp />
    </Suspense>
  );
}

export default App;
