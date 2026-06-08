import { useEffect, useRef, type ReactNode } from "react";

export interface UiModalProps {
  isOpen: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

function UiModal({ isOpen, title, description, onClose, children, footer }: UiModalProps) {
  const modalRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen || !modalRef.current) {
      return;
    }

    modalRef.current.focus();
    modalRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="ui-modal-backdrop" role="presentation" onClick={onClose}>
      <section
        ref={modalRef}
        className="ui-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="ui-modal-header">
          <div>
            <h3>{title}</h3>
            {description ? <p>{description}</p> : null}
          </div>
          <button type="button" className="ghost-button" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="ui-modal-content">{children}</div>
        {footer ? <footer className="ui-modal-footer">{footer}</footer> : null}
      </section>
    </div>
  );
}

export default UiModal;
