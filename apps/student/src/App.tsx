import { usePortalTitle } from "../../../shared/hooks/usePortalTitle";
import { PORTAL_MANIFEST } from "../../../shared/services/portalManifest";
import { getPortalMetaRows } from "../../../shared/ui/portalShellModel";
import { Navigate, Route, Routes } from "react-router-dom";

function StudentPortalHome() {
  const portal = PORTAL_MANIFEST.student;

  return (
    <main className="portal-shell">
      <section className="portal-card">
        <p className="portal-eyebrow">Build 112</p>
        <h1>{portal.name}</h1>
        <p className="portal-purpose">{portal.purpose}</p>
        <dl className="portal-meta">
          {getPortalMetaRows(portal).map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
        <p>Frontend stack is configured with React Router, TypeScript, Vite, and Firebase auth bootstrap.</p>
      </section>
    </main>
  );
}

function App() {
  usePortalTitle("student");
  const basePath = PORTAL_MANIFEST.student.routePrefix;

  return (
    <Routes>
      <Route element={<Navigate replace to={basePath} />} path="/" />
      <Route element={<StudentPortalHome />} path={basePath} />
      <Route element={<Navigate replace to={basePath} />} path="*" />
    </Routes>
  );
}

export default App;
