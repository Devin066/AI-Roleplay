"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { SparklesIcon } from "@/components/ui/icons";
import type { AuthSessionUser } from "@/src/lib/auth/session";
import type { Objective } from "@/src/lib/objectives/types";
import { canUserManageRolePlay } from "@/src/lib/roleplays/access";
import { buildConvoAIConfig } from "@/src/lib/roleplays/buildConvoAIConfig";
import {
  defaultRolePlayCharacterPreset,
  getRolePlayCharacterPreset,
  getRolePlayCharacterPresetByVoiceId,
  rolePlayCharacterPresets,
} from "@/src/lib/roleplays/characterPresets";
import {
  fetchRolePlayConfig,
  getStoredRolePlayConfig,
  persistRolePlayConfig,
  saveStoredRolePlayConfig,
} from "@/src/lib/roleplays/storage";
import type { RolePlayConfig, RolePlayStatus } from "@/src/lib/roleplays/types";

const evaluatorPromptDefault =
  "You are a hidden objective evaluator for a role play training simulation. Evaluate only the learner's responses. Determine whether the latest learner message satisfies any incomplete goals. Only mark a goal complete if clearly satisfied, even when the wording is not an exact match. Use exact evidence from the learner response. Return strict JSON only.";

const defaultObjectives: Objective[] = [
  {
    id: "goal-acknowledge-context",
    label: "Acknowledge the customer's situation",
    required: true,
    completed: false,
  },
  {
    id: "goal-collect-details",
    label: "Collect the details needed to move the case forward",
    required: true,
    completed: false,
  },
  {
    id: "goal-next-steps",
    label: "Explain clear next steps",
    required: true,
    completed: false,
  },
];

const steps = [
  "Plan Role Play",
  "AI Character Customization",
  "Role Play Settings",
];

type BuilderAction = "draft" | "publish" | "preview" | "unpublish";
type BuilderActionPhase = "loading" | "completing" | "success";

type AssignableTrainee = {
  id: string;
  email: string;
  name: string;
  role: "trainee" | "course_admin";
};

type TranscriptRolePlayDraft = {
  meetingTitle: string;
  scenario: string;
  aiCustomerKeyPoints: string[];
  originalCallSummary: string;
  aiCustomerBehavior: string;
  learnerRole: string;
  characterName: string;
  characterRole: string;
  personalityBackground: string;
  greetingMessage: string;
  durationMinutes: number;
  learnerGoals: Objective[];
  evaluatorPrompt: string;
  privacyNotes: string[];
};

function inferCharacterPresetId(character?: {
  presetId?: string;
  voiceId?: string;
  name?: string;
}) {
  return (
    getRolePlayCharacterPreset(character?.presetId)?.id ??
    getRolePlayCharacterPresetByVoiceId(character?.voiceId)?.id ??
    rolePlayCharacterPresets.find((preset) => preset.name === character?.name)
      ?.id ??
    defaultRolePlayCharacterPreset.id
  );
}

function replaceDraftCharacterName(
  value: string,
  draftName: string,
  selectedName: string,
) {
  const normalizedDraftName = draftName.trim();

  if (!normalizedDraftName || normalizedDraftName === selectedName) {
    return value;
  }

  return value.replaceAll(normalizedDraftName, selectedName);
}

function linesToList(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
}

function listToLines(items: string[] | undefined) {
  return (items ?? []).filter(Boolean).join("\n");
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

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `roleplay-${Date.now()}`;
}

async function fetchCurrentUser() {
  const response = await fetch("/api/auth/session", { cache: "no-store" });
  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as { user?: AuthSessionUser };
  return payload.user ?? null;
}

export function RolePlayBuilder({
  embedded = false,
  rolePlayId,
}: {
  embedded?: boolean;
  rolePlayId?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState(0);
  const previewRolePlayId = searchParams.get("preview");
  const [previewConfig, setPreviewConfig] = useState<RolePlayConfig | null>(
    null,
  );
  const [isLoadingPreviewConfig, setIsLoadingPreviewConfig] = useState(false);
  const [isLoadingExistingRolePlay, setIsLoadingExistingRolePlay] = useState(
    Boolean(rolePlayId),
  );
  const [currentUser, setCurrentUser] = useState<AuthSessionUser | null>(null);
  const [editAccessDenied, setEditAccessDenied] = useState(false);
  const [currentRolePlayId, setCurrentRolePlayId] = useState<string | null>(
    rolePlayId ?? null,
  );
  const [currentStatus, setCurrentStatus] = useState<RolePlayStatus>("draft");
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [scenario, setScenario] = useState(
    "A customer is frustrated because their production video session had quality issues and their previous support case did not produce clear next steps.",
  );
  const [learnerRole, setLearnerRole] = useState("Customer Support Engineer");
  const [characterPresetId, setCharacterPresetId] = useState<string>(
    defaultRolePlayCharacterPreset.id,
  );
  const [characterName, setCharacterName] = useState<string>(
    defaultRolePlayCharacterPreset.name,
  );
  const [characterVoiceId, setCharacterVoiceId] = useState<string>(
    defaultRolePlayCharacterPreset.voiceId,
  );
  const [characterRole, setCharacterRole] = useState(
    "Enterprise customer escalation contact",
  );
  const [personalityBackground, setPersonalityBackground] = useState(
    `${defaultRolePlayCharacterPreset.name} is direct, time-sensitive, and skeptical after repeating the issue to multiple teams. They become more cooperative when the engineer shows ownership and asks specific diagnostic questions.`,
  );
  const [greetingMessage, setGreetingMessage] = useState(
    "I have already explained this issue several times. Can you actually help me get this resolved?",
  );
  const [aiCustomerKeyPointsText, setAiCustomerKeyPointsText] = useState("");
  const [originalCallSummary, setOriginalCallSummary] = useState("");
  const [aiCustomerBehavior, setAiCustomerBehavior] = useState("");
  const [meetingTitle, setMeetingTitle] = useState(
    "Escalated Video Quality Support Call",
  );
  const [durationMinutes, setDurationMinutes] = useState(8);
  const [deadlineDateTimeUtc, setDeadlineDateTimeUtc] = useState("");
  const [deadlineTimezone, setDeadlineTimezone] = useState("UTC");
  const [attemptOverrides, setAttemptOverrides] = useState<
    RolePlayConfig["settings"]["attemptOverrides"]
  >({});
  const [learnerGoals, setLearnerGoals] =
    useState<Objective[]>(defaultObjectives);
  const [evaluatorPrompt, setEvaluatorPrompt] = useState(
    evaluatorPromptDefault,
  );
  const [assignedTraineeIds, setAssignedTraineeIds] = useState<string[]>([]);
  const [trainees, setTrainees] = useState<AssignableTrainee[]>([]);
  const [traineeLoadError, setTraineeLoadError] = useState<string | null>(null);
  const [showTranscriptGenerator, setShowTranscriptGenerator] = useState(false);
  const [transcriptText, setTranscriptText] = useState("");
  const [transcriptFileName, setTranscriptFileName] = useState<string | null>(
    null,
  );
  const [isGeneratingFromTranscript, setIsGeneratingFromTranscript] =
    useState(false);
  const [transcriptGenerateMessage, setTranscriptGenerateMessage] = useState<
    string | null
  >(null);
  const [transcriptPrivacyNotes, setTranscriptPrivacyNotes] = useState<
    string[]
  >([]);
  const [draftMessage, setDraftMessage] = useState<string | null>(null);
  const [activeBuilderAction, setActiveBuilderAction] =
    useState<BuilderAction | null>(null);
  const [builderActionPhase, setBuilderActionPhase] =
    useState<BuilderActionPhase>("loading");
  const [actionProgress, setActionProgress] = useState(0);

  useEffect(() => {
    void fetchCurrentUser().then(setCurrentUser);
  }, []);

  useEffect(() => {
    if (!activeBuilderAction) {
      setActionProgress(0);
      return;
    }

    if (builderActionPhase !== "loading") {
      return;
    }

    setActionProgress((current) => Math.max(current, 12));
    const interval = window.setInterval(() => {
      setActionProgress((current) => {
        if (current >= 88) {
          return current;
        }

        return Math.min(88, current + Math.max(1.5, (100 - current) * 0.1));
      });
    }, 220);

    return () => window.clearInterval(interval);
  }, [activeBuilderAction, builderActionPhase]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/users/trainees", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(
            `Unable to load assignable users. HTTP ${response.status}.`,
          );
        }

        const payload = (await response.json()) as {
          users?: AssignableTrainee[];
        };
        setTrainees(Array.isArray(payload.users) ? payload.users : []);
      } catch (error) {
        setTraineeLoadError(
          error instanceof Error
            ? error.message
            : "Unable to load assignable users.",
        );
      }
    })();
  }, []);

  useEffect(() => {
    if (!previewRolePlayId) {
      setPreviewConfig(null);
      setIsLoadingPreviewConfig(false);
      return;
    }

    setIsLoadingPreviewConfig(true);
    void fetchRolePlayConfig(previewRolePlayId)
      .then((config) => setPreviewConfig(config))
      .finally(() => setIsLoadingPreviewConfig(false));
  }, [previewRolePlayId]);

  useEffect(() => {
    if (!rolePlayId) {
      setIsLoadingExistingRolePlay(false);
      setCurrentRolePlayId(null);
      setCurrentStatus("draft");
      setCreatedAt(null);
      setAttemptOverrides({});
      setEditAccessDenied(false);
      return;
    }

    setIsLoadingExistingRolePlay(true);
    void (async () => {
      try {
        const [remoteConfig, sessionUser] = await Promise.all([
          fetchRolePlayConfig(rolePlayId),
          fetchCurrentUser(),
        ]);
        const stored = remoteConfig ?? getStoredRolePlayConfig(rolePlayId);

        if (sessionUser) {
          setCurrentUser(sessionUser);
        }

        if (!stored) {
          setEditAccessDenied(false);
          setDraftMessage(
            "Saved role play not found. You can create a new version here.",
          );
          return;
        }

        if (!sessionUser || !canUserManageRolePlay(sessionUser, stored)) {
          setEditAccessDenied(true);
          setDraftMessage(
            "Only the course owner or root admin can edit this role play.",
          );
          return;
        }

        setEditAccessDenied(false);
        setCurrentRolePlayId(stored.id);
        setCurrentStatus(stored.status);
        setCreatedAt(stored.createdAt ?? null);
        setScenario(stored.plan.scenario);
        setLearnerRole(stored.plan.learnerRole);
        const presetId = inferCharacterPresetId(stored.character);
        const preset =
          getRolePlayCharacterPreset(presetId) ??
          defaultRolePlayCharacterPreset;
        setCharacterPresetId(preset.id);
        setCharacterVoiceId(preset.voiceId);
        setCharacterName(preset.name);
        setCharacterRole(stored.character.role);
        setPersonalityBackground(stored.character.personalityBackground);
        setGreetingMessage(stored.character.greetingMessage);
        setAiCustomerKeyPointsText(
          listToLines(stored.settings.aiCustomerKeyPoints),
        );
        setOriginalCallSummary(stored.settings.originalCallSummary ?? "");
        setAiCustomerBehavior(stored.settings.aiCustomerBehavior ?? "");
        setMeetingTitle(stored.settings.meetingTitle);
        setDurationMinutes(stored.settings.durationMinutes);
        setDeadlineDateTimeUtc(
          isoToUtcDateTimeInput(stored.settings.deadlineAt),
        );
        setDeadlineTimezone(stored.settings.deadlineTimezone ?? "UTC");
        setAttemptOverrides(stored.settings.attemptOverrides ?? {});
        setLearnerGoals(
          stored.settings.learnerGoals.length > 0
            ? stored.settings.learnerGoals
            : defaultObjectives,
        );
        setEvaluatorPrompt(stored.settings.evaluatorPrompt);
        setAssignedTraineeIds(stored.settings.assignedTraineeIds ?? []);
        setDraftMessage(null);
      } finally {
        setIsLoadingExistingRolePlay(false);
      }
    })();
  }, [rolePlayId]);

  const generated = useMemo(
    () =>
      buildConvoAIConfig({
        scenario,
        learnerRole,
        aiCharacterName: characterName,
        aiCharacterRole: characterRole,
        personalityBackground,
        greetingMessage,
        aiCustomerKeyPoints: linesToList(aiCustomerKeyPointsText),
        originalCallSummary,
        aiCustomerBehavior,
        learnerGoals,
      }),
    [
      scenario,
      learnerRole,
      characterName,
      characterRole,
      characterVoiceId,
      personalityBackground,
      greetingMessage,
      aiCustomerKeyPointsText,
      originalCallSummary,
      aiCustomerBehavior,
      learnerGoals,
    ],
  );

  function selectCharacterPreset(presetId: string) {
    const preset =
      getRolePlayCharacterPreset(presetId) ?? defaultRolePlayCharacterPreset;
    const previousName = characterName;

    setCharacterPresetId(preset.id);
    setCharacterName(preset.name);
    setCharacterVoiceId(preset.voiceId);
    setPersonalityBackground((current) =>
      replaceDraftCharacterName(current, previousName, preset.name),
    );
    setGreetingMessage((current) =>
      replaceDraftCharacterName(current, previousName, preset.name),
    );
  }

  function buildRolePlayConfig(status: RolePlayStatus): RolePlayConfig {
    const now = new Date().toISOString();
    const selectedPreset =
      getRolePlayCharacterPreset(characterPresetId) ??
      defaultRolePlayCharacterPreset;

    return {
      id: currentRolePlayId ?? createId(),
      status,
      createdAt: createdAt ?? now,
      updatedAt: now,
      plan: {
        scenario,
        learnerRole,
      },
      character: {
        presetId: selectedPreset.id,
        name: characterName,
        role: characterRole,
        voiceId: characterVoiceId || selectedPreset.voiceId,
        personalityBackground,
        greetingMessage,
      },
      settings: {
        meetingTitle,
        durationMinutes,
        learnerGoals,
        aiCustomerKeyPoints: linesToList(aiCustomerKeyPointsText),
        originalCallSummary,
        aiCustomerBehavior,
        deadlineAt: utcDateTimeInputToIso(deadlineDateTimeUtc),
        deadlineTimezone: deadlineTimezone.trim() || "UTC",
        attemptOverrides,
        evaluatorPrompt,
        assignedTraineeIds,
      },
      generated,
    };
  }

  async function completeBuilderAction(message: string) {
    setBuilderActionPhase("completing");
    setActionProgress((current) => Math.max(current, 94));
    await wait(350);
    setActionProgress(100);
    await wait(950);
    setDraftMessage(message);
    setBuilderActionPhase("success");
  }

  async function save(
    status: RolePlayStatus,
    action: BuilderAction = status === "published" ? "publish" : "draft",
  ) {
    setActiveBuilderAction(action);
    setBuilderActionPhase("loading");
    setDraftMessage(null);
    const config = buildRolePlayConfig(status);
    try {
      const saved = await persistRolePlayConfig(config);
      saveStoredRolePlayConfig(saved);
      setCurrentRolePlayId(saved.id);
      setCurrentStatus(saved.status);
      setCreatedAt(saved.createdAt ?? null);
      setAttemptOverrides(saved.settings.attemptOverrides ?? {});
      await completeBuilderAction(
        action === "preview"
          ? "Preview ready."
          : action === "unpublish"
            ? "Role play unpublished and saved as draft."
            : status === "published"
              ? "Role play published."
              : "Draft saved.",
      );
      return saved;
    } catch (error) {
      setDraftMessage(
        error instanceof Error ? error.message : "Unable to save role play.",
      );
      setActiveBuilderAction(null);
      throw error;
    }
  }

  async function previewRolePlay() {
    const config = await save(currentStatus, "preview");
    window.setTimeout(() => {
      setPreviewConfig(config);
      router.push(`/course-builder?preview=${config.id}`);
      window.scrollTo({ top: 0, behavior: "smooth" });
      setActiveBuilderAction(null);
    }, 900);
  }

  function startPreviewRolePlay(config: RolePlayConfig) {
    saveStoredRolePlayConfig(config);
    router.push(`/admin/roleplays/preview/${config.id}/session`);
  }

  function addObjective() {
    setLearnerGoals((current) => [
      ...current,
      {
        id: createId(),
        label: "",
        required: true,
        completed: false,
      },
    ]);
  }

  function removeObjective(objectiveId: string) {
    setLearnerGoals((current) =>
      current.filter((objective) => objective.id !== objectiveId),
    );
  }

  function updateObjective(objectiveId: string, updates: Partial<Objective>) {
    setLearnerGoals((current) =>
      current.map((objective) =>
        objective.id === objectiveId ? { ...objective, ...updates } : objective,
      ),
    );
  }

  function toggleTraineeAssignment(traineeId: string, assigned: boolean) {
    setAssignedTraineeIds((current) => {
      if (assigned) {
        return current.includes(traineeId) ? current : [...current, traineeId];
      }
      return current.filter((id) => id !== traineeId);
    });
  }

  async function loadTranscriptFile(file: File | undefined) {
    if (!file) {
      return;
    }

    setTranscriptFileName(file.name);
    setTranscriptGenerateMessage(null);
    setTranscriptText(await file.text());
  }

  function applyTranscriptDraft(draft: TranscriptRolePlayDraft) {
    const selectedPreset =
      getRolePlayCharacterPreset(characterPresetId) ??
      defaultRolePlayCharacterPreset;

    setMeetingTitle(draft.meetingTitle);
    setScenario(draft.scenario);
    setLearnerRole(draft.learnerRole);
    setCharacterName(selectedPreset.name);
    setCharacterVoiceId(selectedPreset.voiceId);
    setCharacterRole(draft.characterRole);
    setPersonalityBackground(
      replaceDraftCharacterName(
        draft.personalityBackground,
        draft.characterName,
        selectedPreset.name,
      ),
    );
    setGreetingMessage(
      replaceDraftCharacterName(
        draft.greetingMessage,
        draft.characterName,
        selectedPreset.name,
      ),
    );
    setAiCustomerKeyPointsText(listToLines(draft.aiCustomerKeyPoints));
    setOriginalCallSummary(draft.originalCallSummary);
    setAiCustomerBehavior(
      replaceDraftCharacterName(
        draft.aiCustomerBehavior,
        draft.characterName,
        selectedPreset.name,
      ),
    );
    setDurationMinutes(draft.durationMinutes);
    setLearnerGoals(
      draft.learnerGoals.length > 0 ? draft.learnerGoals : defaultObjectives,
    );
    setEvaluatorPrompt(draft.evaluatorPrompt);
    setTranscriptPrivacyNotes(draft.privacyNotes);
  }

  async function generateFromTranscript() {
    setTranscriptGenerateMessage(null);
    setDraftMessage(null);

    if (transcriptText.trim().length < 80) {
      setTranscriptGenerateMessage(
        "Add at least 80 characters of transcript context first.",
      );
      return;
    }

    setIsGeneratingFromTranscript(true);

    try {
      const response = await fetch("/api/roleplays/generate-from-transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: transcriptText }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        draft?: TranscriptRolePlayDraft;
        error?: string;
      };

      if (!response.ok || !payload.draft) {
        throw new Error(
          payload.error ?? `Unable to generate draft. HTTP ${response.status}.`,
        );
      }

      applyTranscriptDraft(payload.draft);
      setStep(0);
      setShowTranscriptGenerator(false);
      setTranscriptGenerateMessage(
        "Generated a draft from the transcript. Review every field before saving or publishing.",
      );
    } catch (error) {
      setTranscriptGenerateMessage(
        error instanceof Error
          ? error.message
          : "Unable to generate a draft from the transcript.",
      );
    } finally {
      setIsGeneratingFromTranscript(false);
    }
  }

  const progressPercent = Math.round(((step + 1) / steps.length) * 100);
  const isFinalStep = step === steps.length - 1;
  const isBuilderActionRunning = Boolean(activeBuilderAction);
  const activeBuilderActionLabel =
    activeBuilderAction === "draft"
      ? "Saving draft"
      : activeBuilderAction === "unpublish"
        ? "Unpublishing role play"
        : activeBuilderAction === "publish"
          ? "Publishing role play"
          : activeBuilderAction === "preview"
            ? "Preparing preview"
            : "";
  const actionSuccessTitle =
    activeBuilderAction === "publish"
      ? "Role play published"
      : activeBuilderAction === "unpublish"
        ? "Role play unpublished"
        : activeBuilderAction === "draft"
          ? "Draft saved"
          : "Preview ready";
  const actionSuccessBody =
    activeBuilderAction === "publish"
      ? "Your course is now available in Preview Created Courses. Redirecting you back to the course list."
      : activeBuilderAction === "unpublish"
        ? "Your course is now saved as a draft and hidden from learners. Redirecting you back to the course list."
        : activeBuilderAction === "draft"
          ? "Your draft has been saved. Redirecting you back to Preview Created Courses."
          : "Your learner-facing preview is ready.";

  useEffect(() => {
    if (!activeBuilderAction || builderActionPhase !== "success") {
      return;
    }

    if (activeBuilderAction === "preview") {
      return;
    }

    const timeout = window.setTimeout(() => {
      router.push("/course-builder");
      setActiveBuilderAction(null);
    }, 1500);

    return () => window.clearTimeout(timeout);
  }, [activeBuilderAction, builderActionPhase, router]);

  if (isLoadingPreviewConfig) {
    return (
      <section
        id="course-builder"
        className={
          embedded
            ? "rounded-3xl border border-primary/20 bg-surface/90 p-6 shadow-soft"
            : "min-h-screen app-backdrop px-6 py-8"
        }
      >
        <div
          className={
            embedded
              ? "text-sm text-muted-foreground"
              : "mx-auto max-w-6xl text-sm text-muted-foreground"
          }
        >
          Loading role play preview...
        </div>
      </section>
    );
  }

  if (isLoadingExistingRolePlay) {
    return (
      <section
        id="course-builder"
        className={
          embedded
            ? "rounded-3xl border border-primary/20 bg-surface/90 p-6 shadow-soft"
            : "min-h-screen app-backdrop px-6 py-8"
        }
      >
        <div
          className={
            embedded
              ? "text-sm text-muted-foreground"
              : "mx-auto max-w-6xl text-sm text-muted-foreground"
          }
        >
          Loading role play editor...
        </div>
      </section>
    );
  }

  if (previewConfig) {
    const canManagePreview = currentUser
      ? canUserManageRolePlay(currentUser, previewConfig)
      : false;

    return (
      <section
        id="course-builder"
        className={
          embedded
            ? "overflow-hidden rounded-3xl border border-primary/20 bg-surface/90 p-5 shadow-soft sm:p-6"
            : "min-h-screen app-backdrop px-6 py-8"
        }
      >
        <div className={embedded ? "space-y-6" : "mx-auto max-w-6xl space-y-6"}>
          <header className="overflow-hidden rounded-3xl border border-primary/20 bg-hero-grid p-6 shadow-soft">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-primary">
                  Powered by AI
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
                  {previewConfig.settings.meetingTitle}
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
                  Learner-facing preview for a{" "}
                  {previewConfig.settings.durationMinutes}-minute roleplay with{" "}
                  {previewConfig.character.name}.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {canManagePreview && (
                  <button
                    type="button"
                    onClick={() => {
                      setPreviewConfig(null);
                      router.push(`/course-builder/${previewConfig.id}/edit`);
                    }}
                    className="inline-flex items-center justify-center rounded-2xl border border-border bg-surface min-h-control px-4 py-2 text-sm font-semibold text-muted-foreground shadow-soft transition hover:border-primary/40 hover:bg-primary-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    Edit Builder
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => startPreviewRolePlay(previewConfig)}
                  className="inline-flex items-center justify-center rounded-2xl bg-primary min-h-control px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-raised transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  Start Role Play
                </button>
              </div>
            </div>
          </header>

          <main className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <section className="space-y-5">
              <div className="rounded-3xl border border-primary/20 bg-surface p-6 shadow-soft">
                <p className="text-xs uppercase tracking-[0.2em] text-primary">
                  Scenario Summary
                </p>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  {previewConfig.plan.scenario}
                </p>
              </div>

              <div className="rounded-3xl border border-primary/20 bg-surface p-6 shadow-soft">
                <p className="text-xs uppercase tracking-[0.2em] text-primary">
                  AI Character
                </p>
                <div className="mt-4 flex items-start gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary text-2xl font-semibold text-primary-foreground shadow-raised ">
                    {previewConfig.character.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-foreground">
                      {previewConfig.character.name}
                    </h2>
                    <p className="text-sm font-medium text-primary">
                      {previewConfig.character.role}
                    </p>
                    <p className="mt-3 text-sm leading-7 text-muted-foreground">
                      {previewConfig.character.personalityBackground}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-primary/20 bg-surface p-6 shadow-soft">
                <p className="text-xs uppercase tracking-[0.2em] text-primary">
                  Learner Role
                </p>
                <p className="mt-3 text-sm font-medium text-muted-foreground">
                  {previewConfig.plan.learnerRole}
                </p>
              </div>
            </section>

            <aside className="rounded-3xl border border-primary/20 bg-surface p-6 shadow-soft">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-primary">
                    Meeting Goals
                  </p>
                  <h2 className="mt-2 text-lg font-semibold text-foreground">
                    What the learner should cover
                  </h2>
                </div>
                <span className="rounded-full border border-primary/20 bg-primary-subtle px-3 py-1 text-xs font-semibold text-primary">
                  {previewConfig.settings.learnerGoals.length} goals
                </span>
              </div>
              <div className="mt-5 space-y-3">
                {previewConfig.settings.learnerGoals.map((goal) => (
                  <div
                    key={goal.id}
                    className="rounded-2xl border border-primary/20 bg-primary-subtle/50 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium leading-6 text-foreground">
                        {goal.label}
                      </p>
                      <span className="rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                        {goal.required ? "Required" : "Optional"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </aside>
          </main>
        </div>
      </section>
    );
  }

  if (editAccessDenied) {
    return (
      <section
        id="course-builder"
        className={
          embedded
            ? "rounded-3xl border border-warning/30 bg-warning-subtle p-6 shadow-soft"
            : "min-h-screen app-backdrop-warm px-6 py-8"
        }
      >
        <div className={embedded ? "space-y-4" : "mx-auto max-w-3xl space-y-4"}>
          <p className="text-xs uppercase tracking-[0.24em] text-warning-subtle-foreground">
            Owner-only access
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            This role play can only be edited by its owner or root admin.
          </h1>
          <p className="text-sm leading-7 text-muted-foreground">
            You can still preview or take assigned roleplay courses, but
            management actions are limited to the creator who made the
            simulation.
          </p>
          <Link
            href="/course-builder"
            className="inline-flex rounded-2xl bg-primary min-h-control px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-raised transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Back to Courses
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section
      id="course-builder"
      className={
        embedded
          ? "overflow-hidden rounded-3xl border border-primary/20 bg-surface/90 p-5 shadow-soft sm:p-6"
          : "min-h-screen app-backdrop px-6 py-8"
      }
    >
      {activeBuilderAction && (
        <div className="fixed inset-0 z-overlay flex items-center justify-center bg-scrim/35 px-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-[2rem] border border-border bg-surface/95 p-8 text-center shadow-overlay">
            <div
              className={`mx-auto flex h-16 w-16 items-center justify-center rounded-3xl text-2xl font-semibold ${
                builderActionPhase === "success"
                  ? "bg-success-subtle text-success-subtle-foreground"
                  : "bg-primary-subtle text-primary"
              }`}
            >
              {builderActionPhase === "success" ? (
                "✓"
              ) : (
                <span className="h-7 w-7 animate-spin rounded-full border-4 border-primary/20 border-t-blue-700" />
              )}
            </div>
            <p className="mt-5 text-xs uppercase tracking-[0.28em] text-primary">
              Role Play Builder
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">
              {builderActionPhase === "success"
                ? actionSuccessTitle
                : activeBuilderActionLabel}
            </h2>
            <p className="mx-auto mt-4 max-w-md text-sm leading-7 text-muted-foreground">
              {builderActionPhase === "success"
                ? actionSuccessBody
                : "Please keep this window open while we save the latest roleplay configuration."}
            </p>
            <div className="mt-6 rounded-2xl border border-primary/20 bg-primary-subtle/70 p-4">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                <span>
                  {builderActionPhase === "success"
                    ? "Complete"
                    : "Saving progress"}
                </span>
                <span>{Math.round(actionProgress)}%</span>
              </div>
              <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-surface">
                <div
                  className={`h-full rounded-full transition-all duration-200 ease-out ${
                    builderActionPhase === "success"
                      ? "bg-success"
                      : "bg-primary"
                  }`}
                  style={{ width: `${actionProgress}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
      <div
        className={
          embedded ? "space-y-6 pb-40" : "mx-auto max-w-6xl space-y-6 pb-40"
        }
      >
        <header className="overflow-hidden rounded-3xl border border-primary/20 bg-hero-grid p-6 shadow-soft">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-primary">
                Course Admin
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
                Role Play Builder
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">
                Build, save, publish, and preview AI customer roleplays from the
                same workspace your learners use for practice.
              </p>
            </div>
            <div className="w-full max-w-xl">
              <div className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                <span>Builder progress</span>
                <span>{progressPercent}%</span>
              </div>
              <div className="h-2 rounded-full bg-primary-subtle">
                <div
                  className="h-2 rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {steps.map((label, index) => (
              <button
                key={label}
                type="button"
                onClick={() => setStep(index)}
                className={`rounded-2xl border p-4 text-left transition ${
                  step === index
                    ? "border-primary bg-primary text-primary-foreground shadow-raised "
                    : "border-primary/20 bg-surface/80 text-muted-foreground hover:border-primary/40 hover:bg-surface"
                }`}
              >
                <span
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-xl text-sm font-semibold ${
                    step === index
                      ? "bg-surface/20 text-primary-foreground"
                      : "bg-primary-subtle text-primary"
                  }`}
                >
                  {index + 1}
                </span>
                <span className="mt-3 block text-sm font-semibold">
                  {label}
                </span>
              </button>
            ))}
          </div>
        </header>

        <main className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-3xl border border-primary/20 bg-surface p-6 shadow-soft">
            {step === 0 && (
              <div className="space-y-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-primary">
                      Step 1
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                      Plan Role Play
                    </h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Define the learner context and the situation the AI
                      customer should bring into the meeting.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowTranscriptGenerator((current) => !current);
                      setTranscriptGenerateMessage(null);
                    }}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-info/30 bg-info-subtle min-h-control px-3.5 py-2 text-xs font-semibold text-info-subtle-foreground shadow-sm transition hover:bg-info-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    aria-expanded={showTranscriptGenerator}
                  >
                    <SparklesIcon className="h-4 w-4" />
                    <span>Generate from Transcript</span>
                  </button>
                </div>
                {showTranscriptGenerator && (
                  <div className="rounded-3xl border border-info/30 bg-info-subtle/60 p-5">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-info-subtle-foreground">
                          Generate from real call
                        </p>
                        <h3 className="mt-2 text-lg font-semibold tracking-tight text-foreground">
                          Upload or paste a customer-call transcript
                        </h3>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                          The generator creates an anonymized draft scenario,
                          customer persona, greeting, and learner goals. Review
                          the output for privacy and accuracy before saving.
                        </p>
                      </div>
                      <label className="inline-flex cursor-pointer items-center justify-center rounded-2xl border border-info/30 bg-surface min-h-control px-4 py-2 text-sm font-semibold text-info-subtle-foreground shadow-sm transition hover:bg-info-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
                        Upload (.vtt, .txt)
                        <input
                          type="file"
                          accept=".vtt,.txt,text/vtt,text/plain"
                          className="sr-only"
                          onChange={(event) =>
                            void loadTranscriptFile(
                              event.currentTarget.files?.[0],
                            )
                          }
                        />
                      </label>
                    </div>
                    {transcriptFileName && (
                      <p className="mt-3 text-xs font-semibold text-info-subtle-foreground">
                        Loaded file: {transcriptFileName}
                      </p>
                    )}
                    <label className="mt-4 block space-y-2">
                      <span className="text-sm font-medium text-muted-foreground">
                        Transcript
                      </span>
                      <textarea
                        value={transcriptText}
                        onChange={(event) => {
                          setTranscriptText(event.target.value);
                          setTranscriptFileName(null);
                        }}
                        rows={7}
                        placeholder="Paste the actual call transcript here. Avoid adding account IDs, emails, phone numbers, or other sensitive data when possible."
                        className="w-full rounded-2xl border border-info/30 bg-surface/90 px-4 py-3 text-sm leading-6 text-foreground outline-none transition focus:border-info/30 focus:bg-surface focus:ring-4 focus:ring-info/30"
                      />
                    </label>
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs leading-5 text-muted-foreground">
                        The transcript is sent only to generate the draft. The
                        builder saves the resulting scenario, not the raw
                        transcript.
                      </p>
                      <button
                        type="button"
                        onClick={() => void generateFromTranscript()}
                        disabled={
                          isGeneratingFromTranscript || isBuilderActionRunning
                        }
                        className="inline-flex items-center justify-center rounded-2xl bg-info min-h-control px-4 py-2 text-sm font-semibold text-primary-foreground shadow-raised transition hover:bg-info/90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      >
                        {isGeneratingFromTranscript
                          ? "Generating..."
                          : "Generate Draft"}
                      </button>
                    </div>
                    {transcriptGenerateMessage && (
                      <div className="mt-4 rounded-2xl border border-info/30 bg-surface p-3 text-sm font-medium text-info-subtle-foreground">
                        {transcriptGenerateMessage}
                      </div>
                    )}
                    {transcriptPrivacyNotes.length > 0 && (
                      <div className="mt-4 rounded-2xl border border-warning/30 bg-warning-subtle p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-warning-subtle-foreground">
                          Privacy review notes
                        </p>
                        <ul className="mt-2 space-y-1 text-sm leading-6 text-warning-subtle-foreground">
                          {transcriptPrivacyNotes.map((note) => (
                            <li key={note}>- {note}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
                {transcriptGenerateMessage && !showTranscriptGenerator && (
                  <div className="rounded-2xl border border-info/30 bg-info-subtle p-3 text-sm font-medium text-info-subtle-foreground">
                    {transcriptGenerateMessage}
                  </div>
                )}
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-muted-foreground">
                    Scenario
                  </span>
                  <textarea
                    value={scenario}
                    onChange={(event) => setScenario(event.target.value)}
                    rows={8}
                    className="w-full rounded-2xl border border-primary/20 bg-surface-sunken/80 px-4 py-3 text-sm leading-6 text-foreground outline-none transition focus:border-primary focus:bg-surface focus:ring-4 focus:ring-ring/30"
                  />
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-muted-foreground">
                    AI Customer Talking Points
                  </span>
                  <textarea
                    value={aiCustomerKeyPointsText}
                    onChange={(event) =>
                      setAiCustomerKeyPointsText(event.target.value)
                    }
                    rows={5}
                    placeholder="One prompt-only talking point per line. These are added to the AI customer prompt, not the visible scenario."
                    className="w-full rounded-2xl border border-primary/20 bg-surface-sunken/80 px-4 py-3 text-sm leading-6 text-foreground outline-none transition focus:border-primary focus:bg-surface focus:ring-4 focus:ring-ring/30"
                  />
                  <span className="block text-xs leading-5 text-muted-foreground">
                    These points guide what the AI customer should naturally
                    mention during the call. They are kept separate from the
                    scenario brief.
                  </span>
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-muted-foreground">
                    Learner Role
                  </span>
                  <input
                    value={learnerRole}
                    onChange={(event) => setLearnerRole(event.target.value)}
                    className="w-full rounded-2xl border border-primary/20 bg-surface-sunken/80 px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary focus:bg-surface focus:ring-4 focus:ring-ring/30"
                  />
                </label>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-5">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-primary">
                    Step 2
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                    AI Character Customization
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Shape the customer persona so the roleplay feels specific,
                    grounded, and repeatable.
                  </p>
                </div>
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-muted-foreground">
                    AI Character
                  </span>
                  <select
                    value={characterPresetId}
                    onChange={(event) =>
                      selectCharacterPreset(event.target.value)
                    }
                    className="w-full rounded-2xl border border-primary/20 bg-surface-sunken/80 px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary focus:bg-surface focus:ring-4 focus:ring-ring/30"
                  >
                    {rolePlayCharacterPresets.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.name} -{" "}
                        {preset.gender === "female" ? "Female" : "Male"}
                      </option>
                    ))}
                  </select>
                  <span className="block text-xs leading-5 text-muted-foreground">
                    The matching voice is selected automatically for the chosen
                    character.
                  </span>
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-muted-foreground">
                      Selected Name
                    </span>
                    <input
                      value={characterName}
                      readOnly
                      className="w-full rounded-2xl border border-primary/20 bg-muted/80 px-4 py-3 text-sm text-muted-foreground outline-none"
                    />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-muted-foreground">
                      Character Role
                    </span>
                    <input
                      value={characterRole}
                      onChange={(event) => setCharacterRole(event.target.value)}
                      className="w-full rounded-2xl border border-primary/20 bg-surface-sunken/80 px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary focus:bg-surface focus:ring-4 focus:ring-ring/30"
                    />
                  </label>
                </div>
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-muted-foreground">
                    Personality and Background
                  </span>
                  <textarea
                    value={personalityBackground}
                    onChange={(event) =>
                      setPersonalityBackground(event.target.value)
                    }
                    rows={7}
                    className="w-full rounded-2xl border border-primary/20 bg-surface-sunken/80 px-4 py-3 text-sm leading-6 text-foreground outline-none transition focus:border-primary focus:bg-surface focus:ring-4 focus:ring-ring/30"
                  />
                </label>
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-muted-foreground">
                    Greeting Message
                  </span>
                  <textarea
                    value={greetingMessage}
                    onChange={(event) => setGreetingMessage(event.target.value)}
                    rows={3}
                    className="w-full rounded-2xl border border-primary/20 bg-surface-sunken/80 px-4 py-3 text-sm leading-6 text-foreground outline-none transition focus:border-primary focus:bg-surface focus:ring-4 focus:ring-ring/30"
                  />
                </label>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-primary">
                    Step 3
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
                    Role Play Settings
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Configure learner goals, timing, and the evaluator that
                    checks objective coverage.
                  </p>
                </div>
                {currentRolePlayId && (
                  <div className="rounded-2xl border border-border bg-surface-sunken p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          Publishing Status
                        </p>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          {currentStatus === "published"
                            ? "This course is visible to assigned learners. Use Unpublish to move it back to draft."
                            : "This course is saved as a draft and hidden from learners until published."}
                        </p>
                      </div>
                      <span
                        className={`w-fit rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] ${
                          currentStatus === "published"
                            ? "border-success/30 bg-surface text-success-subtle-foreground"
                            : "border-warning/30 bg-surface text-warning-subtle-foreground"
                        }`}
                      >
                        {currentStatus === "published" ? "Published" : "Draft"}
                      </span>
                    </div>
                    {currentStatus === "published" && (
                      <button
                        type="button"
                        onClick={() => void save("draft", "unpublish")}
                        disabled={isBuilderActionRunning}
                        className="mt-4 inline-flex items-center justify-center rounded-2xl border border-warning/30 bg-warning-subtle min-h-control px-4 py-2 text-sm font-semibold text-warning-subtle-foreground shadow-sm transition hover:bg-warning-subtle disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      >
                        Unpublish to Draft
                      </button>
                    )}
                  </div>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-muted-foreground">
                      Meeting Title
                    </span>
                    <input
                      value={meetingTitle}
                      onChange={(event) => setMeetingTitle(event.target.value)}
                      className="w-full rounded-2xl border border-primary/20 bg-surface-sunken/80 px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary focus:bg-surface focus:ring-4 focus:ring-ring/30"
                    />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-muted-foreground">
                      Role Play Duration
                    </span>
                    <select
                      value={durationMinutes}
                      onChange={(event) =>
                        setDurationMinutes(Number(event.target.value))
                      }
                      className="w-full rounded-2xl border border-primary/20 bg-surface-sunken/80 px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary focus:bg-surface focus:ring-4 focus:ring-ring/30"
                    >
                      {[5, 8, 10, 15, 20].map((value) => (
                        <option key={value} value={value}>
                          {value} minutes
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-muted-foreground">
                      Deadline Date/Time
                    </span>
                    <input
                      type="datetime-local"
                      value={deadlineDateTimeUtc}
                      onChange={(event) =>
                        setDeadlineDateTimeUtc(event.target.value)
                      }
                      className="w-full rounded-2xl border border-primary/20 bg-surface-sunken/80 px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary focus:bg-surface focus:ring-4 focus:ring-ring/30"
                    />
                    <span className="block text-xs leading-5 text-muted-foreground">
                      Leave empty for no deadline. This value is saved as UTC.
                    </span>
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-muted-foreground">
                      Deadline Timezone
                    </span>
                    <input
                      value={deadlineTimezone}
                      onChange={(event) =>
                        setDeadlineTimezone(event.target.value)
                      }
                      placeholder="UTC"
                      className="w-full rounded-2xl border border-primary/20 bg-surface-sunken/80 px-4 py-3 text-sm text-foreground outline-none transition focus:border-primary focus:bg-surface focus:ring-4 focus:ring-ring/30"
                    />
                    <span className="block text-xs leading-5 text-muted-foreground">
                      Use UTC by default, or enter an IANA timezone label for
                      display.
                    </span>
                  </label>
                </div>

                <div className="space-y-3 rounded-2xl border border-primary/20 bg-primary-subtle/50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        Learner Goals / Objectives
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Required goals power live tracking during the roleplay
                        session.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={addObjective}
                      className="inline-flex items-center justify-center rounded-xl bg-primary min-h-control-sm px-3 py-2 text-xs font-semibold text-primary-foreground shadow-raised transition hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      Add Objective
                    </button>
                  </div>
                  {learnerGoals.map((goal) => (
                    <div
                      key={goal.id}
                      className="grid gap-3 rounded-2xl border border-primary/20 bg-surface p-3"
                    >
                      <input
                        value={goal.label}
                        onChange={(event) =>
                          updateObjective(goal.id, {
                            label: event.target.value,
                          })
                        }
                        className="rounded-xl border border-primary/20 bg-surface-sunken/80 px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:bg-surface focus:ring-4 focus:ring-ring/30"
                      />
                      <div className="flex items-center justify-between gap-3">
                        <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={goal.required}
                            onChange={(event) =>
                              updateObjective(goal.id, {
                                required: event.target.checked,
                              })
                            }
                          />
                          Required
                        </label>
                        <button
                          type="button"
                          onClick={() => removeObjective(goal.id)}
                          disabled={learnerGoals.length <= 1}
                          className="inline-flex items-center justify-center rounded-xl border border-border min-h-control-sm px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:border-danger/40 hover:bg-danger-subtle hover:text-danger disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-3 rounded-2xl border border-primary/20 bg-surface p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        User Access
                      </p>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        Choose which trainee and course admin accounts can see
                        and start this course after it is published.
                      </p>
                    </div>
                    <span className="rounded-full bg-primary-subtle px-3 py-1 text-xs font-semibold text-primary ring-1 ring-ring/30">
                      {assignedTraineeIds.length} assigned
                    </span>
                  </div>

                  {traineeLoadError && (
                    <div className="rounded-2xl border border-warning/30 bg-warning-subtle p-3 text-xs text-warning-subtle-foreground">
                      {traineeLoadError}
                    </div>
                  )}

                  {!traineeLoadError && trainees.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-primary/20 bg-primary-subtle/60 p-4 text-sm text-muted-foreground">
                      No assignable users available yet. Add trainee or course
                      admin accounts before assigning this course.
                    </div>
                  )}

                  {trainees.length > 0 && (
                    <div className="grid gap-2">
                      {trainees.map((trainee) => (
                        <label
                          key={trainee.id}
                          className="flex items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-primary-subtle/50 p-3"
                        >
                          <span>
                            <span className="block text-sm font-semibold text-foreground">
                              {trainee.name}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {trainee.email}
                            </span>
                            <span className="mt-1 inline-flex rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold text-muted-foreground ring-1 ring-ring/30">
                              {trainee.role === "course_admin"
                                ? "Course Admin + Learner"
                                : "Trainee"}
                            </span>
                          </span>
                          <input
                            type="checkbox"
                            checked={assignedTraineeIds.includes(trainee.id)}
                            onChange={(event) =>
                              toggleTraineeAssignment(
                                trainee.id,
                                event.target.checked,
                              )
                            }
                            className="h-4 w-4"
                          />
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          <aside className="self-start lg:sticky lg:top-24">
            <section aria-labelledby="customer-preview-heading">
              <div className="flex items-baseline justify-between gap-4 px-1">
                <h2 id="customer-preview-heading" className="text-lg font-semibold text-foreground">
                  Customer preview
                </h2>
                <span className="text-xs text-muted-foreground">Updates as you edit</span>
              </div>
              <div className="mx-auto mt-4 max-w-[21rem] rounded-[2.75rem] bg-panel p-2 shadow-overlay">
                <div className="overflow-hidden rounded-[2.25rem] bg-surface-sunken p-4">
                  <div className="mx-auto h-1.5 w-16 rounded-full bg-panel/25" aria-hidden="true" />
                  <div className="mt-5">
                    <p className="text-lg font-semibold tracking-tight text-foreground">
                      About {characterName.trim() || "your customer"}
                    </p>
                  </div>

                  <div className="mt-5 rounded-2xl bg-surface px-5 py-6 text-center shadow-soft">
                    <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary-subtle text-3xl font-semibold text-primary">
                      {characterName.trim().slice(0, 1).toUpperCase() || "AI"}
                    </div>
                    <h3 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
                      {characterName.trim() || "Customer name"}
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {characterRole.trim() || "Customer role"}
                    </p>
                    <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary-subtle px-3 py-1.5 text-xs font-semibold text-primary">
                      <SparklesIcon className="h-3.5 w-3.5" />
                      AI customer
                    </span>
                  </div>

                  <div className="mt-5 max-h-52 overflow-y-auto pr-1 surface-scrollbar">
                    <p className="text-sm leading-7 text-foreground">
                      {personalityBackground.trim() || "Add a personality and background to help learners understand the customer before the roleplay begins."}
                    </p>
                  </div>

                  <div className="mt-5 rounded-2xl border border-primary/20 bg-primary-subtle/55 p-4">
                    <p className="text-xs font-semibold text-primary">Opening line</p>
                    <p className="mt-2 text-sm leading-6 text-primary-subtle-foreground">
                      {greetingMessage.trim() || "Add the first thing this customer says when the roleplay starts."}
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </aside>
        </main>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-sticky border-t border-border bg-surface/95 px-4 py-3 shadow-overlay backdrop-blur-xl sm:px-6 lg:left-[var(--app-sidebar-width,17rem)] lg:transition-[left] lg:duration-slow lg:ease-out">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStep((current) => Math.max(0, current - 1))}
              disabled={step === 0}
              className="inline-flex items-center justify-center rounded-2xl border border-border bg-surface min-h-control px-4 py-2 text-sm font-semibold text-muted-foreground shadow-sm transition hover:border-primary/40 hover:bg-primary-subtle disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() =>
                setStep((current) => Math.min(steps.length - 1, current + 1))
              }
              disabled={step === steps.length - 1}
              className="inline-flex items-center justify-center rounded-2xl border border-border bg-surface min-h-control px-4 py-2 text-sm font-semibold text-muted-foreground shadow-sm transition hover:border-primary/40 hover:bg-primary-subtle disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Next
            </button>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
            {draftMessage && !isBuilderActionRunning ? (
              <p className="rounded-2xl border border-primary/20 bg-primary-subtle px-4 py-2 text-sm font-medium text-primary">
                {draftMessage}
              </p>
            ) : !isFinalStep ? (
              <p className="rounded-2xl border border-border bg-surface px-4 py-2 text-sm font-medium text-muted-foreground">
                Publish and Preview/Test unlock in Role Play Settings.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <button
                type="button"
                onClick={() =>
                  void save(
                    "draft",
                    currentStatus === "published" ? "unpublish" : "draft",
                  )
                }
                disabled={isBuilderActionRunning}
                className={`rounded-2xl border px-4 py-2 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  currentStatus === "published"
                    ? "border-warning/30 bg-warning-subtle text-warning-subtle-foreground hover:bg-warning-subtle"
                    : "border-border bg-surface text-muted-foreground hover:border-primary/40 hover:bg-primary-subtle"
                }`}
              >
                {currentStatus === "published"
                  ? "Unpublish to Draft"
                  : "Save Draft"}
              </button>
              {isFinalStep && (
                <>
                  <button
                    type="button"
                    onClick={() => void save("published")}
                    disabled={isBuilderActionRunning}
                    className="inline-flex items-center justify-center rounded-2xl bg-success min-h-control px-4 py-2 text-sm font-semibold text-success-foreground shadow-raised transition hover:bg-success/90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    Publish
                  </button>
                  <button
                    type="button"
                    onClick={() => void previewRolePlay()}
                    disabled={isBuilderActionRunning}
                    className="inline-flex items-center justify-center rounded-2xl bg-primary min-h-control px-4 py-2 text-sm font-semibold text-primary-foreground shadow-raised transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    Preview/Test
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
