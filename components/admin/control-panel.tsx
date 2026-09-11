"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { SavedFinalAssessment } from "@/src/lib/assessments/types";
import type { AuthSessionUser } from "@/src/lib/auth/session";
import type { SafeAuthUser } from "@/src/lib/auth/userStore";
import { canUserManageRolePlay } from "@/src/lib/roleplays/access";
import type { RolePlayConfig } from "@/src/lib/roleplays/types";
import type { AppRole } from "@/lib/types";

type ControlPanelSection = "users" | "courses";

type UserForm = {
  name: string;
  email: string;
  position: string;
  role: AppRole;
  password: string;
};

type EditDialogState = {
  user: SafeAuthUser;
  name: string;
  email: string;
  position: string;
  role: AppRole;
  isActive: boolean;
};

type DeadlineDraft = {
  deadlineDateTimeUtc: string;
  deadlineTimezone: string;
};

const defaultUserForm: UserForm = {
  name: "",
  email: "",
  position: "",
  role: "trainee",
  password: "",
};

function formatDate(value?: string) {
  if (!value) {
    return "Not recorded";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDuration(minutes: number | null) {
  if (minutes === null) return "N/A";
  if (minutes < 1) return "<1 min";
  return `${minutes} min`;
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

function assessmentCompletionMinutes(assessment: SavedFinalAssessment) {
  const timestamps = assessment.transcript
    .map((entry) => new Date(entry.timestamp).getTime())
    .filter(Number.isFinite)
    .sort((first, second) => first - second);

  if (timestamps.length < 2) return null;
  return Math.max(
    0,
    Math.round((timestamps[timestamps.length - 1] - timestamps[0]) / 60000),
  );
}

function roleLabel(role: AppRole) {
  if (role === "root_admin") {
    return "Root Admin";
  }

  if (role === "course_admin") {
    return "Course Admin";
  }

  return "Trainee";
}

function userStatusLabel(isActive: boolean) {
  return isActive ? "Active" : "Inactive";
}

function statusClass(status: RolePlayConfig["status"]) {
  return status === "published"
    ? "bg-success-subtle text-success-subtle-foreground ring-1 ring-success/30"
    : "bg-warning-subtle text-warning-subtle-foreground ring-1 ring-warning/30";
}

function outcomeClass(outcome: SavedFinalAssessment["outcome"]) {
  return outcome === "passed"
    ? "bg-success-subtle text-success-subtle-foreground ring-1 ring-success/30"
    : "bg-warning-subtle text-warning-subtle-foreground ring-1 ring-warning/30";
}

export function ControlPanel({
  section = "users",
}: {
  section?: ControlPanelSection;
}) {
  const [currentUser, setCurrentUser] = useState<AuthSessionUser | null>(null);
  const [users, setUsers] = useState<SafeAuthUser[]>([]);
  const [roleplays, setRoleplays] = useState<RolePlayConfig[]>([]);
  const [assessments, setAssessments] = useState<SavedFinalAssessment[]>([]);
  const [expandedCourseId, setExpandedCourseId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deadlineDrafts, setDeadlineDrafts] = useState<
    Record<string, DeadlineDraft>
  >({});
  const [attemptOverrideDrafts, setAttemptOverrideDrafts] = useState<
    Record<string, number>
  >({});
  const [attemptOverrideSearchTexts, setAttemptOverrideSearchTexts] = useState<
    Record<string, string>
  >({});
  const [attemptOverrideSearchQueries, setAttemptOverrideSearchQueries] =
    useState<Record<string, string>>({});
  const [userForm, setUserForm] = useState<UserForm>(defaultUserForm);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [editDialog, setEditDialog] = useState<EditDialogState | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<SafeAuthUser | null>(null);
  const [isDeletingUser, setIsDeletingUser] = useState(false);

  async function refreshPanel() {
    setErrorMessage(null);
    const [sessionResponse, roleplaysResponse, assessmentsResponse] =
      await Promise.all([
        fetch("/api/auth/session", { cache: "no-store" }),
        fetch("/api/roleplays", { cache: "no-store" }),
        fetch("/api/assessments", { cache: "no-store" }),
      ]);

    if (!sessionResponse.ok) {
      throw new Error(
        `Unable to load session. HTTP ${sessionResponse.status}.`,
      );
    }
    if (!roleplaysResponse.ok) {
      throw new Error(
        `Unable to load courses. HTTP ${roleplaysResponse.status}.`,
      );
    }
    if (!assessmentsResponse.ok) {
      throw new Error(
        `Unable to load exam scores. HTTP ${assessmentsResponse.status}.`,
      );
    }

    const sessionPayload = (await sessionResponse.json()) as {
      user?: AuthSessionUser;
    };
    const usersResponse =
      sessionPayload.user?.role === "root_admin"
        ? await fetch("/api/admin/users", { cache: "no-store" })
        : await fetch("/api/users/trainees", { cache: "no-store" });

    if (!usersResponse.ok) {
      throw new Error(`Unable to load users. HTTP ${usersResponse.status}.`);
    }

    const usersPayload = (await usersResponse.json()) as {
      users?: SafeAuthUser[];
    };
    const roleplaysPayload = (await roleplaysResponse.json()) as {
      roleplays?: RolePlayConfig[];
    };
    const assessmentsPayload = (await assessmentsResponse.json()) as {
      assessments?: SavedFinalAssessment[];
    };

    const nextCurrentUser = sessionPayload.user ?? null;
    const nextRoleplays = Array.isArray(roleplaysPayload.roleplays)
      ? roleplaysPayload.roleplays
      : [];

    setCurrentUser(nextCurrentUser);
    setUsers(Array.isArray(usersPayload.users) ? usersPayload.users : []);
    setRoleplays(
      nextCurrentUser?.role === "course_admin" && section === "courses"
        ? nextRoleplays.filter((roleplay) =>
            canUserManageRolePlay(nextCurrentUser, roleplay),
          )
        : nextRoleplays,
    );
    setAssessments(
      Array.isArray(assessmentsPayload.assessments)
        ? assessmentsPayload.assessments
        : [],
    );
    setDeadlineDrafts(
      Object.fromEntries(
        nextRoleplays.map((roleplay) => [
          roleplay.id,
          {
            deadlineDateTimeUtc: isoToUtcDateTimeInput(
              roleplay.settings.deadlineAt,
            ),
            deadlineTimezone: roleplay.settings.deadlineTimezone ?? "UTC",
          },
        ]),
      ),
    );
  }

  useEffect(() => {
    void (async () => {
      try {
        await refreshPanel();
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load control panel.",
        );
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!message && !errorMessage) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setMessage(null);
      setErrorMessage(null);
    }, 5000);

    return () => window.clearTimeout(timeout);
  }, [errorMessage, message]);

  const stats = useMemo(() => {
    const published = roleplays.filter(
      (roleplay) => roleplay.status === "published",
    ).length;
    const traineeCount = users.filter((user) => user.role === "trainee").length;
    const averageScore =
      assessments.length === 0
        ? null
        : Math.round(
            assessments.reduce(
              (total, assessment) => total + assessment.overallScore,
              0,
            ) / assessments.length,
          );

    return {
      users: users.length,
      traineeCount,
      courses: roleplays.length,
      published,
      exams: assessments.length,
      averageScore,
    };
  }, [assessments, roleplays, users]);

  const filteredUsers = useMemo(() => {
    const query = userSearchQuery.trim().toLowerCase();
    if (!query) {
      return users;
    }

    return users.filter((user) =>
      [
        user.name,
        user.email,
        user.position,
        roleLabel(user.role),
        userStatusLabel(user.isActive),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [userSearchQuery, users]);

  function assessmentsForCourse(roleplayId: string) {
    return assessments.filter(
      (assessment) => assessment.scenarioId === roleplayId,
    );
  }

  function analyticsForCourse(courseAssessments: SavedFinalAssessment[]) {
    const scores = courseAssessments.map(
      (assessment) => assessment.overallScore,
    );
    const passed = courseAssessments.filter(
      (assessment) => assessment.outcome === "passed",
    ).length;
    const completionTimes = courseAssessments
      .map(assessmentCompletionMinutes)
      .filter((value): value is number => value !== null);
    const scoreRanges = [
      { label: "0-59%", min: 0, max: 59 },
      { label: "60-79%", min: 60, max: 79 },
      { label: "80-89%", min: 80, max: 89 },
      { label: "90-100%", min: 90, max: 100 },
    ].map((range) => ({
      ...range,
      count: scores.filter((score) => score >= range.min && score <= range.max)
        .length,
    }));
    const learnerBest = new Map<string, SavedFinalAssessment>();

    for (const assessment of courseAssessments) {
      const key =
        assessment.learnerId ?? assessment.learnerEmail ?? assessment.id;
      const existing = learnerBest.get(key);
      if (!existing || assessment.overallScore > existing.overallScore) {
        learnerBest.set(key, assessment);
      }
    }

    return {
      totalAttempts: courseAssessments.length,
      passRate:
        courseAssessments.length === 0
          ? null
          : Math.round((passed / courseAssessments.length) * 100),
      averageScore:
        scores.length === 0
          ? null
          : Math.round(
              scores.reduce((total, score) => total + score, 0) / scores.length,
            ),
      averageCompletionTime:
        completionTimes.length === 0
          ? null
          : Math.round(
              completionTimes.reduce((total, minutes) => total + minutes, 0) /
                completionTimes.length,
            ),
      scoreRanges,
      topPerformers: [...learnerBest.values()]
        .sort((first, second) => second.overallScore - first.overallScore)
        .slice(0, 5),
    };
  }

  function attemptNumberForAssessment(
    courseAssessments: SavedFinalAssessment[],
    assessment: SavedFinalAssessment,
  ) {
    return (
      courseAssessments
        .filter(
          (item) =>
            (item.learnerId && item.learnerId === assessment.learnerId) ||
            (!item.learnerId && item.learnerEmail === assessment.learnerEmail),
        )
        .sort((first, second) =>
          first.createdAt.localeCompare(second.createdAt),
        )
        .findIndex((item) => item.id === assessment.id) + 1
    );
  }

  function learnerName(assessment: SavedFinalAssessment) {
    if (assessment.learnerName) {
      return assessment.learnerName;
    }

    if (assessment.learnerId) {
      return (
        users.find((user) => user.id === assessment.learnerId)?.name ??
        assessment.learnerId
      );
    }

    return "Unknown learner";
  }

  async function createUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setErrorMessage(null);

    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userForm),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    if (!response.ok) {
      setErrorMessage(
        payload.error ?? `Unable to create user. HTTP ${response.status}.`,
      );
      return;
    }

    setUserForm(defaultUserForm);
    setIsCreateUserOpen(false);
    setMessage(`User "${userForm.name.trim()}" was created successfully.`);
    await refreshPanel();
  }

  async function submitUserEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editDialog) {
      return;
    }

    setMessage(null);
    setErrorMessage(null);

    const response = await fetch(`/api/admin/users/${editDialog.user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: editDialog.email,
        name: editDialog.name,
        position: editDialog.position,
        role: editDialog.role,
        isActive: editDialog.isActive,
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    if (!response.ok) {
      setErrorMessage(
        payload.error ?? `Unable to update user. HTTP ${response.status}.`,
      );
      return;
    }

    setEditDialog(null);
    setMessage("User details updated.");
    await refreshPanel();
  }

  async function confirmDeleteUser() {
    if (!deleteDialog) {
      return;
    }

    setIsDeletingUser(true);
    setMessage(null);
    setErrorMessage(null);
    const userName = deleteDialog.name;

    try {
      const response = await fetch(`/api/admin/users/${deleteDialog.id}`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        setErrorMessage(
          payload.error ?? `Unable to delete user. HTTP ${response.status}.`,
        );
        return;
      }

      setDeleteDialog(null);
      setEditDialog(null);
      setMessage(`User "${userName}" was deleted successfully.`);
      await refreshPanel();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to delete user.",
      );
    } finally {
      setIsDeletingUser(false);
    }
  }

  async function updateCourseStatus(
    rolePlayId: string,
    status: RolePlayConfig["status"],
  ) {
    setMessage(null);
    setErrorMessage(null);
    const response = await fetch(`/api/roleplays/${rolePlayId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
    };

    if (!response.ok) {
      setErrorMessage(
        payload.error ?? `Unable to update course. HTTP ${response.status}.`,
      );
      return;
    }

    setMessage(
      status === "published" ? "Course published." : "Course unpublished.",
    );
    await refreshPanel();
  }

  async function deleteCourse(rolePlayId: string) {
    if (!window.confirm("Delete this course and its attempt tracking?")) {
      return;
    }

    setMessage(null);
    setErrorMessage(null);
    const response = await fetch(`/api/roleplays/${rolePlayId}`, {
      method: "DELETE",
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
    };

    if (!response.ok) {
      setErrorMessage(
        payload.error ?? `Unable to delete course. HTTP ${response.status}.`,
      );
      return;
    }

    setMessage("Course deleted.");
    await refreshPanel();
  }

  async function saveRoleplaySettings(
    roleplay: RolePlayConfig,
    settings: Partial<RolePlayConfig["settings"]>,
    successMessage: string,
  ) {
    setMessage(null);
    setErrorMessage(null);
    const response = await fetch("/api/roleplays", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...roleplay,
        settings: {
          ...roleplay.settings,
          ...settings,
        },
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
    };

    if (!response.ok) {
      setErrorMessage(
        payload.error ??
          `Unable to update course settings. HTTP ${response.status}.`,
      );
      return;
    }

    setMessage(successMessage);
    await refreshPanel();
  }

  async function saveDeadline(roleplay: RolePlayConfig) {
    const draft = deadlineDrafts[roleplay.id] ?? {
      deadlineDateTimeUtc: "",
      deadlineTimezone: "UTC",
    };
    await saveRoleplaySettings(
      roleplay,
      {
        deadlineAt: utcDateTimeInputToIso(draft.deadlineDateTimeUtc),
        deadlineTimezone: draft.deadlineTimezone.trim() || "UTC",
      },
      "Course deadline updated.",
    );
  }

  async function saveAttemptOverride(roleplay: RolePlayConfig, userId: string) {
    const key = `${roleplay.id}:${userId}`;
    const maxAttempts = Math.max(
      1,
      Math.floor(attemptOverrideDrafts[key] ?? 0),
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
      roleplay,
      { attemptOverrides: nextOverrides },
      "Learner attempt allowance updated.",
    );
  }

  async function resetAttemptsUsed(roleplay: RolePlayConfig, userId: string) {
    const learner = users.find((candidate) => candidate.id === userId);
    const learnerLabel = learner?.name ?? learner?.email ?? "this learner";
    if (
      !window.confirm(
        `Reset attempts used for ${learnerLabel}? This will not delete assessment results or transcripts.`,
      )
    ) {
      return;
    }

    setMessage(null);
    setErrorMessage(null);

    const response = await fetch(
      `/api/roleplays/${roleplay.id}/attempts?userId=${encodeURIComponent(userId)}`,
      { method: "DELETE" },
    );
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
    };

    if (!response.ok) {
      setErrorMessage(
        payload.error ?? `Unable to reset attempts. HTTP ${response.status}.`,
      );
      return;
    }

    setMessage(`Attempts used reset for ${learnerLabel}.`);
  }

  if (isLoading) {
    return (
      <section className="rounded-3xl border border-primary/20 bg-surface p-6 text-sm text-muted-foreground shadow-soft">
        Loading control panel...
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-primary/20 bg-hero-grid p-7 shadow-soft">
        <p className="text-xs uppercase tracking-[0.24em] text-primary">
          Admin Console
        </p>
        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight text-foreground">
              {section === "users" ? "User Management" : "Course List"}
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground">
              {section === "users"
                ? "Create app users, delete users, change passwords through a secure popup, and update roles."
                : "Publish or remove roleplay courses and review which users took each exam with their saved scores."}
            </p>
          </div>
          <Link
            href="/course-builder/new"
            className="inline-flex rounded-2xl bg-primary min-h-control px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-raised transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Create Course
          </Link>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {[
            { label: "Users", value: stats.users },
            { label: "Trainees", value: stats.traineeCount },
            { label: "Courses", value: stats.courses },
            { label: "Published", value: stats.published },
            { label: "Exam Takes", value: stats.exams },
            {
              label: "Avg Score",
              value:
                stats.averageScore === null ? "N/A" : `${stats.averageScore}%`,
            },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-primary/20 bg-surface/85 p-4"
            >
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {item.label}
              </p>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {item.value}
              </p>
            </div>
          ))}
        </div>
      </section>

      {(message || errorMessage) && (
        <div
          className={`fixed right-6 top-6 z-toast max-w-md rounded-2xl border p-4 text-sm font-medium shadow-2xl ${
            errorMessage
              ? "border-warning/30 bg-warning-subtle text-warning-subtle-foreground"
              : "border-success/30 bg-success-subtle text-success-subtle-foreground"
          }`}
          role="status"
        >
          <div className="flex items-start gap-3">
            <span
              className={`mt-1 h-2.5 w-2.5 rounded-full ${
                errorMessage ? "bg-warning" : "bg-success"
              }`}
            />
            <div>
              <p className="font-semibold">
                {errorMessage ? "Action needed" : "Success"}
              </p>
              <p className="mt-1 font-medium">{errorMessage ?? message}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setMessage(null);
                setErrorMessage(null);
              }}
              className="ml-2 text-lg leading-none text-current opacity-60 transition hover:opacity-100"
              aria-label="Dismiss notification"
            >
              x
            </button>
          </div>
        </div>
      )}

      {section === "users" ? (
        <section className="overflow-hidden rounded-3xl border border-border bg-surface shadow-soft">
          <div className="border-b border-border p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                    User management
                  </h2>
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                    {users.length}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Manage team members and their account permissions in one
                  simple table.
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <label className="flex min-w-[260px] items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm shadow-sm transition focus-within:border-primary">
                  <span className="text-subtle-foreground">Search</span>
                  <input
                    value={userSearchQuery}
                    onChange={(event) => setUserSearchQuery(event.target.value)}
                    className="w-full bg-transparent text-muted-foreground outline-none placeholder:text-subtle-foreground"
                    placeholder="Name, email, position, or role"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setIsCreateUserOpen(true)}
                  className="inline-flex items-center justify-center rounded-xl border border-border bg-surface min-h-control px-4 py-2 text-sm font-semibold text-muted-foreground shadow-sm transition hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  Add User
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] border-separate border-spacing-0 text-left text-sm">
              <thead className="bg-surface-sunken text-muted-foreground">
                <tr>
                  <th className="border-b border-border px-5 py-3 font-medium">
                    Full name
                  </th>
                  <th className="border-b border-border px-5 py-3 font-medium">
                    Email
                  </th>
                  <th className="border-b border-border px-5 py-3 font-medium">
                    Position
                  </th>
                  <th className="border-b border-border px-5 py-3 font-medium">
                    Role
                  </th>
                  <th className="border-b border-border px-5 py-3 font-medium">
                    Status
                  </th>
                  <th className="border-b border-border px-5 py-3 font-medium">
                    Joined date
                  </th>
                  <th className="border-b border-border px-5 py-3 text-right font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-12 text-center text-sm text-muted-foreground"
                    >
                      No users match your search.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => (
                    <tr
                      key={user.id}
                      className="text-muted-foreground transition hover:bg-surface-sunken"
                    >
                      <td className="border-b border-border px-5 py-3 font-medium text-foreground">
                        {user.name}
                      </td>
                      <td className="border-b border-border px-5 py-3">
                        <span className="text-muted-foreground underline decoration-slate-300 underline-offset-4">
                          {user.email}
                        </span>
                      </td>
                      <td className="border-b border-border px-5 py-3 text-muted-foreground">
                        {user.position || "Not set"}
                      </td>
                      <td className="border-b border-border px-5 py-3 text-muted-foreground">
                        {roleLabel(user.role)}
                      </td>
                      <td className="border-b border-border px-5 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-md border bg-surface px-2.5 py-1 text-xs font-medium text-muted-foreground ${
                            user.isActive
                              ? "border-success/30"
                              : "border-border"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              user.isActive ? "bg-success" : "bg-border-strong"
                            }`}
                          />
                          {userStatusLabel(user.isActive)}
                        </span>
                      </td>
                      <td className="border-b border-border px-5 py-3 text-muted-foreground">
                        {formatDate(user.createdAt)}
                      </td>
                      <td className="border-b border-border px-5 py-3">
                        <div className="flex justify-end gap-2">
                          <Link
                            href={`/control-panel/users/${user.id}/learning-record`}
                            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-muted-foreground shadow-sm transition hover:border-primary/40 hover:bg-primary-subtle hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                          >
                            Profile
                          </Link>
                          <button
                            type="button"
                            onClick={() =>
                              setEditDialog({
                                user,
                                email: user.email,
                                name: user.name,
                                position: user.position ?? "",
                                role: user.role,
                                isActive: user.isActive,
                              })
                            }
                            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-muted-foreground shadow-sm transition hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteDialog(user)}
                            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-muted-foreground shadow-sm transition hover:border-danger/40 hover:bg-danger-subtle hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t border-border px-5 py-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>
              Showing {filteredUsers.length} of {users.length} users
            </span>
            <span>Rows per page: {filteredUsers.length}</span>
          </div>
        </section>
      ) : (
        <section className="rounded-3xl border border-primary/20 bg-surface p-6 shadow-soft">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-primary">
                Course List
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                All roleplay courses
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
                Publish, unpublish, or delete courses. Open the exam taker list
                to see saved scores per course.
              </p>
            </div>
            <span className="rounded-full border border-primary/20 bg-primary-subtle px-3 py-1 text-xs font-semibold text-primary">
              {roleplays.length} courses
            </span>
          </div>

          <div className="mt-5 space-y-4">
            {roleplays.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-primary/20 bg-primary-subtle/50 p-8 text-center">
                <p className="text-sm text-muted-foreground">
                  No roleplay courses have been created yet.
                </p>
              </div>
            ) : (
              roleplays.map((roleplay) => {
                const courseAssessments = assessmentsForCourse(roleplay.id);
                const isExpanded = expandedCourseId === roleplay.id;
                const canManage = currentUser
                  ? canUserManageRolePlay(currentUser, roleplay)
                  : false;
                const courseAnalytics = analyticsForCourse(courseAssessments);
                const assignedUsers = users.filter((user) =>
                  roleplay.settings.assignedTraineeIds?.includes(user.id),
                );
                const attemptOverrideSearchText =
                  attemptOverrideSearchTexts[roleplay.id] ?? "";
                const attemptOverrideSearchQuery =
                  attemptOverrideSearchQueries[roleplay.id] ?? "";
                const filteredAssignedUsers = attemptOverrideSearchQuery.trim()
                  ? assignedUsers.filter((user) =>
                      [user.name, user.email]
                        .join(" ")
                        .toLowerCase()
                        .includes(
                          attemptOverrideSearchQuery.trim().toLowerCase(),
                        ),
                    )
                  : assignedUsers;
                const averageScore =
                  courseAssessments.length === 0
                    ? null
                    : Math.round(
                        courseAssessments.reduce(
                          (total, assessment) =>
                            total + assessment.overallScore,
                          0,
                        ) / courseAssessments.length,
                      );

                return (
                  <article
                    key={roleplay.id}
                    className="rounded-3xl border border-primary/20 bg-primary-subtle/35 p-5"
                  >
                    <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className="text-xl font-semibold tracking-tight text-foreground">
                            {roleplay.settings.meetingTitle}
                          </h3>
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClass(roleplay.status)}`}
                          >
                            {roleplay.status === "published"
                              ? "Published"
                              : "Draft"}
                          </span>
                        </div>
                        <p className="mt-2 text-sm font-medium text-primary">
                          {roleplay.character.name} - {roleplay.character.role}
                        </p>
                        <p className="mt-3 line-clamp-2 max-w-4xl text-sm leading-6 text-muted-foreground">
                          {roleplay.plan.scenario}
                        </p>
                        <p className="mt-3 inline-flex rounded-2xl bg-surface px-3 py-2 text-xs font-semibold text-muted-foreground ring-1 ring-ring/30">
                          Deadline: {formatDate(roleplay.settings.deadlineAt)}{" "}
                          {roleplay.settings.deadlineAt
                            ? `(${roleplay.settings.deadlineTimezone ?? "UTC"})`
                            : ""}
                        </p>
                        <div className="mt-4 grid gap-3 text-sm text-muted-foreground md:grid-cols-2 xl:grid-cols-5">
                          <div className="rounded-2xl bg-surface p-3 ring-1 ring-ring/30">
                            <span className="block text-xs uppercase tracking-[0.16em] text-subtle-foreground">
                              Created By
                            </span>
                            <span className="mt-1 block font-semibold text-foreground">
                              {roleplay.createdBy?.name ?? "Unknown"}
                            </span>
                          </div>
                          <div className="rounded-2xl bg-surface p-3 ring-1 ring-ring/30">
                            <span className="block text-xs uppercase tracking-[0.16em] text-subtle-foreground">
                              Created
                            </span>
                            <span className="mt-1 block font-semibold text-foreground">
                              {formatDate(roleplay.createdAt)}
                            </span>
                          </div>
                          <div className="rounded-2xl bg-surface p-3 ring-1 ring-ring/30">
                            <span className="block text-xs uppercase tracking-[0.16em] text-subtle-foreground">
                              Assigned
                            </span>
                            <span className="mt-1 block font-semibold text-foreground">
                              {roleplay.settings.assignedTraineeIds?.length ??
                                0}{" "}
                              users
                            </span>
                          </div>
                          <div className="rounded-2xl bg-surface p-3 ring-1 ring-ring/30">
                            <span className="block text-xs uppercase tracking-[0.16em] text-subtle-foreground">
                              Exam Takers
                            </span>
                            <span className="mt-1 block font-semibold text-foreground">
                              {courseAssessments.length}
                            </span>
                          </div>
                          <div className="rounded-2xl bg-surface p-3 ring-1 ring-ring/30">
                            <span className="block text-xs uppercase tracking-[0.16em] text-subtle-foreground">
                              Avg Score
                            </span>
                            <span className="mt-1 block font-semibold text-foreground">
                              {averageScore === null
                                ? "N/A"
                                : `${averageScore}%`}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex shrink-0 flex-wrap gap-2 xl:max-w-xs xl:justify-end">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedCourseId(isExpanded ? null : roleplay.id)
                          }
                          className="inline-flex items-center justify-center rounded-2xl bg-primary min-h-control px-4 py-2 text-sm font-semibold text-primary-foreground shadow-raised transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        >
                          {isExpanded ? "Hide Scores" : "View Scores"}
                        </button>
                        {canManage ? (
                          <>
                            {roleplay.status === "draft" ? (
                              <button
                                type="button"
                                onClick={() =>
                                  void updateCourseStatus(
                                    roleplay.id,
                                    "published",
                                  )
                                }
                                className="inline-flex items-center justify-center rounded-2xl bg-success min-h-control px-4 py-2 text-sm font-semibold text-success-foreground shadow-raised transition hover:bg-success/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                              >
                                Publish
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  void updateCourseStatus(roleplay.id, "draft")
                                }
                                className="inline-flex items-center justify-center rounded-2xl border border-warning/30 bg-warning-subtle min-h-control px-4 py-2 text-sm font-semibold text-warning-subtle-foreground transition hover:bg-warning-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                              >
                                Unpublish
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => void deleteCourse(roleplay.id)}
                              className="inline-flex items-center justify-center rounded-2xl border border-danger/30 bg-surface min-h-control px-4 py-2 text-sm font-semibold text-danger-subtle-foreground transition hover:bg-danger-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                            >
                              Delete
                            </button>
                          </>
                        ) : (
                          <span className="rounded-2xl border border-border bg-surface/80 px-4 py-2 text-sm font-semibold text-muted-foreground">
                            Owner-only management
                          </span>
                        )}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-5 rounded-3xl border border-primary/20 bg-surface p-4">
                        <div className="flex items-center justify-between gap-4">
                          <h4 className="font-semibold text-foreground">
                            Course analytics and attempts
                          </h4>
                          <span className="text-xs font-semibold uppercase tracking-[0.16em] text-subtle-foreground">
                            {courseAssessments.length} saved scores
                          </span>
                        </div>
                        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                          {[
                            {
                              label: "Total Attempts",
                              value: courseAnalytics.totalAttempts,
                            },
                            {
                              label: "Pass Rate",
                              value:
                                courseAnalytics.passRate === null
                                  ? "N/A"
                                  : `${courseAnalytics.passRate}%`,
                            },
                            {
                              label: "Average Score",
                              value:
                                courseAnalytics.averageScore === null
                                  ? "N/A"
                                  : `${courseAnalytics.averageScore}%`,
                            },
                            {
                              label: "Avg Completion",
                              value: formatDuration(
                                courseAnalytics.averageCompletionTime,
                              ),
                            },
                            {
                              label: "Top Score",
                              value:
                                courseAnalytics.topPerformers[0]
                                  ?.overallScore === undefined
                                  ? "N/A"
                                  : `${courseAnalytics.topPerformers[0].overallScore}%`,
                            },
                          ].map((item) => (
                            <div
                              key={item.label}
                              className="rounded-2xl bg-primary-subtle/70 p-3"
                            >
                              <p className="text-xs uppercase tracking-[0.16em] text-subtle-foreground">
                                {item.label}
                              </p>
                              <p className="mt-1 text-lg font-semibold text-foreground">
                                {item.value}
                              </p>
                            </div>
                          ))}
                        </div>

                        {canManage && (
                          <div className="mt-4 grid gap-4 rounded-3xl border border-primary/20 bg-primary-subtle/40 p-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
                            <label className="space-y-2">
                              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                Deadline date/time (UTC)
                              </span>
                              <input
                                type="datetime-local"
                                value={
                                  deadlineDrafts[roleplay.id]
                                    ?.deadlineDateTimeUtc ?? ""
                                }
                                onChange={(event) =>
                                  setDeadlineDrafts((current) => ({
                                    ...current,
                                    [roleplay.id]: {
                                      deadlineDateTimeUtc: event.target.value,
                                      deadlineTimezone:
                                        current[roleplay.id]
                                          ?.deadlineTimezone ??
                                        roleplay.settings.deadlineTimezone ??
                                        "UTC",
                                    },
                                  }))
                                }
                                className="w-full rounded-2xl border border-primary/20 bg-surface px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-ring/30"
                              />
                            </label>
                            <label className="space-y-2">
                              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                Timezone label
                              </span>
                              <input
                                value={
                                  deadlineDrafts[roleplay.id]
                                    ?.deadlineTimezone ?? "UTC"
                                }
                                onChange={(event) =>
                                  setDeadlineDrafts((current) => ({
                                    ...current,
                                    [roleplay.id]: {
                                      deadlineDateTimeUtc:
                                        current[roleplay.id]
                                          ?.deadlineDateTimeUtc ??
                                        isoToUtcDateTimeInput(
                                          roleplay.settings.deadlineAt,
                                        ),
                                      deadlineTimezone: event.target.value,
                                    },
                                  }))
                                }
                                className="w-full rounded-2xl border border-primary/20 bg-surface px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-ring/30"
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() => void saveDeadline(roleplay)}
                              className="inline-flex items-center justify-center rounded-2xl bg-primary min-h-control px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-raised transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                            >
                              Save Deadline
                            </button>
                          </div>
                        )}

                        <div className="mt-4 grid gap-4 lg:grid-cols-2">
                          <div className="rounded-3xl border border-border bg-surface-sunken p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                              Score Summary
                            </p>
                            <div className="mt-3 space-y-2">
                              {courseAnalytics.scoreRanges.map((range) => (
                                <div
                                  key={range.label}
                                  className="flex items-center gap-3 text-sm"
                                >
                                  <span className="w-20 font-semibold text-muted-foreground">
                                    {range.label}
                                  </span>
                                  <div className="h-2 flex-1 rounded-full bg-surface">
                                    <div
                                      className="h-2 rounded-full bg-primary"
                                      style={{
                                        width:
                                          courseAnalytics.totalAttempts === 0
                                            ? "0%"
                                            : `${Math.round((range.count / courseAnalytics.totalAttempts) * 100)}%`,
                                      }}
                                    />
                                  </div>
                                  <span className="w-8 text-right font-semibold text-muted-foreground">
                                    {range.count}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="rounded-3xl border border-border bg-surface-sunken p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                              Top Performers
                            </p>
                            <div className="mt-3 space-y-2">
                              {courseAnalytics.topPerformers.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                  No completed attempts yet.
                                </p>
                              ) : (
                                courseAnalytics.topPerformers.map(
                                  (assessment, index) => (
                                    <div
                                      key={assessment.id}
                                      className="flex items-center justify-between rounded-2xl bg-surface px-3 py-2 text-sm"
                                    >
                                      <span className="font-semibold text-foreground">
                                        #{index + 1} {learnerName(assessment)}
                                      </span>
                                      <span className="font-bold text-primary">
                                        {assessment.overallScore}%
                                      </span>
                                    </div>
                                  ),
                                )
                              )}
                            </div>
                          </div>
                        </div>

                        {canManage && assignedUsers.length > 0 && (
                          <div className="mt-4 rounded-3xl border border-warning/30 bg-warning-subtle p-4">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-warning-subtle-foreground">
                              Attempt Overrides
                            </p>
                            <p className="mt-1 text-sm text-warning-subtle-foreground">
                              Increase a learner's max attempts if they missed
                              the deadline or need one more retake.
                            </p>
                            <div className="mt-3 flex flex-col gap-2 rounded-2xl bg-surface/70 p-3 sm:flex-row">
                              <input
                                value={attemptOverrideSearchText}
                                onChange={(event) =>
                                  setAttemptOverrideSearchTexts((current) => ({
                                    ...current,
                                    [roleplay.id]: event.target.value,
                                  }))
                                }
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    setAttemptOverrideSearchQueries(
                                      (current) => ({
                                        ...current,
                                        [roleplay.id]:
                                          attemptOverrideSearchText,
                                      }),
                                    );
                                  }
                                }}
                                placeholder="Search learner name or email"
                                className="min-w-0 flex-1 rounded-xl border border-warning/30 bg-surface px-3 py-2 text-sm outline-none focus:border-warning"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setAttemptOverrideSearchQueries(
                                    (current) => ({
                                      ...current,
                                      [roleplay.id]: attemptOverrideSearchText,
                                    }),
                                  )
                                }
                                className="inline-flex items-center justify-center rounded-xl bg-warning min-h-control px-4 py-2 text-xs font-semibold text-warning-foreground transition hover:bg-warning/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                              >
                                Search
                              </button>
                              {attemptOverrideSearchQuery && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAttemptOverrideSearchTexts(
                                      (current) => ({
                                        ...current,
                                        [roleplay.id]: "",
                                      }),
                                    );
                                    setAttemptOverrideSearchQueries(
                                      (current) => ({
                                        ...current,
                                        [roleplay.id]: "",
                                      }),
                                    );
                                  }}
                                  className="inline-flex items-center justify-center rounded-xl border border-warning/30 bg-surface min-h-control px-4 py-2 text-xs font-semibold text-warning-subtle-foreground transition hover:bg-warning-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                                >
                                  Clear
                                </button>
                              )}
                            </div>
                            <div className="mt-3 grid gap-3 md:grid-cols-2">
                              {filteredAssignedUsers.length === 0 ? (
                                <p className="rounded-2xl border border-dashed border-warning/30 bg-surface/70 p-4 text-sm text-warning-subtle-foreground md:col-span-2">
                                  No assigned learners match that search.
                                </p>
                              ) : (
                                filteredAssignedUsers.map((learner) => {
                                  const override =
                                    roleplay.settings.attemptOverrides?.[
                                      learner.id
                                    ];
                                  const key = `${roleplay.id}:${learner.id}`;
                                  return (
                                    <div
                                      key={learner.id}
                                      className="rounded-2xl bg-surface p-3"
                                    >
                                      <p className="font-semibold text-foreground">
                                        {learner.name}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        {learner.email}
                                      </p>
                                      <div className="mt-3 flex flex-wrap items-center gap-2">
                                        <input
                                          type="number"
                                          min={1}
                                          value={
                                            attemptOverrideDrafts[key] ??
                                            override?.maxAttempts ??
                                            2
                                          }
                                          onChange={(event) =>
                                            setAttemptOverrideDrafts(
                                              (current) => ({
                                                ...current,
                                                [key]: Number(
                                                  event.target.value,
                                                ),
                                              }),
                                            )
                                          }
                                          className="w-24 rounded-xl border border-warning/30 px-3 py-2 text-sm outline-none focus:border-warning"
                                        />
                                        <button
                                          type="button"
                                          onClick={() =>
                                            void saveAttemptOverride(
                                              roleplay,
                                              learner.id,
                                            )
                                          }
                                          className="inline-flex items-center justify-center rounded-xl bg-warning min-h-control-sm px-3 py-2 text-xs font-semibold text-warning-foreground transition hover:bg-warning/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                                        >
                                          Save max attempts
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            void resetAttemptsUsed(
                                              roleplay,
                                              learner.id,
                                            )
                                          }
                                          className="inline-flex items-center justify-center rounded-xl border border-danger/30 bg-surface min-h-control-sm px-3 py-2 text-xs font-semibold text-danger-subtle-foreground transition hover:bg-danger-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                                        >
                                          Reset attempts used
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        )}

                        {courseAssessments.length === 0 ? (
                          <p className="mt-4 rounded-2xl bg-surface-sunken p-4 text-sm text-muted-foreground">
                            No users have completed this course exam yet.
                          </p>
                        ) : (
                          <div className="mt-4 overflow-x-auto">
                            <table className="w-full min-w-[980px] text-left text-sm">
                              <thead className="text-xs uppercase tracking-[0.16em] text-subtle-foreground">
                                <tr>
                                  <th className="border-b border-primary/20 px-3 py-3">
                                    User
                                  </th>
                                  <th className="border-b border-primary/20 px-3 py-3">
                                    Attempt
                                  </th>
                                  <th className="border-b border-primary/20 px-3 py-3">
                                    Email
                                  </th>
                                  <th className="border-b border-primary/20 px-3 py-3">
                                    Score
                                  </th>
                                  <th className="border-b border-primary/20 px-3 py-3">
                                    Outcome
                                  </th>
                                  <th className="border-b border-primary/20 px-3 py-3">
                                    Coach Feedback
                                  </th>
                                  <th className="border-b border-primary/20 px-3 py-3">
                                    Completed
                                  </th>
                                  <th className="border-b border-primary/20 px-3 py-3">
                                    Transcript
                                  </th>
                                  <th className="border-b border-primary/20 px-3 py-3">
                                    Review
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {courseAssessments.map((assessment) => (
                                  <tr
                                    key={assessment.id}
                                    className="text-muted-foreground"
                                  >
                                    <td className="border-b border-primary/20 px-3 py-3 font-semibold text-foreground">
                                      {learnerName(assessment)}
                                    </td>
                                    <td className="border-b border-primary/20 px-3 py-3 font-semibold">
                                      #
                                      {attemptNumberForAssessment(
                                        courseAssessments,
                                        assessment,
                                      )}
                                    </td>
                                    <td className="border-b border-primary/20 px-3 py-3">
                                      {assessment.learnerEmail ??
                                        "Not recorded"}
                                    </td>
                                    <td className="border-b border-primary/20 px-3 py-3 font-semibold">
                                      {assessment.overallScore}%
                                    </td>
                                    <td className="border-b border-primary/20 px-3 py-3">
                                      <span
                                        className={`rounded-full px-3 py-1 text-xs font-semibold ${outcomeClass(assessment.outcome)}`}
                                      >
                                        {assessment.outcome === "passed"
                                          ? "Passed"
                                          : "Needs Review"}
                                      </span>
                                    </td>
                                    <td className="border-b border-primary/20 px-3 py-3">
                                      <p className="line-clamp-2 max-w-sm text-xs leading-5 text-muted-foreground">
                                        {assessment.summary}
                                      </p>
                                    </td>
                                    <td className="border-b border-primary/20 px-3 py-3">
                                      {formatDate(assessment.createdAt)}
                                    </td>
                                    <td className="border-b border-primary/20 px-3 py-3">
                                      <a
                                        className="font-semibold text-primary hover:text-primary"
                                        href={`/api/assessments/${assessment.id}/transcript`}
                                      >
                                        Download
                                      </a>
                                    </td>
                                    <td className="border-b border-primary/20 px-3 py-3">
                                      <Link
                                        className="font-semibold text-primary hover:text-primary"
                                        href={`/assessment/${assessment.id}`}
                                      >
                                        Open
                                      </Link>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                );
              })
            )}
          </div>
        </section>
      )}

      {isCreateUserOpen && (
        <div className="fixed inset-0 z-overlay flex items-center justify-center bg-scrim/60 p-4">
          <form
            onSubmit={(event) => void createUser(event)}
            className="w-full max-w-lg rounded-3xl border border-border bg-surface p-6 shadow-2xl"
          >
            <p className="text-xs uppercase tracking-[0.24em] text-primary">
              Add User
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              Create account access
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Add a user to the table with a role and temporary password.
            </p>
            <div className="mt-5 space-y-4">
              <label className="block text-sm font-semibold text-muted-foreground">
                Full name
                <input
                  autoFocus
                  value={userForm.name}
                  onChange={(event) =>
                    setUserForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-2xl border border-border px-4 py-3 text-sm outline-none transition focus:border-primary"
                  placeholder="Jane Trainee"
                />
              </label>
              <label className="block text-sm font-semibold text-muted-foreground">
                Email
                <input
                  type="email"
                  value={userForm.email}
                  onChange={(event) =>
                    setUserForm((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-2xl border border-border px-4 py-3 text-sm outline-none transition focus:border-primary"
                  placeholder="jane@cse.local"
                />
              </label>
              <label className="block text-sm font-semibold text-muted-foreground">
                Position
                <input
                  value={userForm.position}
                  onChange={(event) =>
                    setUserForm((current) => ({
                      ...current,
                      position: event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-2xl border border-border px-4 py-3 text-sm outline-none transition focus:border-primary"
                  placeholder="Customer Support Engineer"
                />
              </label>
              <label className="block text-sm font-semibold text-muted-foreground">
                Role
                <select
                  value={userForm.role}
                  onChange={(event) =>
                    setUserForm((current) => ({
                      ...current,
                      role: event.target.value as AppRole,
                    }))
                  }
                  className="mt-2 w-full rounded-2xl border border-border px-4 py-3 text-sm outline-none transition focus:border-primary"
                >
                  <option value="trainee">Trainee</option>
                  <option value="course_admin">Course Admin</option>
                  <option value="root_admin">Root Admin</option>
                </select>
              </label>
              <label className="block text-sm font-semibold text-muted-foreground">
                Temporary Password
                <input
                  type="password"
                  value={userForm.password}
                  onChange={(event) =>
                    setUserForm((current) => ({
                      ...current,
                      password: event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-2xl border border-border px-4 py-3 text-sm outline-none transition focus:border-primary"
                  placeholder="At least 8 characters"
                />
              </label>
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCreateUserOpen(false)}
                className="inline-flex items-center justify-center rounded-2xl border border-border bg-surface min-h-control px-4 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-2xl bg-primary min-h-control px-4 py-2 text-sm font-semibold text-primary-foreground shadow-raised transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Create User
              </button>
            </div>
          </form>
        </div>
      )}

      {editDialog && (
        <div className="fixed inset-0 z-overlay flex items-center justify-center bg-scrim/60 p-4">
          <form
            onSubmit={(event) => void submitUserEdit(event)}
            className="w-full max-w-lg rounded-3xl border border-border bg-surface p-6 shadow-2xl"
          >
            <p className="text-xs uppercase tracking-[0.24em] text-primary">
              Edit User
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              User details
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Update the user's name, email, and role from the simplified table.
            </p>
            <div className="mt-5 space-y-4">
              <label className="block text-sm font-semibold text-muted-foreground">
                Full name
                <input
                  autoFocus
                  value={editDialog.name}
                  onChange={(event) =>
                    setEditDialog((current) =>
                      current
                        ? { ...current, name: event.target.value }
                        : current,
                    )
                  }
                  className="mt-2 w-full rounded-2xl border border-border px-4 py-3 text-sm outline-none transition focus:border-primary"
                />
              </label>
              <label className="block text-sm font-semibold text-muted-foreground">
                Email
                <input
                  type="email"
                  value={editDialog.email}
                  onChange={(event) =>
                    setEditDialog((current) =>
                      current
                        ? { ...current, email: event.target.value }
                        : current,
                    )
                  }
                  className="mt-2 w-full rounded-2xl border border-border px-4 py-3 text-sm outline-none transition focus:border-primary"
                />
              </label>
              <label className="block text-sm font-semibold text-muted-foreground">
                Position
                <input
                  value={editDialog.position}
                  onChange={(event) =>
                    setEditDialog((current) =>
                      current
                        ? { ...current, position: event.target.value }
                        : current,
                    )
                  }
                  className="mt-2 w-full rounded-2xl border border-border px-4 py-3 text-sm outline-none transition focus:border-primary"
                  placeholder="Customer Support Engineer"
                />
              </label>
              <label className="block text-sm font-semibold text-muted-foreground">
                Role
                <select
                  value={editDialog.role}
                  onChange={(event) =>
                    setEditDialog((current) =>
                      current
                        ? { ...current, role: event.target.value as AppRole }
                        : current,
                    )
                  }
                  className="mt-2 w-full rounded-2xl border border-border px-4 py-3 text-sm outline-none transition focus:border-primary"
                >
                  <option value="trainee">Trainee</option>
                  <option value="course_admin">Course Admin</option>
                  <option value="root_admin">Root Admin</option>
                </select>
              </label>
              <div className="rounded-2xl border border-border bg-surface-sunken p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-muted-foreground">
                      Account Status
                    </p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Inactive users are hidden from course assignment lists.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={editDialog.isActive}
                    onClick={() =>
                      setEditDialog((current) =>
                        current
                          ? { ...current, isActive: !current.isActive }
                          : current,
                      )
                    }
                    disabled={
                      editDialog.user.id === currentUser?.id &&
                      editDialog.isActive
                    }
                    className={`relative h-8 w-14 rounded-full transition ${
                      editDialog.isActive ? "bg-success" : "bg-border-strong"
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    <span
                      className={`absolute top-1 h-6 w-6 rounded-full bg-surface shadow transition ${
                        editDialog.isActive ? "left-7" : "left-1"
                      }`}
                    />
                  </button>
                </div>
                <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {editDialog.isActive ? "Active" : "Inactive"}
                </p>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap justify-between gap-2">
              <button
                type="button"
                onClick={() => setDeleteDialog(editDialog.user)}
                className="inline-flex items-center justify-center rounded-2xl border border-danger/30 bg-surface min-h-control px-4 py-2 text-sm font-semibold text-danger-subtle-foreground transition hover:bg-danger-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Delete User
              </button>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setEditDialog(null)}
                  className="inline-flex items-center justify-center rounded-2xl border border-border bg-surface min-h-control px-4 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-2xl bg-primary min-h-control px-4 py-2 text-sm font-semibold text-primary-foreground shadow-raised transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {deleteDialog && (
        <div className="fixed inset-0 z-overlay-top flex items-center justify-center bg-scrim/60 p-4">
          <div className="w-full max-w-md rounded-3xl border border-danger/30 bg-surface p-6 shadow-2xl">
            <p className="text-xs uppercase tracking-[0.24em] text-danger-subtle-foreground">
              Confirm Delete
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              Delete this user?
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              This will permanently remove{" "}
              <span className="font-semibold text-foreground">
                {deleteDialog.name}
              </span>{" "}
              from user management. This action cannot be undone.
            </p>
            <div className="mt-5 rounded-2xl border border-border bg-surface-sunken p-4 text-sm text-muted-foreground">
              <p className="font-semibold text-foreground">
                {deleteDialog.name}
              </p>
              <p className="mt-1">{deleteDialog.email}</p>
              <p className="mt-1">
                {deleteDialog.position || "No position set"}
              </p>
              <p className="mt-1">{roleLabel(deleteDialog.role)}</p>
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                disabled={isDeletingUser}
                onClick={() => setDeleteDialog(null)}
                className="inline-flex items-center justify-center rounded-2xl border border-border bg-surface min-h-control px-4 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingUser}
                onClick={() => void confirmDeleteUser()}
                className="inline-flex items-center justify-center rounded-2xl bg-danger min-h-control px-4 py-2 text-sm font-semibold text-danger-foreground shadow-raised transition hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                {isDeletingUser ? "Deleting..." : "Confirm Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
