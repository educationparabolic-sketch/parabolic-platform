import { Link } from "react-router-dom";
interface VendorPlaceholderPageProps {
  title: string;
  description: string;
  note?: string;
}

function VendorPlaceholderPage(props: VendorPlaceholderPageProps) {
  const { title, description, note } = props;

  return (
    <section className="vendor-content-card admin-content-card" aria-labelledby="vendor-placeholder-title">
      <p className="vendor-content-eyebrow admin-content-eyebrow">Compatibility route</p>
      <h2 id="vendor-placeholder-title">{title}</h2>
      <p className="vendor-content-copy admin-content-copy">{description}</p>
      <p className="vendor-content-note admin-content-note">
        {note ??
          "This capability has no registered live operation on this page."}
      </p>
      <p><Link to="/vendor/calibration">Open Calibration</Link> · <Link to="/vendor/audit">Open Audit</Link></p>
    </section>
  );
}

export default VendorPlaceholderPage;
