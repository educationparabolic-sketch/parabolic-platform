import { NavLink } from "react-router-dom";

interface AdminWorkspaceLandingStat {
  label: string;
  value: string;
  detail: string;
}

interface AdminWorkspaceLandingLink {
  title: string;
  description: string;
  to: string;
  meta: string;
}

interface AdminWorkspaceLandingPageProps {
  eyebrow: string;
  title: string;
  description: string[];
  note?: string;
  stats: AdminWorkspaceLandingStat[];
  links: AdminWorkspaceLandingLink[];
}

function AdminWorkspaceLandingPage(props: AdminWorkspaceLandingPageProps) {
  const { eyebrow, title, description, note, stats, links } = props;

  return (
    <section className="admin-content-card" aria-labelledby="admin-workspace-landing-title">
      <p className="admin-content-eyebrow">{eyebrow}</p>
      <h2 id="admin-workspace-landing-title">{title}</h2>
      {description.map((paragraph) => (
        <p key={paragraph} className="admin-content-copy">
          {paragraph}
        </p>
      ))}
      {note ? <p className="admin-settings-inline-note">{note}</p> : null}

      <div className="admin-analytics-kpi-grid">
        {stats.map((stat) => (
          <article key={stat.label} className="admin-analytics-kpi-card">
            <p>{stat.label}</p>
            <h3>{stat.value}</h3>
            <small>{stat.detail}</small>
          </article>
        ))}
      </div>

      <div className="admin-analytics-insight-list">
        {links.map((link) => (
          <article key={link.to} className="admin-risk-summary-card">
            <p className="admin-content-eyebrow">{eyebrow}</p>
            <h4>{link.title}</h4>
            <p>{link.description}</p>
            <small>{link.meta}</small>
            <NavLink className="admin-primary-link" to={link.to}>
              Open Workspace
            </NavLink>
          </article>
        ))}
      </div>
    </section>
  );
}

export default AdminWorkspaceLandingPage;
