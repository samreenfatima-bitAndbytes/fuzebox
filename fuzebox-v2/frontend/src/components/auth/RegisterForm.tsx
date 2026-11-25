"use client";

import { FormEvent } from "react";
import { AuthError } from "./AuthError";
import { AuthFormField } from "./AuthFormField";

export function RegisterForm({
  orgName,
  username,
  password,
  passwordConfirm,
  error,
  loading,
  onOrgNameChange,
  onUsernameChange,
  onPasswordChange,
  onPasswordConfirmChange,
  onSubmit,
}: {
  orgName: string;
  username: string;
  password: string;
  passwordConfirm: string;
  error: string | null;
  loading: boolean;
  onOrgNameChange: (value: string) => void;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onPasswordConfirmChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="space-y-5"
      aria-labelledby="auth-tab-register"
      id="auth-panel-register"
      role="tabpanel"
    >
      <AuthFormField
        id="org_name"
        label="Organisation name"
        placeholder="Acme Corp"
        autoComplete="organization"
        value={orgName}
        onChange={(e) => onOrgNameChange(e.target.value)}
        required
        disabled={loading}
      />
      <AuthFormField
        id="reg_username"
        label="Admin username"
        autoComplete="username"
        value={username}
        onChange={(e) => onUsernameChange(e.target.value)}
        required
        disabled={loading}
      />
      <AuthFormField
        id="reg_password"
        label="Password"
        type="password"
        autoComplete="new-password"
        hint="At least 8 characters"
        value={password}
        onChange={(e) => onPasswordChange(e.target.value)}
        minLength={8}
        required
        disabled={loading}
      />
      <AuthFormField
        id="reg_password2"
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        value={passwordConfirm}
        onChange={(e) => onPasswordConfirmChange(e.target.value)}
        minLength={8}
        required
        disabled={loading}
      />

      {error ? <AuthError message={error} /> : null}

      <button
        type="submit"
        disabled={loading}
        className="fb-btn-primary w-full"
      >
        {loading ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
