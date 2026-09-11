import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAuthSession } from "@/src/lib/auth/session";
import {
  convoAiAgentCookieName,
  readConvoAiAgentSessionToken,
} from "@/src/lib/convoai/agentSession";

export async function POST() {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const cookieStore = await cookies();
  const agentId = readConvoAiAgentSessionToken(
    cookieStore.get(convoAiAgentCookieName)?.value,
    session.id,
  );
  if (!agentId) {
    return NextResponse.json({ error: "No active roleplay session." }, { status: 404 });
  }

  const appId = process.env.AGORA_APP_ID ?? process.env.NEXT_PUBLIC_AGORA_APP_ID ?? "";
  const customerId = process.env.AGORA_CUSTOMER_ID ?? "";
  const customerSecret = process.env.AGORA_CUSTOMER_SECRET ?? "";
  const baseUrl = (
    process.env.CONVOAI_BASE_URL ??
    "https://api.agora.io/api/conversational-ai-agent/v2"
  ).replace(/\/$/, "");

  if (!appId || !customerId || !customerSecret) {
    return NextResponse.json(
      {
        error:
          "AGORA_APP_ID, AGORA_CUSTOMER_ID, and AGORA_CUSTOMER_SECRET are required on the server.",
      },
      { status: 500 },
    );
  }

  const finalizeInstruction =
    "The support engineer has completed all required objectives for this simulation. Respond as the customer who is now satisfied that the engineer collected the needed details, took ownership, and provided clear next steps. Give short, professional, meeting-like closing remarks. Do not ask another follow-up question. Do not continue the conversation after this closing response.";

  const thinkUrl = `${baseUrl}/projects/${appId}/agents/${agentId}/think`;
  const thinkResponse = await fetch(thinkUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${customerId}:${customerSecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: finalizeInstruction,
      on_listening_action: "interrupt",
      on_thinking_action: "interrupt",
      on_speaking_action: "ignore",
      interruptable: false,
    }),
    cache: "no-store",
  });

  if (!thinkResponse.ok) {
    return NextResponse.json(
      {
        error: `Agora ConvoAI think failed with HTTP ${thinkResponse.status}.`,
      },
      { status: thinkResponse.status },
    );
  }

  return NextResponse.json({
    status: "finalizing",
  });
}
