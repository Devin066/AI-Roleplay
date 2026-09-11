"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { ChevronRightIcon } from "@/components/ui/icons";
import { groupTranscriptTurns } from "@/src/lib/assessments/transcriptTurns";
import type {
  CoachTurnFeedback,
  SavedFinalAssessment,
} from "@/src/lib/assessments/types";
import {
  effectiveAssessmentOutcome,
  effectiveAssessmentScore,
} from "@/src/lib/assessments/types";
import type { AuthSessionUser } from "@/src/lib/auth/session";
import { canUserManageRolePlay } from "@/src/lib/roleplays/access";
import type { RolePlayConfig } from "@/src/lib/roleplays/types";

export default function FinalAssessmentDetailPage() {
  const params = useParams<{ assessmentId: string }>();
  const searchParams = useSearchParams();
  const assessmentId = params.assessmentId;
  const [assessment, setAssessment] = useState<SavedFinalAssessment | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [coachFeedbackByTurnId, setCoachFeedbackByTurnId] = useState<
    Record<string, CoachTurnFeedback>
  >({});
  const [coachErrorByTurnId, setCoachErrorByTurnId] = useState<
    Record<string, string>
  >({});
  const [coachLoadingTurnId, setCoachLoadingTurnId] = useState<string | null>(
    null,
  );
  const [canDownloadTranscript, setCanDownloadTranscript] = useState(false);
  const [overrideScoreDraft, setOverrideScoreDraft] = useState("");
  const [overrideReasonDraft, setOverrideReasonDraft] = useState("");
  const [isSavingOverride, setIsSavingOverride] = useState(false);
  const [overrideMessage, setOverrideMessage] = useState<string | null>(null);

  const transcriptTurns = useMemo(
    () => (assessment ? groupTranscriptTurns(assessment.transcript) : []),
    [assessment],
  );

  useEffect(() => {
    if (!assessmentId) {
      setLoading(false);
      setErrorMessage("Assessment id is required.");
      return;
    }

    setCanDownloadTranscript(false);
    setErrorMessage(null);
    setLoading(true);

    void (async () => {
      try {
        const response = await fetch(`/api/assessments/${assessmentId}`, {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(
            `Unable to load final assessment. HTTP ${response.status}.`,
          );
        }

        const nextAssessment = (await response.json()) as SavedFinalAssessment;
        setAssessment(nextAssessment);
        setOverrideScoreDraft(String(nextAssessment.scoreOverride?.score ?? nextAssessment.overallScore));
        setOverrideReasonDraft(nextAssessment.scoreOverride?.reason ?? "");
        setCanDownloadTranscript(
          await canCurrentUserDownloadTranscript(nextAssessment),
        );
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load final assessment.",
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [assessmentId]);

  async function canCurrentUserDownloadTranscript(
    nextAssessment: SavedFinalAssessment,
  ) {
    const sessionResponse = await fetch("/api/auth/session", {
      cache: "no-store",
    });
    const sessionPayload = sessionResponse.ok
      ? ((await sessionResponse.json()) as { user?: AuthSessionUser })
      : {};
    const sessionUser = sessionPayload.user ?? null;

    if (!sessionUser) {
      return false;
    }

    if (sessionUser.role === "root_admin") {
      return true;
    }

    const roleplayResponse = await fetch(
      `/api/roleplays/${nextAssessment.scenarioId}`,
      {
        cache: "no-store",
      },
    );
    const roleplayPayload = roleplayResponse.ok
      ? ((await roleplayResponse.json()) as { roleplay?: RolePlayConfig })
      : {};

    return Boolean(
      roleplayPayload.roleplay &&
      canUserManageRolePlay(sessionUser, roleplayPayload.roleplay),
    );
  }

  async function loadCoachFeedback(turnId: string) {
    if (!assessment || coachFeedbackByTurnId[turnId] || coachLoadingTurnId) {
      return;
    }

    setCoachLoadingTurnId(turnId);
    setCoachErrorByTurnId((current) => {
      const next = { ...current };
      delete next[turnId];
      return next;
    });

    try {
      const response = await fetch("/api/assessments/coach-turn", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          assessmentId: assessment.id,
          turnId,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          payload?.error ??
            `Coach feedback failed with HTTP ${response.status}.`,
        );
      }

      const feedback = (await response.json()) as CoachTurnFeedback;
      setCoachFeedbackByTurnId((current) => ({
        ...current,
        [turnId]: feedback,
      }));
    } catch (error) {
      setCoachErrorByTurnId((current) => ({
        ...current,
        [turnId]:
          error instanceof Error
            ? error.message
            : "Unable to generate coach feedback.",
      }));
    } finally {
      setCoachLoadingTurnId(null);
    }
  }

  async function saveScoreOverride(clear = false) {
    if (!assessment) return;

    setIsSavingOverride(true);
    setOverrideMessage(null);
    try {
      const response = await fetch(`/api/assessments/${assessment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          clear
            ? { clear: true }
            : {
                score: Number(overrideScoreDraft),
                reason: overrideReasonDraft,
              },
        ),
      });
      const payload = (await response.json().catch(() => null)) as
        | SavedFinalAssessment
        | { error?: string }
        | null;
      if (!response.ok || !payload || !("overallScore" in payload)) {
        throw new Error(
          payload && "error" in payload && payload.error
            ? payload.error
            : `Unable to save the grade. HTTP ${response.status}.`,
        );
      }

      setAssessment(payload);
      setOverrideScoreDraft(String(payload.scoreOverride?.score ?? payload.overallScore));
      setOverrideReasonDraft(payload.scoreOverride?.reason ?? "");
      setOverrideMessage(clear ? "AI score restored." : "Course-admin grade saved.");
    } catch (error) {
      setOverrideMessage(
        error instanceof Error ? error.message : "Unable to save the grade.",
      );
    } finally {
      setIsSavingOverride(false);
    }
  }

  if (loading) {
    return (
      <div className="text-sm text-muted-foreground">
        Loading final assessment...
      </div>
    );
  }

  if (errorMessage || !assessment) {
    return (
      <div className="rounded-3xl border border-warning/30 bg-warning-subtle p-6 text-sm text-warning-subtle-foreground shadow-soft">
        {errorMessage ?? "Final assessment not found."}
      </div>
    );
  }

  const finalScore = effectiveAssessmentScore(assessment);
  const finalOutcome = effectiveAssessmentOutcome(assessment);
  const returnToLearnerResults = searchParams.get("from") === "learners";
  const learningRecordUserId = searchParams.get("userId");
  const returnToLearningRecord =
    searchParams.get("from") === "learning-record" && Boolean(learningRecordUserId);
  const backHref = returnToLearningRecord
    ? `/control-panel/users/${encodeURIComponent(learningRecordUserId ?? "")}/learning-record`
    : returnToLearnerResults
      ? "/assessment/learners"
      : "/assessment";
  const backLabel = returnToLearningRecord
    ? "Back to User Learning Record"
    : returnToLearnerResults
      ? "Back to My Learners' Results"
      : "Back to My Results";

  return (
    <div className="space-y-6">
      <Link
        href={backHref}
        className="inline-flex min-h-control items-center gap-1.5 rounded-xl px-1 text-sm font-semibold text-muted-foreground transition duration-200 ease-out hover:text-primary"
      >
        <ChevronRightIcon className="h-4 w-4 rotate-180" />
        {backLabel}
      </Link>
      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border border-primary/20 bg-hero-grid p-6 shadow-soft">
          <p className="text-xs uppercase tracking-[0.24em] text-primary">
            Final Assessment
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
            {assessment.scenarioTitle}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
            {assessment.summary}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <span className="rounded-full bg-primary-subtle px-3 py-1 text-xs font-semibold text-primary ring-1 ring-ring/30">
              Trainee-facing review
            </span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
                finalOutcome === "passed"
                  ? "bg-success-subtle text-success-subtle-foreground ring-success/30"
                  : "bg-warning-subtle text-warning-subtle-foreground ring-warning/30"
              }`}
            >
              {finalOutcome === "passed" ? "Passed" : "Needs Review"}
            </span>
          </div>
        </div>

        <div className="rounded-3xl border border-primary/20 bg-surface p-6 text-center shadow-soft">
          <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
            Overall Score
          </p>
          <p className="mt-4 text-6xl font-semibold text-foreground">
            {finalScore}%
          </p>
          <p className="mt-3 text-sm text-muted-foreground">
            {assessment.scoreOverride
              ? `Course-admin score replaces the AI score of ${assessment.overallScore}%.`
              : "Generated from weighted rubric evidence, objective gates, and conversation signals."}
          </p>
        </div>
      </section>

      {canDownloadTranscript && (
        <section className="grid gap-5 rounded-3xl border border-primary/20 bg-surface p-6 shadow-soft xl:grid-cols-[0.72fr_1.28fr]">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Course-admin grade</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              Keep the AI result as the evidence baseline. A manual score is an accountable exception, not a replacement for the transcript review.
            </p>
            {assessment.scoreOverride && (
              <p className="mt-4 text-sm font-semibold text-primary">
                Last reviewed by {assessment.scoreOverride.overriddenBy.name} on {new Date(assessment.scoreOverride.overriddenAt).toLocaleDateString()}.
              </p>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-[9rem_1fr] sm:items-start">
            <label className="space-y-2">
              <span className="text-sm font-semibold text-muted-foreground">Final score</span>
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={overrideScoreDraft}
                onChange={(event) => setOverrideScoreDraft(event.target.value)}
                className="w-full rounded-2xl border border-border bg-surface-sunken px-4 py-3 text-lg font-semibold tabular-nums text-foreground outline-none transition focus:border-primary focus:bg-surface focus:ring-4 focus:ring-ring/30"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold text-muted-foreground">Review rationale</span>
              <textarea
                value={overrideReasonDraft}
                onChange={(event) => setOverrideReasonDraft(event.target.value)}
                rows={3}
                placeholder="Explain the transcript evidence that supports this exception."
                className="w-full resize-y rounded-2xl border border-border bg-surface-sunken px-4 py-3 text-sm leading-6 text-foreground outline-none transition focus:border-primary focus:bg-surface focus:ring-4 focus:ring-ring/30"
              />
            </label>
            <div className="flex flex-wrap gap-3 sm:col-span-2">
              <button
                type="button"
                disabled={isSavingOverride}
                onClick={() => void saveScoreOverride()}
                className="inline-flex min-h-control items-center justify-center rounded-2xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-raised transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                {isSavingOverride ? "Saving grade..." : "Save course-admin grade"}
              </button>
              {assessment.scoreOverride && (
                <button
                  type="button"
                  disabled={isSavingOverride}
                  onClick={() => void saveScoreOverride(true)}
                  className="inline-flex min-h-control items-center justify-center rounded-2xl border border-border bg-surface px-5 py-2.5 text-sm font-semibold text-muted-foreground transition hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  Restore AI score
                </button>
              )}
              {overrideMessage && <p className="self-center text-sm font-medium text-muted-foreground">{overrideMessage}</p>}
            </div>
          </div>
        </section>
      )}

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-3xl border border-primary/20 bg-surface p-6 shadow-soft">
          <h2 className="text-xl font-semibold text-foreground">Strengths</h2>
          <div className="mt-4 space-y-3">
            {assessment.strengths.map((item) => (
              <div
                key={item}
                className="rounded-2xl bg-success-subtle p-4 text-sm text-success-subtle-foreground"
              >
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-primary/20 bg-surface p-6 shadow-soft">
          <h2 className="text-xl font-semibold text-foreground">
            Coaching Focus
          </h2>
          <div className="mt-4 space-y-3">
            {assessment.improvements.map((item) => (
              <div
                key={item}
                className="rounded-2xl bg-warning-subtle p-4 text-sm text-warning-subtle-foreground"
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-primary/20 bg-surface p-6 shadow-soft">
        <h2 className="text-xl font-semibold text-foreground">
          Rubric Dimensions
        </h2>
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {assessment.dimensions.map((dimension) => (
            <div
              key={dimension.label}
              className="rounded-2xl border border-primary/20 bg-primary-subtle/50 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-foreground">
                  {dimension.label}
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {dimension.weight ?? 0}% weight
                  </span>
                  <span className="rounded-full bg-surface px-3 py-1 text-xs font-semibold text-primary">
                    {dimension.score}%
                  </span>
                </div>
              </div>
              <div className="mt-3 h-2 rounded-full bg-surface">
                <div
                  className="h-2 rounded-full bg-primary"
                  style={{ width: `${dimension.score}%` }}
                />
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {dimension.summary}
              </p>
              {dimension.evidence?.length > 0 && (
                <div className="mt-3 space-y-2 border-t border-primary/15 pt-3">
                  {dimension.evidence.map((excerpt) => (
                    <p key={excerpt} className="text-xs leading-5 text-muted-foreground">
                      “{excerpt}”
                    </p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {assessment.criticalRisks?.length > 0 && (
        <section className="rounded-3xl border border-danger/30 bg-danger-subtle p-6">
          <h2 className="text-xl font-semibold text-danger-subtle-foreground">Critical review flags</h2>
          <div className="mt-4 space-y-2 text-sm leading-6 text-danger-subtle-foreground">
            {assessment.criticalRisks.map((risk) => <p key={risk}>{risk}</p>)}
          </div>
        </section>
      )}

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-3xl border border-primary/20 bg-surface p-6 shadow-soft">
          <h2 className="text-xl font-semibold text-foreground">
            Completed Objectives
          </h2>
          <div className="mt-4 space-y-3">
            {assessment.completedObjectives.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No completed objectives recorded.
              </p>
            ) : (
              assessment.completedObjectives.map((objective) => (
                <div
                  key={objective.id}
                  className="rounded-2xl bg-success-subtle p-4 text-sm text-success-subtle-foreground"
                >
                  <p className="font-semibold">{objective.label}</p>
                  {objective.evidence && (
                    <p className="mt-2">Evidence: {objective.evidence}</p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-primary/20 bg-surface p-6 shadow-soft">
          <h2 className="text-xl font-semibold text-foreground">
            Missed Required Objectives
          </h2>
          <div className="mt-4 space-y-3">
            {assessment.missedObjectives.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No missed required objectives.
              </p>
            ) : (
              assessment.missedObjectives.map((objective) => (
                <div
                  key={objective.id}
                  className="rounded-2xl bg-danger-subtle p-4 text-sm text-danger-subtle-foreground"
                >
                  {objective.label}
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-primary/20 bg-surface p-6 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-foreground">
            Transcript Review
          </h2>
          {canDownloadTranscript && (
            <a
              href={`/api/assessments/${assessment.id}/transcript`}
              className="text-sm font-semibold text-primary hover:text-primary"
            >
              Download Transcript
            </a>
          )}
        </div>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Consecutive transcript fragments are grouped into conversation turns,
          so coach feedback reviews the full learner reply instead of a broken
          ASR snippet.
        </p>
        <div className="mt-5 space-y-3">
          {transcriptTurns.map((turn) => {
            const feedback = coachFeedbackByTurnId[turn.id];
            const coachError = coachErrorByTurnId[turn.id];
            const isCoachLoading = coachLoadingTurnId === turn.id;

            return (
              <div
                key={turn.id}
                className="rounded-2xl border border-border bg-surface-sunken p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-foreground">
                    {turn.speaker_type === "engineer"
                      ? "engineer turn"
                      : "customer_ai"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(turn.startedAt).toLocaleTimeString()}
                  </p>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {turn.text}
                </p>

                {turn.speaker_type === "engineer" && (
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={() => void loadCoachFeedback(turn.id)}
                      disabled={Boolean(coachLoadingTurnId) && !isCoachLoading}
                      className="inline-flex items-center justify-center rounded-2xl border border-primary/20 bg-surface min-h-control px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary-subtle disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      {isCoachLoading
                        ? "Generating feedback..."
                        : feedback
                          ? "Coach Feedback"
                          : "View Coach Feedback"}
                    </button>

                    {coachError && (
                      <div className="mt-3 rounded-2xl border border-warning/30 bg-warning-subtle p-3 text-sm text-warning-subtle-foreground">
                        {coachError}
                      </div>
                    )}

                    {feedback && (
                      <div className="mt-3 rounded-2xl border border-primary/20 bg-surface p-4 shadow-sm">
                        <p className="text-xs uppercase tracking-[0.2em] text-primary">
                          Turn Coach
                        </p>
                        <div className="mt-3 grid gap-3 xl:grid-cols-3">
                          <div className="rounded-2xl bg-success-subtle p-3 text-sm text-success-subtle-foreground">
                            <p className="font-semibold text-success-subtle-foreground">
                              What worked
                            </p>
                            <p className="mt-2 leading-6">
                              {feedback.whatWorked}
                            </p>
                          </div>
                          <div className="rounded-2xl bg-warning-subtle p-3 text-sm text-warning-subtle-foreground">
                            <p className="font-semibold">What to improve</p>
                            <p className="mt-2 leading-6">
                              {feedback.whatToImprove}
                            </p>
                          </div>
                          <div className="rounded-2xl bg-primary-subtle p-3 text-sm text-primary">
                            <p className="font-semibold">
                              Suggested better response
                            </p>
                            <p className="mt-2 leading-6">
                              {feedback.suggestedBetterResponse}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
