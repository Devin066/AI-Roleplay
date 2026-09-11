"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          payload?.error ?? `Login failed with HTTP ${response.status}.`,
        );
      }

      router.replace(searchParams.get("next") || "/");
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to sign in.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-dvh app-backdrop px-6 py-10 text-foreground">
      <div className="mx-auto grid min-h-[calc(100dvh-5rem)] max-w-6xl items-center gap-8 lg:grid-cols-[1fr_0.88fr]">
        <section className="rounded-[2rem] border border-border bg-surface p-8 shadow-soft">
          <p className="text-xs uppercase tracking-[0.28em] text-primary">
            Workspace Access
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
            AI RolePlay Academy
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-8 text-muted-foreground">
            Sign in to test course builder, roleplay sessions, transcript
            review, AI assessment, and turn-level coaching feedback.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {["Course Admin", "Trainee", "Root Admin"].map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-primary/20 bg-primary-subtle/70 p-4"
              >
                <p className="text-sm font-semibold text-foreground">{item}</p>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  Role-based access
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[2rem] border border-border bg-surface p-7 shadow-overlay">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-primary">
              Login
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              Sign in to your workspace
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Enter your assigned email and password to access the training
              workspace.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <label className="block">
              <span className="text-sm font-semibold text-muted-foreground">
                Email
              </span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-border bg-surface-sunken px-4 py-3 text-sm font-medium text-foreground outline-none transition focus:border-primary focus:bg-surface focus:ring-4 focus:ring-ring/30"
                autoComplete="email"
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-muted-foreground">
                Password
              </span>
              <div className="relative mt-2">
                <input
                  type={isPasswordVisible ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-2xl border border-border bg-surface-sunken py-3 pl-4 pr-14 text-sm font-medium text-foreground outline-none transition focus:border-primary focus:bg-surface focus:ring-4 focus:ring-ring/30"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setIsPasswordVisible((visible) => !visible)}
                  aria-label={
                    isPasswordVisible ? "Hide password" : "Show password"
                  }
                  aria-pressed={isPasswordVisible}
                  title={isPasswordVisible ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-2xl text-subtle-foreground outline-none transition-colors duration-200 hover:text-muted-foreground focus-visible:text-muted-foreground focus-visible:ring-4 focus-visible:ring-ring/30"
                >
                  {isPasswordVisible ? (
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-5 w-5"
                    >
                      <path d="M3 3l18 18" />
                      <path d="M10.6 10.6a2 2 0 002.8 2.8" />
                      <path d="M9.4 5.2A9.5 9.5 0 0112 5c5 0 9 4.5 9 7a12 12 0 01-2.4 3.4" />
                      <path d="M6.2 6.7C3.9 8.2 3 10.4 3 12c0 2.5 4 7 9 7a9.7 9.7 0 004.2-.9" />
                    </svg>
                  ) : (
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-5 w-5"
                    >
                      <path d="M3 12s3.6-7 9-7 9 7 9 7-3.6 7-9 7-9-7-9-7z" />
                      <circle cx="12" cy="12" r="2.75" />
                    </svg>
                  )}
                </button>
              </div>
            </label>

            {errorMessage && (
              <div className="rounded-2xl border border-warning/30 bg-warning-subtle p-3 text-sm text-warning-subtle-foreground">
                {errorMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full inline-flex items-center justify-center rounded-2xl bg-primary min-h-control px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-raised transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {isSubmitting ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
