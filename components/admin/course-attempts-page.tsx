"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  effectiveAssessmentOutcome,
  effectiveAssessmentScore,
  type SavedFinalAssessment,
} from "@/src/lib/assessments/types";
import type { AuthSessionUser } from "@/src/lib/auth/session";
import type { SafeAuthUser } from "@/src/lib/auth/userStore";
import { canUserManageRolePlay } from "@/src/lib/roleplays/access";
import {
  maxTraineeRolePlayAttempts,
  type RolePlayAttemptStatus,
} from "@/src/lib/roleplays/attempts";
import {
  attemptNumberForAssessment,
  learnerName,
} from "@/src/lib/roleplays/courseAnalytics";
import {
  fetchRolePlayConfig,
  persistRolePlayConfig,
} from "@/src/lib/roleplays/storage";
import type { RolePlayConfig } from "@/src/lib/roleplays/types";

function formatDate(value?: string) {
  if (!value) return "Not set";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(value));
}

function isoToUtcDateTimeInput(value: string | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 16);
}

function utcDateTimeInputToIso(value: string) {
  if (!value) return undefined;
  const date = new Date(`${value}:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

type DeadlineDraft = {
  deadlineDateTimeUtc: string;
  deadlineTimezone: string;
};

export function CourseAttemptsPage({ rolePlayId }: { rolePlayId: string }) {
  const [roleplay, setRoleplay] = useState<RolePlayConfig | null>(null);
  const [assessments, setAssessments] = useState<SavedFinalAssessment[]>([]);
  const [users, setUsers] = useState<SafeAuthUser[]>([]);
  const [currentUser, setCurrentUser] = useState<AuthSessionUser | null>(null);
  const [deadlineDraft, setDeadlineDraft] = useState<DeadlineDraft>({
    deadlineDateTimeUtc: "",
    deadlineTimezone: "UTC",
  });
  const [attemptOverrideDrafts, setAttemptOverrideDrafts] = useState<
    Record<string, number>
  >({});
  const [attemptStatuses, setAttemptStatuses] = useState<
    Record<string, RolePlayAttemptStatus>
  >({});
  const [attemptOverrideSearchText, setAttemptOverrideSearchText] =
    useState("");
  const [attemptOverrideSearchQuery, setAttemptOverrideSearchQuery] =
    useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function loadData() {
    const [sessionResponse, config, assessmentsResponse, usersResponse] =
      await Promise.all([
        fetch("/api/auth/session", { cache: "no-store" }),
        fetchRolePlayConfig(rolePlayId),
        fetch("/api/assessments", { cache: "no-store" }),
        fetch("/api/users/trainees", { cache: "no-store" }),
      ]);

    const sessionPayload = sessionResponse.ok
      ? ((await sessionResponse.json()) as { user?: AuthSessionUser })
      : {};
    const sessionUser = sessionPayload.user ?? null;
    setCurrentUser(sessionUser);

    if (!config) {
      setRoleplay(null);
      setErrorMessage("Course not found.");
      return;
    }

    if (!sessionUser || !canUserManageRolePlay(sessionUser, config)) {
      setAccessDenied(true);
      setRoleplay(null);
      return;
    }

    setRoleplay(config);
    setDeadlineDraft({
      deadlineDateTimeUtc: isoToUtcDateTimeInput(config.settings.deadlineAt),
      deadlineTimezone: config.settings.deadlineTimezone ?? "UTC",
    });

    if (assessmentsResponse.ok) {
      const payload = (await assessmentsResponse.json()) as {
        assessments?: SavedFinalAssessment[];
      };
      setAssessments(
        Array.isArray(payload.assessments) ? payload.assessments : [],
      );
    }

    if (usersResponse.ok) {
      const payload = (await usersResponse.json()) as {
        users?: SafeAuthUser[];
      };
      const nextUsers = Array.isArray(payload.users) ? payload.users : [];
      setUsers(nextUsers);
      await loadAttemptStatuses(config, nextUsers);
    }
  }

  async function loadAttemptStatuses(
    config: RolePlayConfig,
    nextUsers: SafeAuthUser[],
  ) {
    const assignedIds = config.settings.assignedTraineeIds ?? [];
    const assignedLearners = nextUsers.filter((candidate) =>
      assignedIds.includes(candidate.id),
    );

    const entries = await Promise.all(
      assignedLearners.map(async (learner) => {
        try {
          const response = await fetch(
            `/api/roleplays/${rolePlayId}/attempts?userId=${encodeURIComponent(learner.id)}`,
            { cache: "no-store" },
          );

          if (!response.ok) {
            return null;
          }

          const payload = (await response.json()) as {
            attemptStatus?: RolePlayAttemptStatus | null;
          };
          return payload.attemptStatus
            ? ([learner.id, payload.attemptStatus] as const)
            : null;
        } catch {
          return null;
        }
      }),
    );

    const nextStatuses = entries.filter(
      (entry): entry is readonly [string, RolePlayAttemptStatus] =>
        Boolean(entry),
    );
    setAttemptStatuses(Object.fromEntries(nextStatuses));
  }

  useEffect(() => {
    void loadData()
      .catch((error) => {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load course attempts.",
        );
      })
      .finally(() => setIsLoading(false));
  }, [rolePlayId]);

  const courseAssessments = useMemo(
    () =>
      assessments.filter((assessment) => assessment.scenarioId === rolePlayId),
    [assessments, rolePlayId],
  );

  const assignedUsers = useMemo(() => {
    const assignedIds = roleplay?.settings.assignedTraineeIds ?? [];
    return users.filter((candidate) => assignedIds.includes(candidate.id));
  }, [roleplay, users]);

  const filteredAssignedUsers = useMemo(() => {
    const query = attemptOverrideSearchQuery.trim().toLowerCase();

    if (!query) {
      return assignedUsers;
    }

    return assignedUsers.filter((candidate) =>
      [candidate.name, candidate.email].join(" ").toLowerCase().includes(query),
    );
  }, [assignedUsers, attemptOverrideSearchQuery]);

  async function saveRoleplaySettings(
    settings: Partial<RolePlayConfig["settings"]>,
    successMessage: string,
  ) {
    if (!roleplay) return;

    setIsSaving(true);
    setMessage(null);
    setErrorMessage(null);
    try {
      const saved = await persistRolePlayConfig({
        ...roleplay,
        settings: {
          ...roleplay.settings,
          ...settings,
        },
      });
      setRoleplay(saved);
      setMessage(successMessage);
      await loadData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to update course settings.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function saveDeadline() {
    await saveRoleplaySettings(
      {
        deadlineAt: utcDateTimeInputToIso(deadlineDraft.deadlineDateTimeUtc),
        deadlineTimezone: deadlineDraft.deadlineTimezone.trim() || "UTC",
      },
      "Course deadline updated.",
    );
  }

  async function saveAttemptOverride(userId: string) {
    if (!roleplay) return;

    const maxAttempts = Math.max(
      1,
      Math.floor(attemptOverrideDrafts[userId] ?? 0),
    );
    const nextOverrides = {
      ...(roleplay.settings.attemptOverrides ?? {}),
      [userId]: {
        maxAttempts,
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser
          ? {
              id: currentUser.id,
              name: currentUser.name,
              email: currentUser.email,
              role: currentUser.role,
            }
          : undefined,
      },
    };

    await saveRoleplaySettings(
      { attemptOverrides: nextOverrides },
      "Learner attempt allowance updated.",
    );
  }

  async function resetAttemptsUsed(userId: string) {
    if (!roleplay) return;

    const learner = users.find((candidate) => candidate.id === userId);
    const learnerLabel = learner?.name ?? learner?.email ?? "this learner";
    if (
      !window.confirm(
        `Reset attempts used for ${learnerLabel}? This will not delete assessment results or transcripts.`,
      )
    ) {
      return;
    }

    setIsSaving(true);
    setMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/api/roleplays/${rolePlayId}/attempts?userId=${encodeURIComponent(userId)}`,
        { method: "DELETE" },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        attemptStatus?: RolePlayAttemptStatus;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          payload.error ?? `Unable to reset attempts. HTTP ${response.status}.`,
        );
      }

      if (payload.attemptStatus) {
        setAttemptStatuses((current) => ({
          ...current,
          [userId]: payload.attemptStatus as RolePlayAttemptStatus,
        }));
      }

      setMessage(`Attempts used reset for ${learnerLabel}.`);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to reset attempts used.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="rounded-3xl border border-border bg-surface p-8 text-sm text-muted-foreground">
        Loading attempts...
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="rounded-3xl border border-warning/30 bg-warning-subtle p-8">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-warning-subtle-foreground">
          Owner-only access
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-foreground">
          Attempts are available only to the course owner or root admin.
        </h1>
        <Link
          href="/course-builder"
          className="mt-5 inline-flex rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground"
        >
          Back to Managed Courses
        </Link>
      </div>
    );
  }

  if (errorMessage || !roleplay) {
    return (
      <div className="rounded-3xl border border-danger/30 bg-danger-subtle p-8 text-sm font-semibold text-danger-subtle-foreground">
        {errorMessage ?? "Unable to load course attempts."}
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <header className="flex flex-col gap-4 px-1 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-muted-foreground">
            Course Attempts
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-foreground">
            {roleplay.settings.meetingTitle}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
            Review learner attempt numbers, scores, coach feedback, deadlines,
            and retake allowances.
          </p>
          <p className="mt-2 text-xs font-semibold text-muted-foreground">
            Current deadline: {formatDate(roleplay.settings.deadlineAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/course-builder/${rolePlayId}/analytics`}
            className="inline-flex items-center justify-center rounded-2xl border border-border bg-surface min-h-control px-4 py-2 text-sm font-bold text-muted-foreground transition hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            View Analytics
          </Link>
          <Link
            href="/course-builder"
            className="inline-flex items-center justify-center rounded-2xl bg-primary min-h-control px-4 py-2 text-sm font-bold text-primary-foreground transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Back to Courses
          </Link>
        </div>
      </header>

      {(message || errorMessage) && (
        <div
          className={`rounded-2xl border p-4 text-sm font-semibold ${
            errorMessage
              ? "border-danger/30 bg-danger-subtle text-danger-subtle-foreground"
              : "border-success/30 bg-success-subtle text-success-subtle-foreground"
          }`}
        >
          {errorMessage ?? message}
        </div>
      )}

      <section className="grid gap-4 rounded-[2rem] border border-primary/20 bg-primary-subtle/50 p-5 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
        <label className="space-y-2">
          <span className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
            Deadline date/time (UTC)
          </span>
          <input
            type="datetime-local"
            value={deadlineDraft.deadlineDateTimeUtc}
            onChange={(event) =>
              setDeadlineDraft((current) => ({
                ...current,
                deadlineDateTimeUtc: event.target.value,
              }))
            }
            className="w-full rounded-2xl border border-primary/20 bg-surface px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-ring/30"
          />
        </label>
        <label className="space-y-2">
          <span className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
            Timezone label
          </span>
          <input
            value={deadlineDraft.deadlineTimezone}
            onChange={(event) =>
              setDeadlineDraft((current) => ({
                ...current,
                deadlineTimezone: event.target.value,
              }))
            }
            className="w-full rounded-2xl border border-primary/20 bg-surface px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-ring/30"
          />
        </label>
        <button
          type="button"
          onClick={() => void saveDeadline()}
          disabled={isSaving}
          className="inline-flex items-center justify-center rounded-2xl bg-primary min-h-control px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-raised transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Save Deadline
        </button>
      </section>

      <section className="rounded-[2rem] border border-warning/30 bg-warning-subtle p-5 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-warning-subtle-foreground">
          Attempt Overrides
        </p>
        <p className="mt-2 text-sm text-warning-subtle-foreground">
          Increase a learner's max attempts if they missed the deadline or need
          one more retake. Default is {maxTraineeRolePlayAttempts} attempts.
        </p>
        {assignedUsers.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-warning/30 bg-surface/70 p-5 text-sm text-warning-subtle-foreground">
            No assigned learners yet. Add learners in Edit Course before setting
            per-learner attempt overrides.
          </div>
        ) : (
          <>
            <div className="mt-4 flex flex-col gap-2 rounded-2xl bg-surface/70 p-3 sm:flex-row">
              <input
                value={attemptOverrideSearchText}
                onChange={(event) =>
                  setAttemptOverrideSearchText(event.target.value)
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    setAttemptOverrideSearchQuery(attemptOverrideSearchText);
                  }
                }}
                placeholder="Search learner name or email"
                className="min-w-0 flex-1 rounded-xl border border-warning/30 bg-surface px-3 py-2 text-sm outline-none focus:border-warning"
              />
              <button
                type="button"
                onClick={() =>
                  setAttemptOverrideSearchQuery(attemptOverrideSearchText)
                }
                className="inline-flex items-center justify-center rounded-xl bg-warning min-h-control px-4 py-2 text-xs font-bold text-warning-foreground transition hover:bg-warning/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Search
              </button>
              {attemptOverrideSearchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setAttemptOverrideSearchText("");
                    setAttemptOverrideSearchQuery("");
                  }}
                  className="inline-flex items-center justify-center rounded-xl border border-warning/30 bg-surface min-h-control px-4 py-2 text-xs font-bold text-warning-subtle-foreground transition hover:bg-warning-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  Clear
                </button>
              )}
            </div>
            {filteredAssignedUsers.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-warning/30 bg-surface/70 p-5 text-sm text-warning-subtle-foreground">
                No assigned learners match that search.
              </div>
            ) : (
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {filteredAssignedUsers.map((learner) => {
                  const override =
                    roleplay.settings.attemptOverrides?.[learner.id];
                  const attemptStatus = attemptStatuses[learner.id];
                  const learnerAttempts = courseAssessments.filter(
                    (assessment) =>
                      assessment.learnerId === learner.id ||
                      (!assessment.learnerId &&
                        assessment.learnerEmail === learner.email),
                  ).length;
                  const attemptsUsed =
                    attemptStatus?.completedAttempts ?? learnerAttempts;
                  const maxAttempts =
                    attemptStatus?.maxAttempts ??
                    override?.maxAttempts ??
                    maxTraineeRolePlayAttempts;
                  return (
                    <div
                      key={learner.id}
                      className="rounded-2xl bg-surface p-4 shadow-sm"
                    >
                      <p className="font-bold text-foreground">
                        {learner.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {learner.email}
                      </p>
                      <p className="mt-2 text-xs font-semibold text-muted-foreground">
                        Attempts used: {attemptsUsed} / {maxAttempts}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          value={
                            attemptOverrideDrafts[learner.id] ??
                            override?.maxAttempts ??
                            maxTraineeRolePlayAttempts
                          }
                          onChange={(event) =>
                            setAttemptOverrideDrafts((current) => ({
                              ...current,
                              [learner.id]: Number(event.target.value),
                            }))
                          }
                          className="w-24 rounded-xl border border-warning/30 px-3 py-2 text-sm outline-none focus:border-warning"
                        />
                        <button
                          type="button"
                          onClick={() => void saveAttemptOverride(learner.id)}
                          disabled={isSaving}
                          className="inline-flex items-center justify-center rounded-xl bg-warning min-h-control-sm px-3 py-2 text-xs font-bold text-warning-foreground transition hover:bg-warning/90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        >
                          Save max attempts
                        </button>
                        <button
                          type="button"
                          onClick={() => void resetAttemptsUsed(learner.id)}
                          disabled={isSaving}
                          className="inline-flex items-center justify-center rounded-xl border border-danger/30 bg-surface min-h-control-sm px-3 py-2 text-xs font-bold text-danger-subtle-foreground transition hover:bg-danger-subtle disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        >
                          Reset attempts used
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </section>

      <section className="overflow-hidden rounded-[2rem] border border-border bg-surface shadow-sm">
        <div className="border-b border-border px-5 py-4">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Exam Attempts
          </p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
            Attempt History
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-surface-sunken text-xs uppercase tracking-[0.16em] text-subtle-foreground">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Attempt</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3">Outcome</th>
                <th className="px-4 py-3">Coach Feedback</th>
                <th className="px-4 py-3">Completed</th>
                <th className="px-4 py-3">Transcript</th>
                <th className="px-4 py-3">Review</th>
              </tr>
            </thead>
            <tbody>
              {courseAssessments.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-8 text-center text-muted-foreground"
                  >
                    No learners have completed this course exam yet.
                  </td>
                </tr>
              ) : (
                courseAssessments.map((assessment) => (
                  <tr
                    key={assessment.id}
                    className="border-t border-border text-muted-foreground"
                  >
                    <td className="px-4 py-3 font-bold text-foreground">
                      {learnerName(assessment, users)}
                    </td>
                    <td className="px-4 py-3 font-bold">
                      #
                      {attemptNumberForAssessment(
                        courseAssessments,
                        assessment,
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {assessment.learnerEmail ?? "Not recorded"}
                    </td>
                    <td className="px-4 py-3 font-bold tabular-nums">
                      {effectiveAssessmentScore(assessment)}%
                      {assessment.scoreOverride && (
                        <span className="mt-1 block text-[11px] font-semibold text-primary">
                          Admin reviewed
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {effectiveAssessmentOutcome(assessment) === "passed"
                        ? "Passed"
                        : "Needs Review"}
                    </td>
                    <td className="px-4 py-3">
                      <p className="line-clamp-2 max-w-sm text-xs leading-5 text-muted-foreground">
                        {assessment.summary}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      {formatDate(assessment.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <a
                        className="font-bold text-primary hover:text-primary"
                        href={`/api/assessments/${assessment.id}/transcript`}
                      >
                        Download
                      </a>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        className="font-bold text-primary hover:text-primary"
                        href={`/assessment/${assessment.id}`}
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
