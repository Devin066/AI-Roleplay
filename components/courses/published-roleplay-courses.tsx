"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { AuthSessionUser } from "@/src/lib/auth/session";
import { visibleRoleplaysForUser } from "@/src/lib/roleplays/access";
import {
  fetchRolePlayAttemptStatus,
  type RolePlayAttemptStatus,
} from "@/src/lib/roleplays/attempts";
import { fetchRolePlayConfigs } from "@/src/lib/roleplays/storage";
import type { RolePlayConfig } from "@/src/lib/roleplays/types";

type CourseFilter = "all" | "ready" | "completed" | "locked";

function formatDeadline(value?: string, timezone = "UTC") {
  if (!value) return "No deadline";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Invalid deadline";

  return `${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(date)}${timezone === "UTC" ? "" : ` (${timezone})`}`;
}

export function PublishedRoleplayCourses({
  emptyState = false,
}: {
  emptyState?: boolean;
}) {
  const [roleplays, setRoleplays] = useState<RolePlayConfig[]>([]);
  const [user, setUser] = useState<AuthSessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CourseFilter>("all");
  const [attemptsByRolePlayId, setAttemptsByRolePlayId] = useState<
    Record<string, RolePlayAttemptStatus>
  >({});

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/auth/session", {
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error("Your session could not be verified.");
        }

        const payload = (await response.json()) as { user?: AuthSessionUser };
        const nextUser = payload.user ?? null;
        setUser(nextUser);

        if (nextUser) {
          const visibleRoleplays = visibleRoleplaysForUser(
            nextUser,
            (await fetchRolePlayConfigs()).filter(
              (roleplay) => roleplay.status === "published",
            ),
          );
          setRoleplays(visibleRoleplays);

          if (nextUser.role === "trainee" || nextUser.role === "course_admin") {
            const attemptEntries = await Promise.all(
              visibleRoleplays.map(
                async (roleplay) =>
                  [
                    roleplay.id,
                    await fetchRolePlayAttemptStatus(nextUser.id, roleplay.id),
                  ] as const,
              ),
            );
            setAttemptsByRolePlayId(Object.fromEntries(attemptEntries));
          }
        }
      } catch {
        setErrorMessage(
          "We could not load your simulation courses. Refresh the page and try again.",
        );
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const filteredRoleplays = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return roleplays.filter((roleplay) => {
      const attemptStatus =
        user?.role === "trainee" || user?.role === "course_admin"
          ? attemptsByRolePlayId[roleplay.id]
          : null;
      const matchesFilter =
        filter === "all" ||
        (filter === "locked" && attemptStatus?.locked) ||
        (filter === "completed" &&
          !attemptStatus?.locked &&
          Boolean(attemptStatus?.completedAttempts)) ||
        (filter === "ready" &&
          !attemptStatus?.locked &&
          !attemptStatus?.completedAttempts);
      const searchableContent = [
        roleplay.settings.meetingTitle,
        roleplay.character.name,
        roleplay.character.role,
        roleplay.plan.scenario,
        ...roleplay.settings.learnerGoals.map((goal) => goal.label),
      ]
        .join(" ")
        .toLowerCase();

      return (
        matchesFilter &&
        (!normalizedQuery || searchableContent.includes(normalizedQuery))
      );
    });
  }, [attemptsByRolePlayId, filter, query, roleplays, user?.role]);

  if (isLoading) {
    return (
      <section
        className="rounded-xl bg-surface p-6 text-sm text-muted-foreground shadow-soft"
        aria-live="polite"
      >
        Loading your simulation courses...
      </section>
    );
  }

  if (errorMessage) {
    return (
      <section className="rounded-xl bg-warning-subtle p-6 text-warning-subtle-foreground shadow-soft">
        <h2 className="font-semibold">Courses are unavailable right now.</h2>
        <p className="mt-2 text-sm leading-6">{errorMessage}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 inline-flex min-h-control items-center justify-center rounded-lg bg-panel px-4 py-2 text-sm font-semibold text-panel-foreground transition hover:bg-panel/90"
        >
          Try again
        </button>
      </section>
    );
  }

  if (roleplays.length === 0) {
    if (!emptyState) {
      return null;
    }

    return (
      <section className="rounded-xl bg-surface p-8 text-center shadow-soft">
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          No assigned courses yet
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
          {user?.role === "trainee"
            ? "Ask a course admin to assign published roleplay courses to your learner account."
            : user?.role === "course_admin"
              ? "Ask another course admin to assign published roleplay courses to your account."
              : "Publish a roleplay and assign learner users from the Role Play Builder."}
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            Your simulation courses
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {roleplays.length} published course
            {roleplays.length === 1 ? "" : "s"} available to your account.
          </p>
        </div>
        <label className="block w-full lg:w-80">
          <span className="sr-only">Search simulation courses</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search courses, customers, or goals"
            className="min-h-control w-full rounded-lg border border-input bg-surface px-3 text-sm text-foreground placeholder:text-subtle-foreground transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
          />
        </label>
      </div>

      <div
        className="flex flex-wrap gap-2"
        aria-label="Filter courses by availability"
      >
        {(
          [
            ["all", "All courses"],
            ["ready", "Ready to start"],
            ["completed", "Previously completed"],
            ["locked", "Unavailable"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            className={`min-h-control rounded-lg px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${filter === value ? "bg-primary text-primary-foreground shadow-raised" : "bg-surface text-muted-foreground shadow-xs hover:bg-surface-sunken"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {filteredRoleplays.length === 0 ? (
        <div className="rounded-xl bg-surface p-8 text-center shadow-soft">
          <h3 className="text-lg font-semibold text-foreground">
            No courses match this view
          </h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Try a different search phrase or choose another availability filter.
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setFilter("all");
            }}
            className="mt-4 text-sm font-semibold text-primary hover:text-primary-hover"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
        {filteredRoleplays.map((roleplay) => {
          const attemptStatus =
            user?.role === "trainee" || user?.role === "course_admin"
              ? attemptsByRolePlayId[roleplay.id]
              : null;
          const actionLabel = attemptStatus?.locked
            ? "Attempts Used"
            : attemptStatus && attemptStatus.completedAttempts > 0
              ? "Retake Role Play"
              : "Start Role Play";
          const deadlinePassed = attemptStatus?.deadlinePassed;
          const deadlineLocked = attemptStatus?.deadlineLocked;

          return (
            <article
              key={roleplay.id}
              className="flex min-h-[23rem] flex-col rounded-xl bg-surface p-5 shadow-soft transition duration-slow ease-out hover:-translate-y-0.5 hover:shadow-raised"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">
                    {roleplay.settings.meetingTitle}
                  </h3>
                  <p className="mt-1 text-sm font-medium text-primary">
                    {roleplay.character.name} · {roleplay.character.role}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
                    attemptStatus?.locked
                      ? "bg-muted text-muted-foreground ring-border"
                      : "bg-success-subtle text-success-subtle-foreground ring-success/30"
                  }`}
                >
                  {deadlineLocked
                    ? "Deadline Passed"
                    : attemptStatus?.locked
                      ? "Locked"
                      : "Published"}
                </span>
              </div>
              <p className="mt-5 line-clamp-3 text-sm leading-6 text-muted-foreground">
                {roleplay.plan.scenario}
              </p>
              <div
                className={`mt-5 rounded-lg px-3 py-2 text-xs font-semibold ${
                  deadlineLocked
                    ? "bg-danger-subtle text-danger-subtle-foreground ring-1 ring-danger/30"
                    : deadlinePassed
                      ? "bg-warning-subtle text-warning-subtle-foreground ring-1 ring-warning/30"
                      : "bg-surface-sunken text-muted-foreground ring-1 ring-border"
                }`}
              >
                Deadline:{" "}
                {formatDeadline(
                  attemptStatus?.deadlineAt ?? roleplay.settings.deadlineAt,
                  attemptStatus?.deadlineTimezone ??
                    roleplay.settings.deadlineTimezone,
                )}
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 border-y border-border py-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Duration</p>
                  <p className="tabular mt-1 font-semibold text-foreground">
                    {roleplay.settings.durationMinutes} min
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Objectives</p>
                  <p className="tabular mt-1 font-semibold text-foreground">
                    {roleplay.settings.learnerGoals.length} goal
                    {roleplay.settings.learnerGoals.length === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
              {roleplay.settings.learnerGoals.length > 0 && (
                <p className="mt-4 line-clamp-2 text-sm leading-6 text-muted-foreground">
                  <span className="font-semibold text-foreground">Focus: </span>
                  {roleplay.settings.learnerGoals
                    .slice(0, 2)
                    .map((goal) => goal.label)
                    .join(" · ")}
                </p>
              )}
              {attemptStatus && (
                <p className="mt-4 rounded-lg bg-primary-subtle px-3 py-2 text-xs font-semibold text-primary">
                  {attemptStatus.locked
                    ? attemptStatus.deadlineLocked
                      ? "Deadline passed. Ask your course admin for another attempt."
                      : "All attempts completed"
                    : `${attemptStatus.remainingAttempts} of ${attemptStatus.maxAttempts} attempts remaining`}
                </p>
              )}
              {attemptStatus?.locked ? (
                <button
                  type="button"
                  disabled
                  className="mt-auto inline-flex w-full cursor-not-allowed items-center justify-center rounded-lg bg-border-strong px-4 py-2 text-sm font-semibold text-muted-foreground"
                >
                  {actionLabel}
                </button>
              ) : (
                <Link
                  href={`/roleplays/${roleplay.id}/session`}
                  className="mt-auto inline-flex w-full items-center justify-center rounded-lg bg-primary min-h-control px-4 py-2 text-sm font-semibold text-primary-foreground shadow-raised transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  {actionLabel}
                </Link>
              )}
            </article>
          );
        })}
        </div>
      )}
    </section>
  );
}
