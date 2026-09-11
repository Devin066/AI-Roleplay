"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { ChevronRightIcon } from "@/components/ui/icons";
import {
  effectiveAssessmentOutcome,
  effectiveAssessmentScore,
  type SavedFinalAssessment,
} from "@/src/lib/assessments/types";

type AssessmentScope = "mine" | "learners";

type AssessmentResponse = {
  assessments?: SavedFinalAssessment[];
  error?: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function outcomeVariant(outcome: SavedFinalAssessment["outcome"]) {
  return outcome === "passed" ? "success" : "warning";
}

function learnerLabel(assessment: SavedFinalAssessment) {
  return assessment.learnerName || assessment.learnerEmail || "Unknown learner";
}

function attemptNumber(
  assessments: SavedFinalAssessment[],
  assessment: SavedFinalAssessment,
) {
  return (
    assessments
      .filter(
        (candidate) =>
          candidate.scenarioId === assessment.scenarioId &&
          ((candidate.learnerId && candidate.learnerId === assessment.learnerId) ||
            (!candidate.learnerId &&
              candidate.learnerEmail === assessment.learnerEmail)),
      )
      .sort((first, second) => first.createdAt.localeCompare(second.createdAt))
      .findIndex((candidate) => candidate.id === assessment.id) + 1
  );
}

export function FinalAssessmentsList({
  initialScope,
}: {
  initialScope: AssessmentScope;
}) {
  const [assessments, setAssessments] = useState<SavedFinalAssessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;

    void (async () => {
      setLoading(true);
      setErrorMessage(null);

      try {
        const response = await fetch(`/api/assessments?scope=${initialScope}`, {
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => ({}))) as AssessmentResponse;

        if (!response.ok) {
          throw new Error(
            payload.error ?? `Unable to load assessment results. HTTP ${response.status}.`,
          );
        }

        if (!isCurrent) return;
        setAssessments(Array.isArray(payload.assessments) ? payload.assessments : []);
      } catch (error) {
        if (!isCurrent) return;
        setErrorMessage(
          error instanceof Error ? error.message : "Unable to load assessment results.",
        );
      } finally {
        if (isCurrent) setLoading(false);
      }
    })();

    return () => {
      isCurrent = false;
    };
  }, [initialScope]);

  const stats = useMemo(() => {
    const completed = assessments.length;
    const passed = assessments.filter(
      (assessment) => effectiveAssessmentOutcome(assessment) === "passed",
    ).length;
    const reviewed = assessments.filter((assessment) => assessment.scoreOverride).length;
    const averageScore =
      completed === 0
        ? null
        : Math.round(
            assessments.reduce(
              (total, assessment) => total + effectiveAssessmentScore(assessment),
              0,
            ) / completed,
          );

    return { averageScore, completed, passed, reviewed };
  }, [assessments]);

  const isLearnerReview = initialScope === "learners";
  const title = isLearnerReview ? "My Learners' Results" : "My Results";
  const description = isLearnerReview
    ? "Review results from learners assigned to the courses you manage. Open any result to inspect evidence, coaching, transcripts, or apply an optional score override."
    : "Your completed roleplay exams live here, including courses assigned to you by another course admin.";

  return (
    <div className="space-y-7">
      <header className="border-b border-border pb-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <h1 className="text-4xl font-semibold tracking-tight text-foreground">
              Assessment Results
            </h1>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              Keep your own learning record distinct from the assessment work you
              do for others.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/courses"
              className="inline-flex min-h-control items-center justify-center rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-raised transition duration-200 ease-out hover:bg-primary-hover"
            >
              Start assigned course
            </Link>
            <Link
              href="/"
              className="inline-flex min-h-control items-center justify-center rounded-2xl border border-border bg-surface px-5 py-2.5 text-sm font-semibold text-muted-foreground transition duration-200 ease-out hover:bg-surface-sunken"
            >
              Dashboard
            </Link>
          </div>
        </div>

      </header>

      <section aria-labelledby="results-heading">
        <div className="flex flex-col justify-between gap-4 border-b border-border pb-5 sm:flex-row sm:items-end">
          <div className="max-w-3xl">
            <h2 id="results-heading" className="text-2xl font-semibold tracking-tight text-foreground">
              {title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
          {!loading && !errorMessage && (
            <p className="shrink-0 text-sm text-muted-foreground">
              <span className="font-semibold text-foreground tabular">{stats.completed}</span> results
              <span aria-hidden="true"> · </span>
              <span className="font-semibold text-foreground tabular">
                {stats.averageScore === null ? "N/A" : `${stats.averageScore}%`}
              </span>{" "}
              average
              <span aria-hidden="true"> · </span>
              <span className="font-semibold text-foreground tabular">{stats.passed}</span> passed
            </p>
          )}
        </div>

        {loading && (
          <div className="mt-5 space-y-3" role="status" aria-live="polite">
            <div className="h-24 animate-pulse rounded-2xl bg-surface-sunken" />
            <div className="h-24 animate-pulse rounded-2xl bg-surface-sunken" />
            <span className="sr-only">Loading assessment results</span>
          </div>
        )}

        {errorMessage && (
          <div className="mt-5 rounded-2xl border border-warning/30 bg-warning-subtle p-5 text-sm leading-6 text-warning-subtle-foreground">
            {errorMessage}
            {isLearnerReview && (
              <Link href="/assessment" className="ml-2 font-semibold underline underline-offset-4">
                View my results instead
              </Link>
            )}
          </div>
        )}

        {!loading && !errorMessage && assessments.length === 0 && (
          <div className="mt-5 rounded-2xl border border-dashed border-border-strong bg-surface-sunken/45 px-6 py-10 text-center">
            <h3 className="text-xl font-semibold tracking-tight text-foreground">
              {isLearnerReview ? "No learner results yet" : "No personal results yet"}
            </h3>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-muted-foreground">
              {isLearnerReview
                ? "Results will appear after a learner completes an assigned roleplay course that you manage."
                : "Complete an assigned roleplay course and your AI-scored assessment will appear here."}
            </p>
            {!isLearnerReview && (
              <Link
                href="/courses"
                className="mt-6 inline-flex min-h-control items-center justify-center rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-raised transition duration-200 ease-out hover:bg-primary-hover"
              >
                View assigned courses
              </Link>
            )}
          </div>
        )}

        {!loading && !errorMessage && assessments.length > 0 && !isLearnerReview && (
          <div className="mt-5 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
            {assessments.map((assessment) => {
              const score = effectiveAssessmentScore(assessment);
              const outcome = effectiveAssessmentOutcome(assessment);

              return (
                <article key={assessment.id} className="group grid gap-4 p-5 transition duration-200 ease-out hover:bg-primary-subtle/35 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
                  <div className="min-w-[5rem] rounded-xl bg-surface-sunken px-3 py-2.5 text-center tabular">
                    <p className="text-2xl font-semibold tracking-tight text-foreground">{score}%</p>
                    <p className="mt-0.5 text-xs font-medium text-muted-foreground">final score</p>
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-foreground">{assessment.scenarioTitle}</h3>
                      <Badge variant={outcomeVariant(outcome)} dot>{outcome === "passed" ? "Passed" : "Needs review"}</Badge>
                      {assessment.scoreOverride && <Badge variant="info">Admin reviewed</Badge>}
                    </div>
                    <p className="mt-1.5 text-sm text-muted-foreground">Completed {formatDate(assessment.createdAt)}</p>
                    <p className="mt-2 line-clamp-2 max-w-3xl text-sm leading-6 text-muted-foreground">{assessment.summary}</p>
                    {assessment.scoreOverride && (
                      <p className="mt-2 text-xs text-info-subtle-foreground">AI score: {assessment.overallScore}% · Reviewed by {assessment.scoreOverride.overriddenBy.name}</p>
                    )}
                  </div>
                  <Link
                    href={`/assessment/${assessment.id}`}
                    className="inline-flex min-h-control items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-4 py-2 text-sm font-semibold text-foreground transition duration-200 ease-out hover:border-primary/40 hover:bg-primary-subtle group-hover:text-primary"
                  >
                    Open result
                    <ChevronRightIcon className="h-4 w-4" />
                  </Link>
                </article>
              );
            })}
          </div>
        )}

        {!loading && !errorMessage && assessments.length > 0 && isLearnerReview && (
          <div className="mt-5 overflow-hidden rounded-2xl border border-border bg-surface">
            <div className="overflow-x-auto surface-scrollbar">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="bg-surface-sunken text-xs font-semibold text-subtle-foreground">
                  <tr>
                    <th scope="col" className="px-5 py-3.5">Learner</th>
                    <th scope="col" className="px-5 py-3.5">Course</th>
                    <th scope="col" className="px-5 py-3.5">Attempt</th>
                    <th scope="col" className="px-5 py-3.5">Final score</th>
                    <th scope="col" className="px-5 py-3.5">Completed</th>
                    <th scope="col" className="px-5 py-3.5"><span className="sr-only">Open result</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {assessments.map((assessment) => {
                    const score = effectiveAssessmentScore(assessment);
                    const outcome = effectiveAssessmentOutcome(assessment);

                    return (
                      <tr key={assessment.id} className="transition duration-200 ease-out hover:bg-primary-subtle/35">
                        <td className="px-5 py-4">
                          <p className="font-semibold text-foreground">{learnerLabel(assessment)}</p>
                          {assessment.learnerEmail && <p className="mt-1 text-xs text-muted-foreground">{assessment.learnerEmail}</p>}
                        </td>
                        <td className="max-w-[250px] px-5 py-4">
                          <p className="truncate font-medium text-foreground">{assessment.scenarioTitle}</p>
                          {assessment.scoreOverride && <p className="mt-1 text-xs text-info-subtle-foreground">Admin reviewed · AI {assessment.overallScore}%</p>}
                        </td>
                        <td className="px-5 py-4 text-muted-foreground tabular">Attempt {attemptNumber(assessments, assessment)}</td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-foreground tabular">{score}%</span>
                            <Badge variant={outcomeVariant(outcome)} size="sm" dot>{outcome === "passed" ? "Passed" : "Review"}</Badge>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 text-muted-foreground">{formatDate(assessment.createdAt)}</td>
                        <td className="px-5 py-4 text-right">
                          <Link
                            href={`/assessment/${assessment.id}?from=learners`}
                            className="inline-flex min-h-control-sm items-center gap-1 rounded-xl px-3 py-2 font-semibold text-primary transition duration-200 ease-out hover:bg-primary-subtle"
                          >
                            Review
                            <ChevronRightIcon className="h-4 w-4" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {stats.reviewed > 0 && (
              <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
                {stats.reviewed} result{stats.reviewed === 1 ? " has" : "s have"} an admin score review. The final score is shown above; the original AI score remains visible for context.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
