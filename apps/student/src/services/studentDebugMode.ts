const STUDENT_DEBUG_STORAGE_KEY = "student-debug-mode";

export function isStudentDebugMode(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    return (
      params.get("studentDebug") === "1" ||
      params.get("debug") === "student" ||
      window.localStorage.getItem(STUDENT_DEBUG_STORAGE_KEY) === "true"
    );
  } catch {
    return false;
  }
}
