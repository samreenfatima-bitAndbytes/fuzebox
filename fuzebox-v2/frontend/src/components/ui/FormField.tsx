"use client";

import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

type BaseProps = {
  id: string;
  label: string;
  hint?: string;
  error?: string | null;
};

function fieldDescribedBy(id: string, error?: string | null, hint?: string) {
  const errorId = error ? `${id}-error` : undefined;
  const hintId = hint ? `${id}-hint` : undefined;
  return {
    errorId,
    hintId,
    describedBy: [errorId, hintId].filter(Boolean).join(" ") || undefined,
  };
}

const inputClass = (hasError: boolean) =>
  ["fb-input w-full", hasError ? "border-[var(--alert-error-border)]" : ""].join(
    " ",
  );

export function FormField({
  id,
  label,
  hint,
  error,
  ...inputProps
}: BaseProps & InputHTMLAttributes<HTMLInputElement>) {
  const { errorId, hintId, describedBy } = fieldDescribedBy(id, error, hint);

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="fb-field-label">
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="fb-text-caption">
          {hint}
        </p>
      ) : null}
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={inputClass(!!error)}
        {...inputProps}
      />
      {error ? (
        <p
          id={errorId}
          className="text-xs text-[var(--alert-error-text)]"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function FormTextarea({
  id,
  label,
  hint,
  error,
  ...textareaProps
}: BaseProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { errorId, hintId, describedBy } = fieldDescribedBy(id, error, hint);

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="fb-field-label">
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="fb-text-caption">
          {hint}
        </p>
      ) : null}
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={[inputClass(!!error), "min-h-[5rem] resize-y"].join(" ")}
        {...textareaProps}
      />
      {error ? (
        <p
          id={errorId}
          className="text-xs text-[var(--alert-error-text)]"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
