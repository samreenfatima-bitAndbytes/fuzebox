"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthTabs, type AuthTab } from "@/components/auth/AuthTabs";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { SignInForm } from "@/components/auth/SignInForm";
import { ApiError, login, registerAccount } from "@/lib/api";
import { getSession, saveSession } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<AuthTab>("signin");
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [regUsername, setRegUsername] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regPassword2, setRegPassword2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (getSession()) router.replace("/agents");
  }, [router]);

  function switchTab(next: AuthTab) {
    if (loading) return;
    setTab(next);
    setError(null);
  }

  async function onSignIn(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const token = await login(username, password);
      saveSession(token);
      router.replace("/agents");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function onRegister(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!orgName.trim()) {
      setError("Organisation name is required.");
      return;
    }
    if (!regUsername.trim()) {
      setError("Username is required.");
      return;
    }
    if (regPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (regPassword !== regPassword2) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const token = await registerAccount(orgName, regUsername, regPassword);
      saveSession(token);
      router.replace("/agents");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Registration failed",
      );
    } finally {
      setLoading(false);
    }
  }

  const subtitle =
    tab === "signin"
      ? "Sign in to continue to your workspace."
      : "Create a workspace and admin account for your organisation.";

  return (
    <AuthLayout>
      <AuthCard
        title={tab === "signin" ? "Welcome back" : "Get started"}
        subtitle={subtitle}
        footer={
          tab === "signin" ? (
            <p className="fb-text-caption text-center">
              Default dev credentials:{" "}
              <span className="font-mono text-brand-ink">admin</span> /{" "}
              <span className="font-mono text-brand-ink">changeme</span>
            </p>
          ) : (
            <p className="fb-text-caption text-center">
              Already have an account?{" "}
              <button
                type="button"
                className="font-semibold text-brand-primary hover:text-[var(--brand-secondary)] hover:underline"
                onClick={() => switchTab("signin")}
                disabled={loading}
              >
                Sign in
              </button>
            </p>
          )
        }
      >
        <AuthTabs active={tab} onChange={switchTab} disabled={loading} />

        <div className="mt-6">
          {tab === "signin" ? (
            <SignInForm
              username={username}
              password={password}
              error={error}
              loading={loading}
              onUsernameChange={setUsername}
              onPasswordChange={setPassword}
              onSubmit={onSignIn}
            />
          ) : (
            <RegisterForm
              orgName={orgName}
              username={regUsername}
              password={regPassword}
              passwordConfirm={regPassword2}
              error={error}
              loading={loading}
              onOrgNameChange={setOrgName}
              onUsernameChange={setRegUsername}
              onPasswordChange={setRegPassword}
              onPasswordConfirmChange={setRegPassword2}
              onSubmit={onRegister}
            />
          )}
        </div>
      </AuthCard>
    </AuthLayout>
  );
}
