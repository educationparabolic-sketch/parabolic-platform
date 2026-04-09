import { usePortalTitle } from "../../../shared/hooks/usePortalTitle";
import { PORTAL_MANIFEST } from "../../../shared/services/portalManifest";
import { getPortalMetaRows } from "../../../shared/ui/portalShellModel";

function App() {
  usePortalTitle("student");
  const portal = PORTAL_MANIFEST.student;

  return (
    <main className="portal-shell">
      <section className="portal-card">
        <p className="portal-eyebrow">Build 111</p>
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
        <p>This portal shell is initialized and ready for Student domain route modules.</p>
      </section>
    </main>
  );
}

export default App;
