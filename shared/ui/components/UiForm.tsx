import type { FormEvent, ReactNode } from "react";

export interface UiFormProps {
  title: string;
  description?: string;
  submitLabel?: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
  footer?: ReactNode;
}

export interface UiFormFieldProps {
  label: string;
  htmlFor: string;
  helper?: string;
  children: ReactNode;
}

export function UiFormField({ label, htmlFor, helper, children }: UiFormFieldProps) {
  return (
    <label className="ui-form-field" htmlFor={htmlFor}>
      <span className="ui-form-label">{label}</span>
      {children}
      {helper ? <small className="ui-form-helper">{helper}</small> : null}
    </label>
  );
}

function UiForm({ title, description, submitLabel, onSubmit, children, footer }: UiFormProps) {
  return (
    <section className="ui-form-card" aria-label={title}>
      <header className="ui-form-header">
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
      </header>
      <form className="ui-form" onSubmit={onSubmit}>
        <div className="ui-form-content">{children}</div>
        <div className="ui-form-actions">
          <button type="submit">{submitLabel ?? "Apply"}</button>
          {footer}
        </div>
      </form>
    </section>
  );
}

export default UiForm;
