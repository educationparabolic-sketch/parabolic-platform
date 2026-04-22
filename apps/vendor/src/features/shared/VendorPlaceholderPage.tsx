interface VendorPlaceholderPageProps {
  title: string;
  description: string;
}

function VendorPlaceholderPage(props: VendorPlaceholderPageProps) {
  const { title, description } = props;

  return (
    <section className="vendor-content-card" aria-labelledby="vendor-placeholder-title">
      <p className="vendor-content-eyebrow">Build 136</p>
      <h2 id="vendor-placeholder-title">{title}</h2>
      <p className="vendor-content-copy">{description}</p>
      <p className="vendor-content-note">
        Route shell is active for this section. Business workflows and endpoint integrations are implemented in
        later vendor portal builds.
      </p>
    </section>
  );
}

export default VendorPlaceholderPage;
