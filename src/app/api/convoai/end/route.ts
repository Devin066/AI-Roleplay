import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAuthSession } from "@/src/lib/auth/session";
import {
  convoAiAgentCookieName,
  convoAiAgentCookieOptions,
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

  const leaveUrl = `${baseUrl}/projects/${appId}/agents/${agentId}/leave`;
  const leaveResponse = await fetch(leaveUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${customerId}:${customerSecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!leaveResponse.ok) {
    return NextResponse.json(
      {
        error: `Agora ConvoAI leave failed with HTTP ${leaveResponse.status}.`,
      },
      { status: leaveResponse.status },
    );
  }

  const response = NextResponse.json({
    status: "ended",
  });
  response.cookies.set(convoAiAgentCookieName, "", {
    ...convoAiAgentCookieOptions(),
    maxAge: 0,
  });
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}
