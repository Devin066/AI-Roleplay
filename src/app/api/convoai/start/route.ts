import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getAuthSession } from "@/src/lib/auth/session";
import {
  convoAiAgentCookieName,
  convoAiAgentCookieOptions,
  createConvoAiAgentSessionToken,
  hasConvoAiAgentSessionSigningSecret,
  isValidConvoAiAgentId,
} from "@/src/lib/convoai/agentSession";
import { defaultRolePlayCharacterPreset } from "@/src/lib/roleplays/characterPresets";
import { canUserAccessRolePlay } from "@/src/lib/roleplays/access";
import { getRolePlayConfigById } from "@/src/lib/roleplays/serverStorage";
import type { RolePlayConfig } from "@/src/lib/roleplays/types";

const { RtcTokenBuilder } = require("agora-token/src/RtcTokenBuilder2");

type StartRequestBody = {
  roleplayId?: unknown;
};

type ConvoAiJoinResult = {
  agent_id?: unknown;
  create_ts?: unknown;
  status?: unknown;
  message?: unknown;
  detail?: unknown;
  reason?: unknown;
};

function providerInvalidField(result: ConvoAiJoinResult | null) {
  const providerText = [result?.message, result?.detail, result?.reason]
    .map(asString)
    .join(" ");
  return providerText.match(/properties(?:\.[A-Za-z0-9_]+)+/)?.[0] ?? "unclassified";
}

type ConvoAiJoinPayload = {
  name: string;
  properties: {
    channel: string;
    token: string;
    agent_rtc_uid: string;
    remote_rtc_uids: string[];
    enable_string_uid: boolean;
    idle_timeout: number;
    llm: {
      credential_mode: "managed";
      vendor: "openai";
      style: "openai";
      url: string;
      params: {
        model: string;
      };
      system_messages: Array<{
        role: "system";
        content: string;
      }>;
      max_history: number;
      greeting_message: string;
      failure_message: string;
      greeting_configs: {
        mode: string;
        delay_ms: number;
      };
    };
    asr: {
      credential_mode: "managed";
      vendor: string;
      params: {
        url: string;
        model: string;
        language: string;
      };
    };
    tts: {
      credential_mode: "managed";
      vendor: "minimax";
      params: {
        url: string;
        model: string;
        voice_setting: {
          voice_id: string;
          speed: number;
        };
        audio_setting: {
          sample_rate: number;
        };
      };
    };
  };
};

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function withDefault(value: unknown, fallback: string) {
  const normalized = asString(value).trim();
  return normalized || fallback;
}

function numberWithDefault(value: unknown, fallback: number) {
  const normalized =
    typeof value === "number" ? value : Number(asString(value).trim());
  return Number.isFinite(normalized) ? normalized : fallback;
}

function rolePlaySystemMessage(roleplay: RolePlayConfig) {
  return [
    roleplay.generated.system_message,
    "CRITICAL SESSION OVERRIDE:",
    `You are ${roleplay.character.name}, the ${roleplay.character.role}.`,
    `You are the customer/persona in this scenario, not the ${roleplay.plan.learnerRole}.`,
    "Never speak as the engineer, coach, evaluator, instructor, or assistant.",
    "Do not give solutions as support staff. Respond only as the customer/persona reacting to the learner.",
    "Stay in first person and keep every reply consistent with the character background.",
    "AGORA FEATURE CONTEXT GUARDRAIL:",
    "Keep the conversation anchored to the Agora feature, customer issue, and learner goals configured for this scenario.",
    "Do not introduce unrelated Agora products, SDKs, or technical capabilities unless the learner brings them up and they are connected to the customer's issue.",
    "If the learner gives generic advice, ask how it applies to the specific Agora scenario or customer use case.",
    "If the learner drifts away from the configured issue, redirect back to the customer's impact and the Agora feature involved.",
    "Do not invent technical facts, API names, product limits, pricing, or behavior not grounded in the scenario.",
    "CONVERSATION STYLE:",
    "Keep each reply concise and natural for a live customer call: usually 1-3 short sentences.",
    "Ask at most one direct follow-up question per turn. Do not stack multiple questions.",
    "When the learner asks a follow-up, answer it directly first, then ask a short clarification only if needed.",
    "Avoid long explanations, bullet lists, and coaching language. Make the learner do the problem-solving.",
  ].join("\n\n");
}

function buildRtcAccessToken2(params: {
  appId: string;
  appCertificate: string;
  channelName: string;
  uid: string;
  expireSeconds?: number;
}) {
  const expireSeconds = params.expireSeconds ?? 3600;

  return RtcTokenBuilder.buildTokenWithUidAndPrivilege(
    params.appId,
    params.appCertificate,
    params.channelName,
    params.uid,
    expireSeconds,
    expireSeconds,
    expireSeconds,
    expireSeconds,
    expireSeconds,
  ) as string;
}

export async function POST(request: Request) {
  const body = (await request.json()) as StartRequestBody;
  const roleplayId = asString(body.roleplayId).trim();
  const session = await getAuthSession();

  if (!session) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 },
    );
  }

  if (!roleplayId) {
    return NextResponse.json(
      { error: "roleplayId is required." },
      { status: 400 },
    );
  }

  const roleplay = await getRolePlayConfigById(roleplayId);
  if (!roleplay) {
    return NextResponse.json({ error: "Roleplay not found." }, { status: 404 });
  }

  if (!canUserAccessRolePlay(session, roleplay)) {
    return NextResponse.json({ error: "Roleplay access denied." }, { status: 403 });
  }

  if (!hasConvoAiAgentSessionSigningSecret()) {
    return NextResponse.json(
      { error: "A server-side session signing secret is required." },
      { status: 500 },
    );
  }

  const systemMessage = rolePlaySystemMessage(roleplay);
  const greetingMessage = roleplay.generated.greeting_message.trim();
  const greetingMessageSwitch = roleplay.generated.greeting_message_switch;
  const delayMs = roleplay.generated.delay_ms;
  const requestedVoiceId = roleplay.character.voiceId?.trim() ?? "";

  // A random channel name prevents concurrent sessions from ever sharing RTC credentials.
  const channelName = `roleplay-session-${randomUUID()}`;
  const traineeUid = "7001001";
  const agentUid = "9001001";
  const appId = process.env.AGORA_APP_ID ?? process.env.NEXT_PUBLIC_AGORA_APP_ID ?? "";
  const appCertificate = process.env.AGORA_APP_CERTIFICATE ?? "";
  const customerId = process.env.AGORA_CUSTOMER_ID ?? "";
  const customerSecret = process.env.AGORA_CUSTOMER_SECRET ?? "";
  const asrVendor = "deepgram";
  const asrModel = "nova-3";
  const llmVendor = "openai";
  const llmUrl = "https://api.openai.com/v1/chat/completions";
  // This is an Agora-managed model selection, not an app-provided OpenAI credential.
  const llmModel = "gpt-4o-mini";
  const llmParams = {
    model: llmModel,
  };
  const ttsVendor = "minimax";
  const ttsModel = withDefault(process.env.CONVOAI_MINIMAX_TTS_MODEL, "speech-2.8-turbo");
  const ttsUrl = withDefault(
    process.env.CONVOAI_TTS_URL,
    "wss://api.minimax.io/ws/v1/t2a_v2",
  );
  const ttsVoiceId =
    requestedVoiceId ||
    asString(process.env.CONVOAI_TTS_VOICE).trim() ||
    defaultRolePlayCharacterPreset.voiceId;
  const ttsSpeed = Math.min(
    2,
    Math.max(0.5, numberWithDefault(process.env.CONVOAI_TTS_SPEED, 1)),
  );

  const baseUrl = withDefault(
    process.env.CONVOAI_BASE_URL,
    "https://api.agora.io/api/conversational-ai-agent/v2",
  ).replace(/\/$/, "");

  if (!appId) {
    return NextResponse.json(
      { error: "AGORA_APP_ID is required on the server." },
      { status: 500 },
    );
  }

  if (!appCertificate) {
    return NextResponse.json(
      { error: "AGORA_APP_CERTIFICATE is required on the server." },
      { status: 500 },
    );
  }

  if (!customerId || !customerSecret) {
    return NextResponse.json(
      {
        error:
          "AGORA_CUSTOMER_ID and AGORA_CUSTOMER_SECRET are required on the server.",
      },
      { status: 500 },
    );
  }

  const agentRtcToken = buildRtcAccessToken2({
    appId,
    appCertificate,
    channelName,
    uid: agentUid,
  });

  const traineeRtcToken = buildRtcAccessToken2({
    appId,
    appCertificate,
    channelName,
    uid: traineeUid,
  });

  const joinPayload: ConvoAiJoinPayload = {
    name: `roleplay-session-${Date.now()}`,
    properties: {
      channel: channelName,
      token: agentRtcToken,
      agent_rtc_uid: agentUid,
      remote_rtc_uids: [traineeUid],
      enable_string_uid: false,
      idle_timeout: 120,
      llm: {
        credential_mode: "managed",
        vendor: llmVendor,
        style: "openai",
        // Agora requires a valid public provider endpoint even when it supplies the credentials.
        url: llmUrl,
        params: llmParams,
        system_messages: [
          {
            role: "system",
            content: systemMessage,
          },
        ],
        max_history: 32,
        greeting_message: greetingMessage,
        failure_message: "I'm sorry. I'm having an issue. Please wait a moment.",
        greeting_configs: {
          mode: greetingMessageSwitch,
          delay_ms: delayMs,
        },
      },
      asr: {
        credential_mode: "managed",
        vendor: asrVendor,
        params: {
          url: "wss://api.deepgram.com/v1/listen",
          model: asrModel,
          language: "en-US",
        },
      },
      tts: {
        credential_mode: "managed",
        vendor: ttsVendor,
        params: {
          url: ttsUrl,
          model: ttsModel,
          voice_setting: {
            voice_id: ttsVoiceId,
            speed: ttsSpeed,
          },
          audio_setting: {
            sample_rate: 44100,
          },
        },
      },
    },
  };

  // TODO: Expand ASR language selection beyond en-US when the session UI exposes language choice.
  const joinUrl = `${baseUrl}/projects/${appId}/join`;
  const authHeader = `Basic ${Buffer.from(`${customerId}:${customerSecret}`).toString("base64")}`;

  const joinResponse = await fetch(joinUrl, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(joinPayload),
    cache: "no-store",
  });

  const joinResult = (await joinResponse.json().catch(() => null)) as
    | ConvoAiJoinResult
    | null;

  if (!joinResponse.ok) {
    const requestId = randomUUID();
    const invalidField = providerInvalidField(joinResult);
    // Preserve only the rejected field path for server diagnostics, never provider response bodies.
    console.error("ConvoAI join rejected", {
      requestId,
      status: joinResponse.status,
      invalidField,
    });
    return NextResponse.json(
      {
        error:
          invalidField === "unclassified"
            ? `Agora ConvoAI could not start the roleplay session (HTTP ${joinResponse.status}; reference ${requestId}).`
            : `Agora ConvoAI rejected ${invalidField} (HTTP ${joinResponse.status}; reference ${requestId}).`,
      },
      { status: joinResponse.status },
    );
  }

  const agentId = asString(joinResult?.agent_id).trim();

  if (!isValidConvoAiAgentId(agentId)) {
    return NextResponse.json(
      {
        error:
          "Agora ConvoAI returned an invalid agent identifier.",
      },
      { status: 502 },
    );
  }

  const response = NextResponse.json({
    status: asString(joinResult?.status).trim() || "RUNNING",
    traineeUid,
    agentUid,
    engineerRtc: {
      appId,
      channelName,
      uid: traineeUid,
      token: traineeRtcToken,
    },
  });

  // Keep the agent identifier server-only; later control requests read this signed HttpOnly cookie.
  response.cookies.set(
    convoAiAgentCookieName,
    createConvoAiAgentSessionToken(session.id, agentId),
    convoAiAgentCookieOptions(),
  );
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}
