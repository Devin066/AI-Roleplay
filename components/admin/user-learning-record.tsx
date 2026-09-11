"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { ChevronRightIcon } from "@/components/ui/icons";
import type { AssessmentScoreOverride } from "@/src/lib/assessments/types";
import type { SafeAuthUser } from "@/src/lib/auth/userStore";

type LearningRecordTab = "courses" | "assessments";

type AssignedCourse = {
  id: string;
  title: string;
  status: "draft" | "published";
  deadlineAt?: string;
  deadlineTimezone?: string;
  createdByName?: string;
};

type AssessmentSummary = {
  id: string;
  scenarioId: string;
  scenarioTitle: string;
  createdAt: string;
  overallScore: number;
  outcome: "passed" | "needs_review";
  summary: string;
  scoreOverride?: AssessmentScoreOverride;
};

type LearningRecordResponse = {
  user?: SafeAuthUser;
  courses?: AssignedCourse[];
  assessments?: AssessmentSummary[];
  error?: string;
};

function formatDate(value?: string) {
  if (!value) return "No deadline";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function roleLabel(role: SafeAuthUser["role"]) {
  if (role === "root_admin") return "Root Admin";
  if (role === "course_admin") return "Course Admin";
  return "Trainee";
}

export function UserLearningRecord() {
  const params = useParams<{ userId: string }>();
  const userId = params.userId;
  const [user, setUser] = useState<SafeAuthUser | null>(null);
  const [courses, setCourses] = useState<AssignedCourse[]>([]);
  const [assessments, setAssessments] = useState<AssessmentSummary[]>([]);
  const [activeTab, setActiveTab] = useState<LearningRecordTab>("courses");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  async function loadRecord() {
    if (!userId) return;

    setErrorMessage(null);
    const response = await fetch(
      `/api/admin/users/${encodeURIComponent(userId)}/learning-record`,
      { cache: "no-store" },
    );
    const payload = (await response.json().catch(() => ({}))) as LearningRecordResponse;

    if (!response.ok || !payload.user) {
      throw new Error(
        payload.error ?? `Unable to load the user learning record. HTTP ${response.status}.`,
      );
    }

    setUser(payload.user);
    setCourses(Array.isArray(payload.courses) ? payload.courses : []);
    setAssessments(Array.isArray(payload.assessments) ? payload.assessments : []);
  }

  useEffect(() => {
    void loadRecord()
      .catch((error) => {
        setErrorMessage(
          error instanceof Error ? error.message : "Unable to load the user learning record.",
        );
      })
      .finally(() => setLoading(false));
  }, [userId]);

  const assessmentStats = useMemo(() => {
    const finalScores = assessments.map(
      (assessment) => assessment.scoreOverride?.score ?? assessment.overallScore,
    );
    const average =
      finalScores.length === 0
        ? null
        : Math.round(
            finalScores.reduce((total, score) => total + score, 0) /
              finalScores.length,
          );
    const passed = assessments.filter(
      (assessment) =>
        (assessment.scoreOverride?.outcome ?? assessment.outcome) === "passed",
    ).length;

    return { average, passed };
  }, [assessments]);

  async function performAction(
    action: "remove_course_assignment" | "delete_assessment",
    resourceId: string,
    confirmation: string,
  ) {
    if (!user || !window.confirm(confirmation)) return;

    const actionKey = `${action}:${resourceId}`;
    setPendingAction(actionKey);
    setMessage(null);
    setErrorMessage(null);

    try {
      const response = await fetch(
        `/api/admin/users/${encodeURIComponent(user.id)}/learning-record`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            action === "remove_course_assignment"
              ? { action, rolePlayId: resourceId }
              : { action, assessmentId: resourceId },
          ),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? `Unable to update the user record. HTTP ${response.status}.`);
      }

      await loadRecord();
      setMessage(
        action === "remove_course_assignment"
          ? "Course assignment removed and the attempt allowance reset."
          : "Saved assessment deleted from this user record.",
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to update the user record.",
      );
    } finally {
      setPendingAction(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3" role="status" aria-live="polite">
        <div className="h-40 animate-pulse rounded-2xl bg-surface-sunken" />
        <div className="h-64 animate-pulse rounded-2xl bg-surface-sunken" />
        <span className="sr-only">Loading user learning record</span>
      </div>
    );
  }

  if (errorMessage && !user) {
    return (
      <div className="rounded-2xl border border-warning/30 bg-warning-subtle p-6 text-sm leading-6 text-warning-subtle-foreground">
        {errorMessage}
        <Link href="/control-panel/users" className="ml-2 font-semibold underline underline-offset-4">
          Back to User Management
        </Link>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="space-y-7">
      <header className="border-b border-border pb-6">
        <Link
          href="/control-panel/users"
          className="inline-flex min-h-control items-center gap-1.5 rounded-xl px-1 text-sm font-semibold text-muted-foreground transition duration-200 ease-out hover:text-primary"
        >
          <ChevronRightIcon className="h-4 w-4 rotate-180" />
          Back to User Management
        </Link>
        <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-4xl font-semibold tracking-tight text-foreground">
              User Learning Record
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
              Review this person&apos;s course access and saved assessment history without changing the course or their account.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant={user.isActive ? "success" : "neutral"} dot>
              {user.isActive ? "Active account" : "Inactive account"}
            </Badge>
            <Badge variant="outline">{roleLabel(user.role)}</Badge>
          </div>
        </div>
      </header>

      <section aria-labelledby="person-heading" className="border-b border-border pb-6">
        <h2 id="person-heading" className="text-2xl font-semibold tracking-tight text-foreground">
          {user.name}
        </h2>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
          <span>{user.email}</span>
          <span>{user.position || "No position recorded"}</span>
          <span>
            {courses.length} assigned course{courses.length === 1 ? "" : "s"}
          </span>
          <span>
            {assessments.length} assessment{assessments.length === 1 ? "" : "s"}
          </span>
        </div>
      </section>

      {(message || errorMessage) && (
        <div
          className={`rounded-2xl border p-4 text-sm leading-6 ${
            errorMessage
              ? "border-warning/30 bg-warning-subtle text-warning-subtle-foreground"
              : "border-success/30 bg-success-subtle text-success-subtle-foreground"
          }`}
          role="status"
        >
          {errorMessage ?? message}
        </div>
      )}

      <section aria-label="Learning record sections">
        <div role="tablist" aria-label="User learning record" className="flex border-b border-border">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "courses"}
            onClick={() => setActiveTab("courses")}
            className={`-mb-px min-h-control border-b-2 px-4 text-sm font-semibold transition duration-200 ease-out ${
              activeTab === "courses"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:border-border-strong hover:text-foreground"
            }`}
          >
            Assigned Courses <span className="ml-1 tabular">{courses.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "assessments"}
            onClick={() => setActiveTab("assessments")}
            className={`-mb-px min-h-control border-b-2 px-4 text-sm font-semibold transition duration-200 ease-out ${
              activeTab === "assessments"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:border-border-strong hover:text-foreground"
            }`}
          >
            Assessments <span className="ml-1 tabular">{assessments.length}</span>
          </button>
        </div>

        {activeTab === "courses" && (
          <div role="tabpanel" className="pt-5">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">Assigned courses</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  Removing an assignment stops this person from launching the course and clears their course-specific attempt allowance. Their saved assessments remain until removed separately.
                </p>
              </div>
            </div>

            {courses.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-dashed border-border-strong bg-surface-sunken/45 px-6 py-10 text-center">
                <h3 className="text-xl font-semibold tracking-tight text-foreground">No assigned courses</h3>
                <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-muted-foreground">
                  This user is not currently assigned to any roleplay course.
                </p>
              </div>
            ) : (
              <div className="mt-5 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
                {courses.map((course) => {
                  const pending = pendingAction === `remove_course_assignment:${course.id}`;

                  return (
                    <article key={course.id} className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-lg font-semibold text-foreground">{course.title}</h3>
                          <Badge variant={course.status === "published" ? "success" : "warning"} dot>
                            {course.status === "published" ? "Published" : "Draft"}
                          </Badge>
                        </div>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {course.deadlineAt
                            ? `Deadline: ${formatDate(course.deadlineAt)}${course.deadlineTimezone ? ` (${course.deadlineTimezone})` : ""}`
                            : "No deadline set"}
                          {course.createdByName ? ` · Created by ${course.createdByName}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <Link
                          href={`/course-builder/${course.id}/attempts`}
                          className="inline-flex min-h-control items-center justify-center rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition duration-200 ease-out hover:border-primary/40 hover:bg-primary-subtle hover:text-primary"
                        >
                          Open course
                        </Link>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            void performAction(
                              "remove_course_assignment",
                              course.id,
                              `Remove ${user.name} from "${course.title}"? This unassigns the course and resets its attempt allowance, but keeps saved assessment results.`,
                            )
                          }
                          className="inline-flex min-h-control items-center justify-center rounded-xl border border-danger/30 bg-surface px-4 py-2 text-sm font-semibold text-danger-subtle-foreground transition duration-200 ease-out hover:bg-danger-subtle disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {pending ? "Removing..." : "Remove assignment"}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === "assessments" && (
          <div role="tabpanel" className="pt-5">
            <div className="flex flex-col justify-between gap-3 border-b border-border pb-5 sm:flex-row sm:items-end">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">Saved assessments</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  Open an assessment for its evidence and transcript review. Deleting an assessment removes that saved assessment record from this user only.
                </p>
              </div>
              <p className="shrink-0 text-sm text-muted-foreground">
                <span className="font-semibold text-foreground tabular">{assessmentStats.average === null ? "N/A" : `${assessmentStats.average}%`}</span> average
                <span aria-hidden="true"> · </span>
                <span className="font-semibold text-foreground tabular">{assessmentStats.passed}</span> passed
              </p>
            </div>

            {assessments.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-dashed border-border-strong bg-surface-sunken/45 px-6 py-10 text-center">
                <h3 className="text-xl font-semibold tracking-tight text-foreground">No saved assessments</h3>
                <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-muted-foreground">
                  This user has not completed an assessed roleplay session yet.
                </p>
              </div>
            ) : (
              <div className="mt-5 overflow-hidden rounded-2xl border border-border bg-surface">
                <div className="overflow-x-auto surface-scrollbar">
                  <table className="w-full min-w-[800px] text-left text-sm">
                    <thead className="bg-surface-sunken text-xs font-semibold text-subtle-foreground">
                      <tr>
                        <th scope="col" className="px-5 py-3.5">Course</th>
                        <th scope="col" className="px-5 py-3.5">Final score</th>
                        <th scope="col" className="px-5 py-3.5">Completed</th>
                        <th scope="col" className="px-5 py-3.5"><span className="sr-only">Actions</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {assessments.map((assessment) => {
                        const score = assessment.scoreOverride?.score ?? assessment.overallScore;
                        const outcome = assessment.scoreOverride?.outcome ?? assessment.outcome;
                        const pending = pendingAction === `delete_assessment:${assessment.id}`;

                        return (
                          <tr key={assessment.id} className="transition duration-200 ease-out hover:bg-primary-subtle/35">
                            <td className="max-w-[360px] px-5 py-4">
                              <p className="truncate font-semibold text-foreground">{assessment.scenarioTitle}</p>
                              <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{assessment.summary}</p>
                              {assessment.scoreOverride && <p className="mt-1 text-xs text-info-subtle-foreground">Admin reviewed · AI {assessment.overallScore}%</p>}
                            </td>
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-foreground tabular">{score}%</span>
                                <Badge variant={outcome === "passed" ? "success" : "warning"} size="sm" dot>
                                  {outcome === "passed" ? "Passed" : "Review"}
                                </Badge>
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-5 py-4 text-muted-foreground">{formatDate(assessment.createdAt)}</td>
                            <td className="px-5 py-4 text-right">
                              <div className="flex justify-end gap-2">
                                <Link
                                  href={`/assessment/${assessment.id}?from=learning-record&userId=${encodeURIComponent(user.id)}`}
                                  className="inline-flex min-h-control-sm items-center gap-1 rounded-xl px-3 py-2 font-semibold text-primary transition duration-200 ease-out hover:bg-primary-subtle"
                                >
                                  Open
                                  <ChevronRightIcon className="h-4 w-4" />
                                </Link>
                                <button
                                  type="button"
                                  disabled={pending}
                                  onClick={() =>
                                    void performAction(
                                      "delete_assessment",
                                      assessment.id,
                                      `Delete the saved assessment for "${assessment.scenarioTitle}" from ${user.name}'s record? This cannot be undone.`,
                                    )
                                  }
                                  className="inline-flex min-h-control-sm items-center justify-center rounded-xl px-3 py-2 font-semibold text-danger-subtle-foreground transition duration-200 ease-out hover:bg-danger-subtle disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {pending ? "Deleting..." : "Delete"}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
