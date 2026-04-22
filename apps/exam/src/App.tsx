import { Suspense, lazy } from "react";
import { UiRouteLoading } from "../../../shared/ui/components";

const ExamRuntimeApp = lazy(() => import("./ExamRuntimeApp"));

function App() {
  return (
    <Suspense fallback={<UiRouteLoading label="Loading exam runtime" />}>
      <ExamRuntimeApp />
    </Suspense>
  );
}

export default App;
