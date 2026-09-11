"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { AuthSessionUser } from "@/src/lib/auth/session";

type HealthStatus = "operational" | "attention";

type RootDashboardData = {
  kind: "root_admin";
  user: AuthSessionUser;
  metrics: {
    totalUsers: number;
    activeUsers: number;
    inactiveUsers: number;
    courseAdmins: number;
    trainees: number;
    totalCourses: number;
    publishedCourses: number;
    draftCourses: number;
    assessments: number;
    averageScore: number | null;
    passRate: number | null;
    attempts: number;
  };
  health: Array<{
    id: string;
    label: string;
    status: HealthStatus;
    detail: string;
    meta: string;
  }>;
  recentCourses: CourseSummary[];
  recentAssessments: Array<{
    id: string;
    title: string;
    learnerName: string;
    learnerEmail: string;
    score: number;
    outcome: "passed" | "needs_review";
    createdAt: string;
  }>;
  roleBreakdown: Array<{ label: string; value: number }>;
};

type LearnerDashboardData = {
  kind: "learner";
  user: AuthSessionUser;
  roleLabel: string;
  metrics: {
    assignedCourses: number;
    completedCourses: number;
    remainingCourses: number;
    assessments: number;
    averageScore: number | null;
    passed: number;
    createdCourses: number;
    publishedCreatedCourses: number;
  };
  assignedCourses: Array<
    CourseSummary & { completed: boolean; maxAttempts: number }
  >;
  createdCourses: CourseSummary[];
  recentAssessments: Array<{
    id: string;
    title: string;
    score: number;
    outcome: "passed" | "needs_review";
    summary: string;
    createdAt: string;
  }>;
};

type CourseSummary = {
  id: string;
  title: string;
  status: "draft" | "published";
  characterName: string;
  durationMinutes: number;
  assignedCount: number;
  ownerName: string;
  updatedAt?: string;
  scenario: string;
};

type DashboardData = RootDashboardData | LearnerDashboardData;

function formatDate(value?: string) {
  if (!value) return "Not recorded";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function formatNumber(value: number | null, suffix = "") {
  if (value === null) return "N/A";
  return `${new Intl.NumberFormat("en-US").format(value)}${suffix}`;
}

function statusTone(status: HealthStatus) {
  return status === "operational"
    ? "border-success/30 bg-success-subtle text-success-subtle-foreground"
    : "border-warning/30 bg-warning-subtle text-warning-subtle-foreground";
}

function ActivityChart({
  metrics,
}: {
  metrics: RootDashboardData["metrics"];
}) {
  const data = [
    { label: "Attempts", value: metrics.attempts, tone: "fill-primary" },
    { label: "Assessments", value: metrics.assessments, tone: "fill-info" },
    { label: "Courses", value: metrics.totalCourses, tone: "fill-success" },
    { label: "Active users", value: metrics.activeUsers, tone: "fill-warning" },
  ] as const;
  const maximum = Math.max(...data.map((item) => item.value), 1);

  return (
    <figure className="mt-6 rounded-xl bg-surface-sunken p-4 sm:p-5">
      <svg
        viewBox="0 0 620 230"
        className="h-56 w-full"
        role="img"
        aria-labelledby="activity-chart-title activity-chart-description"
      >
        <title id="activity-chart-title">Platform activity snapshot</title>
        <desc id="activity-chart-description">
          A relative comparison of saved learner attempts, final assessments,
          courses, and active users. Bar heights are scaled to the largest
          value in this snapshot.
        </desc>
        {[42, 89, 136, 183].map((position) => (
          <line
            key={position}
            x1="46"
            x2="596"
            y1={position}
            y2={position}
            className="stroke-border"
            strokeDasharray="3 7"
          />
        ))}
        {data.map((item, index) => {
          const height = Math.max(10, Math.round((item.value / maximum) * 148));
          const x = 74 + index * 138;
          const y = 183 - height;

          return (
            <g key={item.label}>
              <rect
                x={x}
                y={y}
                width="72"
                height={height}
                rx="10"
                className={`dashboard-chart-bar ${item.tone}`}
                style={{ "--motion-delay": `${index * 90}ms` } as React.CSSProperties}
              />
              <text
                x={x + 36}
                y="207"
                textAnchor="middle"
                className="fill-subtle-foreground text-[11px] font-medium"
              >
                {item.label}
              </text>
              <text
                x={x + 36}
                y={Math.max(24, y - 10)}
                textAnchor="middle"
                className="fill-foreground text-sm font-bold"
              >
                {formatNumber(item.value)}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-2 text-sm leading-6 text-muted-foreground">
        Snapshot of recorded workspace activity. Heights compare measures, not
        time periods.
      </figcaption>
    </figure>
  );
}

function MetricCard({
  label,
  value,
  helper,
  accent,
}: {
  label: string;
  value: string;
  helper: string;
  accent: string;
}) {
  return (
    <article className="rounded-xl bg-surface-raised p-5 shadow-soft ring-1 ring-border transition duration-slow ease-out hover:-translate-y-0.5 hover:shadow-raised">
      <p className="text-sm font-semibold text-muted-foreground">{label}</p>
      <p className="tabular mt-4 text-4xl font-bold tracking-tight text-foreground">
        {value}
      </p>
      <p className={`mt-2 text-sm font-semibold ${accent}`}>{helper}</p>
    </article>
  );
}

function DashboardError({ message }: { message: string }) {
  return (
    <section className="rounded-2xl border border-warning/30 bg-warning-subtle p-8 shadow-soft">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-warning-subtle-foreground">
        Dashboard unavailable
      </p>
      <h1 className="mt-3 text-2xl font-bold tracking-tight text-foreground">
        We could not load the dashboard.
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-warning-subtle-foreground">
        {message}
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mt-5 inline-flex items-center justify-center rounded-xl bg-panel min-h-control px-4 py-2 text-sm font-semibold text-panel-foreground transition hover:bg-panel/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        Try again
      </button>
    </section>
  );
}

function LoadingDashboard() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {[0, 1, 2, 3, 4, 5].map((item) => (
        <div
          key={item}
          className="h-28 animate-pulse rounded-xl border border-border bg-surface"
        />
      ))}
    </div>
  );
}

function RootAdminDashboard({ data }: { data: RootDashboardData }) {
  const criticalHealth = data.health.filter(
    (item) => item.status !== "operational",
  ).length;

  return (
    <div className="-m-4 space-y-6 bg-surface-sunken p-4 text-foreground sm:-m-6 sm:p-6 lg:-m-8 lg:p-8">
      <header className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Root Admin Dashboard
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            A focused view of learning activity, workspace readiness, and the
            actions that need attention.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/control-panel/users"
            className="inline-flex items-center justify-center rounded-lg border border-border bg-surface min-h-control px-4 py-2 text-sm font-semibold text-muted-foreground shadow-sm transition hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            User Management
          </Link>
          <Link
            href="/course-builder/new"
            className="inline-flex items-center justify-center rounded-lg bg-primary min-h-control px-4 py-2 text-sm font-semibold text-primary-foreground shadow-raised transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            + Create Course
          </Link>
        </div>
      </header>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(20rem,0.75fr)]">
        <article className="rounded-xl bg-surface p-5 shadow-raised ring-1 ring-border sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                Learning activity
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                Compare the current workspace totals to understand where the
                learning operation has the most volume.
              </p>
            </div>
            <div className="rounded-lg bg-primary-subtle px-3 py-2 text-sm font-semibold text-primary">
              <span className="tabular text-lg font-bold">
                {formatNumber(data.metrics.attempts + data.metrics.assessments)}
              </span>{" "}
              records
            </div>
          </div>
          <ActivityChart metrics={data.metrics} />
        </article>

        <article className="overflow-hidden rounded-xl bg-surface shadow-soft ring-1 ring-border">
          <div className="flex items-center justify-between gap-4 border-b border-border p-5">
            <div>
              <h2 className="font-bold text-foreground">System Health</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {criticalHealth === 0
                  ? "No configuration blockers"
                  : `${criticalHealth} item${criticalHealth === 1 ? "" : "s"} needs attention`}
              </p>
            </div>
            <span
              className={`rounded-full border px-2.5 py-1 text-xs font-bold ${criticalHealth === 0 ? statusTone("operational") : statusTone("attention")}`}
            >
              {criticalHealth === 0 ? "Ready" : "Review"}
            </span>
          </div>
          <div className="divide-y divide-border">
            {data.health.map((item) => (
              <div key={item.id} className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-foreground">
                      {item.label}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {item.detail}
                    </p>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-[0.14em] text-subtle-foreground">
                      {item.meta}
                    </p>
                  </div>
                  <span
                    className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusTone(item.status)}`}
                  >
                    {item.status === "operational" ? "OK" : "Check"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard
          label="People learning"
          value={formatNumber(data.metrics.totalUsers)}
          helper={`${data.metrics.activeUsers} active · ${data.metrics.inactiveUsers} inactive`}
          accent="text-success-subtle-foreground"
        />
        <MetricCard
          label="Course catalogue"
          value={formatNumber(data.metrics.totalCourses)}
          helper={`${data.metrics.publishedCourses} published · ${data.metrics.draftCourses} drafts`}
          accent="text-primary"
        />
        <MetricCard
          label="Assessment quality"
          value={formatNumber(data.metrics.passRate, "%")}
          helper={`Average score ${formatNumber(data.metrics.averageScore, "%")}`}
          accent="text-warning-subtle-foreground"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <article className="rounded-xl bg-surface p-5 shadow-soft ring-1 ring-border">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="font-bold text-foreground">Role Breakdown</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Current workspace membership
              </p>
            </div>
            <span className="tabular text-sm font-bold text-foreground">
              {formatNumber(data.metrics.totalUsers)} total
            </span>
          </div>
          <div className="mt-5 space-y-4">
            {data.roleBreakdown.map((item, index) => {
              const total = Math.max(1, data.metrics.totalUsers);
              const width = Math.max(6, Math.round((item.value / total) * 100));
              const colors = ["bg-success", "bg-primary/70", "bg-warning"];
              return (
                <div key={item.label}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-muted-foreground">
                      {item.label}
                    </span>
                    <span className="font-bold text-foreground">
                      {item.value}
                    </span>
                  </div>
                  <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={`dashboard-progress-fill h-full rounded-full ${colors[index]}`}
                      style={
                        {
                          "--fill-width": `${width}%`,
                          "--motion-delay": `${index * 100}ms`,
                        } as React.CSSProperties
                      }
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </article>

        <article className="rounded-xl bg-surface p-5 shadow-soft ring-1 ring-border">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-bold text-foreground">Recent Assessments</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Latest recorded final assessments
              </p>
            </div>
            <Link
              href="/assessment"
              className="text-sm font-semibold text-primary hover:text-primary"
            >
              View all
            </Link>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.14em] text-subtle-foreground">
                <tr>
                  <th className="border-b border-border py-3">Learner</th>
                  <th className="border-b border-border py-3">Course</th>
                  <th className="border-b border-border py-3">Score</th>
                  <th className="border-b border-border py-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {data.recentAssessments.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="py-8 text-center text-muted-foreground"
                    >
                      No assessments yet.
                    </td>
                  </tr>
                ) : (
                  data.recentAssessments.map((assessment) => (
                    <tr key={assessment.id} className="text-muted-foreground">
                      <td className="border-b border-border py-3 font-semibold text-foreground">
                        {assessment.learnerName}
                      </td>
                      <td className="border-b border-border py-3">
                        {assessment.title}
                      </td>
                      <td className="border-b border-border py-3 font-bold text-foreground">
                        {assessment.score}%
                      </td>
                      <td className="border-b border-border py-3">
                        {formatDate(assessment.createdAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </div>
  );
}

function LearnerStatCard({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: string;
  helper: string;
  tone: "blue" | "emerald" | "amber" | "slate";
}) {
  const tones = {
    blue: "from-primary-subtle to-surface text-primary ring-ring/30",
    emerald:
      "from-success-subtle to-surface text-success-subtle-foreground ring-success/30",
    amber:
      "from-warning-subtle to-surface text-warning-subtle-foreground ring-warning/30",
    slate: "from-muted to-surface text-muted-foreground ring-border",
  };

  return (
    <article
      className={`rounded-3xl bg-gradient-to-br p-5 shadow-soft ring-1 ${tones[tone]}`}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-70">
        {label}
      </p>
      <p className="mt-4 text-3xl font-semibold tracking-tight text-foreground">
        {value}
      </p>
      <p className="mt-2 text-sm font-medium opacity-80">{helper}</p>
    </article>
  );
}

function LearnerDashboard({ data }: { data: LearnerDashboardData }) {
  const completionRate = useMemo(() => {
    if (data.metrics.assignedCourses === 0) return null;
    return Math.round(
      (data.metrics.completedCourses / data.metrics.assignedCourses) * 100,
    );
  }, [data.metrics.assignedCourses, data.metrics.completedCourses]);
  const latestAssessment = data.recentAssessments[0];
  const nextCourse =
    data.assignedCourses.find((course) => !course.completed) ??
    data.assignedCourses[0];

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-primary/20 bg-hero-grid p-6 shadow-soft sm:p-8">
        <div className="grid gap-8 xl:grid-cols-[1.2fr_0.8fr] xl:items-center">
          <div>
            <span className="inline-flex rounded-full bg-primary-subtle px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary ring-1 ring-ring/30">
              {data.roleLabel} Learning Dashboard
            </span>
            <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight text-foreground">
              Welcome back, {data.user.name}.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">
              Focus on assigned roleplay courses, review your latest coaching
              feedback, and keep your training momentum visible without the
              root-admin operations view.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/courses"
                className="inline-flex items-center justify-center rounded-2xl bg-primary min-h-control px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-raised transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Start Assigned Course
              </Link>
              <Link
                href="/assessment"
                className="inline-flex items-center justify-center rounded-2xl border border-primary/20 bg-surface min-h-control px-5 py-2.5 text-sm font-semibold text-muted-foreground shadow-soft transition hover:bg-primary-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Review Assessments
              </Link>
              {data.user.role === "course_admin" && (
                <Link
                  href="/course-builder/new"
                  className="inline-flex items-center justify-center rounded-2xl border border-border bg-surface min-h-control px-5 py-2.5 text-sm font-semibold text-muted-foreground shadow-soft transition hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  Create Roleplay
                </Link>
              )}
            </div>
          </div>

          <div className="rounded-[2rem] border border-border bg-surface/85 p-5 shadow-soft backdrop-blur">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Training progress
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Complete a course to move your learning path forward.
                </p>
              </div>
              <span className="tabular text-3xl font-bold tracking-tight text-primary">
                {formatNumber(completionRate, "%")}
              </span>
            </div>
            <div
              className="mt-5 h-3 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-label="Course completion"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={completionRate ?? 0}
            >
              <div
                className="dashboard-progress-fill h-full rounded-full bg-primary"
                style={
                  {
                    "--fill-width": `${completionRate ?? 0}%`,
                    "--motion-delay": "120ms",
                  } as React.CSSProperties
                }
              />
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {data.metrics.completedCourses} completed out of{" "}
              {data.metrics.assignedCourses} assigned courses.
            </p>
            {nextCourse && (
              <div className="mt-5 rounded-2xl bg-primary-subtle/80 p-4 ring-1 ring-ring/30">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                  Next up
                </p>
                <p className="mt-2 font-semibold text-foreground">
                  {nextCourse.title}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {nextCourse.durationMinutes} min with{" "}
                  {nextCourse.characterName}
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <LearnerStatCard
          label="Assigned"
          value={formatNumber(data.metrics.assignedCourses)}
          helper={`${data.metrics.remainingCourses} still open`}
          tone="blue"
        />
        <LearnerStatCard
          label="Completed"
          value={formatNumber(data.metrics.completedCourses)}
          helper="Courses finished"
          tone="emerald"
        />
        <LearnerStatCard
          label="Average Score"
          value={formatNumber(data.metrics.averageScore, "%")}
          helper={`${data.metrics.assessments} assessments`}
          tone="amber"
        />
        <LearnerStatCard
          label={data.user.role === "course_admin" ? "Created" : "Passed"}
          value={formatNumber(
            data.user.role === "course_admin"
              ? data.metrics.createdCourses
              : data.metrics.passed,
          )}
          helper={
            data.user.role === "course_admin"
              ? `${data.metrics.publishedCreatedCourses} published`
              : "Final assessments passed"
          }
          tone="slate"
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <article className="rounded-3xl border border-primary/20 bg-surface p-6 shadow-soft">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                Assigned Practice
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                Roleplay courses
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Start a course or revisit a completed simulation for practice.
              </p>
            </div>
            <Link
              href="/courses"
              className="text-sm font-semibold text-primary hover:text-primary"
            >
              View all
            </Link>
          </div>

          <div className="mt-6 grid gap-4">
            {data.assignedCourses.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-primary/20 bg-primary-subtle/60 p-8 text-center text-sm text-muted-foreground">
                No assigned roleplay courses yet.
              </div>
            ) : (
              data.assignedCourses.map((course) => (
                <article
                  key={course.id}
                  className="rounded-3xl border border-primary/20 bg-primary-subtle/40 p-4 transition hover:bg-primary-subtle"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-foreground">
                          {course.title}
                        </h3>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${course.completed ? "bg-success-subtle text-success-subtle-foreground ring-1 ring-success/30" : "bg-surface text-primary ring-1 ring-ring/30"}`}
                        >
                          {course.completed ? "Completed" : "Ready"}
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-medium text-primary">
                        {course.characterName} · {course.durationMinutes} min ·{" "}
                        {course.maxAttempts} max attempts
                      </p>
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
                        {course.scenario}
                      </p>
                    </div>
                    <Link
                      href={`/roleplays/${course.id}/session`}
                      className="shrink-0 inline-flex items-center justify-center rounded-2xl bg-primary min-h-control px-4 py-2 text-center text-sm font-semibold text-primary-foreground shadow-raised transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      {course.completed ? "Practice Again" : "Start"}
                    </Link>
                  </div>
                </article>
              ))
            )}
          </div>
        </article>

        <article className="rounded-3xl border border-primary/20 bg-surface p-6 shadow-soft">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Latest Feedback
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            Final assessment
          </h2>
          {!latestAssessment ? (
            <div className="mt-6 rounded-3xl border border-dashed border-primary/20 bg-primary-subtle/60 p-6 text-sm leading-6 text-muted-foreground">
              Complete a roleplay session to generate your first final
              assessment.
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              <div className="panel-surface rounded-3xl border border-panel-border p-5 shadow-soft">
                <p className="text-sm font-semibold text-panel-muted-foreground">
                  {latestAssessment.title}
                </p>
                <p className="mt-4 text-5xl font-semibold">
                  {latestAssessment.score}%
                </p>
                <p className="mt-2 text-xs uppercase tracking-[0.16em] text-subtle-foreground">
                  {formatDate(latestAssessment.createdAt)}
                </p>
                <p className="mt-4 text-sm leading-6 text-subtle-foreground">
                  {latestAssessment.summary}
                </p>
              </div>
              <Link
                href={`/assessment/${latestAssessment.id}`}
                className="inline-flex w-full justify-center rounded-2xl bg-primary min-h-control px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-raised transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Open Assessment
              </Link>
            </div>
          )}
        </article>
      </section>

      {data.user.role === "course_admin" && (
        <section className="rounded-3xl border border-primary/20 bg-surface p-6 shadow-soft">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                Creator Workspace
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                Your created courses
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Course admins can create simulations and take courses assigned
                by other admins.
              </p>
            </div>
            <Link
              href="/course-builder"
              className="text-sm font-semibold text-primary hover:text-primary"
            >
              Manage
            </Link>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {data.createdCourses.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-primary/20 bg-primary-subtle/60 p-6 text-sm text-muted-foreground md:col-span-2">
                No created courses yet.
              </div>
            ) : (
              data.createdCourses.map((course) => (
                <article
                  key={course.id}
                  className="rounded-3xl border border-primary/20 bg-primary-subtle/40 p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-semibold text-foreground">
                        {course.title}
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {course.assignedCount} assigned · Updated{" "}
                        {formatDate(course.updatedAt)}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${course.status === "published" ? "bg-success-subtle text-success-subtle-foreground ring-1 ring-success/30" : "bg-warning-subtle text-warning-subtle-foreground ring-1 ring-warning/30"}`}
                    >
                      {course.status === "published" ? "Published" : "Draft"}
                    </span>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      )}
    </div>
  );
}

export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/dashboard", { cache: "no-store" });
        const payload = (await response
          .json()
          .catch(() => ({}))) as Partial<DashboardData> & {
          error?: string;
          message?: string;
        };

        if (!response.ok) {
          throw new Error(
            payload.message ??
              payload.error ??
              `Unable to load dashboard. HTTP ${response.status}.`,
          );
        }

        setData(payload as DashboardData);
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Unable to load dashboard.",
        );
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  if (isLoading) return <LoadingDashboard />;
  if (errorMessage) return <DashboardError message={errorMessage} />;
  if (!data) return <DashboardError message="Dashboard data was empty." />;

  return data.kind === "root_admin" ? (
    <RootAdminDashboard data={data} />
  ) : (
    <LearnerDashboard data={data} />
  );
}
