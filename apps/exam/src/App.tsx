import { Suspense, lazy } from "react";
import { UiDataStateBoundary, UiRouteLoading } from "../../../shared/ui/components";

const ExamRuntimeApp = lazy(() => import("./ExamRuntimeApp"));

function App() {
  return (
    <UiDataStateBoundary label="Exam runtime">
      <Suspense fallback={<UiRouteLoading label="Loading exam runtime" />}>
        <ExamRuntimeApp />
      </Suspense>
    </UiDataStateBoundary>
  );
}

export default App;
