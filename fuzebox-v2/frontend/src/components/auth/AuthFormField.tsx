"use client";

import { useState, type InputHTMLAttributes } from "react";
import { IconEye, IconEyeOff } from "./auth-icons";

type Props = {
  id: string;
  label: string;
  hint?: string;
  error?: string | null;
} & InputHTMLAttributes<HTMLInputElement>;

export function AuthFormField({
  id,
  label,
  hint,
  error,
  className,
  type,
  ...inputProps
}: Props) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const isPassword = type === "password";
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  const input = (
    <input
      id={id}
      type={isPassword && passwordVisible ? "text" : type}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy}
      className={[
        "fb-input w-full",
        isPassword ? "pr-10" : "",
        error ? "border-[var(--alert-error-border)]" : "",
        className ?? "",
      ].join(" ")}
      {...inputProps}
    />
  );

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="fb-field-label">
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="text-xs text-brand-muted">
          {hint}
        </p>
      ) : null}
      {isPassword ? (
        <div className="relative">
          {input}
          <button
            type="button"
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-[var(--radius-lg)] text-brand-muted transition-colors hover:text-brand-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
            onClick={() => setPasswordVisible((v) => !v)}
            aria-label={passwordVisible ? "Hide password" : "Show password"}
            aria-pressed={passwordVisible}
            disabled={inputProps.disabled}
          >
            {passwordVisible ? <IconEyeOff /> : <IconEye />}
          </button>
        </div>
      ) : (
        input
      )}
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
