import type { ReactNode } from "react";

export interface UiNavItem {
  id: string;
  label: string;
  hint?: string;
  icon?: ReactNode;
  onClick?: () => void;
}

export interface UiNavBarProps {
  title: string;
  subtitle?: string;
  items: UiNavItem[];
  activeItemId?: string;
}

function UiNavBar({ title, subtitle, items, activeItemId }: UiNavBarProps) {
  return (
    <section className="ui-navbar" aria-label={title}>
      <header className="ui-navbar-header">
        <h3>{title}</h3>
        {subtitle ? <p>{subtitle}</p> : null}
      </header>
      <div className="ui-navbar-grid" role="navigation">
        {items.map((item) => {
          const isActive = item.id === activeItemId;

          return (
            <button
              key={item.id}
              className={`ui-navbar-item${isActive ? " ui-navbar-item-active" : ""}`}
              type="button"
              onClick={item.onClick}
              aria-current={isActive ? "page" : undefined}
            >
              <span className="ui-navbar-label-row">
                {item.icon ? <span className="ui-navbar-icon">{item.icon}</span> : null}
                <span className="ui-navbar-label">{item.label}</span>
              </span>
              {item.hint ? <span className="ui-navbar-hint">{item.hint}</span> : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default UiNavBar;
