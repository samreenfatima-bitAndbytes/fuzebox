"use client";

import { FormEvent } from "react";
import { AuthError } from "./AuthError";
import { AuthFormField } from "./AuthFormField";

export function SignInForm({
  username,
  password,
  error,
  loading,
  onUsernameChange,
  onPasswordChange,
  onSubmit,
}: {
  username: string;
  password: string;
  error: string | null;
  loading: boolean;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="space-y-5"
      aria-labelledby="auth-tab-signin"
      id="auth-panel-signin"
      role="tabpanel"
    >
      <AuthFormField
        id="username"
        label="Username"
        autoComplete="username"
        value={username}
        onChange={(e) => onUsernameChange(e.target.value)}
        required
        disabled={loading}
      />
      <AuthFormField
        id="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => onPasswordChange(e.target.value)}
        required
        disabled={loading}
      />

      {error ? <AuthError message={error} /> : null}

      <button
        type="submit"
        disabled={loading}
        className="fb-btn-primary w-full"
      >
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
