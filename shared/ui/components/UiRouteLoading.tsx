import "./shared-ui-components.css";

interface UiRouteLoadingProps {
  label?: string;
}

function UiRouteLoading(props: UiRouteLoadingProps) {
  const { label = "Loading route" } = props;

  return (
    <section className="ui-route-loading" aria-live="polite" aria-busy="true" role="status">
      <div className="ui-route-loading-indicator" aria-hidden="true" />
      <p>{label}</p>
    </section>
  );
}

export default UiRouteLoading;
export type { UiRouteLoadingProps };
