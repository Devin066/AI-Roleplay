"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import type {
  IAgoraRTCClient,
  IMicrophoneAudioTrack,
  IRemoteAudioTrack,
} from "agora-rtc-sdk-ng";
import {
  mapToolkitTranscriptItems,
  type NormalizedTranscript,
  type ToolkitTranscriptItem,
  type ToolkitTranscriptMetadata,
} from "@/src/lib/convoai/transcriptMapper";
import type {
  MatchedObjective,
  Objective,
  TranscriptEntry,
} from "@/src/lib/objectives/types";
import type { TranscriptEntry as SavedTranscriptEntry } from "@/src/lib/transcripts/types";

type CallStatus = "Waiting" | "Connecting" | "In Call" | "Muted" | "Ended";
type SimulationState = "in_call" | "finalizing" | "ending" | "finished";

type StartResponse = {
  status: string;
  agentId: string;
  createTs: number | null;
  channelName: string;
  traineeUid: string;
  agentUid: string;
  engineerRtc: {
    appId: string;
    channelName: string;
    uid: string;
    token: string;
  };
  configSummary: {
    greeting_message_switch: string;
    delay_ms: number;
    llmProvider: string | null;
    llmModel?: string;
    asrProvider: string | null;
    asrModel?: string;
    asrLanguage?: string;
    ttsProvider: string | null;
    ttsModel?: string;
    ttsVoiceId?: string;
    appIdConfigured: boolean;
    rtcTokenGenerated: boolean;
    tokenVersion: string;
    baseUrl: string;
  };
};

type TranscriptItem = {
  id: string;
  speaker: "System" | "Engineer" | "AI Customer";
  message: string;
  time: string;
};

type StreamChunkEnvelope = {
  messageId: string;
  partIndex: number;
  partSum: number;
  content: string;
};

type DataStreamTranscriptMessage = {
  object?: string;
  text?: string;
  stream_id?: number;
  turn_id?: number;
  user_id?: string;
  text_ts?: number;
  final?: boolean;
  turn_status?: number;
};

const fixedGreetingSwitch = "single_first";
const fixedDelayMs = 1200;
const engineerTurnEndDelayMs = 1400;
const finalizationFallbackMs = 7000;
const scenarioId = "frustrated-customer-escalation";
const scenarioTitle = "Frustrated Customer Escalation Session";
const defaultEvaluatorPrompt =
  "You are a hidden objective evaluator for a technical support training simulation. Evaluate only the support engineer's responses. Determine whether the latest engineer message satisfies any incomplete objectives. Only mark an objective complete if clearly satisfied. Use exact evidence from the engineer response. Return strict JSON only.";
const defaultObjectives: Objective[] = [
  {
    id: "objective-acknowledge-frustration",
    label: "Acknowledge customer frustration",
    required: true,
    completed: false,
  },
  {
    id: "objective-ask-uid",
    label: "Ask for affected UID",
    required: true,
    completed: false,
  },
  {
    id: "objective-ask-time",
    label: "Ask for session time or approximate timestamp",
    required: true,
    completed: false,
  },
  {
    id: "objective-next-steps",
    label: "Provide clear next steps",
    required: true,
    completed: false,
  },
];
const quietMeterLevels = [7, 9, 11, 12, 13, 12, 11, 9, 7];
const engineerMeterProfile = [0.45, 0.62, 0.82, 0.95, 1, 0.95, 0.82, 0.62, 0.45];
const agentMeterProfile = [0.5, 0.68, 0.86, 0.97, 1, 0.97, 0.86, 0.68, 0.5];

const initialTranscript: TranscriptItem[] = [
  {
    id: "t-1",
    speaker: "System",
    time: "00:00",
    message: "Sample session ready. Configure the prompt and join when you want to test the UI flow.",
  },
];

function formatClock(value: number) {
  return value.toString().padStart(2, "0");
}

function sessionTimestamp() {
  const now = new Date();
  return `${formatClock(now.getMinutes())}:${formatClock(now.getSeconds())}`;
}

function objectiveEvalEntryKey(entry: NormalizedTranscript) {
  return `${entry.id}::${entry.timestamp}::${entry.text}`;
}

function buildMeterLevels(level: number, profile: number[]) {
  const intensity = Math.pow(Math.max(0, Math.min(1, level)), 0.72);
  return profile.map((weight) => Math.round(7 + intensity * 46 * weight));
}

function parseStreamChunkEnvelope(rawChunk: string): StreamChunkEnvelope | null {
  // Matches the official ConvoAI web transcript data-stream chunk shape:
  // {message_id}|{part_idx}|{part_sum}|{base64_chunk}
  const first = rawChunk.indexOf("|");
  const second = rawChunk.indexOf("|", first + 1);
  const third = rawChunk.indexOf("|", second + 1);
  if (first < 0 || second < 0 || third < 0) {
    return null;
  }

  const messageId = rawChunk.slice(0, first);
  const partIndex = Number(rawChunk.slice(first + 1, second));
  const partSumRaw = rawChunk.slice(second + 1, third);
  const content = rawChunk.slice(third + 1);
  const partSum = partSumRaw === "???" ? -1 : Number(partSumRaw);

  if (!messageId || Number.isNaN(partIndex) || Number.isNaN(partSum) || partSum <= 0) {
    return null;
  }

  return {
    messageId,
    partIndex,
    partSum,
    content,
  };
}

function decodeUtf8(bytes: Uint8Array) {
  return new TextDecoder().decode(bytes);
}

export default function FrustratedCustomerEscalationSessionPage() {
  const [systemMessage, setSystemMessage] = useState(
    "You are a frustrated Agora customer whose production support case has bounced between teams. Challenge vague troubleshooting, demand ownership, and respond more positively when the engineer is calm, specific, and accountable.",
  );
  const [greetingMessage, setGreetingMessage] = useState(
    "I have already repeated this issue three times. Why is nobody actually fixing it?",
  );
  const [evaluatorPrompt, setEvaluatorPrompt] = useState(defaultEvaluatorPrompt);
  const [objectives, setObjectives] = useState<Objective[]>(defaultObjectives);
  const [status, setStatus] = useState<CallStatus>("Waiting");
  const [simulationState, setSimulationState] = useState<SimulationState>("in_call");
  const [closingInstructionSent, setClosingInstructionSent] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [engineerLevels, setEngineerLevels] = useState(quietMeterLevels);
  const [agentLevels, setAgentLevels] = useState(quietMeterLevels);
  const [startResponse, setStartResponse] = useState<StartResponse | null>(null);
  const [transcript, setTranscript] = useState<TranscriptItem[]>(initialTranscript);
  const [normalizedTranscript, setNormalizedTranscript] = useState<NormalizedTranscript[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState("DISCONNECTED");
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [remoteAudioPublished, setRemoteAudioPublished] = useState(false);
  const [isEvaluatingObjectives, setIsEvaluatingObjectives] = useState(false);
  const [objectiveEvalError, setObjectiveEvalError] = useState<string | null>(null);
  const [isSavingTranscript, setIsSavingTranscript] = useState(false);
  const [saveTranscriptMessage, setSaveTranscriptMessage] = useState<string | null>(null);
  const [savedTranscriptSessionId, setSavedTranscriptSessionId] = useState<string | null>(null);
  const [objectiveEvalTick, setObjectiveEvalTick] = useState(0);
  const rtcClientRef = useRef<IAgoraRTCClient | null>(null);
  const localAudioTrackRef = useRef<IMicrophoneAudioTrack | null>(null);
  const remoteAudioTrackRef = useRef<IRemoteAudioTrack | null>(null);
  const remotePublishWatchdogRef = useRef<number | null>(null);
  const agentIdRef = useRef<string | null>(null);
  const engineerEnvelopeRef = useRef(0);
  const agentEnvelopeRef = useRef(0);
  const agentIdleWaveRef = useRef(0);
  const transcriptChunkCacheRef = useRef<
    Map<string, { parts: Map<number, string>; partSum: number }>
  >(new Map());
  const transcriptItemMapRef = useRef<Map<string, ToolkitTranscriptItem>>(new Map());
  const finalizedTranscriptKeysRef = useRef<Set<string>>(new Set());
  const evaluatedEngineerEntryIdsRef = useRef<Set<string>>(new Set());
  const finalizationTimerRef = useRef<number | null>(null);
  const finalizationObservedSpeakingRef = useRef(false);
  const finishSimulationStartedRef = useRef(false);
  const objectiveEvalTimerRef = useRef<number | null>(null);
  const hasSavedTranscriptForCurrentRunRef = useRef(false);

  // The App ID is supplied only with the authenticated, short-lived RTC join response.
  const hasRtcConfiguration = Boolean(startResponse?.engineerRtc.appId);
  const isActiveCall = status === "In Call" || status === "Muted";
  const hasEnded = status === "Ended";
  const isFinished = simulationState === "finished";
  const objectivesLocked =
    simulationState !== "in_call" || status === "Connecting" || isActiveCall || isEnding || isJoining;
  const allRequiredObjectivesCompleted = objectives
    .filter((objective) => objective.required)
    .every((objective) => objective.completed);
  const showSimulationCompleted = isFinished && allRequiredObjectivesCompleted;
  const hasFailedObjectives = isFinished && !allRequiredObjectivesCompleted;

  useEffect(() => {
    if (!isActiveCall) {
      engineerEnvelopeRef.current = 0;
      agentEnvelopeRef.current = 0;
      setIsAiSpeaking(false);
      setEngineerLevels(quietMeterLevels);
      setAgentLevels(quietMeterLevels);
      return;
    }

    const interval = window.setInterval(() => {
      const localRaw = status === "Muted" ? 0 : localAudioTrackRef.current?.getVolumeLevel() ?? 0;
      const localGated = localRaw < 0.045 ? 0 : localRaw;
      const localPrev = engineerEnvelopeRef.current;
      const localNext =
        localGated > localPrev
          ? localPrev * 0.42 + localGated * 0.58
          : localPrev * 0.9 + localGated * 0.1;
      engineerEnvelopeRef.current = localNext;
      setEngineerLevels(buildMeterLevels(localNext, engineerMeterProfile));

      const remoteRaw = remoteAudioTrackRef.current?.getVolumeLevel() ?? 0;
      const remoteGated = remoteRaw < 0.03 ? 0 : remoteRaw;
      agentIdleWaveRef.current += 0.22;
      const breathingFallback =
        remoteAudioTrackRef.current || status === "Muted"
          ? 0
          : 0.01 + (Math.sin(agentIdleWaveRef.current) + 1) * 0.007;
      const remoteInput = remoteGated || breathingFallback;
      const remotePrev = agentEnvelopeRef.current;
      const remoteNext =
        remoteInput > remotePrev
          ? remotePrev * 0.45 + remoteInput * 0.55
          : remotePrev * 0.88 + remoteInput * 0.12;

      agentEnvelopeRef.current = remoteNext;
      setAgentLevels(buildMeterLevels(remoteNext, agentMeterProfile));
      setIsAiSpeaking(remoteNext > 0.055);
    }, 90);

    return () => window.clearInterval(interval);
  }, [isActiveCall, status]);

  const statusTone = useMemo(() => {
    switch (status) {
      case "Connecting":
        return "border-amber-400/30 bg-amber-400/10 text-amber-200";
      case "In Call":
        return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
      case "Muted":
        return "border-rose-400/30 bg-rose-400/10 text-rose-200";
      case "Ended":
        return "border-slate-500/30 bg-slate-500/10 text-slate-300";
      default:
        return "border-sky-400/30 bg-sky-400/10 text-sky-200";
    }
  }, [status]);

  function scheduleObjectiveEvalRetry(waitMs: number) {
    if (objectiveEvalTimerRef.current) {
      window.clearTimeout(objectiveEvalTimerRef.current);
      objectiveEvalTimerRef.current = null;
    }
    objectiveEvalTimerRef.current = window.setTimeout(() => {
      setObjectiveEvalTick((current) => current + 1);
    }, Math.max(100, waitMs));
  }

  function clearObjectiveEvalRetry() {
    if (objectiveEvalTimerRef.current) {
      window.clearTimeout(objectiveEvalTimerRef.current);
      objectiveEvalTimerRef.current = null;
    }
  }

  function clearFinalizationTimer() {
    if (finalizationTimerRef.current) {
      window.clearTimeout(finalizationTimerRef.current);
      finalizationTimerRef.current = null;
    }
  }

  function toSavedTranscriptEntries(entries: NormalizedTranscript[]): SavedTranscriptEntry[] {
    return entries.map((entry) => ({
      id: entry.id,
      speaker_type: entry.speaker_type,
      speaker_id: entry.speaker_id,
      text: entry.text,
      timestamp: entry.timestamp,
    }));
  }

  async function finishSimulation(reason: string) {
    if (finishSimulationStartedRef.current) {
      return;
    }
    finishSimulationStartedRef.current = true;

    setSimulationState("ending");
    setIsEnding(true);
    clearFinalizationTimer();
    finalizationObservedSpeakingRef.current = false;

    const activeAgentId = agentIdRef.current;

    const endAgentPromise = fetch("/api/convoai/end", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        agent_id: activeAgentId,
      }),
    }).catch((error) => error);

    const localCleanupPromise = (async () => {
      if (localAudioTrackRef.current) {
        localAudioTrackRef.current.stop();
        localAudioTrackRef.current.close();
        localAudioTrackRef.current = null;
      }
      remoteAudioTrackRef.current = null;
      setRemoteAudioPublished(false);

      if (remotePublishWatchdogRef.current) {
        window.clearTimeout(remotePublishWatchdogRef.current);
        remotePublishWatchdogRef.current = null;
      }

      if (rtcClientRef.current) {
        await rtcClientRef.current.leave().catch(() => undefined);
        rtcClientRef.current.removeAllListeners();
        rtcClientRef.current = null;
      }

      transcriptChunkCacheRef.current.clear();
      transcriptItemMapRef.current.clear();
      finalizedTranscriptKeysRef.current.clear();
      evaluatedEngineerEntryIdsRef.current.clear();
      setIsAiSpeaking(false);
      setEngineerLevels(quietMeterLevels);
      setAgentLevels(quietMeterLevels);
      setIsMuted(false);
      setConnectionState("DISCONNECTED");
      clearObjectiveEvalRetry();
      setIsEvaluatingObjectives(false);
    })().catch((error) => error);

    const [endAgentResult] = await Promise.allSettled([endAgentPromise, localCleanupPromise]);
    agentIdRef.current = null;

    setStatus("Ended");
    setSimulationState("finished");
    setIsEnding(false);

    const endAgentFailed =
      endAgentResult.status === "rejected" ||
      (endAgentResult.status === "fulfilled" &&
        endAgentResult.value instanceof Error);

    setTranscript((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        speaker: "System",
        time: sessionTimestamp(),
        message: endAgentFailed
          ? `Session finished (${reason}). Local cleanup done, but ConvoAI end request may have failed.`
          : `Session finished (${reason}). AI agent and trainee left the session.`,
      },
    ]);
  }

  useEffect(() => {
    if (!isActiveCall || isEvaluatingObjectives) {
      clearObjectiveEvalRetry();
      return;
    }

    const incompleteObjectives = objectives.filter(
      (objective) => !objective.completed && objective.label.trim(),
    );
    if (incompleteObjectives.length === 0) {
      clearObjectiveEvalRetry();
      return;
    }

    const pendingFinalEngineerEntries = normalizedTranscript.filter(
      (entry) =>
        entry.speaker_type === "engineer" &&
        entry.is_final &&
        !evaluatedEngineerEntryIdsRef.current.has(objectiveEvalEntryKey(entry)),
    );
    if (pendingFinalEngineerEntries.length === 0) {
      clearObjectiveEvalRetry();
      return;
    }

    const latestEngineerEntry = pendingFinalEngineerEntries[pendingFinalEngineerEntries.length - 1];
    const latestTranscriptEntry = normalizedTranscript[normalizedTranscript.length - 1];
    const engineerTimestampMs = Date.parse(latestEngineerEntry.timestamp);
    const latestTimestampMs = latestTranscriptEntry
      ? Date.parse(latestTranscriptEntry.timestamp)
      : Number.NaN;
    const turnEndedByCustomerAi =
      latestTranscriptEntry?.speaker_type === "customer_ai" &&
      Number.isFinite(engineerTimestampMs) &&
      Number.isFinite(latestTimestampMs) &&
      latestTimestampMs >= engineerTimestampMs;
    const silenceSinceEngineerMs = Number.isFinite(engineerTimestampMs)
      ? Date.now() - engineerTimestampMs
      : 0;
    const turnEndedBySilence = silenceSinceEngineerMs >= engineerTurnEndDelayMs;

    if (!turnEndedByCustomerAi && !turnEndedBySilence) {
      scheduleObjectiveEvalRetry(engineerTurnEndDelayMs - silenceSinceEngineerMs);
      return;
    }

    clearObjectiveEvalRetry();
    const latestEngineerEvalKey = objectiveEvalEntryKey(latestEngineerEntry);
    evaluatedEngineerEntryIdsRef.current.add(latestEngineerEvalKey);
    setIsEvaluatingObjectives(true);
    setObjectiveEvalError(null);

    const recentTranscript: TranscriptEntry[] = normalizedTranscript.slice(-16).map((entry) => ({
      id: entry.id,
      speaker_type: entry.speaker_type,
      speaker_id: entry.speaker_id,
      text: entry.text,
      timestamp: entry.timestamp,
    }));

    void fetch("/api/objectives/evaluate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        scenarioId,
        evaluator_prompt: evaluatorPrompt,
        latestEngineerMessage: latestEngineerEntry.text,
        incompleteObjectives,
        recentTranscript,
      }),
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { error?: string; details?: unknown }
            | null;
          const details =
            typeof payload?.details === "string"
              ? payload.details
              : payload?.details
                ? JSON.stringify(payload.details)
                : "";
          throw new Error(
            [payload?.error ?? `Objective evaluator failed with HTTP ${response.status}.`, details]
              .filter(Boolean)
              .join(" "),
          );
        }
        return (await response.json()) as { matchedObjectives?: MatchedObjective[] };
      })
      .then((payload) => {
        const matchedObjectives = Array.isArray(payload.matchedObjectives)
          ? payload.matchedObjectives
          : [];
        mergeObjectiveMatches(matchedObjectives);
      })
      .catch((error) => {
        evaluatedEngineerEntryIdsRef.current.delete(latestEngineerEvalKey);
        setObjectiveEvalError(
          error instanceof Error
            ? error.message
            : "Unable to evaluate objective coverage for the latest response.",
        );
      })
      .finally(() => {
        setIsEvaluatingObjectives(false);
      });
  }, [
    normalizedTranscript,
    objectives,
    evaluatorPrompt,
    isActiveCall,
    isEvaluatingObjectives,
    objectiveEvalTick,
  ]);

  useEffect(() => {
    if (
      !isActiveCall ||
      !allRequiredObjectivesCompleted ||
      simulationState !== "in_call" ||
      closingInstructionSent
    ) {
      return;
    }

    setSimulationState("finalizing");
    setClosingInstructionSent(true);
    finalizationObservedSpeakingRef.current = false;
    clearFinalizationTimer();
    setTranscript((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        speaker: "System",
        time: sessionTimestamp(),
        message: "All required objectives completed. Wrapping up the simulation...",
      },
    ]);

    void (async () => {
      const activeAgentId = agentIdRef.current;
      if (!activeAgentId) {
        await finishSimulation("no-agent-id");
        return;
      }

      const finalizeResponse = await fetch("/api/convoai/finalize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agent_id: activeAgentId,
        }),
      });

      if (!finalizeResponse.ok) {
        const payload = (await finalizeResponse.json().catch(() => null)) as
          | { error?: string; details?: unknown }
          | null;
        const details =
          typeof payload?.details === "string"
            ? payload.details
            : payload?.details
              ? JSON.stringify(payload.details)
              : "";
        setTranscript((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            speaker: "System",
            time: sessionTimestamp(),
            message: `Finalize request was not accepted. Waiting for current response to finish before ending. ${
              [payload?.error, details].filter(Boolean).join(" ") || ""
            }`.trim(),
          },
        ]);
      } else {
        setTranscript((current) => [
          ...current,
          {
            id: crypto.randomUUID(),
            speaker: "System",
            time: sessionTimestamp(),
            message: "Finalize instruction sent. Waiting for AI closing response.",
          },
        ]);
      }
    })();
  }, [
    allRequiredObjectivesCompleted,
    isActiveCall,
    simulationState,
    closingInstructionSent,
  ]);

  useEffect(() => {
    if (!isFinished || hasSavedTranscriptForCurrentRunRef.current || isSavingTranscript) {
      return;
    }

    const completedObjectives = objectives.filter((objective) => objective.completed);
    const transcriptForSave = toSavedTranscriptEntries(normalizedTranscript);

    hasSavedTranscriptForCurrentRunRef.current = true;
    setIsSavingTranscript(true);
    setSaveTranscriptMessage(null);

    void fetch("/api/transcripts/save", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        scenarioId,
        scenarioTitle,
        status: "completed",
        completedObjectives,
        transcript: transcriptForSave,
      }),
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { error?: string; details?: unknown }
            | null;
          const detailText =
            typeof payload?.details === "string"
              ? payload.details
              : payload?.details
                ? JSON.stringify(payload.details)
                : "";
          throw new Error(
            [payload?.error ?? `Unable to save transcript. HTTP ${response.status}.`, detailText]
              .filter(Boolean)
              .join(" "),
          );
        }
        return (await response.json()) as { transcriptSessionId?: string };
      })
      .then((payload) => {
        const transcriptSessionId =
          typeof payload.transcriptSessionId === "string" ? payload.transcriptSessionId : "";
        if (!transcriptSessionId) {
          throw new Error("Transcript saved but transcriptSessionId was not returned.");
        }
        setSavedTranscriptSessionId(transcriptSessionId);
        setSaveTranscriptMessage("Transcript saved");
      })
      .catch((error) => {
        hasSavedTranscriptForCurrentRunRef.current = false;
        setSaveTranscriptMessage(
          error instanceof Error ? error.message : "Unable to save transcript.",
        );
      })
      .finally(() => {
        setIsSavingTranscript(false);
      });
  }, [isFinished, isSavingTranscript, normalizedTranscript, objectives]);

  useEffect(() => {
    if (simulationState !== "finalizing" || isEnding) {
      clearFinalizationTimer();
      return;
    }

    if (isAiSpeaking) {
      finalizationObservedSpeakingRef.current = true;
      clearFinalizationTimer();
      return;
    }

    if (finalizationObservedSpeakingRef.current) {
      void finishSimulation("agent-closing-finished");
      return;
    }

    if (!finalizationTimerRef.current) {
      finalizationTimerRef.current = window.setTimeout(() => {
        void finishSimulation("finalization-fallback");
      }, finalizationFallbackMs);
    }
  }, [simulationState, isAiSpeaking, isEnding]);

  function upsertNormalizedTranscript(entry: ToolkitTranscriptItem) {
    const key = `${entry.uid}-${entry.stream_id}-${entry.turn_id}-${entry.metadata?.object ?? "unknown"}`;
    if (finalizedTranscriptKeysRef.current.has(key)) {
      return;
    }

    const existing = transcriptItemMapRef.current.get(key);
    const nextEntry =
      existing && existing.status !== 0
        ? existing
        : {
            ...entry,
            _time: existing?._time ?? entry._time,
          };

    transcriptItemMapRef.current.set(key, nextEntry);
    if (nextEntry.status !== 0) {
      finalizedTranscriptKeysRef.current.add(key);
    }
    const mapped = mapToolkitTranscriptItems([...transcriptItemMapRef.current.values()], {
      traineeUid: startResponse?.traineeUid,
      agentUid: startResponse?.agentUid,
    });
    setNormalizedTranscript(mapped.sort((a, b) => a.timestamp.localeCompare(b.timestamp)));
  }

  function handleToolkitStreamMessage(publisherUid: string, payload: Uint8Array) {
    const chunkEnvelope = parseStreamChunkEnvelope(decodeUtf8(payload));
    if (!chunkEnvelope) {
      return;
    }

    const cached = transcriptChunkCacheRef.current.get(chunkEnvelope.messageId) ?? {
      parts: new Map<number, string>(),
      partSum: chunkEnvelope.partSum,
    };
    cached.partSum = chunkEnvelope.partSum;
    cached.parts.set(chunkEnvelope.partIndex, chunkEnvelope.content);
    transcriptChunkCacheRef.current.set(chunkEnvelope.messageId, cached);

    if (cached.parts.size !== cached.partSum) {
      return;
    }

    const assembled = Array.from(cached.parts.entries())
      .sort((a, b) => a[0] - b[0])
      .map((entry) => entry[1])
      .join("");
    transcriptChunkCacheRef.current.delete(chunkEnvelope.messageId);

    let parsed: DataStreamTranscriptMessage;
    try {
      parsed = JSON.parse(atob(assembled)) as DataStreamTranscriptMessage;
    } catch {
      return;
    }

    // Official toolkit transcript object types.
    const isUserTranscript = parsed.object === "user.transcription";
    const isAgentTranscript = parsed.object === "assistant.transcription";
    const text = typeof parsed.text === "string" ? parsed.text.trim() : "";

    if ((!isUserTranscript && !isAgentTranscript) || !text) {
      return;
    }

    const metadata: ToolkitTranscriptMetadata = {
      object: parsed.object,
      user_id: parsed.user_id,
      stream_id: typeof parsed.stream_id === "number" ? parsed.stream_id : undefined,
      turn_id: typeof parsed.turn_id === "number" ? parsed.turn_id : undefined,
    };
    const sourceTimestamp =
      typeof parsed.text_ts === "number" && Number.isFinite(parsed.text_ts)
        ? parsed.text_ts
        : Date.now();

    upsertNormalizedTranscript({
      uid: publisherUid,
      stream_id: typeof parsed.stream_id === "number" ? parsed.stream_id : 0,
      turn_id: typeof parsed.turn_id === "number" ? parsed.turn_id : Date.now(),
      _time: sourceTimestamp,
      text,
      status: typeof parsed.turn_status === "number" ? parsed.turn_status : parsed.final ? 1 : 0,
      metadata,
    });
  }

  function addObjective() {
    setObjectives((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        label: "",
        required: true,
        completed: false,
      },
    ]);
  }

  function removeObjective(objectiveId: string) {
    setObjectives((current) => current.filter((objective) => objective.id !== objectiveId));
  }

  function updateObjectiveLabel(objectiveId: string, nextLabel: string) {
    setObjectives((current) =>
      current.map((objective) =>
        objective.id === objectiveId
          ? {
              ...objective,
              label: nextLabel,
            }
          : objective,
      ),
    );
  }

  function updateObjectiveRequired(objectiveId: string, required: boolean) {
    setObjectives((current) =>
      current.map((objective) =>
        objective.id === objectiveId
          ? {
              ...objective,
              required,
            }
          : objective,
      ),
    );
  }

  function mergeObjectiveMatches(matches: MatchedObjective[]) {
    if (matches.length === 0) {
      return;
    }

    const matchedById = new Map(matches.map((match) => [match.id, match]));
    setObjectives((current) =>
      current.map((objective) => {
        const matched = matchedById.get(objective.id);
        if (!matched) {
          return objective;
        }
        return {
          ...objective,
          completed: true,
          completedAt: objective.completedAt ?? new Date().toISOString(),
          confidence: matched.confidence,
          evidence: matched.evidence,
        };
      }),
    );
  }

  async function joinCall() {
    if (isJoining) return;

    setIsJoining(true);
    setStatus("Connecting");
    setErrorMessage(null);
    setAutoplayBlocked(false);
    setRemoteAudioPublished(false);
    setObjectiveEvalError(null);
    setSaveTranscriptMessage(null);
    setSavedTranscriptSessionId(null);
    setIsEvaluatingObjectives(false);
    setSimulationState("in_call");
    setClosingInstructionSent(false);
    finishSimulationStartedRef.current = false;
    clearObjectiveEvalRetry();
    finalizationObservedSpeakingRef.current = false;
    hasSavedTranscriptForCurrentRunRef.current = false;
    clearFinalizationTimer();
    transcriptChunkCacheRef.current.clear();
    transcriptItemMapRef.current.clear();
    finalizedTranscriptKeysRef.current.clear();
    evaluatedEngineerEntryIdsRef.current.clear();
    setNormalizedTranscript([]);
    setObjectives((current) =>
      current.map((objective) => ({
        ...objective,
        completed: false,
        completedAt: undefined,
        confidence: undefined,
        evidence: undefined,
      })),
    );

    try {
      const response = await fetch("/api/convoai/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          system_message: systemMessage,
          greeting_message: greetingMessage,
          greeting_message_switch: fixedGreetingSwitch,
          delay_ms: fixedDelayMs,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string; details?: unknown }
          | null;
        const detailText =
          typeof payload?.details === "string"
            ? payload.details
            : payload?.details
              ? JSON.stringify(payload.details)
              : "";
        throw new Error(
          [
            payload?.error ?? `Unable to start ConvoAI session. HTTP ${response.status}.`,
            detailText,
          ]
            .filter(Boolean)
            .join(" "),
        );
      }

      const data: StartResponse = await response.json();
      agentIdRef.current = data.agentId;
      setStartResponse(data);
      const AgoraRTC = (await import("agora-rtc-sdk-ng")).default;
      AgoraRTC.onAutoplayFailed = () => {
        setAutoplayBlocked(true);
      };
      const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
      rtcClientRef.current = client;

      client.on("connection-state-change", (currentState) => {
        setConnectionState(currentState);
      });

      client.on("stream-message", (uid, payload) => {
        handleToolkitStreamMessage(String(uid), payload);
      });

      client.on("user-published", async (user, mediaType) => {
        await client.subscribe(user, mediaType);
        if (mediaType === "audio") {
          if (user.audioTrack) {
            remoteAudioTrackRef.current = user.audioTrack;
            user.audioTrack.setVolume(100);
            user.audioTrack.play();
            setRemoteAudioPublished(true);
            if (remotePublishWatchdogRef.current) {
              window.clearTimeout(remotePublishWatchdogRef.current);
              remotePublishWatchdogRef.current = null;
            }
          }
          setTranscript((current) => [
            ...current,
            {
              id: crypto.randomUUID(),
              speaker: "System",
              time: sessionTimestamp(),
              message: `Remote audio published by UID ${String(user.uid)}.`,
            },
          ]);
        }
      });

      client.on("user-unpublished", (user, mediaType) => {
        if (mediaType === "audio" && String(user.uid) === String(data.agentUid)) {
          remoteAudioTrackRef.current = null;
          setRemoteAudioPublished(false);
        }
      });

      const [joinedUid, microphoneTrack] = await Promise.all([
        client.join(
          data.engineerRtc.appId,
          data.engineerRtc.channelName,
          data.engineerRtc.token || null,
          Number(data.engineerRtc.uid),
        ),
        AgoraRTC.createMicrophoneAudioTrack(),
      ]);

      localAudioTrackRef.current = microphoneTrack;
      await client.publish([microphoneTrack]);

      setStatus("In Call");
      setIsMuted(false);
      setTranscript([
        ...initialTranscript,
        {
          id: crypto.randomUUID(),
          speaker: "System",
          time: sessionTimestamp(),
          message: `Joined RTC channel ${data.channelName} as engineer UID ${joinedUid}. Agora ConvoAI agent ${data.agentId} is running on UID ${data.agentUid}.`,
        },
        {
          id: crypto.randomUUID(),
          speaker: "AI Customer",
          time: sessionTimestamp(),
          message: greetingMessage,
        },
      ]);
      remotePublishWatchdogRef.current = window.setTimeout(() => {
        if (!remoteAudioTrackRef.current) {
          setTranscript((current) => [
            ...current,
            {
              id: crypto.randomUUID(),
              speaker: "System",
              time: sessionTimestamp(),
              message:
                "No agent audio track published yet. If this persists, check the ConvoAI start error/details.",
            },
          ]);
        }
      }, 9000);
    } catch (error) {
      setStatus("Waiting");
      setErrorMessage(
        error instanceof Error ? error.message : "Unknown error starting session.",
      );
      if (localAudioTrackRef.current) {
        localAudioTrackRef.current.stop();
        localAudioTrackRef.current.close();
        localAudioTrackRef.current = null;
      }
      remoteAudioTrackRef.current = null;
      setRemoteAudioPublished(false);
      setIsEvaluatingObjectives(false);
      clearObjectiveEvalRetry();
      finalizationObservedSpeakingRef.current = false;
      clearFinalizationTimer();
      transcriptChunkCacheRef.current.clear();
      transcriptItemMapRef.current.clear();
      finalizedTranscriptKeysRef.current.clear();
      evaluatedEngineerEntryIdsRef.current.clear();
      if (remotePublishWatchdogRef.current) {
        window.clearTimeout(remotePublishWatchdogRef.current);
        remotePublishWatchdogRef.current = null;
      }
      if (rtcClientRef.current) {
        await rtcClientRef.current.leave().catch(() => undefined);
        rtcClientRef.current.removeAllListeners();
        rtcClientRef.current = null;
        setConnectionState("DISCONNECTED");
      }
      if (agentIdRef.current) {
        await fetch("/api/convoai/end", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            agent_id: agentIdRef.current,
          }),
        }).catch(() => undefined);
        agentIdRef.current = null;
      }
      setTranscript((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          speaker: "System",
          time: sessionTimestamp(),
          message: error instanceof Error ? error.message : "Unknown error starting session.",
        },
      ]);
    } finally {
      setIsJoining(false);
    }
  }

  async function endCall() {
    if (status === "Waiting" || simulationState === "finished") return;
    await finishSimulation("manual-end");
  }

  async function toggleMute() {
    if (!isActiveCall || !localAudioTrackRef.current) return;

    const next = !isMuted;
    await localAudioTrackRef.current.setMuted(next);
    setIsMuted(next);
    setStatus(next ? "Muted" : "In Call");
  }

  useEffect(() => {
    return () => {
      clearObjectiveEvalRetry();
      void (async () => {
        clearFinalizationTimer();
        if (localAudioTrackRef.current) {
          localAudioTrackRef.current.stop();
          localAudioTrackRef.current.close();
          localAudioTrackRef.current = null;
        }
        remoteAudioTrackRef.current = null;
        setRemoteAudioPublished(false);
        setIsEvaluatingObjectives(false);
        clearObjectiveEvalRetry();
        finalizationObservedSpeakingRef.current = false;
        finishSimulationStartedRef.current = false;
        transcriptChunkCacheRef.current.clear();
        transcriptItemMapRef.current.clear();
        finalizedTranscriptKeysRef.current.clear();
        evaluatedEngineerEntryIdsRef.current.clear();
        if (remotePublishWatchdogRef.current) {
          window.clearTimeout(remotePublishWatchdogRef.current);
          remotePublishWatchdogRef.current = null;
        }

        if (rtcClientRef.current) {
          await rtcClientRef.current.leave().catch(() => undefined);
          rtcClientRef.current.removeAllListeners();
          rtcClientRef.current = null;
        }

        if (agentIdRef.current) {
          await fetch("/api/convoai/end", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              agent_id: agentIdRef.current,
            }),
          }).catch(() => undefined);
          agentIdRef.current = null;
        }
      })();
    };
  }, []);

  function resumeAgentAudio() {
    if (!remoteAudioTrackRef.current) return;
    remoteAudioTrackRef.current.play();
    setAutoplayBlocked(false);
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),_transparent_28%),linear-gradient(180deg,_#020617_0%,_#0f172a_52%,_#020617_100%)] px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      {isFinished && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 backdrop-blur-sm px-4">
          <div className="w-full max-w-xl rounded-3xl border border-white/15 bg-slate-900/95 p-8 text-center shadow-[0_30px_80px_-35px_rgba(56,189,248,0.5)]">
            <p className="text-xs uppercase tracking-[0.28em] text-cyan-300">Simulation Ended</p>
            <h1 className="mt-3 text-3xl font-semibold text-white">
              {showSimulationCompleted ? "Simulation Completed" : "Simulation Failed"}
            </h1>
            <p className="mt-4 text-sm text-slate-300">
              {showSimulationCompleted
                ? "The AI agent provided the closing response and both participants have left the session."
                : "The session ended before all required objectives were completed."}
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/courses"
                className="rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-cyan-300"
              >
                Return to Courses
              </Link>
              <button
                type="button"
                onClick={joinCall}
                className="rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10"
              >
                Start New Simulation
              </button>
              {savedTranscriptSessionId && (
                <Link
                  href={`/simulations/frustrated-customer-escalation/transcripts/${savedTranscriptSessionId}`}
                  className="rounded-2xl border border-cyan-300/40 bg-cyan-300/10 px-5 py-3 text-sm font-semibold text-cyan-200 hover:bg-cyan-300/20"
                >
                  View Saved Transcript
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
      <div
        className={`mx-auto max-w-7xl space-y-6 transition ${
          isFinished ? "pointer-events-none blur-sm opacity-55" : ""
        }`}
      >
        <section className="rounded-[28px] border border-white/10 bg-white/5 p-6 shadow-[0_30px_80px_-40px_rgba(56,189,248,0.45)] backdrop-blur-xl">
          <div className="flex flex-col gap-3 border-b border-white/10 pb-5">
            <p className="text-xs uppercase tracking-[0.28em] text-cyan-300">Agora ConvoAI Sample</p>
            <h1 className="text-3xl font-semibold tracking-tight text-white">
              Frustrated Customer Escalation Session
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-slate-300">
              This session keeps all secrets on the server, sends the session inputs to
              `/api/convoai/start`, and joins the browser into the RTC channel as the engineer.
            </p>
          </div>

          {errorMessage && (
            <div className="mt-6 rounded-2xl border border-amber-400/25 bg-amber-400/10 p-4 text-sm text-amber-100">
              <p>{errorMessage}</p>
            </div>
          )}

          <div className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_0.6fr]">
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-200">system_message</span>
              <textarea
                value={systemMessage}
                onChange={(event) => setSystemMessage(event.target.value)}
                rows={6}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/30"
              />
            </label>

            <div className="grid gap-4">
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-200">greeting_message</span>
                <textarea
                  value={greetingMessage}
                  onChange={(event) => setGreetingMessage(event.target.value)}
                  rows={4}
                  className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/30"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-400">
                    greeting_message_switch
                  </p>
                  <p className="mt-3 text-sm font-medium text-cyan-200">{fixedGreetingSwitch}</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-400">delay_ms</p>
                  <p className="mt-3 text-sm font-medium text-cyan-200">{fixedDelayMs}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-200">evaluator_prompt</span>
              <textarea
                value={evaluatorPrompt}
                onChange={(event) => setEvaluatorPrompt(event.target.value)}
                disabled={objectivesLocked}
                rows={8}
                className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/30 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>

            <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-slate-200">Trainee Objective Editor</p>
                <button
                  type="button"
                  onClick={addObjective}
                  disabled={objectivesLocked}
                  className="rounded-xl bg-cyan-400 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-cyan-400/40 disabled:text-slate-300"
                >
                  Add Objective
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {objectives.map((objective) => (
                  <div
                    key={objective.id}
                    className="rounded-xl border border-white/10 bg-slate-950/60 p-3"
                  >
                    <div className="flex items-start gap-3">
                      <input
                        value={objective.label}
                        onChange={(event) => updateObjectiveLabel(objective.id, event.target.value)}
                        disabled={objectivesLocked}
                        placeholder="Objective label"
                        className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-900/90 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/30 disabled:cursor-not-allowed disabled:opacity-60"
                      />
                      <button
                        type="button"
                        onClick={() => removeObjective(objective.id)}
                        disabled={objectivesLocked || objectives.length <= 1}
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        Remove
                      </button>
                    </div>
                    <label className="mt-3 flex items-center gap-2 text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={objective.required}
                        onChange={(event) =>
                          updateObjectiveRequired(objective.id, event.target.checked)
                        }
                        disabled={objectivesLocked}
                        className="h-4 w-4 rounded border-white/20 bg-slate-900 text-cyan-300"
                      />
                      Required
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="rounded-[30px] border border-white/10 bg-slate-950/70 p-6 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.95)] backdrop-blur-xl">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
              <div className="flex items-center gap-3">
                <span className={`rounded-full border px-3 py-1 text-sm font-medium ${statusTone}`}>
                  Status: {status}
                </span>
                {showSimulationCompleted && (
                  <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-sm font-medium text-emerald-200">
                    Simulation completed
                  </span>
                )}
                <span className="text-sm text-slate-400">
                  {hasRtcConfiguration ? "RTC session configured" : "RTC session not started"}
                </span>
                <span className="text-sm text-slate-500">RTC: {connectionState}</span>
                <span className="text-sm text-slate-500">
                  Agent Audio: {remoteAudioPublished ? "Published" : "Waiting"}
                </span>
              </div>

              {!hasEnded && (
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={joinCall}
                    disabled={isJoining || isActiveCall}
                    className="rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:bg-cyan-400/40 disabled:text-slate-300"
                  >
                    {isJoining ? "Connecting..." : "Join Call"}
                  </button>
                  <button
                    type="button"
                    onClick={endCall}
                    disabled={isEnding || status === "Waiting"}
                    className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isEnding ? "Ending..." : "End Call"}
                  </button>
                </div>
              )}
            </div>

            {simulationState === "finalizing" && (
              <div className="mt-4 rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-4 py-3 text-sm text-cyan-100">
                All required objectives completed. Wrapping up the simulation...
              </div>
            )}

            {autoplayBlocked && !hasEnded && (
              <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-amber-300/35 bg-amber-300/10 px-4 py-3">
                <p className="text-sm text-amber-100">
                  Browser blocked remote autoplay.
                </p>
                <button
                  type="button"
                  onClick={resumeAgentAudio}
                  className="rounded-xl bg-amber-300 px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-amber-200"
                >
                  Resume Agent Audio
                </button>
              </div>
            )}

            <div className="flex min-h-[520px] flex-col items-center justify-between py-10">
              <div className="text-center">
                <p className="text-xs uppercase tracking-[0.26em] text-slate-500">AI Customer</p>
                <h2 className="mt-3 text-2xl font-semibold text-white">Escalated Enterprise Caller</h2>
                <p className="mt-2 text-sm text-slate-400">
                  Voice presence with animated orb and call state controls
                </p>
              </div>

              <div className="relative flex items-center justify-center py-10">
                <div
                  className={`absolute h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl transition-all duration-500 ${
                    isAiSpeaking ? "scale-110 opacity-100" : "scale-90 opacity-60"
                  }`}
                />
                <div
                  className={`relative flex h-52 w-52 items-center justify-center rounded-full border border-cyan-300/30 bg-[radial-gradient(circle_at_30%_30%,_rgba(125,211,252,0.95),_rgba(6,182,212,0.55)_42%,_rgba(14,116,144,0.18)_76%,_transparent_100%)] shadow-[0_0_60px_rgba(34,211,238,0.28)] transition-all duration-500 ${
                    isAiSpeaking ? "scale-105 shadow-[0_0_90px_rgba(34,211,238,0.42)]" : ""
                  }`}
                >
                  <div
                    className={`absolute inset-3 rounded-full border border-white/15 ${
                      isAiSpeaking ? "animate-ping" : ""
                    }`}
                  />
                  <div className="text-center">
                    <p className="text-xs uppercase tracking-[0.26em] text-slate-900/70">AI Voice</p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">Customer</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-4">
                <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/5 px-4 py-3">
                  <p className="mb-2 text-center text-[10px] uppercase tracking-[0.2em] text-cyan-200/80">
                    AI Level
                  </p>
                  <div className="flex items-end gap-1">
                    {agentLevels.map((height, index) => (
                      <span
                        key={`agent-${height}-${index}`}
                        className={`inline-block w-1.5 rounded-full transition-[height,opacity,background-color] duration-220 ${
                          isAiSpeaking ? "bg-cyan-200 opacity-100" : "bg-cyan-500/50 opacity-75"
                        }`}
                        style={{ height: `${height}px` }}
                      />
                    ))}
                  </div>
                </div>

                {!hasEnded && (
                  <button
                    type="button"
                    onClick={toggleMute}
                    disabled={!isActiveCall}
                    className={`rounded-2xl px-5 py-3 text-sm font-semibold transition ${
                      isMuted
                        ? "bg-rose-500 text-white hover:bg-rose-400"
                        : "bg-white/10 text-white hover:bg-white/15"
                    } disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    {isMuted ? "Unmute" : "Mute"}
                  </button>
                )}

                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <p className="mb-2 text-center text-[10px] uppercase tracking-[0.2em] text-slate-300/80">
                    Engineer Level
                  </p>
                  <div className="flex items-end gap-1">
                  {engineerLevels.map((height, index) => (
                    <span
                      key={`engineer-${height}-${index}`}
                      className={`inline-block w-1.5 rounded-full transition-[height,opacity,background-color] duration-220 ${
                        isMuted ? "opacity-35" : "opacity-100"
                      } ${
                        isMuted
                          ? "bg-slate-500/90"
                          : height > 26
                            ? "bg-cyan-300"
                            : "bg-slate-500"
                      }`}
                      style={{ height: `${height}px` }}
                    />
                  ))}
                </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs uppercase tracking-[0.26em] text-slate-500">Objective Tracker</p>
                <span className="text-xs text-slate-500">
                  {objectives.filter((objective) => objective.completed).length}/{objectives.length}
                </span>
              </div>
              <div className="mt-4 space-y-3">
                {objectives.map((objective) => (
                  <div
                    key={`tracker-${objective.id}`}
                    className="rounded-2xl border border-white/10 bg-slate-950/50 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-slate-100">
                        {objective.completed ? "☑" : "☐"} {objective.label || "Untitled objective"}
                      </p>
                      <span className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                        {objective.required ? "required" : "optional"}
                      </span>
                    </div>
                    {objective.completed && (
                      <div className="mt-2 space-y-1 text-xs text-slate-300">
                        <p>evidence: {objective.evidence ?? "--"}</p>
                        <p>
                          confidence:{" "}
                          {typeof objective.confidence === "number"
                            ? objective.confidence.toFixed(2)
                            : "--"}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-4 border-t border-white/10 pt-3 text-xs text-slate-400">
                {isEvaluatingObjectives && <p>Evaluating latest engineer response...</p>}
                {!isEvaluatingObjectives && objectiveEvalError && (
                  <p className="text-amber-200">{objectiveEvalError}</p>
                )}
                {!isEvaluatingObjectives &&
                  !objectiveEvalError &&
                  simulationState === "finalizing" && (
                    <p className="text-cyan-200">
                      All required objectives completed. Wrapping up the simulation...
                    </p>
                  )}
                {!isEvaluatingObjectives && !objectiveEvalError && showSimulationCompleted && (
                  <p className="text-emerald-200">Simulation completed</p>
                )}
                {!isEvaluatingObjectives && !objectiveEvalError && hasFailedObjectives && (
                  <p className="text-rose-200">Simulation failed</p>
                )}
                {isSavingTranscript && <p className="text-slate-300">Saving transcript...</p>}
                {!isSavingTranscript && saveTranscriptMessage && (
                  <p
                    className={
                      saveTranscriptMessage === "Transcript saved"
                        ? "text-emerald-200"
                        : "text-amber-200"
                    }
                  >
                    {saveTranscriptMessage}
                  </p>
                )}
                {!isSavingTranscript && savedTranscriptSessionId && (
                  <Link
                    href={`/simulations/frustrated-customer-escalation/transcripts/${savedTranscriptSessionId}`}
                    className="inline-block rounded-xl border border-cyan-300/40 bg-cyan-300/10 px-3 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-300/20"
                  >
                    View Saved Transcript
                  </Link>
                )}
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
              <p className="text-xs uppercase tracking-[0.26em] text-slate-500">Session Details</p>
              <div className="mt-4 space-y-3 text-sm text-slate-300">
                <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                  <p className="text-slate-500">Channel</p>
                  <p className="mt-2 font-medium text-white">
                    {startResponse?.channelName ?? "Not started"}
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                    <p className="text-slate-500">Trainee UID</p>
                    <p className="mt-2 font-medium text-white">
                      {startResponse?.traineeUid ?? "--"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                    <p className="text-slate-500">Agent UID</p>
                    <p className="mt-2 font-medium text-white">
                      {startResponse?.agentUid ?? "--"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/5 p-5 backdrop-blur-xl">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-[0.26em] text-slate-500">
                  Live Transcript (Toolkit)
                </p>
                <span className="text-xs text-slate-500">
                  {normalizedTranscript.length} transcript lines
                </span>
              </div>
              <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto pr-1">
                {normalizedTranscript.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/30 p-4 text-sm text-slate-400">
                    No live transcript received yet. Join the call and start speaking to see
                    `engineer` and `customer_ai` entries from the ConvoAI data stream flow.
                  </div>
                ) : (
                  normalizedTranscript.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-white/10 bg-slate-950/50 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-white">{item.speaker_type}</p>
                        <p className="text-xs uppercase tracking-[0.22em] text-slate-500">
                          {new Date(item.timestamp).toLocaleTimeString()}
                        </p>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">speaker_id: {item.speaker_id}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-300">{item.text}</p>
                    </div>
                  ))
                )}
              </div>
              <div className="mt-4 border-t border-white/10 pt-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">System Events</p>
                  <span className="text-xs text-slate-500">{transcript.length} events</span>
                </div>
                <div className="mt-3 max-h-[220px] space-y-3 overflow-y-auto pr-1">
                  {transcript.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-white/10 bg-slate-950/50 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-white">{item.speaker}</p>
                        <p className="text-xs uppercase tracking-[0.22em] text-slate-500">
                          {item.time}
                        </p>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-300">{item.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-cyan-400/15 bg-cyan-400/5 p-5">
              <p className="text-xs uppercase tracking-[0.26em] text-cyan-300">Config Summary</p>
              <div className="mt-4 space-y-2 text-sm text-slate-300">
                <p>greeting_message_switch: {fixedGreetingSwitch}</p>
                <p>delay_ms: {fixedDelayMs}</p>
                <p>ASR provider: {startResponse?.configSummary.asrProvider ?? "not mapped yet"}</p>
                <p>ASR model: {startResponse?.configSummary.asrModel ?? "not started yet"}</p>
                <p>ASR language: {startResponse?.configSummary.asrLanguage ?? "en-US"}</p>
                <p>LLM provider: {startResponse?.configSummary.llmProvider ?? "not mapped yet"}</p>
                <p>LLM model: {startResponse?.configSummary.llmModel ?? "not started yet"}</p>
                <p>TTS provider: {startResponse?.configSummary.ttsProvider ?? "not mapped yet"}</p>
                <p>TTS model: {startResponse?.configSummary.ttsModel ?? "not started yet"}</p>
                <p>TTS voice: {startResponse?.configSummary.ttsVoiceId ?? "not started yet"}</p>
                <p>
                  RTC token: {startResponse?.configSummary.rtcTokenGenerated ? "generated" : "not generated"}
                </p>
                <p>Token version: {startResponse?.configSummary.tokenVersion ?? "AccessToken2"}</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
