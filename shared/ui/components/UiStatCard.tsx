import type { ReactNode } from "react";

export interface UiStatCardProps {
  title: string;
  value: ReactNode;
  helper?: ReactNode;
  children?: ReactNode;
}

function UiStatCard({ title, value, helper, children }: UiStatCardProps) {
  return (
    <article className="ui-stat-card" aria-label={title}>
      <p className="ui-stat-card-title">{title}</p>
      <strong className="ui-stat-card-value">{value}</strong>
      {helper ? <small className="ui-stat-card-helper">{helper}</small> : null}
      {children ? <div className="ui-stat-card-content">{children}</div> : null}
    </article>
  );
}

export default UiStatCard;
