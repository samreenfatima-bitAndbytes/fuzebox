import { useEffect, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthError } from "@/components/auth/AuthError";
import { AuthFormField } from "@/components/auth/AuthFormField";
import { AuthPasswordField } from "@/components/auth/AuthPasswordField";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthTabs, type AuthTab } from "@/components/auth/AuthTabs";
import { Loader2 } from "lucide-react";

function slugFromName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");
}

export default function Auth() {
  const [location, setLocation] = useLocation();
  const mode: AuthTab = location === "/register" ? "register" : "signin";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setError("");
  }, [mode]);

  function switchTab(tab: AuthTab) {
    if (isLoading) return;
    setError("");
    setLocation(tab === "register" ? "/register" : "/login");
  }

  function handleWorkspaceNameChange(value: string) {
    setWorkspaceName(value);
    if (!slugTouched) {
      setTenantSlug(slugFromName(value));
    }
  }

  async function handleSignIn(e: FormEvent) {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
        credentials: "include",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || "Could not sign in. Check your username and password.");
      }

      window.location.href = window.location.origin;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!workspaceName.trim()) {
      setError("Workspace name is required.");
      return;
    }
    if (!tenantSlug.trim()) {
      setError("Workspace URL is required.");
      return;
    }
    if (!username.trim()) {
      setError("Username is required.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== passwordConfirm) {
      setError("Passwords do not match.");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceName: workspaceName.trim(),
          tenantSlug: tenantSlug.trim(),
          username: username.trim(),
          password,
        }),
        credentials: "include",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || "Could not create workspace.");
      }

      window.location.href = window.location.origin;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not create workspace.");
    } finally {
      setIsLoading(false);
    }
  }

  const title = mode === "signin" ? "Welcome back" : "Create your workspace";
  const subtitle =
    mode === "signin"
      ? "Sign in to your r-Potential workspace to continue."
      : "Set up a tenant for economics, cognition, and governance in one place.";

  return (
    <AuthLayout>
      <AuthCard
        title={title}
        subtitle={subtitle}
        footer={
          mode === "signin" ? (
            <div className="space-y-2">
              {import.meta.env.DEV ? (
                <p className="text-center text-xs text-muted-foreground leading-relaxed">
                  Default dev credentials:{" "}
                  <span className="font-mono text-foreground">admin</span> /{" "}
                  <span className="font-mono text-foreground">changeme</span>
                </p>
              ) : null}
              <p className="text-center text-xs text-muted-foreground leading-relaxed">
                New to AEOS?{" "}
                <button
                  type="button"
                  className="font-semibold text-[hsl(var(--primary))] hover:underline disabled:opacity-50"
                  onClick={() => switchTab("register")}
                  disabled={isLoading}
                >
                  Create a workspace
                </button>
              </p>
            </div>
          ) : (
            <p className="text-center text-xs text-muted-foreground leading-relaxed">
              Already have a workspace?{" "}
              <button
                type="button"
                className="font-semibold text-[hsl(var(--primary))] hover:underline disabled:opacity-50"
                onClick={() => switchTab("signin")}
                disabled={isLoading}
              >
                Sign in
              </button>
            </p>
          )
        }
      >
        <AuthTabs active={mode} onChange={switchTab} disabled={isLoading} />

        <div className="mt-6">
          {mode === "signin" ? (
            <form
              className="space-y-5"
              onSubmit={handleSignIn}
              id="auth-panel-signin"
              role="tabpanel"
              aria-labelledby="auth-tab-signin"
            >
              <AuthFormField
                id="signin-username"
                label="Username"
                autoComplete="username"
                placeholder="your username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                disabled={isLoading}
              />
              <AuthPasswordField
                id="signin-password"
                label="Password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                disabled={isLoading}
              />

              {error ? <AuthError message={error} /> : null}

              <button
                type="submit"
                disabled={isLoading}
                className="aeos-btn aeos-btn-primary w-full justify-center"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Signing in…
                  </>
                ) : (
                  "Sign in"
                )}
              </button>
            </form>
          ) : (
            <form
              className="space-y-5"
              onSubmit={handleRegister}
              id="auth-panel-register"
              role="tabpanel"
              aria-labelledby="auth-tab-register"
            >
              <AuthFormField
                id="register-workspace"
                label="Company / workspace name"
                autoComplete="organization"
                placeholder="e.g. Acme Corp"
                value={workspaceName}
                onChange={e => handleWorkspaceNameChange(e.target.value)}
                required
                disabled={isLoading}
              />
              <AuthFormField
                id="register-slug"
                label="Workspace URL"
                prefix="tenant /"
                hint="Used to isolate your data. Lowercase letters, numbers, and hyphens only."
                autoComplete="off"
                placeholder="acme-corp"
                value={tenantSlug}
                onChange={e => {
                  setSlugTouched(true);
                  setTenantSlug(e.target.value);
                }}
                required
                disabled={isLoading}
              />
              <AuthFormField
                id="register-username"
                label="Admin username"
                autoComplete="username"
                placeholder="admin"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                disabled={isLoading}
              />
              <AuthPasswordField
                id="register-password"
                label="Password"
                autoComplete="new-password"
                placeholder="At least 8 characters"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
                disabled={isLoading}
              />
              <AuthPasswordField
                id="register-password-confirm"
                label="Confirm password"
                autoComplete="new-password"
                placeholder="Repeat password"
                value={passwordConfirm}
                onChange={e => setPasswordConfirm(e.target.value)}
                required
                disabled={isLoading}
              />

              {error ? <AuthError message={error} /> : null}

              <button
                type="submit"
                disabled={isLoading}
                className="aeos-btn aeos-btn-primary w-full justify-center"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Creating workspace…
                  </>
                ) : (
                  "Create workspace"
                )}
              </button>
            </form>
          )}
        </div>
      </AuthCard>
    </AuthLayout>
  );
}
